CREATE TABLE week_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Day plan references (nullable for off days)
    monday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    tuesday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    wednesday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    thursday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    friday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    saturday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    sunday_day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_week_plans_tenant ON week_plans(tenant_id);
