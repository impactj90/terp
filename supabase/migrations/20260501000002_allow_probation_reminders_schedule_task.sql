-- =============================================================
-- Allow 'probation_reminders' as a valid schedule_tasks.task_type
-- so CronExecutionLogger.ensureSchedule(...) does not fail when the
-- probation-reminders Vercel cron runs.
--
-- Caught by Phase 5 integration tests for
-- thoughts/shared/plans/2026-04-17-probezeit-erkennung-reminder.md.
-- =============================================================

ALTER TABLE schedule_tasks DROP CONSTRAINT IF EXISTS schedule_tasks_task_type_check;
ALTER TABLE schedule_tasks ADD CONSTRAINT schedule_tasks_task_type_check
    CHECK (task_type IN (
        'calculate_days', 'calculate_months',
        'backup_database', 'send_notifications',
        'export_data', 'alive_check',
        'execute_macros', 'generate_day_plans',
        'probation_reminders'
    ));
