# TICKET-076: Create Absence Days Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 19 - Absence Days
**Dependencies**: TICKET-074, TICKET-027

## Description

Create the absence_days table for tracking employee absences.

## Files to Create

- `db/migrations/000026_create_absence_days.up.sql`
- `db/migrations/000026_create_absence_days.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE absence_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    absence_date DATE NOT NULL,
    absence_type_id UUID NOT NULL REFERENCES absence_types(id),
    duration DECIMAL(3,2) DEFAULT 1.00, -- 1.0 = full day, 0.5 = half day
    status VARCHAR(20) DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
    notes TEXT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, absence_date)
);

CREATE INDEX idx_absence_days_tenant ON absence_days(tenant_id);
CREATE INDEX idx_absence_days_employee ON absence_days(employee_id);
CREATE INDEX idx_absence_days_date ON absence_days(absence_date);
CREATE INDEX idx_absence_days_type ON absence_days(absence_type_id);
CREATE INDEX idx_absence_days_lookup ON absence_days(employee_id, absence_date);
```

### Down Migration

```sql
DROP TABLE IF EXISTS absence_days;
```

## Notes

- One record per employee per day
- Duration 0.5 = half day (morning or afternoon)
- Status workflow: pending -> approved/rejected
- Only one absence type per day (unique constraint)

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] Unique constraint on employee_id + absence_date
