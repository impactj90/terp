---
date: 2026-04-17T15:22:05+02:00
researcher: tolga
git_commit: c9ed7c24153ff78928581bbf5600ae0b44d76dac
branch: staging
repository: terp
topic: "Konfigurierbare Überstunden-Auszahlung — Impact-Map: Anker-Komponenten für die Implementierung"
tags: [research, codebase, overtime, flextime, overtime-payout, employee-override, tariff-form, payroll-wages, monthly-recalculation, close-batch, prodi-prelaunch]
status: complete
last_updated: 2026-04-17
last_updated_by: tolga
---

# Research: Konfigurierbare Überstunden-Auszahlung — Impact-Map

**Date**: 2026-04-17T15:22:05+02:00
**Researcher**: tolga
**Git Commit**: c9ed7c24153ff78928581bbf5600ae0b44d76dac
**Branch**: staging
**Repository**: terp

## Research Question

Das Ticket `thoughts/shared/tickets/prodi-prelaunch/pflicht-03-ueberstunden-auszahlung.md` beschreibt fünf Umsetzungsblöcke (A–E) für eine konfigurierbare Überstunden-Auszahlung (OvertimePayout-Modell, Tarif-Erweiterung, EmployeeOvertimePayoutOverride, Monatsabschluss-Integration, DATEV-Export-Integration, UI, Handbuch). Der Ist-Zustand der Kalkulations-/Flextime-Infrastruktur ist in `thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md` bereits dokumentiert. **Diese Research ergänzt die konkreten Anker-Komponenten** für die Implementierung: das `EmployeeCappingException`-Muster (als Vorlage für den neuen Override), den `DefaultPayrollWage → TenantPayrollWage`-Seed-Pfad, die `recalculateFromMonth`-Kaskade, die heutigen Tarif-Router/Form-Strukturen, die Admin-Monatswerte-Seite und das Fehler-Handling in `closeBatch`. Dokumentation des Ist-Zustands — keine Empfehlungen.

## Summary

Die im Ticket referenzierten Anker-Komponenten existieren sämtlich im Code und tragen durchgängige Muster, an die die neuen Modelle/Services andocken können:

- **Override-Muster**: `EmployeeCappingException` liefert eine komplette Blaupause für ein per-MA-Override-Modell — Prisma-Modell ohne `@@unique`-Deklaration (SQL-Migration enthält das UNIQUE), Service mit `NotFoundError`/`ValidationError`/`ConflictError`-Trio, Repository mit `findDuplicate`, Router mit `applyDataScope()` + `checkRelatedEmployeeDataScope`, `ExceptionFormSheet`-UI als Sheet-basierte Form. Die Einlesung während der Kalkulation (pre-fetched Map für Batch-Pfad, single-fetch für Single-Pfad) ist bereits vorhanden.
- **Seed-Pfad**: `DefaultPayrollWage` wird via `copyDefaultsToTenant` lazy beim ersten `payrollWages.list`-Aufruf in `TenantPayrollWage` gespiegelt — `createMany({ skipDuplicates: true })`-basiert, **ohne Transaktion**, ohne Überschreiben existierender Tenant-Reihen. Neue Defaults werden nur bei ganz neuen Tenants automatisch übernommen; existierende Tenants müssen entweder einen SQL-Backfill (Muster: `20260430000000_datev_surcharge_terpsource_update.sql`) oder einen expliziten `reset`-Call erhalten.
- **Recalc-Kaskade**: `MonthlyCalcService.recalculateFromMonth(employeeId, year, month)` iteriert **sequenziell** von `startYear/startMonth` bis zum aktuellen Kalendermonat, jedes `recalculateMonth` liest `prevMonth.flextimeEnd` frisch aus dem DB-Datensatz, den der vorherige Iterationsschritt gerade geschrieben hat. Geschlossene Monate werden **silent skipped** (`ERR_MONTH_CLOSED` → `skippedMonths++`, weiter), nicht-geschlossene Fehler gehen in `errors[]`. Keine Transaktion umschließt die Kaskade.
- **Tarif-Formular**: Fünf-Tab-Sheet (`basic | schedule | vacation | hours | flextime`) in `TariffFormSheet`. Der **`flextime`-Tab** existiert bereits und enthält `creditType` + vier `DurationInput`-Felder (maxFlextimePerMonth, flextimeThreshold, upperLimitAnnual, lowerLimitAnnual) in einer `section`-Karte. Form-State ist plain `useState<FormState>` — kein `react-hook-form`. Validierung läuft separat in Zod (Router) und einer lokalen `validateForm()`-Funktion. `creditType` hat im Form-State einen Wert `"complete"`, im Zod-Schema `"complete_carryover"` — die Diskrepanz wird über ein `as any` auf der Mutation-Eingabe überbrückt.
- **Admin-Monatswerte-Seite**: Nicht TanStack-Table, sondern plain `<Table>` mit hart-kodierten 9 Spalten. Filter-Toolbar mit 4 Controls (Month/Year-Navigator, Department, Status, Search). `BatchCloseDialog` hat ein 3-Phasen-State-Modell (`confirming → processing → results`) und zeigt Per-Employee-Errors aus `result.errors` an.
- **closeBatch-Errors**: Service-interne `mapWithConcurrency(toClose, 5, ...)` fängt pro-MA-Fehler innerhalb des Callbacks ab und sammelt sie in `errors: Array<{employeeId, reason}>`. Ein geworfener Fehler im Callback **bricht den Batch nicht ab**; `closedCount` wird nur bei Erfolg inkrementiert. Rückgabe-Shape exakt `{closedCount, skippedCount, errorCount, errors}`, am Router unverändert durchgereicht.
- **Employee-Detail-Seite**: 12 Tabs, keine `EmployeeCappingException`-UI auf dieser Seite (die lebt auf `/admin/vacation-config` unter dem `exceptions`-Tab). Der nächste On-Page-Anker ist der `tariff-assignments`-Tab (`TariffAssignmentList` + `EffectiveTariffPreview`), der "Source-Badge"-Muster ("assignment" / "default" / "none") für die "Tarif-Regel wird angewendet vs. Override aktiv"-Anzeige liefert.

## Detailed Findings

### 1. EmployeeCappingException — vollständiges Template für EmployeeOvertimePayoutOverride

#### 1.1 Prisma-Modell

`prisma/schema.prisma:3164-3187`:

- `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `tenantId String @db.Uuid` — FK → `Tenant`, `onDelete: Cascade`
- `employeeId String @db.Uuid` — FK → `Employee`, `onDelete: Cascade`
- `cappingRuleId String @db.Uuid` — FK → `VacationCappingRule`, `onDelete: Cascade`
- `exemptionType String @db.VarChar(20)` — CHECK `IN ('full', 'partial')` nur auf DB-Ebene
- `retainDays Decimal? @db.Decimal(5,2)` — nullable; Pflicht wenn `exemptionType='partial'`
- `year Int?` — nullable; `NULL` = für alle Jahre
- `notes String? @db.Text`
- `isActive Boolean @default(true)`
- `createdAt DateTime @default(now()) @db.Timestamptz(6)`
- `updatedAt DateTime @default(now()) @updatedAt @db.Timestamptz(6)`

Indexes: `@@index([tenantId])`, `@@index([employeeId])`, `@@index([cappingRuleId])`. `@@map("employee_capping_exceptions")`.

**Keine `@@unique`-Deklaration im Prisma-Schema.** Die Unique-Constraint `UNIQUE(employee_id, capping_rule_id, year)` existiert ausschließlich in der SQL-Migration — der Kommentar auf Schema-Zeile 3162 dokumentiert dies explizit ("DB treats NULLs as distinct"). Duplikatprüfung erfolgt im Service via `repo.findDuplicate()`.

Back-Reference auf `Employee`: `cappingExceptions EmployeeCappingException[]` (`prisma/schema.prisma:2014`). Auf `VacationCappingRule`: `employeeCappingExceptions EmployeeCappingException[]` (`prisma/schema.prisma:3097`). Auf `Tenant`: Zeile 164.

#### 1.2 Supabase-Migration

`supabase/migrations/20260101000053_create_employee_capping_exceptions.sql`:

- Z. 5–18: `CREATE TABLE` mit vier `NOT NULL`-FKs (alle `ON DELETE CASCADE`), `exemption_type`-CHECK, `UNIQUE(employee_id, capping_rule_id, year)`.
- Z. 20–23: Vier Indexes (`tenant_id`, `employee_id`, `capping_rule_id`, `(employee_id, year)`).
- Z. 25–28: `update_employee_capping_exceptions_updated_at`-Trigger (ruft geteilte `update_updated_at_column()`-Function).

#### 1.3 Service-Layer

`src/lib/services/employee-capping-exception-service.ts`:

**Error-Klassen** (Z. 19–38):
- `EmployeeCappingExceptionNotFoundError`
- `EmployeeCappingExceptionValidationError`
- `EmployeeCappingExceptionConflictError`

**Funktionen:**
- `list(...)` (Z. 42–53) — delegiert direkt an `repo.findMany`.
- `getById(...)` (Z. 55–65) — wirft NotFound bei null.
- `create(...)` (Z. 67–135) — Fünf-Schritt-Validierung:
  1. `repo.findCappingRule` (FK-Existenz im Tenant)
  2. `retainDays`-Pflicht bei `partial`
  3. `repo.findDuplicate` (Unique-Check)
  4. `retainDays` via `new Prisma.Decimal(value)` schreiben
  5. `year ?? null`, `notes.trim()`
  - Audit-Log mit `action="create"`, `entityType="employee_capping_exception"` (Z. 126–132).
- `update(...)` (Z. 137–203) — **Partial-update-Pattern**:
  - Holt existing → NotFound check
  - Baut `data`-Dict nur für explizit gesetzte Felder (`!== undefined`)
  - **Effective-rule-Validierung**: Merge von `effectiveType`/`effectiveRetainDays` aus neuem Input + existierendem Wert (Z. 172–179)
  - Re-Validierung der Merge-Werte
  - `repo.update` via `tenantScopedUpdate`
  - `auditLog.computeChanges` mit `TRACKED_FIELDS = ["employeeId"]`.
- `remove(...)` (Z. 205–225) — NotFound check, `repo.deleteById`, Audit-Log.

#### 1.4 Repository

`src/lib/services/employee-capping-exception-repository.ts`:

- `findMany` (Z. 10–50) — `where = { tenantId }` + optional `employeeId/cappingRuleId`; bei `year`-Filter wird `OR: [{ year: params.year }, { year: null }]` verwendet (Z. 30–33); `scopeWhere` wird mit Spezialbehandlung für nested `employee`-Objekte gemergt (Z. 35–44); `orderBy: { createdAt: "desc" }`.
- `findById` (Z. 52–60) — `findFirst({ id, tenantId })`.
- `findCappingRule` (Z. 62–70) — FK-Existenz-Check.
- `findDuplicate` (Z. 72–95) — Branching auf `year == null`: entweder `findFirst({ ..., year })` oder `findFirst({ ..., year: null })` (da PostgreSQL zwei NULLs als unterschiedlich betrachtet).
- `create` (Z. 97–111) — passes full data object, accepts `Prisma.Decimal | number | null`.
- `update` (Z. 113–120) — nutzt shared `tenantScopedUpdate` aus `src/lib/services/prisma-helpers.ts`.
- `deleteById` (Z. 122–127) — `deleteMany({ where: { id, employee: { tenantId } } })` — scoped via Employee-Relation.

#### 1.5 tRPC-Router

`src/trpc/routers/employeeCappingExceptions.ts`:

Registriert in `_app.ts` Z. 46 + 154 als Key `employeeCappingExceptions`.

Alle fünf Procedures: `tenantProcedure.use(requirePermission("vacation_config.manage")).use(applyDataScope())`.

| Procedure | Type | Input |
|---|---|---|
| `list` | `.query` | `{ employeeId?, cappingRuleId?, year? }` (alle optional) |
| `getById` | `.query` | `{ id: string }` |
| `create` | `.mutation` | `{ employeeId, cappingRuleId, exemptionType: enum['full','partial'], retainDays?: number >=0, year?: int, notes?: string, isActive?: boolean }` |
| `update` | `.mutation` | `{ id, exemptionType?, retainDays?: number \| null, year?: number \| null, notes?: string \| null, isActive? }` |
| `delete` | `.mutation` | `{ id: string }` |

**Data-Scope-Pattern**:
- `list` ruft `buildRelatedEmployeeDataScopeWhere(dataScope)` und gibt es als `scopeWhere` an `service.list`.
- `getById` fetched das Objekt, dann den Employee separat, dann `checkRelatedEmployeeDataScope(employee, dataScope)` (Z. 173–181).
- `create`/`update`/`delete` fetchen den Employee (bzw. die Exception + Employee) pre-mutation und rufen `checkRelatedEmployeeDataScope`.

**Helper** (Z. 75–100):
- `decimalToNumber(val)` — konvertiert `Prisma.Decimal | null | undefined` → `number | null`.
- `mapToOutput(record)` — mappt Prisma-Record auf typed output, ruft `decimalToNumber` für `retainDays`.

#### 1.6 Kalkulations-Integration

`src/lib/services/vacation-service.ts`:

- Single-Pfad `calculateCappedCarryover` (Z. 65–139): Tarif holen, `vacationCappingRuleGroup` laden (mit Regeln-Relation), `repo.findCappingExceptions(prisma, tenantId, employee.id, prevYear)` (Z. 81–95 in `vacation-repository.ts`, mit `isActive: true` + `OR: [{year}, {year: null}]`).
- Mappt Exceptions auf `CappingExceptionInput[]`, ruft `calculateCarryoverWithCapping`.
- Aufruf-Orte: `carryoverFromPreviousYear` (Z. 553), Batch `batchInitializeYear` (Z. 789).

- Batch-Pre-Fetch (`batchInitializeYear` Z. ~710–815): **Eine** Prisma-Query für alle Mitarbeiter (`findMany({ where: { employeeId: { in: empIds }, employee: { tenantId }, isActive: true, OR: [...] } })`), `Map<employeeId, exception[]>` aufgebaut, an pro-MA-Aufruf übergeben.

- `calculateCarryoverWithCapping` (`carryover-calculation.ts:52-149`): baut `Map<ruleId, exception>` aus dem Array. Branching:
  - `exemptionType === 'full'`: setzt `applied=false`, `exceptionActive=true`, `continue`.
  - `exemptionType === 'partial'` mit `retainDays > capValue`: ersetzt effektives Cap.
  - Sonst: reguläre Regel.

#### 1.7 UI

Einzige UI-Präsenz: `src/components/vacation-config/employee-exceptions-tab.tsx` unter `/admin/vacation-config` (Tab-Wert `exceptions`).

- `EmployeeExceptionsTab` (Z. 83–278): Permission-Guard via `useHasPermission(['absence_types.manage'])` (Note: Router nutzt `vacation_config.manage`), Tabelle mit Spalten Employee/Rule/Year/ExemptionType (color-coded Badge)/RetainDays/Status; Dropdown pro Zeile (Edit öffnet `ExceptionFormSheet`, Delete öffnet `ConfirmDialog`).
- `ExceptionFormSheet` (Z. 289–525): `Sheet` right-side-drawer, `ScrollArea`, drei Field-Groups (Basic/Details/Status). Client-Validierung spiegelt Server-Regeln. `retainDays` erscheint nur bei `exemptionType === 'partial'` (Z. 459).

#### 1.8 Hooks

`src/hooks/use-vacation-config.ts:365-458`:

- `useEmployeeCappingExceptions(options)` (Z. 372) — `useQuery` für `list`.
- `useEmployeeCappingException(id, enabled)` (Z. 393).
- `useCreateEmployeeCappingException()` (Z. 406).
- `useUpdateEmployeeCappingException()` (Z. 425).
- `useDeleteEmployeeCappingException()` (Z. 444).

Alle Mutations invalidieren `list` + `getById` Query-Keys.

Re-export: `src/hooks/index.ts:477-481`.

#### 1.9 Tests

- **Unit (mock Prisma)**: `src/trpc/routers/__tests__/employeeCappingExceptions-router.test.ts` — 14 Tests (list filters, getById, create mit 4 Szenarien inkl. CONFLICT, update mit 3 Szenarien, delete mit 2).
- **Pure Function**: `src/trpc/routers/__tests__/vacation-calculation.test.ts:236-459` — 10 `calculateCarryoverWithCapping`-Tests inkl. full/partial exemption.
- **Integration**: `src/trpc/routers/__tests__/vacation-router.test.ts:168-226` — carryoverPreview mit gemocktem `employeeCappingException.findMany`.
- **Keine E2E-Coverage** für `EmployeeCappingException`.

### 2. DefaultPayrollWage → TenantPayrollWage — Seed-Pfad

#### 2.1 Modelle

`DefaultPayrollWage` (`prisma/schema.prisma:3875-3886`):
- `id UUID`, `code VARCHAR(10) UNIQUE`, `name VARCHAR(200)`, `terpSource VARCHAR(50)`, `category VARCHAR(30)`, `description Text?`, `sortOrder Int @default(0)`, `createdAt Timestamptz`. Keine `updatedAt`/`isActive`.

`TenantPayrollWage` (`prisma/schema.prisma:3888-3906`):
- Gleiche Kernspalten plus: `tenantId UUID FK`, `isActive Boolean @default(true)`, `updatedAt Timestamptz @updatedAt`.
- `@@unique([tenantId, code])`, `@@index([tenantId])`.
- FK-Relation `tenant Tenant` mit `onDelete: Cascade`.

#### 2.2 `copyDefaultsToTenant`

`src/lib/services/payroll-wage-repository.ts:56-90`:

```ts
async function copyDefaultsToTenant(prisma, tenantId): Promise<number>
```

1. Z. 60: `findMany` aller `defaultPayrollWage`-Zeilen.
2. Z. 61: Return 0 wenn leer.
3. Z. 64–68: `findMany` aller `tenantPayrollWage`-Zeilen des Tenants (nur `code` selected), Set bauen.
4. Z. 70–81: Filter Defaults auf codes NOT IN Set; Map mit `tenantId` + `isActive: true`.
5. Z. 83: Return 0 wenn alle existieren.
6. Z. 85–88: `createMany({ data: toInsert, skipDuplicates: true })`.
7. Z. 89: Return `result.count`.

**Keine Transaktion.** Drei separate DB-Round-Trips. `skipDuplicates: true` als einzige Concurrency-Safeguard. **Insert-only** — existierende Tenant-Codes werden nicht überschrieben.

#### 2.3 Service-Schicht

`src/lib/services/payroll-wage-service.ts`:

- `listDefaults(prisma)` (Z. 29–31) — delegiert.
- `listForTenant(prisma, tenantId)` (Z. 33–42) — **Lazy-Init**: ruft `repo.listForTenant`, wenn leer, ruft `repo.copyDefaultsToTenant` + re-query. Kein Audit.
- `initializeForTenant(prisma, tenantId, audit?)` (Z. 44–66) — expliziter Aufruf, Audit bei `inserted > 0`.
- `update(prisma, tenantId, id, input, audit?)` (Z. 68–130) — Code-Validation `/^[A-Za-z0-9]{1,10}$/`, partial update, Audit.
- `reset(prisma, tenantId, audit?)` (Z. 132–157) — `deleteAllForTenant` → `copyDefaultsToTenant` (nicht transaktional umschlossen), Audit.

#### 2.4 Aufrufer

`repo.copyDefaultsToTenant` wird genau dreimal im Service gerufen:
- `listForTenant` (lazy)
- `initializeForTenant`
- `reset` (nach Delete)

`initializeForTenant` wird von **genau einem Produktions-Caller** gerufen: `src/trpc/routers/payrollWages.ts:42` (die `initialize`-Mutation). Daneben Tests.

**Kein Aufruf** aus `tenant-service.ts`, keinem Cron, keinem Bootstrap-Script, keinem Demo-Convert-Flow.

#### 2.5 Seed-Migration

`supabase/migrations/20260417100000_create_export_templates_and_payroll_wages.sql:104-125` — Seed der 20 Default-Rows in `INSERT … ON CONFLICT (code) DO NOTHING`:

Überstunden-relevante Rows:
- `1000 Sollstunden / targetHours / time / sort 10`
- `1001 Iststunden / workedHours / time / sort 20`
- **`1002 Mehrarbeit/Überstunden / overtimeHours / time / sort 30`**
- `1003 Nachtarbeit / nightHours / time / sort 40` (später auf `account:NIGHT` migriert)
- `1004 Sonntagsarbeit / sundayHours / time / sort 50` (später auf `account:SUN`)
- `1005 Feiertagsarbeit / holidayHours / time / sort 60` (später auf `account:HOLIDAY`)

Plus `2000–2005` absence, `2100–2101` compensation, `2200–2204` benefits, `2900` deduction.

**Backfill-Migration-Muster**: `supabase/migrations/20260430000000_datev_surcharge_terpsource_update.sql` zeigt den Pfad zum Backfill existierender Tenants — Block A ändert `default_payroll_wages`, Block B aktualisiert `tenant_payroll_wages` per direktem SQL-UPDATE (matcht alle Tenants).

#### 2.6 tRPC-Router

`src/trpc/routers/payrollWages.ts`:

Registriert in `_app.ts:213` als `payrollWages`. Alle Procedures `tenantProcedure`:

| Procedure | Permission | Service |
|---|---|---|
| `listDefaults` (query) | `personnel.payroll_data.view` | `listDefaults(ctx.prisma)` |
| `list` (query) | `personnel.payroll_data.view` | `listForTenant(ctx.prisma, ctx.tenantId!)` |
| `initialize` (mutation) | `personnel.payroll_data.edit` | `initializeForTenant(...)` |
| `update` (mutation) | `personnel.payroll_data.edit` | `update(...)` |
| `reset` (mutation) | `personnel.payroll_data.edit` | `reset(...)` |

#### 2.7 UI-Seite

`src/app/[locale]/(dashboard)/admin/payroll-wages/page.tsx`:

- `'use client'`, kein expliziter Init-Trigger — `usePayrollWages(true)` (Z. 33) löst `list` aus, Lazy-Init kümmert sich.
- Hooks: `usePayrollWages`, `useUpdatePayrollWage`, `useResetPayrollWages`.
- Tabelle mit inline `Input` für `code` + `name`, display-only `terpSource` + `category`, Switch für `isActive`, Save-Button pro Row bei `dirty`.
- `"Auf Defaults zurücksetzen"`-Button (Z. 71, `data-testid="payroll-wages-reset"`) mit `confirm()`-Dialog + `resetMutation.mutateAsync()`.

Sidebar: `src/components/layout/sidebar/sidebar-nav-config.ts:631` unter `/admin/payroll-wages`, Permission `personnel.payroll_data.view`.

#### 2.8 Hooks

`src/hooks/use-payroll-wages.ts`:
- `usePayrollWages(enabled)` (Z. 4) — query
- `useDefaultPayrollWages(enabled)` (Z. 11) — query
- `useInitializePayrollWages()` (Z. 18) — mutation, invalidiert `list`
- `useUpdatePayrollWage()` (Z. 31) — mutation, invalidiert `list`
- `useResetPayrollWages()` (Z. 44) — mutation, invalidiert `list`

#### 2.9 Tests

- Unit: `src/trpc/routers/__tests__/payrollWages.test.ts` — alle Procedures mit `vi.mock`.
- Integration: `src/lib/services/__tests__/payroll-wage-service.integration.test.ts` — Fixed Test-Tenant UUID `f0000000-0000-4000-a000-000000000602`; testet lazy init, Idempotenz, `update`, Validation, `reset` mit `"Sollstunden"`-Restore-Check.
- E2E: `src/e2e-browser/62-export-templates.spec.ts:213-263`, Step 7.

### 3. `recalculateFromMonth` und Monatsabschluss-Kaskade

#### 3.1 `MonthlyCalcService`-Konstruktor

`src/lib/services/monthly-calc.ts:54`:

```ts
constructor(private prisma: PrismaClient, private tenantId: string)
```

`tenantId` ist am Instance fixiert, wird in alle Prisma-Queries hineingereicht.

#### 3.2 `recalculateMonth` — der atomare per-Monat-Kernel

`src/lib/services/monthly-calc.ts:277-372`:

```ts
async recalculateMonth(
  employeeId: string,
  year: number,
  month: number,
  prefetchedEmployee?: Employee | null
): Promise<void>
```

1. `validateYearMonth(year, month)` (Z. 283) — wirft `ERR_INVALID_YEAR_MONTH`/`ERR_INVALID_MONTH`.
2. Employee-Fetch (Z. 287–293) oder pre-fetched. `tenantId`-scoped. Wirft `ERR_EMPLOYEE_NOT_FOUND`.
3. `getPreviousMonth(employeeId, year, month)` (Z. 299–300). `previousCarryover = prevMonth?.flextimeEnd ?? 0`.
4. `Promise.all` lädt `DailyValue[]`, `AbsenceDay[]` (mit `absenceType`-include), `Tariff` — alle `tenantId`-scoped (Z. 307–324).
5. Pure `calculateMonth(calcInput)` aus `src/lib/calculation/monthly.ts:112`.
6. **Atomic-Upsert** (Z. 341–371):
   ```ts
   const updateResult = await this.prisma.monthlyValue.updateMany({
     where: { employeeId, year, month, isClosed: false, tenantId: this.tenantId },
     data: { ...monthlyData },
   })
   if (updateResult.count === 0) {
     const existing = await this.getByEmployeeMonth(...)
     if (existing !== null && existing.isClosed) throw new Error(ERR_MONTH_CLOSED)
     await this.prisma.monthlyValue.create({ data: { ... } })
   }
   ```
   - Felder `isClosed`, `closedAt`, `closedBy`, `reopenedAt`, `reopenedBy` sind bewusst aus `monthlyData` ausgeschlossen (Kommentar Z. 351).
   - **Keine Umschließung in `$transaction`**.

#### 3.3 `recalculateFromMonth` — Kaskade

`src/lib/services/monthly-calc.ts:162-216`:

```ts
async recalculateFromMonth(
  employeeId: string,
  startYear: number,
  startMonth: number
): Promise<MonthlyCalcResult>
```

Loop-Logik (Z. 178–213):
- Terminierung: stoppt wenn `currentYear > now.getFullYear()` oder `currentYear === now.getFullYear() && currentMonth > now.getMonth() + 1` (Z. 180–185). **Obergrenze ist der aktuelle Kalendermonat** (inkl.), nicht der letzte vollendete Monat.
- `this.recalculateMonth(employeeId, currentYear, currentMonth)` pro Iteration.
- `ERR_MONTH_CLOSED` → `skippedMonths++`, **weiter** (Z. 192–194).
- Anderer Fehler → `failedMonths++`, push in `errors[]`, **weiter** (Z. 195–204).
- `currentMonth++`, Year-Rollover (Z. 207–212).

**Keine umschließende Transaktion.** Jeder `recalculateMonth`-Call ist unabhängig.

#### 3.4 Carryover-Link

Der Link `flextimeEnd` von Monat N → `flextimeStart` von Monat N+1 liegt in `recalculateMonth:299-300`:

```ts
const prevMonth = await this.getPreviousMonth(employeeId, year, month)
const previousCarryover = prevMonth !== null ? prevMonth.flextimeEnd : 0
```

`getPreviousMonth` (Z. 526–538) handled Jan→Dez-Übergang, ruft `getByEmployeeMonth` (`findUnique({ where: { employeeId_year_month } })`).

`previousCarryover` fließt durch `buildMonthlyCalcInput` (Z. 650) als `input.previousCarryover` in die pure `calculateMonth`, wo `output.flextimeStart = input.previousCarryover` gesetzt wird (`src/lib/calculation/monthly.ts:120`).

Beim Schreiben setzt `buildMonthlyValue` (Z. 721–754): `flextimeCarryover: output.flextimeEnd` — diese Zahl wird vom Folgemonat als `prevMonth.flextimeEnd` gelesen.

**Sequenzielle Reihenfolge** im Loop (`for` mit `await`) sichert, dass jeder Monat den frisch geschriebenen Wert des Vormonats sieht.

#### 3.5 Batch-Kaskade

`recalculateFromMonthBatch` (Z. 222–247) ruft `recalculateFromMonth` pro Employee via `mapWithConcurrency(employeeIds, 5, ...)`. **5 Employees parallel**, Monate pro Employee sequenziell. Aggregiert Counters + concatenates `errors[]`.

#### 3.6 `monthly-values-service.recalculate` — externer Wrapper

`src/lib/services/monthly-values-service.ts:411-470`:

```ts
async function recalculate(prisma, tenantId, input: { year, month, employeeId? }, dataScope?)
```

- Mit `employeeId`: Data-Scope-Check für diesen einzelnen Employee (Z. 427–439), dann `employeeIds = [employeeId]`.
- Ohne `employeeId`: `repo.findActiveEmployeeIds(prisma, tenantId)` (Z. 442), optional gefiltert durch `dataScope` (Z. 444–456).
- `new MonthlyCalcService(prisma, tenantId).calculateMonthBatch(employeeIds, year, month)` (Z. 459–464).

**Wichtig**: Dieser Wrapper ruft `calculateMonthBatch` (Einzelmonat), **nicht** `recalculateFromMonthBatch`. Es kaskadiert nicht.

#### 3.7 Concurrency-Handling

- **Keine DB-Locks**, keine `$transaction`-Isolation.
- `isClosed: false`-Guard auf `updateMany` ist der einzige Race-Safeguard.
- `closeMonth` und `recalculateMonth` nutzen denselben Guard — kollidieren sie, gewinnt der Close; der Recalc bekommt `ERR_MONTH_CLOSED`.
- `reopenMonth` nutzt inverse Guard: `updateMany({ where: { isClosed: true } })`.
- `mapWithConcurrency(..., 5, ...)` in `src/lib/async.ts:5-26` begrenzt parallele Employee-Verarbeitung; Workers teilen `nextIndex`-Counter.
- Single-Employee-Kaskade ist sequenziell (erforderlich für Carryover-Korrektheit).

#### 3.8 Externe Trigger

- **Cron** `src/app/api/cron/calculate-months/route.ts` — 2. des Monats, 03:00 UTC, `CRON_SECRET`-gated. Ruft `calculateMonthBatch` **pro Tenant seriell**. Checkpoint-basiert. **Einzelmonat**, nicht Kaskade.
- **Correction-Approval** `src/lib/services/correction-service.ts:331-337` → `RecalcService.triggerRecalc` (`src/lib/services/recalc.ts:42-75`) → `calculateDay` + `calculateMonth` für den Korrektur-Monat. Einzelmonat.
- **tRPC `monthlyValues.recalculate`** (`src/trpc/routers/monthlyValues.ts:620-643`) — Permission `booking_overview.calculate_month`, Data-Scope, Single-Month.
- **Absence-Service** (`src/lib/services/absences-service.ts:527-537` etc.) — Auto-approve/update/delete/approve/reject/cancel → `triggerRecalc` für einzelne Tage → Single-Month-Calc.
- **Employee-Tariff-Assignment-Changes** (`src/lib/services/employee-tariff-assignment-service.ts:87-138`) — `triggerRecalcRange` für ±14 Tage (nur Daily-Calc, kein Monthly-Recalc im Range-Pfad).

**Keiner dieser externen Trigger ruft `recalculateFromMonth` oder `recalculateFromMonthBatch`.** Diese Funktionen existieren als öffentliche API-Oberfläche, werden aber im aktuellen Codebase nicht von Produktionspfaden aufgerufen (Grep-Ergebnis).

### 4. Tarif-Router, -Service, -Form

#### 4.1 Router

`src/trpc/routers/tariffs.ts`:

- `TARIFFS_MANAGE = permissionIdByKey("tariffs.manage")!` (Z. 28). Jede Procedure nutzt `.use(requirePermission(TARIFFS_MANAGE))`.
- Enum-Konstanten (Z. 32–40):
  - `RHYTHM_TYPES = ["weekly", "rolling_weekly", "x_days"]`
  - `VACATION_BASES = ["calendar_year", "entry_date"]`
  - `CREDIT_TYPES = ["no_evaluation", "complete_carryover", "after_threshold", "no_carryover"]`
  - `BREAK_TYPES = ["fixed", "variable", "minimum"]`

Procedures:
- `list` (`.query`), `getById` (`.query`), `create` (`.mutation`), `update` (`.mutation`), `delete` (`.mutation`), `createBreak` (`.mutation`), `deleteBreak` (`.mutation`).

**Flextime-Felder im Zod-Schema:**

`createTariffInputSchema` (Z. 155–159) — alle fünf **optional**:
```ts
maxFlextimePerMonth: z.number().int().min(-8784).max(8784).optional()
upperLimitAnnual:    z.number().int().min(-8784).max(8784).optional()
lowerLimitAnnual:    z.number().int().min(-8784).max(8784).optional()
flextimeThreshold:   z.number().int().min(-8784).max(8784).optional()
creditType:          z.enum(CREDIT_TYPES).optional()
```

`updateTariffInputSchema` (Z. 196–200) — **nullable + optional**:
```ts
maxFlextimePerMonth: z.number().int().min(-8784).max(8784).nullable().optional()
// ...analog
creditType: z.enum(CREDIT_TYPES).nullable().optional()
```

`code` ist **nur im create-Schema**; Kommentar Z. 178 "Code is NOT updatable".

**Keine `.refine()`/`.superRefine()`-Cross-Field-Validation**. Rhythm-Cross-Field-Regeln leben im Service (`validateRhythmForCreate`/`validateRhythmForUpdate`).

`mapToOutput` (Z. 244–358): konvertiert `Decimal`-Felder via `decimalToNumber`; Flextime-Integers direkt als `number | null` (Z. 280–284).

#### 4.2 Service

`src/lib/services/tariffs-service.ts`:

Error-Klassen (Z. 24–50): `TariffNotFoundError`, `TariffValidationError`, `TariffConflictError`, `TariffBreakNotFoundError`.

- `list` (Z. 59) — delegiert.
- `getById` (Z. 63–72) — wirft NotFound.
- `create` (Z. 74–210) — `code.trim()`, `findByCode`-Uniqueness-Check, default `rhythmType="weekly"` (Z. 125), `validateRhythmForCreate`, `repo.createTariffWithSubRecords`, re-fetch.
- `update` (Z. 212–414) — verify, partial-update-data (nur `!== undefined`), `validateRhythmForUpdate`, `repo.updateTariffWithSubRecords`, re-fetch.
- `remove` (Z. 416–460) — blockiert wenn `countEmployeeTariffAssignments`/`countEmployeesByTariff > 0`.
- `createBreak` (Z. 469–517), `deleteBreak` (Z. 519–554).

Flextime-Update (Z. 366–380): Jedes der fünf Felder unabhängig `if (input.X !== undefined)` → direkt in Prisma-Data (kein `Decimal`-Wrapping, da Integer).

Audit: `TRACKED_FIELDS = ["name", "code", "isActive"]` (Z. 16–20). `auditLog.computeChanges` auf diesen drei.

#### 4.3 Repository

`src/lib/services/tariffs-repository.ts`:

- `tariffListInclude` (Z. 11–22): nur `weekPlan { id, code, name }`.
- `tariffDetailInclude` (Z. 23–32): `weekPlan`, `breaks` (sorted by `sortOrder`), `tariffWeekPlans` (mit nested `weekPlan`), `tariffDayPlans` (mit nested `dayPlan`, sorted by `dayPosition`).

#### 4.4 UI-Seite

`src/app/[locale]/(dashboard)/admin/tariffs/page.tsx` — einziges File im Directory. `'use client'`, `adminTariffs` next-intl namespace. Rendert vier Sheet-/Dialog-Komponenten:

- `TariffFormSheet` — create/edit
- `TariffDetailSheet` — read-only
- `CopyTariffDialog` — clone
- `ConfirmDialog` — delete confirmation

Plus `TariffDataTable`, `SearchInput`, `Select` (active/inactive filter).

#### 4.5 Form-Komponente `TariffFormSheet`

`src/components/tariffs/tariff-form-sheet.tsx`:

- **Keine Form-Library** (kein react-hook-form). Plain `React.useState<FormState>` (Z. 150).
- `FormState` (Z. 52–89) umfasst 5 Gruppen: Basic, WeekPlan, Rhythm, Vacation, TargetHours, Flextime.

**`creditType`-Mismatch** (Z. 88, 322, 829):
- FormState deklariert `creditType: 'no_evaluation' | 'complete' | 'after_threshold' | 'no_carryover'`.
- Router-Enum: `"complete_carryover"` (nicht `"complete"`).
- SelectItem (Z. 829): `value="complete"`.
- Mutation-Call (Z. 322): `as any`-Cast umgeht die Typ-Prüfung.

**Tab-Struktur** (Z. 359–366):

| `value` | i18n-Key | Felder |
|---|---|---|
| `basic` | `tabBasic` | code, name, description, isActive (edit) |
| `schedule` | `tabSchedule` | rhythmType, weekPlanId/weekPlanIds/dayPlans, rhythmStartDate, validFrom, validTo |
| `vacation` | `tabVacation` | annualVacationDays, workDaysPerWeek, vacationBasis, vacationCappingRuleGroupId |
| `hours` | `tabTargetHours` | daily/weekly/monthly/annualTargetHours |
| **`flextime`** | **`tabFlextime`** | **creditType, maxFlextimePerMonth, flextimeThreshold, upperLimitAnnual, lowerLimitAnnual** |

**Flextime-Tab JSX** (Z. 808–893):

Beschreibungs-Paragraph → Standalone `Select` für `creditType` (Z. 813–834) → gerahmte Card (`<div className="border rounded-lg p-4 space-y-4">`) mit Heading `sectionAccountLimits` (Z. 837–893), zwei `grid grid-cols-2 gap-4`-Zeilen:
- Zeile 1: `maxFlextimePerMonth` + `flextimeThreshold`
- Zeile 2: `upperLimitAnnual` + `lowerLimitAnnual`

Jedes Feld: `<DurationInput format="hhmm" />`. Kein `Switch` im Flextime-Tab.

**`DurationInput`** (`src/components/ui/duration-input.tsx`):
- `value` in Minuten (int), `onChange(value|null)`.
- `format="hhmm"` rendert `<Input type="text">`; parsing `H:MM` → `h*60+m`. Blank → `null`.

**Submit-Handler** (Z. 322): `updateMutation.mutateAsync(... as any)`. Bei Erfolg: `generateFromTariff.mutate({ overwriteTariffSource: true })` (Z. 333) — regeneriert Employee-DayPlans.

#### 4.6 Hooks

`src/hooks/use-tariffs.ts`:

| Hook | Type | Invalidation |
|---|---|---|
| `useTariffs({ isActive?, enabled? })` | query | — |
| `useTariff(id, enabled?)` | query | — |
| `useCreateTariff()` | mutation | `list` + `getById` |
| `useUpdateTariff()` | mutation | `list` + `getById` + `invalidateTimeData()` |
| `useDeleteTariff()` | mutation | `list` + `getById` + `invalidateTimeData()` |
| `useCreateTariffBreak()` | mutation | same |
| `useDeleteTariffBreak()` | mutation | same |

Re-export: `src/hooks/index.ts:226-232`.

#### 4.7 i18n

`messages/de.json` und `messages/en.json` jeweils ab Z. 1922: Namespace `"adminTariffs"` mit ~170 Keys.

Flextime-spezifische Keys (ab Z. 2046):
```
flextimeTabDescription
fieldCreditType
creditNoEvaluation / creditComplete / creditAfterThreshold / creditNoCarryover
creditTypeHelp
sectionAccountLimits
fieldMaxFlextimePerMonth / maxFlextimeHelp
fieldFlextimeThreshold / flextimeThresholdHelp
fieldUpperLimitAnnual / upperLimitHelp
fieldLowerLimitAnnual / lowerLimitHelp
```

### 5. Admin-Monatswerte-Seite + BatchCloseDialog

#### 5.1 Page-Struktur

`src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx`:

- `'use client'`, permission-gated via `useHasPermission(['reports.view'])` (Z. 30), redirect zu `/dashboard` bei Denial (Z. 51–55), `<MonthlyValuesSkeleton />` während loading.
- Filter-State: `year`, `month`, `departmentId`, `statusFilter` (`'all'|'open'|'calculated'|'closed'|'exported'`), `search`.
- Hooks: `useAdminMonthlyValues({ year, month, departmentId, status })`, `useDepartments`.

**Enrichment** (Z. 81–109): mappt `mvData.items` auf `MonthlyValueRow[]`. `absence_days = vacationTaken + sickDays + otherAbsenceDays` (Z. 103).

**Client-Filter** (Z. 112–133): Status-Refinement für `'open'`/`'calculated'` (Server gibt kombinierten Set zurück); Search case-insensitive auf `employee_name` + `personnel_number`.

#### 5.2 Tabelle

`src/components/monthly-values/monthly-values-data-table.tsx` — **kein TanStack-Table**, plain `<Table>` mit hart-kodierten Spalten:

| Pos | Header | Feld | Renderer |
|---|---|---|---|
| 1 | (width-10) | — | `<Checkbox>` |
| 2 | `table.employee` | `employee_name` | plain text, `font-medium` |
| 3 | `table.personnelNumber` | `personnel_number` | `font-mono text-sm` |
| 4 | `table.status` | `status` | `getStatusBadge()` |
| 5 | `table.target` | `target_minutes` | `<TimeDisplay format="duration">` |
| 6 | `table.net` | `net_minutes` | `<TimeDisplay format="duration">` |
| 7 | `table.overtime` | `overtime_minutes` | `<TimeDisplay format="duration">` |
| 8 | `table.balance` | `balance_minutes` | `<TimeDisplay format="balance">` |
| 9 | `table.absenceDays` | `absence_days` | raw number |

`getStatusBadge` (Z. 45–66): `open→outline`, `calculated→secondary`, `closed→default + bg-green-600`, `exported→default + bg-blue-600`.

**Keine Sortierung**; Table zeigt Rows in Server-Order.

**Row-Click** öffnet Detail-Sheet. Checkbox-Cell `stopPropagation()` (Z. 109).

#### 5.3 Filter-Toolbar

`src/components/monthly-values/monthly-values-toolbar.tsx` — rein präsentational, alle State-Props von Page:

4 Controls in `md:grid-cols-4`:
1. **Month/Year-Navigator**: `ChevronLeft`/`ChevronRight`-Buttons, `navigatePrevious`/`navigateNext` (Z. 59–74) mit Jahres-Rollover.
2. **Department** (Z. 104–120): Select mit `'all'`-Option (→ `onDepartmentChange(null)`).
3. **Status** (Z. 122–134): Select mit `all | open | calculated | closed | exported`.
4. **Search** (Z. 136–145): Text-Input mit Search-Icon.

**Clear-Button** (Z. 148–155): nur bei `hasFilters`.

#### 5.4 BatchCloseDialog

`src/components/monthly-values/batch-close-dialog.tsx`:

**Props**: `open`, `onOpenChange`, `year`, `month`, `monthLabel`, `selectedIds`, `selectedEmployeeIds`, `departmentId`, `departmentName`.

**State**: `recalculate: boolean` (default true), `state: 'confirming'|'processing'|'results'`, `result: BatchCloseResult | null`, `error: string | null`.

**Mutation**: `useCloseMonthBatch()` → `trpc.monthlyValues.closeBatch`.

**3-Phasen-Flow**:
- `confirming` (initial): Info-Panel, Recalculate-Checkbox, Cancel + Confirm (disabled bei `isPending`).
- `processing` (vor `await`): Spinner, `<Sheet onOpenChange={undefined}>` (nicht dismissbar, Z. 109).
- `results` (nach `resolve`): Breakdown + Done-Button.

**Error-Handling** (Z. 72–96):
- `setState('processing')` synchron vor `await mutateAsync`.
- Mutation-Input: `{ year, month, recalculate, employeeIds? (>0), departmentId? (non-null) }`.
- Bei Throw: `catch` extrahiert `apiError.detail ?? apiError.message ?? 'Failed…'`, setzt `error`, revertiert zu `confirming`. Alert in ScrollArea (Z. 123–127).
- **Per-Employee-Errors** werfen nicht — sie stehen im `result.errors`-Array.

**Results-Display** (Z. 162–209):
- `closedCount > 0` → `<CheckCircle2>` grün
- `skippedCount > 0` → `<AlertTriangle>` gelb
- `errorCount > 0` → `<XCircle>` rot
- `result.errors` wird als expandierbare Liste `<employeeId mono>: <reason>` gerendert (Z. 201–203).

#### 5.5 BatchReopenDialog

`src/components/monthly-values/batch-reopen-dialog.tsx`:

Im Gegensatz zum Close: **sequenzielle individuelle Mutations** (`for...of`-Loop Z. 79–91), `reopenMutation.mutateAsync({ id })` pro Item, Progress-Bar via `setProgress`. Errors pro-Item in lokales Array gesammelt.

Reason-Text (Client-Pflicht ≥10 Zeichen, Z. 67–69) wird **nicht** an die Mutation gesendet — der `reopen`-Router-Input akzeptiert nur `{id}` oder `{employeeId, year, month}`.

#### 5.6 RecalculateDialog

`src/components/monthly-values/recalculate-dialog.tsx`:

Keine Phasen — nutzt `recalculateMutation.isPending` direkt. Success-Message-Auto-Close nach 2s (Z. 58–60). Nutzt `<Dialog>` (nicht `<Sheet>`).

#### 5.7 `closeBatch`-Service-Logik

`src/lib/services/monthly-values-service.ts:283-409`:

Signature: `closeBatch(prisma, tenantId, input, userId, dataScope?, audit?)`.

**Employee-Resolution** (Z. 299–327):
1. `input.employeeIds` falls vorhanden.
2. Sonst `repo.findActiveEmployeeIds(prisma, tenantId, input.departmentId)`.
3. `dataScope`-Filter (Z. 310–326): `prisma.employee.findMany` mit `departmentId: { in: ... }` oder `id: { in: ... }`.

**Calculation-Phase** (Z. 330–356):
1. Falls `recalculate` true: `monthlyCalcService.calculateMonthBatch(employeeIds, year, month)` (Z. 333).
2. Batch-Query aller existierenden `MonthlyValue`-Rows → `Map<employeeId, MonthlyValue>` (Z. 337–344).
3. Fehlende Employees unconditionally nachkalkulieren (Z. 347–356).

**Partitioning** (Z. 359–370):
- `mv.isClosed === true` → `skippedCount++`
- Sonst → `toClose[]`

**Close-Phase** (Z. 372–401):

```ts
await mapWithConcurrency(toClose, 5, async (empId) => {
  try {
    await monthlyCalcService.closeMonth(empId, year, month, userId)
    closedCount++
    if (audit) auditLog.log(prisma, { action: "close", entityType: "monthly_values", ... })
      .catch(err => console.error(err))
  } catch (err) {
    errors.push({ employeeId: empId, reason: err.message ?? String(err) })
  }
})
```

**`mapWithConcurrency`** (`src/lib/async.ts:5-26`): `Math.min(concurrency, items.length)` Worker, jeder pullt aus shared `nextIndex`, `Promise.all(workers)`. Kein Short-Circuit bei Throw.

**Ein Throw im Callback bricht den Batch NICHT ab** — er wird vom internen try/catch abgefangen, in `errors[]` akkumuliert, und der Worker zieht das nächste Item.

**Return-Shape** (Z. 403–408):
```ts
{
  closedCount: number,
  skippedCount: number,
  errorCount: number,  // = errors.length
  errors: Array<{ employeeId: string, reason: string }>
}
```

Der tRPC-Router (`src/trpc/routers/monthlyValues.ts:579-597`) hat ein exakt passendes Zod-Output-Schema und returned unverändert.

### 6. Employee-Detail-Seite + Override-Muster

#### 6.1 Tab-Struktur

`src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` — 12 Tabs (je nach Permissions):

| Tab | Visibility |
|---|---|
| `overview` | always |
| `tariff-assignments` | always |
| `tax-sv`, `bank`, `compensation`, `family`, `benefits`, `disability`, `special-cases` | `personnel.payroll_data.view` |
| `foreign-assignments` | `personnel.foreign_assignment.view` |
| `garnishments` | `personnel.garnishment.view` |
| `personnel-file` | always |

#### 6.2 Overview-Tab

Vier `<Card>`-Komponenten (`grid-cols-1 md:grid-cols-2`): Kontakt, Beschäftigung (zeigt `employee.tariff?.name` read-only), Vertrag, Zutrittskarten. Reine Display, keine Inline-Edits.

#### 6.3 Tariff-Assignments-Tab

Zwei Komponenten stacked:

1. **`<TariffAssignmentList>`** (`src/components/employees/tariff-assignments/tariff-assignment-list.tsx`):
   - Heading "Tarifzuweisungen".
   - `<AssignmentCard>`-Rows mit Tariff, Date-Range, `overwriteBehavior`-Badge, `isActive`-Badge, "Aktuell"-Badge.
   - All/Active/Inactive-Filter + Add-Button.
   - Aktueller Assignment: `border-l-4 border-l-primary bg-primary/5` (Z. 154–155, 161).

2. **`<EffectiveTariffPreview>`** (`src/components/employees/tariff-assignments/effective-tariff-preview.tsx`):
   - Heading "Effektiver Tarif".
   - Date-Picker, resolved Tariff-Name, Source-Badge.
   - tRPC `employeeTariffAssignments.effective` returned `{ tariffId, tariffLabel, source: 'assignment'|'default'|'none', assignmentId }` (Router Z. 52–57).

**Source-Badge-Muster** (Z. 36–41):
- `source='assignment'` → `<Badge variant="default">` (filled).
- `source='default'` → `<Badge variant="secondary">` (muted).
- `source='none'` → `<Badge variant="outline">`.

Labels: `sourceAssignment`/`sourceDefault`/`sourceNone`.

Router-Resolution (`src/trpc/routers/employeeTariffAssignments.ts:403-444`):
1. Active `EmployeeTariffAssignment` in Date-Range → `source: "assignment"`.
2. Fallback `employee.tariffId` → `source: "default"`.
3. Nichts → `source: "none", tariffId: null`.

#### 6.4 Payroll-Tabs — Read/Edit-Toggle-Muster

Alle payroll-gegateten Tabs (`TaxSocialSecurityTab`, `CompensationTab`, etc.) nutzen:
- Lokales `editing: boolean`.
- Read: CardHeader mit "Bearbeiten"-Button (`variant="outline" size="sm"`, gated by `canEdit`). Field-Values in `<p>` via lokalem `<Field>`-Helper (zeigt `'---'` bei null).
- Edit: Cancel + Save-Buttons. Fields als `<Input>`/`<Select>`.
- Save → `useUpdateEmployee().mutateAsync({ id, ...fields })`, `setEditing(false)`.

**Kein "Reset to Default"-Konzept** — Fields sind nullable.

#### 6.5 Shared Building-Blocks

**Kein `SettingsCard`/`OverrideCard`** existiert. Patterns:

- **`<ConfirmDialog>`** (`src/components/ui/confirm-dialog.tsx`): Wrapper um `<Sheet side="bottom">`. Props `title`, `description`, `confirmLabel`, `variant ('default'|'destructive')`, `isLoading`, `onConfirm`. Genutzt für Employee-Delete (page.tsx:316), Assignment-Delete (`tariff-assignment-delete-dialog.tsx:59`), Exception-Delete (`employee-exceptions-tab.tsx:266`).

- **`<Sheet>` + `ScrollArea` + `SheetFooter`-Pattern**: Jede Edit-Form ist Right-Side-Sheet (`side="right"`, `sm:max-w-lg flex flex-col`). `<ScrollArea className="flex-1 -mx-6 px-6">` für Body. Footer mit Cancel + Submit-Buttons (`flex-1` für gleiche Breite). Vorkommen:
  - `tariff-assignment-form-sheet.tsx:196-379`
  - `employee-exceptions-tab.tsx:369-524` (ExceptionFormSheet)

- **`<Card>` + `<CardContent className="pt-6">`**: direkte Nutzung, kein abstrahierter Wrapper.

#### 6.6 tRPC-Hooks für Tariff-Assignments

`src/hooks/use-employee-tariff-assignments.ts`:

| Hook | tRPC-Procedure |
|---|---|
| `useEmployeeTariffAssignments(employeeId, options)` | `list` query |
| `useEffectiveTariff(employeeId, date)` | `effective` query |
| `useCreateEmployeeTariffAssignment()` | `create` mutation |
| `useUpdateEmployeeTariffAssignment()` | `update` mutation |
| `useDeleteEmployeeTariffAssignment()` | `delete` mutation |
| `useTariffs()` | `tariffs.list` query (Dropdown-Datenquelle) |

Alle Mutations invalidieren `employeeTariffAssignments.list`, `employeeTariffAssignments.effective`, `employees.list`, `employees.getById` (Z. 93–105, 127–139, 159–171).

#### 6.7 Keine EmployeeCappingException-UI auf Employee-Detail-Seite

Die `EmployeeCappingException`-UI lebt ausschließlich auf `/admin/vacation-config` im `exceptions`-Tab (`EmployeeExceptionsTab` in `employee-exceptions-tab.tsx`). Auf der Employee-Detail-Seite gibt es keinen Card für per-MA-Exceptions.

## Code References

### Override-Template (EmployeeCappingException)
- `prisma/schema.prisma:3164-3187` — Model
- `supabase/migrations/20260101000053_create_employee_capping_exceptions.sql` — DDL + UNIQUE
- `src/lib/services/employee-capping-exception-service.ts:19-38` — Error-Klassen
- `src/lib/services/employee-capping-exception-service.ts:67-135` — `create` Full
- `src/lib/services/employee-capping-exception-service.ts:137-203` — `update` Partial + Effective-Rule-Merge
- `src/lib/services/employee-capping-exception-repository.ts:72-95` — `findDuplicate` mit Null-Year-Branching
- `src/lib/services/employee-capping-exception-repository.ts:122-127` — `deleteById` via Employee-Relation-Scope
- `src/trpc/routers/employeeCappingExceptions.ts:54-100` — Input-Schemas + Helpers
- `src/trpc/routers/employeeCappingExceptions.ts:114-310` — Procedures mit `applyDataScope` + `checkRelatedEmployeeDataScope`
- `src/components/vacation-config/employee-exceptions-tab.tsx:83-278` — Tabellen-UI
- `src/components/vacation-config/employee-exceptions-tab.tsx:289-525` — `ExceptionFormSheet`
- `src/hooks/use-vacation-config.ts:365-458` — fünf Hooks
- `src/lib/services/vacation-service.ts:65-139` — `calculateCappedCarryover` (Single-Pfad-Konsumtion)
- `src/lib/services/vacation-service.ts:710-815` — `batchInitializeYear` (Batch-Pre-Fetch-Muster)
- `src/lib/calculation/carryover-calculation.ts:52-149` — `calculateCarryoverWithCapping` (Effektive-Regel)
- `src/trpc/routers/__tests__/employeeCappingExceptions-router.test.ts` — 14 Router-Tests

### Payroll-Wage-Seed-Pfad
- `prisma/schema.prisma:3875-3886` — `DefaultPayrollWage`
- `prisma/schema.prisma:3888-3906` — `TenantPayrollWage`
- `src/lib/services/payroll-wage-repository.ts:56-90` — `copyDefaultsToTenant`
- `src/lib/services/payroll-wage-service.ts:33-42` — `listForTenant` Lazy-Init
- `src/lib/services/payroll-wage-service.ts:44-66` — `initializeForTenant`
- `src/lib/services/payroll-wage-service.ts:132-157` — `reset`
- `src/trpc/routers/payrollWages.ts` — Router
- `src/app/[locale]/(dashboard)/admin/payroll-wages/page.tsx` — UI
- `src/hooks/use-payroll-wages.ts` — Hooks
- `supabase/migrations/20260417100000_create_export_templates_and_payroll_wages.sql:104-125` — 20-Row-Seed
- `supabase/migrations/20260430000000_datev_surcharge_terpsource_update.sql` — Backfill-Migration-Muster

### Recalc-Kaskade
- `src/lib/services/monthly-calc.ts:54` — Konstruktor
- `src/lib/services/monthly-calc.ts:65-89` — `calculateMonth`
- `src/lib/services/monthly-calc.ts:95-156` — `calculateMonthBatch`
- `src/lib/services/monthly-calc.ts:162-216` — **`recalculateFromMonth`**
- `src/lib/services/monthly-calc.ts:222-247` — `recalculateFromMonthBatch`
- `src/lib/services/monthly-calc.ts:277-372` — `recalculateMonth`
- `src/lib/services/monthly-calc.ts:299-300` — Carryover-Link
- `src/lib/services/monthly-calc.ts:341-371` — Atomic-Upsert-Pattern
- `src/lib/services/monthly-calc.ts:526-538` — `getPreviousMonth`
- `src/lib/services/monthly-values-service.ts:411-470` — Service-Wrapper `recalculate`
- `src/lib/services/recalc.ts:42-75` — `RecalcService.triggerRecalc`
- `src/lib/async.ts:5-26` — `mapWithConcurrency`

### Tarif-Form
- `src/trpc/routers/tariffs.ts:28` — Permission
- `src/trpc/routers/tariffs.ts:32-40` — Enum-Konstanten
- `src/trpc/routers/tariffs.ts:155-159` — Create-Flextime-Schema
- `src/trpc/routers/tariffs.ts:196-200` — Update-Flextime-Schema (nullable)
- `src/lib/services/tariffs-service.ts:24-50` — Error-Klassen
- `src/lib/services/tariffs-service.ts:366-380` — Flextime-Update-Logik
- `src/components/tariffs/tariff-form-sheet.tsx:52-89` — FormState
- `src/components/tariffs/tariff-form-sheet.tsx:322` — `as any`-Cast für creditType-Mismatch
- `src/components/tariffs/tariff-form-sheet.tsx:359-366` — Tab-Definition
- `src/components/tariffs/tariff-form-sheet.tsx:808-893` — Flextime-Tab-JSX
- `src/components/ui/duration-input.tsx` — DurationInput-Komponente
- `src/hooks/use-tariffs.ts` — 7 Tariff-Hooks
- `messages/de.json:1922+` / `messages/en.json:1922+` — `adminTariffs`-Namespace

### Admin-Monthly-Values
- `src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx` — Page
- `src/components/monthly-values/monthly-values-data-table.tsx:45-66` — `getStatusBadge`
- `src/components/monthly-values/monthly-values-toolbar.tsx` — Filter-Toolbar
- `src/components/monthly-values/batch-close-dialog.tsx` — 3-Phasen-Close-Dialog
- `src/components/monthly-values/batch-reopen-dialog.tsx` — Sequential Reopen
- `src/components/monthly-values/recalculate-dialog.tsx` — Recalc-Dialog
- `src/lib/services/monthly-values-service.ts:283-409` — **`closeBatch`**
- `src/lib/services/monthly-values-service.ts:372-401` — Close-Phase mit `mapWithConcurrency`
- `src/lib/services/monthly-values-service.ts:403-408` — Return-Shape
- `src/trpc/routers/monthlyValues.ts:579-597` — Zod-Output-Schema

### Employee-Detail
- `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx:156-305` — Tabs-Definition
- `src/components/employees/tariff-assignments/tariff-assignment-list.tsx` — Assignment-List + Source-Badge
- `src/components/employees/tariff-assignments/effective-tariff-preview.tsx` — Source-Badge-Render
- `src/trpc/routers/employeeTariffAssignments.ts:403-444` — Effective-Resolution
- `src/components/ui/confirm-dialog.tsx` — Shared ConfirmDialog
- `src/hooks/use-employee-tariff-assignments.ts` — 6 Hooks

### Aus der Vorgänger-Research (`2026-04-17-ueberstunden-auszahlung.md`)
- `src/lib/calculation/breaks.ts:247-260` — `calculateOvertimeUndertime`
- `src/lib/calculation/monthly.ts:135-278` — `calculateMonth` + Caps + Credit-Types
- `src/lib/services/monthly-calc.ts:378-405` — `closeMonth`
- `src/lib/services/payroll-export-service.ts:135-190` — `generateDatevLodas`
- `src/lib/services/export-context-builder.ts:569-574` — `monthlyValues.*` Template-Vars
- `src/lib/services/liquid-engine.ts:103-122` — `terp_value`-Filter
- `prisma/schema.prisma:4079-4118` — `MonthlyValue` mit `flextime*`-Feldern
- `prisma/schema.prisma:2857-2914` — `Tariff` mit Flextime-Feldern

## Architecture Documentation

**Muster, die der neue Code andocken wird:**

- **Override-ohne-@@unique-Prisma**: UNIQUE-Constraint lebt nur in SQL; Service prüft via `repo.findDuplicate` vor Write. Begründung (aus dem EmployeeCappingException-Schema-Kommentar): PostgreSQL behandelt NULLs als unterschiedlich, was per-Jahr-Scoping + "alle Jahre"-Scoping (year = null) erlaubt.
- **Effective-Rule-Resolution mit Override-Merge**: Service-`update` holt existing, baut `effectiveType`/`effectiveValue` per `?? existing.X`-Merge, re-validiert auf dem gemergten Objekt. Pre-fetched Map im Batch-Pfad (`Map<employeeId, [...]>`), Single-query für Einzelpfad.
- **`mapWithConcurrency(items, 5, fn)`-Pattern**: Pool-Parallelität mit shared counter. Used durchgehend für Batch-Operationen (closeBatch, calculateMonthBatch, recalculateFromMonthBatch). Per-Item-Fehler werden im Callback gefangen und in `errors[]` gesammelt; kein Abbruch.
- **Atomic-Close-Guard**: `updateMany({ where: { isClosed: false } })` als TOCTOU-Safe. `reopenMonth` nutzt das gespiegelte Pattern. Beide Close und Recalc kollidieren → Close gewinnt → Recalc bekommt `ERR_MONTH_CLOSED`.
- **Audit-non-blocking**: Alle `auditLog.log(...)`-Calls sind `.catch(err => console.error(err))` — Audit-Fehler brechen Business-Logic nie ab.
- **Sheet + ScrollArea + Footer-Layout**: Right-side-Sheets für alle Edit-Forms; `flex-1`-Buttons für gleiche Breite; Content-Area scrollable via `<ScrollArea className="flex-1 -mx-6 px-6">`.
- **Source-Badge-Pattern**: `assignment | default | none` mit `variant="default"|"secondary"|"outline"` — Template für "Tarif-Regel aktiv vs. Override aktiv vs. keine Regel"-Anzeige.
- **Lazy-Seed-Init**: Erste `list`-Query eines Tenants mit leeren Daten triggert `copyDefaultsToTenant`. Keine Auto-Backfills auf bestehende Tenants — SQL-Migration ist der einzige Pfad dafür.
- **Plain-useState-Form**: `TariffFormSheet` und Peer-Komponenten nutzen kein `react-hook-form`; alles in einem `<FormState>`-useState. Validierung läuft getrennt in Zod (Router) und einer lokalen `validateForm()` (Client).
- **Keine Transaktion um Recalc-Kaskade**: `recalculateFromMonth` iteriert sequenziell ohne `$transaction`. Jeder `recalculateMonth` ist atomar für sich (via `updateMany`-Guard + Create-Fallback), aber die Kaskade als Ganzes ist nicht atomar.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md` — **Primärer Research-Vorgänger**: Vollständige Ist-Zustands-Doku von Überstunden-Berechnung, Flextime, Monatsabschluss, DATEV-Export, Tarif, Account-System und UI. **Diese Research ergänzt** dort nicht behandelte Implementierungs-Anker.
- `thoughts/shared/tickets/prodi-prelaunch/pflicht-03-ueberstunden-auszahlung.md` — Ziel-Ticket (fünf Blöcke A–E).
- `thoughts/shared/tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege.md` — Paralleles Ticket, dessen Template-Engine-Erweiterung (`terp_value`-Filter, `TenantPayrollWage.terpSource`-Dispatch) als Vorbedingung bezeichnet wird.
- `thoughts/shared/tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md` — Nachfolge-Ticket, das die hier konfigurierte Auszahlungsregel als Default konsumiert.
- `thoughts/shared/plans/2026-04-17-pflicht-02-datev-zuschlaege.md` — Implementation-Plan des DATEV-Zuschläge-Tickets (Vorlage für ähnliche Lohnart-Logik).
- `thoughts/shared/research/2026-04-17-datev-zuschlaege.md` — Research zu DATEV-Zuschlägen (zeigt `account:NIGHT`-Terpsource-Muster).
- `thoughts/shared/research/2026-04-17-datev-lodas-buchung-stunden-migration.md` — Stunden-Buchungs-Migration-Research.
- `thoughts/shared/plans/2026-04-08-datev-lohn-template-export-engine.md` — Template-Engine-Architektur.
- `thoughts/shared/research/2026-01-30-ZMI-TICKET-016-monthly-evaluation-and-closing.md` — `isClosed`-State-Machine-Research.
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` — Gleitzeitkonto-Referenz.
- `thoughts/shared/research/2026-01-26-tariff-zmi-verification.md` — Tariff-Feld-Verifikation.

## Related Research

- `thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md` (Vorgänger, vollständiger Ist-Zustand)
- `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`
- `thoughts/shared/research/2026-04-17-datev-lodas-buchung-stunden-migration.md`
- `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`
- `thoughts/shared/research/2026-01-30-ZMI-TICKET-016-monthly-evaluation-and-closing.md`
- `thoughts/shared/research/2026-01-26-tariff-zmi-verification.md`

## Open Questions

(Dokumentiert, nicht Research-Ergebnis — Punkte, die die Implementierung entscheiden muss, aber durch den Ticket-Text nicht abschließend beantwortet sind.)

1. **`EmployeeOvertimePayoutOverride`-Uniqueness**: Das Ticket fordert "unique pro Tenant/Employee-Paar" (Akzeptanzkriterium #3). Das EmployeeCappingException-Template nutzt dagegen `(employeeId, cappingRuleId, year)` mit Null-Year-Branching. Da es für OvertimePayout keinen Rule-Pointer und keine Year-Variante gibt, vereinfacht sich das zu `UNIQUE(tenantId, employeeId)`. Zu bestätigen, dass die Null-Year-Branching-Logik hier nicht benötigt wird.
2. **Seed-Migration vs. Backfill**: Das Ticket verlangt einen `DefaultPayrollWage`-Seed für Lohnart `1010`. `copyDefaultsToTenant` läuft lazy nur für neue Tenants — existierende Tenants (inkl. Pro-Di) bekommen die `1010`-Row erst beim nächsten `reset`-Call oder bei expliziter `initialize`-Mutation. Ob zusätzlich ein SQL-Backfill (Muster: `20260430000000`) nötig ist, ist nicht explizit im Ticket adressiert.
3. **`creditType`-Form-State-Bug**: Das Tarif-Formular schreibt `creditType="complete"` statt `"complete_carryover"` und umgeht mit `as any` die Typ-Prüfung. Ob ein Nebenbei-Fix im Rahmen des neuen Tickets sinnvoll ist oder als separater Bug-Fix läuft, ist offen.
4. **Kaskade vs. Einzelmonat-Recalc nach `approve()`**: Das Ticket sagt `recalculateFromMonth(employeeId, year, month+1)` nach Approval. `recalculateFromMonth` existiert als Service-Funktion, wird aber aktuell nirgends aus Produktionspfaden gerufen (Grep: nur in Test-Files). Muss neu aufgerufen werden — der `monthly-values-service.recalculate`-Wrapper ruft nur `calculateMonthBatch` (Einzelmonat), nicht die Kaskade.
