-- =============================================================
-- Create raw_terminal_bookings table for immutable terminal data
-- ZMI-TICKET-027: Terminal Integration and Raw Booking Ingest
-- =============================================================

CREATE TABLE raw_terminal_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    terminal_id VARCHAR(100) NOT NULL,
    employee_pin VARCHAR(20) NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    raw_timestamp TIMESTAMPTZ NOT NULL,
    raw_booking_code VARCHAR(20) NOT NULL,
    booking_date DATE NOT NULL,
    booking_type_id UUID REFERENCES booking_types(id) ON DELETE SET NULL,
    processed_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_raw_terminal_bookings_tenant ON raw_terminal_bookings(tenant_id);
CREATE INDEX idx_raw_terminal_bookings_batch ON raw_terminal_bookings(import_batch_id);
CREATE INDEX idx_raw_terminal_bookings_terminal ON raw_terminal_bookings(tenant_id, terminal_id);
CREATE INDEX idx_raw_terminal_bookings_employee ON raw_terminal_bookings(employee_id);
CREATE INDEX idx_raw_terminal_bookings_date ON raw_terminal_bookings(tenant_id, booking_date);
CREATE INDEX idx_raw_terminal_bookings_date_range ON raw_terminal_bookings(tenant_id, booking_date, terminal_id);
CREATE INDEX idx_raw_terminal_bookings_status ON raw_terminal_bookings(status) WHERE status = 'pending';

CREATE TRIGGER update_raw_terminal_bookings_updated_at
    BEFORE UPDATE ON raw_terminal_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE raw_terminal_bookings IS 'Immutable raw booking data read from time recording terminals (ZMI-TICKET-027).';
COMMENT ON COLUMN raw_terminal_bookings.terminal_id IS 'Identifier of the physical terminal device.';
COMMENT ON COLUMN raw_terminal_bookings.employee_pin IS 'Employee PIN as read from the terminal.';
COMMENT ON COLUMN raw_terminal_bookings.raw_timestamp IS 'Original timestamp from the terminal clock.';
COMMENT ON COLUMN raw_terminal_bookings.raw_booking_code IS 'Raw booking code from terminal (e.g. A1, A2, P1, P2, D1, D2).';
COMMENT ON COLUMN raw_terminal_bookings.processed_booking_id IS 'Link to the processed booking created from this raw record.';
COMMENT ON COLUMN raw_terminal_bookings.status IS 'Processing status: pending, processed, failed, skipped.';
