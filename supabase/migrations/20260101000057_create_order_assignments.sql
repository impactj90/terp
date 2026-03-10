-- =============================================================
-- Create order_assignments table
-- ZMI Auftrag module: Employee-to-order assignments with roles
-- =============================================================
CREATE TABLE order_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'worker' CHECK (role IN ('worker', 'leader', 'sales')),
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id, employee_id, role)
);

CREATE INDEX idx_order_assignments_tenant ON order_assignments(tenant_id);
CREATE INDEX idx_order_assignments_order ON order_assignments(order_id);
CREATE INDEX idx_order_assignments_employee ON order_assignments(employee_id);
CREATE INDEX idx_order_assignments_employee_active ON order_assignments(employee_id, is_active);

CREATE TRIGGER update_order_assignments_updated_at
    BEFORE UPDATE ON order_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE order_assignments IS 'Employee-to-order assignments with roles (worker, leader, sales).';
COMMENT ON COLUMN order_assignments.role IS 'Assignment role: worker (default), leader, or sales.';
