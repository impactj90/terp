# TICKET-125: Add Tariff ZMI Fields Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 15 - Vacation
**Dependencies**: TICKET-045 (tariffs table)
**Priority**: HIGH (blocks vacation calculation)

## Description

Add ZMI-compliant fields to the tariffs table for vacation entitlement configuration including base vacation days, work days per week, and vacation basis.

## ZMI Reference

> "Im Reiter Urlaubsberechnung können Sie einstellen, ob sich die Urlaubsberechnung auf das Kalenderjahr oder das Eintrittsdatum bezieht." (Section 14 - Tarif)

> "Jahresurlaub: Die Anzahl der Urlaubstage pro Jahr, die dem Tarif zugeordnet sind." (Section 14)

> "AT pro Woche: Anzahl der Arbeitstage pro Woche für diesen Tarif." (Section 14)

These fields are required for:
- Base vacation entitlement calculation
- Pro-rating vacation for part-time employees
- Determining vacation year (calendar vs entry date)

## Files to Create

- `db/migrations/000029_add_tariff_zmi_fields.up.sql`
- `db/migrations/000029_add_tariff_zmi_fields.down.sql`

## Implementation

### Up Migration

```sql
-- Add ZMI-compliant vacation fields to tariffs table
-- ZMI Reference: Tarif (Section 14)

ALTER TABLE tariffs
    -- Base annual vacation days for this tariff
    -- ZMI: Jahresurlaub
    ADD COLUMN annual_vacation_days DECIMAL(5,2),

    -- Work days per week (for pro-rating)
    -- ZMI: AT pro Woche (Arbeitstage pro Woche)
    ADD COLUMN work_days_per_week INT DEFAULT 5,

    -- Vacation calculation basis
    -- ZMI: Urlaubsberechnung Basis
    -- 'calendar_year' = Jan 1 - Dec 31
    -- 'entry_date' = Anniversary-based
    ADD COLUMN vacation_basis VARCHAR(20) DEFAULT 'calendar_year';

-- Comments
COMMENT ON COLUMN tariffs.annual_vacation_days IS 'ZMI: Jahresurlaub - base vacation days per year';
COMMENT ON COLUMN tariffs.work_days_per_week IS 'ZMI: AT pro Woche - work days per week (default 5)';
COMMENT ON COLUMN tariffs.vacation_basis IS 'ZMI: Urlaubsberechnung - calendar_year or entry_date';

-- Add constraint for vacation_basis
ALTER TABLE tariffs
    ADD CONSTRAINT chk_vacation_basis
    CHECK (vacation_basis IN ('calendar_year', 'entry_date'));
```

### Down Migration

```sql
ALTER TABLE tariffs
    DROP CONSTRAINT IF EXISTS chk_vacation_basis,
    DROP COLUMN IF EXISTS annual_vacation_days,
    DROP COLUMN IF EXISTS work_days_per_week,
    DROP COLUMN IF EXISTS vacation_basis;
```

## ZMI Field Mapping

| ZMI Field | German | DB Column | Type | Default | Notes |
|-----------|--------|-----------|------|---------|-------|
| Jahresurlaub | Annual Vacation | `annual_vacation_days` | DECIMAL(5,2) | NULL | Days per year |
| AT pro Woche | Work Days/Week | `work_days_per_week` | INT | 5 | For pro-rating |
| Urlaubsberechnung | Vacation Basis | `vacation_basis` | VARCHAR(20) | 'calendar_year' | Year type |

## Vacation Basis Options

| Value | German | Description |
|-------|--------|-------------|
| `calendar_year` | Kalenderjahr | Jan 1 - Dec 31 |
| `entry_date` | Eintrittsdatum | Anniversary-based |

## Usage Examples

### Tariff with Vacation Configuration
```sql
-- Standard tariff with 30 vacation days, 5-day week, calendar year
UPDATE tariffs
SET annual_vacation_days = 30.00,
    work_days_per_week = 5,
    vacation_basis = 'calendar_year'
WHERE code = 'STANDARD';
```

### Part-Time Pro-Rating
```sql
-- Calculate pro-rated vacation for 4-day week employee
SELECT
    t.annual_vacation_days,
    t.work_days_per_week,
    e.weekly_hours,
    (t.annual_vacation_days * (e.weekly_hours / 40.0)) as prorated_days
FROM tariffs t
JOIN employees e ON e.tariff_id = t.id
WHERE e.id = 'some-uuid';
```

### Vacation Year Determination
```sql
-- Get vacation year start/end based on basis
SELECT
    e.id,
    t.vacation_basis,
    CASE
        WHEN t.vacation_basis = 'calendar_year'
        THEN DATE_TRUNC('year', CURRENT_DATE)
        ELSE DATE_TRUNC('year', e.hire_date) +
             INTERVAL '1 year' * DATE_PART('year', AGE(CURRENT_DATE, e.hire_date))
    END as vacation_year_start
FROM employees e
JOIN tariffs t ON t.id = e.tariff_id;
```

## Notes

- `annual_vacation_days` uses DECIMAL for half-day precision (e.g., 30.5 days)
- `work_days_per_week` defaults to 5 (standard full-time)
- `vacation_basis` determines how vacation year is calculated
- These fields are used by TICKET-082 vacation calculation logic

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] `annual_vacation_days` column exists with DECIMAL(5,2) type
- [ ] `work_days_per_week` column exists with default 5
- [ ] `vacation_basis` column exists with default 'calendar_year'
- [ ] Check constraint enforces valid vacation_basis values
- [ ] Existing tariff data unaffected
