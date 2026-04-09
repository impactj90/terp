-- ═══════════════════════════════════════════════════
-- Phase 2: Template-Engine-Fundament
-- ═══════════════════════════════════════════════════
-- Creates:
--   - default_payroll_wages (global seed)
--   - tenant_payroll_wages (per-tenant copy)
--   - export_templates (per-tenant Liquid templates)
--   - export_template_versions (history)
--   - export_interfaces.berater_nr / default_template_id

-- ═══════════════════════════════════════════════════
-- Default-Lohnarten (global, Seed)
-- ═══════════════════════════════════════════════════
CREATE TABLE default_payroll_wages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    terp_source VARCHAR(50) NOT NULL,
    category VARCHAR(30) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- Tenant-Lohnarten (mandantenspezifisch, kopiert)
-- ═══════════════════════════════════════════════════
CREATE TABLE tenant_payroll_wages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    name VARCHAR(200) NOT NULL,
    terp_source VARCHAR(50) NOT NULL,
    category VARCHAR(30) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, code)
);
CREATE INDEX idx_tenant_payroll_wages_tenant ON tenant_payroll_wages(tenant_id);

CREATE TRIGGER trigger_tenant_payroll_wages_updated_at
BEFORE UPDATE ON tenant_payroll_wages
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════
-- Export-Templates (mandantenspezifisch)
-- ═══════════════════════════════════════════════════
CREATE TABLE export_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    target_system VARCHAR(20) NOT NULL CHECK (target_system IN ('datev_lodas', 'datev_lug', 'lexware', 'sage', 'custom')),
    template_body TEXT NOT NULL,
    output_filename VARCHAR(200) NOT NULL DEFAULT 'export_{{period.year}}{{period.monthPadded}}.txt',
    encoding VARCHAR(20) NOT NULL DEFAULT 'windows-1252' CHECK (encoding IN ('windows-1252', 'utf-8', 'utf-8-bom')),
    line_ending VARCHAR(4) NOT NULL DEFAULT 'crlf' CHECK (line_ending IN ('crlf', 'lf')),
    field_separator VARCHAR(5) NOT NULL DEFAULT ';',
    decimal_separator VARCHAR(1) NOT NULL DEFAULT ',',
    date_format VARCHAR(20) NOT NULL DEFAULT 'TT.MM.JJJJ',
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX idx_export_templates_tenant ON export_templates(tenant_id);

CREATE TRIGGER trigger_export_templates_updated_at
BEFORE UPDATE ON export_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════
-- Export-Template-Versionsarchiv
-- ═══════════════════════════════════════════════════
CREATE TABLE export_template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES export_templates(id) ON DELETE CASCADE,
    version INT NOT NULL,
    template_body TEXT NOT NULL,
    changed_by UUID,
    changed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(template_id, version)
);
CREATE INDEX idx_export_template_versions_template ON export_template_versions(template_id);

-- ═══════════════════════════════════════════════════
-- ExportInterface erweitern
-- ═══════════════════════════════════════════════════
ALTER TABLE export_interfaces ADD COLUMN berater_nr VARCHAR(7);
ALTER TABLE export_interfaces ADD COLUMN default_template_id UUID REFERENCES export_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN export_interfaces.berater_nr IS 'DATEV-Beraternummer (4-7 Ziffern)';
COMMENT ON COLUMN export_interfaces.default_template_id IS 'Default Export Template für diese Schnittstelle';

-- ═══════════════════════════════════════════════════
-- Default-Lohnarten Seed (20 Standard-Lohnarten)
-- ═══════════════════════════════════════════════════
INSERT INTO default_payroll_wages (code, name, terp_source, category, description, sort_order) VALUES
  ('1000', 'Sollstunden', 'targetHours', 'time', 'Sollarbeitszeit in Stunden', 10),
  ('1001', 'Iststunden', 'workedHours', 'time', 'Tatsächlich gearbeitete Stunden', 20),
  ('1002', 'Mehrarbeit/Überstunden', 'overtimeHours', 'time', 'Mehrarbeitsstunden', 30),
  ('1003', 'Nachtarbeit', 'nightHours', 'time', 'Nachtarbeitsstunden', 40),
  ('1004', 'Sonntagsarbeit', 'sundayHours', 'time', 'Sonntagsarbeitsstunden', 50),
  ('1005', 'Feiertagsarbeit', 'holidayHours', 'time', 'Feiertagsarbeitsstunden', 60),
  ('2000', 'Urlaub', 'vacationDays', 'absence', 'Urlaubstage', 100),
  ('2001', 'Krankheit', 'sickDays', 'absence', 'Krankheitstage', 110),
  ('2002', 'Sonstige Fehlzeit', 'otherAbsenceDays', 'absence', 'Sonstige Abwesenheitstage', 120),
  ('2003', 'Mutterschutz', 'maternityDays', 'absence', 'Mutterschutztage', 130),
  ('2004', 'Elternzeit', 'parentalLeaveDays', 'absence', 'Elternzeittage', 140),
  ('2005', 'Bezahlte Freistellung', 'paidLeaveDays', 'absence', 'Bezahlte Freistellungstage', 150),
  ('2100', 'Bruttogehalt', 'grossSalary', 'compensation', 'Monatliches Bruttogehalt', 200),
  ('2101', 'Stundenlohn', 'hourlyRate', 'compensation', 'Stundenlohn', 210),
  ('2200', 'Dienstwagen', 'companyCar', 'benefit', 'Dienstwagen geldwerter Vorteil', 300),
  ('2201', 'Jobrad', 'jobBike', 'benefit', 'Jobrad geldwerter Vorteil', 310),
  ('2202', 'Essenszuschuss', 'mealAllowance', 'benefit', 'Essenszuschuss', 320),
  ('2203', 'Sachgutschein', 'voucher', 'benefit', 'Sachgutschein/Tankgutschein', 330),
  ('2204', 'Jobticket', 'jobTicket', 'benefit', 'Jobticket/ÖPNV-Zuschuss', 340),
  ('2900', 'Pfändung', 'garnishment', 'deduction', 'Pfändungsbetrag', 900)
ON CONFLICT (code) DO NOTHING;
