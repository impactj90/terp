-- Add wh_corrections permissions to user groups
-- Also adds wh_articles.upload_image and .delete_image (from WH_13)
--
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   wh_corrections.view       = 3737ed0a-6298-59e1-abb7-bad67c2e601d
--   wh_corrections.manage     = 73d80e15-4651-50f0-a150-fbdfdb6e98b1
--   wh_corrections.run        = c1a3f9e0-90ea-5a05-993e-7f5787db8c55
--   wh_articles.upload_image  = (generated below)
--   wh_articles.delete_image  = (generated below)

-- First, compute the UUIDs for article image permissions
DO $$
DECLARE
  v_upload_image uuid;
  v_delete_image uuid;
BEGIN
  SELECT id INTO v_upload_image FROM unnest(ARRAY[
    (SELECT uuid_generate_v5('f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'::uuid, 'wh_articles.upload_image'))
  ]) AS id;
  SELECT id INTO v_delete_image FROM unnest(ARRAY[
    (SELECT uuid_generate_v5('f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'::uuid, 'wh_articles.delete_image'))
  ]) AS id;
END $$;

-- PERSONAL: add all 3 wh_corrections + 2 article image permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT to_jsonb('3737ed0a-6298-59e1-abb7-bad67c2e601d'::text)
    UNION ALL SELECT to_jsonb('73d80e15-4651-50f0-a150-fbdfdb6e98b1'::text)
    UNION ALL SELECT to_jsonb('c1a3f9e0-90ea-5a05-993e-7f5787db8c55'::text)
    UNION ALL SELECT to_jsonb(uuid_generate_v5('f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'::uuid, 'wh_articles.upload_image')::text)
    UNION ALL SELECT to_jsonb(uuid_generate_v5('f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'::uuid, 'wh_articles.delete_image')::text)
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- LAGER: add all 3 wh_corrections + 2 article image permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT to_jsonb('3737ed0a-6298-59e1-abb7-bad67c2e601d'::text)
    UNION ALL SELECT to_jsonb('73d80e15-4651-50f0-a150-fbdfdb6e98b1'::text)
    UNION ALL SELECT to_jsonb('c1a3f9e0-90ea-5a05-993e-7f5787db8c55'::text)
    UNION ALL SELECT to_jsonb(uuid_generate_v5('f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'::uuid, 'wh_articles.upload_image')::text)
    UNION ALL SELECT to_jsonb(uuid_generate_v5('f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'::uuid, 'wh_articles.delete_image')::text)
  ) sub
) WHERE code = 'LAGER' AND tenant_id IS NULL;

-- VORGESETZTER: view only for corrections, no image permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT to_jsonb('3737ed0a-6298-59e1-abb7-bad67c2e601d'::text)
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;
