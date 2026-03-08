-- Revert to original CHECK constraint
ALTER TABLE schedule_tasks DROP CONSTRAINT IF EXISTS schedule_tasks_task_type_check;
ALTER TABLE schedule_tasks ADD CONSTRAINT schedule_tasks_task_type_check
    CHECK (task_type IN (
        'calculate_days', 'calculate_months',
        'backup_database', 'send_notifications',
        'export_data', 'alive_check'
    ));
