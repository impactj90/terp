-- =============================================================
-- Add execute_macros and generate_day_plans to schedule_tasks CHECK constraint
-- ZMI-TICKET-246: Vercel Cron monthly/dayplans/macros
-- =============================================================

-- Drop the existing CHECK constraint and recreate with expanded values
ALTER TABLE schedule_tasks DROP CONSTRAINT IF EXISTS schedule_tasks_task_type_check;
ALTER TABLE schedule_tasks ADD CONSTRAINT schedule_tasks_task_type_check
    CHECK (task_type IN (
        'calculate_days', 'calculate_months',
        'backup_database', 'send_notifications',
        'export_data', 'alive_check',
        'execute_macros', 'generate_day_plans'
    ));
