-- =============================================================
-- Add stocktake permissions + number sequence
-- =============================================================

-- Add number sequence default prefix for stocktakes
INSERT INTO number_sequences (tenant_id, key, prefix, next_value)
SELECT t.id, 'stocktake', 'INV-', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM number_sequences ns WHERE ns.tenant_id = t.id AND ns.key = 'stocktake'
);

-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   wh_stocktake.view     = 4605f897-34e0-58f0-b458-667f5cd2cfe9
--   wh_stocktake.create   = 5253510c-4885-57ce-be62-2673e9a46ad3
--   wh_stocktake.count    = 90ec6dad-7406-54a2-b080-a904f276713e
--   wh_stocktake.complete = 5b3b5833-85db-5ae7-b9de-9fe18ea306b5
--   wh_stocktake.delete   = cc2d8846-5cd3-55a1-a566-3d9b921cceed

-- ADMIN: all 5 permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4605f897-34e0-58f0-b458-667f5cd2cfe9"'::jsonb  -- wh_stocktake.view
    UNION ALL SELECT '"5253510c-4885-57ce-be62-2673e9a46ad3"'::jsonb  -- wh_stocktake.create
    UNION ALL SELECT '"90ec6dad-7406-54a2-b080-a904f276713e"'::jsonb  -- wh_stocktake.count
    UNION ALL SELECT '"5b3b5833-85db-5ae7-b9de-9fe18ea306b5"'::jsonb  -- wh_stocktake.complete
    UNION ALL SELECT '"cc2d8846-5cd3-55a1-a566-3d9b921cceed"'::jsonb  -- wh_stocktake.delete
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- LAGER: view, create, count, complete
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4605f897-34e0-58f0-b458-667f5cd2cfe9"'::jsonb  -- wh_stocktake.view
    UNION ALL SELECT '"5253510c-4885-57ce-be62-2673e9a46ad3"'::jsonb  -- wh_stocktake.create
    UNION ALL SELECT '"90ec6dad-7406-54a2-b080-a904f276713e"'::jsonb  -- wh_stocktake.count
    UNION ALL SELECT '"5b3b5833-85db-5ae7-b9de-9fe18ea306b5"'::jsonb  -- wh_stocktake.complete
  ) sub
) WHERE code = 'LAGER' AND tenant_id IS NULL;

-- VORGESETZTER: view only
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"4605f897-34e0-58f0-b458-667f5cd2cfe9"'::jsonb  -- wh_stocktake.view
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;
