CREATE TABLE day_plan_breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_plan_id UUID NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,

    -- Break type
    break_type VARCHAR(20) NOT NULL, -- 'fixed', 'variable', 'minimum'

    -- For fixed breaks: specific time window
    start_time INT,  -- minutes from midnight
    end_time INT,    -- minutes from midnight

    -- Duration in minutes
    duration INT NOT NULL,

    -- For minimum breaks: deduct after X minutes of work
    after_work_minutes INT,

    -- For variable: whether to auto-deduct if no break booked
    auto_deduct BOOLEAN DEFAULT true,

    -- Paid or unpaid break
    is_paid BOOLEAN DEFAULT false,

    sort_order INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_day_plan_breaks_plan ON day_plan_breaks(day_plan_id);
