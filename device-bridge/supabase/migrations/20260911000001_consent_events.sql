-- ═══════════════════════════════════════════════════════
-- CONSENT EVENTS TABLE
-- AegisCare HMS — Biometric + SHA Consent Logging
-- Migration: 20260911000001_consent_events.sql
-- ═══════════════════════════════════════════════════════
--
-- Records every consent event at the 3 SHA trigger points:
--   CHECK_IN   — patient arrives, biometric + eligibility
--   SIGN_LOCK  — clinician signs encounter
--   DISCHARGE  — patient leaves, claim triggered
--
-- This table is APPEND-ONLY (no updates, no deletes).
-- Required by Kenya Digital Health Act 2023 audit rules.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.consent_events (
  id                uuid        PRIMARY KEY
                                DEFAULT gen_random_uuid(),

  -- Patient + visit identifiers
  patient_id        uuid        NOT NULL,
  visit_id          uuid        NULL,
  admission_id      uuid        NULL,

  -- Trigger point
  trigger_type      text        NOT NULL
                                CHECK (trigger_type IN (
                                  'CHECK_IN',
                                  'SIGN_LOCK',
                                  'DISCHARGE'
                                )),

  -- Verification outcome
  verdict           text        NOT NULL
                                CHECK (verdict IN (
                                  'PROCEED',
                                  'BLOCKED',
                                  'OTP_FALLBACK'
                                )),

  method            text        NOT NULL
                                CHECK (method IN (
                                  'BIOMETRIC',
                                  'OTP',
                                  'NONE_REQUIRED',
                                  'NONE'
                                )),

  -- Patient fund type
  fund_type         text        NOT NULL,

  -- Exemption (if OTP fallback)
  exemption_code    text        NULL,

  -- Eligibility result from SHA HIE
  -- NULL if not checked (non-SHA patient)
  eligibility_status  text      NULL
                                CHECK (eligibility_status IN (
                                  'ACTIVE',
                                  'INACTIVE',
                                  'NOT_FOUND',
                                  'ERROR',
                                  'SKIPPED'
                                )),
  eligibility_raw   jsonb       NULL,

  -- Staff who initiated
  initiated_by      uuid        NULL,

  -- Workstation where scan happened
  workstation_id    text        NOT NULL,

  -- Human-readable reason from verification engine
  reason            text        NOT NULL,

  -- Full decision payload (for audit)
  decision_payload  jsonb       NOT NULL,

  -- Timestamps
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_consent_events_patient_id
  ON public.consent_events (patient_id);

CREATE INDEX IF NOT EXISTS idx_consent_events_created_at
  ON public.consent_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_events_trigger_type
  ON public.consent_events (trigger_type);

CREATE INDEX IF NOT EXISTS idx_consent_events_verdict
  ON public.consent_events (verdict);

-- Row Level Security
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access (bridge uses service role key)
CREATE POLICY "service_role_full_access" ON public.consent_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read (for audit views)
CREATE POLICY "authenticated_read" ON public.consent_events
  FOR SELECT
  TO authenticated
  USING (true);

-- NO UPDATE policy — table is append-only
-- NO DELETE policy — table is append-only

COMMENT ON TABLE public.consent_events IS
  'Immutable audit log of all SHA biometric consent events. '
  'Append-only — no updates or deletes permitted. '
  'Required by Kenya Digital Health Act 2023.';
