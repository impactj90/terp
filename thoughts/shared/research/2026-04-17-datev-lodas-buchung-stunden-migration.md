---
date: 2026-04-17T10:11:02+00:00
researcher: impactj90
git_commit: 021aa0aac411f146cedc8283d162fd879697a5c2
branch: staging
repository: impactj90/terp
topic: "DATEV LODAS Export von buchung_standard (Satzart 21) auf buchung_stunden (Satzart 2) umstellen"
tags: [research, codebase, payroll, datev, lodas, export-templates, liquid-engine, prodi-prelaunch]
status: complete
last_updated: 2026-04-17
last_updated_by: impactj90
---

# Research: DATEV LODAS Export von `buchung_standard` (Satzart 21) auf `buchung_stunden` (Satzart 2) umstellen

**Date**: 2026-04-17 10:11:02 UTC
**Researcher**: impactj90
**Git Commit**: 021aa0aac411f146cedc8283d162fd879697a5c2
**Branch**: staging
**Repository**: impactj90/terp

## Research Question

Umstellung des DATEV-Lohn-Exports (LODAS) vom aktuell genutzten Format **Satzart 21** (`u_lod_bwd_buchung_standard` — PNR/Zeitraum/Buchungswert/Buchungsnummer/Kostenstelle) auf das von Pro-Di und deren Steuerberater geforderte Format **Satzart 2** (`u_lod_bwd_buchung_stunden` — `abrechnung_zeitraum#bwd;la_eigene#bwd;pnr#bwd;stunden#bwd`). Zusätzlich Satzart 1 (`u_lod_bwd_buchung_tage`) im Header deklarieren. Dokumentation des Ist-Zustands in Template-Engine, Lohnart-Mapping, Tenant-Konfiguration (BeraterNr, MandantenNr), Personalnummer-Handling und Zuschlags-Pipeline.

### Deltas IST → SOLL (aus Ticket)

| Feld | IST (`LODAS_202603.txt`) | SOLL (`datevexport_lohn.txt`) |
|---|---|---|
| Satzart | 21 | 2 (plus 1 im Header) |
| Satzbeschreibung | `u_lod_bwd_buchung_standard` | `u_lod_bwd_buchung_stunden` |
| Feldfolge | `pnr;zeitraum;buchungswert;buchungsnummer;kostenstelle1` | `abrechnung_zeitraum;la_eigene;pnr;stunden` |
| Datumsformat | `01032026` (keine Punkte) | `01.03.2026` (mit Punkten) |
| PNR | `EMP001` (alphanumerisch) | `00040` (5-stellig zero-padded) |
| BeraterNr/MandantenNr | leer | 278041 / 25016 |
| Newline nach `[Bewegungsdaten]` | fehlt | vorhanden |
| Kostenstelle | vorhanden | entfällt |

## Summary

Der DATEV-Export in Terp läuft über **zwei parallele Code-Pfade**, die das gleiche Backing-Datenmodell (Prisma + DailyAccountValue + MonthlyValue) nutzen:

- **Pfad A — Legacy-CSV** (`src/lib/services/payroll-export-service.ts:135-190`) erzeugt ein simples Semikolon-CSV mit hardcoded Header `Personalnummer;Nachname;Vorname;Lohnart;Stunden;Tage;Betrag;Kostenstelle`. Dieser Pfad enthält kein LODAS-Header-Block (`[Allgemein]`, `[Satzbeschreibung]`, `[Bewegungsdaten]`) und keine `u_lod_bwd_*`-Referenzen. Der String "buchung_standard"/"buchung_stunden" taucht hier **nirgends** auf.
- **Pfad B — Template-Engine** (`src/lib/services/export-engine-service.ts` + `liquid-engine.ts`) ist die moderne, LiquidJS-basierte Export-Pipeline. Sie ist die alleinige Stelle, an der "Satzart 21", `u_lod_bwd_buchung_standard`, `pnr#bwd`, `abrechnung_zeitraum#bwd` und verwandte LODAS-Schlüsselwörter auftauchen — **als Literal-Text in den 6 Seed-Templates** in der Migration `20260418100000_create_phase3_payroll_tables.sql:71-273`. Es gibt keinen Server-Code, der diese Strings generiert; sie sind statischer Template-Inhalt.

Die Umstellung auf Satzart 2 (`buchung_stunden`) ist damit **ein Template-Arbeitstask**, **kein Engine-Task**. Konkret: ein neues System-Template in der Template-Bibliothek, das mit den vorhandenen Liquid-Filtern (`pad_left`, `datev_decimal`, `datev_date`, `terp_value`) und dem vorhandenen Kontext-Objekt (`exportInterface.beraterNr`, `exportInterface.mandantNumber`, `period.firstDay`, `employee.personnelNumber`, `payrollWages[]`, `employee.accountValues[]`, `employee.monthlyValues[]`) das geforderte Pro-Di-Format exakt erzeugen kann. **Alle benötigten Primitive existieren bereits.**

Zwei unterstützende Gaps:

1. **`exportInterface.beraterNr` ist DB-seitig vorhanden, aber in den tRPC-Router-Input/Output-Schemas NICHT exposed.** Der Wert wird beim Context-Build nur aus der DB gelesen (`export-context-builder.ts:358-375`), aber Admin-UI und Router erlauben kein Setzen. Siehe [Gap 1](#gap-1-beraternr-nicht-im-trpc-schema).
2. **PNR-Speicherung ist alphanumerisch** (Varchar(50), Seed `EMP001`–`EMP010`). Zero-Padding auf 5-stellige numerische PNR ist Template-seitig über `{{ emp.personnelNumber | pad_left: 5, "0" }}` möglich, funktioniert aber nur, wenn die gespeicherten Werte numerisch sind (der Filter padded Strings mit `padStart`, er konvertiert nicht).

Das parallele Arbeits-Ticket [`pflicht-02-datev-zuschlaege.md`](../tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege.md) hat bereits die `terpSource`-Umstellung von `nightHours/sundayHours/holidayHours` auf `account:NIGHT/SUN/HOLIDAY` geliefert (siehe die uncommittete Migration `supabase/migrations/20260430000000_datev_surcharge_terpsource_update.sql`), sodass die Zuschlags-Lohnarten über den `terp_value`-Filter bereits lauffähig sind.

## Detailed Findings

### Referenz-Dateien (Pro-Di & Terp)

**SOLL-Format** (`/home/tolga/Downloads/datevexport_lohn.txt`, 469 Zeilen, erstellt von Pro-Di):

```
[Allgemein]
Ziel=Lodas
BeraterNr=278041
MandantenNr=25016

[Satzbeschreibung]
1;u_lod_bwd_buchung_tage;abrechnung_Zeitraum#bwd;la_eigene#bwd;pnr#bwd;tage#bwd;
2;u_lod_bwd_buchung_stunden;abrechnung_zeitraum#bwd;la_eigene#bwd;pnr#bwd;stunden#bwd;

[Bewegungsdaten]
2;01.03.2026;500;00040;6,57;
2;01.03.2026;510;00040;3,05;
2;01.03.2026;100;00040;9,27;
2;01.03.2026;500;00008;90,50;
...
```

Beobachtungen:
- Satzart 1 (`buchung_tage`) wird im `[Satzbeschreibung]`-Block deklariert, aber **nicht befüllt** (keine Daten-Zeilen beginnend mit `1;`). Reine Format-Deklaration für spätere Erweiterung.
- Satzart 2 (`buchung_stunden`) ist der einzige befüllte Typ. Jede Datenzeile enthält nur 4 Felder: `abrechnung_zeitraum` (mit Punkten), `la_eigene` (Pro-Di-Lohnart-Nr.: 500/510/100/410), `pnr` (5-stellig zero-padded), `stunden` (deutsches Komma, 2 Dezimalstellen).
- Lohnarten-Schema (Pro-Di-Mapping):
  - `500` = Grundstunden
  - `510` = Nachtzuschlag
  - `100` = Sonntagszuschlag
  - `410` = Feiertagszuschlag
- Fehlend gegenüber Terp-Default: `Version_SST=1.0`, `Datumsformat=`, `Feldtrennzeichen=`, `Zahlenkomma=`, `kostenstelle1#bwd`.

**IST-Format** (`/home/tolga/Downloads/LODAS_202603.txt`, 45 Zeilen, aktueller Terp-Output):

```
[Allgemein]
Ziel=LODAS
Version_SST=1.0
BeraterNr=
MandantenNr=
Datumsformat=TT.MM.JJJJ
Feldtrennzeichen=;
Zahlenkomma=,

[Satzbeschreibung]
21;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;buchungswert#bwd;buchungsnummer#bwd;kostenstelle1#bwd

[Bewegungsdaten]EMP001;01032026;176,00;1000;
EMP001;01032026;177,70;1001;
EMP001;01032026;1,70;1002;
...
```

Beobachtungen:
- `BeraterNr=` / `MandantenNr=` sind leer → bestätigt, dass im Test-Tenant keine `ExportInterface` mit gesetzten Werten verwendet wurde.
- `Datumsformat=TT.MM.JJJJ` im Header, aber die Daten-Zeilen verwenden `01032026` ohne Punkte → **Header-Deklaration und Daten-Format sind inkonsistent**. Verursacht durch die Template-Verwendung `{{ period.ddmmyyyy }}` (Ausgabe `"01032026"`) statt `{{ period.firstDay }}` (Ausgabe `"01.03.2026"`).
- PNR `EMP001` ist alphanumerisch → direkter String aus `Employee.personnelNumber`, kein `pad_left`-Filter im Template.
- Zeile 13 `[Bewegungsdaten]EMP001;...`: **kein Newline** nach dem Header-Label, weil das Template Whitespace-Control verwendet (`{%- for -%}` ohne nachfolgenden `\n` nach `[Bewegungsdaten]`).

### 1. Liquid Template Engine

`src/lib/services/liquid-engine.ts:13-24` — Engine-Factory:

```typescript
export function createSandboxedEngine(): Liquid {
  const engine = new Liquid({
    ownPropertyOnly: true,
    strictFilters: true,
    strictVariables: false,
    globals: {},
  })
  registerDatevFilters(engine)
  return engine
}
```

Sandboxing-Optionen: `ownPropertyOnly` (kein Prototype-Traversal), `strictFilters` (unknown filter → error), `strictVariables: false` (undefined variable → empty string). Keine `root`-Option → `{% include %}` / `{% render %}` blockiert.

Render-Timeout: 30s default (`DEFAULT_RENDER_TIMEOUT_MS` in `export-engine-service.ts:67`), Preview nutzt 10s. Implementiert via `Promise.race` in `renderTemplate()` (`export-engine-service.ts:90-126`).

Max-Output: 100 MB (`MAX_OUTPUT_BYTES`, export-engine-service.ts). Gemessen per `Buffer.byteLength(result, "utf8")`. Überschreitung → `ExportTemplateSizeValidationError`.

#### Registrierte Custom-Filter (`src/lib/services/liquid-engine.ts:26-123`)

| Filter | Signatur | Verhalten |
|---|---|---|
| `datev_date` | `(value, format?)` | `"TT.MM.JJJJ"` (default), `"TTMMJJJJ"`, `"JJJJMMTT"`. Null/invalid → `""`. UTC-basiert. |
| `datev_decimal` | `(value, decimals=2)` | `.toFixed(d).replace(".", ",")`. Null/NaN → `"0,00"`. |
| `datev_string` | `(value)` | RFC-4180 Quoting: wrap + escape `"` → `""` wenn `;`, `"`, `\n`, `\r` enthalten. |
| `pad_left` | `(value, length, char=" ")` | `.padStart()`. Leeres `char` → Space-Fallback. Für `pad_left: 5, "0"` → `"00042"`. |
| `pad_right` | `(value, length, char=" ")` | `.padEnd()`. |
| `mask_iban` | `(value)` | Strip Whitespace → `first4 + "****" + last4`. |
| `terp_value` | `(terpSource, employee)` | `"account:X"` → `employee.accountValues[X]`, sonst → `employee.monthlyValues[terpSource]`. Miss → `0`. |

#### Encoding (`src/lib/services/export-engine-service.ts:132-154`)

```typescript
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])

export function encodeOutput(rendered: string, encoding: string, lineEnding: string): Buffer {
  // 1. Normalize CRLF → LF
  let text = rendered.replace(/\r\n/g, "\n")
  // 2. Optionally re-apply CRLF
  if (lineEnding === "crlf") text = text.replace(/\n/g, "\r\n")
  // 3. Dispatch encoding
  if (encoding === "windows-1252") return iconv.encode(text, "win1252")
  if (encoding === "utf-8-bom") return Buffer.concat([UTF8_BOM, Buffer.from(text, "utf8")])
  return Buffer.from(text, "utf8") // utf-8 default
}
```

DATEV-Standard: `windows-1252` + `crlf`.

### 2. ExportContext Struktur (`src/lib/services/export-context-builder.ts`)

**Top-Level (`src/lib/services/export-context-builder.ts:237-244`)**:

```typescript
interface ExportContext {
  exportInterface: { name, mandantNumber, beraterNr }  // L78-82
  period:          { year, month, monthPadded, monthName, monthNameEn,
                     isoDate, ddmmyyyy, firstDay, lastDay }  // L280-299
  tenant:          { name, addressStreet, addressZip, addressCity, addressCountry }
  template:        { fieldSeparator, decimalSeparator, dateFormat, targetSystem }
  payrollWages:    Array<{ code, name, terpSource, category }>
  employees:       ExportContextEmployee[]
}
```

**`period`-Details** (L280-299) — für April 2026:

| Key | Wert | Verwendung |
|---|---|---|
| `year` | `2026` | — |
| `month` | `4` | — |
| `monthPadded` | `"04"` | Dateiname |
| `monthName` | `"April"` | — |
| `ddmmyyyy` | `"01042026"` | **IST-Format** (keine Punkte) |
| `firstDay` | `"01.04.2026"` | **SOLL-Format** (mit Punkten) |
| `lastDay` | `"30.04.2026"` | — |

`period.ddmmyyyy` wird als `` `${dd}${mm}${year}` `` zusammengesetzt (L293), `period.firstDay` als `` `${dd}.${mm}.${year}` `` (L295).

**`employee`-Details** (L99-235, gefüllt L505-611):

- `personnelNumber: string` (L509, roh durchgereicht, keine Transformation)
- `monthlyValues: { targetHours, workedHours, overtimeHours, vacationDays, sickDays, otherAbsenceDays }` (L569-575) — Stunden aus `MonthlyValue.totalTargetTime / 60` etc.
- `accountValues: Record<string, number>` (L576) — sparse, Schlüssel = `Account.code` (z.B. `"NIGHT"`, `"SUN"`, `"HOLIDAY"`), Wert = Minutes/60. Zero-Konten erscheinen nicht.
- `contract.costCenter`, `contract.costCenterCode`, `tax.*`, `bank.iban` (decrypted), etc.

### 3. System Templates & Seed (`supabase/migrations/20260418100000_create_phase3_payroll_tables.sql`)

Die Migration legt 6 System-Templates an, lesbar über `systemExportTemplates.list` tRPC und kopierbar in Tenant-Templates via `systemExportTemplates.copyToTenant`.

#### Template 1 — "DATEV LODAS — Bewegungsdaten" (L71-113)

Metadaten: `target_system='datev_lodas'`, `encoding='windows-1252'`, `line_ending='crlf'`, `field_separator=';'`, `decimal_separator=','`, `date_format='TT.MM.JJJJ'`, `output_filename='LODAS_{{ period.year }}{{ period.monthPadded }}.txt'`.

Template-Body (gekürzt):

```liquid
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
{%- assign val = wage.terpSource | terp_value: employee -%}
{%- if val and val != 0 -%}
{{ employee.personnelNumber }};{{ period.ddmmyyyy }};{{ val | datev_decimal: 2 }};{{ wage.code }};{{ employee.costCenter }}
{% endif -%}
{%- endif -%}
{%- endfor -%}
{%- endfor -%}
```

Das ist **das Template, das den IST-Output produziert** (mit Patch aus Migration `20260430000000`, die `employee.monthlyValues[wage.terpSource]` durch `wage.terpSource | terp_value: employee` ersetzt hat).

**Warum klebt `[Bewegungsdaten]` an der ersten Datenzeile?** Das `{%- for employee in employees -%}` verwendet führendes `-` (trim whitespace before) und nachfolgendes `-` (trim whitespace after). Das `\n` zwischen `[Bewegungsdaten]` und `{%- for` wird getrimmt. Die Datenzeile wird ohne vorangestelltes Newline ausgegeben.

#### Template 2 — "DATEV LODAS — Stamm + Bewegungsdaten" (L115-163)

Erweitert Template 1 um Satzarten 11/12/13 (Stammdaten):
```
11;u_lod_psd_mitarbeiter;pnr#psd;familienname#psd;vorname#psd;geburtsdatum#psd;strassenname#psd;plz#psd;ort#psd;eintrittsdatum#psd;austrittsdatum#psd
12;u_lod_psd_taetigkeit;pnr#psd;pers_gruppe#psd;beitragsgruppe#psd;taetigkeitsschluessel#psd
13;u_lod_psd_bank;pnr#psd;iban#psd;bic#psd
21;u_lod_bwd_buchung_standard;...
```

#### Template 3 — "DATEV Lohn und Gehalt" (L165-197)

`Ziel=LUG`, `wage.code | pad_left: 4, "0"` für 4-stellige Lohnarten. **Hier wird bereits der `pad_left`-Filter für Zero-Padding produktiv genutzt** — direkter Präzedenzfall.

#### Prisma Models

`SystemExportTemplate` (`prisma/schema.prisma:3914-3931`) — read-only, global. Felder: `id, name UNIQUE, description, targetSystem, templateBody, outputFilename, encoding, lineEnding, fieldSeparator, decimalSeparator, dateFormat, version, sortOrder`. Kein `isActive`, kein `tenantId`. CHECK-Constraint: `targetSystem IN ('datev_lodas', 'datev_lug', 'lexware', 'sage', 'custom')`.

`ExportTemplate` (L3749-3778) — tenant-owned Kopie. Zusätzlich: `tenantId`, `isActive`, `createdBy`, `updatedBy`, Relationen `versions`, `exportInterfaces` (default_template_id), `snapshots`, `schedules`. UNIQUE `(tenantId, name)`.

`copyToTenant`-Service (`src/lib/services/system-export-template-service.ts:37-85`): kopiert alle Felder, wenn Name-Konflikt, iteriert Suffix `(Kopie)`, `(Kopie 2)`, ….

### 4. Lohnart-Mapping (`TenantPayrollWage`)

#### Default-Seed (20 Standard-Lohnarten)

`supabase/migrations/20260417100000_create_export_templates_and_payroll_wages.sql:104-125` seedet `default_payroll_wages` mit 20 Einträgen:

| Code | Name | terpSource | Kategorie |
|---|---|---|---|
| 1000 | Sollstunden | `targetHours` | time |
| 1001 | Iststunden | `workedHours` | time |
| 1002 | Mehrarbeit/Überstunden | `overtimeHours` | time |
| 1003 | Nachtarbeit | `account:NIGHT`¹ | time |
| 1004 | Sonntagsarbeit | `account:SUN`¹ | time |
| 1005 | Feiertagsarbeit | `account:HOLIDAY`¹ | time |
| 2000 | Urlaub | `vacationDays` | absence |
| 2001 | Krankheit | `sickDays` | absence |
| 2002 | Sonstige Fehlzeit | `otherAbsenceDays` | absence |
| 2003 | Mutterschutz | `maternityDays` | absence |
| 2004 | Elternzeit | `parentalLeaveDays` | absence |
| 2005 | Bezahlte Freistellung | `paidLeaveDays` | absence |
| 2100 | Bruttogehalt | `grossSalary` | compensation |
| 2101 | Stundenlohn | `hourlyRate` | compensation |
| 2200–2204 | Dienstwagen/Jobrad/Essenszuschuss/Sachgutschein/Jobticket | (benefits) | benefit |
| 2900 | Pfändung | `garnishment` | deduction |

¹ — nach Migration `20260430000000_datev_surcharge_terpsource_update.sql` (bisher uncommittet aber auf Disk vorhanden).

#### Lazy-Init

`src/lib/services/payroll-wage-service.ts:33-42` → `listForTenant()` ruft `repo.copyDefaultsToTenant()` auf, wenn ein Tenant keine Lohnarten hat. Implementierung in `src/lib/services/payroll-wage-repository.ts:56-90` via `createMany({ skipDuplicates: true })`.

#### Tenant-spezifisches Anpassen

`tenant_payroll_wages` mit `UNIQUE(tenantId, code)`. `src/trpc/routers/payrollWages.ts` exposed `list`, `initialize`, `update`, `reset`. Admin-UI unter `/admin/payroll-wages`.

### 5. Personnel Number (Personalnummer / PNR)

#### Storage

`prisma/schema.prisma:1845`:
```
personnelNumber  String  @map("personnel_number") @db.VarChar(50)
@@unique([tenantId, personnelNumber])
```

- Typ: `VARCHAR(50)`, Unique pro Tenant. Kein Format-Constraint (weder Regex noch Numeric-Only).
- Seed-Werte (`supabase/seed.sql:205-216`, `3083-3088`): `EMP001` bis `EMP011+`. Alphanumerisch, **nicht** numerisch.

#### Flow in ExportContext

`src/lib/services/export-context-builder.ts:509`: `personnelNumber: emp.personnelNumber` — roh durchgereicht.
`src/lib/services/export-context-builder.ts:476`: Prisma-Query `orderBy: [{ personnelNumber: "asc" }]` — alphabetisch (String-Order), nicht numerisch.

#### Zero-Padding im Template

Vorhandener Präzedenzfall im LuG-Template (Phase-3-Migration, L190): `{{ wage.code | pad_left: 4, "0" }}`.

`pad_left: 5, "0"` auf `"EMP001"` ergibt `"EMP001"` (bereits 6 Zeichen, kein Padding). Auf `"40"` ergibt `"00040"` (SOLL).

**Begrenzung**: Der Filter ist ein String-Operator — er casted Number → String, aber parst alphanumerische Präfixe nicht heraus. Für das Pro-Di-SOLL-Format müssen die PNR-Werte in der DB **numerisch sein** (z.B. `"40"`, `"8"`, `"74"`). Das Ticket adressiert dies unter "Architektur-Entscheidungen: Die PNR muss aus der Mitarbeiter-Personalnummer kommen (numerisch), nicht aus einer internen ID."

### 6. Tenant DATEV-Konfiguration (`ExportInterface`)

#### Prisma Model (`prisma/schema.prisma:3717-3741`)

```
model ExportInterface {
  id                String   @id
  tenantId          String
  interfaceNumber   Int
  name              String   @db.VarChar(255)
  mandantNumber     String?  @db.VarChar(50)
  beraterNr         String?  @db.VarChar(7)    // ← nullable, 4-7 Ziffern
  defaultTemplateId String?                      // FK → ExportTemplate
  exportScript      String?
  exportPath        String?
  outputFilename    String?
  isActive          Boolean  @default(true)
  @@unique([tenantId, interfaceNumber])
}
```

#### <a id="gap-1-beraternr-nicht-im-trpc-schema"></a>Gap 1: `beraterNr` nicht im tRPC-Schema

`src/trpc/routers/exportInterfaces.ts`:

- **Output-Schema `exportInterfaceOutputSchema` (L48)**: enthält `mandantNumber`, `defaultTemplateId`, `exportScript`, `exportPath`, `outputFilename`, `isActive`, `accounts` — aber **kein `beraterNr`**.
- **Input-Schemas `createInputSchema` (L65)** und **`updateInputSchema` (L74)**: enthalten `mandantNumber` — aber **kein `beraterNr`**.
- `src/lib/services/export-interface-service.ts:193`: `update()` handhabt nur `mandantNumber`, nicht `beraterNr`.

Folge: Das DB-Feld wird nur beim Context-Build gelesen (`export-context-builder.ts:363-374`):
```typescript
const ei = await prisma.exportInterface.findFirst({
  where: { id: options.exportInterfaceId, tenantId },
  select: { name: true, mandantNumber: true, beraterNr: true },
})
if (ei) {
  exportInterface = {
    name: ei.name,
    mandantNumber: ei.mandantNumber ?? "",
    beraterNr: ei.beraterNr ?? "",
  }
}
```

Aber es gibt keinen UI-/API-Weg, den Wert zu **setzen** — außer via direkter DB-Manipulation oder seed. Die DATEV-Onboarding-Checkliste (`src/lib/services/datev-onboarding-service.ts:97-101`) prüft dennoch `beraterNrSet`, sodass die Zeile "BeraterNr gepflegt" in der Onboarding-UI für Tenants ohne direkte DB-Befüllung permanent ❌ bleibt.

#### UI-Seite

`src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx` — nutzt `useExportInterfaces` und `useDeleteExportInterface` Hooks; rendert `ExportInterfaceDataTable`, `ExportInterfaceFormSheet`, `ExportInterfaceDetailSheet`, `AccountMappingDialog`.

### 7. Zuschlags-Pipeline (Account-basiert)

#### Account-Model (`prisma/schema.prisma:1703-1739`)

```
model Account {
  code              String   @db.VarChar(50)
  accountType       String   // CHECK: 'bonus' | 'day' | 'month'
  unit              String   // CHECK: 'minutes' | 'hours' | 'days'
  isPayrollRelevant Boolean
  payrollCode       String?  // DATEV-Lohnart-Code (Legacy-Pfad-Fallback)
  bonusFactor       Decimal? @db.Decimal(5, 2)
  @@unique([tenantId, code])
}
```

#### Seed-Konten (`supabase/seed.sql:433-441`)

| Code | accountType | isPayrollRelevant | payrollCode |
|---|---|---|---|
| `NIGHT` | `bonus` | `true` | `1015` |
| `SAT` | `bonus` | `true` | `1020` |
| `SUN` | `bonus` | `true` | `1025` |
| `HOLIDAY` | `bonus` | `true` | `1030` |
| `ONCALL` | `day` | `false` | NULL |
| `TRAVEL` | `day` | `false` | NULL |
| `SICK` | `month` | `false` | NULL |

#### DailyAccountValue → accountValues Aggregation

`src/lib/services/payroll-export-repository.ts:189-210` — `aggregateDailyAccountValues()`:
```typescript
prisma.dailyAccountValue.groupBy({
  by: ['employeeId', 'accountId'],
  _sum: { valueMinutes: true },
  where: { tenantId, employeeId: { in: ids }, accountId: { in: accountIds },
           valueDate: { gte: monthStart, lte: monthEnd } },
})
```
Keine `source`-Filter → summiert über `net_time`, `capped_time`, `surcharge`, `absence_rule`.

`src/lib/services/payroll-export-repository.ts:222-261` — `aggregateAccountValuesForContext()`:
1. Lädt alle aktiven Accounts (`tenantId = X OR tenantId IS NULL`) — inklusive globaler System-Accounts.
2. Minutes → Hours (÷60).
3. Sparse: `valueMinutes === 0` übersprungen.

`src/lib/services/export-context-builder.ts:489-503, 576`: transformiert in `Map<employeeId, Map<accountCode, hours>>` und setzt `employee.accountValues`.

#### Zuschlags-Konfiguration am DayPlan

`prisma/schema.prisma:2776-2797` — `DayPlanBonus`:
```
dayPlanId, accountId, timeFrom (minutes), timeTo (minutes),
calculationType ('fixed'|'per_minute'|'percentage'),
valueMinutes, minWorkMinutes, appliesOnHoliday, sortOrder
```

Flow (aus `thoughts/shared/tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege.md:9-16`):
```
DayPlanBonus (on DayPlan)
  → convertBonusesToSurchargeConfigs  [daily-calc.helpers.ts:409-424]
  → calculateSurcharges               [src/lib/calculation/surcharges.ts:31-95]
  → DailyAccountValue source="surcharge"  [daily-calc.ts:1624-1693]
```

#### Uncommittet: Migration `20260430000000_datev_surcharge_terpsource_update.sql`

Führt drei idempotente Blöcke aus:
- **Block A**: `UPDATE default_payroll_wages SET terp_source='account:NIGHT/SUN/HOLIDAY' WHERE code='1003/1004/1005'`.
- **Block B**: `UPDATE tenant_payroll_wages SET terp_source='account:...' WHERE terp_source='nightHours/sundayHours/holidayHours'`.
- **Block C**: `UPDATE system_export_templates SET template_body = REPLACE(template_body, 'employee.monthlyValues[wage.terpSource]', 'wage.terpSource | terp_value: employee')` — patches alle 6 Seed-Templates auf den `terp_value`-Filter.

### 8. Legacy vs. Template-Based Export

#### Pfad A — Legacy (`src/lib/services/payroll-export-service.ts`)

`generateDatevLodas()` (L135-190) produziert ein einfaches CSV mit Header:
```
Personalnummer;Nachname;Vorname;Lohnart;Stunden;Tage;Betrag;Kostenstelle
```

Hardcoded 6 Wage-Types (L143-149):
```javascript
const baseLohnarten = [
  { code: "1000", getValue: (l) => ({ hours: l.targetHours,   days: 0 }) },
  { code: "1001", getValue: (l) => ({ hours: l.workedHours,   days: 0 }) },
  { code: "1002", getValue: (l) => ({ hours: l.overtimeHours, days: 0 }) },
  { code: "2000", getValue: (l) => ({ hours: 0, days: l.vacationDays }) },
  { code: "2001", getValue: (l) => ({ hours: 0, days: l.sickDays }) },
  { code: "2002", getValue: (l) => ({ hours: 0, days: l.otherAbsenceDays }) },
]
```

Verwendet `Account.payrollCode || Account.code` als Lohnart-Identifier (L171-186). **Kein** LODAS-Header, **keine** `u_lod_bwd_*`-Strings. Ausgabe in `PayrollExport.fileContent` (String). Download re-konvertiert bei Bedarf auf xlsx/json/xml.

#### Pfad B — Template-Engine (`src/lib/services/export-engine-service.ts`)

`generateExport()` (L260-374):

1. `loadTemplate()` → `prisma.exportTemplate.findFirst`.
2. `buildExportContext()` → vollständiger Context (Tenant, ExportInterface, PayrollWages, Employees).
3. `parseMultiFileBody()` → optionales `{% file "name" %}…{% endfile %}`-Bündeln in ZIP.
4. `renderTemplate()` → Liquid render + Timeout-Guard.
5. `encodeOutput()` → Windows-1252 / UTF-8 / UTF-8-BOM, CRLF/LF.
6. `renderFilename()` → Liquid-gerenderter Output-Name (Path-Traversal-Strip).
7. `sha256Hex()` → Datei-Hash für Audit.
8. `auditLog.log(...)` → Eintrag mit `action='export'`, `fileHash`, `byteSize`, `templateVersion`, `targetSystem`.

Test-Pfad `preview` (read-only) nutzt `isTest: true`, liefert 50-KB-truncated String.

### 9. Tests

#### Unit/Integration (Vitest)

- `src/lib/services/__tests__/liquid-engine.test.ts` — alle 7 Custom-Filter, Sandboxing (filesystem, prototype), 243+ Zeilen
- `src/lib/services/__tests__/export-engine-service.test.ts` — Render, Timeout, Encoding, SHA256
- `src/lib/services/__tests__/export-engine-multifile.test.ts` — `{% file %}`-Blöcke + ZIP
- `src/lib/services/__tests__/export-context-builder.test.ts` — Context-Aufbau
- `src/lib/services/__tests__/export-template-service.integration.test.ts` — Template-CRUD
- `src/lib/services/__tests__/export-template-phase4.integration.test.ts` — Phase-4 inkl. Snapshots
- `src/lib/services/__tests__/system-export-template-service.integration.test.ts` — `copyToTenant`, Library
- `src/lib/services/__tests__/payroll-wage-service.integration.test.ts` — Lazy-Init, `reset`

#### tRPC-Router-Tests

- `src/trpc/routers/__tests__/exportTemplates.test.ts`
- `src/trpc/routers/__tests__/exportInterfaces-router.test.ts`
- `src/trpc/routers/__tests__/payrollWages.test.ts`
- `src/trpc/routers/__tests__/payrollExports-router.test.ts`

#### Playwright E2E

- `src/e2e-browser/62-export-templates.spec.ts` — Template-UI inkl. LODAS-Header-Assertions (Zeilen 66-67 prüfen `BeraterNr={{ exportInterface.beraterNr }}` + `MandantenNr={{ exportInterface.mandantNumber }}`)
- `src/e2e-browser/63-payroll-phase3.spec.ts` — Phase-3-Export-Flow
- `src/e2e-browser/64-export-template-phase4.spec.ts` — Phase-4 Schedules/Snapshots

## Code References

- `src/lib/services/liquid-engine.ts:13-24` — Sandboxed Liquid engine factory
- `src/lib/services/liquid-engine.ts:28-47` — `datev_date` filter (three formats)
- `src/lib/services/liquid-engine.ts:50-58` — `datev_decimal` filter (default 2 decimals, German comma)
- `src/lib/services/liquid-engine.ts:72-79` — `pad_left` filter (zero-padding)
- `src/lib/services/liquid-engine.ts:103-122` — `terp_value` filter (`account:` prefix dispatch)
- `src/lib/services/export-engine-service.ts:90-126` — `renderTemplate()` + timeout guard
- `src/lib/services/export-engine-service.ts:132-154` — `encodeOutput()` (Windows-1252, CRLF)
- `src/lib/services/export-engine-service.ts:260-374` — `generateExport()` orchestrator
- `src/lib/services/export-context-builder.ts:280-299` — `buildPeriod()` (both `ddmmyyyy` and `firstDay`)
- `src/lib/services/export-context-builder.ts:358-375` — ExportInterface-Load mit `beraterNr`
- `src/lib/services/export-context-builder.ts:489-503,576` — `accountValues`-Einsetzung auf Employee
- `src/lib/services/export-context-builder.ts:509` — `personnelNumber` roh durchgereicht
- `src/lib/services/payroll-export-service.ts:135-190` — Legacy `generateDatevLodas()` (nicht LODAS-Format!)
- `src/lib/services/payroll-export-repository.ts:189-260` — `aggregateDailyAccountValues` / `aggregateAccountValuesForContext`
- `src/lib/services/system-export-template-service.ts:37-85` — `copyToTenant` mit Name-Collision-Suffix
- `src/lib/services/payroll-wage-service.ts:33-42` — Lazy-Init der Tenant-Lohnarten
- `src/lib/services/payroll-wage-repository.ts:56-90` — `copyDefaultsToTenant`
- `src/lib/services/datev-onboarding-service.ts:97-101` — Onboarding-Status-Check
- `src/trpc/routers/exportInterfaces.ts:48,65,74,193` — **`beraterNr` fehlt** in Input/Output-Schemas
- `src/trpc/routers/systemExportTemplates.ts` — System-Template-Router
- `src/trpc/routers/exportTemplates.ts` — Tenant-Template-Router (CRUD + preview + run)
- `src/trpc/routers/payrollWages.ts` — Lohnart-CRUD
- `prisma/schema.prisma:1703-1739` — `Account` model
- `prisma/schema.prisma:1845-2037` — `Employee` model (personnelNumber VarChar(50))
- `prisma/schema.prisma:2776-2797` — `DayPlanBonus` model
- `prisma/schema.prisma:3717-3741` — `ExportInterface` model
- `prisma/schema.prisma:3749-3778` — `ExportTemplate` model
- `prisma/schema.prisma:3875-3905` — `DefaultPayrollWage` / `TenantPayrollWage`
- `prisma/schema.prisma:3914-3931` — `SystemExportTemplate` model
- `supabase/migrations/20260417100000_create_export_templates_and_payroll_wages.sql:104-125` — 20-Lohnart-Seed
- `supabase/migrations/20260418100000_create_phase3_payroll_tables.sql:71-113` — Template 1 Body (Satzart 21)
- `supabase/migrations/20260418100000_create_phase3_payroll_tables.sql:115-163` — Template 2 Body (Stammdaten+Bewegung)
- `supabase/migrations/20260418100000_create_phase3_payroll_tables.sql:165-197` — Template 3 Body (LuG, mit `pad_left: 4, "0"`)
- `supabase/migrations/20260430000000_datev_surcharge_terpsource_update.sql` — Uncommitted: `terp_source` → `account:`-Prefix + Template-Patch
- `supabase/seed.sql:205-216` — Employees EMP001–EMP010 (alphanumerische PNR)
- `supabase/seed.sql:433-441` — Bonus-Accounts NIGHT/SAT/SUN/HOLIDAY + ONCALL/TRAVEL/SICK
- `src/app/[locale]/(dashboard)/admin/export-templates/library/page.tsx` — Template-Bibliothek-UI
- `src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx` — Export-Interfaces-Admin-UI
- `src/app/[locale]/(dashboard)/admin/datev-onboarding/page.tsx` — DATEV-Onboarding-Checkliste-UI
- `docs/TERP_HANDBUCH.md:9310-9876` — Abschnitt 20f. (Export-Templates + Lohnart-Mapping + Onboarding-Checkliste + Steuerberater-PDF)
- `docs/TERP_HANDBUCH.md:9509-9555` — Praxisbeispiel DATEV LODAS Template anlegen (referenziert **aktuell** Satzart 21!)

## Architecture Documentation

### Rollen-Trennung (aus Handbuch §20f.2)

| Schicht | Rolle | Frequenz |
|---|---|---|
| Stammdatenpflege | HR/Personal | laufend |
| Export-Mapping (Template + Lohnart-Mapping) | Administrator / Implementierungspartner / Steuerberater | einmalig |
| Monatlicher Export-Lauf | Buchhaltungsmitarbeiter | monatlich |

### Template-Strategie im Codebase

- System-Templates sind **schreibgeschützte Seeds** in der DB. UI erlaubt nur **Kopieren in Tenant-Template**, nicht Editieren.
- Tenant-Templates bekommen automatisch **Versionierung** (Body-Änderung bumpt `version`, archiviert alten Body in `ExportTemplateVersion`).
- `ExportInterface.defaultTemplateId` bindet eine Schnittstelle an ein Default-Template.
- **Template Library UI** (`/admin/export-templates/library`): 6 Karten mit "Als Vorlage verwenden"-Button → `systemExportTemplates.copyToTenant`.

### Sparse Account-Values

Die Entscheidung, `accountValues` **sparse** zu halten (Konten ohne Buchung erscheinen nicht im Record), ist in `aggregateAccountValuesForContext` (`payroll-export-repository.ts:252: if (minutes === 0) continue`) und im Template-Filter `terp_value` mit `?? 0`-Fallback verankert. Templates müssen zwischen "Konto nicht gebucht" (sparse miss → `0`) und "Konto gebucht mit 0 Stunden" nicht unterscheiden.

### Encoding-Prioritäten für LODAS

- Windows-1252 (`iconv.encode(text, "win1252")`) — DATEV-Standard
- CRLF — Windows-Zeilenenden
- `;` als Feldtrenner
- `,` als Dezimaltrenner (deutsch)

Diese vier sind **Template-Metadaten**, nicht fest verdrahtet — jedes Template kann sie überschreiben.

### Render-Pipeline Invarianten

- Timeout: 30s default (preview 10s)
- Max Output: 100 MB
- Strict Filters: unknown filter → error (bricht render)
- Non-Strict Variables: undefined → empty string (silently)
- `ownPropertyOnly: true` → `{{ obj.__proto__ }}` liefert leer
- Audit-Log auf **jeden** Export + jede Preview

## Historical Context (from thoughts/)

### Frühere Plans & Research

- `thoughts/shared/plans/2026-04-08-datev-lohn-template-export-engine.md` — Design-Plan der Template-Engine (Phase 3). Legt Liquid-Sandboxing, 6 Custom-Filter und Template-Versionierung fest.
- `thoughts/shared/plans/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` — Plan für den "vollständigen Datenlieferanten": alle lohnrelevanten Felder am Employee verfügbar für Templates.
- `thoughts/shared/plans/2026-04-17-pflicht-02-datev-zuschlaege.md` — Aktueller Plan für die Zuschlags-Umstellung. Liefert die `accountValues` + `terp_value`-Filter + Migration `20260430000000`.
- `thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md` — Plan für Tenant-Template-Starter-Varianten (referenziert Surcharge/DATEV-Kontext).
- `thoughts/shared/research/2026-04-17-datev-zuschlaege.md` — Deep-Research zum Zuschlags-Flow (End-to-End, 622 Zeilen). Identifiziert die drei Lücken, die im Ticket `pflicht-02` adressiert werden.
- `thoughts/shared/research/2026-04-08-export-script-konzept-lohnschnittstelle.md` — Konzept-Research zur LODAS/Lohn-Export-Script-Schnittstelle.
- `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` — Research-Basis für den Datenlieferanten-Plan.

### Aktives Ticket-Paket Pro-Di-Prelaunch

`thoughts/shared/tickets/prodi-prelaunch/README.md` — 8 Tickets für den Pro-Di-Launch (Q3/Q4 2026). Relevant für dieses Thema:

- `pflicht-02-datev-zuschlaege.md` — **Parallel-Ticket**. Hat Zuschlags-Konten + `terp_value` bereits geliefert (Migration `20260430000000` liegt als uncommitted file vor). Seed-Update `payrollCode=1015/1020/1025/1030` bereits auf Disk (`supabase/seed.sql:433-441`).
- Hinweis im Ticket `pflicht-02`: "Einzige externe Abhängigkeit: Der Pro-Di-Steuerberater muss die konkreten DATEV-Lohnarten-Nummern für die drei Bonus-Konten liefern." Die Pro-Di-Referenzdatei beantwortet das: **500=Grundstunden, 510=Nachtzuschlag, 100=Sonntagszuschlag, 410=Feiertagszuschlag**.
- `pflicht-01-nachtschicht-bewertungslogik.md` — betrifft Berechnung, nicht Export-Format.

### Audit-Log

Aktuelle Audit-Bugs in `thoughts/shared/audit/bugs/` haben keinen direkten Payroll-Export-Bezug. Die neue (ebenfalls uncommittete) Audit-Report-Datei `thoughts/shared/audit/2026-04-17-security-audit-report.md` betrifft Authentifizierung/Encryption, nicht Export.

## Related Research

- [`2026-04-17-datev-zuschlaege.md`](2026-04-17-datev-zuschlaege.md) — Zuschlags-Ende-zu-Ende-Flow (Voraussetzung für Pfad B)
- [`2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`](2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md) — Vollständiger Datenlieferant
- [`2026-04-08-export-script-konzept-lohnschnittstelle.md`](2026-04-08-export-script-konzept-lohnschnittstelle.md) — Export-Schnittstellen-Konzept
- [`2026-03-07-ZMI-TICKET-224-export-interfaces-payroll-reports.md`](2026-03-07-ZMI-TICKET-224-export-interfaces-payroll-reports.md) — ExportInterface-Konfiguration

## Open Questions

Diese Punkte sind im Ticket adressiert, aber haben im Ist-Code noch keine Antwort:

1. **PNR-Migration**: Das Ticket schreibt "PNR muss numerisch sein". Der Code speichert aber `VARCHAR(50)` und Seed-Daten sind `EMP001`-Style. Soll eine neue Spalte `personnelNumberNumeric` oder ein separates `payrollId`-Feld eingeführt werden, oder wird der bestehende `personnelNumber`-String bei Pro-Di von Haus aus numerisch sein (aus dem Lohnsystem-Import)? Dokumentation: Für Pro-Di Go-Live müssen die 180 Mitarbeiter-PNRs numerisch in `personnelNumber` gepflegt werden (z.B. via `20f.11 Lohn-Massenimport`) — der Filter `pad_left` erledigt dann das Zero-Padding. Eine separate numerische Spalte existiert nicht.

2. **BeraterNr-Router-Gap**: `ExportInterface.beraterNr` ist im DB-Model und im Onboarding-Checkup präsent, aber nicht im tRPC-Router-Schema oder Service-Layer exponiert. Für Pro-Di-Launch muss dies hinzugefügt werden, damit die UI den Wert setzen kann (siehe [Gap 1](#gap-1-beraternr-nicht-im-trpc-schema)).

3. **Satzart-1-Deklaration ohne Daten**: Das Ticket fordert `1;u_lod_bwd_buchung_tage;...` im `[Satzbeschreibung]`-Block OHNE zugehörige Datenzeilen. Der Liquid-Body würde den Header-String als Literal ausgeben — kein Engine-Feature nötig. Zu klären: ob die Pro-Di-Referenz-Datei ohne Buchungstage-Daten tatsächlich den Header akzeptiert. **Antwort aus der Referenzdatei**: ja — `datevexport_lohn.txt:7` deklariert Satzart 1 und liefert keine `1;...`-Datenzeilen.

4. **Lohnart-Mapping für Pro-Di**: Der Default-Seed verwendet 4-stellige Codes (1003, 1004, 1005). Pro-Di nutzt 3-stellige Codes (500, 510, 100, 410). Das Lohnart-Mapping ist pro Tenant konfigurierbar (`tenant_payroll_wages`), also kein Blocker — die Werte müssen nur vor Go-Live in der Tenant-UI gesetzt werden. Das passt zum in `pflicht-02.md:58` dokumentierten Onboarding-Task O1.

5. **"Satzart-21-NICHT-löschen"-Strategie**: Das Ticket fordert, Satzart 21 (buchung_standard) als **alternatives Template** zu behalten. Der Codebase unterstützt das trivial: System-Templates werden über `sort_order` priorisiert und haben eindeutige Namen. Ein neues System-Template `sort_order=15` (zwischen "DATEV LODAS — Bewegungsdaten" bei 10 und "DATEV LODAS — Stamm + Bewegungsdaten" bei 20) würde als **zusätzliche Karte** in der Template-Bibliothek erscheinen, ohne die bestehenden zu berühren. Alternativ könnte es mit `sort_order=5` zum neuen Default werden. Beide Optionen sind ohne Schema-Änderung machbar.

6. **Newline nach `[Bewegungsdaten]`**: Im IST-Template verursacht `{%- for -%}` (beidseitiges Whitespace-Trim) das Zusammenkleben. Ein neues Template muss das umkehren: `{% for -%}` oder `[Bewegungsdaten]\n{%- for -%}` → dann fügt das `\n` vor dem `{%-` ein Newline ein, das der Trim des for-Tags entfernt, bleibt aber erhalten wenn nur der führende Whitespace des nachfolgenden `{%-` getrimmt wird. Exakte Liquid-Whitespace-Semantik: `{%-` trimmt Whitespace **vor** dem Tag, `-%}` trimmt Whitespace **nach** dem Tag. Also: `[Bewegungsdaten]\n{% for … %}` (ohne führendes `-`) erhält das Newline; dann `{%- if … -%}\n{{ ... }}\n{%- endif -%}` → jede Datenzeile bekommt ihr eigenes `\n`.

## Appendix A — Exakte Delta-Karte (IST → SOLL)

Für das neue System-Template "DATEV LODAS — Bewegungsdaten (Stunden)":

| Aspekt | IST (Template 1, Migration 20260418100000) | SOLL (neues Template) |
|---|---|---|
| Header `Ziel=` | `LODAS` | `Lodas` (Pro-Di-Referenz lowercase — zu prüfen ob case-sensitive) |
| Header `Version_SST=` | `1.0` | — (Pro-Di omit) |
| Header `Datumsformat=` | `{{ template.dateFormat }}` (TT.MM.JJJJ) | — (Pro-Di omit) |
| Header `Feldtrennzeichen=` | `{{ template.fieldSeparator }}` | — (Pro-Di omit) |
| Header `Zahlenkomma=` | `{{ template.decimalSeparator }}` | — (Pro-Di omit) |
| `BeraterNr=` | `{{ exportInterface.beraterNr }}` | `{{ exportInterface.beraterNr }}` (gleich) |
| `MandantenNr=` | `{{ exportInterface.mandantNumber }}` | `{{ exportInterface.mandantNumber }}` (gleich) |
| Satzbeschreibung Satzart | `21;u_lod_bwd_buchung_standard` | `1;u_lod_bwd_buchung_tage;...` + `2;u_lod_bwd_buchung_stunden;...` |
| Feldfolge Satzart 2 | N/A | `abrechnung_zeitraum#bwd;la_eigene#bwd;pnr#bwd;stunden#bwd` |
| Datenzeile | `{{emp.personnelNumber}};{{period.ddmmyyyy}};{{val \| datev_decimal:2}};{{wage.code}};{{emp.costCenter}}` | `2;{{period.firstDay}};{{wage.code}};{{emp.personnelNumber \| pad_left:5,"0"}};{{val \| datev_decimal:2}};` |
| Datumsformat-Literal | `period.ddmmyyyy` → `01042026` | `period.firstDay` → `01.04.2026` |
| PNR-Format | roh → `EMP001` | `\| pad_left: 5, "0"` → `00040` |
| Kostenstelle | enthalten | entfällt |
| Newline nach `[Bewegungsdaten]` | fehlt (Trim) | **eingefügt** durch `{% for %}` statt `{%- for -%}` |
| Trailing `;` nach letztem Feld | nein | **ja** (siehe Pro-Di-Referenz Zeile 11: `...;00040;6,57;`) |

## Appendix B — Pfad-Referenzen für spätere `/create_plan`-Schritte

Die folgenden Dateien sind betroffen, wenn der Plan umgesetzt wird. **Keine Änderung** an Liquid-Engine, Context-Builder, oder tRPC-Router nötig (Ausnahme: [Gap 1](#gap-1-beraternr-nicht-im-trpc-schema) für ExportInterface.beraterNr-Router-Gap, falls UI-Pflege gefordert ist).

**Neue Datei** (System-Template-Seed):
- Neue Migration `supabase/migrations/YYYYMMDD_add_datev_lodas_buchung_stunden_template.sql` — `INSERT INTO system_export_templates (...)` mit dem neuen Template-Body.

**Betroffene Dateien** (Handbuch-Update):
- `docs/TERP_HANDBUCH.md:9509-9555` — Praxisbeispiel "DATEV LODAS-Template anlegen" (Abschnitt 20f.3.8) referenziert aktuell Satzart 21. Zu aktualisieren oder zu ergänzen.
- `docs/TERP_HANDBUCH.md:9723-9734` — Template-Bibliothek-Tabelle (Abschnitt 20f.8.1) listet aktuell 6 Templates. Neues Template als 7. Zeile oder als neue Default-Option.

**Optional** (falls BeraterNr-Router-Gap zeitgleich geschlossen wird):
- `src/trpc/routers/exportInterfaces.ts:48,65,74` — Output- und Input-Schemas um `beraterNr` erweitern
- `src/lib/services/export-interface-service.ts:193` — `update()` um `beraterNr` erweitern
- `src/components/export-interfaces/export-interface-form-sheet.tsx` (oder äquivalent) — Formular-Feld hinzufügen
