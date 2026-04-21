-- Plan: 2026-04-21-serviceobjekte-stammdaten.md
-- Phase A: Storage bucket for ServiceObject file attachments.
-- Mirrors supabase/config.toml for hosted environments.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'serviceobject-attachments',
    'serviceobject-attachments',
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
