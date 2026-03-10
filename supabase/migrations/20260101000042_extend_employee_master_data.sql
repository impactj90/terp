-- ZMI-TICKET-004: Extend employee master data fields
-- Reference: ZMI Time Handbuch Section 4 (Personnel Master), 4.10 (Tariff fields)

-- ===== Group Lookup Tables =====

CREATE TABLE employee_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_employee_groups_tenant ON employee_groups(tenant_id);

CREATE TABLE workflow_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_workflow_groups_tenant ON workflow_groups(tenant_id);

CREATE TABLE activity_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_activity_groups_tenant ON activity_groups(tenant_id);

-- ===== Employee Personal Data Fields =====

ALTER TABLE employees
    -- Identity extensions
    ADD COLUMN exit_reason VARCHAR(255),
    ADD COLUMN notes TEXT,

    -- Address fields
    ADD COLUMN address_street VARCHAR(255),
    ADD COLUMN address_zip VARCHAR(20),
    ADD COLUMN address_city VARCHAR(100),
    ADD COLUMN address_country VARCHAR(100),

    -- Personal data fields
    ADD COLUMN birth_date DATE,
    ADD COLUMN gender VARCHAR(20),
    ADD COLUMN nationality VARCHAR(100),
    ADD COLUMN religion VARCHAR(100),
    ADD COLUMN marital_status VARCHAR(50),
    ADD COLUMN birth_place VARCHAR(100),
    ADD COLUMN birth_country VARCHAR(100),
    ADD COLUMN room_number VARCHAR(50),

    -- Photo metadata
    ADD COLUMN photo_url VARCHAR(500),

    -- Group FKs
    ADD COLUMN employee_group_id UUID REFERENCES employee_groups(id) ON DELETE SET NULL,
    ADD COLUMN workflow_group_id UUID REFERENCES workflow_groups(id) ON DELETE SET NULL,
    ADD COLUMN activity_group_id UUID REFERENCES activity_groups(id) ON DELETE SET NULL,

    -- Tariff-related override fields (from manual section 14.2 / ticket 4.10)
    ADD COLUMN part_time_percent DECIMAL(5,2),
    ADD COLUMN disability_flag BOOLEAN DEFAULT false,
    ADD COLUMN daily_target_hours DECIMAL(5,2),
    ADD COLUMN weekly_target_hours DECIMAL(5,2),
    ADD COLUMN monthly_target_hours DECIMAL(7,2),
    ADD COLUMN annual_target_hours DECIMAL(8,2),
    ADD COLUMN work_days_per_week DECIMAL(3,1),

    -- Calculation start date (system-managed, not user-editable)
    ADD COLUMN calculation_start_date DATE;

-- Add check constraint for gender values (allow NULL or empty for unset, plus valid values)
ALTER TABLE employees
    ADD CONSTRAINT chk_employee_gender
    CHECK (gender IS NULL OR gender = '' OR gender IN ('male', 'female', 'diverse', 'not_specified'));

-- Add check constraint for marital status (allow NULL or empty for unset, plus valid values)
ALTER TABLE employees
    ADD CONSTRAINT chk_employee_marital_status
    CHECK (marital_status IS NULL OR marital_status = '' OR marital_status IN ('single', 'married', 'divorced', 'widowed', 'registered_partnership', 'not_specified'));

-- Indexes for new FK columns
CREATE INDEX idx_employees_employee_group ON employees(employee_group_id);
CREATE INDEX idx_employees_workflow_group ON employees(workflow_group_id);
CREATE INDEX idx_employees_activity_group ON employees(activity_group_id);

-- Comments
COMMENT ON COLUMN employees.exit_reason IS 'Reason for employee departure';
COMMENT ON COLUMN employees.notes IS 'Free-text notes about the employee';
COMMENT ON COLUMN employees.part_time_percent IS 'ZMI: Part-time percentage (e.g., 50.00 for half-time)';
COMMENT ON COLUMN employees.disability_flag IS 'ZMI: Schwerbehinderung flag for extra vacation days';
COMMENT ON COLUMN employees.daily_target_hours IS 'ZMI: Tagessollstunden - overrides day plan target when "Aus Personalstamm holen" is set';
COMMENT ON COLUMN employees.weekly_target_hours IS 'ZMI: Wochensollstunden - used by macros';
COMMENT ON COLUMN employees.monthly_target_hours IS 'ZMI: Monatssollstunden - used by macros';
COMMENT ON COLUMN employees.annual_target_hours IS 'ZMI: Jahressollstunden - used by macros';
COMMENT ON COLUMN employees.work_days_per_week IS 'ZMI: AT pro Woche - work days per week for vacation calculation';
COMMENT ON COLUMN employees.calculation_start_date IS 'ZMI: Berechne ab - system-managed calculation start date';
