-- XNEXT Privacy & Trust Foundation (Phase 1)
-- 016_privacy_foundation.sql
--
-- Adds consent tracking columns to profiles (for GDPR/CCPA/WA compliance storage).
-- Adds deletion scheduling columns for 30-day account deletion window (soft approach for recovery).
-- Adds SECURITY DEFINER helper to allow authenticated users to anonymize their own audit trail on deletion.
--
-- Safe to re-apply (IF NOT EXISTS + idempotent fn).
-- Does not weaken existing RLS; profile updates still gated to owner via existing "FOR ALL" policy.
-- Complements 001_base_schema.sql (profiles RLS + audit RLS).

-- 1. Consent + account deletion columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_policy_version text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS data_deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_deletion_scheduled_for timestamptz;

-- 2. Function: allow a user to anonymize their audit events (user_id, ip, ua) without needing audit.read permission.
-- Used during account deletion flow. Scrubs PII from logs while preserving event record for integrity.
CREATE OR REPLACE FUNCTION public.anonymize_my_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.audit_logs
  SET
    user_id = NULL,
    ip_address = NULL,
    user_agent = NULL,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{anonymized_for_deletion}',
      to_jsonb(now()::text)
    )
  WHERE user_id = auth.uid();
END;
$$;

-- Grant so authenticated users (via RLS context) can invoke for their own records.
GRANT EXECUTE ON FUNCTION public.anonymize_my_audit_logs() TO authenticated;

-- Note: No table modifications to core data tables. All deletes happen at app layer using existing owner RLS policies (dream_list, quest_completions, pulse_alerts, user_quest_preferences, profiles).
-- 30-day window is advisory in UI + scheduled_for column; hard purge would be handled by future cron/edge function.
