-- ═══════════════════════════════════════════════════
-- LOOKUP-TABELLEN (global, nicht mandantenspezifisch)
-- ═══════════════════════════════════════════════════

-- Krankenkassen-Stammdaten
CREATE TABLE health_insurance_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    institution_code VARCHAR(9) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(institution_code)
);

-- Personengruppenschlüssel
CREATE TABLE personnel_group_codes (
    code VARCHAR(3) PRIMARY KEY,
    description TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- KldB 2010 Tätigkeitsschlüssel (5-Steller-Ebene)
CREATE TABLE activity_codes_kldb (
    code VARCHAR(5) PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    category VARCHAR(100),
    is_active BOOLEAN DEFAULT true
);
CREATE INDEX idx_activity_codes_kldb_name ON activity_codes_kldb USING gin(to_tsvector('german', name));

-- Berufsgenossenschaften
CREATE TABLE bg_institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    abbreviation VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- ═══════════════════════════════════════════════════
-- STEUERLICHE DATEN
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN tax_id TEXT;
ALTER TABLE employees ADD COLUMN tax_class SMALLINT;
ALTER TABLE employees ADD COLUMN tax_factor DECIMAL(5,4);
ALTER TABLE employees ADD COLUMN child_tax_allowance DECIMAL(4,2);
ALTER TABLE employees ADD COLUMN denomination VARCHAR(3);
ALTER TABLE employees ADD COLUMN spouse_denomination VARCHAR(3);
ALTER TABLE employees ADD COLUMN payroll_tax_allowance DECIMAL(10,2);
ALTER TABLE employees ADD COLUMN payroll_tax_addition DECIMAL(10,2);
ALTER TABLE employees ADD COLUMN is_primary_employer BOOLEAN DEFAULT true;

-- ═══════════════════════════════════════════════════
-- SOZIALVERSICHERUNG
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN social_security_number TEXT;
ALTER TABLE employees ADD COLUMN health_insurance_provider_id UUID REFERENCES health_insurance_providers(id);
ALTER TABLE employees ADD COLUMN health_insurance_status VARCHAR(20);
ALTER TABLE employees ADD COLUMN private_health_insurance_contribution DECIMAL(10,2);
ALTER TABLE employees ADD COLUMN personnel_group_code VARCHAR(3);
ALTER TABLE employees ADD COLUMN contribution_group_code VARCHAR(4);
ALTER TABLE employees ADD COLUMN activity_code VARCHAR(9);
ALTER TABLE employees ADD COLUMN midijob_flag SMALLINT DEFAULT 0;
ALTER TABLE employees ADD COLUMN umlage_u1 BOOLEAN DEFAULT true;
ALTER TABLE employees ADD COLUMN umlage_u2 BOOLEAN DEFAULT true;

-- ═══════════════════════════════════════════════════
-- BANKVERBINDUNG
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN iban TEXT;
ALTER TABLE employees ADD COLUMN bic VARCHAR(11);
ALTER TABLE employees ADD COLUMN account_holder VARCHAR(200);

-- ═══════════════════════════════════════════════════
-- PERSÖNLICHE DATEN (ERGÄNZUNG)
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN birth_name VARCHAR(100);
ALTER TABLE employees ADD COLUMN house_number VARCHAR(20);

-- ═══════════════════════════════════════════════════
-- VERGÜTUNG
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN gross_salary DECIMAL(10,2);
ALTER TABLE employees ADD COLUMN hourly_rate DECIMAL(10,2);
ALTER TABLE employees ADD COLUMN payment_type VARCHAR(20);
ALTER TABLE employees ADD COLUMN salary_group VARCHAR(50);

-- ═══════════════════════════════════════════════════
-- VERTRAGSDATEN (ERGÄNZUNG)
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN contract_type VARCHAR(30);
ALTER TABLE employees ADD COLUMN probation_months SMALLINT;
ALTER TABLE employees ADD COLUMN notice_period_employee VARCHAR(50);
ALTER TABLE employees ADD COLUMN notice_period_employer VARCHAR(50);

-- ═══════════════════════════════════════════════════
-- SCHWERBEHINDERUNG
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN disability_degree SMALLINT;
ALTER TABLE employees ADD COLUMN disability_equal_status BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN disability_markers VARCHAR(20);
ALTER TABLE employees ADD COLUMN disability_id_valid_until DATE;

-- ═══════════════════════════════════════════════════
-- BERUFSGENOSSENSCHAFT
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN bg_institution VARCHAR(200);
ALTER TABLE employees ADD COLUMN bg_membership_number VARCHAR(30);
ALTER TABLE employees ADD COLUMN bg_hazard_tariff VARCHAR(10);

-- ═══════════════════════════════════════════════════
-- STUDENTEN / AZUBI-SPEZIFIKA
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN university VARCHAR(200);
ALTER TABLE employees ADD COLUMN student_id VARCHAR(30);
ALTER TABLE employees ADD COLUMN field_of_study VARCHAR(100);
ALTER TABLE employees ADD COLUMN apprenticeship_occupation VARCHAR(200);
ALTER TABLE employees ADD COLUMN apprenticeship_external_company VARCHAR(200);
ALTER TABLE employees ADD COLUMN vocational_school VARCHAR(200);

-- ═══════════════════════════════════════════════════
-- RENTEN-STATUS
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN receives_old_age_pension BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN receives_disability_pension BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN receives_survivor_pension BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN pension_start_date DATE;

-- ═══════════════════════════════════════════════════
-- STERBEGELD / TODESFALL
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN date_of_death DATE;
ALTER TABLE employees ADD COLUMN heir_name VARCHAR(200);
ALTER TABLE employees ADD COLUMN heir_iban TEXT;

-- ═══════════════════════════════════════════════════
-- ELTERNGELD-STATUS
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN receives_parental_allowance BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN parental_allowance_until DATE;

-- Kommentare
COMMENT ON COLUMN employees.tax_id IS 'Steueridentifikationsnummer (11-stellig), verschlüsselt gespeichert';
COMMENT ON COLUMN employees.social_security_number IS 'Rentenversicherungsnummer (12-stellig), verschlüsselt gespeichert';
COMMENT ON COLUMN employees.iban IS 'IBAN, verschlüsselt gespeichert';
COMMENT ON COLUMN employees.heir_iban IS 'IBAN des Erben (Todesfall), verschlüsselt gespeichert';
COMMENT ON COLUMN employees.tax_factor IS 'Faktor bei Steuerklasse IV mit Faktor (ELStAM)';
COMMENT ON COLUMN employees.spouse_denomination IS 'Konfession Ehepartner für konfessionsverschiedene Ehe (KiSt-Splitting)';
COMMENT ON COLUMN employees.disability_markers IS 'Merkzeichen Schwerbehindertenausweis: G, aG, H, Bl, TBl, RF, 1.Kl., B, GL — kommasepariert';

-- ═══════════════════════════════════════════════════
-- MITARBEITER-BEZOGENE TABELLEN (mandantenspezifisch)
-- ═══════════════════════════════════════════════════

-- Kinder
CREATE TABLE employee_children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    tax_allowance_share DECIMAL(3,1) DEFAULT 0.5,
    lives_in_household BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_children_employee ON employee_children(employee_id);

-- Dienstwagen
CREATE TABLE employee_company_cars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    list_price DECIMAL(10,2) NOT NULL,
    propulsion_type VARCHAR(20) NOT NULL,
    distance_to_work_km DECIMAL(5,1) NOT NULL,
    usage_type VARCHAR(20) NOT NULL,
    license_plate VARCHAR(20),
    make_model VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_company_cars_employee ON employee_company_cars(employee_id);

-- Jobrad
CREATE TABLE employee_job_bikes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    list_price DECIMAL(10,2) NOT NULL,
    usage_type VARCHAR(30) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_job_bikes_employee ON employee_job_bikes(employee_id);

-- Essenszuschuss
CREATE TABLE employee_meal_allowances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    daily_amount DECIMAL(6,2) NOT NULL,
    work_days_per_month DECIMAL(3,1) NOT NULL DEFAULT 20.0,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_meal_allowances_employee ON employee_meal_allowances(employee_id);

-- Sachgutscheine
CREATE TABLE employee_vouchers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    monthly_amount DECIMAL(6,2) NOT NULL,
    provider VARCHAR(200),
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_vouchers_employee ON employee_vouchers(employee_id);

-- Jobticket
CREATE TABLE employee_job_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    monthly_amount DECIMAL(6,2) NOT NULL,
    provider VARCHAR(200),
    is_additional BOOLEAN NOT NULL DEFAULT true,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_job_tickets_employee ON employee_job_tickets(employee_id);

-- Betriebliche Altersvorsorge
CREATE TABLE employee_pensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    execution_type VARCHAR(30) NOT NULL,
    provider_name VARCHAR(200) NOT NULL,
    contract_number VARCHAR(50),
    employee_contribution DECIMAL(10,2) NOT NULL DEFAULT 0,
    employer_contribution DECIMAL(10,2) NOT NULL DEFAULT 0,
    mandatory_employer_subsidy DECIMAL(10,2) NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_pensions_employee ON employee_pensions(employee_id);

-- Vermögenswirksame Leistungen
CREATE TABLE employee_savings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    investment_type VARCHAR(50) NOT NULL,
    recipient VARCHAR(200) NOT NULL,
    recipient_iban TEXT,
    contract_number VARCHAR(20),
    monthly_amount DECIMAL(10,2) NOT NULL,
    employer_share DECIMAL(10,2) NOT NULL DEFAULT 0,
    employee_share DECIMAL(10,2) NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_savings_employee ON employee_savings(employee_id);

-- Pfändungen
CREATE TABLE employee_garnishments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    creditor_name TEXT NOT NULL,
    creditor_address TEXT,
    file_reference TEXT,
    garnishment_amount DECIMAL(10,2) NOT NULL,
    calculation_method VARCHAR(30) NOT NULL,
    dependents_count INT NOT NULL DEFAULT 0,
    rank INT NOT NULL DEFAULT 1,
    is_p_account BOOLEAN DEFAULT false,
    maintenance_obligation BOOLEAN DEFAULT false,
    start_date DATE NOT NULL,
    end_date DATE,
    attachment_file_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_garnishments_employee ON employee_garnishments(employee_id);

-- Elternzeit
CREATE TABLE employee_parental_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,
    child_id UUID REFERENCES employee_children(id),
    is_partner_months BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_parental_leaves_employee ON employee_parental_leaves(employee_id);

-- Mutterschutz
CREATE TABLE employee_maternity_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    expected_birth_date DATE NOT NULL,
    actual_birth_date DATE,
    actual_end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_maternity_leaves_employee ON employee_maternity_leaves(employee_id);

-- Auslandstätigkeit / A1-Entsendung
CREATE TABLE employee_foreign_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    country_code VARCHAR(2) NOT NULL,
    country_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    a1_certificate_number VARCHAR(50),
    a1_valid_from DATE,
    a1_valid_until DATE,
    foreign_activity_exemption BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_foreign_assignments_employee ON employee_foreign_assignments(employee_id);

-- Mehrfachbeschäftigung
CREATE TABLE employee_other_employments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employer_name VARCHAR(200) NOT NULL,
    monthly_income DECIMAL(10,2),
    weekly_hours DECIMAL(5,2),
    is_minijob BOOLEAN DEFAULT false,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_other_employments_employee ON employee_other_employments(employee_id);

-- Index für health_insurance_provider FK
CREATE INDEX idx_employees_health_insurance_provider ON employees(health_insurance_provider_id);
