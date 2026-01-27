-- Add rhythm fields to tariffs for rolling week plans and X-days rhythm
-- ZMI Reference: Section 14.4-14.5 (Pages 92-93)

-- Add rhythm configuration fields to tariffs
ALTER TABLE tariffs
    ADD COLUMN rhythm_type VARCHAR(20) DEFAULT 'weekly',
    ADD COLUMN cycle_days INT,
    ADD COLUMN rhythm_start_date DATE;

-- Add constraint for rhythm_type values
ALTER TABLE tariffs
    ADD CONSTRAINT chk_rhythm_type
    CHECK (rhythm_type IN ('weekly', 'rolling_weekly', 'x_days'));

-- Add constraint for cycle_days (1-365 days)
ALTER TABLE tariffs
    ADD CONSTRAINT chk_cycle_days
    CHECK (cycle_days IS NULL OR (cycle_days >= 1 AND cycle_days <= 365));

COMMENT ON COLUMN tariffs.rhythm_type IS 'ZMI: Time plan model - weekly, rolling_weekly, or x_days';
COMMENT ON COLUMN tariffs.cycle_days IS 'ZMI: For x_days rhythm, number of days in cycle';
COMMENT ON COLUMN tariffs.rhythm_start_date IS 'ZMI: Start date for rhythm calculation';

-- Create tariff_week_plans for rolling_weekly rhythm
-- Ordered list of week plans that rotate in sequence
CREATE TABLE tariff_week_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    week_plan_id UUID NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
    sequence_order INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tariff_id, sequence_order),
    UNIQUE(tariff_id, week_plan_id)
);

CREATE INDEX idx_tariff_week_plans_tariff ON tariff_week_plans(tariff_id);

COMMENT ON TABLE tariff_week_plans IS 'Ordered week plans for rolling weekly rhythm';
COMMENT ON COLUMN tariff_week_plans.sequence_order IS 'Position in rotation (1-based)';

-- Create tariff_day_plans for x_days rhythm
-- Day plan per position in cycle
CREATE TABLE tariff_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    day_position INT NOT NULL,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tariff_id, day_position)
);

CREATE INDEX idx_tariff_day_plans_tariff ON tariff_day_plans(tariff_id);

COMMENT ON TABLE tariff_day_plans IS 'Day plans for X-days rhythm cycle';
COMMENT ON COLUMN tariff_day_plans.day_position IS 'Position in cycle (1 to cycle_days)';
COMMENT ON COLUMN tariff_day_plans.day_plan_id IS 'Day plan for this position, NULL = off day';

-- Add tariff_id to employees for time plan assignment
ALTER TABLE employees
    ADD COLUMN tariff_id UUID REFERENCES tariffs(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_tariff ON employees(tariff_id);

COMMENT ON COLUMN employees.tariff_id IS 'Employee tariff for time plan assignment';
