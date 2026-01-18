# TICKET-021: Create Departments Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 4 - Organization Structure
**Dependencies**: TICKET-001

## Description

Create the departments table with self-referential hierarchy support.

## Files to Create

- `db/migrations/000009_create_departments.up.sql`
- `db/migrations/000009_create_departments.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    manager_employee_id UUID, -- FK added later after employees table
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_departments_tenant ON departments(tenant_id);
CREATE INDEX idx_departments_parent ON departments(parent_id);
CREATE INDEX idx_departments_active ON departments(tenant_id, is_active);
```

### Down Migration

```sql
DROP TABLE IF EXISTS departments;
```

## Notes

- Self-referential parent_id enables hierarchical structure
- parent_id = NULL means top-level department
- manager_employee_id FK added after employees table exists

## Acceptance Criteria

- [x] `make migrate-up` succeeds
- [x] `make migrate-down` succeeds
- [x] Self-referential FK works correctly
