-- Add authentication and data scope fields to users
ALTER TABLE users
    ADD COLUMN password_hash VARCHAR(255),
    ADD COLUMN sso_id VARCHAR(255),
    ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN data_scope_type VARCHAR(20) NOT NULL DEFAULT 'all',
    ADD COLUMN data_scope_tenant_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
    ADD COLUMN data_scope_department_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
    ADD COLUMN data_scope_employee_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE users
    ADD CONSTRAINT users_data_scope_type_check
    CHECK (data_scope_type IN ('all', 'tenant', 'department', 'employee'));

COMMENT ON COLUMN users.password_hash IS 'Bcrypt password hash for credential auth';
COMMENT ON COLUMN users.sso_id IS 'External SSO identifier for user authentication';
COMMENT ON COLUMN users.is_locked IS 'If true, user cannot log in';
COMMENT ON COLUMN users.data_scope_type IS 'Data access scope: all/tenant/department/employee';
COMMENT ON COLUMN users.data_scope_tenant_ids IS 'Allowed tenant IDs when scope is tenant';
COMMENT ON COLUMN users.data_scope_department_ids IS 'Allowed department IDs when scope is department';
COMMENT ON COLUMN users.data_scope_employee_ids IS 'Allowed employee IDs when scope is employee';
