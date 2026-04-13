-- =============================================================
-- Storage bucket for inbound supplier invoice attachments
--
-- Local dev: supabase/config.toml declares this bucket so
-- `supabase start` brings it up automatically.
-- Hosted Supabase (staging/prod) does not read config.toml, so
-- the bucket must be created via a migration. Without this, the
-- email IMAP poll cron fails with "Bucket not found" when storing
-- PDF attachments via upload("inbound-invoices", ...) in
-- src/lib/services/email-imap-poll-service.ts.
--
-- Settings mirror config.toml:
--   public            = false
--   file_size_limit   = 20 MiB
--   allowed_mime_types = PDF, XML, JPEG, PNG
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbound-invoices',
  'inbound-invoices',
  false,
  20971520, -- 20 MiB
  ARRAY[
    'application/pdf',
    'text/xml',
    'application/xml',
    'image/jpeg',
    'image/png'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;
