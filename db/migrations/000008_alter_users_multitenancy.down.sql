-- Drop indexes first
DROP INDEX IF EXISTS idx_users_tenant_email;
DROP INDEX IF EXISTS idx_users_tenant_username;
DROP INDEX IF EXISTS idx_users_deleted_at;
DROP INDEX IF EXISTS idx_users_user_group;
DROP INDEX IF EXISTS idx_users_tenant;

-- Remove columns
ALTER TABLE users
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS is_active,
    DROP COLUMN IF EXISTS username,
    DROP COLUMN IF EXISTS employee_id,
    DROP COLUMN IF EXISTS user_group_id,
    DROP COLUMN IF EXISTS tenant_id;
