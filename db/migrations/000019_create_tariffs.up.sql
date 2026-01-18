CREATE TABLE tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Reference to week plan
    week_plan_id UUID REFERENCES week_plans(id) ON DELETE SET NULL,

    -- Validity period
    valid_from DATE,
    valid_to DATE,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_tariffs_tenant ON tariffs(tenant_id);
CREATE INDEX idx_tariffs_week_plan ON tariffs(week_plan_id);
