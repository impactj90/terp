-- Bookings table
-- Stores time tracking events (clock-in/out, breaks) for employees

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    -- Time values stored as minutes from midnight (0-1439)
    -- Example: 08:30 = 510, 17:00 = 1020
    original_time INT NOT NULL,
    edited_time INT NOT NULL,
    calculated_time INT,
    -- Pairing: links COME/GO or BREAK_START/BREAK_END pairs
    pair_id UUID,
    -- Source of the booking
    source VARCHAR(20) DEFAULT 'web',
    terminal_id UUID,
    notes TEXT,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Audit fields (no FK constraints)
    created_by UUID,
    updated_by UUID
);

-- Indexes for common query patterns
CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_bookings_employee_date ON bookings(employee_id, booking_date);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
-- Partial index for pair lookups (only index non-null pair_ids)
CREATE INDEX idx_bookings_pair ON bookings(pair_id) WHERE pair_id IS NOT NULL;

COMMENT ON TABLE bookings IS 'Time tracking events (clock-in/out, breaks) for employees';
COMMENT ON COLUMN bookings.original_time IS 'Original booking time as minutes from midnight (0-1439)';
COMMENT ON COLUMN bookings.edited_time IS 'Edited/corrected time as minutes from midnight';
COMMENT ON COLUMN bookings.calculated_time IS 'Time after tolerance/rounding rules applied';
COMMENT ON COLUMN bookings.pair_id IS 'Links paired bookings (COME/GO, BREAK_START/BREAK_END)';
COMMENT ON COLUMN bookings.source IS 'Origin of booking: web, terminal, api, import, correction';
