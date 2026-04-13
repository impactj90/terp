-- =============================================================
-- Storage bucket for SEPA payment run XML files
-- Plan: thoughts/shared/plans/2026-04-12-sepa-payment-runs.md Phase 2.1
--
-- Local dev: config.toml also defines the bucket so `supabase start`
-- brings it up. This migration makes the bucket available on hosted
-- Supabase projects (staging/production) where config.toml is not
-- applied automatically.
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-runs',
  'payment-runs',
  false,
  1048576, -- 1 MiB
  ARRAY['application/xml', 'text/xml']::text[]
)
ON CONFLICT (id) DO NOTHING;
