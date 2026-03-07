-- =============================================================
-- Add terminal bookings, vehicles, vehicle routes, trip records tables
-- ZMI-TICKET-225: Terminal Bookings, Vehicles, Trip Records tRPC Routers
--
-- Source migrations: 000071, 000072, 000074
-- =============================================================

-- import_batches
CREATE TABLE IF NOT EXISTS import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_reference VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'terminal',
    terminal_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    records_total INT NOT NULL DEFAULT 0,
    records_imported INT NOT NULL DEFAULT 0,
    records_failed INT NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_batches_tenant ON import_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_reference ON import_batches(tenant_id, batch_reference);
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_unique_ref ON import_batches(tenant_id, batch_reference);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);

DROP TRIGGER IF EXISTS update_import_batches_updated_at ON import_batches;
CREATE TRIGGER update_import_batches_updated_at
    BEFORE UPDATE ON import_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- raw_terminal_bookings
-- Note: processed_booking_id is a plain UUID without FK to bookings(id) because
-- the bookings table is not yet in Supabase migrations.
CREATE TABLE IF NOT EXISTS raw_terminal_bookings (
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
    processed_booking_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_terminal_bookings_tenant ON raw_terminal_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_raw_terminal_bookings_batch ON raw_terminal_bookings(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_raw_terminal_bookings_terminal ON raw_terminal_bookings(tenant_id, terminal_id);
CREATE INDEX IF NOT EXISTS idx_raw_terminal_bookings_employee ON raw_terminal_bookings(employee_id);
CREATE INDEX IF NOT EXISTS idx_raw_terminal_bookings_date ON raw_terminal_bookings(tenant_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_raw_terminal_bookings_date_range ON raw_terminal_bookings(tenant_id, booking_date, terminal_id);

DROP TRIGGER IF EXISTS update_raw_terminal_bookings_updated_at ON raw_terminal_bookings;
CREATE TRIGGER update_raw_terminal_bookings_updated_at
    BEFORE UPDATE ON raw_terminal_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    license_plate VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON vehicles(tenant_id);

DROP TRIGGER IF EXISTS update_vehicles_updated_at ON vehicles;
CREATE TRIGGER update_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- vehicle_routes
CREATE TABLE IF NOT EXISTS vehicle_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    distance_km NUMERIC(10,2),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_routes_tenant ON vehicle_routes(tenant_id);

DROP TRIGGER IF EXISTS update_vehicle_routes_updated_at ON vehicle_routes;
CREATE TRIGGER update_vehicle_routes_updated_at
    BEFORE UPDATE ON vehicle_routes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- trip_records
CREATE TABLE IF NOT EXISTS trip_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    route_id UUID REFERENCES vehicle_routes(id) ON DELETE SET NULL,
    trip_date DATE NOT NULL,
    start_mileage NUMERIC(10,1),
    end_mileage NUMERIC(10,1),
    distance_km NUMERIC(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_records_tenant ON trip_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trip_records_vehicle ON trip_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trip_records_route ON trip_records(route_id);
CREATE INDEX IF NOT EXISTS idx_trip_records_date ON trip_records(trip_date);

DROP TRIGGER IF EXISTS update_trip_records_updated_at ON trip_records;
CREATE TRIGGER update_trip_records_updated_at
    BEFORE UPDATE ON trip_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
