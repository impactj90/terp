CREATE TABLE booking_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for system types
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    direction VARCHAR(10) NOT NULL, -- 'in' or 'out'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_types_tenant ON booking_types(tenant_id);
CREATE UNIQUE INDEX idx_booking_types_code ON booking_types(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), code);

-- Seed system booking types
INSERT INTO booking_types (code, name, direction, is_system) VALUES
('COME', 'Clock In', 'in', true),
('GO', 'Clock Out', 'out', true),
('BREAK_START', 'Break Start', 'out', true),
('BREAK_END', 'Break End', 'in', true);
