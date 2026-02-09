-- Remove system-level default employment types
DELETE FROM employment_types
WHERE tenant_id IS NULL
  AND code IN ('VZ', 'TZ', 'MINI', 'AZUBI', 'WERK', 'PRAKT');

-- Restore unique constraint
DROP INDEX IF EXISTS idx_employment_types_tenant_code;

-- Restore tenant_id NOT NULL
ALTER TABLE employment_types ALTER COLUMN tenant_id SET NOT NULL;

-- Recreate original constraint
ALTER TABLE employment_types ADD CONSTRAINT employment_types_tenant_id_code_key UNIQUE (tenant_id, code);
