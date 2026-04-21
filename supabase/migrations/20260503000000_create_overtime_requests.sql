-- ═══════════════════════════════════════════════════
-- Migration: create overtime_requests + overtime_request_config
-- Ticket: prodi-prelaunch / soll-05-ueberstundenantrag
-- Plan:    thoughts/shared/plans/2026-04-18-soll-05-ueberstundenantrag.md
-- ═══════════════════════════════════════════════════

-- ---------------------------------------------------
-- 1. overtime_requests
-- ---------------------------------------------------
CREATE TABLE overtime_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    request_type VARCHAR(20) NOT NULL
        CHECK (request_type IN ('PLANNED', 'REOPEN')),
    request_date DATE NOT NULL,
    planned_minutes INT NOT NULL,
    actual_minutes INT,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    arbzg_warnings TEXT[] NOT NULL DEFAULT '{}',
    arbzg_override_reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX overtime_requests_tenant_employee_date_idx
    ON overtime_requests (tenant_id, employee_id, request_date);

CREATE INDEX overtime_requests_tenant_status_idx
    ON overtime_requests (tenant_id, status);

CREATE INDEX overtime_requests_tenant_employee_status_type_idx
    ON overtime_requests (tenant_id, employee_id, status, request_type);

-- Partial unique index: at most one active approved REOPEN per employee-day.
-- Fast-path for bookings-service reopen gate.
CREATE UNIQUE INDEX overtime_requests_active_reopen
    ON overtime_requests (tenant_id, employee_id, request_date)
    WHERE request_type = 'REOPEN' AND status = 'approved';

CREATE TRIGGER update_overtime_requests_updated_at
    BEFORE UPDATE ON overtime_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------
-- 2. overtime_request_config (singleton per tenant)
-- ---------------------------------------------------
CREATE TABLE overtime_request_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    approval_required BOOLEAN NOT NULL DEFAULT true,
    lead_time_hours INT NOT NULL DEFAULT 0,
    monthly_warn_threshold_minutes INT,
    escalation_threshold_minutes INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_overtime_request_config_updated_at
    BEFORE UPDATE ON overtime_request_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE overtime_request_config ENABLE ROW LEVEL SECURITY;
