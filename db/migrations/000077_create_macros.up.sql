-- =============================================================
-- Create macros and macro_assignments tables
-- ZMI-TICKET-032: Weekly and Monthly Macros
-- =============================================================

-- Macro definitions
CREATE TABLE macros (
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

CREATE INDEX idx_macros_tenant ON macros(tenant_id);
CREATE INDEX idx_macros_active ON macros(tenant_id, is_active);
CREATE INDEX idx_macros_type ON macros(tenant_id, macro_type);

CREATE TRIGGER update_macros_updated_at
    BEFORE UPDATE ON macros
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE macros IS 'Macro definitions for weekly and monthly automation actions.';
COMMENT ON COLUMN macros.macro_type IS 'Type of macro: weekly (executes on a weekday) or monthly (executes on a day of month).';
COMMENT ON COLUMN macros.action_type IS 'Predefined action: log_message, recalculate_target_hours, reset_flextime, carry_forward_balance.';
COMMENT ON COLUMN macros.action_params IS 'JSON parameters for the action (action-specific configuration).';

-- Macro assignments (link macros to tariffs or employees)
CREATE TABLE macro_assignments (
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

CREATE INDEX idx_macro_assignments_tenant ON macro_assignments(tenant_id);
CREATE INDEX idx_macro_assignments_macro ON macro_assignments(macro_id);
CREATE INDEX idx_macro_assignments_tariff ON macro_assignments(tariff_id);
CREATE INDEX idx_macro_assignments_employee ON macro_assignments(employee_id);
CREATE INDEX idx_macro_assignments_active ON macro_assignments(tenant_id, is_active);

CREATE TRIGGER update_macro_assignments_updated_at
    BEFORE UPDATE ON macro_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE macro_assignments IS 'Links macros to tariffs or employees with execution day configuration.';
COMMENT ON COLUMN macro_assignments.tariff_id IS 'Tariff this macro is assigned to (mutually exclusive with employee_id).';
COMMENT ON COLUMN macro_assignments.employee_id IS 'Employee this macro is assigned to (mutually exclusive with tariff_id).';
COMMENT ON COLUMN macro_assignments.execution_day IS 'For weekly macros: 0=Sunday..6=Saturday. For monthly macros: 1-31 (falls back to last day if exceeds month length).';

-- Macro execution log
CREATE TABLE macro_executions (
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

CREATE INDEX idx_macro_executions_tenant ON macro_executions(tenant_id);
CREATE INDEX idx_macro_executions_macro ON macro_executions(macro_id);
CREATE INDEX idx_macro_executions_status ON macro_executions(status);
CREATE INDEX idx_macro_executions_created ON macro_executions(created_at DESC);

COMMENT ON TABLE macro_executions IS 'Execution history for macro runs.';
COMMENT ON COLUMN macro_executions.trigger_type IS 'How the execution was triggered: scheduled or manual.';
