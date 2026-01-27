# TICKET-123: Add Employee ZMI Fields Migration

**Type**: Migration
**Effort**: S
**Sprint**: 13 - Absence Types
**Dependencies**: TICKET-027 (employees table)
**Priority**: CRITICAL (blocks vacation special calculations)

## Description

Add ZMI-compliant fields to the employees table for vacation special calculations (Sonderberechnung) including birth date, disability flag, and target hours.

## ZMI Reference

> "Sonderberechnung Behinderung: Diese Sonderberechnung wird berücksichtigt, sofern im Personalstamm der Haken Schwerbehinderung gesetzt ist." (Section 19)

> "Personalstamm: Geburtsdatum, tägliche/wöchentliche/monatliche/jährliche Sollstunden" (Section 13)

These fields are required for:
- Age-based vacation bonus calculation (Sonderberechnung Alter)
- Tenure-based vacation bonus calculation (Sonderberechnung Betriebszugehörigkeit)
- Disability bonus calculation (Sonderberechnung Behinderung)
- Target time calculations when `FromEmployeeMaster` is enabled

## Files to Create

- `db/migrations/000027_add_employee_zmi_fields.up.sql`
- `db/migrations/000027_add_employee_zmi_fields.down.sql`

## Implementation

### Up Migration

```sql
-- Add ZMI-compliant fields to employees table
-- ZMI Reference: Personalstamm (Section 13), Sonderberechnung (Section 19)

ALTER TABLE employees
    -- Birth date for age-based vacation calculation
    -- ZMI: Sonderberechnung Alter
    ADD COLUMN birth_date DATE,

    -- Disability flag for vacation bonus
    -- ZMI: Schwerbehinderung (Sonderberechnung Behinderung)
    ADD COLUMN has_disability BOOLEAN NOT NULL DEFAULT FALSE,

    -- Target hours for when FromEmployeeMaster is enabled on day plan
    -- ZMI: Aus Personalstamm holen
    ADD COLUMN target_hours_daily INT,           -- Daily target in minutes
    ADD COLUMN target_hours_weekly DECIMAL(5,2), -- Weekly target in hours
    ADD COLUMN target_hours_monthly DECIMAL(7,2), -- Monthly target in hours
    ADD COLUMN target_hours_annual DECIMAL(8,2); -- Annual target in hours

-- Comments
COMMENT ON COLUMN employees.birth_date IS 'ZMI: Geburtsdatum for Sonderberechnung Alter';
COMMENT ON COLUMN employees.has_disability IS 'ZMI: Schwerbehinderung for Sonderberechnung Behinderung';
COMMENT ON COLUMN employees.target_hours_daily IS 'ZMI: Daily target (minutes) when FromEmployeeMaster enabled';
COMMENT ON COLUMN employees.target_hours_weekly IS 'ZMI: Weekly target (hours) from Personalstamm';
COMMENT ON COLUMN employees.target_hours_monthly IS 'ZMI: Monthly target (hours) from Personalstamm';
COMMENT ON COLUMN employees.target_hours_annual IS 'ZMI: Annual target (hours) from Personalstamm';
```

### Down Migration

```sql
ALTER TABLE employees
    DROP COLUMN IF EXISTS birth_date,
    DROP COLUMN IF EXISTS has_disability,
    DROP COLUMN IF EXISTS target_hours_daily,
    DROP COLUMN IF EXISTS target_hours_weekly,
    DROP COLUMN IF EXISTS target_hours_monthly,
    DROP COLUMN IF EXISTS target_hours_annual;
```

## ZMI Field Mapping

| ZMI Field | German | DB Column | Type | Notes |
|-----------|--------|-----------|------|-------|
| Geburtsdatum | Birth Date | `birth_date` | DATE | For age calculation |
| Schwerbehinderung | Disability | `has_disability` | BOOLEAN | Enables disability bonus |
| Tägliche Sollzeit | Daily Target | `target_hours_daily` | INT | Minutes per day |
| Wöchentliche Sollzeit | Weekly Target | `target_hours_weekly` | DECIMAL | Hours per week |
| Monatliche Sollzeit | Monthly Target | `target_hours_monthly` | DECIMAL | Hours per month |
| Jährliche Sollzeit | Annual Target | `target_hours_annual` | DECIMAL | Hours per year |

## Usage Examples

### Age-Based Vacation Bonus
```sql
-- Employee over 50 gets +2 vacation days
SELECT e.id, e.first_name,
       DATE_PART('year', AGE(CURRENT_DATE, e.birth_date)) as age,
       CASE WHEN DATE_PART('year', AGE(CURRENT_DATE, e.birth_date)) >= 50
            THEN 2 ELSE 0 END as age_bonus_days
FROM employees e
WHERE e.birth_date IS NOT NULL;
```

### Disability Bonus
```sql
-- Employees with disability flag get +5 vacation days
SELECT e.id, e.first_name,
       CASE WHEN e.has_disability THEN 5 ELSE 0 END as disability_bonus_days
FROM employees e;
```

### Target Hours from Employee Master
```sql
-- Get effective daily target (employee master overrides day plan)
SELECT dp.id, dp.regular_hours,
       CASE WHEN dp.from_employee_master AND e.target_hours_daily IS NOT NULL
            THEN e.target_hours_daily
            ELSE dp.regular_hours
       END as effective_target
FROM day_plans dp
JOIN employees e ON e.tariff_id = dp.tariff_id;
```

## Notes

- `birth_date` is optional; if not set, age-based bonuses won't apply
- `has_disability` defaults to FALSE; must be explicitly set
- Target hours fields are used when day plan has `from_employee_master = true`
- `target_hours_daily` is in minutes (consistent with day plan RegularHours)
- Weekly/monthly/annual targets are in hours (decimal for precision)

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] `birth_date` column exists and accepts DATE values
- [ ] `has_disability` column exists with default FALSE
- [ ] All target hours columns exist with correct types
- [ ] Comments added for ZMI documentation
