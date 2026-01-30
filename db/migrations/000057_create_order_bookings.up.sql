-- =============================================================
-- Create order_bookings table
-- ZMI Auftrag module: Time bookings against orders
-- =============================================================
CREATE TABLE order_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    booking_date DATE NOT NULL,
    time_minutes INT NOT NULL,
    description TEXT,
    source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'import')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

CREATE INDEX idx_order_bookings_tenant ON order_bookings(tenant_id);
CREATE INDEX idx_order_bookings_employee ON order_bookings(employee_id);
CREATE INDEX idx_order_bookings_order ON order_bookings(order_id);
CREATE INDEX idx_order_bookings_activity ON order_bookings(activity_id);
CREATE INDEX idx_order_bookings_employee_date ON order_bookings(employee_id, booking_date);
CREATE INDEX idx_order_bookings_order_date ON order_bookings(order_id, booking_date);

CREATE TRIGGER update_order_bookings_updated_at
    BEFORE UPDATE ON order_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE order_bookings IS 'Time bookings against orders (Auftragszeit) for order-based time tracking.';
COMMENT ON COLUMN order_bookings.time_minutes IS 'Duration of work in minutes booked to this order.';
COMMENT ON COLUMN order_bookings.source IS 'Source of the booking: manual, auto (daily calc), import.';
