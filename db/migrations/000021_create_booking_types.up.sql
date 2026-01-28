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

-- Seed system booking types (idempotent)
INSERT INTO booking_types (tenant_id, code, name, direction, is_system)
SELECT v.tenant_id, v.code, v.name, v.direction, v.is_system
FROM (
    VALUES
    (NULL::uuid, 'COME', 'Clock In', 'in', true),
    (NULL::uuid, 'GO', 'Clock Out', 'out', true),
    (NULL::uuid, 'BREAK_START', 'Break Start', 'out', true),
    (NULL::uuid, 'BREAK_END', 'Break End', 'in', true)
) AS v(tenant_id, code, name, direction, is_system)
LEFT JOIN booking_types bt
    ON COALESCE(bt.tenant_id, '00000000-0000-0000-0000-000000000000') =
       COALESCE(v.tenant_id, '00000000-0000-0000-0000-000000000000')
    AND bt.code = v.code
WHERE bt.id IS NULL;
