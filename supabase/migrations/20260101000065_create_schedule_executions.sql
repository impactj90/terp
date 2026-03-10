-- =============================================================
-- Create schedule_executions table
-- Logs each execution run of a schedule
-- ZMI-TICKET-022: ZMI Server Scheduler
-- =============================================================
CREATE TABLE schedule_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (trigger_type IN ('scheduled', 'manual')),
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    tasks_total INT DEFAULT 0,
    tasks_succeeded INT DEFAULT 0,
    tasks_failed INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_executions_tenant ON schedule_executions(tenant_id);
CREATE INDEX idx_schedule_executions_schedule ON schedule_executions(schedule_id);
CREATE INDEX idx_schedule_executions_status ON schedule_executions(status);
CREATE INDEX idx_schedule_executions_created ON schedule_executions(created_at DESC);

COMMENT ON TABLE schedule_executions IS 'Execution log for schedule runs.';
COMMENT ON COLUMN schedule_executions.trigger_type IS 'How the execution was triggered: scheduled (automatic) or manual (API trigger).';
COMMENT ON COLUMN schedule_executions.status IS 'Overall execution status. partial means some tasks succeeded and some failed.';
