-- =============================================================
-- Create schedule_tasks table
-- Ordered list of tasks within a schedule
-- ZMI-TICKET-022: ZMI Server Scheduler
-- =============================================================
CREATE TABLE schedule_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL
        CHECK (task_type IN (
            'calculate_days', 'calculate_months',
            'backup_database', 'send_notifications',
            'export_data', 'alive_check'
        )),
    sort_order INT NOT NULL DEFAULT 0,
    parameters JSONB DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_tasks_schedule ON schedule_tasks(schedule_id);
CREATE INDEX idx_schedule_tasks_order ON schedule_tasks(schedule_id, sort_order);

CREATE TRIGGER update_schedule_tasks_updated_at
    BEFORE UPDATE ON schedule_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE schedule_tasks IS 'Ordered tasks within a schedule. Executed top-to-bottom by sort_order.';
COMMENT ON COLUMN schedule_tasks.task_type IS 'Task type from the catalog: calculate_days, calculate_months, backup_database, send_notifications, export_data, alive_check.';
COMMENT ON COLUMN schedule_tasks.sort_order IS 'Execution order within the schedule. Lower numbers run first.';
COMMENT ON COLUMN schedule_tasks.parameters IS 'JSON parameters for the task. E.g., {"date_range":"yesterday"} for calculate_days, {"year":2026,"month":1} for calculate_months.';
