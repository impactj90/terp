---
date: 2026-04-17T10:12:55+02:00
researcher: impactj90
git_commit: 021aa0aac411f146cedc8283d162fd879697a5c2
branch: staging
repository: terp
topic: "DATEV-Zuschläge — Ist-Zustand DayPlanBonus, calculateSurcharges, DATEV-Export, §3b, Feiertage, UI"
tags: [research, codebase, surcharges, dayplanbonus, datev, payroll-export, holidays, accounts]
status: complete
last_updated: 2026-04-17
last_updated_by: impactj90
---

# Research: DATEV-Zuschläge — Ist-Zustand im Code

**Date**: 2026-04-17T10:12:55+02:00
**Researcher**: impactj90
**Git Commit**: 021aa0aac411f146cedc8283d162fd879697a5c2
**Branch**: staging
**Repository**: terp

## Research Question

Die ursprüngliche Ticket-Formulierung (`thoughts/shared/tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege.md`) geht davon aus, dass ein neues Modell `SurchargeRule` auf Tenant-Ebene nötig ist. Diskussion: Zuschläge sind tagesplanabhängig, `DayPlanBonus` und `calculateSurcharges()` existieren bereits. Was existiert **genau** heute, und wo sind die konkreten Lücken für DATEV-Lohnart-Codes, §3b-Trennung, Kombinierbarkeit und Tenant-Level-Konfiguration?

## Summary

Das Zuschlagssystem ist **funktional komplett verkabelt**: Konfiguration (`DayPlanBonus`) → Berechnung (`calculateSurcharges`) → Persistenz (`DailyAccountValue` mit `source="surcharge"`) → DATEV-Export (zwei parallele Pfade: `generateDatevLodas` hart-codiert, sowie LiquidJS-Template-Engine mit DB-gespeicherten System-Templates). Die Lohnart-Zuordnung läuft über `Account.payrollCode` (mit Fallback auf `Account.code`).

Was **nicht** existiert:
- Kein `SurchargeRule`-Modell auf Tenant-Ebene — Zuschläge werden pro `DayPlan` gepflegt (`DayPlanBonus`).
- Keinerlei §3b-EStG-Logik (steuerfrei/steuerpflichtig), weder als Feld, noch als Berechnung, noch als Export-Trennung.
- Kein Feld `taxFreePercentage` / `isTaxFree` / `taxFreeLimit` / `baseWageRate` auf `DayPlanBonus` oder `Account`.
- Kein Typ/Kategorie-Enum (`NIGHT`/`SUNDAY`/`HOLIDAY`) auf `DayPlanBonus` — Typ wird ausschließlich durch `timeFrom`/`timeTo` und `appliesOnHoliday` ausgedrückt.
- Kein `validFrom`/`validTo` auf `DayPlanBonus` (Gültigkeitszeitraum).
- Kein `stackingMode`/`priority` auf `DayPlanBonus` — mehrere Bonusse akkumulieren unabhängig, keine Priorisierungs- oder Highest-Wins-Logik.
- Keine Update-Operation auf `DayPlanBonus` (nur create + delete, d. h. UI und tRPC kennen keinen `updateBonus`).
- Keine Export-Trennung steuerfrei/steuerpflichtig — im DATEV-Export landen Zuschläge in **einer** Summen-Zeile pro `(employee, account)` ohne Split.
- Keine DST-Behandlung in der Zuschlagsberechnung (Bookings sind Minuten-seit-Mitternacht; DST wird bei Overnight-Schichten nicht separat behandelt).
- Kein `Bundesland`-Feld auf `Tenant` oder `Employee` — Bundesland wird beim `holidays.generate`-Aufruf als ephemerer Request-Parameter übergeben und nicht persistiert.
- Im Seed gibt es **null** `DayPlanBonus`-Einträge. Drei Bonus-Konten (`NIGHT`, `SAT`, `SUN`) sind im Demo-Seed angelegt, aber ohne `payrollCode`.

Der DATEV-LODAS-Export hat zwei unterschiedliche Code-Pfade, die in Zuschlagsfragen **unterschiedlich weit entwickelt** sind:
1. `payroll-export-service.ts::generateDatevLodas()` — exportiert Account-Werte mit `payrollCode || code` als Lohnart. Aggregation summiert **alle** `DailyAccountValue`-Quellen (inkl. `source="surcharge"`) ohne Source-Filter.
2. LiquidJS-Template-Engine (`export-context-builder.ts` + `export-engine-service.ts`) — der Template-Kontext stellt **keine** Account-Werte oder Zuschlagsdaten bereit; nur sechs vor-aggregierte Werte aus `MonthlyValue` (`targetHours`, `workedHours`, `overtimeHours`, `vacationDays`, `sickDays`, `otherAbsenceDays`).

## Detailed Findings

### 1. DayPlanBonus — Schema, Service, Router, UI

#### Prisma-Modell
`prisma/schema.prisma:2776-2797`

| Feld | Typ | Default | Notiz |
|---|---|---|---|
| `id` | `String @db.Uuid` | `gen_random_uuid()` | PK |
| `dayPlanId` | `String @db.Uuid` | — | FK → `day_plans(id)` CASCADE |
| `accountId` | `String @db.Uuid` | — | FK → `accounts(id)` CASCADE |
| `timeFrom` | `Int` | — | Minuten ab Mitternacht (0–1439) |
| `timeTo` | `Int` | — | Minuten ab Mitternacht (1–1440) |
| `calculationType` | `String @db.VarChar(20)` | — | DB-CHECK: `fixed` / `per_minute` / `percentage` |
| `valueMinutes` | `Int` | — | für `fixed`: flache Minuten; für `percentage`: Prozentsatz (25 = 25%); für `per_minute`: ignoriert |
| `minWorkMinutes` | `Int?` | NULL | Tor: Bonus greift nur wenn `netTime >= minWorkMinutes` |
| `appliesOnHoliday` | `Boolean` | `false` | Wenn `true`: greift nur an Feiertagen; wenn `false`: greift nur an Werktagen |
| `sortOrder` | `Int` | `0` | — |
| `createdAt`/`updatedAt` | `Timestamptz` | — | — |

**Kein `isActive`-Flag**, **kein Typ/Kategorie-Enum**, **keine Gültigkeit** (`validFrom`/`validTo`), **kein `taxFreePercentage`**, **kein DATEV-Lohnart-Feld**. Semantik (Nacht/Sonntag/Feiertag) wird ausschließlich über `timeFrom`/`timeTo` und `appliesOnHoliday` ausgedrückt.

Migration: `supabase/migrations/20260101000018_create_day_plan_bonuses.sql`.

#### Repository
`src/lib/services/day-plans-repository.ts:145-166`

Drei Funktionen: `findBonusById`, `createBonus`, `deleteBonus`. **Keine `updateBonus`**. Bonusse werden beim Laden des DayPlans via `dayPlanDetailInclude` (line 10-13) mitgeladen, im Calculation-Pfad zusätzlich mit `include: { account: true }` (siehe `daily-calc.ts:330-334`).

#### Service
`src/lib/services/day-plans-service.ts`

- `validateBonus(timeFrom, timeTo)` (line 129-135): Einzige Validierung — `timeFrom !== timeTo`. Overnight-Windows (`timeFrom > timeTo`) sind explizit erlaubt.
- `createBonusFn` (line 784-819): Verifiziert Tenant-Zugehörigkeit, ruft `validateBonus`, erzeugt Row mit Defaults `appliesOnHoliday ?? false`, `sortOrder ?? 0`.
- `removeBonus` (line 821-843): Delete-Flow.
- `copy` (line 598-718, Bonus-Clone at line 702-714): Beim DayPlan-Copy werden alle Bonus-Felder verbatim kopiert.
- `BonusNotFoundError` (line 51-56).

#### tRPC-Router
`src/trpc/routers/dayPlans.ts`

- `dayPlans.createBonus` (line 627-656) — Permission: `day_plans.manage`. Input-Schema lines 273-283: `dayPlanId`, `accountId`, `timeFrom`, `timeTo`, `calculationType` als `z.enum(["fixed","per_minute","percentage"])`, `valueMinutes` mit `.min(1)`, optional `minWorkMinutes`, `appliesOnHoliday`, `sortOrder`.
- `dayPlans.deleteBonus` (line 663-674) — Input: `dayPlanId`, `bonusId`.
- **Kein `updateBonus`**. Output-Schema `dayPlanBonusOutputSchema` (line 77-90).

#### Hooks
`src/hooks/use-day-plans.ts`

- `useCreateDayPlanBonus` (line 177-194), `useDeleteDayPlanBonus` (line 199-216) — invalidieren `dayPlans.list`, `dayPlans.getById`, `employees.dayView`.
- **Kein `useUpdateDayPlanBonus`**.

#### UI
Zentraler Punkt: `src/components/day-plans/day-plan-detail-sheet.tsx:322-481`.

Die Bonusverwaltung ist **im Detail-Sheet des DayPlans eingebettet**, nicht als eigene Seite. Kein Update-Flow — nur Create + Delete.

Add-Bonus-Form-Felder (line 359-479):
- Konto (Select aus `useAccounts({ accountType: 'bonus', active: true })`, required)
- Zeit von (TimeInput, Default `1320` = 22:00)
- Zeit bis (TimeInput, Default `360` = 06:00)
- Berechnungsart (Select: `fixed` / `per_minute` / `percentage`, Default `per_minute`)
- Wert (`valueMinutes`, DurationInput)
- Mindestarbeitszeit (`minWorkMinutes`, DurationInput, optional)
- Gilt an Feiertagen (Checkbox, Default `false`)

Keine `sortOrder`-Eingabe (Backend-Default `0`). Submit disabled wenn `accountId` leer.

Einstiegsseite: `src/app/[locale]/(dashboard)/admin/day-plans/page.tsx` (Admin-only).

**Es gibt keine eigenständige Zuschlags-Seite.** Keine Route `/surcharge`, `/zuschlag` oder `/bonus` irgendwo in `src/app/`. Kein Platform-Admin-UI für Zuschläge.

#### Seed
`supabase/seed.sql` enthält **null** `INSERT INTO day_plan_bonuses`-Zeilen. Drei Bonus-Konten werden im Demo-Seed angelegt (`seed.sql:433-441`): `NIGHT` / `SAT` / `SUN`, alle `accountType='bonus'`, alle ohne gesetzten `payrollCode`.

### 2. Account / Konto-Modell

#### Prisma-Modell
`prisma/schema.prisma:1703-1740`

Felder (Auszug):
- `tenantId` nullable — NULL = globales System-Konto (FLEX, OT, VAC, NET, CAP)
- `accountType` VarChar(20) — DB-CHECK: `bonus` / `day` / `month` (Service-Konstante `VALID_ACCOUNT_TYPES` an `account-service.ts:41`)
- `unit` — DB-CHECK: `minutes` / `hours` / `days`
- `displayFormat` — DB-CHECK: `decimal` / `hh_mm`
- `isPayrollRelevant Boolean @default(false)` — flagt ein Konto für den Payroll-Export
- `payrollCode String? @db.VarChar(50)` — optional, VarChar(50); keine Format-Validierung über `.trim()` hinaus
- `bonusFactor Decimal? @db.Decimal(5,2)` — auf Account vorhanden; UI rendert kein editierbares Feld dafür
- `accountGroupId`, `yearCarryover`, `sortOrder`, `isSystem`, `isActive`, `description`

Unique `(tenant_id, code)`. Keine Prisma-Enums — alle String-Checks auf DB-Ebene.

#### payrollCode → DATEV-Lohnart
- Nutzung im Export: `src/lib/services/payroll-export-service.ts:174` — `const lohnart = info.payrollCode || info.code`. Fallback auf `Account.code` wenn `payrollCode` null/leer.
- UI-Placeholder: `messages/de.json:2411` → `"z.B. 1001"` (nummerischer String).
- Validierung: nur `.trim()` in `account-service.ts:147,270`; tRPC schema in `accounts.ts:76` akzeptiert `z.string().optional()` ohne Pattern/Length-Validierung jenseits VarChar(50).

**Keine Unterscheidung steuerfrei/steuerpflichtig** am Account-Modell. Kein Feld `isTaxFree`, `taxFreePercentage`, `taxableCode` o. ä. Die einzigen `taxFree*`-Vorkommen im `src/`-Baum liegen in der Reisekosten-Domäne (Travel Allowance, §3 Nr. 13/16 EStG) und sind unabhängig von Zuschlägen.

#### Seed-Konten
`supabase/migrations/20260101000007_create_accounts.sql:18-21` — drei globale Konten (`FLEX`, `OT`, `VAC`) mit `accountType='balance'` (historisch, vor Umstellung auf `bonus`/`day`/`month`).

`supabase/migrations/20260101000092_seed_net_cap_system_accounts.sql:2-6` — zwei globale System-Konten `NET` / `CAP`, `accountType='day'`.

`supabase/seed.sql:433-441` (Demo-Tenant):
| Code | Name | Typ | Unit | payrollCode |
|---|---|---|---|---|
| `NIGHT` | Night Shift Bonus | `bonus` | `minutes` | — |
| `SAT` | Saturday Bonus | `bonus` | `minutes` | — |
| `SUN` | Sunday/Holiday Bonus | `bonus` | `minutes` | — |
| `ONCALL` | On-Call Duty | `day` | `minutes` | — |
| `TRAVEL` | Travel Time | `day` | `minutes` | — |
| `SICK` | Sick Leave Balance | `month` | `days` | — |

Kein Seed-Konto hat `payrollCode` gesetzt.

#### DailyAccountValue
`prisma/schema.prisma:4591-4620` — kein FK zu `daily_values`. Unique `(employeeId, valueDate, accountId, source)`.

`source`-Konstanten in `src/lib/services/daily-calc.types.ts:62-65`:
- `DAV_SOURCE_NET_TIME = "net_time"`
- `DAV_SOURCE_CAPPED_TIME = "capped_time"`
- `DAV_SOURCE_SURCHARGE = "surcharge"`
- `DAV_SOURCE_ABSENCE_RULE = "absence_rule"`

Repository-Filter-Typ `daily-account-values-repository.ts:13`: `source?: "net_time" | "capped_time" | "surcharge"` (die Union umfasst `"absence_rule"` nicht als Filter-Option).

### 3. calculateSurcharges() — Berechnungslogik

#### Pure Berechnung
`src/lib/calculation/surcharges.ts:31-95`

Signatur:
```ts
function calculateSurcharges(
  workPeriods: TimePeriod[],
  configs: SurchargeConfig[],
  isHoliday: boolean,
  holidayCategory: number,
  netWorkTime: number
): SurchargeCalculationResult
```

Ablauf pro `SurchargeConfig`:
1. `surchargeApplies(config, isHoliday, holidayCategory)` (line 202-222):
   - Feiertag: skip wenn `!config.appliesOnHoliday`. Wenn `config.holidayCategories.length > 0`: zusätzlich prüfen, ob `holidayCategory` in der Liste.
   - Werktag: skip wenn `!config.appliesOnWorkday`.
2. `minWorkMinutes`-Tor: skip wenn `netWorkTime < config.minWorkMinutes`.
3. Für jedes `TimePeriod` aus `workPeriods`: `calculateOverlap(period.start, period.end, config.timeFrom, config.timeTo)` akkumulieren (Helper aus `breaks.ts:109-121`).
4. Wenn `overlapMinutes === 0`: skip.
5. `calculationType`:
   - `"fixed"` → `bonusMinutes = config.valueMinutes` (unabhängig von Overlap-Menge, solange >0)
   - `"percentage"` → `Math.floor(overlapMinutes * valueMinutes / 100)`
   - `"per_minute"` (Fallthrough-Default) → `overlapMinutes`
6. Resultat: `SurchargeResult { accountId, accountCode, minutes }` in `surcharges[]` + Summierung in `totalMinutes`.

Typen `src/lib/calculation/types.ts:185-215`. `SurchargeConfig` hat **keine** Felder `taxFreePercentage`, `taxableMinutes`, `baseWage` oder §3b-relevant.

#### Overnight-Handling
`splitOvernightSurcharge(config)` — `surcharges.ts:106-126`. Wenn `timeFrom >= timeTo`, wird der Config in zwei gesplittet:
- evening: `{ timeFrom, timeTo: 1440 }`
- morning: `{ timeFrom: 0, timeTo: config.timeTo }`

Header-Kommentar (line 7-9): "Surcharges must not span midnight. They must be entered as two separate windows".

`validateSurchargeConfig` (line 135-152) würde `timeFrom >= timeTo` als Fehler zurückgeben — wird bei DB-driven Flow **nicht** direkt gegen einen gespeicherten Bonus aufgerufen; `validateBonus` im Service verlangt nur `timeFrom !== timeTo`. Der Split am `postSurchargeValues`-Flow übernimmt Overnight-Unterstützung.

#### Konvertierung DayPlanBonus → SurchargeConfig
`src/lib/services/daily-calc.helpers.ts:409-424`

```ts
export function convertBonusesToSurchargeConfigs(bonuses) {
  return bonuses.map((bonus) => ({
    accountId: bonus.accountId,
    accountCode: bonus.account?.code ?? "",
    timeFrom: bonus.timeFrom,
    timeTo: bonus.timeTo,
    appliesOnHoliday: bonus.appliesOnHoliday,
    appliesOnWorkday: !bonus.appliesOnHoliday,
    holidayCategories: [],              // "Not yet supported"
    calculationType: bonus.calculationType || "per_minute",
    valueMinutes: bonus.valueMinutes,
    minWorkMinutes: bonus.minWorkMinutes,
  }))
}
```

`appliesOnWorkday` wird **aus `!appliesOnHoliday` abgeleitet** — ein Bonus kann nicht gleichzeitig Feiertag UND Werktag adressieren. `holidayCategories` ist aus dem DB-Pfad immer leer; das Category-Filter-Feature ist im Typ vorhanden, aber aus `DayPlanBonus` nicht ansprechbar (kein DB-Feld dafür).

#### Persistenz
`src/lib/services/daily-calc.ts:1624-1693` — `postSurchargeValues()`:
1. Löscht alle `DailyAccountValue`-Rows mit `source="surcharge"` für `(employeeId, valueDate)`.
2. Early-exit wenn kein `dayPlan` oder keine Bonusse.
3. Converts + splits (`convertBonusesToSurchargeConfigs` + `splitOvernightSurcharge`).
4. `extractWorkPeriods(calcPairs)` (surcharges.ts:161-181) — filtert `BookingPair` mit `category === "work"` und beidseitig gesetzten `inBooking`/`outBooking`.
5. `calculateSurcharges(workPeriods, configs, isHoliday, holidayCategory, dailyValue.netTime)`.
6. Batch-Upsert in `$transaction` (line 1664-1691) mit `source = DAV_SOURCE_SURCHARGE = "surcharge"`, unique key `(employeeId, valueDate, accountId, source)`.

Wird aus `calculateDay()` (`daily-calc.ts:114-253`) als Schritt 8 aufgerufen (line 232-242).

#### Stacking/Kombinierbarkeit
Mehrere Bonusse akkumulieren **unabhängig**: jeder Config, der gate-tests besteht, erzeugt einen eigenen `SurchargeResult`. Keine Priority, kein Highest-Wins, keine Deduplikation in `calculateSurcharges`.

Wenn **zwei Bonusse denselben `accountId` referenzieren**: beide landen im `SurchargeResult[]`, die Upsert-Schleife in `postSurchargeValues` überschreibt die erste Zeile bei der zweiten (Unique-Key Kollision auf `source="surcharge"`). Keine Summierung in DB. Zwei unterschiedliche `accountId` → zwei DailyAccountValue-Rows, unabhängig.

#### Tageszuordnung bei Nachtschicht
`DayPlan.dayChangeBehavior` (`daily-calc.ts:484-526`, `daily-calc.helpers.ts:253-295`) steuert **vor** der Zuschlagsberechnung, welcher Kalendertag welche Bookings bekommt:
- `"none"` — nur dateistierte Bookings
- `"at_arrival"` — Departure wird in den Current Day gezogen
- `"at_departure"` — Arrival des Vortags wird in Current Day gezogen
- `"auto_complete"` — synthetische Mitternachts-Bookings

Zuschläge werden für den jeweiligen Kalendertag über die aufbereiteten `calcPairs` berechnet. Overnight-Split der Konfiguration (22:00-06:00) wird pro Tag evaluiert.

#### Tests
`src/lib/calculation/__tests__/surcharges.test.ts` — 17 Testfälle:
- `describe("calculateSurcharges")` — 10 Fälle (Night, Holiday, Multiple periods, No work, No overlap, per_minute, fixed, fixed-no-overlap, percentage, minWorkMinutes below/above).
- `describe("validateSurchargeConfig")` — 8 Fälle (Bounds, Order, Valid).
- `describe("splitOvernightSurcharge")` — 3 Fälle (Split, Already valid, Field preservation).
- `describe("extractWorkPeriods")` — 2 Fälle.
- `describe("getHolidayCategoryFromFlag")` — 2 Fälle.

`src/lib/services/__tests__/daily-calc.helpers.test.ts:687-739` — Tests für `convertBonusesToSurchargeConfigs`.

### 4. DATEV-LODAS-Export — Zuschläge im Export

**Es gibt zwei parallele Export-Systeme**, die in unterschiedlichen Reifegraden Zuschlagsdaten handhaben.

#### Pfad A: `generateDatevLodas()` (hart-codiert)
`src/lib/services/payroll-export-service.ts:135-190`

- Signatur: `generateDatevLodas(lines: ExportLine[], accountInfoMap: Record<string, { code; payrollCode }>)` → string (semikolon-delimited CSV-Text).
- Modul-private Funktion; wird nur aus `generate()` line 452 mit `input.exportType === "datev"` aufgerufen.
- Output-Header (line 139): `Personalnummer;Nachname;Vorname;Lohnart;Stunden;Tage;Betrag;Kostenstelle`.
- Sechs hart-codierte Base-Lohnarten (line 143-150):
  - `1000` Sollstunden (targetHours)
  - `1001` Arbeitsstunden (workedHours)
  - `1002` Überstunden (overtimeHours)
  - `2000` Urlaub (vacationDays)
  - `2001` Krankheit (sickDays)
  - `2002` Sonstige Abwesenheit (otherAbsenceDays)
- Account-basierte Zeilen (line 171-186): für jedes Konto in `accountInfoMap` mit `line.accountValues[info.code] > 0` wird eine Zeile geschrieben. **Lohnart = `info.payrollCode || info.code`** (line 174).
- Spalte `Betrag` ist immer leer (`""`).

#### Aggregation
`payroll-export-repository.ts:189-210` — `aggregateDailyAccountValues()`:
```
prisma.dailyAccountValue.groupBy({
  by: ['employeeId', 'accountId'],
  where: { tenantId, employeeId, accountId, valueDate: { gte, lte } },
  _sum: { valueMinutes: true }
})
```

**Kein `source`-Filter.** Rows aller Quellen (`net_time`, `capped_time`, `surcharge`, `absence_rule`) werden für jedes `(employee, account)` summiert. Konvertierung Minuten → Stunden durch `totalMinutes / 60` in `resolveAccountValues()` (line 86).

#### Keine Trennung steuerfrei/steuerpflichtig
Grep über `payroll-export-service.ts`, `payroll-export-repository.ts`, `export-context-builder.ts`, `export-engine-service.ts`: **null** Treffer für `taxFree`, `steuerfrei`, `taxable`, `steuerpflichtig`, `§3b`.

#### Pfad B: LiquidJS-Template-Engine
`src/lib/services/export-context-builder.ts` + `src/lib/services/export-engine-service.ts` + `src/lib/services/liquid-engine.ts`

**Keine `.liquid`-Dateien auf dem Dateisystem.** Templates sind DB-gespeichert in:
- `export_templates` (tenant-scoped, editierbar) — Prisma-Modell `ExportTemplate` (`schema.prisma:3749`)
- `system_export_templates` (global, read-only) — Prisma-Modell `SystemExportTemplate` (`schema.prisma:3914`)

Engine: `createSandboxedEngine()` in `liquid-engine.ts:13-24` — `ownPropertyOnly: true`, `strictFilters: true`, `strictVariables: false`.

Custom-Filter (line 26-98): `datev_date`, `datev_decimal`, `datev_string`, `pad_left`, `pad_right`, `mask_iban`.

Seed-Templates in `supabase/migrations/20260418100000_create_phase3_payroll_tables.sql`:
- "DATEV LODAS — Bewegungsdaten" (line 71-113) — produziert `[Allgemein]` + `[Bewegungsdaten]`-Sektionen. Iteriert über `{% for wage in payrollWages %}` und liest `employee.monthlyValues[wage.terpSource]`.
- "DATEV LODAS — Stamm + Bewegungsdaten" (line 115-163) — inkl. `[Stammdaten]` und `[Satzbeschreibung]`.

#### Template-Kontext (`buildExportContext`)
`src/lib/services/export-context-builder.ts:335-658`

Verfügbare Top-Level-Objekte: `exportInterface`, `period`, `tenant`, `template`, `payrollWages[]`, `employees[]`.

`employees[i].monthlyValues` stellt (line 117-124) bereit:
- `targetHours`, `workedHours`, `overtimeHours`, `vacationDays`, `sickDays`, `otherAbsenceDays`

`payrollWages[]` liest aus dem neuen `TenantPayrollWage`-Modell (Lohnart-Mapping, siehe Handbuch-Abschnitt 20f.4). Felder: `code`, `name`, `terpSource`, `category`.

**Kein `accountValues`-Property im Kontext.** **Keine Zuschlagsminuten-Breakdown.** **Keine `source="surcharge"`-Aggregation.** Das Template hat also aktuell keinen direkten Zugriff auf DailyAccountValue-Summen pro Konto/Lohnart.

#### tRPC-Router
- `src/trpc/routers/payrollExports.ts`:
  - `generate` (line 164-196) — `exportType: "standard" | "datev" | "sage" | "custom"`, `format: csv|xlsx|xml|json`
  - `download` (line 239-259), `preview` (line 205-232), `list`, `delete`
- `src/trpc/routers/exportTemplates.ts`:
  - `runExport` (line 280-321), `testExport` (line 327-366), `preview` (line 233-274)

### 5. §3b EStG — Steuerfreie Zuschläge

**Existiert nicht im Code.** Exhaustive grep:
- `§3b` → nur in Ticket-Dokument `pflicht-02-datev-zuschlaege.md:18,52`.
- `EStG` → nur in Ticket-Dokument.
- `taxFree`, `steuerfrei`, `Grundlohn`, `baseWage`, `basicWage` → keine Treffer in Zuschlags-/Calc-/Export-Pfad.
- Einzige `taxFree*`-Vorkommen: Reisekosten-Domäne (Travel Allowance, §3 Nr. 13/16 EStG) in `src/lib/calculation/travel-allowance.ts`, `travel-allowance-preview-service.ts`, `travelAllowancePreview.ts`, `localTravelRules.ts`. Unabhängig von Lohnzuschlägen.

**Felder fehlen:**
- `DayPlanBonus` hat kein `taxFreePercentage`/`isTaxFree`/`taxFreeLimit`.
- `Account` hat keine Tax-Kennzeichnung.
- `SurchargeConfig` (Calc-Typ) hat kein Tax-Feld.

**Grundlohn-Berechnung:** Nicht vorhanden als Surcharge-Input.
- `Employee.grossSalary`, `Employee.hourlyRate`, `Employee.paymentType` existieren (`schema.prisma:1934-1936`), historisch gespiegelt in `EmployeeSalaryHistory` (`schema.prisma:3939-3960`).
- Werden von `employees-service.ts` gepflegt und von `export-context-builder.ts:536` ausschließlich für Template-Rendering exponiert.
- **Keine Code-Route füttert `Employee.hourlyRate` in die Zuschlagsberechnung.** Die Calc-Engine bekommt nur Minuten, nie Euro.

### 6. Feiertags-Erkennung

#### Prisma-Modell
`prisma/schema.prisma:1641-1661` — `Holiday`:
- `tenantId` (Cascade delete)
- `holidayDate` DB-`Date`
- `name` VarChar(255)
- `holidayCategory` Integer (1–3, DB-CHECK) — 1 = full, 2 = half (per Konvention)
- `appliesToAll` Boolean Default true
- `departmentId` UUID nullable (kein DB-FK-Constraint; Prisma-Relation absichtlich weggelassen)

Unique `(tenant_id, holiday_date)`.

#### Generierung
Kein externer npm-Library-Aufruf. Interner TypeScript-Port:
- `src/lib/services/holiday-calendar.ts` — exportiert `GermanState` Union, `GERMAN_STATES` (alle 16), `generateHolidays(year, state)` (line 78-182), `easterSunday(year)` (Gauss/Meeus), `repentanceDay(year)` (line 216-224).

Hart-codiert: 9 bundesweite Feiertage + Bundesland-spezifische Conditional Blocks (z. B. line 118: `BW|BY|ST` → Heilige Drei Könige; line 170: `SN` → Buß- und Bettag).

#### Service
`src/lib/services/holiday-service.ts`:
- `list`, `getById`, `create`, `update`, `remove` — Standard-CRUD mit Audit-Log.
- `generate(prisma, tenantId, { year, state, skipExisting? })` — Line 311-312: alle generierten Rows bekommen `holidayCategory: 1`, `appliesToAll: true`.
- `copy(...)` — kopiert von Jahr zu Jahr mit optionalen Per-Tag-Category-Overrides.

Repository: `src/lib/services/holiday-repository.ts` — `findMany`, `findByDate`, `findByYearRange`, etc.

#### Bundesland-Speicherung
**Kein `bundesland`/`state`/`federalState`-Feld** auf `Tenant` oder `Employee`. Beim `holidays.generate`-Aufruf wird `state` als Request-Parameter übergeben (`src/trpc/routers/holidays.ts:64-66`) und an `parseState` durchgereicht. Bundesland ist ephemeral, keine Persistenz.

#### Verwendung in der Zuschlagsberechnung
Zwei Lade-Pfade:
- **Batch**: `loadTenantCalcCache` in `daily-calc.context.ts:63-99` — ein `findMany` über den ganzen Zeitraum, `Map<"YYYY-MM-DD", { isHoliday, holidayCategory }>` im `TenantCalcCache`.
- **Einzel-Tag**: `DailyCalcService.checkHoliday` in `daily-calc.ts:345-361` — `findFirst`.

Ablauf in `calculateDay`:
1. Line 123: `checkHoliday(...)` → `{ isHoliday, holidayCategory }`
2. Line 148-173: Wenn `isHoliday && keine Bookings` → `handleHolidayCredit`, liest `DayPlan.holidayCreditCat1/Cat2/Cat3` (`schema.prisma:2676-2679`).
3. Line 188-199: Wenn Bookings an Feiertag → `calculateWithBookings` + Warning `"WORKED_ON_HOLIDAY"`.
4. Line 232-241: `postSurchargeValues` bekommt `isHoliday` + `holidayCategory` → `calculateSurcharges` → `surchargeApplies` (siehe Abschnitt 3).

#### AbsenceType.holidayCode
`schema.prisma:2590` — `holidayCode String? @db.VarChar(10)` auf `AbsenceType`. Wird in `absence-type-service.ts:100,148,255` nur als CRUD-Feld verwaltet. **Kein Code-Pfad in `daily-calc.ts` oder `surcharges.ts` liest das Feld** — es existiert als Datenfeld ohne Calc-Wirkung.

### 7. UI — Zuschlagskonfiguration

**Dedizierte Tenant-Level-Konfigurationsseite: existiert nicht.** Kein Route `/surcharge`, `/zuschlag`, `/bonus`. Kein Platform-Admin-UI. Keine Preview/Simulations-UI für Zuschlagsberechnung.

Einzige Konfigurationsstelle:
- `src/app/[locale]/(dashboard)/admin/day-plans/page.tsx` → öffnet `DayPlanDetailSheet`.
- `src/components/day-plans/day-plan-detail-sheet.tsx:322-481` — Add-Bonus-Inline-Form + Liste bestehender Bonusse mit Delete-Button. **Kein Edit-Modus**.

Bonus-Konto-Auswahl wird durch `useAccounts({ accountType: 'bonus', active: true })` befüllt; Accounts werden in `src/app/[locale]/(dashboard)/admin/accounts/page.tsx` via `src/components/accounts/account-form-sheet.tsx` gepflegt. `bonusFactor` ist auf dem Account-Typ vorhanden, aber **nicht als editierbares Formularfeld** exponiert.

### 8. Handbuch — Zuschlagsdokumentation

Einzige Handbuch-Datei: `docs/TERP_HANDBUCH.md` (Titel sagt V2, kein zweites Datei-Pendant). Dazu kurze Admin-Handbücher in `docs/benutzerhandbuecher/`.

#### Relevante Abschnitte
- **§ 4 Stammdaten / Tagespläne → "Zuschläge (Detailansicht)"** `docs/TERP_HANDBUCH.md:1058-1103` — Feld-Tabelle, Berechnungsarten, Overnight-Hinweis.
- **Praxisbeispiel "Nachtzuschlag End-to-End"** `docs/TERP_HANDBUCH.md:1086-1101` — kompletter Flow: Konto `NZ` mit Lohncode `1015` anlegen → Exportschnittstelle zuordnen → Zuschlag auf Tagesplan konfigurieren.
- **Beispielkonfigurationen Früh/Spät/Nachtschicht** `docs/TERP_HANDBUCH.md:1105-1175` — ohne Surcharge-Konfiguration, nur Schicht-Tagespläne.
- **§ 4.12 Konten** `docs/TERP_HANDBUCH.md:1981-2084` — Bonus-Kontotyp, Lohnrelevant-Flag, Lohncode-Feld. Praxisbeispiel `NZ` (Lohncode `1015`) + `SZ` (Lohncode `1020`).
- **§ 8.3.1 Monatsabschluss und DATEV-Export** `docs/TERP_HANDBUCH.md:3397-3487` — DATEV LODAS / Lohn und Gehalt Unterschied (line 3487).
- **§ 8.6 Exportschnittstellen** `docs/TERP_HANDBUCH.md:3559-3617` — Column-Mapping, Praxisbeispiel mit Nacht- und Feiertagszuschlag.
- **§ 20f.4 Lohnart-Mapping** `docs/TERP_HANDBUCH.md:9479-9531` — Seed-Tabelle mit 20 Lohnarten. Drei surcharge-relevant:
  | Code | Name | terpSource | Kategorie |
  |---|---|---|---|
  | 1003 | Nachtarbeit | `nightHours` | time |
  | 1004 | Sonntagsarbeit | `sundayHours` | time |
  | 1005 | Feiertagsarbeit | `holidayHours` | time |
- **§ 20f.9 DATEV-Onboarding-Checkliste** `docs/TERP_HANDBUCH.md:9690-9782`.
- **`docs/benutzerhandbuecher/berechnungsregeln.md:84-119`** — ältere Draft-Dokumentation zu "Berechnungsregeln" (Typ: Nachtzuschlag/Sonntagszuschlag/Feiertagszuschlag) mit 15%/50%/100% als typische Werte. UI-Pfad `/admin/calculation-rules` — im aktuellen Repo unter diesem Namen nicht als Route auffindbar; wirkt wie eine frühere Konzept-Version.
- **`docs/benutzerhandbuecher/konten.md:83-86`** — typische Konten inkl. `300 Nachtarbeit` und `400 Sonntagsarbeit`.

#### Was das Handbuch NICHT dokumentiert
- `§3b` / `EStG` / "steuerfrei" im Zuschlagskontext — kommt im ganzen Handbuch nicht vor.
- `DayPlanBonus` als Begriff.
- Sonntagszuschlag-Konfiguration als Tagesplan-Surcharge (kein Praxisbeispiel, nur Nachtzuschlag wird end-to-end dokumentiert).
- Feiertagszuschlag-Konfiguration (nur als Account-Beispiel).
- Wie die Lohnart-Mapping-Terp-Quellen `nightHours` / `sundayHours` / `holidayHours` aktuell befüllt werden. Im Code-Pfad existieren diese Attribute weder auf `MonthlyValue` noch auf dem Export-Kontext (`export-context-builder.ts:117-124` listet nur `targetHours`, `workedHours`, `overtimeHours`, `vacationDays`, `sickDays`, `otherAbsenceDays`).

### 9. Lücken-Analyse (Ist-Zustand vs. Ticket-Anforderungen)

Beobachtete Lücken gegenüber den Akzeptanzkriterien in `pflicht-02-datev-zuschlaege.md`:

#### Am `DayPlanBonus`-Modell fehlen
- **Kein `datevWageTypeCode`** — Lohnart-Code läuft indirekt über `bonus.accountId → Account.payrollCode`. Ein Bonus kann keine eigene Lohnart erzwingen, ohne das Zielkonto zu wechseln.
- **Kein `taxFreePercentage` / `isTaxFree`** — keine §3b-Trennung möglich.
- **Kein `type`-Enum** (NIGHT/SUNDAY/HOLIDAY/OVERTIME/CUSTOM) — Typ wird per Zeitfenster und `appliesOnHoliday` implizit ausgedrückt; keine strukturierte Abfrage möglich.
- **Kein `isActive`-Flag**, **kein `validFrom`/`validTo`** — rückwirkende Berechnung bei Tarifwechsel nicht unterstützt.
- **Kein `stackingMode`/`priority`** — mehrere gleichzeitig zutreffende Bonusse akkumulieren implizit alle; keine Highest-Wins-Alternative.
- **Keine tenant-weite Pflege** — jede Zuschlagsänderung muss pro DayPlan einzeln angelegt und gelöscht werden (kein Update-Operation existiert, nur Create/Delete).
- **Kein UI-Update** auf Bonusse (keine `updateBonus`-Funktion, kein Hook, kein tRPC-Procedure).

#### Am `Account`-Modell fehlen
- **Keine Tax-Klassifikation** — keine Unterscheidung zwischen steuerfreiem und steuerpflichtigem Zuschlagsteil am Konto.
- **Keine Typisierung `"night" | "sunday" | "holiday"`** — Bonus-Konten haben nur den generischen Typ `"bonus"`. Drei Bonus-Accounts (`NIGHT`, `SAT`, `SUN`) existieren im Seed per Konvention, aber ohne Schema-Klassifikation und ohne `payrollCode`.
- **Kein strukturierter Zusammenhang DATEV-Lohnart ↔ Tax-Klasse** — `payrollCode` ist ein freier VarChar(50) ohne Referenz auf eine Lohnart-Registry.

#### In `calculateSurcharges()` / DailyAccountValue fehlt
- **Keine §3b-Split-Logik** — pro Konto wird exakt eine Minutenzahl aggregiert; `source`-Feld unterscheidet nur `net_time`/`capped_time`/`surcharge`/`absence_rule`, nicht steuerfrei/steuerpflichtig.
- **Kein Grundlohn-Input** — `calculateSurcharges` bekommt nur Minuten, nicht `hourlyRate`. §3b-Grenzberechnung (25% von 50 EUR Grundlohn) hat keinen Eingangswert.
- **Keine Highest-Wins-/Priority-Logik** — alle passenden Configs akkumulieren unabhängig.
- **Tageszuordnung** bei Overnight ist korrekt (via `dayChangeBehavior` und `splitOvernightSurcharge`), aber **ohne DST-Behandlung** (Minutenarithmetik pur; 23h/25h-Nachtschichten bei Sommerzeitumstellung nicht speziell behandelt).

#### Im DATEV-Export fehlen
- **`generateDatevLodas` hat keine Zuschlags-Trennung** — alle `DailyAccountValue`-Quellen (inkl. `surcharge`) werden in `aggregateDailyAccountValues` ohne `source`-Filter summiert. Der Export liefert pro `(employee, account)` eine Summe als Stunden mit `Betrag=""`.
- **Kein steuerfrei/steuerpflichtig-Output** — eine einzige Zeile pro Konto, keine zweite Zeile für den steuerpflichtigen Teil.
- **Template-Engine-Kontext stellt keine Zuschlagsdaten bereit** — `export-context-builder.ts:117-124` exponiert nur sechs vor-aggregierte MonthlyValue-Felder (`targetHours`, `workedHours`, `overtimeHours`, `vacationDays`, `sickDays`, `otherAbsenceDays`). Konten-Werte aus `DailyAccountValue` sind im Template-Kontext nicht verfügbar.
- **Handbuch-Mapping 1003 Nachtarbeit / 1004 Sonntagsarbeit / 1005 Feiertagsarbeit** referenziert `terpSource`-Werte `nightHours`/`sundayHours`/`holidayHours`, die im Code weder auf `MonthlyValue` noch im Template-Kontext existieren (nur vor-aggregierte `targetHours`/`workedHours`/`overtimeHours` + Tages-Felder sind da).

#### Struktureller Befund
- Der komplette Zuschlags-Flow ist End-to-End existent: Konfig (`DayPlanBonus`) → Berechnung (`calculateSurcharges`) → Persistenz (`DailyAccountValue`) → Export (`generateDatevLodas` mit Account.payrollCode-Mapping).
- **Ein Tenant-Level-Modell existiert nicht.** Die Tabelle `surcharge_rules` oder vergleichbar ist nicht im Schema vorhanden.
- Die DB-Logik kennt keinen Override-Mechanismus DayPlan-spezifisch vs. Tenant-weit.

## Code References

### Prisma-Schema
- `prisma/schema.prisma:1703-1740` — `Account` (mit `payrollCode`, `accountType`, `bonusFactor`, `isPayrollRelevant`)
- `prisma/schema.prisma:1670-1689` — `AccountGroup`
- `prisma/schema.prisma:1641-1661` — `Holiday` (tenant-scoped)
- `prisma/schema.prisma:2631-2736` — `DayPlan` (inkl. `holidayCreditCat1/Cat2/Cat3`, `dayChangeBehavior`)
- `prisma/schema.prisma:2776-2797` — `DayPlanBonus`
- `prisma/schema.prisma:2590` — `AbsenceType.holidayCode`
- `prisma/schema.prisma:3749` — `ExportTemplate`
- `prisma/schema.prisma:3914` — `SystemExportTemplate`
- `prisma/schema.prisma:4591-4620` — `DailyAccountValue` (unique `(employeeId, valueDate, accountId, source)`)
- `prisma/schema.prisma:1934-1936`, `3939-3960` — `Employee.grossSalary/hourlyRate`, `EmployeeSalaryHistory`

### Services
- `src/lib/services/day-plans-service.ts:129-135,784-819,821-843` — `validateBonus`, `createBonusFn`, `removeBonus`
- `src/lib/services/day-plans-repository.ts:10-13,145-166` — `dayPlanDetailInclude`, Bonus-CRUD
- `src/lib/services/account-service.ts:41,47,60,72,147,164,270,302,330` — Account-CRUD + `payrollCode.trim()`
- `src/lib/services/account-repository.ts:115` — Raw-SQL `findDayPlanUsage`
- `src/lib/services/holiday-service.ts:311-312` — `generate` (alle neuen Rows `category=1`)
- `src/lib/services/holiday-calendar.ts:78-182,216-224` — Bundesländer-spezifische Generierung, Buß- und Bettag
- `src/lib/services/holiday-repository.ts` — CRUD + Range-Queries
- `src/lib/services/daily-calc.ts:114-253` — `calculateDay()` Orchestration
- `src/lib/services/daily-calc.ts:232-241,1624-1693` — `postSurchargeValues` (löscht + schreibt `source="surcharge"`)
- `src/lib/services/daily-calc.ts:327-338` — Prisma-Include mit `bonuses.include.account`
- `src/lib/services/daily-calc.ts:345-361` — `checkHoliday` (Einzel-Tag-Pfad)
- `src/lib/services/daily-calc.ts:484-526` — `loadBookingsForCalculation` mit `dayChangeBehavior`
- `src/lib/services/daily-calc.ts:768` — `handleHolidayCredit` → `getHolidayCredit`
- `src/lib/services/daily-calc.context.ts:63-99` — `loadTenantCalcCache` (Batch-Feiertage)
- `src/lib/services/daily-calc.helpers.ts:246-295` — `applyDayChangeBehavior` / `applyAutoCompleteDayChange`
- `src/lib/services/daily-calc.helpers.ts:409-424` — `convertBonusesToSurchargeConfigs`
- `src/lib/services/daily-calc.types.ts:62-65` — `DAV_SOURCE_*` Konstanten
- `src/lib/services/daily-calc.types.ts:95-100` — `DayPlanWithDetails` Typ
- `src/lib/services/daily-account-values-repository.ts:13` — `source`-Filter-Typ

### Calculation Engine
- `src/lib/calculation/surcharges.ts:7-9` — Header-Kommentar zu Overnight-Regel
- `src/lib/calculation/surcharges.ts:31-95` — `calculateSurcharges`
- `src/lib/calculation/surcharges.ts:106-126` — `splitOvernightSurcharge`
- `src/lib/calculation/surcharges.ts:135-152` — `validateSurchargeConfig`
- `src/lib/calculation/surcharges.ts:161-181` — `extractWorkPeriods`
- `src/lib/calculation/surcharges.ts:202-222` — `surchargeApplies`
- `src/lib/calculation/breaks.ts:109-121` — `calculateOverlap`
- `src/lib/calculation/types.ts:115-120` — `BookingPair`
- `src/lib/calculation/types.ts:185-215` — `TimePeriod`, `SurchargeConfig`, `SurchargeResult`, `SurchargeCalculationResult`
- `src/lib/calculation/index.ts:52-66` — Public re-exports

### Payroll-Export
- `src/lib/services/payroll-export-service.ts:53-76` — `buildAccountValueMap`
- `src/lib/services/payroll-export-service.ts:78-86` — `resolveAccountValues` (Minuten→Stunden)
- `src/lib/services/payroll-export-service.ts:135-190` — `generateDatevLodas`
- `src/lib/services/payroll-export-service.ts:174` — `const lohnart = info.payrollCode || info.code`
- `src/lib/services/payroll-export-service.ts:305-452` — `generate()` Orchestrator
- `src/lib/services/payroll-export-repository.ts:178-187` — `findAccountsByIds` (selektiert `payrollCode`)
- `src/lib/services/payroll-export-repository.ts:189-210` — `aggregateDailyAccountValues` (kein `source`-Filter)
- `src/lib/services/export-context-builder.ts:98-124` — `ExportContextEmployee` mit `monthlyValues` (sechs Felder)
- `src/lib/services/export-context-builder.ts:235` — `ExportContext` Interface
- `src/lib/services/export-context-builder.ts:335-658` — `buildExportContext`
- `src/lib/services/export-engine-service.ts:90,200-228,260,269` — `renderTemplate`, `parseMultiFileBody`, `generateExport`
- `src/lib/services/liquid-engine.ts:13-98` — Engine + Custom-Filter

### tRPC-Router
- `src/trpc/routers/dayPlans.ts:57` — `CALCULATION_TYPES` Zod-Enum
- `src/trpc/routers/dayPlans.ts:77-90` — `dayPlanBonusOutputSchema`
- `src/trpc/routers/dayPlans.ts:273-283` — `createBonusInputSchema`
- `src/trpc/routers/dayPlans.ts:285-288` — `deleteBonusInputSchema`
- `src/trpc/routers/dayPlans.ts:627-656,663-674` — Bonus-Procedures
- `src/trpc/routers/accounts.ts:69,76,135` — Account-Router
- `src/trpc/routers/holidays.ts:64-66` — `generate` mit `state`-Parameter
- `src/trpc/routers/payrollExports.ts:101-282` — Export-Procedures
- `src/trpc/routers/exportTemplates.ts:233-366` — Template-Engine-Procedures

### Hooks
- `src/hooks/use-day-plans.ts:177-216` — `useCreateDayPlanBonus`, `useDeleteDayPlanBonus`
- `src/hooks/index.ts` — Re-exports

### UI
- `src/app/[locale]/(dashboard)/admin/day-plans/page.tsx` — DayPlans-Admin
- `src/app/[locale]/(dashboard)/admin/accounts/page.tsx` — Accounts-Admin
- `src/components/day-plans/day-plan-detail-sheet.tsx:83,322-481` — Bonus-UI (Add + Delete, kein Update)
- `src/components/day-plans/day-plan-form-sheet.tsx` — DayPlan-Form (keine Bonus-Felder)
- `src/components/accounts/account-form-sheet.tsx:314-317` — `payrollCode`-Input
- `src/components/export-interfaces/export-interface-detail-sheet.tsx:159`

### Tests
- `src/lib/calculation/__tests__/surcharges.test.ts` — 17 Testfälle
- `src/lib/services/__tests__/daily-calc.helpers.test.ts:687-739` — `convertBonusesToSurchargeConfigs`-Tests
- `src/trpc/routers/__tests__/payrollExports-router.test.ts:441-465` — `payrollCode`-Fallback-Test

### Migrationen
- `supabase/migrations/20260101000007_create_accounts.sql:18-21` — System-Konten `FLEX`/`OT`/`VAC`
- `supabase/migrations/20260101000018_create_day_plan_bonuses.sql` — Bonus-Tabelle
- `supabase/migrations/20260101000092_seed_net_cap_system_accounts.sql:2-6` — `NET`/`CAP`
- `supabase/migrations/20260418100000_create_phase3_payroll_tables.sql:71-163` — DATEV LODAS System-Templates (Body als SQL-$-quoted)
- `supabase/seed.sql:433-441` — Demo-Tenant Bonus-Konten

### Handbuch
- `docs/TERP_HANDBUCH.md:1058-1103` — Zuschläge (Detailansicht)
- `docs/TERP_HANDBUCH.md:1086-1101` — Praxisbeispiel Nachtzuschlag
- `docs/TERP_HANDBUCH.md:1981-2084` — § 4.12 Konten
- `docs/TERP_HANDBUCH.md:2051-2063` — Praxisbeispiel NZ/SZ
- `docs/TERP_HANDBUCH.md:3397-3487` — Monatsabschluss + DATEV-Export
- `docs/TERP_HANDBUCH.md:3559-3617` — § 8.6 Exportschnittstellen
- `docs/TERP_HANDBUCH.md:9479-9531` — § 20f.4 Lohnart-Mapping
- `docs/TERP_HANDBUCH.md:9690-9782` — § 20f.9 DATEV-Onboarding
- `docs/benutzerhandbuecher/berechnungsregeln.md:84-119` — ältere Berechnungsregeln-Draft
- `docs/benutzerhandbuecher/konten.md:83-86` — typische Konten

## Architecture Documentation

### Datenfluss Ende-zu-Ende (aktueller Stand)

1. **Konfiguration**: Admin öffnet DayPlan-Detail-Sheet → `DayPlanBonus`-Zeile wird via `dayPlans.createBonus` angelegt. Jede Zeile referenziert ein Bonus-Konto per `accountId`.
2. **Trigger**: `DailyCalcService.calculateDay(tenantId, employeeId, date)` wird ausgelöst (durch Booking-Änderung oder Nacht-Batch).
3. **Holiday-Lookup**: `checkHoliday` oder batch-`TenantCalcCache` → `{ isHoliday, holidayCategory }`.
4. **Core-Calc**: `calculateWithBookings` erzeugt `calcPairs: BookingPair[]`; aus `DayPlan` werden Bookings nach `dayChangeBehavior` zugeordnet.
5. **Net/Capped**: `postNetValue` / `postCappedValue` schreiben `DailyAccountValue` mit `source="net_time"` / `"capped_time"`.
6. **Surcharge**: `postSurchargeValues` → Load+Convert+Split Bonusses → `calculateSurcharges` → pro Overlap-Treffer eine Zeile `DailyAccountValue` mit `source="surcharge"`, unique-keyed auf `(employee, date, account, source)`.
7. **Monatsende**: `MonthlyValue` wird vor-aggregiert (ohne Zuschlags-Breakdown).
8. **Export**:
   - Pfad A (`generateDatevLodas`): `aggregateDailyAccountValues` summiert alle `source`-Werte pro `(employee, account)`. Für jedes Konto mit Wert wird eine Zeile geschrieben mit `Lohnart = payrollCode || code`, `Stunden = minutes/60`, `Betrag = ""`.
   - Pfad B (LiquidJS-Template): `buildExportContext` liest `MonthlyValue` + Employee-Meta; Template iteriert über `payrollWages[]` und `monthlyValues[wage.terpSource]`. Konten-Summen sind im Kontext nicht verfügbar.

### Typisierung der Zuschlagsinformation
- **Keine Prisma-Enums** für Account/Bonus. Typ ist (a) `accountType` String mit DB-CHECK (`bonus`/`day`/`month`), (b) Zeitfenster-Konvention, (c) `appliesOnHoliday`-Bool.
- **`calculationType`** auf `DayPlanBonus` ist VarChar(20) mit drei zulässigen Werten, durch Zod/tRPC-Enum validiert. Default im Code: `"per_minute"` bei leerem String.
- **`source`** auf `DailyAccountValue` ist VarChar(20) mit vier Konstanten.

### Berechnungs-Semantik
- **Overlap-Matching** ist rein arithmetisch (`Math.max(start, window_start)`, `Math.min(end, window_end)`) — kein Zeitzonen-Handling.
- **Overnight-Splitting** beim Converter: ein Bonus mit `timeFrom=1320, timeTo=360` wird in zwei Configs `(1320,1440)` + `(0,360)` für denselben Kalendertag aufgeteilt.
- **Tageszuordnung** wird vor der Zuschlagsrechnung durch `dayChangeBehavior` auf `DayPlan` gesteuert.
- **Minimum-Gate** (`minWorkMinutes`) greift **nach** dem Holiday/Workday-Gate und **vor** der Overlap-Schleife.

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege.md` — Originalticket (Kontext dieser Recherche). Enthält Akzeptanzkriterien, Test-Anforderungen, Design-Entscheidung Option A/B (DayPlanBonus + SurchargeRule vs. Ersatz). Nennt Pro-Di-Gespräch vom 15.04.2026.
- `thoughts/shared/research/2026-04-08-export-script-konzept-lohnschnittstelle.md:192-193` — dokumentiert: "Jedes Konto hat ein optionales `payrollCode`" und "Im DATEV-Export: `const lohnart = info.payrollCode || info.code`".
- `thoughts/shared/research/2026-01-18-TICKET-052-create-bookings-migration.md:247` — Begründung für Minuten-ab-Mitternacht-Design: "Avoids timezone/DST issues within a day".

## Related Research

- `thoughts/shared/research/2026-04-08-export-script-konzept-lohnschnittstelle.md` — allgemeine Lohnschnittstellen-Recherche
- Weitere `TICKET-05x`/`NOK-12x`-Recherchen im `thoughts/shared/research/`-Ordner zur Booking-/Calculation-Engine

## Open Questions

Keine offenen Recherchefragen mehr — Code-Pfade sind vollständig lokalisiert. Die verbleibenden Fragen liegen auf Produktebene und sind im Ticket `pflicht-02-datev-zuschlaege.md:72-88` dokumentiert (Zuschlagsliste, DATEV-Nummern vom Steuerberater, Kombinierbarkeit, Überstundenstaffelung, Tarifvertrag).
