-- =============================================================
-- Create schedules table
-- Stores schedule definitions with timing configuration
-- ZMI-TICKET-022: ZMI Server Scheduler
-- =============================================================
CREATE TABLE schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    timing_type VARCHAR(20) NOT NULL
        CHECK (timing_type IN ('seconds', 'minutes', 'hours', 'daily', 'weekly', 'monthly', 'manual')),
    timing_config JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX idx_schedules_tenant ON schedules(tenant_id);
CREATE INDEX idx_schedules_enabled ON schedules(tenant_id, is_enabled);
CREATE INDEX idx_schedules_next_run ON schedules(next_run_at) WHERE is_enabled = true;

CREATE TRIGGER update_schedules_updated_at
    BEFORE UPDATE ON schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE schedules IS 'Schedule definitions for automated background tasks.';
COMMENT ON COLUMN schedules.timing_type IS 'Type of timing: seconds, minutes, hours, daily, weekly, monthly, or manual.';
COMMENT ON COLUMN schedules.timing_config IS 'JSON config for timing. Examples: {"interval":30} for seconds/minutes/hours, {"time":"02:00"} for daily, {"day_of_week":1,"time":"02:00"} for weekly, {"day_of_month":1,"time":"02:00"} for monthly.';
COMMENT ON COLUMN schedules.last_run_at IS 'Timestamp of the last execution start.';
COMMENT ON COLUMN schedules.next_run_at IS 'Computed next execution time for the scheduler engine.';
