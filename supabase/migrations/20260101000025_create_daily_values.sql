-- Daily Values table
-- Stores calculated daily time tracking results for employees
-- Aggregates booking data into daily summaries with time calculations

CREATE TABLE daily_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    value_date DATE NOT NULL,

    -- Core time values (all in minutes)
    gross_time INT DEFAULT 0,        -- Total work time before breaks
    net_time INT DEFAULT 0,          -- Work time after breaks
    target_time INT DEFAULT 0,       -- Expected work time from day plan
    overtime INT DEFAULT 0,          -- Positive difference
    undertime INT DEFAULT 0,         -- Negative difference
    break_time INT DEFAULT 0,        -- Total break duration

    -- Status
    has_error BOOLEAN DEFAULT false,
    error_codes TEXT[],              -- Array of error codes
    warnings TEXT[],                 -- Array of warning codes

    -- Booking summary (times as minutes from midnight 0-1439)
    first_come INT,                  -- First come time
    last_go INT,                     -- Last go time
    booking_count INT DEFAULT 0,     -- Number of bookings

    -- Calculation tracking
    calculated_at TIMESTAMPTZ,
    calculation_version INT DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per employee per date
    UNIQUE(employee_id, value_date)
);

-- Indexes for common query patterns
CREATE INDEX idx_daily_values_tenant ON daily_values(tenant_id);
CREATE INDEX idx_daily_values_employee ON daily_values(employee_id);
CREATE INDEX idx_daily_values_date ON daily_values(value_date);
CREATE INDEX idx_daily_values_lookup ON daily_values(employee_id, value_date);
-- Partial index for error filtering (only index rows with errors)
CREATE INDEX idx_daily_values_errors ON daily_values(employee_id, has_error) WHERE has_error = true;

COMMENT ON TABLE daily_values IS 'Calculated daily time tracking results for employees';
COMMENT ON COLUMN daily_values.gross_time IS 'Total work time before breaks (minutes)';
COMMENT ON COLUMN daily_values.net_time IS 'Work time after breaks (minutes)';
COMMENT ON COLUMN daily_values.target_time IS 'Expected work time from day plan (minutes)';
COMMENT ON COLUMN daily_values.overtime IS 'Positive time difference: max(0, net_time - target_time)';
COMMENT ON COLUMN daily_values.undertime IS 'Negative time difference: max(0, target_time - net_time)';
COMMENT ON COLUMN daily_values.first_come IS 'First come booking time as minutes from midnight (0-1439)';
COMMENT ON COLUMN daily_values.last_go IS 'Last go booking time as minutes from midnight (0-1439)';
COMMENT ON COLUMN daily_values.error_codes IS 'Array of error codes: MISSING_COME, MISSING_GO, OVERLAPPING_BOOKINGS, etc.';
COMMENT ON COLUMN daily_values.calculation_version IS 'Version of calculation algorithm used';
