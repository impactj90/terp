DROP INDEX IF EXISTS idx_employee_day_plans_shift;
ALTER TABLE employee_day_plans DROP COLUMN IF EXISTS shift_id;
