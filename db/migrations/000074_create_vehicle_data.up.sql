-- Vehicles: registered vehicles for mileage tracking (placeholder)
CREATE TABLE vehicles (
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

CREATE INDEX idx_vehicles_tenant ON vehicles(tenant_id);

CREATE TRIGGER update_vehicles_updated_at
    BEFORE UPDATE ON vehicles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vehicles IS 'Vehicle data (placeholder - requires separate vehicle documentation for full implementation)';

-- Vehicle routes: defined travel routes (placeholder)
CREATE TABLE vehicle_routes (
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

CREATE INDEX idx_vehicle_routes_tenant ON vehicle_routes(tenant_id);

CREATE TRIGGER update_vehicle_routes_updated_at
    BEFORE UPDATE ON vehicle_routes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE vehicle_routes IS 'Vehicle routes (placeholder - requires separate vehicle documentation for full implementation)';

-- Trip records: individual trip mileage logs (placeholder)
CREATE TABLE trip_records (
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

CREATE INDEX idx_trip_records_tenant ON trip_records(tenant_id);
CREATE INDEX idx_trip_records_vehicle ON trip_records(vehicle_id);
CREATE INDEX idx_trip_records_route ON trip_records(route_id);
CREATE INDEX idx_trip_records_date ON trip_records(trip_date);

CREATE TRIGGER update_trip_records_updated_at
    BEFORE UPDATE ON trip_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE trip_records IS 'Trip records (placeholder - requires separate vehicle documentation for full implementation)';
