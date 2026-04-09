-- =============================================================
-- Add export_template permissions (Phase 2 — Template Engine)
-- =============================================================
--
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   export_template.view    = 7fd17379-9269-54a9-b1f6-c4688833b192
--   export_template.create  = d1620080-d606-5f97-90df-0e92a68db8b7
--   export_template.edit    = 73db7803-3cba-543c-a0fe-5f4d35d140e3
--   export_template.delete  = 88ee8234-9bd5-52a8-9236-6b91d2fe0c67
--   export_template.execute = 735054c3-78fb-501a-9579-70fe2a74a03a

-- ADMIN: all 5 export_template permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"7fd17379-9269-54a9-b1f6-c4688833b192"'::jsonb  -- export_template.view
    UNION ALL SELECT '"d1620080-d606-5f97-90df-0e92a68db8b7"'::jsonb  -- export_template.create
    UNION ALL SELECT '"73db7803-3cba-543c-a0fe-5f4d35d140e3"'::jsonb  -- export_template.edit
    UNION ALL SELECT '"88ee8234-9bd5-52a8-9236-6b91d2fe0c67"'::jsonb  -- export_template.delete
    UNION ALL SELECT '"735054c3-78fb-501a-9579-70fe2a74a03a"'::jsonb  -- export_template.execute
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;
