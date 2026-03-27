-- SYS_01: Add DSGVO permissions to ADMIN and PERSONAL groups
--
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   dsgvo.view    = 4f9cbdbe-68b4-5cb1-9bd6-b8106ee901ac
--   dsgvo.manage  = d3866c21-acea-5ab8-8f02-d42c5c56e9f0
--   dsgvo.execute = ee6d86f9-e675-5e80-92a6-08d473759dce

-- PERSONAL: all 3 dsgvo permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4f9cbdbe-68b4-5cb1-9bd6-b8106ee901ac"'::jsonb  -- dsgvo.view
    UNION ALL SELECT '"d3866c21-acea-5ab8-8f02-d42c5c56e9f0"'::jsonb  -- dsgvo.manage
    UNION ALL SELECT '"ee6d86f9-e675-5e80-92a6-08d473759dce"'::jsonb  -- dsgvo.execute
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- ADMIN: all 3 dsgvo permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4f9cbdbe-68b4-5cb1-9bd6-b8106ee901ac"'::jsonb  -- dsgvo.view
    UNION ALL SELECT '"d3866c21-acea-5ab8-8f02-d42c5c56e9f0"'::jsonb  -- dsgvo.manage
    UNION ALL SELECT '"ee6d86f9-e675-5e80-92a6-08d473759dce"'::jsonb  -- dsgvo.execute
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;
