ALTER TABLE accounts
  DROP COLUMN IF EXISTS year_carryover,
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS payroll_code,
  DROP COLUMN IF EXISTS is_payroll_relevant,
  DROP COLUMN IF EXISTS description;
