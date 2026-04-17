-- ═══════════════════════════════════════════════════
-- DATEV-Zuschläge: terp_source auf account:-Prefix umstellen
-- ═══════════════════════════════════════════════════
-- Migrates:
--   - default_payroll_wages codes 1003/1004/1005 to "account:NIGHT|SUN|HOLIDAY"
--   - tenant_payroll_wages rows with legacy terp_source values
--   - system_export_templates template bodies to use the terp_value filter
--
-- Idempotent: all statements can run multiple times without damage.

-- ──────────────────────────────────────────────────
-- Block A — Default-Lohnarten auf account:-Prefix umstellen
-- ──────────────────────────────────────────────────
UPDATE default_payroll_wages SET terp_source = 'account:NIGHT'   WHERE code = '1003';
UPDATE default_payroll_wages SET terp_source = 'account:SUN'     WHERE code = '1004';
UPDATE default_payroll_wages SET terp_source = 'account:HOLIDAY' WHERE code = '1005';

-- ──────────────────────────────────────────────────
-- Block B — Bestehende Tenant-Lohnarten migrieren
-- ──────────────────────────────────────────────────
UPDATE tenant_payroll_wages SET terp_source = 'account:NIGHT'   WHERE terp_source = 'nightHours';
UPDATE tenant_payroll_wages SET terp_source = 'account:SUN'     WHERE terp_source = 'sundayHours';
UPDATE tenant_payroll_wages SET terp_source = 'account:HOLIDAY' WHERE terp_source = 'holidayHours';

-- ──────────────────────────────────────────────────
-- Block C — System-Templates auf terp_value-Filter umstellen
-- ──────────────────────────────────────────────────
-- Ersetzt das alte Muster
--   {%- assign val = employee.monthlyValues[wage.terpSource] -%}
-- durch
--   {%- assign val = wage.terpSource | terp_value: employee -%}
-- in allen 6 Seed-Templates (DATEV LODAS Bewegung, LODAS Stamm+Bewegung,
-- LuG, Lexware, SAGE, Generic CSV). REPLACE ist idempotent.
UPDATE system_export_templates
SET template_body = REPLACE(
  template_body,
  'employee.monthlyValues[wage.terpSource]',
  'wage.terpSource | terp_value: employee'
)
WHERE template_body LIKE '%employee.monthlyValues[wage.terpSource]%';
