-- =============================================================
-- CAMT-Preflight Phase 3b: Permissions für inbound_invoice_payments
-- Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md Phase 3b
--
-- Permission UUIDs (UUIDv5 mit Namespace
--   f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   inbound_invoice_payments.view   = 414f4505-e141-51f2-8f21-f9a13867ada8
--   inbound_invoice_payments.create = 31310390-d888-55c3-a8af-c06f4ad4e3bf
--   inbound_invoice_payments.cancel = 3f899d9b-307a-509f-af05-6edf7ff32639
-- =============================================================

-- ADMIN: alle 3
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"414f4505-e141-51f2-8f21-f9a13867ada8"'::jsonb  -- inbound_invoice_payments.view
    UNION ALL SELECT '"31310390-d888-55c3-a8af-c06f4ad4e3bf"'::jsonb  -- inbound_invoice_payments.create
    UNION ALL SELECT '"3f899d9b-307a-509f-af05-6edf7ff32639"'::jsonb  -- inbound_invoice_payments.cancel
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- BUCHHALTUNG: alle 3
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"414f4505-e141-51f2-8f21-f9a13867ada8"'::jsonb  -- inbound_invoice_payments.view
    UNION ALL SELECT '"31310390-d888-55c3-a8af-c06f4ad4e3bf"'::jsonb  -- inbound_invoice_payments.create
    UNION ALL SELECT '"3f899d9b-307a-509f-af05-6edf7ff32639"'::jsonb  -- inbound_invoice_payments.cancel
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;

-- VORGESETZTER: nur view (read-only Transparenz)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"414f4505-e141-51f2-8f21-f9a13867ada8"'::jsonb  -- inbound_invoice_payments.view
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;

-- PERSONAL: keine Permissions (Feature ist Accounting-only)
