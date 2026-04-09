-- ═══════════════════════════════════════════════════
-- Phase 3: Standard-Templates, Gehaltshistorie, Bulk Import
-- ═══════════════════════════════════════════════════
-- Creates:
--   - system_export_templates (global standard templates, read-only from UI)
--   - employee_salary_history (Gehaltshistorie per MA)
--
-- System templates are shipped with Terp and can be copied into
-- per-tenant `export_templates`. The library UI reads from here.

-- ═══════════════════════════════════════════════════
-- System Export Templates (global, shipped with Terp)
-- ═══════════════════════════════════════════════════
CREATE TABLE system_export_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    target_system VARCHAR(20) NOT NULL CHECK (target_system IN ('datev_lodas', 'datev_lug', 'lexware', 'sage', 'custom')),
    template_body TEXT NOT NULL,
    output_filename VARCHAR(200) NOT NULL,
    encoding VARCHAR(20) NOT NULL DEFAULT 'windows-1252' CHECK (encoding IN ('windows-1252', 'utf-8', 'utf-8-bom')),
    line_ending VARCHAR(4) NOT NULL DEFAULT 'crlf' CHECK (line_ending IN ('crlf', 'lf')),
    field_separator VARCHAR(5) NOT NULL DEFAULT ';',
    decimal_separator VARCHAR(1) NOT NULL DEFAULT ',',
    date_format VARCHAR(20) NOT NULL DEFAULT 'TT.MM.JJJJ',
    version INT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trigger_system_export_templates_updated_at
BEFORE UPDATE ON system_export_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE system_export_templates IS 'Mitgelieferte Standard-Templates. Read-only aus der UI. Kopieren via Template-Bibliothek.';

-- ═══════════════════════════════════════════════════
-- Employee Salary History (Gehaltshistorie, Phase 3.5)
-- ═══════════════════════════════════════════════════
CREATE TABLE employee_salary_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    valid_from DATE NOT NULL,
    valid_to DATE,
    gross_salary DECIMAL(10, 2),
    hourly_rate DECIMAL(10, 2),
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('monthly', 'hourly')),
    change_reason VARCHAR(50) NOT NULL CHECK (change_reason IN ('initial', 'raise', 'tariff_change', 'promotion', 'other')),
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_salary_history_employee ON employee_salary_history(employee_id);
CREATE INDEX idx_salary_history_tenant ON employee_salary_history(tenant_id);
CREATE INDEX idx_salary_history_valid ON employee_salary_history(employee_id, valid_from, valid_to);

CREATE TRIGGER trigger_employee_salary_history_updated_at
BEFORE UPDATE ON employee_salary_history
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_salary_history IS 'Gehaltshistorie pro Mitarbeiter. Neue Einträge setzen valid_to des Vorgängers automatisch (im Service). Der jüngste Eintrag (valid_to IS NULL) wird mit Employee.grossSalary/hourlyRate synchronisiert.';

-- ═══════════════════════════════════════════════════
-- Standard-Templates Seed
-- ═══════════════════════════════════════════════════

-- 1) DATEV LODAS — Bewegungsdaten (nur Bewegungen / Satzart 21)
INSERT INTO system_export_templates (
    name, description, target_system, template_body, output_filename,
    encoding, line_ending, field_separator, decimal_separator, date_format, sort_order
) VALUES (
    'DATEV LODAS — Bewegungsdaten',
    'DATEV LODAS ASCII-Import, nur Bewegungsdaten (Satzart 21). Basis-Template — Lohnart-Codes müssen mit dem Steuerberater abgestimmt werden.',
    'datev_lodas',
$liquid${%- comment -%}
  DATEV LODAS — Standardvorlage Bewegungsdaten
  Version: 1.0
  Ziel: LODAS ASCII-Import (Mandant > Daten übernehmen > ASCII-Import)
  Encoding: Windows-1252 (wird automatisch vom Export-System gesetzt)
  ANPASSUNG ERFORDERLICH: Lohnart-Codes müssen mit dem Steuerberater
  abgestimmt werden (siehe /admin/payroll-wages).
{%- endcomment -%}
[Allgemein]
Ziel=LODAS
Version_SST=1.0
BeraterNr={{ exportInterface.beraterNr }}
MandantenNr={{ exportInterface.mandantNumber }}
Datumsformat={{ template.dateFormat }}
Feldtrennzeichen={{ template.fieldSeparator }}
Zahlenkomma={{ template.decimalSeparator }}

[Satzbeschreibung]
21;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;buchungswert#bwd;buchungsnummer#bwd;kostenstelle1#bwd

[Bewegungsdaten]
{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- if wage.category == "time" or wage.category == "absence" -%}
{%- assign val = employee.monthlyValues[wage.terpSource] -%}
{%- if val and val != 0 -%}
{{ employee.personnelNumber }};{{ period.ddmmyyyy }};{{ val | datev_decimal: 2 }};{{ wage.code }};{{ employee.costCenter }}
{% endif -%}
{%- endif -%}
{%- endfor -%}
{%- endfor -%}
$liquid$,
    'LODAS_{{ period.year }}{{ period.monthPadded }}.txt',
    'windows-1252', 'crlf', ';', ',', 'TT.MM.JJJJ', 10
);

-- 2) DATEV LODAS — Stamm + Bewegungsdaten
INSERT INTO system_export_templates (
    name, description, target_system, template_body, output_filename,
    encoding, line_ending, field_separator, decimal_separator, date_format, sort_order
) VALUES (
    'DATEV LODAS — Stamm + Bewegungsdaten',
    'DATEV LODAS ASCII-Import mit Stammdaten und Bewegungsdaten. Vor dem ersten Produktiveinsatz unbedingt vom Steuerberater verifizieren lassen.',
    'datev_lodas',
$liquid${%- comment -%}
  DATEV LODAS — Stamm + Bewegungsdaten
  WICHTIG: Dieses Template schreibt auch Stammdaten. Vor dem Produktivlauf
  zusammen mit dem Steuerberater verifizieren. Die LODAS-Stammdaten-Sektion
  hat > 90 mögliche Felder — dieses Template liefert die Basisfelder.
{%- endcomment -%}
[Allgemein]
Ziel=LODAS
Version_SST=1.0
BeraterNr={{ exportInterface.beraterNr }}
MandantenNr={{ exportInterface.mandantNumber }}
Datumsformat={{ template.dateFormat }}
Feldtrennzeichen={{ template.fieldSeparator }}
Zahlenkomma={{ template.decimalSeparator }}

[Satzbeschreibung]
11;u_lod_psd_mitarbeiter;pnr#psd;familienname#psd;vorname#psd;geburtsdatum#psd;strassenname#psd;plz#psd;ort#psd;eintrittsdatum#psd;austrittsdatum#psd
12;u_lod_psd_taetigkeit;pnr#psd;pers_gruppe#psd;beitragsgruppe#psd;taetigkeitsschluessel#psd
13;u_lod_psd_bank;pnr#psd;iban#psd;bic#psd
21;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;buchungswert#bwd;buchungsnummer#bwd;kostenstelle1#bwd

[Stammdaten]
{%- for employee in employees -%}
{{ employee.personnelNumber }};{{ employee.lastName | datev_string }};{{ employee.firstName | datev_string }};{{ employee.birthDate | datev_date: "TT.MM.JJJJ" }};{{ employee.addressStreet | datev_string }};{{ employee.addressZip }};{{ employee.addressCity | datev_string }};{{ employee.entryDate | datev_date: "TT.MM.JJJJ" }};{{ employee.exitDate | datev_date: "TT.MM.JJJJ" }}
{{ employee.personnelNumber }};{{ employee.personnelGroupCode }};{{ employee.contributionGroupCode }};{{ employee.activityCode }}
{{ employee.personnelNumber }};{{ employee.iban }};{{ employee.bic }}
{%- endfor -%}

[Bewegungsdaten]
{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- assign val = employee.monthlyValues[wage.terpSource] -%}
{%- if val and val != 0 -%}
{{ employee.personnelNumber }};{{ period.ddmmyyyy }};{{ val | datev_decimal: 2 }};{{ wage.code }};{{ employee.costCenter }}
{% endif -%}
{%- endfor -%}
{%- endfor -%}
$liquid$,
    'LODAS_STAMM_{{ period.year }}{{ period.monthPadded }}.txt',
    'windows-1252', 'crlf', ';', ',', 'TT.MM.JJJJ', 20
);

-- 3) DATEV Lohn und Gehalt — Bewegungsdaten
INSERT INTO system_export_templates (
    name, description, target_system, template_body, output_filename,
    encoding, line_ending, field_separator, decimal_separator, date_format, sort_order
) VALUES (
    'DATEV Lohn und Gehalt — Bewegungsdaten',
    'DATEV Lohn und Gehalt (LuG) — Bewegungsdaten. Ähnlich LODAS, verwendet aber Ziel=LUG und 4-stellige Lohnarten.',
    'datev_lug',
$liquid${%- comment -%}
  DATEV Lohn und Gehalt (LuG) — Bewegungsdaten
{%- endcomment -%}
[Allgemein]
Ziel=LUG
Version_SST=1.0
BeraterNr={{ exportInterface.beraterNr }}
MandantenNr={{ exportInterface.mandantNumber }}
Datumsformat={{ template.dateFormat }}
Feldtrennzeichen={{ template.fieldSeparator }}
Zahlenkomma={{ template.decimalSeparator }}

[Bewegungsdaten]
{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- assign val = employee.monthlyValues[wage.terpSource] -%}
{%- if val and val != 0 -%}
{{ employee.personnelNumber }};{{ period.ddmmyyyy }};{{ val | datev_decimal: 2 }};{{ wage.code | pad_left: 4, "0" }};{{ employee.costCenter }}
{% endif -%}
{%- endfor -%}
{%- endfor -%}
$liquid$,
    'LUG_{{ period.year }}{{ period.monthPadded }}.txt',
    'windows-1252', 'crlf', ';', ',', 'TT.MM.JJJJ', 30
);

-- 4) Lexware Lohn+Gehalt — Standard (CSV, UTF-8 BOM)
INSERT INTO system_export_templates (
    name, description, target_system, template_body, output_filename,
    encoding, line_ending, field_separator, decimal_separator, date_format, sort_order
) VALUES (
    'Lexware Lohn+Gehalt — Standard',
    'Lexware Lohn+Gehalt CSV-Import. UTF-8 mit BOM, Semikolon-getrennt.',
    'lexware',
$liquid${%- comment -%}
  Lexware Lohn+Gehalt Standardvorlage
{%- endcomment -%}
Personalnummer;Nachname;Vorname;Lohnart;Wert;Zeitraum;Kostenstelle
{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- assign val = employee.monthlyValues[wage.terpSource] -%}
{%- if val and val != 0 %}
{{ employee.personnelNumber }};{{ employee.lastName | datev_string }};{{ employee.firstName | datev_string }};{{ wage.code }};{{ val | datev_decimal: 2 }};{{ period.ddmmyyyy }};{{ employee.costCenter }}
{%- endif -%}
{%- endfor -%}
{%- endfor -%}
$liquid$,
    'lexware_lohn_{{ period.year }}{{ period.monthPadded }}.csv',
    'utf-8-bom', 'crlf', ';', ',', 'TT.MM.JJJJ', 40
);

-- 5) SAGE HR — Standard (CSV, UTF-8)
INSERT INTO system_export_templates (
    name, description, target_system, template_body, output_filename,
    encoding, line_ending, field_separator, decimal_separator, date_format, sort_order
) VALUES (
    'SAGE HR — Standard',
    'SAGE HR CSV-Importformat. UTF-8 ohne BOM.',
    'sage',
$liquid${%- comment -%}
  SAGE HR Standardvorlage
{%- endcomment -%}
EmpNo;LastName;FirstName;WageType;Amount;Period;CostCenter
{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- assign val = employee.monthlyValues[wage.terpSource] -%}
{%- if val and val != 0 %}
{{ employee.personnelNumber }};{{ employee.lastName }};{{ employee.firstName }};{{ wage.code }};{{ val | datev_decimal: 2 }};{{ period.year }}-{{ period.monthPadded }};{{ employee.costCenter }}
{%- endif -%}
{%- endfor -%}
{%- endfor -%}
$liquid$,
    'sage_hr_{{ period.year }}{{ period.monthPadded }}.csv',
    'utf-8', 'lf', ';', '.', 'TT.MM.JJJJ', 50
);

-- 6) Generische CSV — Standard
INSERT INTO system_export_templates (
    name, description, target_system, template_body, output_filename,
    encoding, line_ending, field_separator, decimal_separator, date_format, sort_order
) VALUES (
    'Generische CSV — Standard',
    'Universelle CSV-Vorlage mit allen verfügbaren Feldern — für eigene Auswertungen oder als Ausgangspunkt für neue Formate.',
    'custom',
$liquid${%- comment -%}
  Generische CSV Standardvorlage
  Enthält alle monatlichen Werte und Lohnarten pro Mitarbeiter.
{%- endcomment -%}
Personalnummer;Nachname;Vorname;Lohnart-Code;Lohnart-Name;Kategorie;Wert;Zeitraum;Kostenstelle
{%- for employee in employees -%}
{%- for wage in payrollWages -%}
{%- assign val = employee.monthlyValues[wage.terpSource] -%}
{%- if val and val != 0 %}
{{ employee.personnelNumber }};{{ employee.lastName }};{{ employee.firstName }};{{ wage.code }};{{ wage.name }};{{ wage.category }};{{ val | datev_decimal: 2 }};{{ period.year }}-{{ period.monthPadded }};{{ employee.costCenter }}
{%- endif -%}
{%- endfor -%}
{%- endfor -%}
$liquid$,
    'export_{{ period.year }}{{ period.monthPadded }}.csv',
    'utf-8', 'lf', ';', ',', 'TT.MM.JJJJ', 60
);
