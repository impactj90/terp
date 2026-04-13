-- =============================================================
-- Backfill: create all storage buckets that were declared in
-- supabase/config.toml but never had an accompanying migration.
--
-- Hosted Supabase (staging/prod) does not apply config.toml and
-- does not run seed.sql on `supabase db push`. Six buckets were
-- historically only created via local `supabase start` and/or
-- manually in the Supabase Dashboard:
--
--   documents, tenant-logos, avatars, wh-article-images,
--   crm-attachments, hr-personnel-files
--
-- This migration makes them reproducible on any environment.
-- ON CONFLICT (id) DO NOTHING means it is a no-op for environments
-- where the bucket already exists (e.g. staging, where they were
-- manually created via the dashboard).
--
-- Settings mirror supabase/config.toml exactly.
-- =============================================================

-- 1. documents (billing PDFs, XRechnung XML)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  10485760, -- 10 MiB
  ARRAY['application/pdf', 'text/xml']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 2. tenant-logos (public — shown in PDF letterhead)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-logos',
  'tenant-logos',
  true,
  2097152, -- 2 MiB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 3. avatars (public — user profile pictures)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 4. wh-article-images (warehouse article photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wh-article-images',
  'wh-article-images',
  false,
  5242880, -- 5 MiB
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 5. crm-attachments (CRM inquiry/task attachments)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-attachments',
  'crm-attachments',
  false,
  10485760, -- 10 MiB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 6. hr-personnel-files (HR personnel records, contracts, certs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-personnel-files',
  'hr-personnel-files',
  false,
  20971520, -- 20 MiB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;
