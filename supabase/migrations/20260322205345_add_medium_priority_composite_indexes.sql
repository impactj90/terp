-- AUDIT-016: Add medium-priority composite indexes
--
-- These indexes cover 8 tables used in regular operational queries
-- (scheduling, trip management, payroll, vacation, corrections, orders,
-- macro monitoring) that lack composite indexes with tenant_id as the
-- leading column. Without them PostgreSQL falls back to single-column
-- indexes and filters large result sets in memory.

-- TripRecord: trip list filtered by vehicle within a tenant
CREATE INDEX IF NOT EXISTS idx_trip_records_tenant_vehicle
  ON trip_records (tenant_id, vehicle_id);

-- TripRecord: trip list filtered by date range within a tenant
CREATE INDEX IF NOT EXISTS idx_trip_records_tenant_date
  ON trip_records (tenant_id, trip_date);

-- ShiftAssignment: active shift assignments per employee within a tenant
CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant_employee
  ON shift_assignments (tenant_id, employee_id);

-- VacationBalance: carryover calculation per employee per year within a tenant
CREATE INDEX IF NOT EXISTS idx_vacation_balances_tenant_employee_year
  ON vacation_balances (tenant_id, employee_id, year);

-- Report: report generation polling by status within a tenant
CREATE INDEX IF NOT EXISTS idx_reports_tenant_status
  ON reports (tenant_id, status);

-- PayrollExport: export processing by status within a tenant
CREATE INDEX IF NOT EXISTS idx_pe_tenant_status
  ON payroll_exports (tenant_id, status);

-- Correction: correction list in chronological order within a tenant
CREATE INDEX IF NOT EXISTS idx_corrections_tenant_created_at
  ON corrections (tenant_id, created_at);

-- OrderBooking: order booking list per employee per date within a tenant
CREATE INDEX IF NOT EXISTS idx_order_bookings_tenant_employee_date
  ON order_bookings (tenant_id, employee_id, booking_date);

-- OrderBooking: order booking list per order per date within a tenant
CREATE INDEX IF NOT EXISTS idx_order_bookings_tenant_order_date
  ON order_bookings (tenant_id, order_id, booking_date);

-- MacroExecution: macro execution monitoring by status within a tenant
CREATE INDEX IF NOT EXISTS idx_macro_executions_tenant_status
  ON macro_executions (tenant_id, status);
