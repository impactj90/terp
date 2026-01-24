-- Monthly Values table
-- Stores monthly aggregation results for employees
-- Contains time totals, flextime balance, absence summaries, and month-closing state

CREATE TABLE monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- Period identification
    year INT NOT NULL,
    month INT NOT NULL,

    -- Aggregated time totals (all in minutes)
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    total_overtime INT DEFAULT 0,
    total_undertime INT DEFAULT 0,
    total_break_time INT DEFAULT 0,

    -- Flextime balance (all in minutes)
    flextime_start INT DEFAULT 0,
    flextime_change INT DEFAULT 0,
    flextime_end INT DEFAULT 0,
    flextime_carryover INT DEFAULT 0,

    -- Absence summary
    vacation_taken DECIMAL(5,2) DEFAULT 0,
    sick_days INT DEFAULT 0,
    other_absence_days INT DEFAULT 0,

    -- Work summary
    work_days INT DEFAULT 0,
    days_with_errors INT DEFAULT 0,

    -- Month closing
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One record per employee per month
    UNIQUE(employee_id, year, month)
);

-- Trigger for updated_at
CREATE TRIGGER update_monthly_values_updated_at
    BEFORE UPDATE ON monthly_values
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes for common query patterns
CREATE INDEX idx_monthly_values_tenant ON monthly_values(tenant_id);
CREATE INDEX idx_monthly_values_employee ON monthly_values(employee_id);
CREATE INDEX idx_monthly_values_lookup ON monthly_values(employee_id, year, month);
CREATE INDEX idx_monthly_values_period ON monthly_values(year, month);

COMMENT ON TABLE monthly_values IS 'Monthly aggregation results for employee time tracking';
COMMENT ON COLUMN monthly_values.total_gross_time IS 'Sum of daily gross times for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_net_time IS 'Sum of daily net times for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_target_time IS 'Sum of daily target times for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_overtime IS 'Sum of daily overtime for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_undertime IS 'Sum of daily undertime for the month (minutes)';
COMMENT ON COLUMN monthly_values.total_break_time IS 'Sum of daily break times for the month (minutes)';
COMMENT ON COLUMN monthly_values.flextime_start IS 'Flextime balance carried over from previous month (minutes)';
COMMENT ON COLUMN monthly_values.flextime_change IS 'Net flextime change this month: overtime - undertime (minutes)';
COMMENT ON COLUMN monthly_values.flextime_end IS 'Final flextime balance after applying credit rules (minutes)';
COMMENT ON COLUMN monthly_values.flextime_carryover IS 'Amount carried over to next month after caps (minutes)';
COMMENT ON COLUMN monthly_values.vacation_taken IS 'Vacation days taken this month (supports half-day granularity)';
COMMENT ON COLUMN monthly_values.sick_days IS 'Sick days in this month';
COMMENT ON COLUMN monthly_values.other_absence_days IS 'Other absence days in this month';
COMMENT ON COLUMN monthly_values.work_days IS 'Number of days with recorded work time';
COMMENT ON COLUMN monthly_values.days_with_errors IS 'Number of days with calculation errors';
COMMENT ON COLUMN monthly_values.is_closed IS 'Whether this month has been closed for editing';
COMMENT ON COLUMN monthly_values.closed_by IS 'User who closed the month';
COMMENT ON COLUMN monthly_values.reopened_by IS 'User who last reopened the month';
