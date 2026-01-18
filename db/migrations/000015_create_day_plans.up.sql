CREATE TABLE day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    plan_type VARCHAR(20) NOT NULL DEFAULT 'fixed', -- 'fixed', 'flextime'

    -- Time windows (all in minutes from midnight)
    come_from INT,      -- earliest allowed arrival
    come_to INT,        -- latest allowed arrival
    go_from INT,        -- earliest allowed departure
    go_to INT,          -- latest allowed departure

    -- Core hours for flextime
    core_start INT,     -- core time start
    core_end INT,       -- core time end

    -- Target hours
    regular_hours INT NOT NULL DEFAULT 480, -- 8 hours in minutes

    -- Tolerance settings
    tolerance_come_plus INT DEFAULT 0,   -- late arrival tolerance
    tolerance_come_minus INT DEFAULT 0,  -- early arrival tolerance
    tolerance_go_plus INT DEFAULT 0,     -- late departure tolerance
    tolerance_go_minus INT DEFAULT 0,    -- early departure tolerance

    -- Rounding settings
    rounding_come_type VARCHAR(20),      -- 'none', 'up', 'down', 'nearest'
    rounding_come_interval INT,          -- rounding interval in minutes
    rounding_go_type VARCHAR(20),
    rounding_go_interval INT,

    -- Caps
    min_work_time INT,                   -- minimum work time required
    max_net_work_time INT,               -- maximum creditable work time

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_day_plans_tenant ON day_plans(tenant_id);
CREATE INDEX idx_day_plans_active ON day_plans(tenant_id, is_active);
