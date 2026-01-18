# TICKET-008: Create Holidays Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 2 - Reference Tables
**Dependencies**: TICKET-001

## Description

Create the holidays table for tenant-specific public holidays.

## Files to Create

- `db/migrations/000003_create_holidays.up.sql`
- `db/migrations/000003_create_holidays.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    holiday_date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_half_day BOOLEAN DEFAULT false,
    applies_to_all BOOLEAN DEFAULT true,
    department_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, holiday_date)
);

CREATE INDEX idx_holidays_tenant_date ON holidays(tenant_id, holiday_date);
CREATE INDEX idx_holidays_date_range ON holidays(holiday_date);
```

### Down Migration

```sql
DROP TABLE IF EXISTS holidays;
```

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] Unique constraint on tenant_id + holiday_date
- [x] Foreign key to tenants table
