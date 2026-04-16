-- =============================================================
-- Storage bucket for CAMT.053 bank statement XML files
-- Plan: thoughts/shared/plans/2026-04-14-camt053-import.md Phase 2
--
-- Local dev: config.toml also defines the bucket so `supabase start`
-- brings it up. This migration makes the bucket available on hosted
-- Supabase projects (staging/production) where config.toml is not
-- applied automatically.
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bank-statements',
  'bank-statements',
  false,
  5242880, -- 5 MiB
  ARRAY['application/xml', 'text/xml']::text[]
)
ON CONFLICT (id) DO NOTHING;
