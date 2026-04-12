-- AUDIT-010: Add composite indexes for hot-path query patterns
--
-- These indexes cover the most heavily-queried tables that filter by
-- tenant_id plus a second discriminator (date range or status).
-- Without them, PostgreSQL falls back to single-column tenant_id indexes
-- and then filters millions of rows in memory.

-- DailyValue: evaluation page queries with tenant + date range
CREATE INDEX IF NOT EXISTS idx_daily_values_tenant_value_date
  ON daily_values (tenant_id, value_date);

-- DailyAccountValue: account summary with tenant + date range
CREATE INDEX IF NOT EXISTS idx_daily_account_values_tenant_value_date
  ON daily_account_values (tenant_id, value_date);

-- DailyAccountValue: per-account summary with tenant + account + date range
CREATE INDEX IF NOT EXISTS idx_daily_account_values_tenant_account_value_date
  ON daily_account_values (tenant_id, account_id, value_date);

-- AuditLog: audit listing with tenant + date range
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_performed_at
  ON audit_logs (tenant_id, performed_at);

-- RawTerminalBooking: terminal import pending bookings per tenant
CREATE INDEX IF NOT EXISTS idx_raw_terminal_bookings_tenant_status
  ON raw_terminal_bookings (tenant_id, status);

-- ImportBatch: import job pending batches per tenant
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant_status
  ON import_batches (tenant_id, status);

-- Correction: approval workflow pending corrections per tenant
CREATE INDEX IF NOT EXISTS idx_corrections_tenant_status
  ON corrections (tenant_id, status);

-- AbsenceDay: absence approval pending absences per tenant
CREATE INDEX IF NOT EXISTS idx_absence_days_tenant_status
  ON absence_days (tenant_id, status);
