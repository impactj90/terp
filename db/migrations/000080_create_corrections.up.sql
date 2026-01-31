CREATE TABLE IF NOT EXISTS corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    correction_date DATE NOT NULL,
    correction_type VARCHAR(50) NOT NULL CHECK (correction_type IN ('time_adjustment', 'balance_adjustment', 'vacation_adjustment', 'account_adjustment')),
    account_id UUID REFERENCES accounts(id),
    value_minutes INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_corrections_tenant_id ON corrections(tenant_id);
CREATE INDEX idx_corrections_employee_id ON corrections(employee_id);
CREATE INDEX idx_corrections_date ON corrections(correction_date);
CREATE INDEX idx_corrections_status ON corrections(status);
