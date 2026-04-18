---
date: 2026-04-17T14:24:31+02:00
researcher: tolga
git_commit: c9ed7c24153ff78928581bbf5600ae0b44d76dac
branch: staging
repository: terp
topic: "Konfigurierbare Überstunden-Auszahlung — Ist-Zustand im Code"
tags: [research, codebase, overtime, flextime, monatsabschluss, datev, payroll, tariff, account-system, prodi-prelaunch]
status: complete
last_updated: 2026-04-17
last_updated_by: tolga
---

# Research: Konfigurierbare Überstunden-Auszahlung — Ist-Zustand im Code

**Date**: 2026-04-17T14:24:31+02:00
**Researcher**: tolga
**Git Commit**: c9ed7c24153ff78928581bbf5600ae0b44d76dac
**Branch**: staging
**Repository**: terp

## Research Question

Für Pro-Di soll eine konfigurierbare Überstunden-Auszahlung entstehen (OvertimePayoutRule, OvertimePayout, EmployeeOvertimePayoutOverride — siehe Ticket `thoughts/shared/tickets/prodi-prelaunch/pflicht-03-ueberstunden-auszahlung.md`). Vor der Planung: Was existiert heute bereits, mit welchen exakten Datei-Pfaden und Formeln, in Überstunden-Berechnung, Gleitzeitkonto, Monatsabschluss, DATEV-Export, Tarif-Konfiguration, Account-System und UI?

## Summary

Terp berechnet Überstunden tagesgenau als Differenz zwischen Netto-Arbeitszeit und Tagessoll, aggregiert sie monatlich und führt daraus einen Gleitzeitsaldo fort, dessen Regeln am `Tariff`-Modell hängen. Der Gleitzeitsaldo wird **nicht** im `Account`/`DailyAccountValue`-System gespeichert, sondern direkt in Spalten auf `MonthlyValue` (`flextimeStart`, `flextimeChange`, `flextimeEnd`, `flextimeCarryover`). Der Monatsabschluss ist ein rein manueller Flag-Toggle (`isClosed = true` plus Audit-Felder) und löst **keine** Auszahlungs- oder Buchungslogik aus.

DATEV-Export emittiert Überstunden heute als rein informative Stundenzeile unter Lohnart `1002` (Legacy-Engine) bzw. über die Liquid-Template-Variable `employee.monthlyValues.overtimeHours` (Template-Engine). Es existiert **keine** Differenzierung zwischen "aufs Konto geschriebenen" und "ausbezahlten" Überstunden, kein Schwellenwert für die Auszahlung, kein `OvertimePayoutRule`-Modell, kein `EmployeeOvertimePayoutOverride` und keine Auszahlungs-Lohnart. Es gibt außerdem keine Mitarbeiter-Overrides für Tarif-Flextime-Regeln und keinen UI-Flow, der einen Auszahlungsbetrag anzeigt oder freigibt.

## Detailed Findings

### 1. Überstunden-Berechnung (Daily & Monthly)

#### 1.1 Tägliche Berechnung `DailyValue.overtime`

Die zentrale Formel liegt in `src/lib/calculation/breaks.ts:247-260`:

```ts
export function calculateOvertimeUndertime(
  netTime: number,
  targetTime: number
): { overtime: number; undertime: number } {
  const diff = netTime - targetTime
  if (diff > 0) return { overtime: diff, undertime: 0 }
  if (diff < 0) return { overtime: 0, undertime: -diff }
  return { overtime: 0, undertime: 0 }
}
```

- `overtime` und `undertime` sind stets non-negativ und schließen sich täglich aus.
- Einheit: Minuten.

Aufrufort in `src/lib/calculation/calculator.ts:152-155` (Step 10 der `calculate()`-Pipeline):

```ts
// Step 10: Calculate overtime/undertime
const { overtime, undertime } = calculateOvertimeUndertime(result.netTime, result.targetTime)
result.overtime = overtime
result.undertime = undertime
```

`netTime` wurde vorher um Pausen und `maxNetWorkTime`-Cap reduziert; `targetTime` stammt aus `input.dayPlan.regularHours` (`calculator.ts:45`), das seinerseits aus `resolveTargetHours()` in `daily-calc.ts:1256` kommt.

**Persistierung in `DailyValue`** — `src/lib/services/daily-calc.ts:1489-1536`:

```ts
private async upsertDailyValue(input: DailyValueInput): Promise<DailyValue> {
  return this.prisma.dailyValue.upsert({
    where: { employeeId_valueDate: { employeeId, valueDate } },
    create: { ..., overtime: input.overtime, undertime: input.undertime, ... },
    update: { ..., overtime: input.overtime, undertime: input.undertime, ... },
  })
}
```

**Absenzen überschreiben overtime auf 0** — diverse Helfer in `daily-calc.ts` konstruieren `DailyValueInput` mit `overtime: 0` hart kodiert:
- `handleOffDay()` Z. 713
- `handleHolidayCredit()` Z. 779
- `handleAbsenceCredit()` Z. 835
- `handleNoBookings()` Varianten `NO_BOOKING_ADOPT_TARGET` Z. 881, `NO_BOOKING_DEDUCT_TARGET` Z. 907, Berufsschule/target_with_order Z. 948/1024, `NO_BOOKING_ERROR` Z. 1051

Nur der normale Buchungs-Pfad (`calculateWithBookings()` → `resultToDailyValue()` bei `daily-calc.ts:1346-1370`) reicht `result.overtime` aus der Engine durch.

#### 1.2 Monatliche Aggregation `MonthlyValue.totalOvertime`

`src/lib/calculation/monthly.ts:135-149`:

```ts
for (const dv of input.dailyValues) {
  output.totalGrossTime   += dv.grossTime
  output.totalNetTime     += dv.netTime
  output.totalTargetTime  += dv.targetTime
  output.totalOvertime    += dv.overtime
  output.totalUndertime   += dv.undertime
  output.totalBreakTime   += dv.breakTime
  ...
}
```

Ein einfacher Integer-Summen-Lauf über alle Tage des Monats.

`flextimeChange` wird in `monthly.ts:152` berechnet:
```ts
output.flextimeChange = output.totalOvertime - output.totalUndertime
```

Und `flextimeRaw` in `monthly.ts:155`:
```ts
output.flextimeRaw = output.flextimeStart + output.flextimeChange
```

wobei `flextimeStart = input.previousCarryover` (Vormonats-`flextimeEnd`, gesetzt in `monthly-calc.ts:300`).

#### 1.3 Echte Überstunden vs. Mehrarbeit

Es gibt **keine** Code-seitige Unterscheidung zwischen "echten Überstunden" und "Mehrarbeit". `DailyValue.overtime`/`MonthlyValue.totalOvertime` sind ein einziger Zähler für "Netto-Zeit über Tagessoll". Grep über `prisma/schema.prisma` und `src/` nach `Mehrarbeit`, `ueberstunden`, `overtimeRule`, `overtimePayout` lieferte nur Test-Datenbezeichnungen (`src/e2e/__tests__/02-arbeitszeitmodelle.test.ts:593,678,686,741,745`), keine Modellfelder.

#### 1.4 Interaktion overtime ↔ Gleitzeitkonto

Der Gleitzeitsaldo wird nicht direkt aus `overtime` geschrieben; stattdessen liefert `flextimeChange` (= `totalOvertime - totalUndertime`) die Eingabe für `applyCreditType()` in `src/lib/calculation/monthly.ts:177-278`, das vier Branches durchläuft (siehe §5). Das Ergebnis steht als `flextimeEnd` im `MonthlyValue` und wird als `flextimeCarryover` zum nächsten Monat gespiegelt (`monthly-calc.ts:747`).

### 2. Gleitzeitkonto / Flexzeit-System

#### 2.1 Kein Account-basiertes Gleitzeitkonto für Saldenführung

Der Gleitzeitsaldo lebt ausschließlich in Spalten auf `MonthlyValue`:

`prisma/schema.prisma:4079-4118`:

```
flextimeStart     Int @default(0)
flextimeChange    Int @default(0)
flextimeEnd       Int @default(0)
flextimeCarryover Int @default(0)
```

Die System-Konten `FLEX`, `OT`, `VAC` existieren im `Account`-Modell (`prisma/schema.prisma:1703`, gesiedet durch `supabase/migrations/20260101000092_seed_net_cap_system_accounts.sql` bzw. `20260101000007_create_accounts.sql`) und werden **nicht** als Saldenträger für das Gleitzeitkonto benutzt. Sie dienen in den heutigen Code-Pfaden nur als Ziel von `DayPlan.netAccountId`/`capAccountId`-Buchungen (Quelltypen `net_time`, `capped_time`), nicht als Source-of-Truth für den Flextime-Saldo. Der `account_balances`-Report (`src/lib/services/reports-service.ts:363-373`) liest den Gleitzeitsaldo direkt aus `MonthlyValue.flextimeStart/flextimeChange/flextimeEnd` — nicht per `SUM(DailyAccountValue.value)`.

#### 2.2 Saldo-Berechnung und Persistierung

`src/lib/services/monthly-calc.ts:341-371` schreibt `MonthlyValue` per bedingtem `updateMany` mit `isClosed: false`-Guard (nicht Prisma-`upsert`):

```ts
const updateResult = await this.prisma.monthlyValue.updateMany({
  where: { employeeId, year, month, isClosed: false, tenantId: this.tenantId },
  data: { ...monthlyData },
})
if (updateResult.count === 0) {
  const existing = await this.getByEmployeeMonth(employeeId, year, month)
  if (existing !== null && existing.isClosed) throw new Error(ERR_MONTH_CLOSED)
  await this.prisma.monthlyValue.create({ data: { ... } })
}
```

`monthlyData` stammt aus `buildMonthlyValue()` in `monthly-calc.ts:721-754` und enthält explizit `flextimeCarryover: output.flextimeEnd`.

#### 2.3 DailyAccountValue-Einträge für Plus-/Minusstunden

Es gibt **keine** Plus-/Minusstunden-Postings im `DailyAccountValue`. Die geschriebenen Source-Werte sind:

- `net_time` (`src/lib/services/daily-calc.ts:1561`): `valueMinutes = dailyValue.netTime`, gebucht gegen `dayPlan.netAccountId`
- `capped_time` (`daily-calc.ts:1593`): `valueMinutes = max(0, grossTime - maxNetWorkTime)`, gebucht gegen `dayPlan.capAccountId`
- `surcharge` (`daily-calc.ts:1677`): ein oder mehrere Zuschlags-Zeilen pro Tag, gebucht gegen die in `DayPlanBonus.accountId` konfigurierten Konten
- `absence_rule` (`daily-calc.ts:1741`): aus `AbsenceCalculationRule` berechnete Minuten
- Kein `overtime`-Source, kein `flextime`-Source, kein `overtime_payout`-Source.

Die TypeScript-Union in `src/lib/services/daily-account-values-repository.ts:13` listet daher auch nur `"net_time" | "capped_time" | "surcharge"` (die `absence_rule`-Konstante lebt in `daily-calc.types.ts:65` als `DAV_SOURCE_ABSENCE_RULE`, ist aber nicht in der List-Param-Union).

#### 2.4 Monatsabschluss-Prozess mit Gleitzeitkonto

Der `closeMonth`-Pfad (siehe §3) berührt **keine** Account-Tabellen. Er setzt ausschließlich die Closure-Flags auf `MonthlyValue`; die Gleitzeit-Salden wurden bereits zuvor bei der regulären `calculateMonth`/`recalculateMonth`-Ausführung in `flextimeEnd`/`flextimeCarryover` geschrieben. Es gibt **keinen** Hook nach Close, der etwas in `DailyAccountValue` oder andere Tabellen postet.

#### 2.5 Kappungsregeln (Gleitzeitkonto-Obergrenze)

Die Obergrenzen leben am `Tariff` (`prisma/schema.prisma:2880-2884`):

- `maxFlextimePerMonth` — monatlicher Anrechnungs-Deckel
- `upperLimitAnnual` — positive Saldo-Obergrenze
- `lowerLimitAnnual` — negative Saldo-Untergrenze (als positiver Wert abgelegt)
- `flextimeThreshold` — Überstunden-Schwelle für `after_threshold`-Modus

`applyFlextimeCaps()` in `src/lib/calculation/monthly.ts:287-305`:

```ts
if (capPositive !== null && value > capPositive) {
  forfeited = value - capPositive
  value = capPositive
}
if (capNegative !== null && value < -capNegative) {
  value = -capNegative
}
```

Nur der positive Überlauf erhöht `flextimeForfeited`; der negative Cap floored lautlos.

Zusätzlich existiert `MonthlyEvaluationTemplate` (`prisma/schema.prisma:4397-4415`) mit `flextimeCapPositive`, `flextimeCapNegative`, `overtimeThreshold`, `maxCarryoverVacation` — dieses Modell wird aber von `buildEvaluationRules()` **nicht** gelesen; die Konfiguration kommt in der aktuellen Logik ausschließlich vom `Tariff`. `MonthlyEvaluationTemplate` dient lediglich dem Admin-Template-UI.

### 3. Monatsabschluss-Prozess

#### 3.1 `MonthlyValue.isClosed` und Audit-Felder

`prisma/schema.prisma:4079-4118`:

```
isClosed          Boolean  @default(false) @map("is_closed")
closedAt          DateTime? @map("closed_at") @db.Timestamptz(6)
closedBy          String?  @map("closed_by") @db.Uuid
reopenedAt        DateTime? @map("reopened_at") @db.Timestamptz(6)
reopenedBy        String?  @map("reopened_by") @db.Uuid
```

Unique-Constraint: `@@unique([employeeId, year, month])`.

#### 3.2 Was passiert beim Schließen?

`src/lib/services/monthly-calc.ts:378-405` — `closeMonth`:

```ts
await this.prisma.monthlyValue.updateMany({
  where: { employeeId, year, month, isClosed: false, tenantId: this.tenantId },
  data: { isClosed: true, closedAt: new Date(), closedBy },
})
```

- Atomic Guard via `WHERE isClosed = false` verhindert TOCTOU.
- Keine Recalc-Ausführung beim Close.
- Keine Kaskade zum Folgemonat.
- Keine Schreiboperation auf `DailyValue`, `DailyAccountValue` oder andere Tabellen.
- Das Auditing liegt in der Service-Schicht (`monthlyValuesService.close`, siehe §3.3), nicht hier.

`reopenMonth` (`monthly-calc.ts:411-438`) setzt `isClosed = false`, `reopenedAt = now()`, `reopenedBy`; löscht aber **nicht** `closedAt`/`closedBy`.

#### 3.3 Beteiligte Services / Router

Service-Layer `src/lib/services/monthly-values-service.ts`:

| Funktion | Zeilen | Wirkung |
|---|---|---|
| `close(...)` | 168–229 | Lookup → Scope-Check → Pre-Check (`mv.isClosed` → Error) → `monthlyCalcService.closeMonth(...)` → Re-Fetch → **Audit-Log** (`action="close"`, `entityType="monthly_values"`) |
| `reopen(...)` | 231–281 | Analog; **kein** Audit-Log |
| `closeBatch(...)` | 283–409 | Resolve `employeeIds` (optional alle aktiven) → optionales `calculateMonthBatch` → partitioniere `toClose`/`skippedCount` → `mapWithConcurrency(5)` mit `closeMonth` pro MA → Audit-Log pro MA |
| `recalculate(...)` | 411–470 | `monthlyCalcService.calculateMonthBatch(...)`; Closed-Monate silent-skipped |

Router `src/trpc/routers/monthlyValues.ts` — alle `tenantProcedure`:

| Procedure | Permission | Input |
|---|---|---|
| `forEmployee` | `time_tracking.view_own`/`view_all` | `{ employeeId, year, month }` |
| `yearOverview` | same | `{ employeeId, year }` |
| `list` | `reports.view` + `applyDataScope()` | `{ page, pageSize, year, month, status?, departmentId?, employeeId? }` |
| `getById` | `reports.view` + `applyDataScope()` | `{ id }` |
| `close` | `reports.manage` + `applyDataScope()` | `{ id } \| { employeeId, year, month }` |
| `reopen` | `reports.manage` + `applyDataScope()` | same |
| `closeBatch` | `reports.manage` + `applyDataScope()` | `{ year, month, employeeIds?, departmentId?, recalculate? }` |
| `recalculate` | `booking_overview.calculate_month` + `applyDataScope()` | `{ year, month, employeeId? }` |

`monthlyEvalTemplatesRouter` (`src/trpc/routers/monthlyEvalTemplates.ts`) verwaltet ausschließlich die `MonthlyEvaluationTemplate`-CRUD (7 Procedures unter `monthly_evaluations.manage`).

#### 3.4 Cron: Recalc, nicht Close

`src/app/api/cron/calculate-months/route.ts` — geplant am 2. jedes Monats, 03:00 UTC (`vercel.json`). Ziel: **Recalc** des Vormonats pro Tenant via `monthlyCalcService.calculateMonthBatch(...)`. **Schließt keine Monate**; bereits geschlossene Monate werden silent-skipped.

Kein weiterer Cron-Job in `src/app/api/cron/` (calculate-days, dsgvo-retention, email-imap-poll, execute-macros, email-retry, generate-day-plans, expire-demo-tenants, export-template-schedules, inbound-invoice-escalations, platform-cleanup, platform-subscription-autofinalize, recurring-invoices, wh-corrections, dunning-candidates) schließt Monate automatisch.

#### 3.5 Audit-Logging

`src/lib/services/audit-logs-service.ts:173-214` — `auditLog.log()` schreibt `audit_logs` mit `{tenantId, userId, action, entityType, entityId, entityName, changes, metadata, ipAddress, userAgent}`. Für `close`: `action="close"`, `entityType="monthly_values"`, `entityName="${year}-${month}"`, `changes=null`. Audit-Fehler blockieren das Close nicht (`.catch()`). Für `reopen` wird **kein** Audit-Log geschrieben.

### 4. DATEV-Export — Überstunden

Terp hat zwei parallele Export-Pfade.

#### 4.1 Legacy-Engine `generateDatevLodas()`

`src/lib/services/payroll-export-service.ts:135-190`.

Lesen von Überstunden (`payroll-export-service.ts:421-446`):

```ts
const targetHours   = mv.totalTargetTime / 60
const workedHours   = mv.totalNetTime / 60
const overtimeHours = mv.totalOvertime / 60
```

Fester CSV-Header:

```
Personalnummer;Nachname;Vorname;Lohnart;Stunden;Tage;Betrag;Kostenstelle
```

Hardcodierte Lohnarten-Schleife (`payroll-export-service.ts:143-167`):

| Code | Feld | Einheit |
|---|---|---|
| `1000` | `targetHours` | Stunden |
| `1001` | `workedHours` | Stunden |
| **`1002`** | **`overtimeHours`** | **Stunden** |
| `2000` | `vacationDays` | Tage |
| `2001` | `sickDays` | Tage |
| `2002` | `otherAbsenceDays` | Tage |

Die `Betrag`-Spalte bleibt immer leer — reiner Stundentransfer. Die Zeile wird nur emittiert, wenn `hours > 0 || days > 0`.

Zusätzlich dynamisch: pro Account im `accountInfoMap` eine Zeile, wenn die aggregierte `DailyAccountValue`-Summe ≠ 0 ist; Lohnart aus `account.payrollCode` oder `account.code` (`payroll-export-service.ts:171-186`).

#### 4.2 Template-Engine `buildExportContext()`

`src/lib/services/export-context-builder.ts:337-678`. Exponiert unter `employee.monthlyValues` genau sechs Variablen (`export-context-builder.ts:569-574`):

| Template-Variable | Quelle | Umformung |
|---|---|---|
| `monthlyValues.targetHours` | `mv.totalTargetTime` | `/ 60` |
| `monthlyValues.workedHours` | `mv.totalNetTime` | `/ 60` |
| **`monthlyValues.overtimeHours`** | **`mv.totalOvertime`** | **`/ 60`** |
| `monthlyValues.vacationDays` | `mv.vacationTaken` | `Number()` |
| `monthlyValues.sickDays` | `mv.sickDays` | direkt |
| `monthlyValues.otherAbsenceDays` | `mv.otherAbsenceDays` | direkt |

**Keine** weiteren Flextime-/Balance-Variablen (`flextimeBalance`, `flextimeChange`, `totalNetTime`, `balance`, `surchargeMinutes`, `overtimeMinutes` sind **nicht** im Kontext).

Zuschlags-Stunden fließen über `employee.accountValues[code]`, aggregiert durch `aggregateAccountValuesForContext()` in `src/lib/services/payroll-export-repository.ts:222-261` (SUM `DailyAccountValue.valueMinutes` → `/60`).

`TenantPayrollWage.terpSource` verbindet Lohnart zu Quelle:
- `"overtimeHours"` → `employee.monthlyValues["overtimeHours"]`
- `"account:NIGHT"` → `employee.accountValues["NIGHT"]`

Der Liquid-Filter `terp_value` in `src/lib/services/liquid-engine.ts:103-122` dispatcht.

#### 4.3 Seed-Migrationen für Lohnarten

`supabase/migrations/20260417100000_create_export_templates_and_payroll_wages.sql` (Zeilen 104–125) seedet 20 `DefaultPayrollWage`-Zeilen; überstunden-/zuschlagsrelevant:

```sql
('1002', 'Mehrarbeit/Überstunden', 'overtimeHours', 'time', 'Mehrarbeitsstunden', 30),
('1003', 'Nachtarbeit',            'nightHours',    'time', 'Nachtarbeitsstunden', 40),
('1004', 'Sonntagsarbeit',         'sundayHours',   'time', 'Sonntagsarbeitsstunden', 50),
('1005', 'Feiertagsarbeit',        'holidayHours',  'time', 'Feiertagsarbeitsstunden', 60),
```

`supabase/migrations/20260430000000_datev_surcharge_terpsource_update.sql` migriert `1003`/`1004`/`1005` auf `account:NIGHT|SUN|HOLIDAY`. **Lohnart `1002` bleibt auf `overtimeHours` gebunden**.

Schema:
- `DefaultPayrollWage` (`prisma/schema.prisma:3875-3886`): `id, code UNIQUE, name, terpSource, category, description, sortOrder, createdAt`
- `TenantPayrollWage` (`prisma/schema.prisma:3888-3906`): `id, tenantId, code, name, terpSource, category, description, sortOrder, isActive, createdAt, updatedAt; UNIQUE(tenantId, code)`
- `ExportTemplate` (`prisma/schema.prisma:3749-3779`): Liquid-Template + Output-Options (Encoding, LineEnding, Feld-/Dezimaltrenner)

#### 4.4 Keine Auszahlungs-Lohnart

Weder die Legacy-Engine noch die Template-Engine kennt heute eine separate Auszahlungs-Lohnart. `overtimeHours` wird stets als reine Stundenzeile mit leerem `Betrag` exportiert; es gibt keinen Code-Pfad, der zwischen "aufs Konto" und "Auszahlung" unterscheidet.

Tests: `src/lib/services/__tests__/datev-zuschlaege.integration.test.ts` bestätigt Zuschlags-Export end-to-end; es gibt keinen Test, der `terpSource="overtimeHours"` spezifisch für eine Auszahlung prüft.

### 5. Tarif — Überstunden-Konfiguration

#### 5.1 Alle überstunden-/flextime-relevanten Tariff-Felder

`prisma/schema.prisma:2857-2914`:

Target-Hours (Berechnungs-Basis):
- `dailyTargetHours Decimal?(5,2)`
- `weeklyTargetHours Decimal?(5,2)`
- `monthlyTargetHours Decimal?(6,2)`
- `annualTargetHours Decimal?(7,2)`

Flextime/Overtime (fünf entscheidende Felder):
- `maxFlextimePerMonth Int?` — monatliche Kappung der Anrechnung
- `upperLimitAnnual Int?` — positive Saldenobergrenze
- `lowerLimitAnnual Int?` — negative Saldenuntergrenze (Betrag)
- `flextimeThreshold Int?` — Schwelle für `after_threshold`
- `creditType String? @default("no_evaluation")` — CHECK `IN ('no_evaluation', 'complete', 'after_threshold', 'no_carryover')`

Rhythm (DayPlan-Auswahl):
- `rhythmType` (`weekly` | `rolling_weekly` | `x_days`), `cycleDays`, `rhythmStartDate`, `weekPlanId`

#### 5.2 `buildEvaluationRules(tariff)`

`src/lib/services/monthly-calc.ts:698-716`:

```ts
private buildEvaluationRules(tariff: Tariff): MonthlyEvaluationInput | null {
  const creditType = (tariff.creditType || "no_evaluation") as CreditType
  if (creditType === "no_evaluation") return null
  return {
    creditType,
    flextimeThreshold:    tariff.flextimeThreshold ?? null,
    maxFlextimePerMonth:  tariff.maxFlextimePerMonth ?? null,
    flextimeCapPositive:  tariff.upperLimitAnnual ?? null,
    flextimeCapNegative:  tariff.lowerLimitAnnual ?? null,
    annualFloorBalance:   null,
  }
}
```

Die vier `creditType`-Branches in `applyCreditType` (`src/lib/calculation/monthly.ts:177-278`):

| `creditType` | Verhalten |
|---|---|
| `no_evaluation` | Direkt-Transfer: `flextimeEnd = flextimeRaw`, keine Caps |
| `complete_carryover` | Monatskappung via `maxFlextimePerMonth`; dann `flextimeEnd`-Caps `upperLimitAnnual`/`lowerLimitAnnual` |
| `after_threshold` | Nur Überschuss über `flextimeThreshold` anrechenbar; dann Monatskappung; dann Caps |
| `no_carryover` | `flextimeEnd = 0`; gesamte `flextimeChange` → `flextimeForfeited` |

#### 5.3 DayPlan-relevante Überstunden-Felder

`prisma/schema.prisma:2631-2737`:
- `regularHours Int @default(480)` — Tagessoll in Minuten
- `regularHours2 Int?` — Sekundär-Soll
- `fromEmployeeMaster Boolean` — Soll-Übernahme aus Employee-Stammdaten
- `maxNetWorkTime Int?` — hartes Tages-Cap (speist `capped_time`-DailyAccountValue)
- `minWorkTime Int?`
- `netAccountId String?` — Ziel des `net_time`-Postings
- `capAccountId String?` — Ziel des `capped_time`-Postings

#### 5.4 `MonthlyEvaluationTemplate` ist NICHT mit Tarif/Employee verknüpft

`prisma/schema.prisma:4397-4415`:
```
flextimeCapPositive   Int  @default(0)
flextimeCapNegative   Int  @default(0)
overtimeThreshold     Int  @default(0)
maxCarryoverVacation  Decimal @default(0)
isDefault             Boolean
isActive              Boolean
```

Es existiert **keine** FK zu `Tariff` oder `Employee`. `buildEvaluationRules()` liest diese Werte **nicht**. Das Template-UI (`src/components/monthly-evaluations/monthly-evaluation-form-sheet.tsx`) speichert die Zahlen, aber kein Kalkulations-Pfad konsumiert sie heute.

#### 5.5 Keine Per-Employee-Overrides

Grep aller `Employee*`-Modelle lieferte: `EmployeeContact, EmployeeCard, EmployeeTariffAssignment, EmployeeGroup, EmployeeCappingException, EmployeeDayPlan, EmployeeMessage, EmployeeMessageRecipient, EmployeeAccessAssignment, EmployeeSalaryHistory, EmployeeChild, EmployeeCompanyCar, EmployeeJobBike, EmployeeMealAllowance, EmployeeVoucher, EmployeeJobTicket, EmployeePension, EmployeeSavings, EmployeeGarnishment, EmployeeParentalLeave, EmployeeMaternityLeave, EmployeeForeignAssignment, EmployeeOtherEmployment`.

Kein Modell override-t `creditType`, `flextimeThreshold`, `maxFlextimePerMonth`, `upperLimitAnnual`, `lowerLimitAnnual`.

`EmployeeTariffAssignment` (`prisma/schema.prisma:2180-2204`) trägt nur Scheduling-Metadaten (`effectiveFrom`, `effectiveTo`, `overwriteBehavior`, `notes`, `isActive`) — keine Flextime/Overtime-Overrides.

Das `Employee`-Modell (`prisma/schema.prisma:1845-2048`) hat zwar `dailyTargetHours`, `weeklyTargetHours`, `monthlyTargetHours`, `annualTargetHours`, `workDaysPerWeek` (1890–1894) als Target-Override; gesteuert über `DayPlan.fromEmployeeMaster`. Aber **keine** Flextime-/Overtime-Rule-Overrides.

#### 5.6 Keine "overtime payout"-Felder irgendwo

Grep `payout|Auszahlung|overtimeRule|overtime_rule|OvertimePayout` über `prisma/schema.prisma` und `src/` → null Treffer in Modellen/Services. Nur Test-Daten-Strings nennen deutschsprachige Tarif-Namen wie `"E2E Ueberstunden"`.

### 6. Account-System — Buchungsmechanik

#### 6.1 `DailyAccountValue` Schema

`prisma/schema.prisma:4591-4621`:

```
model DailyAccountValue {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @db.Uuid
  employeeId   String   @db.Uuid
  accountId    String   @db.Uuid
  valueDate    DateTime @db.Date
  valueMinutes Int      @default(0)
  source       String   @db.VarChar(20)
  dayPlanId    String?  @db.Uuid
  createdAt    DateTime @default(now())
  updatedAt    DateTime @default(now())
  ...
  @@unique([employeeId, valueDate, accountId, source])
  @@map("daily_account_values")
}
```

Kein FK zu `daily_values`. Keine DB-CHECK-Constraint auf `source` (nur Schema-Kommentar dokumentiert `'net_time', 'capped_time', 'surcharge'`).

#### 6.2 Alle DailyAccountValue-Writer

| Datei | Zeile | Operation | Bedingung |
|---|---|---|---|
| `src/lib/services/daily-calc.ts` | 1553 | `deleteMany` | Kein DayPlan zugewiesen |
| `src/lib/services/daily-calc.ts` | 1561 | `upsert` | `net_time` gegen `netAccountId` |
| `src/lib/services/daily-calc.ts` | 1593 | `upsert` | `capped_time` gegen `capAccountId` |
| `src/lib/services/daily-calc.ts` | 1635 | `deleteMany` | Vor Surcharge-Re-Insert |
| `src/lib/services/daily-calc.ts` | 1677 | `upsert` im `$transaction` | `surcharge` |
| `src/lib/services/daily-calc.ts` | 1719 | `deleteMany` | Vor `absence_rule`-Re-Insert |
| `src/lib/services/daily-calc.ts` | 1741 | `upsert` | `absence_rule` |
| `src/lib/services/demo-tenant-service.ts` | 622 | `deleteMany` | Demo-Daten-Wipe |

**Kein** tRPC-Router, kein Correction-Service, kein Payout-Pfad schreibt direkt `DailyAccountValue`. Alle Postings laufen durch `DailyCalcService.calculateDay()`.

#### 6.3 Source-Typen

`src/lib/services/daily-calc.types.ts:62-66` definiert die Konstanten:
- `DAV_SOURCE_NET_TIME = "net_time"`
- `DAV_SOURCE_CAPPED_TIME = "capped_time"`
- `DAV_SOURCE_SURCHARGE = "surcharge"`
- `DAV_SOURCE_ABSENCE_RULE = "absence_rule"`

**Kein** `overtime_payout`-Source definiert.

#### 6.4 Aggregation / Balances

`src/lib/services/daily-account-values-service.ts` ist read-only:
- `list(...)` → `repo.findMany` mit Account-Relation-Include
- `summaryByEmployee(...)` → `groupBy employeeId, SUM(valueMinutes)` mit Hydration via `prisma.employee.findMany`

Es gibt **keine** laufende Balance-Spalte am `Account` und keinen inkrementellen Balance-Cache. Balance-Reports über die `Account`-Konten laufen stets per `groupBy/SUM` auf `DailyAccountValue`. Der `account_balances`-Report im Monthly-Kontext liest jedoch, wie oben dokumentiert, direkt aus `MonthlyValue.flextime*`.

#### 6.5 Correction-Modell

`prisma/schema.prisma:4871-4900`:

```
correctionType  String  @db.VarChar(50)   // CHECK: time_adjustment | balance_adjustment | vacation_adjustment | account_adjustment
accountId       String? @db.Uuid          // optional FK to Account
valueMinutes    Int
status          String  @default("pending") // CHECK: pending | approved | rejected
approvedBy      String? @db.Uuid
approvedAt      DateTime?
createdBy       String? @db.Uuid
```

**`correction-service.ts` schreibt keine `DailyAccountValue`-Rows direkt.** Der `approve(...)`-Pfad (`src/lib/services/correction-service.ts:298-360`) setzt nur den Status auf `"approved"` und ruft `triggerRecalc(prisma, tenantId, employeeId, correctionDate)` (Z. 333) auf:

```ts
const service = new RecalcService(prisma, undefined, undefined, tenantId)
await service.triggerRecalc(tenantId, employeeId, correctionDate)
```

Dieser Recalc läuft `DailyCalcService.calculateDay()` erneut durch und überschreibt alle `DailyAccountValue`-Zeilen des Tages. Die Correction selbst ist also eine Intent-Zeile — `DailyCalcService` liest `correction.valueMinutes`/`correction.correctionType` **nicht** direkt. Effekt entsteht mittelbar (z.B. über Buchungs-Anpassungen durch andere Services, die die Correction als Trigger behandeln).

`reject(...)` triggert **keinen** Recalc (`correction-service.ts:362-416`).

#### 6.6 Audit-Trail Corrections

Jeder Mutationspfad (`create`, `update`, `remove`, `approve`, `reject`) schreibt `audit_logs` via `auditLog.log(prisma, {tenantId, userId, action, entityType:"correction", entityId, changes})` mit `TRACKED_FIELDS = ["valueMinutes", "reason", "status", "correctionType"]` (`correction-service.ts:20`). Audit-Fehler blockieren nicht.

### 7. UI — Überstunden-Anzeige

#### 7.1 Dashboard: `FlextimeBalanceCard`

`src/components/dashboard/flextime-balance-card.tsx`:
- Hook: `useMonthlyValues({ employeeId, year, month })` (Z. 29-39) → tRPC `monthlyValues.forEmployee`.
- Rendert `monthlyValue.balance_minutes` via `formatBalance(...)` (Z. 93, `src/lib/time-utils.ts:50-55`).
- Subtitle: `net_minutes of target_minutes` via `formatMinutes()`.
- `balance_minutes` wird im Hook-Transform als `totalOvertime - totalUndertime` berechnet (`src/hooks/use-monthly-values.ts:68-70`).

#### 7.2 Year Overview: `flextime-chart.tsx`

`src/components/year-overview/flextime-chart.tsx`: 12-Monats-Balkendiagramm. Datenquelle (`year-overview/page.tsx:80-84`): `mv.account_balances?.flextime ?? mv.balance_minutes ?? 0`. `account_balances.flextime` wird im Hook-Transform aus `flextimeEnd` gebaut (`use-monthly-values.ts:112-114`).

#### 7.3 Monthly Evaluation UI

`src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx` (Employee Self-Service):
- Status-Badge, Close/Reopen-Button, `MonthlyExportButtons`.
- `MonthlySummaryCards` (4 Karten): Zeit, Flextime, Arbeitstage, Absenzen.
- `DailyBreakdownTable`.
- `CloseMonthSheet` / `ReopenMonthSheet`.

`src/components/monthly-evaluation/monthly-summary-cards.tsx`:
- Karte 2 "Flextime-Saldo" rendert `monthlyValue.flextime_end` (Z. 55) — Jahreskonto-Saldo zum Monatsende, **nicht** der Monatsdelta.

`src/components/monthly-evaluation/close-month-sheet.tsx`:
- Hook `useCloseMonth()` → `trpc.monthlyValues.close.mutateAsync({employeeId, year, month})`.
- Im UI-Zustand gibt es Checkboxen `recalculate` (default true, Z. 41) und `notes`, die **nicht** an die Mutation weitergereicht werden (Z. 60-64). Tatsächlich wird nur `{employeeId, year, month}` gesendet.

`src/components/monthly-evaluation/reopen-month-sheet.tsx`:
- `reason ≥ 10 chars` Client-Validation (Z. 54) — Wert wird **nicht** an die Mutation gesendet.

#### 7.4 Admin: `/admin/monthly-values`

`src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx`:
- Permission: `reports.view` (Z. 30).
- Spalten: `employee_name`, `personnel_number`, `status` (Badge), `target_minutes`, `net_minutes`, `overtime_minutes` (= `totalOvertime`), `balance_minutes`, `absence_days`.
- Batch-Aktionen: `BatchCloseDialog`, `BatchReopenDialog`, `RecalculateDialog`.

`src/components/monthly-values/batch-close-dialog.tsx`:
- Hook `useCloseMonthBatch()` → `trpc.monthlyValues.closeBatch.mutateAsync({year, month, recalculate, employeeIds?|departmentId?})`.
- 3-Phase UI: `confirming → processing → results` mit `closedCount`, `skippedCount`, `errorCount`.

`src/components/monthly-values/batch-reopen-dialog.tsx`:
- Hook `useReopenMonthById()` → iteriert `selectedItems` seriell, pro Row `reopenMutation.mutateAsync({id})`. `reason` nur Client-Validation, **nicht** transmittiert.

#### 7.5 Admin: `/admin/monthly-evaluations` (Template-UI)

`src/components/monthly-evaluations/monthly-evaluation-form-sheet.tsx`:
- Form-State (Z. 49-58): `name`, `description`, `flextimeCapPositive` (min), `flextimeCapNegative` (min), `overtimeThreshold` (min), `maxCarryoverVacation` (Tage, step 0.5), `isDefault`, `isActive`.
- Diese Werte fließen in das `MonthlyEvaluationTemplate`-Modell — das, wie in §5.4 beschrieben, heute **nicht** von der Kalkulations-Pipeline konsumiert wird.

#### 7.6 Keine Überstunden-Auszahlungs-UI

Grep über `src/` nach `payout|Auszahlung|ausgesch|overtime_payout|overtimePayout|overtime-rule|overtimeRule`: **null Treffer**. Kein Widget, keine Seite, kein Hook für eine "Überstunden-Auszahlung"-Funktion.

### 8. Lücken-Analyse

Basierend auf §1–§7 ist der Ist-Zustand für eine konfigurierbare Überstunden-Auszahlung folgender:

**Vorhanden und nutzbar**:
- Stabile Überstunden-Quelle (`DailyValue.overtime`, `MonthlyValue.totalOvertime`) mit klarer Formel.
- Gleitzeitsaldo-Fortschreibung in `MonthlyValue.flextimeEnd`/`flextimeCarryover`, gesteuert von Tariff-Feldern (`creditType`, `maxFlextimePerMonth`, `upperLimitAnnual`, `lowerLimitAnnual`, `flextimeThreshold`).
- Monatsabschluss-Mechanik (`isClosed`, `closedAt`, `closedBy`, `reopenedAt`, `reopenedBy`) inkl. Batch-Close und Audit.
- tRPC-Procedures `close`/`reopen`/`closeBatch`/`recalculate` mit Permission-Checks.
- DATEV-Lohnart `1002` "Mehrarbeit/Überstunden" vorhanden — sowohl in Legacy-Engine als auch in `DefaultPayrollWage` seed-gesetzt (migration `20260417100000`).
- Template-Variable `employee.monthlyValues.overtimeHours` in der Export-Context-Registry.
- `DailyAccountValue` mit `upsert`-basierten Source-Postings (`net_time`, `capped_time`, `surcharge`, `absence_rule`) und Delete-Re-Insert-Pattern für Recalc-Idempotenz.
- UI: Dashboard-Flexsaldo-Karte, Year-Overview-Chart, Monthly-Evaluation-Übersicht, Admin-Monatswerte-Tabelle mit Batch-Actions, Evaluation-Template-Form.

**Nicht vorhanden — müsste für das Ticket geschaffen werden** (Ist-Zustand, keine Empfehlung):

- **Kein `OvertimePayoutRule`-Modell**: Es existiert heute keine Datenstruktur für "ab welchem Saldo wird wieviel wohin ausbezahlt". `MonthlyEvaluationTemplate` ist das nächstliegende bestehende Modell (hat `overtimeThreshold` und Caps), ist aber nicht mit `Tariff`/`Employee` verknüpft und nicht von der Kalkulations-Pipeline gelesen.
- **Kein `OvertimePayout`-Modell** für Einzelbuchungen (welcher MA, welcher Monat, welcher Betrag, wer hat freigegeben).
- **Kein `EmployeeOvertimePayoutOverride`**: Weder `EmployeeTariffAssignment` noch `Employee` noch ein separates Override-Modell trägt per-MA-Auszahlungs-Regeln.
- **Kein `source="overtime_payout"`** in `DailyAccountValue`: Das technische Muster für eine Gleitzeitkonto-Reduzierung existiert (negative Buchung auf ein FLEX/OT-Konto), aber es existiert heute kein Source-Typ dafür und kein Writer außer `DailyCalcService`.
- **Kein Close-Month-Hook** für eine Auszahlungsberechnung: `closeMonth` schreibt ausschließlich die Close-Flags auf `MonthlyValue`, ruft **keinen** nachgelagerten Service auf und führt **keine** DailyAccountValue-Postings aus.
- **Kein Recalc-Hook nach Auszahlung**: Das Tariff-getriebene Gleitzeitsaldo-System liest im Folgemonat `prevMonth.flextimeEnd`. Ein Payout müsste entweder das `flextimeEnd` direkt reduzieren (Schreib-Konflikt mit dem Kalkulator) oder via `DailyAccountValue`/Correction-Pfad eine Reduktion triggern, die sich in der Monatskalkulation widerspiegelt — Letzteres setzt voraus, dass der Gleitzeitsaldo tatsächlich aus `DailyAccountValue`-Summen statt aus `MonthlyValue.flextime*`-Spalten gespeist wird. Dieser Weg existiert heute **nicht**.
- **Keine Auszahlungs-Lohnart im DATEV-Export**: Lohnart `1002` (`Mehrarbeit/Überstunden`) exportiert heute `mv.totalOvertime / 60` als informative Stundenzeile. Für eine Auszahlungs-Logik fehlt:
  - eine zweite Lohnart (oder dieselbe mit anderem Betrags-Pfad), die nur den ausbezahlten Anteil transportiert
  - eine Template-Variable im Export-Context (z.B. `overtimePayoutHours`), die aus einem neuen `OvertimePayout`-Record gespeist wird
  - eine Konfiguration pro Tenant (`datevWageTypeCode`), die in `TenantPayrollWage` lebt — das Tabellenmodell dafür existiert bereits, nur die Seed-Zeile für "Auszahlung" fehlt.
- **Keine UI für Auszahlungs-Regel-Konfiguration** und keine Dashboard-Übersicht über anstehende/vergangene Auszahlungen.
- **Kein Audit-Trail speziell für Auszahlungs-Freigaben**: Allgemeine `audit_logs`-Infrastruktur ist vorhanden; es müsste `entityType="overtime_payout"` (oder ähnlich) eingeführt werden.

**Weitere im Ticket genannte Mechanik, die vorbereitet ist** (keine neuen Tabellen nötig, wenn an Bestehendes angehängt):
- Tenant-Level-Regel → könnte sich in der Struktur an `MonthlyEvaluationTemplate` orientieren (tenant-level, `isDefault`, `isActive`) oder an `Tariff` (per-Gruppe).
- Employee-Override → struktureller Match zu `EmployeeCappingException` (`prisma/schema.prisma` — siehe Employee-Modell-Liste in §5.5) als Vorlage für Opt-out-Muster.
- Audit-Logging → existierendes `auditLog.log()`-Interface in `src/lib/services/audit-logs-service.ts` genügt; neues `entityType` ausreichen.

## Code References

- `src/lib/calculation/breaks.ts:247-260` — `calculateOvertimeUndertime()` (Kernformel)
- `src/lib/calculation/calculator.ts:152-155` — Aufrufort Step 10
- `src/lib/calculation/monthly.ts:135-149` — `totalOvertime`/`totalUndertime` Aggregation
- `src/lib/calculation/monthly.ts:152-155` — `flextimeChange`, `flextimeRaw`
- `src/lib/calculation/monthly.ts:177-278` — `applyCreditType()` (alle vier Branches)
- `src/lib/calculation/monthly.ts:287-305` — `applyFlextimeCaps()`
- `src/lib/services/daily-calc.ts:1489-1536` — `upsertDailyValue()`
- `src/lib/services/daily-calc.ts:1542-1618` — `postDailyAccountValues()` (`net_time`, `capped_time`)
- `src/lib/services/daily-calc.ts:1624-1703` — `postSurchargeValues()` (`surcharge`)
- `src/lib/services/daily-calc.ts:1710-1765` — `postAbsenceRuleValue()` (`absence_rule`)
- `src/lib/services/daily-calc.types.ts:62-66` — DAV_SOURCE_* Konstanten
- `src/lib/services/monthly-calc.ts:341-371` — `MonthlyValue`-Upsert (`isClosed`-Guard)
- `src/lib/services/monthly-calc.ts:378-405` — `closeMonth()`
- `src/lib/services/monthly-calc.ts:411-438` — `reopenMonth()`
- `src/lib/services/monthly-calc.ts:698-716` — `buildEvaluationRules(tariff)`
- `src/lib/services/monthly-calc.ts:721-754` — `buildMonthlyValue()` mit `flextimeCarryover`
- `src/lib/services/monthly-values-service.ts:168-229` — `close()` mit Audit
- `src/lib/services/monthly-values-service.ts:231-281` — `reopen()` (ohne Audit)
- `src/lib/services/monthly-values-service.ts:283-409` — `closeBatch()`
- `src/lib/services/monthly-values-service.ts:411-470` — `recalculate()`
- `src/lib/services/correction-service.ts:298-360` — `approve()` + `triggerRecalc()`
- `src/lib/services/audit-logs-service.ts:173-214` — `auditLog.log()`
- `src/lib/services/payroll-export-service.ts:135-190` — `generateDatevLodas()`
- `src/lib/services/payroll-export-service.ts:143-167` — Hardcoded Lohnart 1000-2002
- `src/lib/services/payroll-export-service.ts:421-446` — `targetHours/workedHours/overtimeHours` aus `MonthlyValue`
- `src/lib/services/export-context-builder.ts:569-574` — `monthlyValues.*` Template-Variablen
- `src/lib/services/export-context-builder.ts:337-678` — `buildExportContext()`
- `src/lib/services/payroll-export-repository.ts:222-261` — `aggregateAccountValuesForContext()`
- `src/lib/services/liquid-engine.ts:103-122` — `terp_value` Liquid-Filter
- `src/app/api/cron/calculate-months/route.ts` — Recalc-Cron (nicht Close)
- `src/trpc/routers/monthlyValues.ts` — alle Procedures
- `src/trpc/routers/monthlyEvalTemplates.ts` — Template CRUD
- `src/hooks/use-monthly-values.ts:6-46` — `MonthSummary` Interface
- `src/hooks/use-monthly-values.ts:65-116` — `transformToLegacyMonthSummary`
- `src/components/dashboard/flextime-balance-card.tsx` — Dashboard-Widget
- `src/components/monthly-evaluation/close-month-sheet.tsx` — Close-UI
- `src/components/monthly-evaluation/reopen-month-sheet.tsx` — Reopen-UI
- `src/components/monthly-evaluation/monthly-summary-cards.tsx:83-118` — Flextime-Karte
- `src/components/monthly-evaluations/monthly-evaluation-form-sheet.tsx:49-58` — Template-Form
- `src/components/monthly-values/batch-close-dialog.tsx` — Admin-Batch-Close
- `src/components/year-overview/flextime-chart.tsx` — 12-Monats-Chart
- `prisma/schema.prisma:1703` — `Account`-Modell
- `prisma/schema.prisma:2180-2204` — `EmployeeTariffAssignment`
- `prisma/schema.prisma:2631-2737` — `DayPlan`
- `prisma/schema.prisma:2807-2842` — `WeekPlan`
- `prisma/schema.prisma:2857-2914` — `Tariff` (alle Flextime-Felder)
- `prisma/schema.prisma:2944-2982` — `TariffWeekPlan`/`TariffDayPlan`
- `prisma/schema.prisma:4079-4118` — `MonthlyValue` (inkl. `isClosed`/`flextime*`)
- `prisma/schema.prisma:4397-4415` — `MonthlyEvaluationTemplate`
- `prisma/schema.prisma:4591-4621` — `DailyAccountValue`
- `prisma/schema.prisma:4871-4900` — `Correction`
- `prisma/schema.prisma:3749-3779` — `ExportTemplate`
- `prisma/schema.prisma:3875-3906` — `DefaultPayrollWage`/`TenantPayrollWage`
- `supabase/migrations/20260101000007_create_accounts.sql` — System-Accounts (FLEX/OT/VAC)
- `supabase/migrations/20260101000029_create_monthly_values.sql` — `monthly_values`
- `supabase/migrations/20260101000030_add_tariff_zmi_fields.sql` — Tariff Flextime-Felder
- `supabase/migrations/20260101000080_add_day_plan_net_cap_accounts.sql` — `daily_account_values` + `netAccountId`/`capAccountId`
- `supabase/migrations/20260101000081_create_corrections.sql` — `corrections` Tabelle
- `supabase/migrations/20260101000082_create_monthly_evaluation_templates.sql` — Templates
- `supabase/migrations/20260417100000_create_export_templates_and_payroll_wages.sql:104-125` — Default-Lohnarten-Seed
- `supabase/migrations/20260430000000_datev_surcharge_terpsource_update.sql` — Zuschlags-Lohnarten-Migration

## Architecture Documentation

- **Service + Repository Pattern**: Durchgängig angewendet. Alle überstunden-/flextime-relevanten Services (`daily-calc`, `monthly-calc`, `daily-account-values`, `correction`, `payroll-export`, `tariffs`, `monthly-values`) trennen Business-Logik von Prisma-Zugriff.
- **Kalkulations-Engine vs. Service-Layer**: Reine Mathematik in `src/lib/calculation/` (pure, ohne Prisma/Tenant), Persistierung in `src/lib/services/*-calc.ts`. Das `CalculationResult`/`MonthlyCalcOutput`-Pattern macht den Eingriffspunkt für eine Auszahlungsberechnung klar (zwischen Monthly-Output und `MonthlyValue`-Upsert oder als separater Schritt nach Close).
- **Atomic-Update-Pattern für Close-Guards**: `updateMany` mit `isClosed`-Bedingung im `WHERE` wird konsistent eingesetzt (`closeMonth`, `reopenMonth`, `recalculateMonth`), um TOCTOU-Races zu vermeiden.
- **DailyAccountValue als Posting-Tabelle**: Delete-Re-Insert für `surcharge`/`absence_rule`, Upsert für `net_time`/`capped_time`. Das Pattern ist durch `(employeeId, valueDate, accountId, source)`-Unique-Key gesichert und idempotent bei Recalc.
- **Template-Engine mit `terpSource`-Dispatch**: Die Verknüpfung DATEV-Lohnart ↔ Datenquelle erfolgt nicht hartcodiert, sondern per `TenantPayrollWage.terpSource`-String und Liquid-Filter `terp_value`. Neue Auszahlungs-Variablen ließen sich also ohne Template-Änderung einhängen, wenn der Context-Builder sie liefert.
- **Audit-Log-Infrastruktur**: `auditLog.log()` mit `{tenantId, userId, action, entityType, entityId, entityName, changes, metadata, ipAddress, userAgent}` ist generisch und wird von Close, Corrections u.a. verwendet. Auditing neuer `overtime_payout`-Entität wäre mit bestehender Tool-Palette abdeckbar.
- **Tariff vs. MonthlyEvaluationTemplate**: Es existieren zwei parallele Konfigurationsflächen für Flextime-Caps/Threshold — aktuell wird nur die Tariff-Seite vom Kalkulator gelesen. Das Template-UI speichert Werte, ohne sie an einen Kalkulationspfad zu binden.

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege.md` — Paralleles Ticket: DATEV-Zuschläge als separate Lohnart (bereits in Implementierung, siehe Migration `20260430000000`)
- `thoughts/shared/tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md` — Nachfolgeticket, das die hier zu schaffende Verwertungsregel als Default für die Entscheidung Konto-vs-Auszahlung referenzieren soll
- `thoughts/shared/plans/2026-04-17-pflicht-02-datev-zuschlaege.md` — Implementation-Plan DATEV-Zuschläge (Vorlage für ähnliche Lohnart-Logik)
- `thoughts/shared/plans/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` — Plan DATEV-Vollständiger-Datenlieferant
- `thoughts/shared/plans/2026-04-08-datev-lohn-template-export-engine.md` — Template-Engine-Architektur
- `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` — Research zum vollständigen Datenlieferanten
- `thoughts/shared/research/2026-04-17-datev-zuschlaege.md` — Research DATEV-Zuschläge
- `thoughts/shared/research/2026-04-17-datev-lodas-buchung-stunden-migration.md` — Stunden-Buchungs-Migration
- `thoughts/shared/research/2026-01-30-ZMI-TICKET-016-monthly-evaluation-and-closing.md` — Research isClosed State Machine
- `thoughts/shared/plans/2026-01-30-ZMI-TICKET-016-monthly-evaluation-and-closing.md` — Plan Monatsabschluss-Flow
- `thoughts/shared/plans/2026-01-29-ZMI-TICKET-009-accounts-and-groups.md` — Plan Accounts & Groups
- `thoughts/shared/plans/2026-01-25-NOK-147-capping-account-logic.md` — Plan Kappungs-Konto-Logik
- `thoughts/shared/plans/2026-01-30-ZMI-TICKET-036-day-plan-net-cap-accounts.md` — Plan DayPlan net/cap account linkage
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` — ZMI-Kalkulations-Referenz (Gleitzeitkonto-Regeln)
- `thoughts/shared/research/2026-01-26-tariff-zmi-verification.md` — Tariff-Feld-Verifikation gegen ZMI
- `thoughts/shared/plans/2026-02-06-ZMI-TICKET-058-calculation-rule-config-ui.md` — Plan Calculation-Rule-UI

## Related Research

- `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`
- `thoughts/shared/research/2026-04-17-datev-lodas-buchung-stunden-migration.md`
- `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`
- `thoughts/shared/research/2026-01-30-ZMI-TICKET-016-monthly-evaluation-and-closing.md`
- `thoughts/shared/research/2026-01-29-ZMI-TICKET-009-accounts-and-groups.md`
- `thoughts/shared/research/2026-01-30-ZMI-TICKET-036-day-plan-net-cap-accounts.md`
- `thoughts/shared/research/2026-01-25-NOK-147-capping-account-logic.md`
- `thoughts/shared/research/2026-01-26-tariff-zmi-verification.md`

## Open Questions

(Dokumentiert aus dem Ticket — nicht Research-Ergebnis, sondern fachliche Offenfragen für Pro-Di)

1. Schwellenwert monatlich vs. kumuliert
2. Auszahlungsmodus: `ALL_ABOVE_THRESHOLD`, `PERCENTAGE`, `FIXED_AMOUNT`
3. Auszahlungszyklus: `MONTHLY`, `QUARTERLY`, `ON_DEMAND`
4. DATEV-Lohnart-Nummer für Auszahlung (Lohnart `1002` ist aktuell für informative Überstunden-Stunden belegt)
5. Mitarbeiter-Gruppen ohne Auszahlung (z.B. Führungskräfte)
6. Wer schließt den Monat (HR manuell / Auto nach N Tagen)
7. Gleitzeitkonto-Obergrenze: existiert als Tariff-Feld `upperLimitAnnual` (§5) — Pro-Di müsste Standard-Wert bestätigen.
