-- Absence types define how absences are credited and processed
-- ZMI Reference: Fehltage (Page 159-161)
CREATE TABLE absence_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL for system types

    -- Basic identification
    code VARCHAR(10) NOT NULL,           -- Must start with U, K, or S
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Category (derived from code prefix)
    category VARCHAR(20) NOT NULL,       -- 'vacation', 'illness', 'special', 'unpaid'

    -- ZMI: Anteil (Portion) - determines time credit
    -- 0 = no credit (Sollzeit auf Null), 1 = full credit, 2 = half credit
    portion INT NOT NULL DEFAULT 1,

    -- ZMI: Kürzel am Feiertag - different code to use on holidays
    holiday_code VARCHAR(10),

    -- ZMI: Priorität - which wins when holiday + absence overlap
    -- Higher number = higher priority
    priority INT NOT NULL DEFAULT 0,

    -- Behavior flags
    deducts_vacation BOOLEAN DEFAULT false,    -- Reduces vacation balance
    requires_approval BOOLEAN DEFAULT true,    -- Needs manager approval
    requires_document BOOLEAN DEFAULT false,   -- Needs medical certificate etc.

    -- Display
    color VARCHAR(7) DEFAULT '#808080',
    sort_order INT DEFAULT 0,

    -- Status
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_absence_types_updated_at
    BEFORE UPDATE ON absence_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_absence_types_tenant ON absence_types(tenant_id);
CREATE UNIQUE INDEX idx_absence_types_code ON absence_types(
    COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'),
    code
);

-- Seed system absence types per ZMI spec (idempotent)
INSERT INTO absence_types (tenant_id, code, name, category, portion, deducts_vacation, is_system, color, sort_order)
SELECT v.tenant_id, v.code, v.name, v.category, v.portion, v.deducts_vacation, v.is_system, v.color, v.sort_order
FROM (
    VALUES
    -- Vacation types (U prefix)
    (NULL::uuid, 'U', 'Urlaub', 'vacation', 1, true, true, '#4CAF50', 1),
    (NULL::uuid, 'UH', 'Urlaub halber Tag', 'vacation', 2, true, true, '#66BB6A', 2),

    -- Illness types (K prefix)
    (NULL::uuid, 'K', 'Krankheit', 'illness', 1, false, true, '#F44336', 10),
    (NULL::uuid, 'KH', 'Krankheit halber Tag', 'illness', 2, false, true, '#EF5350', 11),
    (NULL::uuid, 'KK', 'Krankheit Kind', 'illness', 1, false, true, '#E57373', 12),

    -- Special leave types (S prefix)
    (NULL::uuid, 'S', 'Sonderurlaub', 'special', 1, false, true, '#2196F3', 20),
    (NULL::uuid, 'SH', 'Sonderurlaub halber Tag', 'special', 2, false, true, '#42A5F5', 21),
    (NULL::uuid, 'SB', 'Berufsschule', 'special', 1, false, true, '#64B5F6', 22),
    (NULL::uuid, 'SD', 'Dienstgang', 'special', 1, false, true, '#90CAF9', 23),

    -- Unpaid leave (no time credit)
    (NULL::uuid, 'UU', 'Unbezahlter Urlaub', 'unpaid', 0, false, true, '#9E9E9E', 30)
) AS v(tenant_id, code, name, category, portion, deducts_vacation, is_system, color, sort_order)
LEFT JOIN absence_types at
    ON COALESCE(at.tenant_id, '00000000-0000-0000-0000-000000000000') =
       COALESCE(v.tenant_id, '00000000-0000-0000-0000-000000000000')
    AND at.code = v.code
WHERE at.id IS NULL;

COMMENT ON TABLE absence_types IS 'Absence type definitions per ZMI Fehltage spec';
COMMENT ON COLUMN absence_types.portion IS 'ZMI Anteil: 0=no credit, 1=full Regelarbeitszeit, 2=half';
COMMENT ON COLUMN absence_types.holiday_code IS 'ZMI Kürzel am Feiertag: alternative code on holidays';
COMMENT ON COLUMN absence_types.priority IS 'ZMI Priorität: higher wins when holiday+absence overlap';
