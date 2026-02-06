ALTER TABLE employee_day_plans ADD COLUMN shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX idx_employee_day_plans_shift ON employee_day_plans(shift_id);
