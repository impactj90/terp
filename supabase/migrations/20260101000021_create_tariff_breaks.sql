CREATE TABLE tariff_breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,

    -- Break type: fixed, variable, minimum
    break_type VARCHAR(20) NOT NULL,

    -- Deduct break after this much work time (in minutes)
    after_work_minutes INT,

    -- Break duration in minutes
    duration INT NOT NULL,

    -- Whether break is paid
    is_paid BOOLEAN DEFAULT false,

    -- Order of break rules
    sort_order INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tariff_breaks_tariff ON tariff_breaks(tariff_id);
