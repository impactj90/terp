-- Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md
-- Phase A: service_schedules table with CHECK constraints.

CREATE TYPE service_schedule_interval_type AS ENUM ('TIME_BASED', 'CALENDAR_FIXED');
CREATE TYPE service_schedule_interval_unit AS ENUM ('DAYS', 'MONTHS', 'YEARS');

CREATE TABLE service_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    service_object_id UUID NOT NULL REFERENCES service_objects(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    interval_type service_schedule_interval_type NOT NULL,
    interval_value INT NOT NULL,
    interval_unit service_schedule_interval_unit NOT NULL,
    anchor_date DATE,

    default_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    responsible_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    estimated_hours DECIMAL(6, 2),

    last_completed_at TIMESTAMPTZ,
    next_due_at TIMESTAMPTZ,
    lead_time_days INT NOT NULL DEFAULT 14,

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_id UUID,
    updated_by_id UUID,

    CONSTRAINT check_anchor_date_matches_type CHECK (
        (interval_type = 'CALENDAR_FIXED' AND anchor_date IS NOT NULL)
        OR (interval_type = 'TIME_BASED' AND anchor_date IS NULL)
    ),
    CONSTRAINT check_interval_value_positive CHECK (interval_value > 0),
    CONSTRAINT check_lead_time_days_non_negative CHECK (lead_time_days >= 0)
);

CREATE INDEX idx_service_schedules_tenant ON service_schedules(tenant_id);
CREATE INDEX idx_service_schedules_tenant_service_object
    ON service_schedules(tenant_id, service_object_id);
CREATE INDEX idx_service_schedules_tenant_next_due
    ON service_schedules(tenant_id, next_due_at);
CREATE INDEX idx_service_schedules_tenant_active
    ON service_schedules(tenant_id, is_active);

CREATE TRIGGER update_service_schedules_updated_at
    BEFORE UPDATE ON service_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE service_schedules ENABLE ROW LEVEL SECURITY;
