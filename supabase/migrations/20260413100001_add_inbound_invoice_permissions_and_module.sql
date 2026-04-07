-- =============================================================
-- Add inbound_invoices module + permissions to system groups
-- =============================================================

-- Add 'inbound_invoices' to tenant_modules CHECK constraint
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS chk_tenant_modules_module;
ALTER TABLE tenant_modules DROP CONSTRAINT IF EXISTS tenant_modules_module_check;
ALTER TABLE tenant_modules ADD CONSTRAINT chk_tenant_modules_module
  CHECK (module IN ('core', 'crm', 'billing', 'warehouse', 'inbound_invoices'));

-- Add number sequence default prefix for inbound invoices
INSERT INTO number_sequences (tenant_id, key, prefix, next_value)
SELECT t.id, 'inbound_invoice', 'ER-', 1
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM number_sequences ns WHERE ns.tenant_id = t.id AND ns.key = 'inbound_invoice'
);

-- Permission UUIDs (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   inbound_invoices.view    = a4420c79-b3de-5815-9625-f45dc18ed1cd
--   inbound_invoices.upload  = 2e31f58d-0e44-5282-9dda-35a6cf62ec88
--   inbound_invoices.edit    = 86f617c1-d41d-59ab-b476-b267a43528f1
--   inbound_invoices.approve = efcdcdd7-ebc2-51c8-8e5d-cfc1bccde194
--   inbound_invoices.export  = 19eae650-953b-52b0-885f-58da207de791
--   inbound_invoices.manage  = cc97d086-f75d-5869-a849-9798a8e6cb87
--   email_imap.view          = 44bd8f93-dd0b-5939-bd32-aa791366b7b5
--   email_imap.manage        = d498d515-e035-596d-874c-978f46cd7f15

-- ADMIN: all 8 permissions
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"a4420c79-b3de-5815-9625-f45dc18ed1cd"'::jsonb  -- inbound_invoices.view
    UNION ALL SELECT '"2e31f58d-0e44-5282-9dda-35a6cf62ec88"'::jsonb  -- inbound_invoices.upload
    UNION ALL SELECT '"86f617c1-d41d-59ab-b476-b267a43528f1"'::jsonb  -- inbound_invoices.edit
    UNION ALL SELECT '"efcdcdd7-ebc2-51c8-8e5d-cfc1bccde194"'::jsonb  -- inbound_invoices.approve
    UNION ALL SELECT '"19eae650-953b-52b0-885f-58da207de791"'::jsonb  -- inbound_invoices.export
    UNION ALL SELECT '"cc97d086-f75d-5869-a849-9798a8e6cb87"'::jsonb  -- inbound_invoices.manage
    UNION ALL SELECT '"44bd8f93-dd0b-5939-bd32-aa791366b7b5"'::jsonb  -- email_imap.view
    UNION ALL SELECT '"d498d515-e035-596d-874c-978f46cd7f15"'::jsonb  -- email_imap.manage
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- BUCHHALTUNG: view, upload, edit, approve, export, email_imap.view
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"a4420c79-b3de-5815-9625-f45dc18ed1cd"'::jsonb  -- inbound_invoices.view
    UNION ALL SELECT '"2e31f58d-0e44-5282-9dda-35a6cf62ec88"'::jsonb  -- inbound_invoices.upload
    UNION ALL SELECT '"86f617c1-d41d-59ab-b476-b267a43528f1"'::jsonb  -- inbound_invoices.edit
    UNION ALL SELECT '"efcdcdd7-ebc2-51c8-8e5d-cfc1bccde194"'::jsonb  -- inbound_invoices.approve
    UNION ALL SELECT '"19eae650-953b-52b0-885f-58da207de791"'::jsonb  -- inbound_invoices.export
    UNION ALL SELECT '"44bd8f93-dd0b-5939-bd32-aa791366b7b5"'::jsonb  -- email_imap.view
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;

-- VORGESETZTER: view, approve
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"a4420c79-b3de-5815-9625-f45dc18ed1cd"'::jsonb  -- inbound_invoices.view
    UNION ALL SELECT '"efcdcdd7-ebc2-51c8-8e5d-cfc1bccde194"'::jsonb  -- inbound_invoices.approve
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;

-- PERSONAL: view, upload, edit, approve
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"a4420c79-b3de-5815-9625-f45dc18ed1cd"'::jsonb  -- inbound_invoices.view
    UNION ALL SELECT '"2e31f58d-0e44-5282-9dda-35a6cf62ec88"'::jsonb  -- inbound_invoices.upload
    UNION ALL SELECT '"86f617c1-d41d-59ab-b476-b267a43528f1"'::jsonb  -- inbound_invoices.edit
    UNION ALL SELECT '"efcdcdd7-ebc2-51c8-8e5d-cfc1bccde194"'::jsonb  -- inbound_invoices.approve
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;
