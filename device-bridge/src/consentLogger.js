/**
 * CONSENT LOGGER
 * ─────────────────────────────────────────────────────────
 * Logs every biometric verification event to Supabase
 * consent_events table via the Supabase REST API.
 *
 * Uses service role key — all writes bypass RLS.
 * Table is append-only — no updates or deletes.
 *
 * Called from:
 *   wsHandler.js     — on every DECISION message
 *   httpRoutes.js    — on eligibility check results
 *
 * Required by:
 *   Kenya Digital Health Act 2023 (audit logging)
 *   ODPC Data Protection Act 2019 (consent records)
 *   SHA Regulation 38 SHIR 2024 (biometric audit trail)
 */

const { AEGISCARE_API_URL, AEGISCARE_SERVICE_KEY, WORKSTATION_ID } =
  require('./config');

/**
 * Log a consent event to Supabase.
 *
 * @param {object} params
 * @param {string}  params.patientId          AegisCare patient UUID
 * @param {string}  [params.visitId]          AegisCare visit UUID (if known)
 * @param {string}  [params.admissionId]      AegisCare admission UUID (if known)
 * @param {string}  params.triggerType        CHECK_IN | SIGN_LOCK | DISCHARGE
 * @param {object}  params.decision           Full decision from verificationEngine
 * @param {string}  [params.eligibilityStatus] ACTIVE|INACTIVE|NOT_FOUND|ERROR|SKIPPED
 * @param {object}  [params.eligibilityRaw]   Raw SHA HIE eligibility response
 *
 * @returns {Promise<{ success: boolean, id: string|null, error: string|null }>}
 */
async function logConsentEvent({
  patientId,
  visitId       = null,
  admissionId   = null,
  triggerType,
  decision,
  eligibilityStatus = 'SKIPPED',
  eligibilityRaw    = null,
}) {
  // Validate required fields
  if (!patientId || !triggerType || !decision) {
    console.error('[ConsentLogger] Missing required fields.');
    return { success: false, id: null, error: 'Missing required fields.' };
  }

  // If Supabase not configured — log warning and skip
  // (allows bridge to run in dev without Supabase)
  if (!AEGISCARE_API_URL || !AEGISCARE_SERVICE_KEY) {
    console.warn(
      '[ConsentLogger] AEGISCARE_API_URL or AEGISCARE_SERVICE_KEY ' +
      'not set — consent event NOT persisted to Supabase.'
    );
    return { success: false, id: null, error: 'Supabase not configured.' };
  }

  const payload = {
    patient_id:         patientId,
    visit_id:           visitId,
    admission_id:       admissionId,
    trigger_type:       triggerType,
    verdict:            decision.verdict,
    method:             decision.method,
    fund_type:          decision.fundType || 'UNKNOWN',
    exemption_code:     decision.exemptionCode || null,
    eligibility_status: eligibilityStatus,
    eligibility_raw:    eligibilityRaw,
    initiated_by:       decision.initiatedBy || null,
    workstation_id:     WORKSTATION_ID,
    reason:             decision.reason,
    decision_payload:   decision,
  };

  try {
    const response = await fetch(
      `${AEGISCARE_API_URL}/rest/v1/consent_events`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        AEGISCARE_SERVICE_KEY,
          'Authorization': `Bearer ${AEGISCARE_SERVICE_KEY}`,
          'Prefer':        'return=representation',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[ConsentLogger] Supabase error ${response.status}:`, text
      );
      return {
        success: false,
        id:      null,
        error:   `Supabase ${response.status}: ${text}`,
      };
    }

    const data = await response.json();
    const id   = Array.isArray(data) ? data[0]?.id : data?.id;

    console.log(
      `[ConsentLogger] ✅ Logged consent event — ` +
      `id:${id} trigger:${triggerType} ` +
      `verdict:${decision.verdict} patient:${patientId}`
    );

    return { success: true, id: id || null, error: null };

  } catch (err) {
    console.error('[ConsentLogger] Network error:', err.message);
    return { success: false, id: null, error: err.message };
  }
}

module.exports = { logConsentEvent };
