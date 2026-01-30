-- =============================================================
-- Phase 1a: Add adjustment configuration to booking_reasons
-- =============================================================
ALTER TABLE booking_reasons
    ADD COLUMN reference_time VARCHAR(20),
    ADD COLUMN offset_minutes INT,
    ADD COLUMN adjustment_booking_type_id UUID REFERENCES booking_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN booking_reasons.reference_time IS 'Reference point for time adjustment: plan_start, plan_end, or booking_time';
COMMENT ON COLUMN booking_reasons.offset_minutes IS 'Signed offset in minutes to apply to reference time (positive = later, negative = earlier)';
COMMENT ON COLUMN booking_reasons.adjustment_booking_type_id IS 'Booking type for the derived booking. If NULL, uses the opposite direction of the original booking type';

CREATE INDEX idx_booking_reasons_adj_bt ON booking_reasons(adjustment_booking_type_id) WHERE adjustment_booking_type_id IS NOT NULL;

-- =============================================================
-- Phase 1b: Add reason and derived-booking fields to bookings
-- =============================================================
ALTER TABLE bookings
    ADD COLUMN booking_reason_id UUID REFERENCES booking_reasons(id) ON DELETE SET NULL,
    ADD COLUMN is_auto_generated BOOLEAN DEFAULT false,
    ADD COLUMN original_booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE;

CREATE INDEX idx_bookings_reason ON bookings(booking_reason_id) WHERE booking_reason_id IS NOT NULL;
CREATE INDEX idx_bookings_auto_gen ON bookings(is_auto_generated) WHERE is_auto_generated = true;
CREATE INDEX idx_bookings_original ON bookings(original_booking_id) WHERE original_booking_id IS NOT NULL;

COMMENT ON COLUMN bookings.booking_reason_id IS 'Optional reason code selected when creating this booking';
COMMENT ON COLUMN bookings.is_auto_generated IS 'True if this booking was automatically created as a derived booking from a reason adjustment';
COMMENT ON COLUMN bookings.original_booking_id IS 'For derived bookings: the ID of the original booking that triggered creation';
