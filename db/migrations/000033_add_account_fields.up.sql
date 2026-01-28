ALTER TABLE accounts
  ADD COLUMN description TEXT,
  ADD COLUMN is_payroll_relevant BOOLEAN DEFAULT false,
  ADD COLUMN payroll_code VARCHAR(50),
  ADD COLUMN sort_order INT DEFAULT 0,
  ADD COLUMN year_carryover BOOLEAN DEFAULT true;
