-- Add wh_corrections + wh_articles image permissions to user groups
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   wh_corrections.view       = 3737ed0a-6298-59e1-abb7-bad67c2e601d
--   wh_corrections.manage     = 73d80e15-4651-50f0-a150-fbdfdb6e98b1
--   wh_corrections.run        = c1a3f9e0-90ea-5a05-993e-7f5787db8c55
--   wh_articles.upload_image  = bea09e1f-ad71-53e1-b307-3e114bdd54a7
--   wh_articles.delete_image  = 1cddeaf5-1c31-500e-810a-91f6beff5119

-- PERSONAL: add all 5
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"3737ed0a-6298-59e1-abb7-bad67c2e601d"'::jsonb
    UNION ALL SELECT '"73d80e15-4651-50f0-a150-fbdfdb6e98b1"'::jsonb
    UNION ALL SELECT '"c1a3f9e0-90ea-5a05-993e-7f5787db8c55"'::jsonb
    UNION ALL SELECT '"bea09e1f-ad71-53e1-b307-3e114bdd54a7"'::jsonb
    UNION ALL SELECT '"1cddeaf5-1c31-500e-810a-91f6beff5119"'::jsonb
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- LAGER: add all 5
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"3737ed0a-6298-59e1-abb7-bad67c2e601d"'::jsonb
    UNION ALL SELECT '"73d80e15-4651-50f0-a150-fbdfdb6e98b1"'::jsonb
    UNION ALL SELECT '"c1a3f9e0-90ea-5a05-993e-7f5787db8c55"'::jsonb
    UNION ALL SELECT '"bea09e1f-ad71-53e1-b307-3e114bdd54a7"'::jsonb
    UNION ALL SELECT '"1cddeaf5-1c31-500e-810a-91f6beff5119"'::jsonb
  ) sub
) WHERE code = 'LAGER' AND tenant_id IS NULL;

-- VORGESETZTER: view only for corrections, no image permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"3737ed0a-6298-59e1-abb7-bad67c2e601d"'::jsonb
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;
