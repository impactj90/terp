-- Plan: 2026-04-22-workreport-arbeitsschein-m1.md
-- Phase 1, Migration A: create work_reports + work_report_assignments +
-- work_report_attachments, add workReportId FK to wh_stock_movements.
--
-- Lifecycle: DRAFT → SIGNED → VOID (enforced at App layer via atomic guards).
-- No DB-level CHECK on status transitions — the enum only restricts the
-- allowed values, and the service layer owns the transition logic.

-- Enum type
CREATE TYPE work_report_status AS ENUM ('DRAFT', 'SIGNED', 'VOID');

-- ---------------------------------------------------------------------------
-- work_reports — parent entity
-- ---------------------------------------------------------------------------
CREATE TABLE work_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_object_id UUID REFERENCES service_objects(id) ON DELETE SET NULL,

    code VARCHAR(50) NOT NULL,
    visit_date DATE NOT NULL,
    travel_minutes INTEGER,
    work_description TEXT,

    status work_report_status NOT NULL DEFAULT 'DRAFT',

    signed_at TIMESTAMPTZ,
    signed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    signer_name VARCHAR(255),
    signer_role VARCHAR(100),
    signer_ip_hash VARCHAR(100),
    signature_path TEXT,
    pdf_url TEXT,

    voided_at TIMESTAMPTZ,
    voided_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    void_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,

    CONSTRAINT work_reports_tenant_id_code_key UNIQUE (tenant_id, code)
);

CREATE INDEX idx_work_reports_tenant_status ON work_reports(tenant_id, status);
CREATE INDEX idx_work_reports_tenant_order ON work_reports(tenant_id, order_id);
CREATE INDEX idx_work_reports_tenant_service_object ON work_reports(tenant_id, service_object_id);
CREATE INDEX idx_work_reports_tenant_visit_date ON work_reports(tenant_id, visit_date);

CREATE TRIGGER update_work_reports_updated_at
    BEFORE UPDATE ON work_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE work_reports ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- work_report_assignments — employee assignments per report
-- ---------------------------------------------------------------------------
CREATE TABLE work_report_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT work_report_assignments_work_report_id_employee_id_role_key
        UNIQUE (work_report_id, employee_id, role)
);

-- Partial unique index: the normal unique constraint above does not cover
-- the NULL-role case (Postgres treats NULLs as distinct inside UNIQUE), so
-- two add() calls with role=null for the same (report, employee) would
-- otherwise both succeed. This partial index fills that gap.
CREATE UNIQUE INDEX idx_work_report_assignments_unique_null_role
    ON work_report_assignments (work_report_id, employee_id)
    WHERE role IS NULL;

CREATE INDEX idx_work_report_assignments_tenant ON work_report_assignments(tenant_id);
CREATE INDEX idx_work_report_assignments_work_report ON work_report_assignments(work_report_id);
CREATE INDEX idx_work_report_assignments_employee ON work_report_assignments(employee_id);

ALTER TABLE work_report_assignments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- work_report_attachments — file attachments (photos, PDFs) per report
-- ---------------------------------------------------------------------------
CREATE TABLE work_report_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,

    filename VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_work_report_attachments_tenant_report
    ON work_report_attachments(tenant_id, work_report_id);

ALTER TABLE work_report_attachments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Add optional work_report_id FK to wh_stock_movements.
-- Enables attributing material withdrawals to a specific WorkReport (UI
-- integration is out of scope for M-1; the column stays NULL until a later
-- ticket wires it up).
-- ---------------------------------------------------------------------------
ALTER TABLE wh_stock_movements
    ADD COLUMN work_report_id UUID REFERENCES work_reports(id) ON DELETE SET NULL;

CREATE INDEX idx_wh_stock_movements_tenant_work_report
    ON wh_stock_movements(tenant_id, work_report_id);
