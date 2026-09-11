const express = require('express');
const { WORKSTATION_ID } = require('./config');
const {
  checkWhitelist,
  addToWhitelist,
  listWhitelist,
  removeFromWhitelist,
  EXEMPTION_CODES,
} = require('./whitelist');

const router = express.Router();

/**
 * GET /health
 * Returns workstation ID and ready status.
 * AegisCare frontend polls this before opening
 * a scanner session to confirm bridge is running.
 */
router.get('/health', (req, res) => {
  res.json({
    workstationId: WORKSTATION_ID,
    status:        'READY',
    service:       'AegisCare Biometric Bridge',
    version:       '1.0.0',
    timestamp:     new Date().toISOString(),
  });
});

/**
 * GET /whitelist
 * List all current whitelist entries.
 */
router.get('/whitelist', (req, res) => {
  res.json({ entries: listWhitelist() });
});

/**
 * GET /whitelist/:patientId
 * Check if a specific patient has a valid DHA exemption.
 */
router.get('/whitelist/:patientId', (req, res) => {
  const result = checkWhitelist(req.params.patientId);
  res.json(result);
});

/**
 * POST /whitelist
 * Add a patient to the whitelist.
 * Body: {
 *   patientId:     string  (required)
 *   exemptionCode: string  (required — see EXEMPTION_CODES)
 *   grantedBy:     string  (required — staff userId)
 *   notes:         string  (optional)
 *   expiresAt:     string  (optional — ISO datetime)
 * }
 */
router.post('/whitelist', (req, res) => {
  const { patientId, exemptionCode, grantedBy, notes, expiresAt } = req.body;

  if (!patientId || !exemptionCode || !grantedBy) {
    return res.status(400).json({
      error: 'patientId, exemptionCode, and grantedBy are required.',
    });
  }

  if (!EXEMPTION_CODES[exemptionCode]) {
    return res.status(400).json({
      error:      `Invalid exemptionCode: ${exemptionCode}`,
      validCodes: Object.keys(EXEMPTION_CODES),
    });
  }

  try {
    addToWhitelist(patientId, exemptionCode, grantedBy, notes, expiresAt);
    res.json({
      success:       true,
      patientId,
      exemptionCode,
      message:       'Patient added to OTP fallback whitelist.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /whitelist/:patientId
 * Remove a patient from the whitelist.
 */
router.delete('/whitelist/:patientId', (req, res) => {
  const removed = removeFromWhitelist(req.params.patientId);
  res.json({
    success:  removed,
    patientId: req.params.patientId,
    message:  removed
      ? 'Patient removed from whitelist.'
      : 'Patient was not on the whitelist.',
  });
});

/**
 * GET /exemption-codes
 * Returns all valid DHA exemption codes with descriptions.
 */
router.get('/exemption-codes', (req, res) => {
  res.json({
    codes: {
      DISABILITY_PHYSICAL: 'Amputation or missing fingers — cannot physically scan.',
      DISABILITY_MEDICAL:  'Burns, wounds, or skin condition on all fingers.',
      MINOR_NO_PRINT:      'Child under 7 — fingerprint not capturable.',
      SCANNER_FAILURE:     'Hardware fault at this workstation — time-limited.',
      EMERGENCY_ACUTE:     'Patient unconscious or critically unable to cooperate.',
      GUARDIAN_CONSENT:    'Child 7–17 — parent present and consents. OTP to parent.',
    },
    legalBasis: 'Regulation 38, Social Health Insurance Regulations 2024.',
  });
});

module.exports = router;
