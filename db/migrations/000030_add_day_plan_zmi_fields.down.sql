-- Remove minutes_difference from day_plan_breaks
ALTER TABLE day_plan_breaks
    DROP COLUMN IF EXISTS minutes_difference;

-- Remove ZMI fields from day_plans
ALTER TABLE day_plans
    DROP COLUMN IF EXISTS shift_alt_plan_6,
    DROP COLUMN IF EXISTS shift_alt_plan_5,
    DROP COLUMN IF EXISTS shift_alt_plan_4,
    DROP COLUMN IF EXISTS shift_alt_plan_3,
    DROP COLUMN IF EXISTS shift_alt_plan_2,
    DROP COLUMN IF EXISTS shift_alt_plan_1,
    DROP COLUMN IF EXISTS shift_detect_depart_to,
    DROP COLUMN IF EXISTS shift_detect_depart_from,
    DROP COLUMN IF EXISTS shift_detect_arrive_to,
    DROP COLUMN IF EXISTS shift_detect_arrive_from,
    DROP COLUMN IF EXISTS day_change_behavior,
    DROP COLUMN IF EXISTS no_booking_behavior,
    DROP COLUMN IF EXISTS vacation_deduction,
    DROP COLUMN IF EXISTS holiday_credit_cat3,
    DROP COLUMN IF EXISTS holiday_credit_cat2,
    DROP COLUMN IF EXISTS holiday_credit_cat1,
    DROP COLUMN IF EXISTS rounding_go_add_value,
    DROP COLUMN IF EXISTS rounding_come_add_value,
    DROP COLUMN IF EXISTS round_all_bookings,
    DROP COLUMN IF EXISTS variable_work_time,
    DROP COLUMN IF EXISTS from_employee_master,
    DROP COLUMN IF EXISTS regular_hours_2;
