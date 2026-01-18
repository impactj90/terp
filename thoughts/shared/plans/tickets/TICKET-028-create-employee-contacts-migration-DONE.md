# TICKET-028: Create Employee Contacts Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 5 - Employees
**Dependencies**: TICKET-027

## Description

Create the employee_contacts table for storing multiple contact methods.

## Files to Create

- `db/migrations/000012_create_employee_contacts.up.sql`
- `db/migrations/000012_create_employee_contacts.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE employee_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    contact_type VARCHAR(50) NOT NULL, -- 'email', 'phone', 'mobile', 'emergency'
    value VARCHAR(255) NOT NULL,
    label VARCHAR(100), -- 'work', 'personal', 'emergency contact name'
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_contacts_employee ON employee_contacts(employee_id);
CREATE INDEX idx_employee_contacts_type ON employee_contacts(employee_id, contact_type);
```

### Down Migration

```sql
DROP TABLE IF EXISTS employee_contacts;
```

## Notes

Contact types:
- `email` - Email address
- `phone` - Landline phone
- `mobile` - Mobile phone
- `emergency` - Emergency contact (label contains contact name)

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] Cascades on employee delete
