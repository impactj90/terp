-- =============================================================
-- Add shifts, macros, and employee_messages tables
-- ZMI-TICKET-222: Shifts, Macros Config, Employee Messages
-- =============================================================

-- Shifts: shift definitions for the planning board
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,
    color VARCHAR(7),
    qualification TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_day_plan ON shifts(day_plan_id);

CREATE OR REPLACE TRIGGER update_shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Shift assignments: links employees to shifts for date ranges
CREATE TABLE IF NOT EXISTS shift_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_to DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant ON shift_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee ON shift_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_shift ON shift_assignments(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_dates ON shift_assignments(valid_from, valid_to);

CREATE OR REPLACE TRIGGER update_shift_assignments_updated_at
    BEFORE UPDATE ON shift_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Macro definitions
CREATE TABLE IF NOT EXISTS macros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    macro_type VARCHAR(10) NOT NULL
        CHECK (macro_type IN ('weekly', 'monthly')),
    action_type VARCHAR(50) NOT NULL
        CHECK (action_type IN ('log_message', 'recalculate_target_hours', 'reset_flextime', 'carry_forward_balance')),
    action_params JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_macros_tenant ON macros(tenant_id);
CREATE INDEX IF NOT EXISTS idx_macros_active ON macros(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_macros_type ON macros(tenant_id, macro_type);

CREATE OR REPLACE TRIGGER update_macros_updated_at
    BEFORE UPDATE ON macros
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Macro assignments (link macros to tariffs or employees)
CREATE TABLE IF NOT EXISTS macro_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    macro_id UUID NOT NULL REFERENCES macros(id) ON DELETE CASCADE,
    tariff_id UUID REFERENCES tariffs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    execution_day INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (tariff_id IS NOT NULL AND employee_id IS NULL) OR
        (tariff_id IS NULL AND employee_id IS NOT NULL)
    ),
    CHECK (execution_day >= 0 AND execution_day <= 31)
);

CREATE INDEX IF NOT EXISTS idx_macro_assignments_tenant ON macro_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_macro_assignments_macro ON macro_assignments(macro_id);
CREATE INDEX IF NOT EXISTS idx_macro_assignments_tariff ON macro_assignments(tariff_id);
CREATE INDEX IF NOT EXISTS idx_macro_assignments_employee ON macro_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_macro_assignments_active ON macro_assignments(tenant_id, is_active);

CREATE OR REPLACE TRIGGER update_macro_assignments_updated_at
    BEFORE UPDATE ON macro_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Macro execution log
CREATE TABLE IF NOT EXISTS macro_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    macro_id UUID NOT NULL REFERENCES macros(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES macro_assignments(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (trigger_type IN ('scheduled', 'manual')),
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_macro_executions_tenant ON macro_executions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_macro_executions_macro ON macro_executions(macro_id);
CREATE INDEX IF NOT EXISTS idx_macro_executions_status ON macro_executions(status);
CREATE INDEX IF NOT EXISTS idx_macro_executions_created ON macro_executions(created_at DESC);

-- Employee messages
CREATE TABLE IF NOT EXISTS employee_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_messages_tenant ON employee_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_messages_sender ON employee_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_employee_messages_tenant_created ON employee_messages(tenant_id, created_at DESC);

CREATE OR REPLACE TRIGGER update_employee_messages_updated_at
    BEFORE UPDATE ON employee_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Employee message recipients
CREATE TABLE IF NOT EXISTS employee_message_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES employee_messages(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emr_message ON employee_message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_emr_employee ON employee_message_recipients(employee_id);
CREATE INDEX IF NOT EXISTS idx_emr_status ON employee_message_recipients(status);
CREATE INDEX IF NOT EXISTS idx_emr_pending ON employee_message_recipients(status) WHERE status = 'pending';

CREATE OR REPLACE TRIGGER update_employee_message_recipients_updated_at
    BEFORE UPDATE ON employee_message_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
