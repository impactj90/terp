# TICKET-076: Create Absence Days Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 14 - Absence Days
**Dependencies**: TICKET-074, TICKET-027
**Migration Number**: 000026

## Description

Create the absence_days table for tracking employee absences per day.

## ZMI Reference

> "Kontenwert = Wert * Faktor"
> "Ausnahme: Wert = 0 → Tagessollzeit (Zeitplan) * Faktor"

The absence day links to an absence type which determines how time is credited.

## Files to Create

- `db/migrations/000026_create_absence_days.up.sql`
- `db/migrations/000026_create_absence_days.down.sql`

## Implementation

### Up Migration

```sql
-- Absence days track employee absences per date
-- Links to absence_types for credit calculation
CREATE TABLE absence_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

    -- The date and type of absence
    absence_date DATE NOT NULL,
    absence_type_id UUID NOT NULL REFERENCES absence_types(id),

    -- Duration: 1.0 = full day, 0.5 = half day
    -- Used with absence_type.portion to calculate final credit
    duration DECIMAL(3,2) NOT NULL DEFAULT 1.00,

    -- Half day specification (when duration = 0.5)
    half_day_period VARCHAR(10), -- 'morning' or 'afternoon'

    -- Approval workflow
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled'
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Optional notes
    notes TEXT,

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_absence_days_updated_at
    BEFORE UPDATE ON absence_days
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_absence_days_tenant ON absence_days(tenant_id);
CREATE INDEX idx_absence_days_employee ON absence_days(employee_id);
CREATE INDEX idx_absence_days_date ON absence_days(absence_date);
CREATE INDEX idx_absence_days_type ON absence_days(absence_type_id);
CREATE INDEX idx_absence_days_status ON absence_days(status);

-- Primary lookup: employee + date
CREATE INDEX idx_absence_days_lookup ON absence_days(employee_id, absence_date);

-- Only one absence per employee per date
CREATE UNIQUE INDEX idx_absence_days_unique ON absence_days(employee_id, absence_date)
    WHERE status != 'cancelled';

-- Date range queries
CREATE INDEX idx_absence_days_range ON absence_days(employee_id, absence_date, status);

COMMENT ON TABLE absence_days IS 'Employee absence records linked to absence_types for credit calculation';
COMMENT ON COLUMN absence_days.duration IS 'Day portion: 1.0=full, 0.5=half';
COMMENT ON COLUMN absence_days.half_day_period IS 'For half days: morning or afternoon';
```

### Down Migration

```sql
DROP TRIGGER IF EXISTS update_absence_days_updated_at ON absence_days;
DROP TABLE IF EXISTS absence_days;
```

## Credit Calculation

When processing an absence day, the time credit is calculated as:

```
effectiveCredit = regelarbeitszeit * absenceType.portion * absenceDay.duration

Example:
- Regelarbeitszeit: 480 minutes (8 hours)
- Absence type: Full day vacation (portion = 1)
- Duration: 0.5 (half day)
- Credit: 480 * 1.0 * 0.5 = 240 minutes (4 hours)
```

## Notes

- One absence record per employee per date (non-cancelled)
- Duration 0.5 combined with absence_type.portion allows flexible credit
- Half day period tracks morning/afternoon for scheduling
- Status workflow: pending → approved/rejected
- Cancelled absences don't count toward uniqueness constraint

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] Unique constraint prevents duplicate absences per date
- [ ] Duration field supports decimal (0.5, 1.0)
- [ ] Half day period field exists
- [ ] Status workflow fields exist
- [ ] `make migrate-down` succeeds
