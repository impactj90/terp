-- Plan: 2026-04-22-workreport-arbeitsschein-m1.md
-- Phase 1, Migration B: storage buckets for signature PNGs and photo/PDF
-- attachments. Mirrors supabase/config.toml for hosted environments.
--
-- Signed-PDF archives live in the existing `documents` bucket under
-- arbeitsscheine/{tenantId}/{workReportId}.pdf — no new bucket needed.

-- Signature bucket — small PNGs captured via canvas (typically <50 KB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'workreport-signatures',
    'workreport-signatures',
    false,
    1048576, -- 1 MiB
    ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Attachment bucket — photos and PDFs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'workreport-attachments',
    'workreport-attachments',
    false,
    10485760, -- 10 MiB
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'application/pdf'
    ]::text[]
)
ON CONFLICT (id) DO NOTHING;
