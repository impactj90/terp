---
date: 2026-04-08T21:00:00+02:00
researcher: Claude Code (Opus 4.6)
git_commit: ddc1777963d15bbb8b88e32af4386064d2fc0a6f
branch: staging
repository: terp
topic: "Export-Skript-Konzept für Lohnschnittstelle (DATEV/LODAS) — Ist-Zustand"
tags: [research, export-interface, payroll-export, datev, lodas, script-engine, lohnexport]
status: complete
last_updated: 2026-04-08
last_updated_by: Claude Code (Opus 4.6)
---

# Research: Export-Skript-Konzept für Lohnschnittstelle — Ist-Zustand

**Date**: 2026-04-08T21:00:00+02:00
**Researcher**: Claude Code (Opus 4.6)
**Git Commit**: ddc1777963d15bbb8b88e32af4386064d2fc0a6f
**Branch**: staging
**Repository**: terp

## Forschungsfrage

Ob und wie Terp aktuell ein Export-Skript-Konzept für die Lohnschnittstelle (DATEV/LODAS/Lexware) implementiert hat. Konkret: Ist das `exportScript`-Feld auf `ExportInterface` eine echte Skript-Engine, ein vorbereitetes aber ungenutztes Datenmodellfeld, oder nur ein Freitext-Konfigurationsfeld?

## Zusammenfassung

**Fazit: Szenario B — "Datenmodell vorbereitet, aber nicht implementiert"**

Das `exportScript`-Feld existiert als `VARCHAR(255)` in der DB und im Prisma-Schema. Es kann über die UI eingetragen und über CRUD-Operationen verwaltet werden. Es wird aber **nirgendwo im Export-Code gelesen, geparst oder ausgeführt**. Der Lohnexport-Service (`payroll-export-service.ts`) enthält zwei **hartcodierte** Format-Generatoren (`generateStandardCsv` und `generateDatevLodas`) und wählt zwischen ihnen per `switch (input.exportType)`. Eine Skript-Engine existiert nicht.

---

## 1. ExportInterface-Datenmodell

### Komplette Spaltenliste (Migration 000060, Prisma-Schema Zeile 3230)

| Spalte | Typ | Nullable | Beschreibung |
|---|---|---|---|
| `id` | UUID (PK) | Nein | gen_random_uuid() |
| `tenant_id` | UUID (FK → Tenant) | Nein | Mandant-Zuordnung |
| `interface_number` | INT | Nein | Eindeutige Nummer pro Tenant |
| `name` | VARCHAR(255) | Nein | Bezeichnung |
| `mandant_number` | VARCHAR(50) | **Ja** | Mandantennummer im externen Lohnsystem |
| `export_script` | VARCHAR(255) | **Ja** | "Export script name from Export folder (Skript)" |
| `export_path` | VARCHAR(500) | **Ja** | Ziel-Pfad für Exportdatei |
| `output_filename` | VARCHAR(255) | **Ja** | Dateiname mit Extension |
| `is_active` | BOOLEAN | Nein | Default: true |
| `created_at` | TIMESTAMPTZ | Nein | |
| `updated_at` | TIMESTAMPTZ | Nein | |

**Quelle:** `prisma/schema.prisma:3230–3252`, `supabase/migrations/20260101000060_create_export_interfaces.sql`

### Das `exportScript`-Feld im Detail

- **Datentyp:** `VARCHAR(255)` — kein JSON, kein Text-Blob. Nur ein kurzer String.
- **DB-Kommentar:** `'Export script name from Export folder (Skript)'` (Zeile 31 der Migration)
- **Placeholder in der UI:** `"z.B. export_datev.sh"` / `"e.g. export_datev.sh"` (`messages/de.json:3029`)
- **Bedeutung:** Es ist als **Dateiname eines externen Skripts** gedacht, nicht als Skript-Inhalt. Der VarChar(255) und der Placeholder bestätigen das.

### tRPC-Procedures

Datei: `src/trpc/routers/exportInterfaces.ts`

| Procedure | Methode | Felder |
|---|---|---|
| `list` | Query | Alle Interfaces des Tenants |
| `getById` | Query | Einzelnes Interface mit Konten |
| `create` | Mutation | `interfaceNumber`, `name`, `mandantNumber?`, `exportScript?`, `exportPath?`, `outputFilename?` |
| `update` | Mutation | Alle Felder optional updatebar inkl. `exportScript` |
| `remove` | Mutation | Löschen (nur wenn keine generierten Exporte) |
| `listAccounts` | Query | Zugeordnete Konten |
| `setAccounts` | Mutation | Konten zuordnen/ersetzen |

### UI-Seite

- **Formular:** `src/components/export-interfaces/export-interface-form-sheet.tsx:220–230`
  - Einfaches `<Input>` für `exportScript` mit `maxLength={255}`
  - Keine Datei-Upload-Logik, kein Script-Editor, kein Syntax-Highlighting
- **Detail-Sheet:** `src/components/export-interfaces/export-interface-detail-sheet.tsx:128`
  - Zeigt `exportScript` als reinen Textwert an (`DetailRow`)

---

## 2. Aktuelle Verwendung des Felds

### Wird `exportScript` im Export-Code gelesen?

**Nein.** Die Suche nach `exportScript` und `export_script` in den beiden Export-Service-Dateien ergibt 0 Treffer:

- `src/lib/services/payroll-export-service.ts` — **kein Treffer**
- `src/lib/services/payroll-export-repository.ts` — **kein Treffer**

Das Feld wird **ausschließlich** in folgenden Kontexten verwendet:

1. **CRUD-Operationen:** Export-Interface-Service schreibt und liest das Feld als Teil des Interface-Datensatzes (`export-interface-service.ts:18, 76, 114, 145, 196–197`)
2. **Audit-Logging:** Das Feld ist in `TRACKED_FIELDS` für Change-Tracking (`export-interface-service.ts:14–22`)
3. **UI-Formular:** Eingabe und Anzeige in der React-Komponente
4. **Tests:** Tests setzen es auf `null` (`exportInterfaces-router.test.ts:62`)

### Wird es geparst, ausgeführt, interpretiert?

**Nein.** Es gibt keinen Code, der:
- das Feld aus dem Interface liest, bevor ein Export generiert wird
- einen Dateinamen/Pfad daraus auflöst
- ein Skript oder Template daraus lädt
- den Wert als Steuerungsparameter für die Export-Generierung nutzt

### Gibt es Tests, die das Feld funktional nutzen?

**Nein.** Alle Tests setzen `exportScript: null`. Kein Test prüft ein Verhalten, das durch den Wert von `exportScript` gesteuert wird.

---

## 3. Aktueller Lohnexport-Service

### Architektur

Der Payroll-Export-Service (`src/lib/services/payroll-export-service.ts`) funktioniert wie folgt:

1. **Eingabe:** `{ year, month, format, exportType, exportInterfaceId?, parameters? }`
2. **Mitarbeiter laden:** Über Repository (`findEmployeesWithRelations`) mit Abteilungs-/MA-Filter
3. **Monatswerte prüfen:** Alle MA müssen geschlossene `MonthlyValue`-Records haben
4. **Kontenwerte aggregieren:** `DailyAccountValue`-Aggregation pro Mitarbeiter/Konto
5. **Format generieren:** **Hartcodierter Switch** (Zeile 450–457):

```typescript
switch (input.exportType) {
  case "datev":
    fileContent = generateDatevLodas(lines, accountInfoMap)
    break
  default: // 'standard', 'sage', 'custom'
    fileContent = generateStandardCsv(lines, accountCodeList)
    break
}
```

### Lohnart-Zuordnung: Teilweise hartcodiert, teilweise dynamisch

**Hartcodierte Basis-Lohnarten** (DATEV-Format, Zeile 142–150):

| Lohnart-Code | Quelle |
|---|---|
| `1000` | Sollstunden (targetHours) |
| `1001` | Gearbeitete Stunden (workedHours) |
| `1002` | Überstunden (overtimeHours) |
| `2000` | Urlaubstage (vacationDays) |
| `2001` | Krankheitstage (sickDays) |
| `2002` | Sonstige Abwesenheit (otherAbsenceDays) |

**Dynamische Konto-basierte Lohnarten** (Zeile 170–187):
- Für jedes dem ExportInterface zugeordnete Konto wird eine Zeile generiert
- Die Lohnart kommt aus `account.payrollCode` (oder als Fallback `account.code`)
- Das ist **nicht** hartcodiert — es kommt aus der DB-Konfiguration

### Wird `exportScript` verwendet?

**Nein.** Der Service kennt das ExportInterface nur über `exportInterfaceId` → er lädt daraus die **zugeordneten Konten** (`findExportInterfaceAccounts`), aber liest **kein einziges** der Felder `exportScript`, `exportPath` oder `outputFilename` aus dem Interface-Record.

### Dateiformat-Generierung

- **Standard-CSV** (`generateStandardCsv`, Zeile 94–132): Semikolon-getrennt, englische Header, eine Zeile pro MA
- **DATEV-LODAS** (`generateDatevLodas`, Zeile 135–190): Semikolon-getrennt, deutsche Header, eine Zeile pro MA+Lohnart-Kombination (Langformat)
- **Dateiname:** Hartcodiert als `payroll_export_YYYY_MM.{ext}` (Zeile 647)
- **Download-Konvertierung:** CSV → JSON/XML/XLSX geschieht nachträglich in `download()` (Zeile 607–673)

---

## 4. Konten → Lohnart-Zuordnung

### Datenmodell

**Tabelle `accounts`** (`prisma/schema.prisma:1303–1334`):

| Feld | Typ | Beschreibung |
|---|---|---|
| `is_payroll_relevant` | BOOLEAN (default false) | Kennzeichen: Konto ist lohnexport-relevant |
| `payroll_code` | VARCHAR(50), nullable | Lohnart-Code für den Export |

**Tabelle `export_interface_accounts`** (Junction Table, `prisma/schema.prisma:3261–3277`):

| Feld | Typ | Beschreibung |
|---|---|---|
| `export_interface_id` | UUID (FK) | Welches ExportInterface |
| `account_id` | UUID (FK) | Welches Konto |
| `sort_order` | INT (default 0) | Reihenfolge |

### Zuordnungslogik

Die Zuordnung ist **pro ExportInterface** (das wiederum pro Tenant existiert):
- Ein ExportInterface hat N zugeordnete Konten (über Junction Table)
- Jedes Konto hat ein optionales `payrollCode`
- Im DATEV-Export (Zeile 174): `const lohnart = info.payrollCode || info.code`

### Wird die Zuordnung heute genutzt?

**Ja, aktiv.** Im `payroll-export-service.ts`:
- Zeile 392–399: Wenn keine expliziten `includeAccounts` angegeben sind, werden die Konten des ExportInterface geladen
- Zeile 401–408: Account-Info-Map wird aufgebaut mit `code` und `payrollCode`
- Zeile 170–187: DATEV-Generator nutzt `payrollCode` als Lohnart

---

## 5. Vergleich mit anderen Export-Patterns

### DATEV-Eingangsrechnungen (`inbound-invoice-datev-export-service.ts`)

- **Komplett hartcodiert:** DATEV EXTF-Header, Spaltenreihenfolge, Steuerschlüssel-Mapping
- **Kein Skript-Konzept:** `VAT_KEY_MAP` als statisches Record (Zeile 16–20)
- **Encoding:** iconv-lite für Windows-1252 (DATEV-Standard)
- **Pattern:** Service generiert String direkt, kein Template/Mapping-System

### Audit-Log-Export (`audit-log-export-service.ts`)

- Neues Feature (in Entwicklung auf dem Branch)
- PDF-basiert, kein CSV/Template-Konzept

### Allgemeines Export-Pattern in Terp

Es gibt **kein** generisches Export-Framework, keine Template-Engine, kein Mapping-System. Jeder Export ist ein eigenständiger Service mit hartcodierter Format-Logik.

---

## 6. Historischer Kontext

### Migration-Kommentar

`COMMENT ON COLUMN export_interfaces.export_script IS 'Export script name from Export folder (Skript)';`

Das Feld wurde als "Skript-Name aus einem Export-Ordner" konzipiert — d.h. ursprünglich war die Idee, dass auf dem Filesystem ein Ordner mit Exportskripten liegt, und das Feld den Dateinamen eines solchen Skripts speichert.

### Plan-Dokument

`thoughts/shared/plans/2026-03-07-ZMI-TICKET-224-export-interfaces-payroll-reports.md` definiert das Datenmodell mit `exportScript? (VarChar 255)` — das Feld war Teil des ursprünglichen Designs, wurde aber nur als Datenmodellfeld implementiert.

### UI-Plan

`thoughts/shared/plans/2026-02-03-ZMI-TICKET-045-export-interface-configuration-ui.md` zeigt:
- Das Feld wird in der UI als einfaches Text-Input dargestellt
- Placeholder: "z.B. export_datev.sh"
- Kein Plan für Skript-Ausführung, Datei-Upload oder Skript-Editor

### ZMI-Vorbild

Im ZMI Time ist `Skript` ein Verweis auf ein externes Shell-/Batch-Skript, das nach dem Datei-Export aufgerufen wird (z.B. um die Datei per FTP zu übertragen oder in ein Verzeichnis des Steuerberaters zu kopieren). Terp hat das Datenmodellfeld übernommen, aber die Ausführungslogik nie implementiert.

---

## Fazit

### **Szenario B — "Datenmodell vorbereitet, aber nicht implementiert"**

**Begründung mit Code-Verweisen:**

1. **Feld existiert:** `prisma/schema.prisma:3236` — `exportScript String? @map("export_script") @db.VarChar(255)`
2. **UI-Eingabe möglich:** `src/components/export-interfaces/export-interface-form-sheet.tsx:220–230`
3. **CRUD funktioniert:** `src/lib/services/export-interface-service.ts:76, 114, 196–197`
4. **Aber: Payroll-Export ignoriert es komplett:** `src/lib/services/payroll-export-service.ts` enthält 0 Referenzen auf `exportScript`
5. **Export-Logik ist hartcodiert:** `src/lib/services/payroll-export-service.ts:450–457` (switch auf `exportType`)
6. **Kein Skript-Loader, keine Engine, kein Template-System** existiert im gesamten Codebase

### Was heute funktioniert (ohne Skript-Engine):

- ExportInterface definiert, **welche Konten** exportiert werden (über Junction Table)
- Account.`payrollCode` definiert, **welche Lohnart** ein Konto im Export bekommt
- Der `exportType` ("standard" vs. "datev") wählt das **Format** (aber nur 2 hartcodierte Varianten)

### Was `exportScript` im ZMI-Kontext bedeutet hätte:

Ein Verweis auf ein externes Skript (z.B. `export_datev.sh`), das nach der Datei-Generierung aufgerufen wird — für Nachverarbeitung, Dateitransfer, oder Format-Konvertierung. Diese Funktionalität existiert in Terp nicht.

---

## Code References

- `prisma/schema.prisma:3230–3252` — ExportInterface Model
- `prisma/schema.prisma:3261–3277` — ExportInterfaceAccount Junction Table
- `prisma/schema.prisma:3286–3322` — PayrollExport Model
- `prisma/schema.prisma:1303–1334` — Account Model (payrollCode, isPayrollRelevant)
- `supabase/migrations/20260101000060_create_export_interfaces.sql:11,31` — export_script Spalte + Kommentar
- `src/lib/services/export-interface-service.ts` — CRUD Service (kein Export-Logik)
- `src/lib/services/export-interface-repository.ts` — Repository (kein exportScript-Nutzung)
- `src/lib/services/payroll-export-service.ts:94–190` — Zwei hartcodierte Format-Generatoren
- `src/lib/services/payroll-export-service.ts:450–457` — Switch zwischen Standard/DATEV
- `src/lib/services/payroll-export-service.ts:392–408` — Account-Laden über ExportInterface
- `src/lib/services/payroll-export-repository.ts:168–176` — ExportInterfaceAccounts-Query
- `src/lib/services/inbound-invoice-datev-export-service.ts` — Separater hartcodierter DATEV-Buchungsexport
- `src/components/export-interfaces/export-interface-form-sheet.tsx:220–230` — UI-Input für exportScript
- `src/trpc/routers/exportInterfaces.ts:54,69,79` — Zod-Schemas mit exportScript

## Historical Context (from thoughts/)

- `thoughts/shared/plans/2026-03-07-ZMI-TICKET-224-export-interfaces-payroll-reports.md:114` — Ursprüngliches Datenmodell-Design
- `thoughts/shared/plans/2026-02-03-ZMI-TICKET-045-export-interface-configuration-ui.md:282,408` — UI-Placeholder-Texte
- `thoughts/shared/tickets/ZMI-TICKET-182-datev-export.md` — DATEV-Buchungsexport-Ticket (Rechnungen, nicht Lohn)
- `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` — Aktuelle Forschung zu DATEV-LODAS-Vollexport

## Open Questions

1. Soll `exportScript` als Post-Export-Hook (externe Skript-Ausführung) implementiert werden, oder soll das Feld eine andere Semantik bekommen (z.B. Template-Name)?
2. Für die DATEV-LODAS-Erweiterung: Werden die hartcodierten Lohnarten 1000–2002 durch konfigurierbare Zuordnungen ersetzt, oder bleiben sie als Standard-Mapping?
3. Sollen `exportPath` und `outputFilename` in Zukunft genutzt werden (z.B. für automatisierte Dateiablage im DATEV-Belegordner)?
