# TICKET-074: Create Absence Types Migration

**Type**: Migration
**Effort**: S
**Sprint**: 13 - Absence Types
**Dependencies**: TICKET-006 (accounts)
**Migration Number**: 000025 (confirmed - first in absence sequence)

## Description

Create the absence_types table with system types seeded. Based on ZMI "Fehltage" specification (Page 159-161).

## ZMI Reference

> "Das Kürzel am Feiertag bedeutet, dass ZMI Time bei Feiertagen ein anderes Fehltagekürzel verwenden soll."
> "Die Priorität gibt vor, welche Berechnung zum Tragen kommt, falls zusätzlich zum Feiertag ein Fehltag eingetragen ist."
> "Unter Anteil definieren Sie den Anteil der Regelarbeitszeit, der dem/der Mitarbeit-er/-in an einem Fehltag gutgeschrieben wird."

Absence codes must start with:
- **U** = Urlaub (Vacation)
- **K** = Krankheit (Illness)
- **S** = Sondertage (Special days)

## Files to Create

- `db/migrations/000025_create_absence_types.up.sql`
- `db/migrations/000025_create_absence_types.down.sql`

## Implementation

### Up Migration

```sql
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

-- Seed system absence types per ZMI spec
INSERT INTO absence_types (code, name, category, portion, deducts_vacation, is_system, color, sort_order) VALUES
-- Vacation types (U prefix)
('U', 'Urlaub', 'vacation', 1, true, true, '#4CAF50', 1),
('UH', 'Urlaub halber Tag', 'vacation', 2, true, true, '#66BB6A', 2),

-- Illness types (K prefix)
('K', 'Krankheit', 'illness', 1, false, true, '#F44336', 10),
('KH', 'Krankheit halber Tag', 'illness', 2, false, true, '#EF5350', 11),
('KK', 'Krankheit Kind', 'illness', 1, false, true, '#E57373', 12),

-- Special leave types (S prefix)
('S', 'Sonderurlaub', 'special', 1, false, true, '#2196F3', 20),
('SH', 'Sonderurlaub halber Tag', 'special', 2, false, true, '#42A5F5', 21),
('SB', 'Berufsschule', 'special', 1, false, true, '#64B5F6', 22),
('SD', 'Dienstgang', 'special', 1, false, true, '#90CAF9', 23),

-- Unpaid leave (no time credit)
('UU', 'Unbezahlter Urlaub', 'unpaid', 0, false, true, '#9E9E9E', 30);

COMMENT ON TABLE absence_types IS 'Absence type definitions per ZMI Fehltage spec';
COMMENT ON COLUMN absence_types.portion IS 'ZMI Anteil: 0=no credit, 1=full Regelarbeitszeit, 2=half';
COMMENT ON COLUMN absence_types.holiday_code IS 'ZMI Kürzel am Feiertag: alternative code on holidays';
COMMENT ON COLUMN absence_types.priority IS 'ZMI Priorität: higher wins when holiday+absence overlap';
```

### Down Migration

```sql
DROP TRIGGER IF EXISTS update_absence_types_updated_at ON absence_types;
DROP TABLE IF EXISTS absence_types;
```

## ZMI Field Mapping

| ZMI Field | German | DB Column | Values |
|-----------|--------|-----------|--------|
| Kürzel | Code | `code` | Must start with U, K, or S |
| Bezeichnung | Name | `name` | Display name |
| Anteil | Portion | `portion` | 0, 1, or 2 |
| Kürzel am Feiertag | Holiday Code | `holiday_code` | Alternative code |
| Priorität | Priority | `priority` | Integer, higher wins |

## Notes

- Code prefix determines category: U=vacation, K=illness, S=special
- Portion 0 = Sollzeit auf Null (no time credit)
- Portion 1 = Full Regelarbeitszeit credit
- Portion 2 = Half Regelarbeitszeit credit
- Holiday code allows different treatment on holidays (e.g., vacation on holiday might use different code)
- Priority resolves conflicts when both holiday and absence exist

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] System types seeded with correct codes (U, K, S prefixes)
- [ ] Portion field supports 0, 1, 2 values
- [ ] Holiday code field exists
- [ ] Priority field exists
- [ ] `make migrate-down` succeeds
- [ ] Code unique per tenant (including system types)
