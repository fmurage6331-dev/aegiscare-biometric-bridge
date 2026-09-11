/**
 * WHITELIST ENGINE
 * ─────────────────────────────────────────────────────────
 * Defines which patients may use OTP fallback instead of
 * fingerprint scanning under DHA/SHA rules.
 *
 * VALID EXEMPTION CODES:
 *
 *   DISABILITY_PHYSICAL
 *     Amputation or missing fingers — physically cannot scan.
 *     Source: DHA BHI rollout policy August 2025.
 *
 *   DISABILITY_MEDICAL
 *     Burns, open wounds, skin conditions on all fingers.
 *     Source: DHA BHI rollout policy August 2025.
 *
 *   MINOR_NO_PRINT
 *     Child under 7 years old — fingerprint not capturable.
 *     Source: SHA child biometrics policy July 2026.
 *
 *   SCANNER_FAILURE
 *     Hardware fault at this workstation — time-limited,
 *     expires in 4 hours, logged for audit.
 *     Source: Operational necessity, DHA operational guide.
 *
 *   EMERGENCY_ACUTE
 *     Patient unconscious or critically unable to cooperate.
 *     Source: Clinical safety override, logged + audited.
 *
 *   GUARDIAN_CONSENT
 *     Child aged 7–17. Parent present and consents.
 *     OTP sent to parent/guardian phone number.
 *     Source: SHA child biometrics policy July 2026.
 *
 * NOT VALID (do NOT add these):
 *   — Patient forgot phone
 *   — Patient refuses to scan
 *   — Staff convenience
 *
 * Legal basis: Regulation 38, Social Health Insurance
 * Regulations 2024. Kenya Digital Health Act 2023.
 * ODPC Data Protection Act 2019.
 */

const EXEMPTION_CODES = {
  DISABILITY_PHYSICAL: 'DISABILITY_PHYSICAL',
  DISABILITY_MEDICAL:  'DISABILITY_MEDICAL',
  MINOR_NO_PRINT:      'MINOR_NO_PRINT',
  SCANNER_FAILURE:     'SCANNER_FAILURE',
  EMERGENCY_ACUTE:     'EMERGENCY_ACUTE',
  GUARDIAN_CONSENT:    'GUARDIAN_CONSENT',
};

// In-memory store for dev/testing.
// In production this will be replaced by a Supabase query
// against the patient_biometric_exemptions table.
const inMemoryWhitelist = new Map();

/**
 * Add a patient to the whitelist.
 * In production this will write to Supabase.
 */
function addToWhitelist(
  patientId,
  exemptionCode,
  grantedBy,
  notes = '',
  expiresAt = null
) {
  if (!EXEMPTION_CODES[exemptionCode]) {
    throw new Error(
      `Invalid exemption code: ${exemptionCode}. ` +
      `Valid: ${Object.keys(EXEMPTION_CODES).join(', ')}`
    );
  }
  inMemoryWhitelist.set(patientId, {
    patientId,
    exemptionCode,
    grantedBy,
    grantedAt: new Date().toISOString(),
    expiresAt,
    notes,
  });
}

/**
 * Retrieve whitelist entry if it exists and has not expired.
 */
function getWhitelistEntry(patientId) {
  const entry = inMemoryWhitelist.get(patientId);
  if (!entry) return null;

  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    inMemoryWhitelist.delete(patientId);
    return null;
  }
  return entry;
}

/**
 * Check if patient is whitelisted for OTP fallback.
 * Returns:
 *   { allowed: true,  reason: string, code: string, entry: object }
 *   { allowed: false, reason: string, code: null }
 */
function checkWhitelist(patientId) {
  const entry = getWhitelistEntry(patientId);

  if (!entry) {
    return {
      allowed: false,
      reason: 'Patient is not whitelisted for OTP fallback. ' +
              'Fingerprint scan is required under SHA/DHA rules.',
      code: null,
    };
  }

  return {
    allowed: true,
    reason: `OTP fallback permitted — exemption: ${entry.exemptionCode}`,
    code: entry.exemptionCode,
    entry,
  };
}

/**
 * List all current whitelist entries (admin use).
 */
function listWhitelist() {
  return Array.from(inMemoryWhitelist.values());
}

/**
 * Remove a patient from the whitelist manually.
 */
function removeFromWhitelist(patientId) {
  return inMemoryWhitelist.delete(patientId);
}

module.exports = {
  EXEMPTION_CODES,
  addToWhitelist,
  getWhitelistEntry,
  checkWhitelist,
  listWhitelist,
  removeFromWhitelist,
};
