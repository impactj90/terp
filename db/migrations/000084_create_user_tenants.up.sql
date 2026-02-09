CREATE TABLE user_tenants (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    role       VARCHAR(50) NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);

-- Backfill from existing users.tenant_id
INSERT INTO user_tenants (user_id, tenant_id, role)
SELECT id, tenant_id, 'member' FROM users WHERE tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;
