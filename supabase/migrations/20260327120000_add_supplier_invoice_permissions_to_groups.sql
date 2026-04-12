-- Add supplier invoice permissions to user groups
-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   wh_supplier_invoices.view   = 0ef2dc28-9072-50bd-9d7c-3397d0879d93
--   wh_supplier_invoices.create = fcfa5b3a-af25-55b1-a290-18f46ebc931c
--   wh_supplier_invoices.edit   = 16f421cf-3e43-5cd6-93ba-cc1434b9f1ea
--   wh_supplier_invoices.pay    = ed5c45c0-9258-56e6-a1ad-c9289d29b761

-- PERSONAL: add all 4
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL
    SELECT '"0ef2dc28-9072-50bd-9d7c-3397d0879d93"'::jsonb
    UNION ALL SELECT '"fcfa5b3a-af25-55b1-a290-18f46ebc931c"'::jsonb
    UNION ALL SELECT '"16f421cf-3e43-5cd6-93ba-cc1434b9f1ea"'::jsonb
    UNION ALL SELECT '"ed5c45c0-9258-56e6-a1ad-c9289d29b761"'::jsonb
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- LAGER: add all 4
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL
    SELECT '"0ef2dc28-9072-50bd-9d7c-3397d0879d93"'::jsonb
    UNION ALL SELECT '"fcfa5b3a-af25-55b1-a290-18f46ebc931c"'::jsonb
    UNION ALL SELECT '"16f421cf-3e43-5cd6-93ba-cc1434b9f1ea"'::jsonb
    UNION ALL SELECT '"ed5c45c0-9258-56e6-a1ad-c9289d29b761"'::jsonb
  ) sub
) WHERE code = 'LAGER' AND tenant_id IS NULL;

-- VORGESETZTER: view only
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL
    SELECT '"0ef2dc28-9072-50bd-9d7c-3397d0879d93"'::jsonb
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;

-- BUCHHALTUNG: add all 4
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL
    SELECT '"0ef2dc28-9072-50bd-9d7c-3397d0879d93"'::jsonb
    UNION ALL SELECT '"fcfa5b3a-af25-55b1-a290-18f46ebc931c"'::jsonb
    UNION ALL SELECT '"16f421cf-3e43-5cd6-93ba-cc1434b9f1ea"'::jsonb
    UNION ALL SELECT '"ed5c45c0-9258-56e6-a1ad-c9289d29b761"'::jsonb
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;
