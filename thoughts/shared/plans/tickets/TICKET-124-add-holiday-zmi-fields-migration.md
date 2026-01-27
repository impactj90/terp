# TICKET-124: Add Holiday ZMI Fields Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 13 - Absence Types
**Dependencies**: TICKET-008 (holidays table)
**Priority**: HIGH

## Description

Add ZMI-compliant fields to the holidays table for absence code override and priority-based conflict resolution.

## ZMI Reference

> "Das Kürzel am Feiertag bedeutet, dass ZMI Time bei Feiertagen ein anderes Fehltagekürzel verwenden soll." (Section 18)

> "Die Priorität gibt vor, welche Berechnung zum Tragen kommt, falls zusätzlich zum Feiertag ein Fehltag eingetragen ist." (Section 18)

These fields enable:
- Alternative absence code on holidays (e.g., vacation on a holiday might use different code)
- Priority-based conflict resolution when both holiday and absence exist

## Files to Create

- `db/migrations/000028_add_holiday_zmi_fields.up.sql`
- `db/migrations/000028_add_holiday_zmi_fields.down.sql`

## Implementation

### Up Migration

```sql
-- Add ZMI-compliant fields to holidays table
-- ZMI Reference: Feiertage (Section 18)

ALTER TABLE holidays
    -- Alternative absence code to use on this holiday
    -- ZMI: Kürzel am Feiertag
    ADD COLUMN absence_code VARCHAR(10),

    -- Priority for conflict resolution (holiday vs absence)
    -- Higher number = higher priority
    -- ZMI: Priorität
    ADD COLUMN priority INT NOT NULL DEFAULT 0;

-- Note: category column already exists from TICKET-008
-- It determines holiday credit type (1, 2, or 3)

-- Comments
COMMENT ON COLUMN holidays.absence_code IS 'ZMI: Kürzel am Feiertag - alternative absence code on this holiday';
COMMENT ON COLUMN holidays.priority IS 'ZMI: Priorität - higher wins when holiday+absence conflict';
```

### Down Migration

```sql
ALTER TABLE holidays
    DROP COLUMN IF EXISTS absence_code,
    DROP COLUMN IF EXISTS priority;
```

## ZMI Field Mapping

| ZMI Field | German | DB Column | Type | Notes |
|-----------|--------|-----------|------|-------|
| Kürzel am Feiertag | Holiday Code | `absence_code` | VARCHAR(10) | Alternative absence code |
| Priorität | Priority | `priority` | INT | Higher wins in conflicts |
| Kategorie | Category | `category` | INT | Already exists (1/2/3) |

## Conflict Resolution Logic

When processing a day that is both a holiday and has an absence:

```go
// Determine which takes priority
func resolveHolidayAbsenceConflict(holiday *Holiday, absence *AbsenceDay) string {
    if absence == nil {
        return "holiday"
    }
    if holiday == nil {
        return "absence"
    }

    // Compare priorities
    holidayPriority := holiday.Priority
    absencePriority := 0
    if absence.AbsenceType != nil {
        absencePriority = absence.AbsenceType.Priority
    }

    if holidayPriority > absencePriority {
        return "holiday"
    }
    return "absence"
}
```

## Usage Examples

### Holiday with Alternative Code
```sql
-- Christmas might use 'FT' (Feiertag) instead of 'U' (Urlaub)
INSERT INTO holidays (name, date, category, absence_code, priority)
VALUES ('Christmas', '2024-12-25', 1, 'FT', 10);
```

### Priority-Based Resolution
```sql
-- Get effective code for a day with both holiday and absence
SELECT
    CASE
        WHEN h.priority > COALESCE(at.priority, 0)
        THEN COALESCE(h.absence_code, 'FT')
        ELSE at.code
    END as effective_code
FROM holidays h
LEFT JOIN absence_days ad ON ad.absence_date = h.date
LEFT JOIN absence_types at ON at.id = ad.absence_type_id
WHERE h.date = '2024-12-25';
```

## Notes

- `absence_code` is optional; if NULL, standard holiday processing applies
- `priority` defaults to 0; higher values take precedence
- Category 1/2/3 still determines holiday credit amount (already implemented)
- This migration adds conflict resolution capabilities

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] `absence_code` column exists and accepts VARCHAR(10)
- [ ] `priority` column exists with default 0
- [ ] Existing holiday data unaffected (new columns have defaults)
