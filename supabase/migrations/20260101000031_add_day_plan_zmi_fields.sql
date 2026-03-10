-- Add ZMI fields to day_plans
ALTER TABLE day_plans
    -- Alternative target hours for absence days (Regelarbeitszeit 2)
    ADD COLUMN IF NOT EXISTS regular_hours_2 INT,
    -- Get target from employee master (Aus Personalstamm holen)
    ADD COLUMN IF NOT EXISTS from_employee_master BOOLEAN DEFAULT FALSE,
    -- Variable work time flag - enables tolerance_come_minus for FAZ plans
    ADD COLUMN IF NOT EXISTS variable_work_time BOOLEAN DEFAULT FALSE,
    -- Round all bookings, not just first come / last go
    ADD COLUMN IF NOT EXISTS round_all_bookings BOOLEAN DEFAULT FALSE,
    -- Add/subtract minutes for rounding (Wert addieren/subtrahieren)
    ADD COLUMN IF NOT EXISTS rounding_come_add_value INT,
    ADD COLUMN IF NOT EXISTS rounding_go_add_value INT,
    -- Holiday time credits by category (Zeitgutschrift an Feiertagen)
    ADD COLUMN IF NOT EXISTS holiday_credit_cat1 INT,
    ADD COLUMN IF NOT EXISTS holiday_credit_cat2 INT,
    ADD COLUMN IF NOT EXISTS holiday_credit_cat3 INT,
    -- Vacation deduction value (Urlaubsbewertung) - 1.0 = one day, or hours
    ADD COLUMN IF NOT EXISTS vacation_deduction DECIMAL(5,2) DEFAULT 1.00,
    -- No-booking behavior (Tage ohne Buchungen)
    ADD COLUMN IF NOT EXISTS no_booking_behavior VARCHAR(30) DEFAULT 'error',
    -- Day change behavior (Tageswechsel)
    ADD COLUMN IF NOT EXISTS day_change_behavior VARCHAR(30) DEFAULT 'none',
    -- Shift detection windows (Schichterkennung)
    ADD COLUMN IF NOT EXISTS shift_detect_arrive_from INT,
    ADD COLUMN IF NOT EXISTS shift_detect_arrive_to INT,
    ADD COLUMN IF NOT EXISTS shift_detect_depart_from INT,
    ADD COLUMN IF NOT EXISTS shift_detect_depart_to INT,
    -- Alternative day plans for shift detection (up to 6)
    ADD COLUMN IF NOT EXISTS shift_alt_plan_1 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_2 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_3 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_4 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_5 UUID REFERENCES day_plans(id),
    ADD COLUMN IF NOT EXISTS shift_alt_plan_6 UUID REFERENCES day_plans(id);

-- Add minutes_difference to day_plan_breaks (Minuten Differenz)
ALTER TABLE day_plan_breaks
    ADD COLUMN IF NOT EXISTS minutes_difference BOOLEAN DEFAULT FALSE;
