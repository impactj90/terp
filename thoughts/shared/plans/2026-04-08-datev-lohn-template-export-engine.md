# DATEV-Lohndaten-Vorbereitung mit Template-basierter Export-Engine — Implementierungsplan

## Overview

Terp wird zum vollständigen Datenlieferanten für die deutsche Lohnabrechnung. Zwei klar getrennte Schichten:

**Schicht 1 — Stammdatenpflege:** Terp erfasst ALLE lohnrelevanten Daten in einem maximalen deutschen Personalstammdaten-Modell. Unabhängig vom Export-Format.

**Schicht 2 — Export-Mapping:** Pro Mandant wird über LiquidJS-Templates konfiguriert, welche Daten wie in eine Datei geschrieben werden. Templates werden vom Implementierungspartner oder Steuerberater gepflegt. Terp liefert Standard-Templates als Ausgangspunkt.

**Terp berechnet KEINE Lohnabrechnung.** Keine Brutto-Netto-Berechnung, keine SV-Beitragsberechnung, keine Lohnsteuerermittlung, keine steuerliche Bewertung von Sachbezügen. Terp bleibt ausschließlich Datenvorbereitungs- und Exportsystem.

**Dieser Plan ersetzt** den vorherigen Plan `2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` (hartcodierter LODAS-Generator). Die fundamentale Architekturentscheidung ist eine andere: Template-basierte Export-Engine statt hartcodierter Format-Generatoren.

**Basis:** Research `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`, `thoughts/shared/research/2026-04-08-export-script-konzept-lohnschnittstelle.md`

## Current State Analysis

### Employee-Model (`prisma/schema.prisma:1445–1564`)
- ~40 Felder vorhanden, davon **0 lohnspezifisch**
- Kein IBAN, keine Steuer-ID, keine SV-Nummer, keine Steuerklasse, keine Krankenkasse, kein Gehalt
- Bestehend: firstName, lastName, birthDate, birthPlace, birthCountry, gender, nationality, addressStreet/Zip/City/Country, maritalStatus, religion, disabilityFlag, entryDate, exitDate, weeklyHours, vacationDaysPerYear, partTimePercent, workDaysPerWeek etc.

### Bestehender Payroll-Export (`src/lib/services/payroll-export-service.ts:134–190`)
- Einfache CSV mit 8 Spalten (Personalnummer, Name, Lohnart, Stunden, Tage, Betrag, Kostenstelle)
- Hardcoded Lohnarten: 1000–2002
- UTF-8, LF-Zeilenenden — **kein echtes DATEV-Format**

### ExportInterface (`prisma/schema.prisma:3230–3252`)
- Hat `mandantNumber`, `exportScript` (ungenutzt), `exportPath`, `outputFilename`
- **Keine** `beraterNr`, kein `datevTarget`
- `exportScript` ist VARCHAR(255) — nie im Export-Code gelesen (Research: "Datenmodell vorbereitet, nicht implementiert")

### DATEV-Export Eingangsrechnungen (`src/lib/services/inbound-invoice-datev-export-service.ts`)
- EXTF-Format (Buchungsstapel) — nicht als Vorlage für LODAS nutzbar
- Wiederverwendbar: `iconv-lite` (Windows-1252), `formatDecimal()`, `escapeField()`, CRLF-Pattern

### Permission-Katalog (`src/lib/auth/permission-catalog.ts`)
- `p()` Helper generiert UUID v5 mit Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`
- Bestehende Payroll-Permissions: `payroll.manage`, `payroll.view`
- Aktuell 157 Permissions

### Key Discoveries
- LODAS ASCII ist **kein EXTF-Format** — sektionsbasiertes INI-ähnliches Format (Research B1)
- Terp deckt nur ~24 von ~82 lohnrelevanten Feldern ab (Research: Gap-Analyse)
- Employee-Detail-Seite hat 3 Tabs: Overview, Tariff Assignments, Personnel File (`src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx:137–221`)
- Hooks in `src/hooks/` — flaches Verzeichnis, Re-Export via `index.ts`
- Seed-Pattern in `supabase/seed.sql`: `ON CONFLICT DO NOTHING`, feste UUID-Namespaces

## Desired End State

Nach Abschluss aller vier Phasen:
1. **Alle** lohnrelevanten Stammdaten (inkl. exotische Sonderfälle) in Terp erfassbar, validiert, verschlüsselt
2. Template-basierte Export-Engine mit LiquidJS — beliebige Exportformate pro Mandant konfigurierbar
3. Mitgelieferte Standard-Templates für DATEV LODAS, DATEV LuG, Lexware, SAGE, generische CSV
4. Massenimport, Gehaltshistorie, Onboarding-Checkliste, Steuerberater-PDF

### Verification
- Template-Engine erzeugt korrekte DATEV-LODAS-Datei (importierbar via `Mandant > Daten übernehmen > ASCII-Import`)
- Sensible Felder (IBAN, Steuer-ID, SV-Nr) in der DB verschlüsselt (verifizierbar via `SELECT`)
- Neue Tabs berechtigungsgesteuert
- Custom Liquid Filter erzeugen DATEV-konforme Formatierung
- Sandboxing verhindert Filesystem-/Netzwerkzugriffe aus Templates

## What We're NOT Doing

- Brutto-Netto-Berechnung jeglicher Art
- Sozialversicherungsbeitragsberechnung
- Lohnsteuerermittlung
- Steuerliche Bewertung von Sachbezügen (1%-Regel, Pauschalbeträge etc.)
- ELStAM-Direktabruf
- DEÜV-Meldungen (SV-An-/Abmeldung, Jahresmeldung)
- A1-Bescheinigungs-Erstellung
- DATEV-API (REST) für Direktanbindung (braucht Marktplatz-Partnerschaft)
- DATEV Unternehmen Online Integration
- Pfändungs-Berechnung (nur Erfassung)
- Reisekosten-Erstattung
- Code-Execution in Templates (nur deklarative Liquid-Sprache)
- Filesystem- oder Netzwerk-Zugriffe aus Templates

---

## Architektur-Entscheidungen

### Entscheidung 1 — Template-Engine: LiquidJS

**Gewählt:** [LiquidJS](https://liquidjs.com/) v10.25.4 (aktuell stabil, April 2026)

**Begründung:**
- Sandboxed by default — kein Code-Execution-Risiko, keine eval(), keine Filesystem-Zugriffe
- Sprache für Nicht-Entwickler entwickelt (Shopify Shop-Betreiber), gut dokumentiert
- ~997.000 wöchentliche npm-Downloads, 525 abhängige Pakete
- First-class TypeScript-Support (geschrieben in TypeScript strict mode)
- Custom Filter via `engine.registerFilter()` — 40+ eingebaute Filter
- `ownPropertyOnly: true` (Default) verhindert Prototype-Chain-Traversal
- Aktive Wartung, mehrere Releases pro Monat

**KRITISCH — CVE-2026-30952 (High, CVSS 7.5):**
- Betrifft alle Versionen < 10.25.0
- Path Traversal via `layout`, `render`, `include` Tags — absolute Pfade konnten Root-Verzeichnis verlassen
- **Gefixt in 10.25.0** (März 2026)
- Für Terp: Risiko gering (Templates sind intern, nicht benutzerkontrolliert), aber Version >= 10.25.0 ist Pflicht
- PoC: [MorielHarush/CVE-2026-30952-PoC](https://github.com/MorielHarush/CVE-2026-30952-PoC)

**Sandboxing-Konfiguration:**
```typescript
const engine = new Liquid({
  // In-memory templates only — disables ALL filesystem access
  templates: templateMap,
  // Prevent prototype chain traversal
  ownPropertyOnly: true,
  // Strict mode for safer execution
  strictFilters: true,
  strictVariables: false, // Allow undefined vars (common in templates)
  // No globals
  globals: {},
})
```

**Custom Filter für DATEV:**
| Filter | Funktion | Beispiel |
|---|---|---|
| `datev_date` | Formatiert Datum als TT.MM.JJJJ oder TTMMJJJJ | `{{ employee.birthDate \| datev_date: "TT.MM.JJJJ" }}` |
| `datev_decimal` | Zahl mit Komma als Dezimaltrenner | `{{ value \| datev_decimal: 2 }}` → `1234,56` |
| `datev_string` | Escaped Strings für DATEV-Felder | `{{ name \| datev_string }}` |
| `pad_left` | Feste Feldlänge, links aufgefüllt | `{{ code \| pad_left: 5, "0" }}` → `00101` |
| `pad_right` | Feste Feldlänge, rechts aufgefüllt | `{{ name \| pad_right: 30, " " }}` |
| `mask_iban` | Maskierte IBAN-Anzeige | `{{ iban \| mask_iban }}` → `DE89****...****4567` |

**Quellen:** [LiquidJS Changelog](https://liquidjs.com/tutorials/changelog.html), [CVE-2026-30952 Advisory](https://advisories.gitlab.com/pkg/npm/liquidjs/CVE-2026-30952/)

### Entscheidung 2 — Verschlüsselung: Application-Level mit node:crypto

**Gewählt:** AES-256-GCM via `node:crypto` (built-in, keine externe Dependency)

**Evaluierte Alternativen:**

| Option | Bewertung |
|---|---|
| **pgsodium** | ❌ Seit Mitte 2024 "pending deprecation" bei Supabase. Offizielle Docs: "We do not recommend any new usage." Quelle: [Supabase Docs](https://supabase.com/docs/guides/database/extensions/pgsodium), [GitHub Discussion #27109](https://github.com/orgs/supabase/discussions/27109) |
| **Supabase Vault** | ❌ Für Secrets (API-Keys, Tokens), nicht für Anwendungsdaten. Kein Bulk-Encryption-Pattern. Quelle: [Supabase Vault Docs](https://supabase.com/docs/guides/database/vault) |
| **CipherStash Protect.js** | ❌ Externer KMS-Vendor-Lock-in. Overkill für ~200 MA/Mandant. |
| **Application-Level (node:crypto)** | ✅ Keine externe Abhängigkeit, FIPS-validated (OpenSSL), volle Kontrolle |

**DSGVO-Kriterien erfüllt:**
- **(a) Audit-tauglich:** Algorithmus, Schlüsselverwaltung, Zugriffsrechte dokumentierbar. Schlüssel getrennt von DB (Umgebungsvariable).
- **(b) Key-Rotation:** Versionsbasiert — jeder Wert trägt Schlüsselversion. Neue Daten mit neuem Key, alte lesbar bis migriert.
- **(c) Re-Encryption ohne Downtime:** Record-für-Record Hintergrund-Migration.

**Speicherformat:** `v{version}:{iv_base64}:{authTag_base64}:{ciphertext_base64}`

**Key-Management:**
- `FIELD_ENCRYPTION_KEY_V1=<base64-encoded 32-byte key>` als Umgebungsvariable
- `FIELD_ENCRYPTION_KEY_CURRENT_VERSION=1` bestimmt Schreibschlüssel
- Alte Keys bleiben zum Lesen verfügbar
- Produktion: Vercel Environment Variables (encrypted at rest)

**Verschlüsselte Felder:**
- `Employee.taxId`
- `Employee.socialSecurityNumber`
- `Employee.iban`
- `EmployeeSavings.recipientIban`
- `EmployeeGarnishment.creditorName`
- `EmployeeGarnishment.fileReference`

**Quellen:** [Supabase Secure Data Guide](https://supabase.com/docs/guides/database/secure-data), [GitHub Discussion #34497](https://github.com/orgs/supabase/discussions/34497)

### Entscheidung 3 — Stammdaten-Vollständigkeit: Maximum

Alle lohnrelevanten Stammdatenfelder, die in deutschen Lohnsystemen vorkommen können — auch exotische Sonderfälle. Im Zweifel ein Feld mehr.

**Tabelle vs. Feld am Employee — Abwägung:**

| Datenbereich | Entscheidung | Begründung |
|---|---|---|
| Schwerbehinderung (GdB, Gleichstellung, Merkzeichen, Ausweis) | **Felder am Employee** | 1:1-Beziehung, immer max. ein Datensatz pro MA |
| BG-Daten (Berufsgenossenschaft, Gefahrtarifstelle, Mitgliedsnr) | **Felder am Employee** | 1:1, selten mehr als eine BG pro MA |
| Renten-Status (Altersrente, Erwerbsminderung, Hinterbliebene) | **Felder am Employee** | 1:1, Status-Kennzeichen |
| Student/Azubi-Spezifika (Hochschule, Matrikelnr, Berufsschule) | **Felder am Employee** | 1:1, nur relevant bei PGR 102/105/106 |
| Kirchensteuer-Sonderfälle (Faktor IV/IV, konfessionsverschieden) | **Felder am Employee** | 1:1, Steuer-Erweiterung |
| Sterbegeld/Todesfall | **Felder am Employee** | 1:1, Sonderfall |
| Auslandstätigkeit (A1, Tätigkeitsstaat) | **Eigene Tabelle** | 1:n, MA kann mehrere Entsendungen haben |
| Mehrfachbeschäftigung | **Eigene Tabelle** | 1:n, mehrere Nebenbeschäftigungen möglich |
| Elternzeit | **Eigene Tabelle** (existiert) | 1:n, mehrere Perioden möglich |
| Mutterschutz | **Eigene Tabelle** (existiert) | 1:n |

### Entscheidung 4 — Keine steuerliche Berechnung von Sachbezügen

Export liefert **Roh-Daten**, keine berechneten geldwerten Vorteile:
- Dienstwagen: Bruttolistenpreis, Antriebsart, Entfernungs-km, Überlassungsart
- Jobrad: Bruttolistenpreis, Überlassungsart
- Essenszuschuss: Tagessatz × Arbeitstage (einfache Multiplikation erlaubt)
- Sachgutscheine/Jobticket: Monatsbetrag direkt
- bAV: AN-Beitrag, AG-Beitrag, Pflicht-AG-Zuschuss separat
- VL: AN- und AG-Anteile separat

### Entscheidung 5 — Lohnart-Mapping pro Mandant mit Defaults

`DefaultPayrollWage` (Seed) + `TenantPayrollWage` (pro Mandant kopiert). Templates referenzieren Lohnart-Codes über das Kontext-Objekt.

---

## Phase 1: Stammdaten-Fundament

### Overview
Alle lohnrelevanten Stammdaten können in Terp erfasst, validiert und sicher gespeichert werden. Vollständig im Sinne von "alles, was deutsche Lohnabrechnung jemals brauchen könnte". Nach Phase 1 produktiv nutzbar für Stammdatenpflege.

**Geschätzter Aufwand: 14–18 Implementierungstage**

---

### 1.1 Verschlüsselungs-Utility

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
  const keys: EncryptionKey[] = []
  for (let v = 1; v <= 10; v++) {
    const envKey = process.env[`FIELD_ENCRYPTION_KEY_V${v}`]
    if (envKey) {
      keys.push({ version: v, key: Buffer.from(envKey, "base64") })
    }
  }
  if (keys.length === 0) {
    throw new Error("No encryption keys configured. Set FIELD_ENCRYPTION_KEY_V1.")
  }
  return keys
}

function getCurrentKey(): EncryptionKey {
  const currentVersion = parseInt(process.env.FIELD_ENCRYPTION_KEY_CURRENT_VERSION ?? "1")
  const keys = getKeys()
  const key = keys.find(k => k.version === currentVersion)
  if (!key) throw new Error(`Current encryption key version ${currentVersion} not found`)
  return key
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
  const allKeys = getKeys()
  const keyEntry = allKeys.find(k => k.version === version)
  if (!keyEntry) throw new Error(`Encryption key version ${version} not found`)
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")
  const encrypted = Buffer.from(encryptedB64, "base64")
  const decipher = createDecipheriv(ALGORITHM, keyEntry.key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted) + decipher.final("utf8")
}

export function isEncrypted(value: string): boolean {
  return /^v\d+:/.test(value)
}

export function hashField(plaintext: string): string {
  // HMAC-SHA256 for exact-match index (future use)
  const { key } = getCurrentKey()
  const { createHmac } = require("node:crypto")
  return createHmac("sha256", key).update(plaintext).digest("base64")
}
```

**Neue Umgebungsvariable in `src/lib/config.ts`:**
- `FIELD_ENCRYPTION_KEY_V1` — Pflicht, zu `validateEnv()` required-Array hinzufügen
- `FIELD_ENCRYPTION_KEY_CURRENT_VERSION` — Optional, Default "1"
- In `.env.local`: fester Test-Key (`openssl rand -base64 32`)

**Tests:** `src/lib/services/__tests__/field-encryption.test.ts`
- Encrypt → Decrypt Round-Trip
- Verschiedene Schlüsselversionen (V1 verschlüsselt, V2 entschlüsselt V1-Daten)
- Ungültiger Schlüssel → Fehler
- Leerer String
- Unicode-Zeichen (Umlaute: ä, ö, ü, ß)
- `isEncrypted` erkennt verschlüsselte und unverschlüsselte Werte
- Manipulierter Ciphertext → Auth-Tag-Fehler

---

### 1.2 Database Migration — Employee-Tabelle erweitern

**Neue Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_payroll_master_data_to_employee.sql`

```sql
-- ═══════════════════════════════════════════════════
-- STEUERLICHE DATEN
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN tax_id TEXT;                          -- verschlüsselt (Steuer-IdNr, 11-stellig)
ALTER TABLE employees ADD COLUMN tax_class SMALLINT;                   -- 1-6
ALTER TABLE employees ADD COLUMN tax_factor DECIMAL(5,4);              -- Faktor bei Steuerklasse IV/IV (z.B. 0,9450)
ALTER TABLE employees ADD COLUMN child_tax_allowance DECIMAL(4,2);     -- z.B. 1.5
ALTER TABLE employees ADD COLUMN denomination VARCHAR(3);              -- ev, rk, la, er, lt, rf, fg, fr, fs, fa, ak, ib, jd
ALTER TABLE employees ADD COLUMN spouse_denomination VARCHAR(3);       -- Konfession Ehepartner (für konfessionsverschiedene Ehe/KiSt-Splitting)
ALTER TABLE employees ADD COLUMN payroll_tax_allowance DECIMAL(10,2);  -- ELStAM-Freibetrag (§ 39a EStG)
ALTER TABLE employees ADD COLUMN payroll_tax_addition DECIMAL(10,2);   -- ELStAM-Hinzurechnungsbetrag
ALTER TABLE employees ADD COLUMN is_primary_employer BOOLEAN DEFAULT true;  -- Haupt-/Nebenarbeitgeber

-- ═══════════════════════════════════════════════════
-- SOZIALVERSICHERUNG
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN social_security_number TEXT;          -- verschlüsselt (RVNR, 12-stellig)
ALTER TABLE employees ADD COLUMN health_insurance_provider_id UUID REFERENCES health_insurance_providers(id);
ALTER TABLE employees ADD COLUMN health_insurance_status VARCHAR(20);  -- mandatory, voluntary, private
ALTER TABLE employees ADD COLUMN private_health_insurance_contribution DECIMAL(10,2);  -- PKV-Beitrag (bei Status "private")
ALTER TABLE employees ADD COLUMN personnel_group_code VARCHAR(3);     -- PGR 3-stellig (101, 102, etc.)
ALTER TABLE employees ADD COLUMN contribution_group_code VARCHAR(4);  -- BGS 4-stellig (1111, 6500, etc.)
ALTER TABLE employees ADD COLUMN activity_code VARCHAR(9);            -- 9-stellig KldB 2010
ALTER TABLE employees ADD COLUMN midijob_flag SMALLINT DEFAULT 0;     -- 0=Nein, 1=Gleitzoner, 2=Midijob
ALTER TABLE employees ADD COLUMN umlage_u1 BOOLEAN DEFAULT true;      -- Umlagepflicht U1
ALTER TABLE employees ADD COLUMN umlage_u2 BOOLEAN DEFAULT true;      -- Umlagepflicht U2

-- ═══════════════════════════════════════════════════
-- BANKVERBINDUNG
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN iban TEXT;                            -- verschlüsselt
ALTER TABLE employees ADD COLUMN bic VARCHAR(11);
ALTER TABLE employees ADD COLUMN account_holder VARCHAR(200);

-- ═══════════════════════════════════════════════════
-- PERSÖNLICHE DATEN (ERGÄNZUNG)
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN birth_name VARCHAR(100);              -- Geburtsname (Basis für RVNR-Buchstabe)
ALTER TABLE employees ADD COLUMN house_number VARCHAR(20);             -- Separates Hausnummer-Feld (DATEV)

-- ═══════════════════════════════════════════════════
-- VERGÜTUNG
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN gross_salary DECIMAL(10,2);           -- Bruttogehalt/Monat
ALTER TABLE employees ADD COLUMN hourly_rate DECIMAL(10,2);            -- Stundenlohn
ALTER TABLE employees ADD COLUMN payment_type VARCHAR(20);             -- monthly_salary, hourly_wage, commission
ALTER TABLE employees ADD COLUMN salary_group VARCHAR(50);             -- Gehaltsgruppe / Tarifgruppe

-- ═══════════════════════════════════════════════════
-- VERTRAGSDATEN (ERGÄNZUNG)
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN contract_type VARCHAR(30);            -- permanent, fixed_term_no_reason, fixed_term_with_reason
ALTER TABLE employees ADD COLUMN probation_months SMALLINT;            -- Probezeit in Monaten
ALTER TABLE employees ADD COLUMN notice_period_employee VARCHAR(50);   -- Kündigungsfrist AN
ALTER TABLE employees ADD COLUMN notice_period_employer VARCHAR(50);   -- Kündigungsfrist AG

-- ═══════════════════════════════════════════════════
-- SCHWERBEHINDERUNG
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN disability_degree SMALLINT;           -- Grad der Behinderung (20-100), NULL wenn kein GdB
ALTER TABLE employees ADD COLUMN disability_equal_status BOOLEAN DEFAULT false;  -- Gleichstellung (GdB 30-49)
ALTER TABLE employees ADD COLUMN disability_markers VARCHAR(20);       -- Merkzeichen (G, aG, H, Bl, TBl, etc.) kommasepariert
ALTER TABLE employees ADD COLUMN disability_id_valid_until DATE;       -- Ausweis gültig bis

-- ═══════════════════════════════════════════════════
-- BERUFSGENOSSENSCHAFT
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN bg_institution VARCHAR(200);          -- Name der Berufsgenossenschaft
ALTER TABLE employees ADD COLUMN bg_membership_number VARCHAR(30);     -- Mitgliedsnummer
ALTER TABLE employees ADD COLUMN bg_hazard_tariff VARCHAR(10);         -- Gefahrtarifstelle

-- ═══════════════════════════════════════════════════
-- STUDENTEN / AZUBI-SPEZIFIKA
-- ═══════════════════════════════════════════════════
ALTER TABLE employees ADD COLUMN university VARCHAR(200);              -- Hochschule (bei PGR 106 Werkstudent)
ALTER TABLE employees ADD COLUMN student_id VARCHAR(30);               -- Matrikelnummer
ALTER TABLE employees ADD COLUMN field_of_study VARCHAR(100);          -- Studienfach
ALTER TABLE employees ADD COLUMN apprenticeship_occupation VARCHAR(200); -- Ausbildungsberuf (bei PGR 102)
ALTER TABLE employees ADD COLUMN apprenticeship_external_company VARCHAR(200); -- Ausbildungsbetrieb falls extern
ALTER TABLE employees ADD COLUMN vocational_school VARCHAR(200);       -- Berufsschule

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
ALTER TABLE employees ADD COLUMN heir_iban TEXT;                       -- verschlüsselt

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
```

**Hinweis:** `health_insurance_provider_id` ist FK — `health_insurance_providers` muss in gleicher oder vorheriger Migration erstellt werden (siehe 1.3).

---

### 1.3 Database Migration — Neue Tabellen

**Gleiche oder separate Migration:**

```sql
-- ═══════════════════════════════════════════════════
-- LOOKUP-TABELLEN (global, nicht mandantenspezifisch)
-- ═══════════════════════════════════════════════════

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
    code VARCHAR(3) PRIMARY KEY,
    description TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- KldB 2010 Tätigkeitsschlüssel (5-Steller-Ebene)
CREATE TABLE activity_codes_kldb (
    code VARCHAR(5) PRIMARY KEY,           -- 5-stelliger KldB-2010-Code
    name VARCHAR(300) NOT NULL,            -- Berufsbezeichnung
    category VARCHAR(100),                 -- Berufssegment
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
    tax_allowance_share DECIMAL(3,1) DEFAULT 0.5,  -- Freibetragsanteil (0.5 oder 1.0)
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
    list_price DECIMAL(10,2) NOT NULL,            -- Bruttolistenpreis
    propulsion_type VARCHAR(20) NOT NULL,         -- combustion, hybrid, electric
    distance_to_work_km DECIMAL(5,1) NOT NULL,    -- Entfernung Wohnung-Arbeit
    usage_type VARCHAR(20) NOT NULL,              -- private_use, commute_only
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
    usage_type VARCHAR(30) NOT NULL,              -- salary_conversion, additional
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
    is_additional BOOLEAN NOT NULL DEFAULT true,  -- zusätzlich zum Lohn = steuerfrei
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
    execution_type VARCHAR(30) NOT NULL,          -- direct_insurance, pension_fund, pension_scheme, direct_commitment, support_fund
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
    investment_type VARCHAR(50) NOT NULL,          -- building_savings, fund_savings, bank_savings
    recipient VARCHAR(200) NOT NULL,
    recipient_iban TEXT,                           -- verschlüsselt
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
    creditor_name TEXT NOT NULL,                   -- verschlüsselt
    creditor_address TEXT,
    file_reference TEXT,                           -- verschlüsselt (Aktenzeichen)
    garnishment_amount DECIMAL(10,2) NOT NULL,
    calculation_method VARCHAR(30) NOT NULL,       -- fixed_amount, table_based
    dependents_count INT NOT NULL DEFAULT 0,       -- Unterhaltsberechtigte
    rank INT NOT NULL DEFAULT 1,                   -- Rangfolge
    is_p_account BOOLEAN DEFAULT false,            -- Pfändungsschutzkonto
    maintenance_obligation BOOLEAN DEFAULT false,  -- Unterhaltspfändung
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
    is_partner_months BOOLEAN DEFAULT false,       -- Partnermonate
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
    country_code VARCHAR(2) NOT NULL,             -- ISO 3166-1 alpha-2
    country_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    a1_certificate_number VARCHAR(50),
    a1_valid_from DATE,
    a1_valid_until DATE,
    foreign_activity_exemption BOOLEAN DEFAULT false,  -- Auslandstätigkeitserlass
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
    monthly_income DECIMAL(10,2),                 -- Einkommen beim anderen AG (falls bekannt)
    weekly_hours DECIMAL(5,2),                    -- Wochenstunden beim anderen AG
    is_minijob BOOLEAN DEFAULT false,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_other_employments_employee ON employee_other_employments(employee_id);
```

---

### 1.4 Prisma-Schema aktualisieren

**Datei:** `prisma/schema.prisma`

Alle neuen Spalten und Tabellen aus 1.2 und 1.3 im Schema ergänzen. Konventionen:
- `@map("snake_case")` für Spalten, `@@map("table_name")` für Tabellen
- `@db.Decimal(x,y)` für Dezimalfelder
- `@db.Text` für verschlüsselte Felder
- `@db.VarChar(n)` für String-Felder mit Längenbeschränkung
- Relations mit `onDelete: Cascade` für Employee-FK

Neue Models:
- `HealthInsuranceProvider`
- `PersonnelGroupCode`
- `ActivityCodeKldb`
- `BgInstitution`
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
- `EmployeeForeignAssignment`
- `EmployeeOtherEmployment`

Auf `Employee`:
- Alle neuen Spalten als Felder
- Relations zu allen neuen Tabellen (1:n)
- Relation zu `HealthInsuranceProvider` (n:1)

Nach Schema-Änderung: `pnpm db:generate`

---

### 1.5 Stammdaten-Tabellen seeden

**Datei:** `supabase/seed.sql` (am Ende anfügen)

#### 1.5.1 Krankenkassen (~93 aktive GKV-Kassen)

**Datenquelle:** ITSG Stammdatendatei (XML, täglich aktualisiert) von [download.gkv-ag.de](https://download.gkv-ag.de/). Stand April 2026: 93 Krankenkassen (Quelle: [GKV-Spitzenverband](https://www.gkv-spitzenverband.de/service/krankenkassenliste/krankenkassen.jsp)). Die Spezifikation (V3.0.0) dokumentiert das XML-Schema: [Spezifikation PDF](https://gkv-ag.de/wp-content/uploads/2025/10/2025-10-07_Spezifikation-Stammdatendatei300_V3.0.pdf).

**Für den Seed:** Die ~93 aktiven Kassen plus Minijob-Zentrale manuell aus GKV-Spitzenverband-Daten extrahieren. Vollständige Liste mit IK-Nummern in der Migration.

```sql
INSERT INTO health_insurance_providers (id, name, institution_code) VALUES
  (gen_random_uuid(), 'AOK Baden-Württemberg', '108018007'),
  (gen_random_uuid(), 'AOK Bayern', '108310400'),
  -- ... alle ~93 Kassen + Minijob-Zentrale
  (gen_random_uuid(), 'Minijob-Zentrale', '980000009')
ON CONFLICT (institution_code) DO NOTHING;
```

#### 1.5.2 Personengruppenschlüssel (~20 Codes)

**Datenquelle:** [DEÜV Anlage 2, Version 8.01](https://www.gkv-datenaustausch.de/media/dokumente/arbeitgeber/deuev/rundschreiben_anlagen/03_Anlage_2_Vers._8.01.pdf) (PDF, selten aktualisiert, ca. alle 3-5 Jahre).

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
  ('190', 'Beschäftigte ohne Zuordnung zu einem anderen PGR')
ON CONFLICT (code) DO NOTHING;
```

#### 1.5.3 KldB 2010 Tätigkeitsschlüssel (~1.300 Einträge)

**Datenquelle:** [Bundesagentur für Arbeit — Arbeitsmittel](https://statistik.arbeitsagentur.de/DE/Navigation/Grundlagen/Klassifikationen/Klassifikation-der-Berufe/KldB2010-Fassung2020/Arbeitsmittel/Arbeitsmittel-Nav.html) (XLSX, ~1.300 Zeilen auf 5-Steller-Ebene). Kein CSV/JSON offiziell publiziert — XLSX muss einmalig konvertiert werden.

**Vorgehen:** XLSX herunterladen, in JSON/CSV transformieren (einmaliges ETL-Skript), als SQL-INSERT in die Migration aufnehmen.

```sql
INSERT INTO activity_codes_kldb (code, name, category) VALUES
  ('01104', 'Berufe in der Landwirtschaft (ohne Spezialisierung) — Helfer', 'Land-, Forst- und Tierwirtschaft'),
  ('11102', 'Berufe in der Gartenbau — Fachkraft', 'Land-, Forst- und Tierwirtschaft'),
  -- ... ~1.300 Einträge
ON CONFLICT (code) DO NOTHING;
```

**GIN-Index** auf `to_tsvector('german', name)` ermöglicht Volltextsuche für das Autocomplete.

#### 1.5.4 Berufsgenossenschaften (~9 Stück)

```sql
INSERT INTO bg_institutions (id, name, abbreviation) VALUES
  (gen_random_uuid(), 'Berufsgenossenschaft Rohstoffe und chemische Industrie', 'BG RCI'),
  (gen_random_uuid(), 'Berufsgenossenschaft Holz und Metall', 'BGHM'),
  (gen_random_uuid(), 'Berufsgenossenschaft Energie Textil Elektro Medienerzeugnisse', 'BG ETEM'),
  (gen_random_uuid(), 'Berufsgenossenschaft Nahrungsmittel und Gastgewerbe', 'BGN'),
  (gen_random_uuid(), 'Berufsgenossenschaft der Bauwirtschaft', 'BG BAU'),
  (gen_random_uuid(), 'Berufsgenossenschaft Handel und Warenlogistik', 'BGHW'),
  (gen_random_uuid(), 'Verwaltungs-Berufsgenossenschaft', 'VBG'),
  (gen_random_uuid(), 'Berufsgenossenschaft Verkehrswirtschaft Post-Logistik Telekommunikation', 'BG Verkehr'),
  (gen_random_uuid(), 'Berufsgenossenschaft für Gesundheitsdienst und Wohlfahrtspflege', 'BGW')
ON CONFLICT DO NOTHING;
```

#### 1.5.5 Personalakte-Kategorien erweitern

Neue Kategorien zum bestehenden Seed hinzufügen (nach den 7 existierenden, `supabase/seed.sql:3606–3617`):

```sql
INSERT INTO hr_personnel_file_categories (id, tenant_id, name, code, color, sort_order, visible_to_roles) VALUES
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Sozialversicherungsausweis', 'SV_AUSWEIS', '#0891B2', 8, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Mitgliedsbescheinigung KK', 'KK_BESCHEINIGUNG', '#0D9488', 9, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Lohnsteuerbescheinigung Vorjahr', 'LOHNSTEUER_VORJAHR', '#4F46E5', 10, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Personalausweis', 'PERSONALAUSWEIS', '#7C3AED', 11, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Aufenthaltstitel', 'AUFENTHALT', '#DB2777', 12, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Schwerbehindertenausweis', 'SB_AUSWEIS', '#E11D48', 13, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Pfändungsbeschluss', 'PFAENDUNG', '#DC2626', 14, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'bAV-Vertrag', 'BAV_VERTRAG', '#EA580C', 15, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Arbeitsvertrag', 'ARBEITSVERTRAG', '#CA8A04', 16, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Nachweisgesetz-Dokument', 'NACHWEIS', '#65A30D', 17, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'A1-Bescheinigung', 'A1_BESCHEINIGUNG', '#059669', 18, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'BG-Bescheinigung', 'BG_BESCHEINIGUNG', '#2563EB', 19, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Elternzeit-Antrag', 'ELTERNZEIT_ANTRAG', '#7C3AED', 20, ARRAY['admin', 'hr']),
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 'Mutterschutz-Bescheinigung', 'MUTTERSCHUTZ_BESCHEINIGUNG', '#DB2777', 21, ARRAY['admin', 'hr'])
ON CONFLICT DO NOTHING;
```

---

### 1.6 Validierungen

**Neue Datei:** `src/lib/services/payroll-validators.ts`

| Validator | Algorithmus | Quelle |
|---|---|---|
| `validateIban(iban)` | Format + MOD-97 (ISO 13616) | DE=22 Zeichen, erste 4 ans Ende, Buchstaben→Zahlen, Mod 97=1 |
| `validateSocialSecurityNumber(ssn)` | 12-stellig, Faktoren 2,1,2,5,7,1,2,1,2,1,2,1; Quersummen; Mod 10 | [lohn-info.de](https://www.lohn-info.de) |
| `validateTaxId(taxId)` | 11-stellig, Mod-10/Mod-11 (BZSt) | [ELSTER-Spezifikation](https://download.elster.de/download/schnittstellen/Pruefung_der_Steuer_und_Steueridentifikatsnummer.pdf) |
| `validateContributionGroupCode(code)` | 4-stellig; Pos.1: 0,1,3,4,5,6,9; Pos.2: 0,1,3,5; Pos.3: 0,1,2; Pos.4: 0,1,2 | [lohn-info.de/beitragsgruppenschluessel](https://www.lohn-info.de/beitragsgruppenschluessel.html) |
| `validateActivityCode(code)` | 9-stellig; Pos.1-5 KldB-Code, Pos.6 Schulbildung, Pos.7 Berufsbildung, Pos.8 Leiharbeit, Pos.9 Vertragsform | [BA Tätigkeitsschlüssel](https://www.arbeitsagentur.de/unternehmen/betriebsnummern-service/taetigkeitsschluessel) |
| `validateTaxClass(taxClass)` | 1-6 | Enum |
| `validateBirthDate(birthDate)` | Nicht in Zukunft, nicht > 120 Jahre alt | |
| `validateEntryVsBirthDate(entry, birth)` | Mind. 15 Jahre Differenz | |
| `validatePersonnelGroupCode(code)` | Lookup gegen bekannte Codes (101-190) | DEÜV Anlage 2 |
| `validateHealthInsuranceCode(code)` | IK-Nummer: 9-stellig, numerisch | |

**Steuer-ID-Validierung:** npm-Paket `german-tax-id-validator` (TypeScript, 1KB, zero dependencies, unterstützt pre/post-2016 IDs) existiert. **Empfehlung:** Eigene Implementierung (~20 Zeilen) nach ELSTER-Spezifikation, um externe Dependency zu vermeiden. Algorithmus:

1. Genau 11 Ziffern, erste Ziffer ≠ 0
2. In den ersten 10 Ziffern: genau eine Ziffer kommt doppelt vor, eine fehlt
3. Prüfziffer (11. Stelle): Iterative Kettenberechnung — `summand=10`, pro Ziffer: `product = (summand + digit) % 10`, wenn 0 dann 10; `summand = (product * 2) % 11`; Prüfziffer = `11 - summand`, wenn 10 dann 0

**Quellen:** [kryptografie.de/steuer-id](https://kryptografie.de/kryptografie/chiffre/steuer-id.htm), [ELSTER PDF](https://download.elster.de/download/schnittstellen/Pruefung_der_Steuer_und_Steueridentifikatsnummer.pdf)

**Tests:** `src/lib/services/__tests__/payroll-validators.test.ts`
- Pro Validator: gültige Eingaben, ungültige Prüfziffer, falsche Länge, ungültige Zeichen, Grenzfälle

---

### 1.7 Berechtigungen

**Datei:** `src/lib/auth/permission-catalog.ts` — Neue Einträge in `ALL_PERMISSIONS`:

```typescript
p("personnel.payroll_data.view", "personnel", "payroll_data.view", "View employee payroll master data (tax, social security, bank details)"),
p("personnel.payroll_data.edit", "personnel", "payroll_data.edit", "Edit employee payroll master data"),
p("personnel.garnishment.view", "personnel", "garnishment.view", "View employee garnishment data"),
p("personnel.garnishment.edit", "personnel", "garnishment.edit", "Edit employee garnishment data"),
p("personnel.foreign_assignment.view", "personnel", "foreign_assignment.view", "View employee foreign assignment data"),
p("personnel.foreign_assignment.edit", "personnel", "foreign_assignment.edit", "Edit employee foreign assignment data"),
```

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_add_payroll_data_permissions.sql` — UUIDs via UUID v5 mit Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`.

**Standard-Zuweisung:**
- `admin`: alle 6 neuen Permissions
- `hr`: `personnel.payroll_data.view`, `personnel.payroll_data.edit` (keine Pfändungen, keine Auslandstätigkeit)

**Test:** `src/trpc/routers/__tests__/permission-catalog.test.ts` erweitern.

---

### 1.8 Service Layer

#### 1.8.1 Employee Service erweitern

**Datei:** `src/lib/services/employees-service.ts`

- `update()`: neue Felder aufnehmen, Verschlüsselung für `taxId`, `socialSecurityNumber`, `iban`, `heirIban` vor Schreiben
- Validierung neuer Felder via `payroll-validators.ts`
- Audit-Log: verschlüsselte Felder als `"[encrypted]"` loggen, nicht im Klartext
- `fieldsToTrack`: alle neuen Felder aufnehmen

**Datei:** `src/lib/services/employees-repository.ts`

- `findByIdWithRelations()`: neue Relations includen (healthInsuranceProvider, children, companyCars, jobBikes, mealAllowances, vouchers, jobTickets, pensions, savings, garnishments, parentalLeaves, maternityLeaves, foreignAssignments, otherEmployments)
- Entschlüsselung im Service-Layer nach dem Lesen

#### 1.8.2 Neue Sub-Domain Services

Pro neue Tabelle ein Service/Repository-Paar nach bestehendem Pattern (vgl. `employee-contacts-service.ts`):

| Service | Repository | Tabelle | Verschlüsselte Felder |
|---|---|---|---|
| `employee-children-service.ts` | `employee-children-repository.ts` | EmployeeChild | — |
| `employee-company-cars-service.ts` | `employee-company-cars-repository.ts` | EmployeeCompanyCar | — |
| `employee-job-bikes-service.ts` | `employee-job-bikes-repository.ts` | EmployeeJobBike | — |
| `employee-meal-allowances-service.ts` | `employee-meal-allowances-repository.ts` | EmployeeMealAllowance | — |
| `employee-vouchers-service.ts` | `employee-vouchers-repository.ts` | EmployeeVoucher | — |
| `employee-job-tickets-service.ts` | `employee-job-tickets-repository.ts` | EmployeeJobTicket | — |
| `employee-pensions-service.ts` | `employee-pensions-repository.ts` | EmployeePension | — |
| `employee-savings-service.ts` | `employee-savings-repository.ts` | EmployeeSavings | `recipientIban` |
| `employee-garnishments-service.ts` | `employee-garnishments-repository.ts` | EmployeeGarnishment | `creditorName`, `fileReference` |
| `employee-parental-leaves-service.ts` | `employee-parental-leaves-repository.ts` | EmployeeParentalLeave | — |
| `employee-maternity-leaves-service.ts` | `employee-maternity-leaves-repository.ts` | EmployeeMaternityLeave | — |
| `employee-foreign-assignments-service.ts` | `employee-foreign-assignments-repository.ts` | EmployeeForeignAssignment | — |
| `employee-other-employments-service.ts` | `employee-other-employments-repository.ts` | EmployeeOtherEmployment | — |

Jeder Service: `list`, `getById`, `create`, `update`, `remove` mit Audit-Log und Tenant-Scoping.

---

### 1.9 tRPC Router

#### 1.9.1 Employee Router erweitern (`src/trpc/routers/employees.ts`)

- `getById`: Output um alle neuen Felder (nach Entschlüsselung). Payroll-Felder nur wenn `personnel.payroll_data.view` berechtigt.
- `create`/`update`: Input um alle neuen Felder. Payroll-Felder nur setzbar mit `personnel.payroll_data.edit`.

#### 1.9.2 Neue Sub-Router (je `list`, `create`, `update`, `delete`)

| Router-Datei | Permission |
|---|---|
| `employeeChildren.ts` | `personnel.payroll_data.view/edit` |
| `employeeCompanyCars.ts` | `personnel.payroll_data.view/edit` |
| `employeeJobBikes.ts` | `personnel.payroll_data.view/edit` |
| `employeeMealAllowances.ts` | `personnel.payroll_data.view/edit` |
| `employeeVouchers.ts` | `personnel.payroll_data.view/edit` |
| `employeeJobTickets.ts` | `personnel.payroll_data.view/edit` |
| `employeePensions.ts` | `personnel.payroll_data.view/edit` |
| `employeeSavings.ts` | `personnel.payroll_data.view/edit` |
| `employeeGarnishments.ts` | `personnel.garnishment.view/edit` |
| `employeeParentalLeaves.ts` | `personnel.payroll_data.view/edit` |
| `employeeMaternityLeaves.ts` | `personnel.payroll_data.view/edit` |
| `employeeForeignAssignments.ts` | `personnel.foreign_assignment.view/edit` |
| `employeeOtherEmployments.ts` | `personnel.payroll_data.view/edit` |
| `healthInsuranceProviders.ts` | `personnel.payroll_data.view` (read-only Lookup) |
| `activityCodesKldb.ts` | öffentlich (Lookup, Autocomplete) |

Alle im Root-Router `src/trpc/routers/_app.ts` registrieren.

---

### 1.10 Frontend Hooks

**Neue Hook-Dateien** (eine pro Sub-Domain, Pattern wie `use-employee-contacts.ts`):

| Hook-Datei | Exports |
|---|---|
| `use-employee-children.ts` | `useEmployeeChildren`, `useCreateEmployeeChild`, `useUpdateEmployeeChild`, `useDeleteEmployeeChild` |
| `use-employee-company-cars.ts` | analog |
| `use-employee-job-bikes.ts` | analog |
| `use-employee-meal-allowances.ts` | analog |
| `use-employee-vouchers.ts` | analog |
| `use-employee-job-tickets.ts` | analog |
| `use-employee-pensions.ts` | analog |
| `use-employee-savings.ts` | analog |
| `use-employee-garnishments.ts` | analog |
| `use-employee-parental-leaves.ts` | analog |
| `use-employee-maternity-leaves.ts` | analog |
| `use-employee-foreign-assignments.ts` | analog |
| `use-employee-other-employments.ts` | analog |
| `use-health-insurance-providers.ts` | `useHealthInsuranceProviders` (Dropdown) |
| `use-activity-codes-kldb.ts` | `useActivityCodesKldb(search)` (Autocomplete) |

Alle in `src/hooks/index.ts` re-exportieren.

---

### 1.11 UI — Mitarbeiter-Detailseite Tabs

**Datei:** `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

Bestehende Tabs bleiben. Neue Tabs:

```
Overview | Tariff Assignments | Steuern & SV | Bankverbindung | Vergütung | Familie | Zusatzleistungen | Schwerbehinderung | Auslandstätigkeit | Pfändungen | Spezialfälle | Personnel File
```

**Tab-Sichtbarkeit:**
- "Steuern & SV", "Bankverbindung", "Vergütung", "Familie", "Zusatzleistungen", "Schwerbehinderung", "Spezialfälle": `personnel.payroll_data.view`
- "Auslandstätigkeit": `personnel.foreign_assignment.view`
- "Pfändungen": `personnel.garnishment.view`

#### 1.11.1 Tab "Steuern & SV"
**Datei:** `src/components/employees/payroll/tax-social-security-tab.tsx`

Felder:
- Steuer-ID (Input, maskiert bis Klick "Anzeigen")
- Steuerklasse (Select: 1-6)
- Faktor bei IV/IV (Number Input, nur bei Steuerklasse 4)
- Kinderfreibeträge (Number Input, step 0.5)
- Konfession (Select: ev, rk, la, er, lt, rf, fg, fr, fs, fa, ak, ib, jd — mit deutschen Labels)
- Konfession Ehepartner (Select, gleiche Werte)
- ELStAM-Freibetrag (Number Input)
- ELStAM-Hinzurechnung (Number Input)
- Haupt-/Nebenarbeitgeber (Switch)
- Geburtsname (Input)
- SV-Nummer (Input, maskiert)
- Krankenkasse (Combobox mit Suche gegen HealthInsuranceProvider)
- KV-Status (Select: Pflicht, Freiwillig, Privat)
- PKV-Beitrag (Number, nur bei "Privat")
- PGR (Select gegen PersonnelGroupCode)
- BGS (4× einzelne Select: KV, RV, AV, PV)
- Tätigkeitsschlüssel (Autocomplete gegen ActivityCodeKldb, siehe 1.12)
- Midijob (Select: 0=Nein, 1=Gleitzoner, 2=Midijob)
- Umlagepflicht U1/U2 (Toggles)

#### 1.11.2 Tab "Bankverbindung"
**Datei:** `src/components/employees/payroll/bank-details-tab.tsx`

IBAN (maskiert, mit Formatierung), BIC, Kontoinhaber.

#### 1.11.3 Tab "Vergütung"
**Datei:** `src/components/employees/payroll/compensation-tab.tsx`

Entgeltart (Select), Bruttogehalt (Number), Stundenlohn (Number), Gehaltsgruppe (Input), Hausnummer (Input).

#### 1.11.4 Tab "Familie"
**Datei:** `src/components/employees/payroll/family-tab.tsx`

Sub-Bereiche mit Tabellen und Sheet-Forms:
- Kinder (EmployeeChild)
- Elternzeit (EmployeeParentalLeave)
- Mutterschutz (EmployeeMaternityLeave)
- Elterngeld-Status (Employee-Felder)

#### 1.11.5 Tab "Zusatzleistungen"
**Datei:** `src/components/employees/payroll/benefits-tab.tsx`

Sub-Bereiche (Card-Abschnitte mit eigenem Add/Edit/Delete):
- Dienstwagen, Jobrad, Essenszuschuss, Sachgutscheine, Jobticket, bAV, VL

#### 1.11.6 Tab "Schwerbehinderung"
**Datei:** `src/components/employees/payroll/disability-tab.tsx`

GdB (Number 20-100), Gleichstellung (Toggle), Merkzeichen (Multi-Select: G, aG, H, Bl, TBl, RF, 1.Kl., B, GL), Ausweis gültig bis (Date).

#### 1.11.7 Tab "Auslandstätigkeit"
**Datei:** `src/components/employees/payroll/foreign-assignments-tab.tsx`

Tabelle: EmployeeForeignAssignment (Land, Von, Bis, A1-Nr, A1-Gültig, Erlass). Sheet-Form.

#### 1.11.8 Tab "Pfändungen"
**Datei:** `src/components/employees/payroll/garnishments-tab.tsx`

Tabelle: EmployeeGarnishment. Sheet-Form.

#### 1.11.9 Tab "Spezialfälle"
**Datei:** `src/components/employees/payroll/special-cases-tab.tsx`

Gruppen:
- Renten-Status (Toggles + Datum)
- BG-Daten (Institution, Mitgliedsnr, Gefahrtarifstelle)
- Mehrfachbeschäftigung (EmployeeOtherEmployment Tabelle)
- Studenten-/Azubi-Daten (konditional bei PGR 102/105/106)
- Sterbegeld/Todesfall (konditional)

#### 1.11.10 Sheet-Formulare

Pro Sub-Tabelle ein Sheet-Formular in `src/components/employees/payroll/`:
- `employee-child-form-sheet.tsx`
- `employee-company-car-form-sheet.tsx`
- `employee-job-bike-form-sheet.tsx`
- `employee-meal-allowance-form-sheet.tsx`
- `employee-voucher-form-sheet.tsx`
- `employee-job-ticket-form-sheet.tsx`
- `employee-pension-form-sheet.tsx`
- `employee-savings-form-sheet.tsx`
- `employee-garnishment-form-sheet.tsx`
- `employee-parental-leave-form-sheet.tsx`
- `employee-maternity-leave-form-sheet.tsx`
- `employee-foreign-assignment-form-sheet.tsx`
- `employee-other-employment-form-sheet.tsx`

---

### 1.12 KldB-Tätigkeitsschlüssel: Autocomplete-UI

**Datei:** `src/components/employees/payroll/activity-code-combobox.tsx`

Combobox mit Volltextsuche gegen `ActivityCodeKldb`-Tabelle. Suche nach Berufsbezeichnung (deutsch), nicht nur Code. GIN-Index auf `to_tsvector('german', name)` ermöglicht performante Suche über ~1.300 Einträge.

**tRPC-Procedure:** `activityCodesKldb.search` — Input: `{ query: string, limit?: number }`, Output: `{ code, name, category }[]`. Server-side `WHERE to_tsvector('german', name) @@ plainto_tsquery('german', :query) OR code LIKE :query%`.

**UX:** Benutzer tippt Berufsbezeichnung → Dropdown zeigt passende Codes mit Bezeichnung → Auswahl setzt den 5-stelligen KldB-Code. Die verbleibenden 4 Stellen des 9-stelligen Tätigkeitsschlüssels (Schulbildung, Berufsbildung, Leiharbeit, Vertragsform) werden als separate Dropdowns angezeigt:
- Pos. 6: Schulbildung (1=ohne, 2=Hauptschule, 3=Mittlere Reife, 4=Abitur, 9=unbekannt)
- Pos. 7: Berufsbildung (1=ohne, 2=Anlernausbildung, 3=Berufsausbildung, 4=Meister/Techniker, 5=Bachelor, 6=Master/Diplom, 9=unbekannt)
- Pos. 8: Leiharbeit (1=nein, 2=ja)
- Pos. 9: Vertragsform (1=unbefristet VZ, 2=befristet VZ, 3=unbefristet TZ, 4=befristet TZ)

---

### 1.13 i18n

**Dateien:** `messages/de.json`, `messages/en.json`

Neuer Namespace `employeePayroll` mit allen Tab-Labels, Feldbezeichnungen, Enum-Werten, Validierungsmeldungen, Leerzustandstexten.

---

### 1.14 Tests Phase 1

#### Unit-Tests
| Datei | Prüft |
|---|---|
| `src/lib/services/__tests__/payroll-validators.test.ts` | Alle Validatoren |
| `src/lib/services/__tests__/field-encryption.test.ts` | Verschlüsselung |

#### Integration-Tests
| Datei | Prüft |
|---|---|
| `src/trpc/routers/__tests__/employeePayroll.test.ts` | Employee Update mit Payroll-Feldern, Validierung, Verschlüsselung, Berechtigungen |
| `src/trpc/routers/__tests__/employeeChildren.test.ts` | CRUD EmployeeChild |
| `src/trpc/routers/__tests__/employeeBenefits.test.ts` | CRUD CompanyCar, JobBike, MealAllowance, Voucher, JobTicket |
| `src/trpc/routers/__tests__/employeePensions.test.ts` | CRUD EmployeePension |
| `src/trpc/routers/__tests__/employeeSavings.test.ts` | CRUD EmployeeSavings |
| `src/trpc/routers/__tests__/employeeGarnishments.test.ts` | CRUD EmployeeGarnishment + Berechtigungsprüfung |
| `src/trpc/routers/__tests__/employeeForeignAssignments.test.ts` | CRUD EmployeeForeignAssignment |
| `src/trpc/routers/__tests__/employeeOtherEmployments.test.ts` | CRUD EmployeeOtherEmployment |

---

### Success Criteria Phase 1

#### Automated Verification
- [x] Migration: `pnpm db:reset` läuft fehlerfrei
- [x] Prisma: `pnpm db:generate` regeneriert Client
- [x] Unit-Tests: `pnpm vitest run src/lib/services/__tests__/payroll-validators.test.ts`
- [x] Unit-Tests: `pnpm vitest run src/lib/services/__tests__/field-encryption.test.ts`
- [x] Integration-Tests: alle `employeePayroll`, `employeeChildren`, `employeeBenefits`, `employeePensions`, `employeeSavings`, `employeeGarnishments`, `employeeForeignAssignments`, `employeeOtherEmployments` Tests grün
- [x] Permission-Test: `pnpm vitest run src/trpc/routers/__tests__/permission-catalog.test.ts`
- [x] TypeScript: `pnpm typecheck` (keine neuen Fehler)
- [x] Lint: `pnpm lint`
- [x] Build: `pnpm build`

#### Manual Verification
- [ ] Alle neuen Tabs auf Mitarbeiter-Detailseite sichtbar
- [ ] Tabs berechtigungsgesteuert (ohne Permission ausgeblendet)
- [ ] Steuer-ID und IBAN maskiert angezeigt
- [ ] In DB: taxId, socialSecurityNumber, iban als `v1:...` gespeichert
- [ ] Validierungen greifen serverseitig
- [ ] KldB-Autocomplete funktioniert (Suche nach Berufsbezeichnung)
- [ ] Krankenkassen-Dropdown mit Suche
- [ ] Alle Sub-Tabellen CRUD-fähig
- [ ] Bestehende Funktionalität nicht beeinträchtigt

**Implementation Note**: Nach Phase 1 pausieren für manuelle Verifikation.

---

## Phase 2: Template-Engine-Fundament

### Overview
Eine funktionsfähige Template-Engine, mit der pro Mandant beliebige Export-Templates definiert, getestet und ausgeführt werden können. Noch ohne Standard-Templates.

**Geschätzter Aufwand: 10–14 Implementierungstage**

---

### 2.1 LiquidJS integrieren

**Installation:** `pnpm add liquidjs@^10.25.4`

**Neue Datei:** `src/lib/services/liquid-engine.ts`

```typescript
import { Liquid } from "liquidjs"

/**
 * Creates a sandboxed LiquidJS engine instance.
 * - No filesystem access (templates loaded from DB only)
 * - No network access
 * - No global variables
 * - ownPropertyOnly prevents prototype traversal
 */
export function createSandboxedEngine(): Liquid {
  const engine = new Liquid({
    ownPropertyOnly: true,
    strictFilters: true,
    strictVariables: false,
    globals: {},
    // No root/fs options = no filesystem access
  })

  // Register custom DATEV filters
  registerDatevFilters(engine)

  return engine
}

function registerDatevFilters(engine: Liquid): void {
  // datev_date: Format date for DATEV
  engine.registerFilter("datev_date", (value: string | Date, format?: string) => {
    const date = typeof value === "string" ? new Date(value) : value
    if (isNaN(date.getTime())) return ""
    const dd = String(date.getDate()).padStart(2, "0")
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const yyyy = String(date.getFullYear())
    switch (format) {
      case "TTMMJJJJ": return `${dd}${mm}${yyyy}`
      case "JJJJMMTT": return `${yyyy}${mm}${dd}`
      default: return `${dd}.${mm}.${yyyy}`
    }
  })

  // datev_decimal: German decimal format
  engine.registerFilter("datev_decimal", (value: number, decimals?: number) => {
    if (value == null || isNaN(value)) return "0,00"
    return value.toFixed(decimals ?? 2).replace(".", ",")
  })

  // datev_string: Escape for DATEV semicolon-delimited fields
  engine.registerFilter("datev_string", (value: string) => {
    if (!value) return ""
    if (value.includes(";") || value.includes('"')) {
      return '"' + value.replace(/"/g, '""') + '"'
    }
    return value
  })

  // pad_left / pad_right
  engine.registerFilter("pad_left", (value: string | number, length: number, char?: string) => {
    return String(value ?? "").padStart(length, char ?? " ")
  })
  engine.registerFilter("pad_right", (value: string | number, length: number, char?: string) => {
    return String(value ?? "").padEnd(length, char ?? " ")
  })

  // mask_iban: Show only first 4 and last 4 characters
  engine.registerFilter("mask_iban", (value: string) => {
    if (!value || value.length < 8) return value
    return value.slice(0, 4) + "****" + value.slice(-4)
  })
}
```

**Tests:** `src/lib/services/__tests__/liquid-engine.test.ts`
- Alle 6 Custom Filter mit Edge Cases
- Sandboxing: Template mit `{% include 'file.txt' %}` muss fehlschlagen
- `ownPropertyOnly`: Template mit `{{ constructor }}` oder `{{ __proto__ }}` gibt leer zurück

---

### 2.2 ExportTemplate-Datenmodell

**Migration:** `supabase/migrations/YYYYMMDDHHMMSS_create_export_templates.sql`

```sql
-- Zielsystem-Enum-Werte als CHECK
CREATE TABLE export_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    target_system VARCHAR(20) NOT NULL CHECK (target_system IN ('datev_lodas', 'datev_lug', 'lexware', 'sage', 'custom')),
    template_body TEXT NOT NULL,                   -- Liquid-Template-Inhalt
    output_filename VARCHAR(200) NOT NULL DEFAULT 'export_{{period.year}}{{period.month}}.txt',
    encoding VARCHAR(20) NOT NULL DEFAULT 'windows-1252' CHECK (encoding IN ('windows-1252', 'utf-8', 'utf-8-bom')),
    line_ending VARCHAR(4) NOT NULL DEFAULT 'crlf' CHECK (line_ending IN ('crlf', 'lf')),
    field_separator VARCHAR(5) NOT NULL DEFAULT ';',
    decimal_separator VARCHAR(1) NOT NULL DEFAULT ',',
    date_format VARCHAR(20) NOT NULL DEFAULT 'TT.MM.JJJJ',
    version INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, name)
);
CREATE INDEX idx_export_templates_tenant ON export_templates(tenant_id);

-- Template-Versionsarchiv
CREATE TABLE export_template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES export_templates(id) ON DELETE CASCADE,
    version INT NOT NULL,
    template_body TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(template_id, version)
);
CREATE INDEX idx_export_template_versions_template ON export_template_versions(template_id);
```

**Prisma-Schema:** Models `ExportTemplate` und `ExportTemplateVersion`.

---

### 2.3 Lohnart-Mapping-Tabellen

Gleiche Struktur wie im alten Plan (bewährt):

```sql
-- Standard-Lohnarten (global, Seed)
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

-- Mandantenspezifisch (kopiert aus Defaults)
CREATE TABLE tenant_payroll_wages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
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
```

**Seed:** 20 Standard-Lohnarten (1000–2900), wie im alten Plan spezifiziert.

**Service:** `src/lib/services/payroll-wage-service.ts` — `listDefaults`, `listForTenant`, `initializeForTenant`, `update`, `reset`.
**Router:** `src/trpc/routers/payrollWages.ts`
**Hook:** `src/hooks/use-payroll-wages.ts`

---

### 2.4 Template-Kontext-Objekt

**Neue Datei:** `src/lib/services/export-context-builder.ts`

Definiert und baut das Kontext-Objekt, das beim Template-Rendering verfügbar ist:

```typescript
interface ExportContext {
  exportInterface: {
    name: string
    mandantNumber: string
    beraterNr: string
  }
  period: {
    year: number
    month: number
    monthPadded: string        // "05"
    monthName: string          // "Mai"
    monthNameEn: string        // "May"
    isoDate: string            // "2026-05"
    ddmmyyyy: string           // "01052026" (1. des Monats)
    firstDay: string           // "01.05.2026"
    lastDay: string            // "31.05.2026"
  }
  tenant: {
    name: string
    // Adresse etc.
  }
  template: {
    fieldSeparator: string
    decimalSeparator: string
    dateFormat: string
    targetSystem: string
  }
  payrollWages: Array<{
    code: string
    name: string
    terpSource: string
    category: string
  }>
  employees: Array<{
    personnelNumber: string
    firstName: string
    lastName: string
    birthName: string | null
    birthDate: string | null
    gender: string | null
    nationality: string | null
    maritalStatus: string | null
    address: {
      street: string | null
      houseNumber: string | null
      zip: string | null
      city: string | null
      country: string | null
    }
    tax: {
      taxId: string | null         // entschlüsselt!
      taxClass: number | null
      taxFactor: number | null
      denomination: string | null
      spouseDenomination: string | null
      childAllowance: number | null
      freeAllowance: number | null
      additionAmount: number | null
      isPrimaryEmployer: boolean
    }
    socialSecurity: {
      ssn: string | null           // entschlüsselt!
      healthInsurance: string | null
      healthInsuranceCode: string | null
      healthInsuranceStatus: string | null
      privateHealthContribution: number | null
      personnelGroupCode: string | null
      contributionGroupCode: string | null
      activityCode: string | null
      midijobFlag: number
    }
    bank: {
      iban: string | null          // entschlüsselt!
      bic: string | null
      accountHolder: string | null
    }
    compensation: {
      grossSalary: number | null
      hourlyRate: number | null
      paymentType: string | null
      salaryGroup: string | null
    }
    contract: {
      entryDate: string | null
      exitDate: string | null
      contractType: string | null
      department: string | null
      departmentCode: string | null
      costCenter: string | null
      costCenterCode: string | null
    }
    monthlyValues: {
      targetHours: number
      workedHours: number
      overtimeHours: number
      vacationDays: number
      sickDays: number
      otherAbsenceDays: number
      accountValues: Array<{
        code: string
        name: string
        value: number            // Stunden (aus Minuten / 60)
        payrollCode: string | null
      }>
    }
    benefits: {
      companyCars: Array<{ listPrice: number; propulsionType: string; distanceToWorkKm: number; usageType: string }>
      jobBikes: Array<{ listPrice: number; usageType: string }>
      mealAllowances: Array<{ dailyAmount: number; workDaysPerMonth: number }>
      vouchers: Array<{ monthlyAmount: number; provider: string | null }>
      jobTickets: Array<{ monthlyAmount: number; isAdditional: boolean }>
      pensions: Array<{ executionType: string; employeeContribution: number; employerContribution: number; mandatorySubsidy: number }>
      savings: Array<{ investmentType: string; monthlyAmount: number; employerShare: number; employeeShare: number; recipientIban: string | null }>
    }
    garnishments: Array<{ creditorName: string; fileReference: string | null; amount: number; method: string; dependents: number; rank: number }>
    children: Array<{ firstName: string; lastName: string; birthDate: string; taxAllowanceShare: number }>
    foreignAssignments: Array<{ countryCode: string; countryName: string; startDate: string; endDate: string | null; a1Number: string | null }>
    disability: {
      degree: number | null
      equalStatus: boolean
      markers: string | null
      idValidUntil: string | null
    }
    pension: {
      receivesOldAge: boolean
      receivesDisability: boolean
      receivesSurvivor: boolean
      startDate: string | null
    }
  }>
}
```

**Sensible Felder** (taxId, ssn, iban, recipientIban, creditorName, fileReference) werden entschlüsselt bereitgestellt — Template-Ausführung ist berechtigte Aktion. **Logging der entschlüsselten Werte ist verboten.**

---

### 2.5 ExportEngine-Service

**Neue Datei:** `src/lib/services/export-engine-service.ts`

```typescript
import { createSandboxedEngine } from "./liquid-engine"
import { buildExportContext } from "./export-context-builder"
import iconv from "iconv-lite"
import { createHash } from "node:crypto"

export async function loadTemplate(prisma, tenantId, templateId): Promise<ExportTemplate>

export async function buildContext(prisma, tenantId, exportInterfaceId, year, month, employeeIds?): Promise<ExportContext>

export async function renderTemplate(templateBody: string, context: ExportContext, timeoutMs = 30000): Promise<string> {
  const engine = createSandboxedEngine()
  // Render with timeout
  const result = await Promise.race([
    engine.parseAndRender(templateBody, context),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Template render timeout")), timeoutMs))
  ])
  // Check output size (max 100MB)
  if (result.length > 100 * 1024 * 1024) {
    throw new Error("Template output exceeds maximum size (100MB)")
  }
  return result as string
}

export function encode(rendered: string, encoding: string, lineEnding: string): Buffer {
  // Normalize line endings
  let text = rendered.replace(/\r\n/g, "\n")
  if (lineEnding === "crlf") {
    text = text.replace(/\n/g, "\r\n")
  }
  // Encode
  switch (encoding) {
    case "windows-1252": return iconv.encode(text, "win1252")
    case "utf-8-bom": return Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(text, "utf8")])
    default: return Buffer.from(text, "utf8")
  }
}

export async function generateExport(prisma, tenantId, templateId, exportInterfaceId, year, month, options): Promise<ExportResult> {
  // 1. Load template
  // 2. Build context
  // 3. Render template
  // 4. Encode output
  // 5. Generate filename (render outputFilename pattern with context)
  // 6. Hash file (SHA-256)
  // 7. Audit log
  // 8. Return { file: Buffer, filename, employeeCount, fileHash }
}
```

**Sicherheits-Anforderungen:**
- Timeout: 30 Sekunden (konfigurierbar)
- Max Output: 100 MB
- Keine Filesystem-/Netzwerk-Zugriffe (durch LiquidJS-Konfiguration)
- Audit-Log: Template-ID, Version, Mandant, Benutzer, Zeitstempel, SHA-256 Datei-Hash

---

### 2.6 ExportInterface erweitern

**Migration:**
```sql
ALTER TABLE export_interfaces ADD COLUMN berater_nr VARCHAR(7);
ALTER TABLE export_interfaces ADD COLUMN default_template_id UUID REFERENCES export_templates(id);
```

**Prisma-Schema:** `beraterNr`, `defaultTemplateId` auf `ExportInterface`.
**Router/Service:** Felder in CRUD aufnehmen. Validierung: `beraterNr` 4-7-stellig, nur Ziffern.

---

### 2.7 Template-Verwaltungs-UI

**Neue Seite:** `src/app/[locale]/(dashboard)/admin/export-templates/page.tsx`

Features:
- Liste aller Templates des Mandanten (Name, Zielsystem, Version, Aktiv, Letzte Änderung)
- "Neues Template" → leeres Template oder aus Bibliothek (Phase 3)
- Template-Editor:
  - Metadaten: Name, Beschreibung, Zielsystem, Encoding, Line-Ending, Field-Separator, Decimal-Separator, Date-Format
  - Template-Body: großes Textarea (Monospace-Font, Zeilennummern). Syntax-Highlighting für Liquid via [CodeMirror](https://codemirror.net/) `@codemirror/lang-liquid` falls verfügbar, sonst Plain-Text
  - Live-Vorschau: rendert Template mit Daten eines Beispiel-Mitarbeiters, zeigt Liquid-Syntax-Fehler
  - "Test-Export erzeugen" Button
- Versionierung: Beim Speichern wird alte Version in `export_template_versions` archiviert

**Neue Komponenten:**
- `src/components/export-templates/export-template-list.tsx`
- `src/components/export-templates/export-template-editor.tsx`
- `src/components/export-templates/export-template-preview.tsx`

**Router:** `src/trpc/routers/exportTemplates.ts` — `list`, `getById`, `create`, `update`, `delete`, `preview`, `testExport`
**Service:** `src/lib/services/export-template-service.ts`
**Hook:** `src/hooks/use-export-templates.ts`

---

### 2.8 Test-Export-Funktion

`testExport` Procedure: Generiert Datei für 1-N ausgewählte Mitarbeiter. Im Audit-Log als `type: "test"` markiert. UI: Mitarbeiter-Auswahl (Combobox), "Test-Export erzeugen", Datei wird heruntergeladen.

---

### 2.9 Export-Auswahl in der UI

**Bestehende Seite:** `src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`

Erweiterung des `GenerateExportDialog`:
- Neues Select "Export-Methode": Legacy CSV | Template-basiert
- Bei "Template-basiert": Dropdown mit allen aktiven Templates des Mandanten
- Falls kein Template konfiguriert: Fehlermeldung mit Link zu `/admin/export-templates`
- Export ruft `exportEngine.generateExport` auf
- Bestehender Legacy-CSV-Export bleibt als Option

---

### 2.10 Berechtigungen

Neue Einträge in `permission-catalog.ts`:

```typescript
p("export_template.view", "export_template", "view", "View export templates"),
p("export_template.create", "export_template", "create", "Create export templates"),
p("export_template.edit", "export_template", "edit", "Edit export templates"),
p("export_template.delete", "export_template", "delete", "Delete export templates"),
p("export_template.execute", "export_template", "execute", "Execute export templates (generate exports)"),
```

**Migration** für neue Permissions. Standard-Zuweisung: `admin` bekommt alle 5.

---

### 2.11 Lohnart-Mapping UI

**Neue Seite:** `src/app/[locale]/(dashboard)/admin/payroll-wages/page.tsx`

Tabelle aller `TenantPayrollWage`: Code, Name, Terp-Quelle, Kategorie, Aktiv. Inline-Edit. "Auf Defaults zurücksetzen" Button.

---

### 2.12 Tests Phase 2

| Datei | Prüft |
|---|---|
| `src/lib/services/__tests__/liquid-engine.test.ts` | Custom Filter, Sandboxing |
| `src/lib/services/__tests__/export-engine-service.test.ts` | Template laden, Kontext bauen, Rendern, Encoding, Timeout, Max-Size |
| `src/lib/services/__tests__/export-context-builder.test.ts` | Kontext-Objekt korrekt aufgebaut, Entschlüsselung, Monats-Aggregation |
| `src/trpc/routers/__tests__/exportTemplates.test.ts` | CRUD, Versionierung, Berechtigungen |
| `src/trpc/routers/__tests__/payrollWages.test.ts` | Initialize, Update, Reset |
| `src/lib/services/__tests__/export-engine-security.test.ts` | Filesystem-Zugriff blockiert, Netzwerk blockiert, Prototype-Traversal blockiert, Endlosschleifen-Timeout |

**Sicherheits-Tests im Detail:**
```typescript
// Filesystem-Zugriff muss fehlschlagen
test("template cannot access filesystem", async () => {
  const template = '{% include "/etc/passwd" %}'
  await expect(renderTemplate(template, context)).rejects.toThrow()
})

// Prototype-Traversal blockiert
test("template cannot access __proto__", async () => {
  const template = "{{ employees[0].__proto__.constructor }}"
  const result = await renderTemplate(template, context)
  expect(result.trim()).toBe("")
})

// Timeout bei Endlosschleife
test("infinite loop times out", async () => {
  const template = "{% for i in (1..999999999) %}x{% endfor %}"
  await expect(renderTemplate(template, context, 1000)).rejects.toThrow("timeout")
})
```

---

### Success Criteria Phase 2

#### Automated Verification
- [x] Migration: `pnpm db:reset`
- [x] LiquidJS installiert, Engine-Tests grün
- [x] Export-Engine-Tests grün (inkl. Encoding, Timeout)
- [x] Sicherheits-Tests grün (Sandbox-Verletzungen abgelehnt)
- [x] Template CRUD-Tests grün
- [x] Payroll Wage-Tests grün
- [x] TypeScript: `pnpm typecheck` (no new errors in new files)
- [x] Build: `pnpm build` (export-templates + payroll-wages routes registered)
- [x] E2E Browser Tests grün (10/10 in 62-export-templates.spec.ts)

#### Manual Verification
- [ ] Template-Verwaltung: Erstellen, Bearbeiten, Löschen funktioniert
- [ ] Template-Editor zeigt Live-Vorschau
- [ ] Test-Export erzeugt Datei mit korrektem Encoding
- [ ] Windows-1252-Datei korrekt (Umlaute verifiziert via `xxd` oder `file --mime-encoding`)
- [ ] Audit-Log dokumentiert Template-Ausführung
- [ ] Legacy-CSV-Export funktioniert weiterhin
- [ ] Lohnart-Mapping-Seite funktioniert

**Implementation Note**: Nach Phase 2 pausieren. Idealerweise: selbst geschriebenes LODAS-Template testen.

---

## Phase 3: Standard-Templates und Onboarding

### Overview
Mitgelieferte Standard-Templates für DATEV LODAS, LuG, Lexware, SAGE, generische CSV. Plus Massenimport, Gehaltshistorie, Onboarding-Checkliste.

**Geschätzter Aufwand: 10–14 Implementierungstage**

---

### 3.1 System-Template-Tabelle

**Migration:**
```sql
CREATE TABLE system_export_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    target_system VARCHAR(20) NOT NULL,
    template_body TEXT NOT NULL,
    output_filename VARCHAR(200) NOT NULL,
    encoding VARCHAR(20) NOT NULL DEFAULT 'windows-1252',
    line_ending VARCHAR(4) NOT NULL DEFAULT 'crlf',
    field_separator VARCHAR(5) NOT NULL DEFAULT ';',
    decimal_separator VARCHAR(1) NOT NULL DEFAULT ',',
    date_format VARCHAR(20) NOT NULL DEFAULT 'TT.MM.JJJJ',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 Standard-Templates erstellen

Templates als SQL-INSERT-Migration geseedet:

| Template | target_system | Encoding | Beschreibung |
|---|---|---|---|
| "DATEV LODAS — Bewegungsdaten" | `datev_lodas` | windows-1252 | Basis: Satzart 21, Stunden/Tage/Beträge |
| "DATEV LODAS — Stamm + Bewegungsdaten" | `datev_lodas` | windows-1252 | [Stammdaten] + [Bewegungsdaten], mit Verifikations-Hinweis |
| "DATEV Lohn und Gehalt — Bewegungsdaten" | `datev_lug` | windows-1252 | Wie LODAS, `Ziel=LUG`, 4-stellige Lohnarten |
| "Lexware Lohn+Gehalt — Standard" | `lexware` | utf-8-bom | CSV-basiert, Lexware-Spaltenformat |
| "SAGE HR — Standard" | `sage` | utf-8 | SAGE-Importformat |
| "Generische CSV — Standard" | `custom` | utf-8 | Universell, alle Felder, für eigene Auswertungen |

Jedes Template enthält:
- Vollständig kommentierter Liquid-Code
- Header-Kommentare: was anzupassen ist, Verweis auf Dokumentation, Versionsinfo

**Beispiel DATEV LODAS Bewegungsdaten-Template (Auszug):**
```liquid
{%- comment -%}
  DATEV LODAS — Standardvorlage Bewegungsdaten
  Version: 1.0
  Ziel: LODAS ASCII-Import (Mandant > Daten übernehmen > ASCII-Import)
  Encoding: Windows-1252 (wird automatisch vom Export-System gesetzt)
  ANPASSUNG ERFORDERLICH: Lohnart-Codes müssen mit dem Steuerberater abgestimmt werden.
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
{%- if val and val > 0 -%}
{{ employee.personnelNumber }};{{ period.ddmmyyyy }};{{ val | datev_decimal: 2 }};{{ wage.code }};{{ employee.contract.costCenterCode }}
{%- endif -%}
{%- endif -%}
{%- endfor -%}
{%- for av in employee.monthlyValues.accountValues -%}
{%- if av.value > 0 and av.payrollCode -%}
{{ employee.personnelNumber }};{{ period.ddmmyyyy }};{{ av.value | datev_decimal: 2 }};{{ av.payrollCode }};{{ employee.contract.costCenterCode }}
{%- endif -%}
{%- endfor -%}
{%- endfor -%}
```

### 3.3 Template-Bibliothek-UI

**Neue Seite:** `src/app/[locale]/(dashboard)/admin/export-templates/library/page.tsx`

Zeigt alle System-Templates. "Als Vorlage verwenden" → kopiert System-Template in mandantenspezifische `export_templates`. Kopie, keine Referenz.

---

### 3.4 Massenimport

**Neue Datei:** `src/lib/services/payroll-bulk-import-service.ts`

1. Template-Download: CSV-Vorlage mit Pflichtfeldern
2. Upload: CSV/XLSX
3. Spalten-Mapping (Drag & Drop oder Dropdown)
4. Validierung aller Zeilen via `payroll-validators.ts`
5. Vorschau: Liste der Änderungen mit Diff
6. Import: Transaktional (alles oder nichts)
7. Audit-Log

**Pflicht-Spalte:** `personnelNumber` (zum Identifizieren)
**Validierungsfehler:** Zeilenweise, Import erst wenn alle valide.

**Router:** `src/trpc/routers/payrollBulkImport.ts` — `parseFile`, `confirmImport`
**Hook:** `src/hooks/use-payroll-bulk-import.ts`
**UI:** `src/app/[locale]/(dashboard)/admin/payroll-import/page.tsx`

---

### 3.5 Gehaltshistorie

**Migration:**
```sql
CREATE TABLE employee_salary_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    valid_from DATE NOT NULL,
    valid_to DATE,
    gross_salary DECIMAL(10,2),
    hourly_rate DECIMAL(10,2),
    payment_type VARCHAR(20) NOT NULL,
    change_reason VARCHAR(50) NOT NULL,       -- initial, raise, tariff_change, promotion, other
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_salary_history_employee ON employee_salary_history(employee_id);
CREATE INDEX idx_salary_history_valid ON employee_salary_history(employee_id, valid_from, valid_to);
```

**Logik:** Neuer Eintrag → Vorgänger automatisch `valid_to = new.valid_from - 1`. `Employee.grossSalary`/`hourlyRate` synchronisiert mit jüngstem `valid_to = NULL`.

**Service/Router/Hook/UI:** Standard CRUD + Timeline im "Vergütung"-Tab.

---

### 3.6 Onboarding-Checkliste

**Neue Seite:** `src/app/[locale]/(dashboard)/admin/datev-onboarding/page.tsx`

Aggregiert:
- Beraternummer gepflegt? ✅/❌
- Mandantennummer gepflegt? ✅/❌
- Aktives Template gewählt? ✅/❌
- Template-Test-Export durchgeführt? ✅/❌
- Lohnart-Mapping angepasst?
- Mitarbeiter mit vollständigen Lohnstammdaten: N / Gesamt
- Liste der MA mit fehlenden Pflichtfeldern (mit Links)

**Router:** `src/trpc/routers/datevOnboarding.ts` — `getStatus`

---

### 3.7 Steuerberater-Dokumentation als PDF

**Neue Datei:** `src/lib/pdf/datev-steuerberater-anleitung-pdf.tsx` (React-PDF)

Inhalt:
1. Terp-Logo + Mandantenname
2. "Anleitung DATEV-Import aus Terp"
3. Welches Template wird verwendet
4. Wie das Template angepasst werden kann
5. Schritt-für-Schritt Import in DATEV
6. Lohnart-Tabelle (aus mandantenspezifischem Mapping)
7. Welche Felder in der Datei enthalten sind
8. Ansprechpartner

---

### Success Criteria Phase 3

#### Automated Verification
- [ ] System-Templates in DB vorhanden
- [ ] Massenimport-Tests grün
- [ ] Gehaltshistorie-Tests grün
- [ ] Onboarding-Status-Tests grün
- [ ] TypeScript/Build/Lint

#### Manual Verification
- [ ] Template-Bibliothek zeigt alle Standard-Templates
- [ ] "Als Vorlage verwenden" kopiert Template korrekt
- [ ] DATEV-LODAS-Standard-Template erzeugt importierbare Datei
- [ ] Massenimport für 200 Mitarbeiter funktioniert
- [ ] Gehaltshistorie mit automatischem valid_to
- [ ] Onboarding-Checkliste zeigt korrekten Status
- [ ] PDF wird generiert

---

## Phase 4: Polish und Erweiterte Features

### Overview
Komfort-Features nach Phase 3, priorisiert auf Basis von Kunden-Feedback.

**Geschätzter Aufwand: 5–8 Implementierungstage (nach Priorisierung)**

---

### 4.1 Template-Versionsverwaltung
- Diff-Anzeige zwischen Versionen
- Rollback auf vorherige Version
- Audit-Trail aller Änderungen

### 4.2 Template-Test-Suite
- Erwartete Outputs als Snapshots pro Template
- Bei Änderung automatische Snapshot-Prüfung
- Hilft ungewollte Änderungen zu erkennen

### 4.3 Template-Sharing zwischen Mandanten
- Templates aus einem Mandant in anderen kopieren
- Für Implementierungspartner mit mehreren Mandanten

### 4.4 Export-Scheduler
- Templates automatisch nach Monatsabschluss ausführen
- Datei per E-Mail an Steuerberater

### 4.5 Multi-File-Export
- Templates die mehrere Dateien erzeugen (z.B. LODAS + Stammdaten)

---

## Testing Strategy

### Unit Tests
- Validatoren (IBAN, SV-Nr, Steuer-ID, BGS, Tätigkeitsschlüssel)
- Verschlüsselung (Round-Trip, Key-Rotation, Edge Cases)
- LiquidJS Custom Filter
- Export-Context-Builder

### Integration Tests
- Employee Payroll-Felder CRUD + Validierung + Verschlüsselung
- Alle Sub-Domain-Router
- Berechtigungsprüfung
- Export-Engine: Template → Datei → Encoding
- Lohnart-Mapping CRUD
- Massenimport (Phase 3)

### Security Tests
- LiquidJS Sandbox: Filesystem, Netzwerk, Prototype-Traversal blockiert
- Timeout bei Endlosschleifen
- Max-Output-Size
- Verschlüsselte Felder nicht im Audit-Log

### Snapshot Tests
- Standard-Templates gegen Referenz-Output

---

## Performance Considerations

- **Krankenkassen-Dropdown:** ~93 Einträge → Client-side Filtering, keine Paginierung
- **KldB-Autocomplete:** ~1.300 Einträge, GIN-Index → schnelle Volltextsuche serverseitig
- **Template-Rendering:** 200 MA × 20 Lohnarten = ~4.000 Zeilen → < 1 Sekunde
- **Verschlüsselung:** AES-256-GCM Hardware-beschleunigt (AES-NI), ~200 Felder < 10ms
- **Massenimport:** 200 MA in einer Transaktion → Prisma `$transaction` mit erhöhtem Timeout
- **LiquidJS:** Template-Parsing kann gecached werden (pro Template-Version)

---

## Migration Notes

- **Bestehende Mitarbeiter:** Alle neuen Felder optional (NULL). Kein Datenverlust.
- **Bestehender CSV-Export:** Bleibt als "Legacy" parallel verfügbar.
- **Bestehende Berechtigungen:** Keine Änderung. Neue Permissions additiv.
- **ExportInterface.exportScript:** Wird NICHT entfernt oder umgebaut. Bleibt als ungenutztes Feld. Template-Engine ist komplett separat.
- **Key Rotation:** Erster Key beim Deployment generieren. Staging: Test-Key in `.env`.

---

## Risiken und offene Punkte

### 1. DATEV Schnittstellenhandbuch
Aktuelle Version (92. Auflage, Dez. 2025) nur mit DATEV-Login. Implementierung basiert auf 45. Auflage (2016) + Community-Docs.
**Risiko:** Formatänderungen in neueren Versionen.
**Mitigation:** Test-Import beim Steuerberater. Steuerberater um LODAS_SSH.pdf bitten. Template-Ansatz ermöglicht schnelle Anpassung ohne Code-Änderung.

### 2. LiquidJS CVE-2026-30952
Betrifft Versionen < 10.25.0. Path Traversal via `include`/`render`/`layout` Tags.
**Mitigation:** Feste Abhängigkeit auf >= 10.25.4. In-Memory-Templates (kein Filesystem). Zusätzlich: `templates`-Option gesetzt → alle fs-Optionen ignoriert.

### 3. Krankenkassen-Datenaktualität
~2-3 Fusionen/Auflösungen pro Jahr.
**Mitigation:** Jährliches Update der Seed-Daten. ITSG Stammdatendatei (XML von download.gkv-ag.de) als autoritative Quelle.

### 4. KldB 2010 — Datenbereitstellung
Nur als XLSX verfügbar, kein CSV/JSON.
**Mitigation:** Einmaliges ETL-Skript (XLSX → SQL). ~1.300 Zeilen — managebar.

### 5. Lohnart-Mapping — Steuerberater-Abstimmung
Jeder Steuerberater hat potenziell andere Lohnart-Nummern.
**Mitigation:** Template-Ansatz + mandantenspezifisches Mapping. Onboarding-Checkliste in Phase 3.

### 6. Template-Komplexität für Stammdaten
LODAS [Stammdaten]-Sektion hat 93 Personalstamm-Tabellen. Vollständiges Stammdaten-Template ist komplex.
**Mitigation:** Phase 3 liefert Standard-Templates mit Kommentaren. Für Stammdaten-Sektion: schrittweiser Aufbau, mit Steuerberater verifizieren.

### 7. iconv-lite Encoding-Korrektheit
Windows-1252 für DATEV Pflicht.
**Mitigation:** iconv-lite 0.7.2 (220M+ weekly downloads, keine CVEs, expliziter Windows-1252-Support). Encoding-Tests mit Byte-Vergleich (ä=0xE4, ö=0xF6, ü=0xFC, ß=0xDF).

### 8. Template-Sicherheit in Multi-Tenant-Umgebung
Templates werden von Admin-Benutzern geschrieben. Ein manipuliertes Template könnte versuchen, Daten anderer Mandanten zu exponieren.
**Mitigation:** Kontext-Objekt enthält nur Daten des eigenen Mandanten. LiquidJS hat keinen Zugriff auf Prisma, Filesystem oder Netzwerk. `ownPropertyOnly: true` verhindert Prototype-Traversal.

---

## References

- Research: `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`
- Research: `thoughts/shared/research/2026-04-08-export-script-konzept-lohnschnittstelle.md`
- Alter Plan (ersetzt): `thoughts/shared/plans/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`
- LiquidJS: [liquidjs.com](https://liquidjs.com/), [npm](https://www.npmjs.com/package/liquidjs)
- CVE-2026-30952: [GitLab Advisory](https://advisories.gitlab.com/pkg/npm/liquidjs/CVE-2026-30952/)
- LODAS SSH (45. Auflage, 2016): [silo.tips](https://silo.tips/download/ssh-schnittstellenhandbuch-lodas)
- DATEV Developer Portal: [developer.datev.de](https://developer.datev.de/datev/platform/en/schnittstellenvorgaben/ascii)
- GKV-Spitzenverband: [gkv-spitzenverband.de](https://www.gkv-spitzenverband.de/service/krankenkassenliste/krankenkassen.jsp)
- ITSG Stammdatendatei: [download.gkv-ag.de](https://download.gkv-ag.de/)
- Stammdatendatei Spezifikation V3.0.0: [PDF](https://gkv-ag.de/wp-content/uploads/2025/10/2025-10-07_Spezifikation-Stammdatendatei300_V3.0.pdf)
- KldB 2010: [BA Arbeitsmittel](https://statistik.arbeitsagentur.de/DE/Navigation/Grundlagen/Klassifikationen/Klassifikation-der-Berufe/KldB2010-Fassung2020/Arbeitsmittel/Arbeitsmittel-Nav.html)
- PGR — DEÜV Anlage 2: [gkv-datenaustausch.de](https://www.gkv-datenaustausch.de/media/dokumente/arbeitgeber/deuev/rundschreiben_anlagen/03_Anlage_2_Vers._8.01.pdf)
- Steuer-ID Algorithmus: [kryptografie.de](https://kryptografie.de/kryptografie/chiffre/steuer-id.htm)
- ELSTER Steuer-ID Prüfung: [PDF](https://download.elster.de/download/schnittstellen/Pruefung_der_Steuer_und_Steueridentifikatsnummer.pdf)
- pgsodium Deprecation: [GitHub Discussion #27109](https://github.com/orgs/supabase/discussions/27109)
- Supabase Vault: [Docs](https://supabase.com/docs/guides/database/vault)
- iconv-lite: [npm](https://www.npmjs.com/package/iconv-lite)
- Node.js crypto: [Docs](https://nodejs.org/api/crypto.html)
- Bestehender DATEV-Export: `src/lib/services/inbound-invoice-datev-export-service.ts`
- Bestehender Payroll-Export: `src/lib/services/payroll-export-service.ts`
- Permission-Katalog: `src/lib/auth/permission-catalog.ts`
- Employee-Model: `prisma/schema.prisma:1445–1564`
- ExportInterface-Model: `prisma/schema.prisma:3230–3252`
