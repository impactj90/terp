# TICKET-099: Create Audit Log Migration

**Type**: Migration
**Effort**: XS
**Sprint**: 25 - Audit Log
**Dependencies**: TICKET-001

## Description

Create the audit_logs table for tracking all changes.

## Files to Create

- `db/migrations/000032_create_audit_logs.up.sql`
- `db/migrations/000032_create_audit_logs.down.sql`

## Implementation

### Up Migration

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- What was changed
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,

    -- Change details
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'approve', 'reject', 'close', 'reopen')),
    changes JSONB,
    old_values JSONB,
    new_values JSONB,

    -- Who made the change
    user_id UUID REFERENCES users(id),
    user_email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,

    -- Context
    reason TEXT,
    metadata JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

COMMENT ON TABLE audit_logs IS 'Complete audit trail of all changes';
COMMENT ON COLUMN audit_logs.changes IS 'List of field names that changed';
COMMENT ON COLUMN audit_logs.old_values IS 'Previous values of changed fields';
COMMENT ON COLUMN audit_logs.new_values IS 'New values of changed fields';
```

### Down Migration

```sql
DROP TABLE IF EXISTS audit_logs;
```

## Notes

Audit log tracks:
- Entity type and ID
- Action performed
- Field-level changes
- User who made change
- IP and user agent for security
- Timestamp

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
