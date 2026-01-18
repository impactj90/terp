CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    personnel_number VARCHAR(50) NOT NULL,
    pin VARCHAR(20) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    entry_date DATE NOT NULL,
    exit_date DATE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    employment_type_id UUID REFERENCES employment_types(id) ON DELETE SET NULL,
    weekly_hours DECIMAL(5,2) DEFAULT 40.00,
    vacation_days_per_year DECIMAL(5,2) DEFAULT 30.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, personnel_number),
    UNIQUE(tenant_id, pin)
);

CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_active ON employees(tenant_id, is_active);
CREATE INDEX idx_employees_deleted_at ON employees(deleted_at);
CREATE INDEX idx_employees_name ON employees(tenant_id, last_name, first_name);
