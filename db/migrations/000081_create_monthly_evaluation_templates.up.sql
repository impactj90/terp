CREATE TABLE IF NOT EXISTS monthly_evaluation_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    flextime_cap_positive INTEGER NOT NULL DEFAULT 0,
    flextime_cap_negative INTEGER NOT NULL DEFAULT 0,
    overtime_threshold INTEGER NOT NULL DEFAULT 0,
    max_carryover_vacation NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_monthly_eval_templates_tenant_id ON monthly_evaluation_templates(tenant_id);
