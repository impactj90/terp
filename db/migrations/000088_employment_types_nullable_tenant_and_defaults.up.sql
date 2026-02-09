-- Make employment_types.tenant_id nullable to support system-wide defaults.
-- System types (tenant_id IS NULL) are visible to all tenants.

-- 1. Drop existing unique constraint
ALTER TABLE employment_types DROP CONSTRAINT IF EXISTS employment_types_tenant_id_code_key;

-- 2. Make tenant_id nullable
ALTER TABLE employment_types ALTER COLUMN tenant_id DROP NOT NULL;

-- 3. Recreate unique constraint with COALESCE pattern
CREATE UNIQUE INDEX idx_employment_types_tenant_code
    ON employment_types(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code);

-- 4. Seed default system employment types
INSERT INTO employment_types (tenant_id, code, name, weekly_hours_default, is_active)
VALUES
    (NULL, 'VZ',    'Vollzeit',       40.00, true),
    (NULL, 'TZ',    'Teilzeit',       20.00, true),
    (NULL, 'MINI',  'Minijob',        10.00, true),
    (NULL, 'AZUBI', 'Auszubildender', 40.00, true),
    (NULL, 'WERK',  'Werkstudent',    20.00, true),
    (NULL, 'PRAKT', 'Praktikant',     40.00, true)
ON CONFLICT (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code)
DO UPDATE SET
    name               = EXCLUDED.name,
    weekly_hours_default = EXCLUDED.weekly_hours_default,
    is_active          = true;
