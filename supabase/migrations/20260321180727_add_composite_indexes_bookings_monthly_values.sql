-- Add composite indexes for high-traffic query patterns
--
-- bookings: covers WHERE tenant_id = X AND employee_id = Y AND booking_date = Z
-- (daily calculation engine, booking lookups, evaluations)
--
-- monthly_values: covers WHERE tenant_id = X AND year = Y AND month = Z
-- (monthly evaluation list, payroll export)

CREATE INDEX IF NOT EXISTS idx_bookings_tenant_employee_date
  ON bookings (tenant_id, employee_id, booking_date);

CREATE INDEX IF NOT EXISTS idx_mv_tenant_year_month
  ON monthly_values (tenant_id, year, month);
