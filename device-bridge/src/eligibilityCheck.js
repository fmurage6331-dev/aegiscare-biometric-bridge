/**
 * ELIGIBILITY CHECK MODULE
 * ─────────────────────────────────────────────────────────
 * Checks patient SHA coverage via the SHA HIE Middleware
 * before allowing check-in for SHA patients.
 *
 * SHA HIE Base URL:
 *   https://ilm-dev.dha.go.ke/uat-middleware/api/v1
 *
 * Flow:
 *   1. POST /api/v1/tenants/token → get bearer token
 *   2. GET /api/v1/patients/sub-benefits
 *          ?patient_id={cr_number}&parent_benefit_code=SHA-06
 *      → check active benefits
 *
 * SKIPPED for non-SHA patients (CASH / CORPORATE / FREE).
 *
 * Status values returned:
 *   ACTIVE     — patient has active SHA coverage
 *   INACTIVE   — patient registered but coverage lapsed
 *   NOT_FOUND  — patient not found in SHA registry
 *   ERROR      — HIE unreachable or credentials missing
 *   SKIPPED    — non-SHA patient, check not required
 *
 * Credentials:
 *   SHA_BASE_URL      — Supabase env var
 *   SHA_CLIENT_ID     — Supabase env var (from DHA — NEVER in code)
 *   SHA_CLIENT_SECRET — Supabase env var (from DHA — NEVER in code)
 *
 * ⚠️ SHA credentials are NOT yet available (pending DHA
 * approval). This module is scaffold-ready. It degrades
 * gracefully when credentials are absent — returns
 * status: 'ERROR' with a clear message so the bridge
 * continues operating without blocking the facility.
 */

const {
  SHA_BASE_URL,
  SHA_CLIENT_ID,
  SHA_CLIENT_SECRET,
} = require('./config');

const SHA_FUND_TYPES = ['SHIF', 'PHF', 'POMSF'];

/**
 * Get a bearer token from SHA HIE middleware.
 * @returns {Promise<string|null>} token or null on failure
 */
async function getShaToken() {
  if (!SHA_BASE_URL || !SHA_CLIENT_ID || !SHA_CLIENT_SECRET) {
    return null;
  }

  try {
    const body = new URLSearchParams({
      client_id:     SHA_CLIENT_ID,
      client_secret: SHA_CLIENT_SECRET,
    });

    const res = await fetch(`${SHA_BASE_URL}/tenants/token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    if (!res.ok) {
      console.error(
        `[Eligibility] Token fetch failed: ${res.status}`
      );
      return null;
    }

    const data  = await res.json();
    const token = data?.access_token || data?.token || null;
    return token;

  } catch (err) {
    console.error('[Eligibility] Token network error:', err.message);
    return null;
  }
}

/**
 * Check SHA eligibility for a patient.
 *
 * @param {object} params
 * @param {string} params.crNumber    SHA CR number (membership number)
 * @param {string} params.fundType    SHIF | PHF | POMSF | CASH | ...
 *
 * @returns {Promise<object>} result
 *   {
 *     status:  'ACTIVE'|'INACTIVE'|'NOT_FOUND'|'ERROR'|'SKIPPED',
 *     message: string,
 *     raw:     object|null,
 *   }
 */
async function checkEligibility({ crNumber, fundType }) {
  const upper = (fundType || '').toUpperCase();

  // ── Non-SHA patient — skip ───────────────────────────────
  if (!SHA_FUND_TYPES.includes(upper)) {
    return {
      status:  'SKIPPED',
      message: `Fund type ${upper} does not require SHA eligibility check.`,
      raw:     null,
    };
  }

  // ── SHA credentials not yet available ───────────────────
  if (!SHA_BASE_URL || !SHA_CLIENT_ID || !SHA_CLIENT_SECRET) {
    console.warn(
      '[Eligibility] SHA credentials not configured. ' +
      'Eligibility check SKIPPED. Awaiting DHA approval.'
    );
    return {
      status:  'ERROR',
      message:
        'SHA HIE credentials not yet configured. ' +
        'Awaiting DHA approval. ' +
        'Eligibility check skipped — facility may proceed ' +
        'with biometric verification only.',
      raw: null,
    };
  }

  // ── No CR number provided ────────────────────────────────
  if (!crNumber) {
    return {
      status:  'ERROR',
      message: 'CR number (SHA membership number) is required for eligibility check.',
      raw:     null,
    };
  }

  // ── Get token ────────────────────────────────────────────
  const token = await getShaToken();
  if (!token) {
    return {
      status:  'ERROR',
      message: 'Could not obtain SHA HIE token. Check credentials.',
      raw:     null,
    };
  }

  // ── Check sub-benefits ───────────────────────────────────
  try {
    const url =
      `${SHA_BASE_URL}/patients/sub-benefits` +
      `?patient_id=${encodeURIComponent(crNumber)}` +
      `&parent_benefit_code=SHA-06`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept':        'application/json',
      },
    });

    if (res.status === 404) {
      return {
        status:  'NOT_FOUND',
        message: `Patient CR number ${crNumber} not found in SHA registry.`,
        raw:     null,
      };
    }

    if (!res.ok) {
      const text = await res.text();
      return {
        status:  'ERROR',
        message: `SHA HIE error ${res.status}: ${text}`,
        raw:     null,
      };
    }

    const data = await res.json();

    // Check if patient has active benefits
    const benefits = data?.benefits || data?.data || [];
    const hasActive = Array.isArray(benefits) && benefits.length > 0;

    if (hasActive) {
      console.log(
        `[Eligibility] ✅ ACTIVE — CR:${crNumber} fund:${upper}`
      );
      return {
        status:  'ACTIVE',
        message: `Patient has active SHA coverage under ${upper}.`,
        raw:     data,
      };
    }

    console.log(
      `[Eligibility] ⚠️ INACTIVE — CR:${crNumber} fund:${upper}`
    );
    return {
      status:  'INACTIVE',
      message: `Patient CR ${crNumber} found but has no active ${upper} benefits.`,
      raw:     data,
    };

  } catch (err) {
    console.error('[Eligibility] Network error:', err.message);
    return {
      status:  'ERROR',
      message: `SHA HIE unreachable: ${err.message}`,
      raw:     null,
    };
  }
}

module.exports = { checkEligibility, SHA_FUND_TYPES };
