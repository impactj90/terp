CREATE TABLE day_plan_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_plan_id UUID NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

    -- Time window for bonus (minutes from midnight)
    time_from INT NOT NULL,
    time_to INT NOT NULL,

    -- Bonus calculation
    calculation_type VARCHAR(20) NOT NULL, -- 'fixed', 'per_minute', 'percentage'
    value_minutes INT NOT NULL,            -- fixed minutes or rate

    -- Conditions
    min_work_minutes INT,   -- minimum work required to earn bonus
    applies_on_holiday BOOLEAN DEFAULT false,

    sort_order INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_day_plan_bonuses_plan ON day_plan_bonuses(day_plan_id);
CREATE INDEX idx_day_plan_bonuses_account ON day_plan_bonuses(account_id);
