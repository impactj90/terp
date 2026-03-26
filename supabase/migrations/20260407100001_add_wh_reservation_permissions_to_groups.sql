-- WH_10: Add reservation permissions to default user groups
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   wh_reservations.view   = 56ced9be-51ca-5112-a188-c2d3ef83dde2
--   wh_reservations.manage = 7c3686a5-d041-5ffa-a3d5-b09788b0f186

-- PERSONAL: add both (view + manage)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"56ced9be-51ca-5112-a188-c2d3ef83dde2"'::jsonb
    UNION ALL SELECT '"7c3686a5-d041-5ffa-a3d5-b09788b0f186"'::jsonb
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- LAGER: add both (view + manage)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"56ced9be-51ca-5112-a188-c2d3ef83dde2"'::jsonb
    UNION ALL SELECT '"7c3686a5-d041-5ffa-a3d5-b09788b0f186"'::jsonb
  ) sub
) WHERE code = 'LAGER' AND tenant_id IS NULL;

-- VORGESETZTER: view only
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"56ced9be-51ca-5112-a188-c2d3ef83dde2"'::jsonb
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;
