DROP INDEX IF EXISTS idx_user_groups_tenant_code;

ALTER TABLE user_groups
    DROP COLUMN IF EXISTS code,
    DROP COLUMN IF EXISTS is_active;
