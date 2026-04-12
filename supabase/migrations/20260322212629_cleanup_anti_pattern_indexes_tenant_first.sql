-- AUDIT-022: Index Anti-Pattern Cleanup — tenantId-First Ordering
--
-- Remove indexes that are either:
--   (a) superseded by AUDIT-010/016 tenant-prefixed composites, or
--   (b) replaced by new tenant-prefixed equivalents added in this migration.
-- DailyValue and DailyAccountValue [employeeId, valueDate] indexes are intentionally kept.

-- ============================================================================
-- 1. Booking — remove [employeeId, bookingDate] (superseded by idx_bookings_tenant_employee_date)
-- ============================================================================
DROP INDEX IF EXISTS "idx_bookings_employee_date";

-- ============================================================================
-- 2. EmployeeDayPlan — add [tenantId, employeeId, planDate], remove old [employeeId, planDate]
-- ============================================================================
CREATE INDEX IF NOT EXISTS "idx_employee_day_plans_tenant_employee_date"
  ON "employee_day_plans" ("tenant_id", "employee_id", "plan_date");

DROP INDEX IF EXISTS "idx_employee_day_plans_employee_date";

-- ============================================================================
-- 3. AbsenceDay — add tenant-prefixed versions, remove old ones
-- ============================================================================
CREATE INDEX IF NOT EXISTS "idx_absence_days_tenant_employee_date"
  ON "absence_days" ("tenant_id", "employee_id", "absence_date");

CREATE INDEX IF NOT EXISTS "idx_absence_days_tenant_employee_date_status"
  ON "absence_days" ("tenant_id", "employee_id", "absence_date", "status");

DROP INDEX IF EXISTS "idx_absence_days_lookup";
DROP INDEX IF EXISTS "idx_absence_days_range";

-- ============================================================================
-- 4. OrderBooking — remove [employeeId, bookingDate] and [orderId, bookingDate]
--    (superseded by idx_order_bookings_tenant_employee_date and idx_order_bookings_tenant_order_date)
-- ============================================================================
DROP INDEX IF EXISTS "idx_order_bookings_employee_date";
DROP INDEX IF EXISTS "idx_order_bookings_order_date";

-- ============================================================================
-- 5. EmployeeTariffAssignment — add tenant-prefixed versions, remove old ones
-- ============================================================================
CREATE INDEX IF NOT EXISTS "idx_eta_tenant_employee_dates"
  ON "employee_tariff_assignments" ("tenant_id", "employee_id", "effective_from", "effective_to");

CREATE INDEX IF NOT EXISTS "idx_eta_tenant_effective_lookup"
  ON "employee_tariff_assignments" ("tenant_id", "employee_id", "effective_from", "effective_to", "is_active");

DROP INDEX IF EXISTS "idx_eta_employee_dates";
DROP INDEX IF EXISTS "idx_eta_effective_lookup";

-- ============================================================================
-- 6. MacroAssignment — add [tenantId, lastExecutedDate], remove old [lastExecutedDate]
-- ============================================================================
CREATE INDEX IF NOT EXISTS "idx_macro_assignments_tenant_last_executed"
  ON "macro_assignments" ("tenant_id", "last_executed_date");

DROP INDEX IF EXISTS "idx_macro_assignments_last_executed_date";

-- ============================================================================
-- 7. ScheduleExecution — add [tenantId, createdAt DESC], remove old [createdAt DESC]
-- ============================================================================
CREATE INDEX IF NOT EXISTS "idx_schedule_executions_tenant_created"
  ON "schedule_executions" ("tenant_id", "created_at" DESC);

DROP INDEX IF EXISTS "idx_schedule_executions_created";

-- ============================================================================
-- 8. MacroExecution — add [tenantId, createdAt DESC], remove old [createdAt DESC]
-- ============================================================================
CREATE INDEX IF NOT EXISTS "idx_macro_executions_tenant_created"
  ON "macro_executions" ("tenant_id", "created_at" DESC);

DROP INDEX IF EXISTS "idx_macro_executions_created";
