-- ═══════════════════════════════════════════════════
-- 1. Tariff: sechs neue Spalten für Überstunden-Auszahlung
-- ═══════════════════════════════════════════════════
ALTER TABLE tariffs ADD COLUMN overtime_payout_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tariffs ADD COLUMN overtime_payout_threshold_minutes INT;
ALTER TABLE tariffs ADD COLUMN overtime_payout_mode VARCHAR(30);
ALTER TABLE tariffs ADD COLUMN overtime_payout_percentage INT;
ALTER TABLE tariffs ADD COLUMN overtime_payout_fixed_minutes INT;
ALTER TABLE tariffs ADD COLUMN overtime_payout_approval_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tariffs ADD CONSTRAINT chk_tariffs_overtime_payout_mode
  CHECK (overtime_payout_mode IS NULL OR overtime_payout_mode IN ('ALL_ABOVE_THRESHOLD', 'PERCENTAGE', 'FIXED_AMOUNT'));
ALTER TABLE tariffs ADD CONSTRAINT chk_tariffs_overtime_payout_percentage
  CHECK (overtime_payout_percentage IS NULL OR (overtime_payout_percentage >= 0 AND overtime_payout_percentage <= 100));

-- ═══════════════════════════════════════════════════
-- 2. OvertimePayout
-- ═══════════════════════════════════════════════════
CREATE TABLE overtime_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    payout_minutes INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    source_flextime_end INT NOT NULL,
    tariff_rule_snapshot JSONB NOT NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejected_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, employee_id, year, month)
);

CREATE INDEX idx_overtime_payouts_tenant ON overtime_payouts(tenant_id);
CREATE INDEX idx_overtime_payouts_employee ON overtime_payouts(employee_id);
CREATE INDEX idx_overtime_payouts_status ON overtime_payouts(tenant_id, status);
CREATE INDEX idx_overtime_payouts_period ON overtime_payouts(tenant_id, year, month);

CREATE TRIGGER update_overtime_payouts_updated_at
  BEFORE UPDATE ON overtime_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════
-- 3. EmployeeOvertimePayoutOverride
-- ═══════════════════════════════════════════════════
CREATE TABLE employee_overtime_payout_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    overtime_payout_enabled BOOLEAN NOT NULL,
    overtime_payout_mode VARCHAR(30),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, employee_id),
    CONSTRAINT chk_override_overtime_payout_mode
      CHECK (overtime_payout_mode IS NULL OR overtime_payout_mode IN ('ALL_ABOVE_THRESHOLD', 'PERCENTAGE', 'FIXED_AMOUNT'))
);

CREATE INDEX idx_eopo_tenant ON employee_overtime_payout_overrides(tenant_id);
CREATE INDEX idx_eopo_employee ON employee_overtime_payout_overrides(employee_id);

CREATE TRIGGER update_eopo_updated_at
  BEFORE UPDATE ON employee_overtime_payout_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════
-- 4. DefaultPayrollWage Seed: Lohnart 1010
-- ═══════════════════════════════════════════════════
INSERT INTO default_payroll_wages (code, name, terp_source, category, description, sort_order)
VALUES ('1010', 'Überstunden-Auszahlung', 'overtimePayoutHours', 'time', 'Auszahlung von Überstunden über dem Schwellenwert', 35)
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- 5. Backfill: Lohnart 1010 für alle existierenden Tenants
-- ═══════════════════════════════════════════════════
INSERT INTO tenant_payroll_wages (id, tenant_id, code, name, terp_source, category, description, sort_order, is_active)
SELECT
  gen_random_uuid(),
  t.id,
  '1010',
  'Überstunden-Auszahlung',
  'overtimePayoutHours',
  'time',
  'Auszahlung von Überstunden über dem Schwellenwert',
  35,
  true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_payroll_wages tpw
  WHERE tpw.tenant_id = t.id AND tpw.code = '1010'
);

-- ═══════════════════════════════════════════════════
-- 6. Assign overtime_payouts.manage to PERSONAL group
-- ═══════════════════════════════════════════════════
-- Permission UUID (UUIDv5, namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   overtime_payouts.manage = 0898c19a-9c9c-5442-a471-117ac46fe466
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"0898c19a-9c9c-5442-a471-117ac46fe466"'::jsonb  -- overtime_payouts.manage
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- ═══════════════════════════════════════════════════
-- 8. Enable RLS on new tables
-- ═══════════════════════════════════════════════════
ALTER TABLE overtime_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_overtime_payout_overrides ENABLE ROW LEVEL SECURITY;
