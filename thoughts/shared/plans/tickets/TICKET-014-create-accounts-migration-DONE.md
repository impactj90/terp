# TICKET-014: Create Accounts Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 2 - Reference Tables
**Dependencies**: TICKET-001

## Description

Create the accounts table for tracking time accounts (flextime, overtime, vacation, etc.).

## Files to Create

- `db/migrations/000006_create_accounts.up.sql`
- `db/migrations/000006_create_accounts.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL, -- 'bonus', 'tracking', 'balance'
    unit VARCHAR(20) NOT NULL DEFAULT 'minutes', -- 'minutes', 'hours', 'days'
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_accounts_tenant ON accounts(tenant_id);

-- Seed system accounts
INSERT INTO accounts (tenant_id, code, name, account_type, unit, is_system) VALUES
(NULL, 'FLEX', 'Flextime', 'balance', 'minutes', true),
(NULL, 'OT', 'Overtime', 'balance', 'minutes', true),
(NULL, 'VAC', 'Vacation', 'balance', 'days', true);
```

### Down Migration

```sql
DROP TABLE IF EXISTS accounts;
```

## Notes

- System accounts have NULL tenant_id and are shared
- Account types:
  - `bonus`: Time credits from bonuses
  - `tracking`: For tracking specific time categories
  - `balance`: Running balance accounts (flextime, overtime)

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] System accounts are seeded
- [x] `make migrate-down` succeeds
