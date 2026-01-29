ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS chk_tenants_vacation_basis;

ALTER TABLE tenants
  DROP COLUMN IF EXISTS vacation_basis,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS payroll_export_base_path,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS address_country,
  DROP COLUMN IF EXISTS address_city,
  DROP COLUMN IF EXISTS address_zip,
  DROP COLUMN IF EXISTS address_street;
