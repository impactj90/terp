-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    entity_name TEXT,
    changes JSONB,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_performed_at ON audit_logs(performed_at);

COMMENT ON TABLE audit_logs IS 'Audit trail of create/update/delete and other actions';
COMMENT ON COLUMN audit_logs.changes IS 'JSON change set (before/after)';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context for audit entry';
