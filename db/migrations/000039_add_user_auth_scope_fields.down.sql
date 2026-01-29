ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_data_scope_type_check;

ALTER TABLE users
    DROP COLUMN IF EXISTS data_scope_employee_ids,
    DROP COLUMN IF EXISTS data_scope_department_ids,
    DROP COLUMN IF EXISTS data_scope_tenant_ids,
    DROP COLUMN IF EXISTS data_scope_type,
    DROP COLUMN IF EXISTS is_locked,
    DROP COLUMN IF EXISTS sso_id,
    DROP COLUMN IF EXISTS password_hash;
