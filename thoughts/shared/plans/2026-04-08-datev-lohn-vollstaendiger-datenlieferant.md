# DATEV-Lohndaten-Vorbereitung — Implementierungsplan

## Overview

Terp wird zum vollständigen Datenlieferanten für die deutsche Lohnabrechnung (DATEV LODAS / Lohn und Gehalt). Der Steuerberater soll für die monatliche Lohnabrechnung praktisch keine Stamm- und Bewegungsdaten mehr selbst nachpflegen müssen.

**Terp berechnet KEINE Lohnabrechnung.** Keine Brutto-Netto-Berechnung, keine SV-Beitragsberechnung, keine Lohnsteuerermittlung. Terp bleibt ausschließlich Datenvorbereitungs- und Exportsystem.

**Basis:** Research-Dokument `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`

## Current State Analysis

### Employee-Model (prisma/schema.prisma:1445–1563)
- ~40 Felder vorhanden, davon **0 lohnspezifisch**
- Kein IBAN, keine Steuer-ID, keine SV-Nummer, keine Steuerklasse, keine Krankenkasse, kein Gehalt
- Bestehende Felder: firstName, lastName, birthDate, birthPlace, birthCountry, gender, nationality, addressStreet/Zip/City/Country, maritalStatus, religion, disabilityFlag, entryDate, exitDate, weeklyHours, vacationDaysPerYear, etc.

### Bestehender Payroll-Export (src/lib/services/payroll-export-service.ts:134–190)
- Einfache CSV mit 8 Spalten (Personalnummer, Name, Lohnart, Stunden, Tage, Betrag, Kostenstelle)
- Hardcoded Lohnarten: 1000=Sollstunden, 1001=Arbeitsstunden, 1002=Überstunden, 2000=Urlaub, 2001=Krank, 2002=Sonstige
- UTF-8, LF-Zeilenenden, Punkt als Dezimaltrenner
- **Kein echtes DATEV-LODAS-Format** (kein `[Allgemein]`-Header, keine `[Satzbeschreibung]`, kein Windows-1252)

### ExportInterface (prisma/schema.prisma:3230–3252)
- Hat `mandantNumber` (VarChar(50))
- **Keine** `beraterNr`, kein `datevTarget`

### DATEV-Export Eingangsrechnungen (src/lib/services/inbound-invoice-datev-export-service.ts)
- EXTF-Format (Buchungsstapel) — **nicht als Vorlage für LODAS nutzbar**
- Wiederverwendbar: `iconv-lite` (Windows-1252), `formatDecimal()`, `escapeField()`, CRLF-Pattern, Audit-Log-Pattern

### Key Discoveries
- LODAS ASCII ist **kein EXTF-Format** — sektionsbasiertes INI-ähnliches Format (Research B1)
- ExportInterface hat kein `beraterNr`-Feld — muss ergänzt werden
- HrPersonnelFileCategory ist mandantenspezifisch mit 7 Seed-Kategorien (supabase/seed.sql:3606–3617)
- Permission-System: UUID v5 via `p()` Helper in `ALL_PERMISSIONS` Array (src/lib/auth/permission-catalog.ts)
- Employee-Detail-Seite hat 3 Tabs: Overview, Tariff Assignments, Personnel File (src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx:137–221)

## Desired End State

Nach Abschluss aller drei Phasen:
1. Alle lohnrelevanten Stammdaten (Steuer, SV, Bank, Gehalt, Sachbezüge, bAV, VL, Pfändungen, Kinder) sind in Terp erfassbar, validiert und verschlüsselt gespeichert
2. DATEV-konformer ASCII-Export im LODAS- und LuG-Format mit mandantenspezifischem Lohnart-Mapping
3. Massenimport, Gehaltshistorie, Onboarding-Checkliste und Steuerberater-Dokumentation

### Verification
- Generierte DATEV-Datei lässt sich in DATEV LODAS/LuG über `Mandant > Daten übernehmen > ASCII-Import` importieren
- Sensible Felder (IBAN, Steuer-ID, SV-Nr) sind in der Datenbank verschlüsselt (verifizierbar via `SELECT` auf die Spalte)
- Alle neuen Tabs auf der Mitarbeiter-Detailseite sind berechtigungsgesteuert

## What We're NOT Doing

- Brutto-Netto-Berechnung jeglicher Art
- Sozialversicherungsbeitragsberechnung
- Lohnsteuerermittlung
- Schatten-Berechnung oder Vorschau-Lohnabrechnung
- ELStAM-Direktabruf
- DEÜV-Meldungen (SV-An-/Abmeldung, Jahresmeldung)
- A1-Bescheinigungen
- DATEV-API (REST) für Direktanbindung (Stufe 4, braucht Marktplatz-Partnerschaft)
- DATEV Unternehmen Online Integration
- Pfändungs-Berechnung (nur Erfassung der Pfändungsdaten)
- Reisekosten-Erstattung (eigenes Modul)
- Schwerbehinderungs-Detailfelder (GdB-Wert, Merkzeichen) — nur bestehendes `disabilityFlag` bleibt

---

## Architektur-Entscheidung: Verschlüsselung sensibler Felder

### Gewählter Ansatz: Application-Level Encryption mit Node.js `node:crypto`

**Begründung der Wahl:**

| Option | Bewertung |
|---|---|
| **pgsodium** | ❌ Seit Mitte 2024 "pending deprecation" bei Supabase. Supabase empfiehlt keine neue Nutzung. Quelle: [Supabase Docs - pgsodium](https://supabase.com/docs/guides/database/extensions/pgsodium), [GitHub Discussion #27109](https://github.com/orgs/supabase/discussions/27109) |
| **Supabase Vault** | ❌ Primär für Secrets (API-Keys, Tokens), nicht für Anwendungsdaten. Keys werden von Supabase verwaltet — keine Trennung Betreiber/Datenverarbeiter. Kein Bulk-Encryption-Pattern. Quelle: [Supabase Vault Docs](https://supabase.com/docs/guides/database/vault) |
| **CipherStash Protect.js** | ❌ Interessant (searchable encryption), aber externer KMS-Vendor-Lock-in (ZeroKMS ist CipherStash-hosted). Overkill für ~200 Mitarbeiter pro Mandant. |
| **Application-Level (node:crypto)** | ✅ Keine externe Abhängigkeit, FIPS-validated (OpenSSL), volle Kontrolle, dokumentierbar |

**Alle drei Kriterien erfüllt:**
- **(a) DSGVO-audit-tauglich:** Verschlüsselungsalgorithmus, Schlüsselverwaltung und Zugriffsrechte sind dokumentierbar. Schlüssel liegt getrennt von der Datenbank (Umgebungsvariable).
- **(b) Key-Rotation:** Versionsbasiert — jeder verschlüsselte Wert trägt die Schlüsselversion. Neue Daten werden mit dem aktuellen Schlüssel verschlüsselt. Alte Daten bleiben mit dem alten Schlüssel lesbar, bis sie migriert werden.
- **(c) Re-Encryption ohne Downtime:** Hintergrund-Migration liest mit altem Schlüssel, schreibt mit neuem Schlüssel, Record für Record.

### Technische Spezifikation

**Algorithmus:** AES-256-GCM (authenticated encryption)
**Bibliothek:** `node:crypto` (built-in, keine externe Dependency)
**Schlüssellänge:** 256 Bit (32 Bytes)

**Speicherformat eines verschlüsselten Feldes (String in PostgreSQL):**
```
v{version}:{iv_base64}:{authTag_base64}:{ciphertext_base64}
```
Beispiel: `v1:abc123...:def456...:ghi789...`

**Key-Management:**
- KEK (Key Encryption Key) als Umgebungsvariable: `FIELD_ENCRYPTION_KEY_V1=<base64-encoded 32-byte key>`
- Bei Rotation: `FIELD_ENCRYPTION_KEY_V2=<new key>`, `FIELD_ENCRYPTION_KEY_CURRENT_VERSION=2`
- Alte Keys bleiben verfügbar zum Lesen, neue Keys werden zum Schreiben verwendet
- In Produktion: Vercel Environment Variables (encrypted at rest by Vercel)

**Neue Datei:** `src/lib/services/field-encryption.ts`

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16

interface EncryptionKey {
  version: number
  key: Buffer
}

function getKeys(): EncryptionKey[] {
  // Load all key versions from env
  // FIELD_ENCRYPTION_KEY_V1, V2, etc.
}

function getCurrentKey(): EncryptionKey {
  // Return key with version = FIELD_ENCRYPTION_KEY_CURRENT_VERSION
}

export function encryptField(plaintext: string): string {
  const { version, key } = getCurrentKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `v${version}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`
}

export function decryptField(ciphertext: string): string {
  const [versionStr, ivB64, authTagB64, encryptedB64] = ciphertext.split(":")
  const version = parseInt(versionStr.slice(1))
  const key = getKeys().find(k => k.version === version)
  if (!key) throw new Error(`Encryption key version ${version} not found`)
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")
  const encrypted = Buffer.from(encryptedB64, "base64")
  const decipher = createDecipheriv(ALGORITHM, key.key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted) + decipher.final("utf8")
}

export function isEncrypted(value: string): boolean {
  return /^v\d+:/.test(value)
}

// For exact-match lookups: HMAC-SHA256 hash of plaintext with current key
export function hashField(plaintext: string): string {
  // Used for building a searchable hash index (exact match only)
}
```

**Prisma-Schema-Konvention:** Verschlüsselte Felder werden als `String @db.Text` gespeichert (Ciphertext ist länger als Plaintext). Im Service-Layer wird vor dem Schreiben `encryptField()` aufgerufen, nach dem Lesen `decryptField()`. Kein Prisma-Middleware-Magic — explizit im Service.

**Suchen/Filtern auf verschlüsselten Feldern:** Nicht möglich (kein LIKE, kein Range-Query). Für exakte Vergleiche (z.B. "finde Mitarbeiter mit IBAN X") kann ein HMAC-Hash-Index-Feld ergänzt werden (`ibanHash`). Für Phase 1 wird kein Suchen auf verschlüsselten Feldern benötigt — die Felder werden nur angezeigt und bearbeitet.

**Felder die verschlüsselt werden:**
- `Employee.taxId`
- `Employee.socialSecurityNumber`
- `Employee.iban`
- `EmployeeSavings.recipientIban`
- `EmployeeGarnishment.creditorName` (optional, aber sensibel)
- `EmployeeGarnishment.fileReference` (optional)

---

## Phase 1: Fundament (Stammdaten-Erweiterung)

### Overview
Alle lohnrelevanten Stammdaten können in Terp erfasst, validiert und sicher gespeichert werden. Noch kein DATEV-Export. Nach Phase 1 ist das System produktiv nutzbar für die Stammdatenpflege.

**Geschätzter Aufwand: 12–15 Implementierungstage**

---

### 1.1 Verschlüsselungs-Utility

**Neue Datei:** `src/lib/services/field-encryption.ts`

Wie oben spezifiziert. Funktionen: `encryptField`, `decryptField`, `isEncrypted`, `hashField`.

**Neue Datei:** `src/lib/services/__tests__/field-encryption.test.ts`

Tests:
- Encrypt → Decrypt Round-Trip
- Verschiedene Schlüsselversionen
- Ungültiger Schlüssel → Fehler
- Leerer String
- Unicode-Zeichen (Umlaute)
- `isEncrypted` erkennt verschlüsselte und unverschlüsselte Werte

**Neue Umgebungsvariable:** `FIELD_ENCRYPTION_KEY_V1` (32 Bytes, base64-encoded)
- In `.env.local` für Entwicklung: fester Test-Key
- In Vercel: generierter Production-Key
- Dokumentation in `src/lib/config.ts` unter `serverEnv`

---

### 1.2 Database Migration — Employee-Tabelle erweitern

**Neue Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_payroll_fields_to_employee.sql`

```sql
-- Steuerliche Daten
ALTER TABLE employees ADD COLUMN tax_id TEXT;                    -- verschlüsselt
ALTER TABLE employees ADD COLUMN social_security_number TEXT;    -- verschlüsselt
ALTER TABLE employees ADD COLUMN tax_class SMALLINT;             -- 1-6
ALTER TABLE employees ADD COLUMN child_tax_allowance DECIMAL(4,2);  -- z.B. 1.5
ALTER TABLE employees ADD COLUMN denomination VARCHAR(3);        -- ev, rk, la, er, lt, rf, fg, fr, fs, fa, ak, ib, jd
ALTER TABLE employees ADD COLUMN payroll_tax_allowance DECIMAL(10,2);  -- ELStAM-Freibetrag
ALTER TABLE employees ADD COLUMN payroll_tax_addition DECIMAL(10,2);   -- ELStAM-Hinzurechnung

-- Sozialversicherung
ALTER TABLE employees ADD COLUMN health_insurance_provider_id UUID REFERENCES health_insurance_providers(id);
ALTER TABLE employees ADD COLUMN health_insurance_status VARCHAR(20);  -- mandatory, voluntary, private
ALTER TABLE employees ADD COLUMN private_health_insurance_contribution DECIMAL(10,2);
ALTER TABLE employees ADD COLUMN personnel_group_code VARCHAR(3);     -- 3-stellig (101, 102, etc.)
ALTER TABLE employees ADD COLUMN contribution_group_code VARCHAR(4);  -- 4-stellig (1111, 6500, etc.)
ALTER TABLE employees ADD COLUMN activity_code VARCHAR(9);            -- 9-stellig KldB 2010

-- Bankverbindung
ALTER TABLE employees ADD COLUMN iban TEXT;                      -- verschlüsselt
ALTER TABLE employees ADD COLUMN bic VARCHAR(11);
ALTER TABLE employees ADD COLUMN account_holder VARCHAR(200);

-- Beschäftigung
ALTER TABLE employees ADD COLUMN is_primary_employer BOOLEAN DEFAULT true;
ALTER TABLE employees ADD COLUMN birth_name VARCHAR(100);
ALTER TABLE employees ADD COLUMN house_number VARCHAR(20);

-- Vergütung
ALTER TABLE employees ADD COLUMN gross_salary DECIMAL(10,2);
ALTER TABLE employees ADD COLUMN hourly_rate DECIMAL(10,2);
ALTER TABLE employees ADD COLUMN payment_type VARCHAR(20);       -- monthly_salary, hourly_wage, commission

-- Sonderregelungen
ALTER TABLE employees ADD COLUMN midijob_flag SMALLINT DEFAULT 0;  -- 0, 1, 2
```

**Hinweis:** `health_insurance_provider_id` wird als FK definiert. Die Tabelle `health_insurance_providers` muss in der gleichen Migration VOR den Employee-Änderungen erstellt werden (siehe 1.3).

---

### 1.3 Database Migration — Neue Tabellen

**Gleiche oder separate Migration:**

```sql
-- Krankenkassen-Stammdaten
CREATE TABLE health_insurance_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    institution_code VARCHAR(9) NOT NULL,  -- IK-Nummer (9-stellig)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(institution_code)
);

-- Personengruppenschlüssel
CREATE TABLE personnel_group_codes (
    code VARCHAR(3) PRIMARY KEY,           -- z.B. '101'
    description TEXT NOT NULL,             -- z.B. 'Sozialversicherungspflichtiger Arbeitnehmer'
    is_active BOOLEAN DEFAULT true
);

-- Kinder
CREATE TABLE employee_children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    tax_allowance_share DECIMAL(3,1) DEFAULT 0.5,  -- z.B. 0.5 oder 1.0
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_children_employee ON employee_children(employee_id);

-- Dienstwagen
CREATE TABLE employee_company_cars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    list_price DECIMAL(10,2) NOT NULL,           -- Bruttolistenpreis
    propulsion_type VARCHAR(20) NOT NULL,        -- combustion, hybrid, electric
    distance_to_work_km DECIMAL(5,1) NOT NULL,   -- Entfernung Wohnung-Arbeit
    usage_type VARCHAR(20) NOT NULL,             -- private_use, commute_only
    start_date DATE NOT NULL,
    end_date DATE,
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
    usage_type VARCHAR(30) NOT NULL,             -- salary_conversion, additional
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
    monthly_amount DECIMAL(6,2) NOT NULL,        -- max 50 EUR
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
    is_additional BOOLEAN NOT NULL DEFAULT true, -- zusätzlich zum Lohn = steuerfrei
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
    execution_type VARCHAR(30) NOT NULL,         -- direct_insurance, pension_fund, pension_scheme, direct_commitment, support_fund
    provider_name VARCHAR(200) NOT NULL,
    contract_number VARCHAR(50),
    employee_contribution DECIMAL(10,2) NOT NULL DEFAULT 0,
    employer_contribution DECIMAL(10,2) NOT NULL DEFAULT 0,
    mandatory_employer_subsidy DECIMAL(10,2) NOT NULL DEFAULT 0,  -- 15% Pflicht-AG-Zuschuss
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
    investment_type VARCHAR(50) NOT NULL,         -- building_savings, fund_savings, bank_savings
    recipient VARCHAR(200) NOT NULL,
    recipient_iban TEXT,                          -- verschlüsselt
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
    creditor_name TEXT NOT NULL,                  -- verschlüsselt
    creditor_address TEXT,
    file_reference TEXT,                          -- verschlüsselt
    garnishment_amount DECIMAL(10,2) NOT NULL,
    calculation_method VARCHAR(30) NOT NULL,      -- fixed_amount, table_based
    dependents_count INT NOT NULL DEFAULT 0,
    rank INT NOT NULL DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE,
    attachment_file_id UUID,                      -- FK zu HrPersonnelFileAttachment (optional)
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
    actual_end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_maternity_leaves_employee ON employee_maternity_leaves(employee_id);
```

---

### 1.4 Prisma-Schema aktualisieren

**Datei:** `prisma/schema.prisma`

Alle neuen Spalten und Tabellen aus 1.2 und 1.3 im Prisma-Schema ergänzen. Folgt den bestehenden Konventionen:
- `@map("snake_case")` für Spalten, `@@map("table_name")` für Tabellen
- `@db.Decimal(x,y)` für Dezimalfelder
- `@db.Text` für verschlüsselte Felder
- `@db.VarChar(n)` für String-Felder mit Längenbeschränkung
- Relations mit `onDelete: Cascade` für Employee-FK

Neue Models hinzufügen:
- `HealthInsuranceProvider`
- `PersonnelGroupCode`
- `EmployeeChild`
- `EmployeeCompanyCar`
- `EmployeeJobBike`
- `EmployeeMealAllowance`
- `EmployeeVoucher`
- `EmployeeJobTicket`
- `EmployeePension`
- `EmployeeSavings`
- `EmployeeGarnishment`
- `EmployeeParentalLeave`
- `EmployeeMaternityLeave`

Auf dem `Employee`-Model:
- Alle neuen Spalten aus 1.2 als Felder
- Relations zu allen neuen Tabellen (1:n)
- Relation zu `HealthInsuranceProvider` (n:1)

Nach Schema-Änderung: `pnpm db:generate` ausführen.

---

### 1.5 Stammdaten seeden

**Datei:** `supabase/seed.sql` (am Ende anfügen)

#### 1.5.1 Krankenkassen (HealthInsuranceProvider)

Quelle: ITSG Stammdatendatei (XML, täglich aktualisiert, Download: [download.gkv-ag.de](https://download.gkv-ag.de/)). Enthält IK-Nummer, Name, Zusatzbeitragssatz. Alternativ: GKV-Spitzenverband Krankenkassenliste ([gkv-spitzenverband.de](https://www.gkv-spitzenverband.de/service/krankenkassenliste/krankenkassen.jsp), nur als PDF).

**Für den Seed:** Die ~95 aktuell existierenden gesetzlichen Krankenkassen manuell aus der GKV-Liste übernehmen. Felder: `name`, `institution_code` (IK-Nummer, 9-stellig).

Beispiel-Einträge:
```sql
INSERT INTO health_insurance_providers (id, name, institution_code) VALUES
  (gen_random_uuid(), 'AOK Baden-Württemberg', '108018007'),
  (gen_random_uuid(), 'AOK Bayern', '108310400'),
  (gen_random_uuid(), 'AOK Hessen', '105312437'),
  (gen_random_uuid(), 'AOK Niedersachsen', '102114875'),
  (gen_random_uuid(), 'AOK Nordost', '100696006'),
  (gen_random_uuid(), 'AOK Nordwest', '103411401'),
  (gen_random_uuid(), 'AOK Plus', '107299005'),
  (gen_random_uuid(), 'AOK Rheinland/Hamburg', '104212505'),
  (gen_random_uuid(), 'AOK Sachsen-Anhalt', '101097008'),
  (gen_random_uuid(), 'BARMER', '104940005'),
  (gen_random_uuid(), 'DAK-Gesundheit', '105815527'),
  (gen_random_uuid(), 'HEK - Hanseatische Krankenkasse', '100589432'),
  (gen_random_uuid(), 'hkk Krankenkasse', '102093036'),
  (gen_random_uuid(), 'IKK classic', '107203670'),
  (gen_random_uuid(), 'IKK gesund plus', '101090001'),
  (gen_random_uuid(), 'IKK Südwest', '106593756'),
  (gen_random_uuid(), 'KKH Kaufmännische Krankenkasse', '102111276'),
  (gen_random_uuid(), 'Knappschaft', '980000001'),
  (gen_random_uuid(), 'Techniker Krankenkasse', '101575519'),
  -- ... vollständige Liste (~95 Kassen) aus GKV-Spitzenverband PDF extrahieren
  (gen_random_uuid(), 'Minijob-Zentrale', '980000009');  -- Einzugsstelle für Minijobs
```

**Hinweis:** Die vollständige Liste muss manuell aus dem GKV-Spitzenverband PDF oder der ITSG-Stammdatendatei (XML) extrahiert werden. Die IK-Nummern sind die Institutionskennzeichen, nicht Betriebsnummern. In der Implementierung die ~95 aktiven Kassen einfügen.

#### 1.5.2 Personengruppenschlüssel

Quelle: [DEÜV Anlage 2, Version 8.01](https://www.gkv-datenaustausch.de/media/dokumente/arbeitgeber/deuev/rundschreiben_anlagen/03_Anlage_2_Vers._8.01.pdf) (PDF, selten aktualisiert)

```sql
INSERT INTO personnel_group_codes (code, description) VALUES
  ('101', 'Sozialversicherungspflichtig Beschäftigte ohne besondere Merkmale'),
  ('102', 'Auszubildende'),
  ('103', 'Beschäftigte in Altersteilzeit'),
  ('104', 'Hausgewerbetreibende'),
  ('105', 'Praktikanten'),
  ('106', 'Werkstudenten'),
  ('107', 'Behinderte in anerkannten Werkstätten'),
  ('108', 'Bezieher von Vorruhestandsgeld'),
  ('109', 'Geringfügig entlohnte Beschäftigte (Minijob)'),
  ('110', 'Kurzfristig Beschäftigte'),
  ('111', 'Personen in Einrichtungen der Jugendhilfe'),
  ('112', 'Mitarbeitende Familienangehörige in der Landwirtschaft'),
  ('113', 'Nebenerwerbslandwirte'),
  ('114', 'Nebenerwerbslandwirte — saisonal'),
  ('116', 'Ausländische Grenzgänger'),
  ('117', 'Beschäftigte ohne Anspruch auf Krankengeld'),
  ('118', 'Seelotsen'),
  ('119', 'Versicherungsfreie Altersvollrentner und Versorgungsbezieher'),
  ('120', 'Beschäftigte mit Anspruch auf Alters-/Erwerbsminderungsrente'),
  ('190', 'Beschäftigte ohne Zuordnung zu einem anderen Personengruppenschlüssel');
```

#### 1.5.3 Personalakte-Kategorien erweitern

Neue Kategorien zum bestehenden Seed hinzufügen (nach den 7 existierenden):

```sql
INSERT INTO hr_personnel_file_categories (id, tenant_id, name, code, color, sort_order, visible_to_roles) VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Sozialversicherungsausweis', 'SV_AUSWEIS', '#0891B2', 8, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Mitgliedsbescheinigung Krankenkasse', 'KK_BESCHEINIGUNG', '#0D9488', 9, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Lohnsteuerbescheinigung Vorjahr', 'LOHNSTEUER_VORJAHR', '#4F46E5', 10, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Kopie Personalausweis', 'PERSONALAUSWEIS', '#7C3AED', 11, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Aufenthaltstitel', 'AUFENTHALT', '#DB2777', 12, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Schwerbehindertenausweis', 'SB_AUSWEIS', '#E11D48', 13, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Pfändungsbeschluss', 'PFAENDUNG', '#DC2626', 14, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'bAV-Vertrag', 'BAV_VERTRAG', '#EA580C', 15, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Arbeitsvertrag', 'ARBEITSVERTRAG', '#CA8A04', 16, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Nachweisgesetz-Dokument', 'NACHWEIS', '#65A30D', 17, ARRAY['admin', 'hr']);
```

**Hinweis:** Diese Seed-Daten sind für den Dev-Tenant. Für neue Mandanten in Produktion müssen die Kategorien beim Tenant-Onboarding erstellt werden (via existierenden HrPersonnelFileCategory-CRUD oder Tenant-Setup-Script).

---

### 1.6 Validierungen

**Neue Datei:** `src/lib/services/payroll-validators.ts`

```typescript
// IBAN-Validierung: Format + MOD-97 Prüfsumme (ISO 13616)
export function validateIban(iban: string): { valid: boolean; error?: string }

// Sozialversicherungsnummer: 12-stellig, Prüfziffer-Algorithmus
// Faktoren: 2,1,2,5,7,1,2,1,2,1,2,1; Quersummen; Mod 10
export function validateSocialSecurityNumber(ssn: string): { valid: boolean; error?: string }

// Steuer-Identifikationsnummer: 11-stellig, Mod-10/Mod-11 (BZSt-Spezifikation)
export function validateTaxId(taxId: string): { valid: boolean; error?: string }

// Beitragsgruppenschlüssel: 4-stellig
// Pos. 1 (KV): 0,1,3,4,5,6,9
// Pos. 2 (RV): 0,1,3,5
// Pos. 3 (AV): 0,1,2
// Pos. 4 (PV): 0,1,2
export function validateContributionGroupCode(code: string): { valid: boolean; error?: string }

// Tätigkeitsschlüssel: 9-stellig
// Pos. 1-5: KldB 2010 Berufsklasse
// Pos. 6: Schulbildung (1-4, 9)
// Pos. 7: Berufsbildung (1-6, 9)
// Pos. 8: Leiharbeit (1-2)
// Pos. 9: Vertragsform (1-4)
export function validateActivityCode(code: string): { valid: boolean; error?: string }

// Steuerklasse: 1-6
export function validateTaxClass(taxClass: number): { valid: boolean; error?: string }

// Geburtsdatum: nicht in Zukunft, nicht > 120 Jahre alt
export function validateBirthDate(birthDate: Date): { valid: boolean; error?: string }

// Eintrittsdatum vs. Geburtsdatum: mindestens 15 Jahre Differenz
export function validateEntryVsBirthDate(entryDate: Date, birthDate: Date): { valid: boolean; error?: string }

// Personengruppenschlüssel: Lookup gegen bekannte Codes
export function validatePersonnelGroupCode(code: string): { valid: boolean; error?: string }
```

**Validierungsalgorithmen im Detail:**

**IBAN (ISO 13616):**
1. Leerzeichen entfernen, Großbuchstaben
2. Länge prüfen (DE = 22 Zeichen)
3. Erste 4 Zeichen ans Ende verschieben
4. Buchstaben durch Zahlen ersetzen (A=10, B=11, ..., Z=35)
5. Modulo 97 berechnen, Ergebnis muss 1 sein

**Steuer-ID (BZSt):**
1. Genau 11 Ziffern
2. Erste Ziffer ≠ 0
3. In den ersten 10 Ziffern: genau eine Ziffer kommt doppelt vor, eine fehlt
4. Prüfziffer (11. Stelle): Mod-10/Mod-11-Verfahren

**SV-Nummer:**
1. Genau 12 Zeichen (Stellen 1-2: Bereichsnummer, 3-8: Geburtsdatum TTMMJJ, 9: Anfangsbuchstabe Geburtsname, 10-11: Seriennummer, 12: Prüfziffer)
2. Stelle 9 ist ein Buchstabe
3. Prüfziffer: Faktoren-Algorithmus mit Quersummenbildung

**Test-Datei:** `src/lib/services/__tests__/payroll-validators.test.ts`

Tests für jeden Validator mit:
- Gültige Eingaben (echte Format-Beispiele, KEINE echten Personendaten)
- Ungültige Prüfziffer
- Zu kurz / zu lang
- Ungültige Zeichen
- Grenzfälle (leerer String, null)

---

### 1.7 Berechtigungen

**Datei:** `src/lib/auth/permission-catalog.ts`

Neue Einträge im `ALL_PERMISSIONS` Array:

```typescript
// Personnel payroll data
p("personnel.payroll_data.view", "personnel", "payroll_data.view", "View employee payroll master data (tax, social security, bank details)"),
p("personnel.payroll_data.edit", "personnel", "payroll_data.edit", "Edit employee payroll master data"),
p("personnel.garnishment.view", "personnel", "garnishment.view", "View employee garnishment data"),
p("personnel.garnishment.edit", "personnel", "garnishment.edit", "Edit employee garnishment data"),
```

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_payroll_data_permissions.sql`

Permissions in die `permissions`-Tabelle einfügen (UUIDs werden deterministisch aus den Keys generiert, genau wie in permission-catalog.ts). Die Migration muss die gleiche UUID-Generierung verwenden wie der Code (UUID v5 mit Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`).

Standard-Zuweisung an Rollen:
- `admin`-Gruppe: alle 4 neuen Permissions
- `hr`-Gruppe: `personnel.payroll_data.view`, `personnel.payroll_data.edit` (keine Pfändungen)
- Alle anderen: keine

**Test:** `src/trpc/routers/__tests__/permission-catalog.test.ts` — bestehenden Test erweitern, prüfen dass die neuen Permissions in `ALL_PERMISSIONS` enthalten sind und eindeutige IDs haben.

---

### 1.8 Service Layer — Employee Payroll Data

#### 1.8.1 Employee Service erweitern

**Datei:** `src/lib/services/employees-service.ts`

`update()` Funktion erweitern um die neuen Felder. Dabei:
- Verschlüsselung für `taxId`, `socialSecurityNumber`, `iban` vor dem Schreiben
- Validierung der neuen Felder (Validator-Aufrufe aus payroll-validators.ts)
- Audit-Log: neue Felder in `fieldsToTrack` aufnehmen
- **Wichtig:** Verschlüsselte Felder werden im Audit-Log NICHT im Klartext geloggt — nur `{ old: "***", new: "***" }` oder `{ old: null, new: "[encrypted]" }`

**Datei:** `src/lib/services/employees-repository.ts`

`findByIdWithRelations()` erweitern um die neuen Relations:
- `healthInsuranceProvider`
- `children`
- `companyCars`
- `jobBikes`
- `mealAllowances`
- `vouchers`
- `jobTickets`
- `pensions`
- `savings`
- `garnishments`
- `parentalLeaves`
- `maternityLeaves`

Entschlüsselung im Service-Layer (nicht im Repository) nach dem Lesen.

#### 1.8.2 Neue Sub-Domain Services (je Service + Repository + Hook)

Für jede neue Tabelle ein Service/Repository-Paar nach dem bestehenden Pattern (vgl. `employee-contacts-service.ts` / `employee-contacts-repository.ts`):

| Service-Datei | Repository-Datei | Tabelle |
|---|---|---|
| `employee-children-service.ts` | `employee-children-repository.ts` | `EmployeeChild` |
| `employee-company-cars-service.ts` | `employee-company-cars-repository.ts` | `EmployeeCompanyCar` |
| `employee-job-bikes-service.ts` | `employee-job-bikes-repository.ts` | `EmployeeJobBike` |
| `employee-meal-allowances-service.ts` | `employee-meal-allowances-repository.ts` | `EmployeeMealAllowance` |
| `employee-vouchers-service.ts` | `employee-vouchers-repository.ts` | `EmployeeVoucher` |
| `employee-job-tickets-service.ts` | `employee-job-tickets-repository.ts` | `EmployeeJobTicket` |
| `employee-pensions-service.ts` | `employee-pensions-repository.ts` | `EmployeePension` |
| `employee-savings-service.ts` | `employee-savings-repository.ts` | `EmployeeSavings` |
| `employee-garnishments-service.ts` | `employee-garnishments-repository.ts` | `EmployeeGarnishment` |
| `employee-parental-leaves-service.ts` | `employee-parental-leaves-repository.ts` | `EmployeeParentalLeave` |
| `employee-maternity-leaves-service.ts` | `employee-maternity-leaves-repository.ts` | `EmployeeMaternityLeave` |

Jeder Service implementiert: `list(prisma, tenantId, employeeId)`, `getById(...)`, `create(...)`, `update(...)`, `remove(...)` mit Audit-Log.

Services die verschlüsselte Felder haben (`employee-savings-service.ts`, `employee-garnishments-service.ts`) rufen `encryptField()` / `decryptField()` im Service auf.

---

### 1.9 tRPC Router

#### 1.9.1 Employee Router erweitern

**Datei:** `src/trpc/routers/employees.ts`

- `getById` Output-Schema erweitern um alle neuen Felder (nach Entschlüsselung)
- `create` und `update` Input-Schemas erweitern um alle neuen Felder
- **Berechtigungsprüfung:** Payroll-Felder (taxId, socialSecurityNumber, iban, etc.) nur setzen/lesen wenn `personnel.payroll_data.edit` / `personnel.payroll_data.view` berechtigt
- Im `getById` Response: Payroll-Felder nur mitliefern wenn der Benutzer `personnel.payroll_data.view` hat, sonst `null`

#### 1.9.2 Neue Sub-Router

Für jede neue Tabelle ein tRPC-Router nach dem Pattern von `employeeContacts.ts`:

| Router-Datei | Procedures |
|---|---|
| `employeeChildren.ts` | `list`, `create`, `update`, `delete` |
| `employeeCompanyCars.ts` | `list`, `create`, `update`, `delete` |
| `employeeJobBikes.ts` | `list`, `create`, `update`, `delete` |
| `employeeMealAllowances.ts` | `list`, `create`, `update`, `delete` |
| `employeeVouchers.ts` | `list`, `create`, `update`, `delete` |
| `employeeJobTickets.ts` | `list`, `create`, `update`, `delete` |
| `employeePensions.ts` | `list`, `create`, `update`, `delete` |
| `employeeSavings.ts` | `list`, `create`, `update`, `delete` |
| `employeeGarnishments.ts` | `list`, `create`, `update`, `delete` |
| `employeeParentalLeaves.ts` | `list`, `create`, `update`, `delete` |
| `employeeMaternityLeaves.ts` | `list`, `create`, `update`, `delete` |

**Berechtigungen:**
- `employeeChildren`, `employeeCompanyCars`, `employeeJobBikes`, `employeeMealAllowances`, `employeeVouchers`, `employeeJobTickets`, `employeePensions`, `employeeSavings`, `employeeParentalLeaves`, `employeeMaternityLeaves`: `personnel.payroll_data.view` / `personnel.payroll_data.edit`
- `employeeGarnishments`: `personnel.garnishment.view` / `personnel.garnishment.edit`

Alle Router im Root-Router `src/trpc/routers/_app.ts` registrieren.

---

### 1.10 Frontend Hooks

**Neue Hook-Dateien** (eine pro Sub-Domain, nach dem Pattern von `use-employee-contacts.ts`):

| Hook-Datei | Exports |
|---|---|
| `use-employee-children.ts` | `useEmployeeChildren`, `useCreateEmployeeChild`, `useUpdateEmployeeChild`, `useDeleteEmployeeChild` |
| `use-employee-company-cars.ts` | `useEmployeeCompanyCars`, `useCreateEmployeeCompanyCar`, ... |
| `use-employee-job-bikes.ts` | analog |
| `use-employee-meal-allowances.ts` | analog |
| `use-employee-vouchers.ts` | analog |
| `use-employee-job-tickets.ts` | analog |
| `use-employee-pensions.ts` | analog |
| `use-employee-savings.ts` | analog |
| `use-employee-garnishments.ts` | analog |
| `use-employee-parental-leaves.ts` | analog |
| `use-employee-maternity-leaves.ts` | analog |
| `use-health-insurance-providers.ts` | `useHealthInsuranceProviders` (Lookup-Liste für Dropdown) |

Alle Hooks in `src/hooks/index.ts` re-exportieren.

---

### 1.11 UI — Mitarbeiter-Detailseite

**Datei:** `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

Bestehende Tabs bleiben unverändert (Overview, Tariff Assignments, Personnel File). Neue Tabs werden **nach** den bestehenden ergänzt:

```
Overview | Tariff Assignments | Steuern & SV | Bankverbindung | Vergütung | Familie | Zusatzleistungen | Pfändungen | Personnel File
```

**Tab-Sichtbarkeit:**
- "Steuern & SV", "Bankverbindung", "Vergütung", "Familie", "Zusatzleistungen": sichtbar nur mit `personnel.payroll_data.view`
- "Pfändungen": sichtbar nur mit `personnel.garnishment.view`

**Neue Komponenten-Dateien:**

#### 1.11.1 Tab "Steuern & SV"
**Datei:** `src/components/employees/payroll/tax-social-security-tab.tsx`

Felder (alle in einem Card-Grid wie der bestehende Overview-Tab):
- Steuer-Identifikationsnummer (Input, maskiert anzeigen bis Klick auf "Anzeigen")
- Steuerklasse (Select: 1-6)
- Kinderfreibeträge (Number Input, step 0.5)
- Konfession (Select: ev, rk, la, er, lt, rf, fg, fr, fs, fa, ak, ib, jd — mit deutschen Labels)
- ELStAM-Freibetrag (Number Input)
- ELStAM-Hinzurechnung (Number Input)
- Haupt-/Nebenarbeitgeber (Switch/Toggle)
- Geburtsname (Input)
- Sozialversicherungsnummer (Input, maskiert)
- Krankenkasse (Combobox mit Suche gegen HealthInsuranceProvider-Liste)
- KV-Status (Select: Pflichtversichert, Freiwillig, Privat)
- PKV-Beitrag (Number Input, nur sichtbar bei Status "Privat")
- Personengruppenschlüssel (Select gegen PersonnelGroupCode-Tabelle)
- Beitragsgruppenschlüssel (4x einzelne Select-Dropdowns: KV, RV, AV, PV)
- Tätigkeitsschlüssel (Input mit Format-Validierung, 9-stellig)
- Midijob-Kennzeichen (Select: 0=Nein, 1=Ja (Gleitzoner), 2=Ja (Midijob))

Bearbeitungsmodus: Inline-Edit mit "Bearbeiten" / "Speichern" / "Abbrechen" Buttons (wie bestehende Card-Pattern). Alternativ: Sheet-Form.

#### 1.11.2 Tab "Bankverbindung"
**Datei:** `src/components/employees/payroll/bank-details-tab.tsx`

Felder:
- IBAN (Input, maskiert, mit IBAN-Formatierung)
- BIC (Input, optional)
- Kontoinhaber (Input)

#### 1.11.3 Tab "Vergütung"
**Datei:** `src/components/employees/payroll/compensation-tab.tsx`

Felder:
- Entgeltart (Select: Monatsgehalt, Stundenlohn, Provision)
- Bruttogehalt/Monat (Number Input, nur bei Monatsgehalt/Provision)
- Stundenlohn (Number Input, nur bei Stundenlohn)
- Hausnummer (Input — separates Feld von addressStreet)

#### 1.11.4 Tab "Familie"
**Datei:** `src/components/employees/payroll/family-tab.tsx`

Sub-Bereiche:
- **Kinder** — Tabelle mit EmployeeChild-Einträgen (Name, Geburtsdatum, Freibetragsanteil). Add/Edit/Delete via Sheet-Form.
- **Elternzeit** — Tabelle mit EmployeeParentalLeave-Einträgen (Von, Bis, Kind). Add/Edit/Delete via Sheet-Form.
- **Mutterschutz** — Tabelle mit EmployeeMaternityLeave-Einträgen (Beginn, Voraussichtlicher Geburtstermin, Tatsächliches Ende). Add/Edit/Delete via Sheet-Form.

#### 1.11.5 Tab "Zusatzleistungen"
**Datei:** `src/components/employees/payroll/benefits-tab.tsx`

Sub-Bereiche (jeweils als eigener Card-Abschnitt mit eigenem Add/Edit/Delete):
- **Dienstwagen** — EmployeeCompanyCar-Tabelle (BLP, Antriebsart, Entfernung, Überlassungsart, Von, Bis)
- **Jobrad** — EmployeeJobBike-Tabelle (BLP, Überlassungsart, Von, Bis)
- **Essenszuschuss** — EmployeeMealAllowance-Tabelle (Tagessatz, Arbeitstage/Monat, Von, Bis)
- **Sachgutscheine** — EmployeeVoucher-Tabelle (Monatsbetrag, Anbieter, Von, Bis)
- **Jobticket** — EmployeeJobTicket-Tabelle (Monatsbetrag, Anbieter, Zusätzlich zum Lohn?, Von, Bis)
- **Betriebliche Altersvorsorge** — EmployeePension-Tabelle (Durchführungsweg, Träger, Vertragsnr, AN-Beitrag, AG-Beitrag, Pflicht-AG-Zuschuss, Von, Bis)
- **Vermögenswirksame Leistungen** — EmployeeSavings-Tabelle (Anlageart, Empfänger, IBAN, Vertragsnr, Monatsbetrag, AG-/AN-Anteil, Von, Bis)

#### 1.11.6 Tab "Pfändungen"
**Datei:** `src/components/employees/payroll/garnishments-tab.tsx`

Tabelle mit EmployeeGarnishment-Einträgen (Gläubiger, Aktenzeichen, Betrag, Berechnungsmethode, Unterhaltsberechtigte, Rang, Von, Bis). Add/Edit/Delete via Sheet-Form.

#### 1.11.7 Sheet-Formulare für jede Sub-Tabelle

Pro Sub-Tabelle ein Sheet-Formular nach dem bestehenden Pattern (`tariff-assignment-form-sheet.tsx`):

| Datei | Tabelle |
|---|---|
| `employee-child-form-sheet.tsx` | EmployeeChild |
| `employee-company-car-form-sheet.tsx` | EmployeeCompanyCar |
| `employee-job-bike-form-sheet.tsx` | EmployeeJobBike |
| `employee-meal-allowance-form-sheet.tsx` | EmployeeMealAllowance |
| `employee-voucher-form-sheet.tsx` | EmployeeVoucher |
| `employee-job-ticket-form-sheet.tsx` | EmployeeJobTicket |
| `employee-pension-form-sheet.tsx` | EmployeePension |
| `employee-savings-form-sheet.tsx` | EmployeeSavings |
| `employee-garnishment-form-sheet.tsx` | EmployeeGarnishment |
| `employee-parental-leave-form-sheet.tsx` | EmployeeParentalLeave |
| `employee-maternity-leave-form-sheet.tsx` | EmployeeMaternityLeave |

Alle Sheets in `src/components/employees/payroll/` ablegen.

---

### 1.12 i18n

**Dateien:** `messages/de.json`, `messages/en.json`

Neuer Namespace `employeePayroll` mit Übersetzungen für:
- Tab-Labels
- Formular-Feldbezeichnungen (alle oben genannten Felder)
- Enum-Werte (Steuerklassen, Konfessionen, KV-Status, Antriebsarten, Überlassungsarten, Durchführungswege, Anlagearten, Berechnungsmethoden)
- Validierungsfehler
- Bestätigungsdialoge
- Leerzustands-Texte

Beispiel-Struktur:
```json
{
  "employeePayroll": {
    "tabTaxSocialSecurity": "Steuern & SV",
    "tabBankDetails": "Bankverbindung",
    "tabCompensation": "Vergütung",
    "tabFamily": "Familie",
    "tabBenefits": "Zusatzleistungen",
    "tabGarnishments": "Pfändungen",
    "fieldTaxId": "Steuer-Identifikationsnummer",
    "fieldTaxClass": "Steuerklasse",
    "fieldChildTaxAllowance": "Kinderfreibeträge",
    "fieldDenomination": "Konfession",
    "denominationEv": "Evangelisch",
    "denominationRk": "Römisch-katholisch",
    "denominationLa": "Evangelisch-lutherisch",
    "denominationNone": "Konfessionslos",
    "fieldSocialSecurityNumber": "Sozialversicherungsnummer",
    "fieldHealthInsuranceProvider": "Krankenkasse",
    "fieldHealthInsuranceStatus": "Versicherungsstatus",
    "healthInsuranceStatusMandatory": "Pflichtversichert",
    "healthInsuranceStatusVoluntary": "Freiwillig versichert",
    "healthInsuranceStatusPrivate": "Privat versichert",
    "fieldPersonnelGroupCode": "Personengruppenschlüssel",
    "fieldContributionGroupCode": "Beitragsgruppenschlüssel",
    "fieldActivityCode": "Tätigkeitsschlüssel",
    "fieldIban": "IBAN",
    "fieldBic": "BIC",
    "fieldAccountHolder": "Kontoinhaber",
    "fieldGrossSalary": "Bruttogehalt / Monat",
    "fieldHourlyRate": "Stundenlohn",
    "fieldPaymentType": "Entgeltart",
    "paymentTypeMonthly": "Monatsgehalt",
    "paymentTypeHourly": "Stundenlohn",
    "paymentTypeCommission": "Provision",
    "validationInvalidIban": "Ungültige IBAN",
    "validationInvalidTaxId": "Ungültige Steuer-Identifikationsnummer",
    "validationInvalidSsn": "Ungültige Sozialversicherungsnummer",
    ...
  }
}
```

---

### 1.13 Tests Phase 1

#### Unit-Tests
| Test-Datei | Prüft |
|---|---|
| `src/lib/services/__tests__/payroll-validators.test.ts` | IBAN, SV-Nummer, Steuer-ID, BGS, Steuerklasse, Tätigkeitsschlüssel, Geburtsdatum, PGR |
| `src/lib/services/__tests__/field-encryption.test.ts` | Encrypt/Decrypt Round-Trip, Key-Versionen, Unicode, Edge Cases |

#### Integration-Tests
| Test-Datei | Prüft |
|---|---|
| `src/trpc/routers/__tests__/employeePayroll.test.ts` | Employee Update mit Payroll-Feldern, Validierung greift, Verschlüsselung funktioniert, Berechtigungsprüfung |
| `src/trpc/routers/__tests__/employeeChildren.test.ts` | CRUD für EmployeeChild |
| `src/trpc/routers/__tests__/employeeBenefits.test.ts` | CRUD für CompanyCar, JobBike, MealAllowance, Voucher, JobTicket |
| `src/trpc/routers/__tests__/employeePensions.test.ts` | CRUD für EmployeePension |
| `src/trpc/routers/__tests__/employeeSavings.test.ts` | CRUD für EmployeeSavings |
| `src/trpc/routers/__tests__/employeeGarnishments.test.ts` | CRUD für EmployeeGarnishment, Berechtigungsprüfung garnishment.view/edit |

---

### Success Criteria Phase 1

#### Automated Verification
- [ ] Migration applied: `pnpm db:reset` runs cleanly
- [ ] Prisma client regenerated: `pnpm db:generate`
- [ ] All unit tests pass: `pnpm vitest run src/lib/services/__tests__/payroll-validators.test.ts`
- [ ] All unit tests pass: `pnpm vitest run src/lib/services/__tests__/field-encryption.test.ts`
- [ ] All integration tests pass: `pnpm vitest run src/trpc/routers/__tests__/employeePayroll.test.ts`
- [ ] All integration tests pass for sub-domain routers
- [ ] Permission catalog test passes: `pnpm vitest run src/trpc/routers/__tests__/permission-catalog.test.ts`
- [ ] TypeScript compiles: `pnpm typecheck` (no new errors)
- [ ] Linting passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification
- [ ] Mitarbeiter-Detailseite zeigt alle neuen Tabs
- [ ] Tabs sind berechtigungsgesteuert (ohne `personnel.payroll_data.view` ausgeblendet)
- [ ] Pfändungen-Tab ist nur mit `personnel.garnishment.view` sichtbar
- [ ] Steuer-ID und IBAN werden maskiert angezeigt, bis der Benutzer "Anzeigen" klickt
- [ ] In der Datenbank sind taxId, socialSecurityNumber, iban als verschlüsselter Text gespeichert (verifizierbar via Prisma Studio oder psql)
- [ ] Validierungen greifen: ungültige IBAN, Steuer-ID, SV-Nummer werden serverseitig abgelehnt
- [ ] Krankenkassen-Dropdown zeigt alle GKV-Kassen mit Suche
- [ ] Alle Sub-Tabellen (Kinder, Sachbezüge, bAV, VL, Pfändungen) sind CRUD-fähig
- [ ] Bestehende Funktionalität (Zeiterfassung, Belege, Buchungen etc.) ist nicht beeinträchtigt

**Implementation Note**: After completing Phase 1 and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: DATEV LODAS / LuG Export

### Overview
Vollständig DATEV-konformer ASCII-Export im LODAS- und LuG-Format, der vom Steuerberater direkt importiert werden kann. Mandantenspezifisches Lohnart-Mapping.

**Geschätzter Aufwand: 8–10 Implementierungstage**

---

### 2.1 Shared DATEV Utility extrahieren

**Neue Datei:** `src/lib/services/datev-format-utils.ts`

Funktionen extrahiert aus `inbound-invoice-datev-export-service.ts`:

```typescript
import iconv from "iconv-lite"

/**
 * Encode a string as Windows-1252 (ANSI) Buffer.
 * Required for all DATEV import files.
 */
export function encodeWindows1252(text: string): Buffer {
  return iconv.encode(text, "win1252")
}

/**
 * Format a number with German comma decimal separator.
 * formatDecimal(1234.56, 2) → "1234,56"
 */
export function formatDecimal(value: number, decimals: number = 2): string {
  return value.toFixed(decimals).replace(".", ",")
}

/**
 * Escape a field for semicolon-delimited DATEV files.
 * Wraps in quotes if the value contains the separator or quotes.
 * Internal quotes are doubled.
 */
export function escapeField(value: string, separator: string = ";", quote: string = '"'): string {
  if (value.includes(separator) || value.includes(quote)) {
    return quote + value.replace(new RegExp(quote, "g"), quote + quote) + quote
  }
  return value
}

/**
 * Join lines with CRLF line ending (required by DATEV).
 */
export function crlfJoin(lines: string[]): string {
  return lines.join("\r\n") + "\r\n"
}

/**
 * Format a Date as DATEV date string.
 * formatDatevDate(new Date("2026-05-01"), "TT.MM.JJJJ") → "01.05.2026"
 * formatDatevDate(new Date("2026-05-01"), "TTMMJJJJ") → "01052026"
 */
export function formatDatevDate(date: Date, format: string = "TT.MM.JJJJ"): string {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = String(date.getFullYear())
  switch (format) {
    case "TT.MM.JJJJ": return `${dd}.${mm}.${yyyy}`
    case "TTMMJJJJ": return `${dd}${mm}${yyyy}`
    case "JJJJMMTT": return `${yyyy}${mm}${dd}`
    default: return `${dd}.${mm}.${yyyy}`
  }
}
```

**Refactoring:** `src/lib/services/inbound-invoice-datev-export-service.ts` auf die neue Utility umstellen:
- Import von `datev-format-utils` statt lokaler Funktionen
- Lokale `formatDecimal`, `escapeField`, `truncate` Funktionen entfernen
- `iconv.encode()` Aufruf durch `encodeWindows1252()` ersetzen
- CRLF-Join durch `crlfJoin()` ersetzen

**Test:** `src/lib/services/__tests__/datev-format-utils.test.ts`
- `encodeWindows1252`: Deutsche Umlaute korrekt, Sonderzeichen
- `formatDecimal`: Ganzzahlen, Nachkommastellen, negative Zahlen
- `escapeField`: Mit/ohne Semikolon, mit/ohne Anführungszeichen
- `crlfJoin`: Leere Liste, einzelne Zeile, mehrere Zeilen, Trailing CRLF
- `formatDatevDate`: Alle drei Formate, Grenzfälle (Monatswechsel, Jahreswechsel)

---

### 2.2 ExportInterface erweitern

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_datev_config_to_export_interface.sql`

```sql
ALTER TABLE export_interfaces ADD COLUMN berater_nr VARCHAR(7);
ALTER TABLE export_interfaces ADD COLUMN datev_target VARCHAR(10) DEFAULT 'LODAS';  -- LODAS oder LUG
```

**Prisma-Schema:** `ExportInterface` Model erweitern um:
- `beraterNr String? @map("berater_nr") @db.VarChar(7)`
- `datevTarget String? @default("LODAS") @map("datev_target") @db.VarChar(10)`

**Router:** `src/trpc/routers/exportInterfaces.ts` — Input/Output-Schemas um die neuen Felder ergänzen.

**Service:** `src/lib/services/export-interface-service.ts` — `update` Methode um die neuen Felder erweitern.

**Validierung:**
- `beraterNr`: 4-7-stellig, nur Ziffern
- `datevTarget`: `LODAS` oder `LUG`

---

### 2.3 Lohnart-Mapping-Tabellen

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_payroll_wage_mapping.sql`

```sql
-- Standard-Lohnarten (global, seed-Tabelle, nicht mandantenspezifisch)
CREATE TABLE default_payroll_wages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) NOT NULL UNIQUE,          -- Lohnart-Nummer (z.B. "1000")
    name VARCHAR(200) NOT NULL,                -- Bezeichnung
    terp_source VARCHAR(50) NOT NULL,          -- Terp-Quelle (z.B. "target_hours", "worked_hours", "account:NACHT")
    category VARCHAR(30) NOT NULL,             -- time, absence, bonus, salary, benefit
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Mandantenspezifisches Lohnart-Mapping
CREATE TABLE tenant_payroll_wages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    code VARCHAR(10) NOT NULL,                 -- Lohnart-Nummer (kann vom Default abweichen)
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
```

**Seed — Standard-Lohnarten:**

```sql
INSERT INTO default_payroll_wages (id, code, name, terp_source, category, sort_order) VALUES
  (gen_random_uuid(), '1000', 'Gehalt', 'gross_salary', 'salary', 1),
  (gen_random_uuid(), '1100', 'Stundenlohn', 'hourly_wage', 'salary', 2),
  (gen_random_uuid(), '1200', 'Überstunden', 'overtime_hours', 'time', 3),
  (gen_random_uuid(), '1300', 'Urlaubstage', 'vacation_days', 'absence', 4),
  (gen_random_uuid(), '1400', 'Krankheitstage', 'sick_days', 'absence', 5),
  (gen_random_uuid(), '1500', 'Nachtzuschlag', 'account:NACHT', 'bonus', 6),
  (gen_random_uuid(), '1600', 'Sonntagszuschlag', 'account:SONNTAG', 'bonus', 7),
  (gen_random_uuid(), '1700', 'Feiertagszuschlag', 'account:FEIERTAG', 'bonus', 8),
  (gen_random_uuid(), '1800', 'Sonstige Abwesenheit', 'other_absence_days', 'absence', 9),
  (gen_random_uuid(), '1900', 'Sollstunden', 'target_hours', 'time', 10),
  (gen_random_uuid(), '2000', 'Arbeitsstunden', 'worked_hours', 'time', 11),
  (gen_random_uuid(), '2100', 'Essenszuschuss', 'benefit:meal_allowance', 'benefit', 12),
  (gen_random_uuid(), '2200', 'Sachbezug Dienstwagen', 'benefit:company_car', 'benefit', 13),
  (gen_random_uuid(), '2300', 'Sachbezug Jobrad', 'benefit:job_bike', 'benefit', 14),
  (gen_random_uuid(), '2400', 'Sachgutschein', 'benefit:voucher', 'benefit', 15),
  (gen_random_uuid(), '2500', 'Jobticket', 'benefit:job_ticket', 'benefit', 16),
  (gen_random_uuid(), '2600', 'Entgeltumwandlung bAV (AN)', 'benefit:pension_employee', 'benefit', 17),
  (gen_random_uuid(), '2700', 'AG-Zuschuss bAV', 'benefit:pension_employer', 'benefit', 18),
  (gen_random_uuid(), '2800', 'VL (AG-Anteil)', 'benefit:savings_employer', 'benefit', 19),
  (gen_random_uuid(), '2900', 'VL (AN-Anteil)', 'benefit:savings_employee', 'benefit', 20);
```

**Prisma-Schema:** Models `DefaultPayrollWage` und `TenantPayrollWage` hinzufügen.

**Service:** `src/lib/services/payroll-wage-service.ts`

Funktionen:
- `listDefaults(prisma)` — alle Standard-Lohnarten
- `listForTenant(prisma, tenantId)` — mandantenspezifische Lohnarten
- `initializeForTenant(prisma, tenantId)` — kopiert alle Defaults in die Mandanten-Tabelle (idempotent: nur wenn noch keine Einträge existieren)
- `update(prisma, tenantId, id, input)` — einzelne Lohnart ändern
- `reset(prisma, tenantId)` — alle Mandanten-Lohnarten löschen und aus Defaults neu kopieren

**Router:** `src/trpc/routers/payrollWages.ts`
- `list` — `listForTenant` (permission: `payroll.manage`)
- `listDefaults` — `listDefaults` (permission: `payroll.manage`)
- `update` — einzelne Lohnart ändern (permission: `payroll.manage`)
- `reset` — auf Defaults zurücksetzen (permission: `payroll.manage`)
- `initialize` — Defaults für Mandant kopieren (permission: `payroll.manage`)

**Hook:** `src/hooks/use-payroll-wages.ts`

**Automatische Initialisierung:** Beim Anlegen eines neuen Tenants (in der Tenant-Service `create` Methode) automatisch `initializeForTenant` aufrufen. Für bestehende Mandanten: Beim ersten Aufruf von `listForTenant` prüfen ob Einträge existieren, falls nicht automatisch initialisieren.

---

### 2.4 DATEV LODAS Export Service

**Neue Datei:** `src/lib/services/datev-lodas-export-service.ts`

```typescript
import { encodeWindows1252, formatDecimal, escapeField, crlfJoin, formatDatevDate } from "./datev-format-utils"
import type { PrismaClient } from "@prisma/client"
import { decryptField } from "./field-encryption"
import * as auditLog from "./audit-logs-service"
import { createHash } from "node:crypto"

interface DatevLodasExportInput {
  tenantId: string
  exportInterfaceId: string
  year: number
  month: number
  employeeIds?: string[]  // optional: nur bestimmte Mitarbeiter
}

interface DatevLodasExportResult {
  file: Buffer
  filename: string
  employeeCount: number
  movementRowCount: number
  fileHash: string
}

export async function generateDatevLodasExport(
  prisma: PrismaClient,
  input: DatevLodasExportInput,
  auditCtx: AuditContext,
): Promise<DatevLodasExportResult> {
  // 1. ExportInterface laden (beraterNr, mandantNr, datevTarget)
  // 2. TenantPayrollWages laden (Lohnart-Mapping)
  // 3. Mitarbeiter mit MonthlyValues + DailyAccountValues laden
  // 4. Stammdaten laden (wenn includeStammdaten = true)
  // 5. Datei generieren
  // 6. Windows-1252 encodieren
  // 7. Audit-Log schreiben
  // 8. Result zurückgeben
}
```

#### Dateistruktur des generierten Exports

```
[Allgemein]
Ziel={LODAS|LUG}
Version_SST=1.0
BeraterNr={beraterNr}
MandantenNr={mandantNr}
Datumsformat=TT.MM.JJJJ
Feldtrennzeichen=;
Zahlenkomma=,

[Satzbeschreibung]
21;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;buchungswert#bwd;buchungsnummer#bwd;kostenstelle1#bwd

[Bewegungsdaten]
{personalnummer};{01MMJJJJ};{wert};{lohnart};{kostenstelle}
```

#### Felder in [Bewegungsdaten] (Satzart 21)

| Feld | LODAS-Name | Quelle in Terp | Format |
|---|---|---|---|
| Personalnummer | `pnr#bwd` | `employee.personnelNumber` | String |
| Abrechnungszeitraum | `abrechnung_zeitraum#bwd` | `01{MM}{JJJJ}` (immer 1. des Monats) | `TTMMJJJJ` |
| Buchungswert | `buchungswert#bwd` | Stunden/Tage/Betrag (aus MonthlyValue/DailyAccountValue) | Dezimal mit Komma |
| Buchungsnummer | `buchungsnummer#bwd` | Lohnart-Code aus TenantPayrollWage | String |
| Kostenstelle 1 | `kostenstelle1#bwd` | `employee.costCenter.code` | String (optional) |

#### Mapping Terp-Daten → Lohnart-Zeilen

Für jeden Mitarbeiter werden folgende Zeilen generiert (sofern Wert > 0):

| terp_source | Datenquelle | Einheit |
|---|---|---|
| `target_hours` | `MonthlyValue.totalTargetTime / 60` | Stunden |
| `worked_hours` | `MonthlyValue.totalNetTime / 60` | Stunden |
| `overtime_hours` | `MonthlyValue.totalOvertime / 60` | Stunden |
| `vacation_days` | `MonthlyValue.vacationTaken` | Tage |
| `sick_days` | `MonthlyValue.sickDays` | Tage |
| `other_absence_days` | `MonthlyValue.otherAbsenceDays` | Tage |
| `gross_salary` | `Employee.grossSalary` | EUR |
| `hourly_wage` | `Employee.hourlyRate` | EUR |
| `account:{CODE}` | `DailyAccountValue` aggregiert für den Monat, `/60` | Stunden |
| `benefit:meal_allowance` | `EmployeeMealAllowance.dailyAmount * workDaysPerMonth` | EUR |
| `benefit:company_car` | Berechnung: `listPrice * Prozentsatz` je nach Antriebsart | EUR |
| `benefit:job_bike` | Berechnung: `listPrice * 0.25% * 12 / 12` (oder 0% wenn zusätzlich) | EUR |
| `benefit:voucher` | `EmployeeVoucher.monthlyAmount` | EUR |
| `benefit:job_ticket` | `EmployeeJobTicket.monthlyAmount` (0 wenn isAdditional=true & steuerfrei) | EUR |
| `benefit:pension_employee` | `EmployeePension.employeeContribution` | EUR |
| `benefit:pension_employer` | `EmployeePension.employerContribution + mandatoryEmployerSubsidy` | EUR |
| `benefit:savings_employer` | `EmployeeSavings.employerShare` | EUR |
| `benefit:savings_employee` | `EmployeeSavings.employeeShare` | EUR |

**Hinweis:** Nur Lohnarten die in `TenantPayrollWage` mit `is_active = true` stehen, werden exportiert. Nur Zeilen mit Wert > 0 werden geschrieben.

#### Dateiname
`DATEV_{LODAS|LUG}_{MandantNr}_{JJJJMM}.txt`

Beispiel: `DATEV_LODAS_90909_202605.txt`

---

### 2.5 tRPC Router für DATEV-Export

**Neue Datei:** `src/trpc/routers/datevLodasExport.ts`

Procedures:
- `generate` (mutation): Generiert Export, gibt Datei als Base64 + Metadaten zurück. Permission: `payroll.manage`
- `testExport` (mutation): Generiert Export für einen einzelnen Mitarbeiter. Permission: `payroll.manage`

Im Root-Router `_app.ts` registrieren.

**Hook:** `src/hooks/use-datev-lodas-export.ts` — `useGenerateDatevLodasExport`, `useTestDatevLodasExport`

---

### 2.6 UI — Export-Auswahl erweitern

**Datei:** `src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`

In der `GenerateExportDialog`-Komponente ein neues Select-Feld "Export-Format" ergänzen:

| Wert | Label | Beschreibung |
|---|---|---|
| `standard` | Standard-CSV (Legacy) | Bestehender Export, bleibt unverändert |
| `datev_lodas` | DATEV LODAS | Neuer LODAS ASCII-Export |
| `datev_lug` | DATEV Lohn und Gehalt | Neuer LuG ASCII-Export (gleiches Format, `Ziel=LUG`) |

Bei Auswahl `datev_lodas` oder `datev_lug`:
- ExportInterface-Dropdown zeigen (nur Interfaces mit gepflegter `beraterNr`)
- Falls keine `beraterNr` gepflegt: Fehlermeldung mit Link zur ExportInterface-Konfiguration
- "Export erzeugen" ruft `datevLodasExport.generate` auf statt `payrollExports.generate`
- Download liefert die Windows-1252-encodierte Datei

**Neue Schaltfläche:** "Test-Export für 1 Mitarbeiter"
- Öffnet Dialog mit Mitarbeiter-Auswahl (Combobox)
- Generiert Export nur für diesen einen Mitarbeiter
- Datei wird sofort heruntergeladen

---

### 2.7 Lohnart-Mapping UI

**Neue Seite:** `src/app/[locale]/(dashboard)/admin/payroll-wages/page.tsx`

Tabelle mit allen `TenantPayrollWage`-Einträgen:
- Spalten: Code, Name, Terp-Quelle, Kategorie, Aktiv
- Inline-Edit für Code und Name
- Toggle für Aktiv/Inaktiv
- "Auf Defaults zurücksetzen" Button

Navigation: Unter "Einstellungen" > "Lohnart-Mapping" einbinden.

---

### 2.8 ExportInterface-Konfiguration erweitern

**Bestehende UI:** ExportInterface-Verwaltung um die neuen Felder ergänzen:
- Beraternummer (Input, 4-7-stellig)
- DATEV-Ziel (Select: LODAS / LuG)

---

### 2.9 Audit-Log

Jeder DATEV-Export wird mit folgendem Audit-Eintrag dokumentiert:

```typescript
await auditLog.log(prisma, {
  tenantId,
  userId: auditCtx.userId,
  action: "export",
  entityType: "datev_lodas_export",
  entityId: "batch",
  entityName: `DATEV ${target} Export ${month}/${year}`,
  changes: {
    exportInterface: mandantNr,
    target: target,  // LODAS oder LUG
    period: `${year}-${String(month).padStart(2, "0")}`,
    employeeCount: result.employeeCount,
    movementRowCount: result.movementRowCount,
    fileHash: result.fileHash,  // SHA-256 des generierten Files
  },
  ipAddress: auditCtx.ipAddress,
  userAgent: auditCtx.userAgent,
})
```

---

### 2.10 Tests Phase 2

| Test-Datei | Prüft |
|---|---|
| `src/lib/services/__tests__/datev-format-utils.test.ts` | Alle Utility-Funktionen |
| `src/lib/services/__tests__/datev-lodas-export-service.test.ts` | LODAS-Datei-Generierung (Header, Sektionen, Feldformat), Windows-1252-Encoding, CRLF, Lohnart-Mapping, leere Bewegungsdaten, Mitarbeiter ohne MonthlyValues |
| `src/trpc/routers/__tests__/datevLodasExport.test.ts` | Integration: Generate + TestExport Procedures, Berechtigungsprüfung |
| `src/trpc/routers/__tests__/payrollWages.test.ts` | CRUD für TenantPayrollWage, Initialize, Reset |

**Snapshot-Test:** Die generierte Datei für einen Referenz-Datensatz (5 Mitarbeiter, 1 Monat, Standard-Lohnarten) wird als Snapshot gespeichert und bei jedem Testlauf verglichen.

**Encoding-Test:** Die generierte Datei wird als Buffer geprüft:
- Deutsche Umlaute korrekt in Windows-1252 (ä = 0xE4, ö = 0xF6, ü = 0xFC, ß = 0xDF)
- CRLF (0x0D 0x0A) als Zeilenende

---

### Success Criteria Phase 2

#### Automated Verification
- [ ] Migration applied: `pnpm db:reset`
- [ ] All format utility tests pass: `pnpm vitest run src/lib/services/__tests__/datev-format-utils.test.ts`
- [ ] All LODAS export tests pass: `pnpm vitest run src/lib/services/__tests__/datev-lodas-export-service.test.ts`
- [ ] All payroll wage tests pass: `pnpm vitest run src/trpc/routers/__tests__/payrollWages.test.ts`
- [ ] Inbound invoice DATEV export still works after refactoring (existing tests pass)
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification
- [ ] DATEV LODAS Export generiert eine Datei im korrekten Format
- [ ] Datei ist Windows-1252-encodiert (prüfbar mit `file --mime-encoding` oder `xxd`)
- [ ] `[Allgemein]`-Header enthält korrekte BeraterNr und MandantenNr
- [ ] Beide Varianten (LODAS und LuG) funktionieren
- [ ] Lohnart-Mapping-Seite zeigt alle Defaults und erlaubt Änderungen
- [ ] Test-Export für einzelnen Mitarbeiter funktioniert
- [ ] Alter Standard-CSV-Export funktioniert weiterhin
- [ ] Audit-Log dokumentiert den Export
- [ ] ExportInterface-Konfiguration zeigt BeraterNr und DATEV-Ziel

**Implementation Note**: After completing Phase 2 and all automated verification passes, pause here for manual confirmation. Idealerweise: generierte Datei durch den Steuerberater in DATEV importieren lassen.

---

## Phase 3: Polish und Onboarding-Unterstützung

### Overview
Massenbefüllung, Gehaltshistorie, Onboarding-Checkliste und Steuerberater-Dokumentation.

**Geschätzter Aufwand: 6–8 Implementierungstage**

---

### 3.1 Massenimport

**Neue Datei:** `src/lib/services/payroll-bulk-import-service.ts`

Funktionalität:
1. **Template-Download:** CSV-Vorlage mit allen Pflichtfeldern als Header-Zeile
2. **Upload:** CSV- oder XLSX-Datei hochladen
3. **Parsing:** Zeilen parsen, Spalten-Mapping validieren
4. **Validierung:** Alle Zeilen durch die bestehenden Validatoren (`payroll-validators.ts`) laufen lassen
5. **Vorschau:** Liste der Änderungen (welche Mitarbeiter werden aktualisiert, mit Diff)
6. **Import:** Alle Änderungen in einer Transaktion schreiben
7. **Audit-Log:** Massenimport dokumentieren

**Spalten-Mapping:** Der Benutzer kann Spalten zuordnen (Drag & Drop oder Dropdown-Auswahl). Pflicht-Spalte: `personnelNumber` (zum Identifizieren des Mitarbeiters).

**Validierungsfehler:** Werden zeilenweise angezeigt. Import erst möglich wenn alle Zeilen valide.

**Router:** `src/trpc/routers/payrollBulkImport.ts`
- `parseFile` (mutation): Upload + Parsing + Validierung → Vorschau-Daten
- `confirmImport` (mutation): Vorschau bestätigen → Import durchführen

**Hook:** `src/hooks/use-payroll-bulk-import.ts`

**UI-Seite:** `src/app/[locale]/(dashboard)/admin/payroll-import/page.tsx`
- Drag & Drop Upload-Zone
- Spalten-Mapping-Dialog
- Validierungsfehler-Tabelle
- Vorschau mit Diff
- "Import starten" Button

---

### 3.2 Gehaltshistorie

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_salary_history.sql`

```sql
CREATE TABLE employee_salary_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    valid_from DATE NOT NULL,
    valid_to DATE,                              -- NULL = aktuell gültig
    gross_salary DECIMAL(10,2),
    hourly_rate DECIMAL(10,2),
    payment_type VARCHAR(20) NOT NULL,          -- monthly_salary, hourly_wage, commission
    change_reason VARCHAR(50) NOT NULL,         -- initial, raise, tariff_change, promotion, other
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_salary_history_employee ON employee_salary_history(employee_id);
CREATE INDEX idx_salary_history_valid ON employee_salary_history(employee_id, valid_from, valid_to);
```

**Logik:** Beim Erstellen eines neuen Eintrags wird der vorherige Eintrag (mit `valid_to = NULL`) automatisch auf `valid_to = new.valid_from - 1 Tag` gesetzt. Das aktuelle Gehalt (`Employee.grossSalary` / `Employee.hourlyRate`) wird immer aus dem jüngsten Eintrag mit `valid_to = NULL` synchronisiert.

**Service:** `src/lib/services/employee-salary-history-service.ts`
**Repository:** `src/lib/services/employee-salary-history-repository.ts`
**Router:** `src/trpc/routers/employeeSalaryHistory.ts` — `list`, `create`, `update`, `delete`
**Hook:** `src/hooks/use-employee-salary-history.ts`

**UI:** Im Tab "Vergütung" unter den aktuellen Vergütungsdaten eine Timeline/Tabelle der Gehaltshistorie anzeigen.

---

### 3.3 Onboarding-Checkliste

**Neue Seite:** `src/app/[locale]/(dashboard)/admin/datev-onboarding/page.tsx`

Server-side Query die folgende Daten aggregiert:
- Beraternummer gepflegt? → `ExportInterface.beraterNr IS NOT NULL`
- Mandantennummer gepflegt? → `ExportInterface.mandantNumber IS NOT NULL`
- DATEV-Ziel gewählt? → `ExportInterface.datevTarget IS NOT NULL`
- Lohnart-Mapping angepasst? → Vergleich `TenantPayrollWage` mit `DefaultPayrollWage`
- Mitarbeiter mit vollständigen Lohnstammdaten: Query mit `WHERE taxId IS NOT NULL AND socialSecurityNumber IS NOT NULL AND iban IS NOT NULL AND taxClass IS NOT NULL AND healthInsuranceProviderId IS NOT NULL AND personnelGroupCode IS NOT NULL AND contributionGroupCode IS NOT NULL AND activityCode IS NOT NULL`
- Mitarbeiter mit fehlenden Pflichtfeldern: Inverse der obigen Query, mit Links auf die jeweilige Mitarbeiter-Detailseite

**Router:** `src/trpc/routers/datevOnboarding.ts` — `getStatus` (query)
**Hook:** `src/hooks/use-datev-onboarding.ts`

**UI:** Card-Grid mit Status-Indikatoren (Check/Cross Icons), Fortschrittsbalken für Mitarbeiter-Vollständigkeit, Tabelle der Mitarbeiter mit fehlenden Feldern.

---

### 3.4 Steuerberater-Dokumentation als PDF

**Neue Datei:** `src/lib/pdf/datev-steuerberater-anleitung-pdf.tsx`

React-PDF-Dokument (wie `audit-log-export-pdf.tsx`) mit:
1. Terp-Logo und Mandantenname
2. "Anleitung DATEV-Import aus Terp"
3. Schritt-für-Schritt: Wie wird die Datei exportiert (mit Screenshots-Platzhaltern)
4. Schritt-für-Schritt: Wie wird sie in DATEV importiert (`Mandant > Daten übernehmen > ASCII-Import`)
5. Feldliste: Welche Felder sind in der Datei enthalten
6. Lohnart-Tabelle: Welche Lohnarten werden verwendet (aus dem mandantenspezifischen Mapping)
7. Ansprechpartner-Information

**Service:** `src/lib/services/datev-documentation-service.ts`
- `generateSteuerberaterPdf(prisma, tenantId)` → Buffer

**Router:** In `datevOnboarding.ts` eine `downloadDocumentation` Procedure.

---

### 3.5 Tests Phase 3

| Test-Datei | Prüft |
|---|---|
| `src/lib/services/__tests__/payroll-bulk-import-service.test.ts` | CSV-Parsing, Validierung, Import-Transaktion, Fehlerbehandlung |
| `src/trpc/routers/__tests__/employeeSalaryHistory.test.ts` | CRUD, automatisches valid_to-Setzen, Gehalt-Synchronisation |
| `src/trpc/routers/__tests__/datevOnboarding.test.ts` | Status-Aggregation korrekt |

---

### Success Criteria Phase 3

#### Automated Verification
- [ ] All bulk import tests pass
- [ ] All salary history tests pass
- [ ] All onboarding tests pass
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification
- [ ] CSV-Import von 200 Mitarbeitern funktioniert ohne Fehler
- [ ] Validierungsfehler werden zeilenweise angezeigt
- [ ] Import ist transaktional (alles oder nichts)
- [ ] Gehaltshistorie zeigt korrekte Timeline
- [ ] Neuer Gehaltseintrag setzt automatisch `valid_to` des Vorgängers
- [ ] Onboarding-Checkliste zeigt korrekten Status pro Mandant
- [ ] Steuerberater-PDF wird generiert und ist inhaltlich korrekt
- [ ] PDF enthält mandantenspezifisches Lohnart-Mapping

---

## Testing Strategy

### Unit Tests
- Validatoren (IBAN, SV-Nummer, Steuer-ID, BGS, Steuerklasse, Tätigkeitsschlüssel)
- Verschlüsselung (Round-Trip, Key-Rotation, Edge Cases)
- DATEV Format-Utilities (Encoding, Dezimal, Escaping, Datum)
- LODAS Datei-Generierung (Header, Sektionen, Feldformat)

### Integration Tests
- Employee Update mit Payroll-Feldern + Validierung + Verschlüsselung
- CRUD für alle Sub-Domain-Router (Kinder, Sachbezüge, bAV, VL, Pfändungen)
- Berechtigungsprüfung (payroll_data.view/edit, garnishment.view/edit)
- DATEV-Export: Vollständiger Export für Test-Mandant
- Lohnart-Mapping: Initialize, Update, Reset
- Massenimport: Upload, Validierung, Import

### Snapshot Tests
- Generierte DATEV-LODAS-Datei für Referenz-Datensatz

### Manual Testing
- DATEV-Import beim Steuerberater durchführen
- Verschlüsselte Felder in der DB prüfen
- Tab-Sichtbarkeit nach Berechtigung

---

## Performance Considerations

- **Krankenkassen-Dropdown:** ~95 Einträge — Client-side Filtering via Combobox mit Suche, keine serverseitige Paginierung nötig
- **DATEV-Export:** Bei 200 Mitarbeitern und ~20 Lohnarten/Mitarbeiter = ~4000 Zeilen — kein Performance-Problem
- **Verschlüsselung:** AES-256-GCM ist Hardware-beschleunigt (AES-NI), ~200 Felder verschlüsseln dauert < 10ms
- **Massenimport:** 200 Mitarbeiter in einer Transaktion — Prisma `$transaction` mit Timeout erhöhen
- **Gehaltshistorie:** Index auf `(employee_id, valid_from, valid_to)` — schnelle Abfrage auch bei vielen Einträgen

---

## Migration Notes

- **Bestehende Mitarbeiter:** Alle neuen Felder sind optional (`NULL`). Kein Datenverlust.
- **Bestehender CSV-Export:** Bleibt unverändert (`exportType: "standard"` und `"datev"`).
- **Bestehende Berechtigungen:** Keine Änderung. Neue Permissions sind additiv.
- **Key Rotation:** Erster Key wird beim Deployment generiert. Für Staging: Test-Key in `.env`.
- **Krankenkassen-Daten:** Beim Deployment Seeds laufen lassen (`pnpm db:reset` in Staging, Migration + Seed in Prod).

---

## Risiken und offene Punkte

### 1. DATEV Schnittstellenhandbuch
Das aktuelle Handbuch (92. Auflage, Dez. 2025) ist nur mit DATEV-Login verfügbar. Die Implementierung basiert auf der öffentlich verfügbaren 45. Auflage (2016) und Community-Dokumentation.
**Risiko:** Formatänderungen in neueren Versionen möglich.
**Mitigation:** Test-Import beim Steuerberater vor Go-Live. Steuerberater um aktuelle LODAS_SSH.pdf bitten.

### 2. Krankenkassen-Datenquelle
Die ITSG Stammdatendatei (XML, täglich aktualisiert) von [download.gkv-ag.de](https://download.gkv-ag.de/) ist die autoritative Quelle. Für den initialen Seed reicht die manuelle Extraktion aus der GKV-Spitzenverband PDF (~95 Kassen).
**Risiko:** Fusionen/Auflösungen von Krankenkassen (ca. 2-3 pro Jahr).
**Mitigation:** Jährliches Update der Seed-Daten. Kein automatischer Sync nötig bei ~95 Einträgen.

### 3. KldB 2010 Tätigkeitsschlüssel — UX
Die KldB 2010 hat ~1.300 Berufsklassen auf 5-Steller-Ebene. Eine vollständige Auswahlliste im Frontend wäre unübersichtlich.
**Empfehlung:** Freitext-Eingabe (9-stellig) mit Format-Validierung. Kein Dropdown. Die Bundesagentur bietet ein [Online-Tool](https://web.arbeitsagentur.de/taetigkeitsschluessel/) zum Nachschlagen — Link im Hilfetext.
**Datenquelle für Seed:** [Bundesagentur für Arbeit — Arbeitsmittel](https://statistik.arbeitsagentur.de/DE/Navigation/Grundlagen/Klassifikationen/Klassifikation-der-Berufe/KldB2010-Fassung2020/Arbeitsmittel/Arbeitsmittel-Nav.html) (XLSX, ~1.300 Zeilen). Kann optional als Autocomplete-Quelle geladen werden (Phase 3 Nice-to-have).

### 4. Lohnart-Mapping — Steuerberater-Abstimmung
Jeder Steuerberater hat potenziell andere Lohnart-Nummern. Die Default-Lohnarten im Plan sind ein sinnvoller Ausgangspunkt, müssen aber pro Mandant mit dem Steuerberater abgestimmt werden.
**Mitigation:** Onboarding-Checkliste (Phase 3) zeigt ob das Mapping vom Default abweicht. Konfigurationsseite (Phase 2) erlaubt Anpassung.

### 5. DATEV-Programm des Steuerberaters
Noch nicht geklärt: Nutzt der Pro-Di-Steuerberater LODAS oder Lohn und Gehalt?
**Mitigation:** Beide Varianten werden implementiert (gleiche Datei, nur `Ziel=`-Header). Steuerberater beim Onboarding fragen.

### 6. Satzart 20 (Kalendarium) vs. 21 (Standard)
Implementiert wird Satzart 21 (Monats-Summen). Satzart 20 (tagesgenau) kann in einer späteren Phase ergänzt werden, falls der Steuerberater das braucht.

### 7. Kostenstellen-Mapping
Terp-Kostenstellen werden 1:1 als DATEV-Kostenstellen exportiert (Feld `kostenstelle1#bwd`). Falls der Steuerberater ein anderes Mapping braucht, muss ein zusätzliches Mapping-Feld pro Kostenstelle ergänzt werden (out of scope für diesen Plan).

### 8. Stammadaten-Sektion im LODAS-Export
Die `[Stammdaten]`-Sektion (Personalstammdaten wie Name, Adresse, Steuer-ID im LODAS-Format) ist komplexer als die Bewegungsdaten. Das LODAS SSH definiert 93 Personalstamm-Tabellen. Für Phase 2 werden **nur Bewegungsdaten** exportiert. Stammdaten-Export kann als Erweiterung in einer späteren Phase ergänzt werden, sobald das aktuelle Schnittstellenhandbuch vorliegt.

---

## References

- Research-Dokument: `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`
- LODAS SSH (45. Auflage, 2016): [silo.tips](https://silo.tips/download/ssh-schnittstellenhandbuch-lodas)
- DATEV Developer Portal: [developer.datev.de](https://developer.datev.de/datev/platform/en/schnittstellenvorgaben/ascii)
- GKV-Spitzenverband Krankenkassenliste: [gkv-spitzenverband.de](https://www.gkv-spitzenverband.de/service/krankenkassenliste/krankenkassen.jsp)
- ITSG Stammdatendatei: [download.gkv-ag.de](https://download.gkv-ag.de/)
- KldB 2010 Arbeitsmittel: [statistik.arbeitsagentur.de](https://statistik.arbeitsagentur.de/DE/Navigation/Grundlagen/Klassifikationen/Klassifikation-der-Berufe/KldB2010-Fassung2020/Arbeitsmittel/Arbeitsmittel-Nav.html)
- PGR — DEÜV Anlage 2: [gkv-datenaustausch.de](https://www.gkv-datenaustausch.de/media/dokumente/arbeitgeber/deuev/rundschreiben_anlagen/03_Anlage_2_Vers._8.01.pdf)
- pgsodium Deprecation: [Supabase Discussion #27109](https://github.com/orgs/supabase/discussions/27109)
- Node.js crypto AES-GCM: [Node.js Docs](https://nodejs.org/api/crypto.html#class-cipher)
- Bestehender DATEV-Export: `src/lib/services/inbound-invoice-datev-export-service.ts`
- Bestehender Payroll-Export: `src/lib/services/payroll-export-service.ts`
- Permission-Katalog: `src/lib/auth/permission-catalog.ts`
- Employee-Router: `src/trpc/routers/employees.ts`
- Employee-Service: `src/lib/services/employees-service.ts`
- ExportInterface-Model: `prisma/schema.prisma:3230–3252`
