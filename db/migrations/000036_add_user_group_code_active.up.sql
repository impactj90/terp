ALTER TABLE user_groups
    ADD COLUMN IF NOT EXISTS code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

UPDATE user_groups
SET code = LEFT(upper(regexp_replace(name, '[^A-Za-z0-9]+', '_', 'g')), 50)
WHERE code IS NULL OR code = '';

ALTER TABLE user_groups
    ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_groups_tenant_code ON user_groups(tenant_id, code);
