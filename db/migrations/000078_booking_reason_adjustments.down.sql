ALTER TABLE bookings
    DROP COLUMN IF EXISTS original_booking_id,
    DROP COLUMN IF EXISTS is_auto_generated,
    DROP COLUMN IF EXISTS booking_reason_id;

ALTER TABLE booking_reasons
    DROP COLUMN IF EXISTS adjustment_booking_type_id,
    DROP COLUMN IF EXISTS offset_minutes,
    DROP COLUMN IF EXISTS reference_time;
