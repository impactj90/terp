ALTER TABLE system_settings
ADD COLUMN probation_default_months INT NOT NULL DEFAULT 6,
ADD COLUMN probation_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN probation_reminder_days INT[] NOT NULL DEFAULT ARRAY[28, 14, 7];

CREATE TABLE employee_probation_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    reminder_days_before INT NOT NULL,
    probation_end_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_emp_probation_reminder UNIQUE (
        tenant_id,
        employee_id,
        reminder_days_before,
        probation_end_date
    )
);
