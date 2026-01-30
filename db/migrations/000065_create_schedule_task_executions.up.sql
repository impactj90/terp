-- =============================================================
-- Create schedule_task_executions table
-- Per-task execution log within a schedule execution
-- ZMI-TICKET-022: ZMI Server Scheduler
-- =============================================================
CREATE TABLE schedule_task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES schedule_executions(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    result JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ste_execution ON schedule_task_executions(execution_id);
CREATE INDEX idx_ste_order ON schedule_task_executions(execution_id, sort_order);

COMMENT ON TABLE schedule_task_executions IS 'Per-task execution log within a schedule execution run.';
COMMENT ON COLUMN schedule_task_executions.result IS 'JSON result data from the task. E.g., {"processed_days":150,"failed_days":2} for calculate_days.';
