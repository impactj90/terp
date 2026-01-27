-- Remove tariff_id from employees
DROP INDEX IF EXISTS idx_employees_tariff;
ALTER TABLE employees DROP COLUMN IF EXISTS tariff_id;

-- Drop tariff_day_plans table
DROP INDEX IF EXISTS idx_tariff_day_plans_tariff;
DROP TABLE IF EXISTS tariff_day_plans;

-- Drop tariff_week_plans table
DROP INDEX IF EXISTS idx_tariff_week_plans_tariff;
DROP TABLE IF EXISTS tariff_week_plans;

-- Remove rhythm fields from tariffs
ALTER TABLE tariffs DROP CONSTRAINT IF EXISTS chk_cycle_days;
ALTER TABLE tariffs DROP CONSTRAINT IF EXISTS chk_rhythm_type;
ALTER TABLE tariffs DROP COLUMN IF EXISTS rhythm_start_date;
ALTER TABLE tariffs DROP COLUMN IF EXISTS cycle_days;
ALTER TABLE tariffs DROP COLUMN IF EXISTS rhythm_type;
