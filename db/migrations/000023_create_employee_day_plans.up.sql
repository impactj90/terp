-- Employee Day Plans table
-- Stores assigned day plans per employee per date
-- day_plan_id NULL represents an off day (no work scheduled)

CREATE TABLE employee_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    -- Source of the assignment
    source VARCHAR(20) DEFAULT 'tariff',
    notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One plan per employee per date
    UNIQUE(employee_id, plan_date)
);

-- Indexes for common query patterns
CREATE INDEX idx_employee_day_plans_tenant ON employee_day_plans(tenant_id);
CREATE INDEX idx_employee_day_plans_employee_date ON employee_day_plans(employee_id, plan_date);
CREATE INDEX idx_employee_day_plans_date ON employee_day_plans(plan_date);

COMMENT ON TABLE employee_day_plans IS 'Assigned day plans per employee per date';
COMMENT ON COLUMN employee_day_plans.day_plan_id IS 'Assigned day plan, NULL represents an off day';
COMMENT ON COLUMN employee_day_plans.source IS 'Origin of assignment: tariff, manual, holiday';
