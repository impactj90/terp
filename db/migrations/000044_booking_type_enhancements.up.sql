-- =============================================================
-- Phase 1a: Add new columns to booking_types
-- =============================================================
ALTER TABLE booking_types
    ADD COLUMN category VARCHAR(30) NOT NULL DEFAULT 'work',
    ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    ADD COLUMN requires_reason BOOLEAN DEFAULT false;

CREATE INDEX idx_booking_types_account ON booking_types(account_id);
CREATE INDEX idx_booking_types_category ON booking_types(category);

COMMENT ON COLUMN booking_types.category IS 'Category: work, break, business_trip, other';
COMMENT ON COLUMN booking_types.account_id IS 'Optional linked account for time calculations';
COMMENT ON COLUMN booking_types.requires_reason IS 'Whether bookings of this type must include a reason code';

-- Update existing system seed data with categories
UPDATE booking_types SET category = 'work' WHERE code IN ('COME', 'GO');
UPDATE booking_types SET category = 'break' WHERE code IN ('BREAK_START', 'BREAK_END');

-- =============================================================
-- Phase 1b: Create booking_reasons table
-- =============================================================
CREATE TABLE booking_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, booking_type_id, code)
);

CREATE INDEX idx_booking_reasons_tenant ON booking_reasons(tenant_id);
CREATE INDEX idx_booking_reasons_booking_type ON booking_reasons(booking_type_id);

CREATE TRIGGER update_booking_reasons_updated_at
    BEFORE UPDATE ON booking_reasons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE booking_reasons IS 'Reasons that can be selected when creating bookings of a specific type';

-- =============================================================
-- Phase 1c: Create booking_type_groups table
-- =============================================================
CREATE TABLE booking_type_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_booking_type_groups_tenant ON booking_type_groups(tenant_id);

CREATE TRIGGER update_booking_type_groups_updated_at
    BEFORE UPDATE ON booking_type_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE booking_type_groups IS 'Groups of booking types controlling terminal availability';

-- =============================================================
-- Phase 1d: Create booking_type_group_members join table
-- =============================================================
CREATE TABLE booking_type_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES booking_type_groups(id) ON DELETE CASCADE,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, booking_type_id)
);

CREATE INDEX idx_btgm_group ON booking_type_group_members(group_id);
CREATE INDEX idx_btgm_booking_type ON booking_type_group_members(booking_type_id);

COMMENT ON TABLE booking_type_group_members IS 'Join table linking booking types to groups with sort ordering';
