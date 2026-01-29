ALTER TABLE tenants
  ADD COLUMN address_street VARCHAR(255),
  ADD COLUMN address_zip VARCHAR(20),
  ADD COLUMN address_city VARCHAR(100),
  ADD COLUMN address_country VARCHAR(100),
  ADD COLUMN phone VARCHAR(50),
  ADD COLUMN email VARCHAR(255),
  ADD COLUMN payroll_export_base_path TEXT,
  ADD COLUMN notes TEXT,
  ADD COLUMN vacation_basis VARCHAR(20) NOT NULL DEFAULT 'calendar_year';

ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_vacation_basis
  CHECK (vacation_basis IN ('calendar_year', 'entry_date'));
