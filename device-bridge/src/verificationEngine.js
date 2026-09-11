/**
 * VERIFICATION ENGINE
 * ─────────────────────────────────────────────────────────
 * Core decision logic for biometric enforcement.
 *
 * TRIGGER POINTS:
 *   CHECK_IN  — patient arrives, reception desk
 *   DISCHARGE — close visit / inpatient discharge
 *
 * FUND TYPES REQUIRING BIOMETRIC (SHA-managed):
 *   SHIF  — Social Health Insurance Fund
 *   PHF   — Primary Healthcare Fund
 *   POMSF — Post-Occupational Medical Scheme Fund
 *
 * FUND TYPES NOT REQUIRING BIOMETRIC:
 *   CASH      — cash-paying patient
 *   CORPORATE — corporate insurance patient
 *   FREE      — waived / free patient
 *
 * DECISION TREE:
 *   Is fundType in SHA_FUND_TYPES?
 *     NO  → verdict: PROCEED   method: NONE_REQUIRED
 *     YES ↓
 *   scanResult === 'SUCCESS'?
 *     YES → verdict: PROCEED   method: BIOMETRIC
 *     NO  ↓
 *   checkWhitelist(patientId).allowed?
 *     NO  → verdict: BLOCKED   method: NONE
 *     YES → verdict: OTP_FALLBACK   method: OTP
 *
 * VERDICTS:
 *   PROCEED      — allow the action
 *   BLOCKED      — deny the action, show error
 *   OTP_FALLBACK — trigger OTP flow via Africa's Talking
 */

const { checkWhitelist } = require('./whitelist');

const TRIGGER = {
  CHECK_IN:  'CHECK_IN',
  DISCHARGE: 'DISCHARGE',
};

const SCAN_RESULT = {
  SUCCESS:       'SUCCESS',
  FAILED:        'FAILED',
  NOT_ATTEMPTED: 'NOT_ATTEMPTED',
};

const SHA_FUND_TYPES = ['SHIF', 'PHF', 'POMSF'];

function isBiometricRequired(fundType) {
  return SHA_FUND_TYPES.includes((fundType || '').toUpperCase());
}

/**
 * Evaluate the verification decision.
 * @param {object} params
 * @param {string} params.patientId    AegisCare patient UUID
 * @param {string} params.fundType     SHIF|PHF|POMSF|CASH|CORPORATE|FREE
 * @param {string} params.trigger      CHECK_IN|DISCHARGE
 * @param {string} params.scanResult   SUCCESS|FAILED|NOT_ATTEMPTED
 * @param {string} params.initiatedBy  Staff user UUID
 * @returns {object} decision
 *   {
 *     verdict:       'PROCEED'|'BLOCKED'|'OTP_FALLBACK',
 *     method:        'BIOMETRIC'|'OTP'|'NONE_REQUIRED'|'NONE',
 *     otpNeeded:     boolean,
 *     biometricReq:  boolean,
 *     exemptionCode: string|null,
 *     reason:        string,
 *     timestamp:     ISO string,
 *     patientId:     string,
 *     fundType:      string,
 *     trigger:       string,
 *     initiatedBy:   string,
 *   }
 */
function evaluate({
  patientId,
  fundType,
  trigger,
  scanResult,
  initiatedBy,
}) {
  const timestamp    = new Date().toISOString();
  const biometricReq = isBiometricRequired(fundType);
  const upper        = (fundType || '').toUpperCase();

  // ── Non-SHA patient ────────────────────────────────────────
  if (!biometricReq) {
    return {
      verdict:       'PROCEED',
      method:        scanResult === SCAN_RESULT.SUCCESS ? 'BIOMETRIC' : 'NONE_REQUIRED',
      otpNeeded:     false,
      biometricReq:  false,
      exemptionCode: null,
      reason: `Fund type ${upper} does not require SHA biometric verification.`,
      timestamp,
      patientId,
      fundType: upper,
      trigger,
      initiatedBy,
    };
  }

  // ── SHA patient — scan succeeded ──────────────────────────
  if (scanResult === SCAN_RESULT.SUCCESS) {
    return {
      verdict:       'PROCEED',
      method:        'BIOMETRIC',
      otpNeeded:     false,
      biometricReq:  true,
      exemptionCode: null,
      reason:        'Fingerprint verified successfully.',
      timestamp,
      patientId,
      fundType: upper,
      trigger,
      initiatedBy,
    };
  }

  // ── SHA patient — scan failed or not attempted ─────────────
  const whitelist = checkWhitelist(patientId);

  if (!whitelist.allowed) {
    return {
      verdict:       'BLOCKED',
      method:        'NONE',
      otpNeeded:     false,
      biometricReq:  true,
      exemptionCode: null,
      reason: 'Fingerprint scan required for SHA patient. ' +
              'No valid DHA exemption on file. ' +
              'Visit CANNOT proceed without biometric verification.',
      timestamp,
      patientId,
      fundType: upper,
      trigger,
      initiatedBy,
    };
  }

  // ── Whitelisted — OTP fallback ────────────────────────────
  return {
    verdict:       'OTP_FALLBACK',
    method:        'OTP',
    otpNeeded:     true,
    biometricReq:  true,
    exemptionCode: whitelist.code,
    reason:        whitelist.reason,
    timestamp,
    patientId,
    fundType: upper,
    trigger,
    initiatedBy,
  };
}

module.exports = {
  evaluate,
  TRIGGER,
  SCAN_RESULT,
  isBiometricRequired,
  SHA_FUND_TYPES,
};
