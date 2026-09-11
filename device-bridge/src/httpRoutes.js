const express = require('express');
const { WORKSTATION_ID } = require('./config');
const {
  checkWhitelist,
  addToWhitelist,
  listWhitelist,
  removeFromWhitelist,
  EXEMPTION_CODES,
} = require('./whitelist');
const { checkEligibility }  = require('./eligibilityCheck');
const { logConsentEvent }   = require('./consentLogger');

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

/**
 * POST /eligibility
 * Check SHA eligibility for a patient before check-in.
 * Body: { crNumber, fundType }
 */
router.post('/eligibility', async (req, res) => {
  const { crNumber, fundType } = req.body;

  if (!crNumber || !fundType) {
    return res.status(400).json({
      error: 'crNumber and fundType are required.',
    });
  }

  try {
    const result = await checkEligibility({ crNumber, fundType });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /consent-events/patient/:patientId
 * Retrieve consent event history for a patient
 * (proxied from Supabase — for audit view in AegisCare).
 */
router.get('/consent-events/patient/:patientId', async (req, res) => {
  const { AEGISCARE_API_URL, AEGISCARE_SERVICE_KEY } = require('./config');

  if (!AEGISCARE_API_URL || !AEGISCARE_SERVICE_KEY) {
    return res.status(503).json({
      error: 'Supabase not configured on this bridge.',
    });
  }

  try {
    const url =
      `${AEGISCARE_API_URL}/rest/v1/consent_events` +
      `?patient_id=eq.${encodeURIComponent(req.params.patientId)}` +
      `&order=created_at.desc&limit=50`;

    const response = await fetch(url, {
      headers: {
        'apikey':        AEGISCARE_SERVICE_KEY,
        'Authorization': `Bearer ${AEGISCARE_SERVICE_KEY}`,
        'Accept':        'application/json',
      },
    });

    const data = await response.json();
    res.json({ events: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /sdk/aegiscare-biometric-client.js
 * Serves the browser client SDK.
 * AegisCare frontend imports this file directly.
 */
router.get('/sdk/aegiscare-biometric-client.js', (req, res) => {
  const path = require('path');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(
    path.resolve(__dirname, '../client-sdk/aegiscare-biometric-client.js')
  );
});

module.exports = router;
