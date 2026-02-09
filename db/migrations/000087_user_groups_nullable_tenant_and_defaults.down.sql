-- Remove system-level default user groups
DELETE FROM user_groups
WHERE tenant_id IS NULL
  AND code IN ('ADMIN', 'PERSONAL', 'VORGESETZTER', 'MITARBEITER');

-- Restore unique constraints
DROP INDEX IF EXISTS idx_user_groups_tenant_code;
DROP INDEX IF EXISTS idx_user_groups_tenant_name;

-- Restore tenant_id NOT NULL (only safe if no NULL rows remain)
ALTER TABLE user_groups ALTER COLUMN tenant_id SET NOT NULL;

-- Recreate original constraints
CREATE UNIQUE INDEX idx_user_groups_tenant_code ON user_groups(tenant_id, code);
ALTER TABLE user_groups ADD CONSTRAINT user_groups_tenant_id_name_key UNIQUE (tenant_id, name);
