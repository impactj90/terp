---
date: 2026-04-16T12:00:00+02:00
researcher: Claude
git_commit: 74502443078e69bf1ca6862969f3b131cfc43d8e
branch: master
repository: terp
topic: "Nachtschicht-Bewertungslogik: Code-Analyse fuer pflicht-01"
tags: [research, codebase, dayChangeBehavior, absences, night-shift, daily-calc, day-plan]
status: complete
last_updated: 2026-04-16
last_updated_by: Claude
---

# Research: Nachtschicht-Bewertungslogik

**Date**: 2026-04-16T12:00:00+02:00
**Researcher**: Claude
**Git Commit**: 74502443078e69bf1ca6862969f3b131cfc43d8e
**Branch**: master
**Repository**: terp

## Research Question

Detaillierte Code-Analyse fuer die Implementierungsplanung von pflicht-01 (Nachtschicht-Bewertungslogik: Absenz-Service konsumiert dayChangeBehavior). Acht konkrete Fragen zu Consumern, Touchpoints, Lookup-Mechanik, Refactoring-Risiko, Urlaubsgutschrift, UI, Handbuch und potenziellen Ueberraschungen.

## Ticket-Referenz

`thoughts/shared/tickets/prodi-prelaunch/pflicht-01-nachtschicht-bewertungslogik.md`

---

## 1. DAYCHANGEBEHAVIOR — VOLLSTAENDIGE CONSUMER-LISTE

### Schema-Definition

- `prisma/schema.prisma:2688` — Feld auf dem `DayPlan`-Model:
  ```
  dayChangeBehavior String @default("none") @map("day_change_behavior") @db.VarChar(30)
  ```
- `supabase/migrations/20260101000031_add_day_plan_zmi_fields.sql:23` — Migration die das Feld eingefuehrt hat
- `supabase/seed.sql:2950-2982` — Seed-Daten: FS=`'none'`, SS=`'none'`, NS=`'at_arrival'`

### Konstanten-Definition

- `src/lib/services/daily-calc.types.ts:40-43` — Vier String-Konstanten:
  - `DAY_CHANGE_NONE = "none"`
  - `DAY_CHANGE_AT_ARRIVAL = "at_arrival"`
  - `DAY_CHANGE_AT_DEPARTURE = "at_departure"`
  - `DAY_CHANGE_AUTO_COMPLETE = "auto_complete"`
- `src/trpc/routers/dayPlans.ts:50-55` — Router-Level Enum-Tuple fuer Zod-Validierung:
  ```ts
  const DAY_CHANGE_BEHAVIORS = ["none", "at_arrival", "at_departure", "auto_complete"] as const
  ```

### EINZIGER VERHALTENS-CONSUMER: DailyCalcService

Die gesamte Codebase hat exakt **eine** Stelle, die `dayChangeBehavior` liest und eine Verhaltensentscheidung daraus ableitet:

**`src/lib/services/daily-calc.ts:484-526`** — `loadBookingsForCalculation()` (private Methode)

1. Zeile 496: Liest `empDayPlan.dayPlan.dayChangeBehavior` in lokale Variable `behavior`
2. Zeilen 497-499: Wenn `behavior` falsy, leer oder `"none"` → `loadBookingsForDate()` (Single-Day-Query)
3. Zeilen 501-507: Fuer jeden Non-`"none"`-Wert → 3-Tage-Fenster via `loadBookingsForDateRange()`
4. Zeilen 510-525: `switch(behavior)`:
   - `"at_arrival"` / `"at_departure"` → `applyDayChangeBehavior(date, behavior, bookings)` (Pure Function in `daily-calc.helpers.ts`)
   - `"auto_complete"` → `this.applyAutoCompleteDayChange(tenantId, employeeId, date, bookings)` (async, erzeugt synthetische Mitternachts-Bookings in der DB)
   - `default` → `filterBookingsByDate(bookings, date)`

**`src/lib/services/daily-calc.ts:583-637`** — `applyAutoCompleteDayChange()` (private Methode)
- Fuer Cross-Midnight-Paare: erzeugt synthetische GO/COME-Bookings um Mitternacht via `ensureAutoCompleteBooking()` (Zeilen 643-682)

### Durchreichungen (KEIN Verhaltens-Consumer)

| Datei | Zeile | Art |
|---|---|---|
| `src/lib/services/day-plans-service.ts:283` | Write bei Create | `dayChangeBehavior: input.dayChangeBehavior \|\| "none"` |
| `src/lib/services/day-plans-service.ts:503-504` | Write bei Update | Durchreichung |
| `src/lib/services/day-plans-service.ts:669` | Copy | Kopiert Wert aus Quell-Plan |
| `src/trpc/routers/dayPlans.ts:127` | Output | `z.string()` — kein Enum im Output |
| `src/trpc/routers/dayPlans.ts:184` | Create Input | `z.enum(DAY_CHANGE_BEHAVIORS).optional()` |
| `src/trpc/routers/dayPlans.ts:233` | Update Input | `z.enum(DAY_CHANGE_BEHAVIORS).optional()` |
| `src/trpc/routers/dayPlans.ts:338` | Output Mapping | `dayChangeBehavior: p.dayChangeBehavior as string` |
| `src/components/day-plans/day-plan-form-sheet.tsx:74,111,189,289,855-870` | UI | State, Hydration, Submit, Select-Control |
| `src/components/day-plans/day-plan-detail-sheet.tsx:60-65,268` | UI Read-Only | Label-Mapping + Anzeige |

### Bestaetigt KEIN Consumer

Exhaustive Suche ergab null Treffer fuer `dayChangeBehavior` in:

- `src/lib/services/absences-service.ts` — **null**
- `src/lib/services/absences-repository.ts` — **null**
- `src/lib/services/vacation-helpers.ts` — **null**
- `src/lib/services/vacation-service.ts` — **null**
- `src/lib/services/daily-account-values-service.ts` — **null**
- `src/lib/services/payroll-export-service.ts` — **null**
- `src/lib/services/inbound-invoice-datev-export-service.ts` — **null**
- `src/lib/services/employee-day-plans-service.ts` — **null**
- `src/lib/services/employee-day-plans-repository.ts` — **null**
- `src/lib/services/day-plans-repository.ts` — **null**
- `src/lib/calculation/` (gesamtes Verzeichnis) — **null**
- `src/lib/services/monthly-calc.ts` — **null**
- `src/lib/services/reports-service.ts` — **null**

---

## 2. ABSENCES-SERVICE — BERUEHRUNGSPUNKTE

### Datei: `src/lib/services/absences-service.ts`

#### Alle exportierten Funktionen

| Funktion | Signatur | Zeilen |
|---|---|---|
| `buildAbsenceDataScopeWhere` | `(dataScope: DataScope) => Record \| null` | 75-84 |
| `checkAbsenceDataScope` | `(dataScope, item) => void` | 86-105 |
| `shouldSkipDate` | `(date: Date, dayPlanMap: Map<string, { dayPlanId: string \| null }>) => boolean` | 120-133 |
| `createRange` | `(prisma, tenantId, input, audit) => Promise<{ createdAbsences, skippedDates }>` | 354-593 |
| `list` | `(prisma, tenantId, input, dataScope) => Promise<{ items, total }>` | 241-304 |
| `forEmployee` | `(prisma, tenantId, input) => Promise<AbsenceDay[]>` | 306-334 |
| `getById` | `(prisma, tenantId, id, dataScope) => Promise<AbsenceDay>` | 336-351 |
| `update` | `(prisma, tenantId, input, dataScope, audit) => Promise<AbsenceDay>` | 596-667 |
| `remove` | `(prisma, tenantId, id, dataScope, audit) => Promise<void>` | 669-728 |
| `approve` | `(prisma, tenantId, id, dataScope, audit) => Promise<AbsenceDay>` | 730-832 |
| `reject` | `(prisma, tenantId, id, reason, dataScope, audit) => Promise<AbsenceDay>` | 834-919 |
| `cancel` | `(prisma, tenantId, id, dataScope, audit) => Promise<AbsenceDay>` | 921-994 |

Nicht-exportierte private Funktionen: `publishUnreadCountUpdate` (18-39), `triggerRecalc` (137-152), `triggerRecalcRange` (154-167), `recalculateVacationTaken` (176-237).

#### `shouldSkipDate()` — Zeilen 120-133

```ts
export function shouldSkipDate(
  date: Date,
  dayPlanMap: Map<string, { dayPlanId: string | null }>,
): boolean {
  const dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return true; // Wochenende
  const dateKey = date.toISOString().split("T")[0]!;
  const dayPlan = dayPlanMap.get(dateKey);
  if (!dayPlan) return true;              // kein Plan → skip
  if (!dayPlan.dayPlanId) return true;    // Off-Day → skip
  return false;
}
```

Drei sequenzielle Regeln: (1) Wochenende, (2) kein EmployeeDayPlan-Row, (3) dayPlanId=null. **Kein Bezug zu dayChangeBehavior, comeFrom, goTo oder Shift-Semantik.**

Feiertage werden bewusst NICHT geskippt (Kommentar Zeile 118: "ZMI spec Section 18.2").

#### `createRange()` — Zeilen 354-593

**Input**: `{ employeeId, absenceTypeId, fromDate, toDate, duration, halfDayPeriod?, notes? }` + `audit: AuditContext | null`

**Ablauf:**
1. **Date Parsing & Validierung** (379-386): Parst Datumsstrings, wirft `AbsenceValidationError` bei `fromDate > toDate`
2. **AbsenceType-Lookup** (389-398): `repo.findActiveAbsenceType(...)`, setzt `autoApprove` und `status`
3. **Transaction** (403-503, `prisma.$transaction`):
   - **DayPlan-Fetch** (408-420): `repo.findEmployeeDayPlans(...)` → baut `dayPlanMap: Map<string, { dayPlanId: string | null }>` (Schluessel: `"YYYY-MM-DD"`)
   - **Existing Absences Fetch** (423-434): `repo.findExistingAbsences(...)` → baut `existingMap: Set<string>` (Dedup)
   - **Tag-fuer-Tag-Iteration** (452-478): `while (currentDate <= toDate)`:
     - `shouldSkipDate(currentDate, dayPlanMap)` → push zu `txSkippedDates`
     - Oder `existingMap.has(dateKey)` → push zu `txSkippedDates`
     - Sonst → push Record zu `txToCreate` mit `duration` aus Input
     - Advance: `currentDate.setUTCDate(currentDate.getUTCDate() + 1)` (UTC)
   - **Batch Create** (481-483): `repo.createMany(...)` falls `txToCreate.length > 0`
   - **Re-Fetch** (486-496): `repo.findCreatedAbsences(...)` mit vollstaendigen Relations
4. **Post-Transaction Side Effects** (507-535):
   - `triggerRecalcRange(...)` (Best Effort)
   - Bei `autoApprove` + `deductsVacation`: `recalculateVacationTaken(...)` pro Year

#### `recalculateVacationTaken()` — Zeilen 176-237 (privat)

1. `repo.findVacationDeductingTypes(prisma, tenantId)` → AbsenceType-IDs mit `deductsVacation=true`
2. `repo.findApprovedAbsenceDaysForYear(...)` → genehmigte Absence-Days im Jahresbereich, selektiert `absenceDate` + `duration`
3. `repo.findEmployeeDayPlansWithVacationDeduction(...)` → EmployeeDayPlan mit `dayPlan.vacationDeduction`
4. Baut `dayPlanMap: Map<string, number>` (Schluessel: `"YYYY-MM-DD"`, Wert: `vacationDeduction`)
5. Summiert `totalTaken += vacationDeduction * duration` (Default: `vacationDeduction = 1.0`)
6. `repo.upsertVacationBalance(prisma, tenantId, employeeId, year, totalTaken)` → Ersetzt `VacationBalance.taken`

**Laedt KEIN `dayChangeBehavior`.** Einziges geladenes DayPlan-Feld ist `vacationDeduction`.

### Datei: `src/lib/services/absences-repository.ts`

#### `findEmployeeDayPlans()` — Zeilen 200-218

```ts
prisma.employeeDayPlan.findMany({
  where: {
    employeeId,
    planDate: { gte: fromDate, lte: toDate },
    employee: { tenantId },
  },
  select: {
    planDate: true,
    dayPlanId: true,
  },
})
```

Selektiert NUR `planDate` + `dayPlanId`. Kein `include` fuer den DayPlan. Kein `dayChangeBehavior`, kein `comeFrom`/`goTo`.

#### `findEmployeeDayPlansWithVacationDeduction()` — Zeilen 365-384

```ts
prisma.employeeDayPlan.findMany({
  where: {
    employeeId,
    planDate: { gte: yearStart, lte: yearEnd },
    employee: { tenantId },
  },
  include: {
    dayPlan: { select: { vacationDeduction: true } },
  },
})
```

Selektiert `vacationDeduction` vom DayPlan — nur fuer `recalculateVacationTaken()`.

#### Weitere Repository-Funktionen

| Funktion | Zeilen | Zweck |
|---|---|---|
| `findMany` | | Paginierte Liste mit `absenceDayListInclude` |
| `findForEmployee` | | MA-Absenzen mit `absenceDayListInclude` |
| `findById` / `findByIdWithEmployee` / `findByIdForApproval` / `findByIdForRejection` / `findByIdForCancel` | | Einzelabfragen mit spezifischen Includes |
| `findActiveAbsenceType` | 186 | AbsenceType-Lookup (aktiv + tenant-scoped) |
| `findExistingAbsences` | 220 | Non-cancelled Dates fuer Dedup |
| `createMany` | 238 | Bulk Insert via `absenceDay.createMany` |
| `findCreatedAbsences` | 257 | Re-Fetch mit Relations |
| `update` / `updateIfStatus` | | Einzelupdate / atomarer Update mit Status-Pruefung |
| `deleteById` | | Hard Delete |
| `findVacationDeductingTypes` | 329 | AbsenceTypes mit `deductsVacation=true` |
| `findApprovedAbsenceDaysForYear` | 342 | Genehmigte Days im Jahresbereich |
| `upsertVacationBalance` | 386-409 | Upsert auf `vacation_balances.taken` |
| `findUserIdForEmployee` | | Raw SQL: User-ID fuer Employee |
| `createNotification` | | Notification-Row |
| `findApproverUserIds` | | Raw SQL: Admins + `absences.approve`-Permission |

### tRPC-Router: `src/trpc/routers/absences.ts`

Importiert `absences-service` als Namespace (Zeile 37). Re-exportiert `buildAbsenceDataScopeWhere`, `checkAbsenceDataScope`, `shouldSkipDate` (Zeilen 613-617).

| Procedure | Method | Service-Call |
|---|---|---|
| `list` (284) | query | `absencesService.list(...)` |
| `forEmployee` (325) | query | `absencesService.forEmployee(...)` |
| `getById` (361) | query | `absencesService.getById(...)` |
| `createRange` (397) | mutation | `absencesService.createRange(...)` |
| `update` (438) | mutation | `absencesService.update(...)` |
| `delete` (473) | mutation | `absencesService.remove(...)` |
| `approve` (508) | mutation | `absencesService.approve(...)` |
| `reject` (545) | mutation | `absencesService.reject(...)` |
| `cancel` (582) | mutation | `absencesService.cancel(...)` |

`createRange` Input-Schema (Zeilen 153-161): `duration: z.number().min(0.5).max(1).default(1)`, `fromDate/toDate: z.string().date()`.

### Callsites von `createRange()`

**Produktion** (einzige Stelle): `src/trpc/routers/absences.ts:410`

**Tests**:
- `src/lib/services/__tests__/absences-auto-approve.test.ts:36` (Zeilen 118, 147, 175, 204, 233, 255)
- `src/e2e/__tests__/05-taeglicher-betrieb.test.ts:502,530,549,623,649`

**UI-Hook**: `src/hooks/use-absences.ts:271` — `useCreateAbsenceRange()` → `client.absences.createRange.mutate({...})`

### UI-Komponenten mit Tag-fuer-Tag-Logik

- `src/components/absences/absence-request-form.tsx:161-164` — ruft `calculateWorkingDays()` fuer Display-Zwecke (Arbeitstage-Anzeige). Nur Client-Side Preview, kein Einfluss auf Record-Erstellung.
- `src/components/absences/vacation-impact-preview.tsx:35-55` — `calculateWorkingDays()` iteriert Tag-fuer-Tag (local time, nicht UTC), prueft `isWeekend` + Feiertage. Nur fuer Client-Side Balance-Impact-Preview.
- Keine UI-Komponente referenziert `shouldSkipDate`, `dayPlanMap` oder `EmployeeDayPlan` direkt.

### Datenfluss-Diagramm

```
UI (AbsenceRequestForm)
  → useCreateAbsenceRange() [use-absences.ts:256]
    → client.absences.createRange.mutate() [use-absences.ts:271]
      → absencesRouter.createRange [absences.ts:397]
        → absencesService.createRange() [absences-service.ts:354]
          → repo.findActiveAbsenceType() [absences-repository.ts:186]
          → prisma.$transaction()
            → repo.findEmployeeDayPlans()       [absences-repository.ts:200]
               baut dayPlanMap: Map<"YYYY-MM-DD", { dayPlanId }>
            → repo.findExistingAbsences()       [absences-repository.ts:220]
               baut existingMap: Set<"YYYY-MM-DD">
            → while (currentDate <= toDate)
                 shouldSkipDate(currentDate, dayPlanMap) [absences-service.ts:120]
                 → skip Wochenende + kein-Plan + Off-Days
                 currentDate.setUTCDate(+1)
            → repo.createMany()                 [absences-repository.ts:238]
            → repo.findCreatedAbsences()        [absences-repository.ts:257]
          → triggerRecalcRange() (Best Effort)
          → recalculateVacationTaken() (bei autoApprove + deductsVacation)
          → auditLog.logBulk()
          → Approver-Notifications (bei !autoApprove)
```

---

## 3. EMPLOYEEDAYPLAN — LOOKUP-MECHANIK

### Prisma-Schema: `EmployeeDayPlan`

`prisma/schema.prisma:3418-3454`

| Feld | Typ | Anmerkung |
|---|---|---|
| `id` | `String` UUID | PK |
| `tenantId` | `String` UUID | Multi-Tenancy |
| `employeeId` | `String` UUID | FK → `employees(id)` ON DELETE CASCADE |
| `planDate` | `DateTime @db.Date` | Kalendertag (date-only) |
| `dayPlanId` | `String?` UUID nullable | FK → `day_plans(id)` ON DELETE SetNull. **NULL = Off-Day** |
| `shiftId` | `String?` UUID nullable | FK → `shifts(id)` ON DELETE SetNull |
| `source` | `String?` default `"tariff"` | `'tariff'`, `'manual'`, `'holiday'` |
| `notes` | `String?` text | |
| `createdAt` / `updatedAt` | `DateTime` timestamptz | |

**Unique Constraint**: `@@unique([employeeId, planDate])` — exakt eine Row pro MA pro Tag.

**Indizes**:
- `idx_employee_day_plans_tenant` auf `tenantId`
- `idx_employee_day_plans_tenant_employee_date` auf `(tenantId, employeeId, planDate)` — Haupt-Lookup-Index
- `idx_employee_day_plans_date` auf `planDate`
- `idx_employee_day_plans_shift` auf `shiftId`

**Kein `validFrom`/`validTo`** auf EmployeeDayPlan. Es ist ein materialisierter Punkt-pro-Tag-Record.

### Prisma-Schema: `DayPlan` (relevante Felder)

`prisma/schema.prisma:2617-2737`

| Feld | Typ | Anmerkung |
|---|---|---|
| `comeFrom` / `comeTo` | `Int?` | Ankunftsfenster, Minuten ab Mitternacht |
| `goFrom` / `goTo` | `Int?` | Abgangsfenster, Minuten ab Mitternacht |
| `regularHours` | `Int` default `480` | Soll-Minuten (8h Default) |
| `dayChangeBehavior` | `String` default `"none"` | Die vier Modi |
| `vacationDeduction` | `Decimal` default `1.00` | Faktor fuer Urlaubstag-Zaehlung |
| `fromEmployeeMaster` | `Boolean` default `false` | Soll-Stunden aus Mitarbeiterstamm |

**Kein `validFrom`/`validTo` auf DayPlan.** Zeitbindung lebt in `Tariff` und `EmployeeTariffAssignment`.

### Lookup-Varianten im Code

#### A. DailyCalcService — Einzel-Datum-Lookup (Haupt-Lookup)

`src/lib/services/daily-calc.ts:311-338` — `loadEmployeeDayPlan()`

```ts
private async loadEmployeeDayPlan(...): Promise<EmployeeDayPlanWithDetails | null> {
  if (context) {
    const key = date.toISOString().split("T")[0]!
    return context.dayPlans.get(key) ?? null   // In-Memory Map
  }
  return this.prisma.employeeDayPlan.findFirst({
    where: { tenantId, employeeId, planDate: date },
    include: {
      dayPlan: {
        include: {
          breaks: { orderBy: { sortOrder: "asc" } },
          bonuses: { include: { account: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  })
}
```

#### B. DailyCalcContext — Batch-Loading fuer Range-Berechnungen

`src/lib/services/daily-calc.context.ts:105-234` — `loadEmployeeCalcContext()`

- Laedt einmal pro Employee pro Cron-Lauf
- `dayPlans: Map<string, EmployeeDayPlanWithDetails | null>` (Schluessel: `"YYYY-MM-DD"`)
- Query (Zeilen 122-139): `prisma.employeeDayPlan.findMany({ where: { planDate: { gte: fromDate, lte: toDate } }, include: { dayPlan: { breaks, bonuses } } })`
- **WICHTIG**: Booking-Range wird um +/-1 Tag erweitert (Zeilen 116-117), aber die DayPlan-Range wird NICHT erweitert — bleibt exakt `fromDate..toDate`

#### C. Employees-Repository — Lightweight Lookup

`src/lib/services/employees-repository.ts:232-246` — `findEmployeeDayPlan()`

Selektiert `{ id, code, name, planType }` vom DayPlan. Verwendet fuer Employee-Day-View.

#### D. Absences-Repository — Minimal-Lookup

`src/lib/services/absences-repository.ts:200-218` — `findEmployeeDayPlans()`

Selektiert NUR `{ planDate, dayPlanId }`. Verwendet von `createRange()`.

#### E. Bookings-Repository

`src/lib/services/bookings-repository.ts:237-247` — `findEmployeeDayPlan()`

Vollstaendiger `dayPlan` Include. Verwendet wenn Booking-Referenzzeit `"plan_start"` oder `"plan_end"` ist.

### Off-Day/Weekend-Behandlung

In `calculateDay` (`daily-calc.ts:145-147`):
```ts
if (!empDayPlan || !empDayPlan.dayPlanId) {
  dvInput = this.handleOffDay(employeeId, calcDate, bookings)
}
```

Zwei null-Szenarien werden identisch als "Off Day" behandelt:
1. **Kein EmployeeDayPlan-Row** fuer das Datum
2. **Row existiert aber `dayPlanId = null`** — expliziter Off-Day

`handleOffDay` (Zeilen 708-740): Erzeugt DailyValueInput mit allen Zeitfeldern = 0 und `warnings: ["OFF_DAY"]`.

Fuer Wochenenden: Wenn `WeekPlan.saturdayDayPlanId` oder `sundayDayPlanId` null ist, erzeugt der Generator KEINEN EmployeeDayPlan-Row → fehlende Row = Off-Day bei Berechnung.

### Materialisierung: EmployeeDayPlanGenerator

`src/lib/services/employee-day-plan-generator.ts`

- `generateFromTariff()` (Zeile 242): Materialisiert EmployeeDayPlan-Rows aus Tarif-Rhythmen
- Laedt aktive `EmployeeTariffAssignment`-Rows (Zeile 324) — diese haben `effectiveFrom` (required) und `effectiveTo?` (nullable = open-ended)
- Drei Rhythmus-Typen: `weekly`, `rolling_weekly`, `x_days`
- Source-Preservation: Rows mit `source !== 'tariff'` (`'manual'` oder `'holiday'`) werden nie ueberschrieben
- Tarif-Wechsel: Mehrere EmployeeTariffAssignment-Rows koennen einen Zeitraum abdecken, werden als separate Segmente verarbeitet

### Keine dedizierte "Is Work Day?" Helper-Funktion

Kein exportierter Helper `isWorkDay`, `hasWorkingTime` oder `getActiveDayPlan` existiert. Die Pruefung ist implizit:
- Generator: `getDayPlanIdForDate` → null → kein Row geschrieben
- Calculator: `!empDayPlan || !empDayPlan.dayPlanId` = Off-Day
- Absences: `shouldSkipDate()` prueft dayPlanId-Existenz

---

## 4. APPLYDAYCHANGEBEHAVIOR — REFACTORING-RISIKO

### Implementation

`src/lib/services/daily-calc.helpers.ts:251-293`

```ts
export function applyDayChangeBehavior(
  date: Date,
  behavior: string,
  bookings: BookingWithType[]
): BookingWithType[]
```

**Ablauf:**
1. `partitionBookingsByDate(bookings, date)` (Zeile 256) → `{ prev, current, next }`
2. `pairWorkBookingsAcrossDays(prev, current, next)` (Zeile 257) → `CrossDayPair[]`
3. Initialisiert `selected: Map<string, BookingWithType>` mit allen Current-Day-Bookings (Zeilen 259-262)
4. `switch(behavior)`:
   - **`at_arrival`** (265-276): Arrival offset=0 + Departure offset=+1 → Departure HINZUFUEGEN. Arrival offset=-1 + Departure offset=0 → Departure ENTFERNEN.
   - **`at_departure`** (278-289): Departure offset=0 + Arrival offset=-1 → Arrival HINZUFUEGEN. Departure offset=+1 + Arrival offset=0 → Arrival ENTFERNEN.
5. `sortedBookingsFromMap(selected)` (Zeile 292) → sortiertes Array

**`none` und `auto_complete` werden NICHT in dieser Funktion behandelt.** Der Caller dispatcht direkt.

### Interne Helper

- `partitionBookingsByDate()` — Zeilen 159-184: Partitioniert in prev/current/next via `addDays` + `sameDate()`
- `pairWorkBookingsAcrossDays()` — Zeilen 194-242: FIFO IN/OUT-Pairing, `absTime = offset * 1440 + editedTime`, ignoriert Break-Bookings
- `sortedBookingsFromMap()` — Zeilen 102-118: Map → sortiertes Array

### Einziger Caller

`src/lib/services/daily-calc.ts:513` — innerhalb `loadBookingsForCalculation()` (Zeilen 484-526)

### Mutations und Side Effects

**Keine.** Die Funktion:
- Mutiert KEINE Input-Parameter
- Hat KEINE DB-Writes
- Hat KEINE externen Aufrufe
- Erzeugt eine neue Map und ein neues Array
- Ist eine reine Funktion (Pure Function)

### Test-Coverage

**Testdatei**: `src/lib/services/__tests__/daily-calc.helpers.test.ts`

**Fixtures**:
- `makeBooking(overrides)` (Zeilen 55-84): Konstruiert vollstaendigen `BookingWithType`. Default-BookingType: code=`"COME"`, direction=`"in"`
- `makeDayPlan(overrides)` (Zeilen 86-142): Konstruiert `DayPlanWithDetails` (nicht von applyDayChangeBehavior-Tests genutzt)
- Basis-Datum: `new Date("2026-03-02T00:00:00Z")`, prevDate=`"2026-03-01"`, nextDate=`"2026-03-03"`

**`describe("applyDayChangeBehavior")` — Zeilen 396-482:**

| Test | Zeile | Assertion |
|---|---|---|
| `at_arrival`: includes next-day departure for arrival on current day | 402 | bIn am date@23:00, bOut am nextDate@06:00 → beide IDs im Ergebnis |
| `at_arrival`: excludes current-day departure for arrival on previous day | 422 | bIn am prevDate@23:00, bOut am date@06:00 → out1 NICHT im Ergebnis |
| `at_departure`: includes previous-day arrival for departure on current day | 443 | bIn am prevDate@23:00, bOut am date@06:00 → beide IDs im Ergebnis |
| `at_departure`: excludes current-day arrival for departure on next day | 463 | bIn am date@23:00, bOut am nextDate@06:00 → in1 NICHT im Ergebnis |

**4 Tests insgesamt. Keine Tests fuer `none` oder `auto_complete` (konsistent: werden nie an die Funktion dispatcht).**

**`describe("pairWorkBookingsAcrossDays")` — Zeilen 323-394:**

| Test | Zeile | Assertion |
|---|---|---|
| pairs same-day IN/OUT | 324 | Einzelnes Paar innerhalb current[] |
| pairs cross-midnight IN(day0)/OUT(day1) | 342 | arrival.offset=0, departure.offset=1 |
| handles unpaired arrivals | 360 | Einzelnes bIn ohne bOut → pairs.length=0 |
| pairs FIFO with multiple pairs | 371 | in1→out1, in2→out2 in Reihenfolge |
| ignores break bookings | 385 | Code "P1" wird nicht gematcht |

**5 Tests fuer pairWorkBookingsAcrossDays.**

### Coverage-Luecken in bestehenden Tests

- Kein Test fuer mehrere gleichzeitige Cross-Day-Paare an einem Tag
- Kein Test fuer Interaktion zwischen Cross-Day-Paaren und Same-Day-Bookings die nicht Teil eines Paares sind
- Kein Test fuer `default`-Switch-Case
- Kein Test fuer Edge-Case: Booking exakt um Mitternacht (editedTime=0)

---

## 5. URLAUBSSTUNDEN-GUTSCHRIFT — IST-VERHALTEN

### Wo wird die Stundengutschrift berechnet?

Die Vacation-Taken-Berechnung lebt in `recalculateVacationTaken()` (`absences-service.ts:176-237`). Die Formel pro Absenz-Tag ist:

```
totalTaken += vacationDeduction * duration
```

Wobei:
- `vacationDeduction` aus `DayPlan.vacationDeduction` via `findEmployeeDayPlansWithVacationDeduction()` geladen wird (Default: 1.0)
- `duration` aus `AbsenceDay.duration` kommt (1.0 oder 0.5, vom Caller gesetzt)

### `vacationDeduction`-Feld

`prisma/schema.prisma:2682`:
```
vacationDeduction Decimal @default(1.00) @map("vacation_deduction") @db.Decimal(5, 2)
```

Semantik: `1.0` = voller Tag, `0.5` = halber Tag. Multiplier pro Absenz-Tag.

### AbsenceDay.duration

`prisma/schema.prisma:4650`:
```
duration Decimal @default(1.00) @db.Decimal(3, 2)
```

`1.00` = ganzer Tag, `0.50` = halber Tag. Wird bei `createRange()` direkt aus dem User-Input uebernommen (Zeile 466). **Kein automatischer Lookup von DayPlan-Daten bei Erstellung.**

### dayChangeBehavior im Vacation-Kontext

**`dayChangeBehavior` wird NIRGENDS in der Vacation-Berechnung referenziert.** Das einzige DayPlan-Feld das geladen wird ist `vacationDeduction`.

Das bedeutet: Die Vacation-Berechnung referenziert den DayPlan des **Kalendertags** (via `dayPlanMap.get(dateKey)`). Wenn der Absenz-Tag auf dem falschen Kalendertag liegt (der aktuelle Bug), dann wird auch der falsche DayPlan fuer die vacationDeduction herangezogen. Der Wert ist korrekt **relativ zum gebuchten Tag**, aber der gebuchte Tag ist bei Nachtschichten ggf. der falsche.

### VacationBalance-Model

`prisma/schema.prisma:3195-3218`

| Feld | Typ |
|---|---|
| `entitlement` | `Decimal(5,2)` default 0 |
| `carryover` | `Decimal(5,2)` default 0 |
| `adjustments` | `Decimal(5,2)` default 0 |
| `taken` | `Decimal(5,2)` default 0 |
| `carryoverExpiresAt` | `DateTime?` |

`@@unique([employeeId, year])`

**`taken` wird exklusiv von `recalculateVacationTaken()` geschrieben** via `repo.upsertVacationBalance`. Replace-Semantik (nicht akkumulierend).

### Trigger fuer recalculateVacationTaken()

| Callsite | Operation | Bedingung |
|---|---|---|
| Zeile 529 | nach `createRange` mit autoApprove | `absenceType.deductsVacation` |
| Zeile 700 | nach `remove` (delete) | `wasApproved && deductsVacation` |
| Zeile 770 | nach `approve` | `absence.absenceType?.deductsVacation` |
| Zeile 959 | nach `cancel` (approved→cancelled) | `absence.absenceType?.deductsVacation` |

Alle in try/catch — Failures werden geloggt, rollen aber die Primaer-Operation nicht zurueck.

---

## 6. UI — TAGESPLAN-FORMULAR

### Datei: `src/components/day-plans/day-plan-form-sheet.tsx`

#### Form-Architektur

- **Kein Form-Library**: Raw `React.useState<FormState>` (Zeile 41-76)
- **Kein Zod im Component**: Validierung via plain `validateForm()` (Zeilen 115-125)
- **Submit**: `handleSubmit` (Zeile 209) → `validateForm()` → tRPC Mutation

#### Tab-Layout (Tabs aus `@/components/ui/tabs`)

| Tab-Wert | Label-Key | Inhalt |
|---|---|---|
| `basic` | `tabBasic` | Code, Name, planType, regularHours, etc. |
| `time` | `tabTimeWindows` | comeFrom/comeTo, goFrom/goTo, coreStart/coreEnd |
| `tolerance` | `tabTolerance` | Toleranzfenster |
| `rounding` | `tabRounding` | Rundungsregeln |
| `special` | `tabSpecial` | holidayCredit, vacationDeduction, noBookingBehavior, **dayChangeBehavior** |

#### dayChangeBehavior im Formular — Zeilen 854-871

```tsx
<div className="space-y-2">
  <Label htmlFor="dayChangeBehavior">{t('fieldDayChangeBehavior')}</Label>
  <Select
    value={form.dayChangeBehavior}
    onValueChange={(v) => setForm({ ...form, dayChangeBehavior: v })}
  >
    <SelectTrigger id="dayChangeBehavior">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="none">{t('dayChangeNone')}</SelectItem>
      <SelectItem value="at_arrival">{t('dayChangeAtArrival')}</SelectItem>
      <SelectItem value="at_departure">{t('dayChangeAtDeparture')}</SelectItem>
      <SelectItem value="auto_complete">{t('dayChangeAutoComplete')}</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground">{t('dayChangeBehaviorHelp')}</p>
</div>
```

Select-Komponente aus `@/components/ui/select` (shadcn/ui). Darunter Hilfetext als `<p>`.

#### Bestehende Warning/Hint-Patterns im Codebase

**1. Destructive Alert (in diesem Formular, Zeilen 876-880):**
```tsx
{error && (
  <Alert variant="destructive" className="mt-4">
    <AlertDescription>{error}</AlertDescription>
  </Alert>
)}
```

**2. Default-Variant Alert mit Icon (informativ, nicht-blockierend):**
- `src/components/accounts/account-form-sheet.tsx:206-213` — `<Alert>` mit `<AlertCircle className="h-4 w-4" />`
- `src/components/booking-types/booking-type-form-sheet.tsx:156-161` — selbes Pattern
- `src/components/user-groups/user-group-form-sheet.tsx:408-413` — selbes Pattern
- `src/components/monthly-evaluation/reopen-month-sheet.tsx:96-101` — `<Alert>` mit `<AlertTriangle className="h-4 w-4" />`, permanent sichtbar

**3. Inline Amber Warning ohne Alert:**
- `src/components/warehouse/supplier-invoice-form-sheet.tsx:260-265`:
  ```tsx
  <div className="flex items-center gap-2 text-sm text-amber-600">
    <AlertTriangle className="h-4 w-4" />
    {supplierWarning}
  </div>
  ```
  Conditional unterhalb eines Select-Feldes.

**Alert-Varianten** (`src/components/ui/alert.tsx`): Zwei Varianten via `cva`: `default` (`bg-card text-card-foreground`) und `destructive`. Kein `warning`- oder `info`-Variant.

#### i18n

- **Library**: `next-intl` via `useTranslations`
- **Namespace**: `'adminDayPlans'` (Zeile 140)
- **Translation-Dateien**:
  - `messages/de.json` — `"adminDayPlans"` Block ab Zeile 1651
  - `messages/en.json` — selbe Struktur

**dayChangeBehavior Translation Keys (unter `adminDayPlans`):**

| Key | de | en |
|---|---|---|
| `fieldDayChangeBehavior` | Tageswechselverhalten | Day Change Behavior |
| `dayChangeNone` | Kein Tageswechsel | No Day Change |
| `dayChangeAtArrival` | Auswertung bei Ankunft | Evaluate at Arrival |
| `dayChangeAtDeparture` | Auswertung bei Gehen | Evaluate at Departure |
| `dayChangeAutoComplete` | Auto-Abschluss um Mitternacht | Auto-Complete at Midnight |
| `dayChangeBehaviorHelp` | Wie Schichten ueber Mitternacht behandelt werden | How to handle cross-midnight shifts |

---

## 7. HANDBUCH-STRUKTUR

### Datei: `docs/TERP_HANDBUCH.md`

### Abschnitt 6.5 — Exakte Struktur

**Heading**: `### 6.5 Tageswechsel bei Nachtschichten` — Zeile 2621

**Heading-Level**: `###` (dritte Ebene, unter `## 6. Schichtplanung` bei Zeile 2503)

**Inhalt**: Zeilen 2621-2631 — exakt **11 Zeilen** (Heading + Leerzeile + ein Prosasatz + Leerzeile + 6 Tabellenzeilen + Leerzeile):

- Zeile 2621: Heading
- Zeile 2623: "Bei Schichten ueber Mitternacht gibt es vier Einstellungen (konfiguriert im Tagesplan, Tab 'Spezial', Feld 'Tageswechselverhalten'):"
- Zeilen 2625-2630: Zwei-Spalten-Tabelle:

```
| Einstellung | Bedeutung |
|------------|-----------|
| Keine | Keine besondere Behandlung |
| Bei Ankunft | Gesamte Arbeitszeit wird dem Ankunftstag zugerechnet |
| Bei Abgang | Gesamte Arbeitszeit wird dem Abgangstag zugerechnet |
| Automatisch | Automatische Buchungen an der Tagesgrenze (Mitternacht) |
```

**Der Abschnitt hat KEINE Beispiele, KEINE Schritte, KEIN Praxisbeispiel, KEINE Navigationshinweise, KEINE Verifikations-Checkpoints.** Es ist ein minimaler Stub.

### Primaer-Definition bei Zeile 1023 (Abschnitt 4.6.1)

Drei-Spalten-Tabelle `Option | Beschreibung | Beispiel` (Zeilen 1025-1030), gefolgt von Blockquote-Beispiel (Zeile 1032-1033). Cross-Reference bei Zeile 1183: "→ Abschnitt 6.5".

### Tabellen-Formatierung im Handbuch

- **Zwei-Spalten**: `| Einstellung | Bedeutung |` (z.B. Zeile 2625)
- **Drei-Spalten**: `| Option | Beschreibung | Beispiel |` (z.B. Zeile 1025)
- **Konfigurations-Tabellen**: `| Tab | Feld | Wert |` (z.B. Zeilen 1111-1129)
- **Verifikations-Tabellen**: Woche/Mo-Fr/Sa-So (z.B. Zeile 2821)
- Standard GitHub Flavored Markdown Pipe-Syntax

### Praxisbeispiel-Formate

**Typ 1 (inline)**: `#### Praxisbeispiel` — kurze Single-Scenario-Beispiele mit nummerierter Schrittliste, Navigationshinweisen, Verifikations-Checkpoints, Hinweisen

**Typ 2 (nummeriert)**: `### X.Y Praxisbeispiel: [Titel]` — Multi-Schritt-Walkthroughs mit `#### Schritt N — [Beschreibung]`. Abschnitt 6.6 nutzt dieses Format (Zeilen 2632-2860, 9 Schritte).

### Nachtschicht/Tageswechsel-Referenzen AUSSERHALB von Abschnitt 6

| Zeile | Kontext |
|---|---|
| 1023-1033 | Primaer-Definition in 4.6.1 (DayPlan-Konfiguration) |
| 1088, 1098 | Nachtzuschlag in 4.6.1 |
| 1105-1183 | Beispielkonfigurationen Frueh-/Spaet-/Nachtschicht |
| 1279, 1281 | Rolling-Schedule-Beispiel in 4.6.3 |
| 2955-2963 | Tagesberechnung nach Genehmigung (7.3, Stundenkredit) |

### Urlaubskapitel-Referenz

**Kein Verweis auf Nachtschicht oder Tageswechsel im Urlaubskapitel** (## 7., Zeilen 2862-3183). Der Stundengutschrift-Abschnitt bei Zeile 2955-2963 erwaehnt "Tagesplan" generisch, aber nicht `dayChangeBehavior` oder Nachtschicht-spezifisches.

---

## 8. POTENZIELLE UEBERRASCHUNGEN

### Letzte 10 Migrationen

Alle im Bereich `20260424-20260429`. **Keine beruehrt `absence_days`, `vacation_balances`, `employee_day_plans` oder `day_plans` strukturell.** Die RLS-Migration `20260429000000_enable_rls_all_public_tables.sql` aktiviert RLS auf `absence_days`, aber das ist fuer Prisma ein No-Op (Service-Role-Key umgeht RLS).

### Kollidierende Tickets

- **pflicht-02 (DATEV-Zuschlaege)**: Modifiziert `daily-calc.ts` und Payroll-Export — selbe Datei wie pflicht-01's Refactoring-Target `daily-calc.helpers.ts`. Merge-Conflict-Oberflaeche auf `daily-calc.ts`. Ticket explizit als parallel-moeglich deklariert.
- **ZMI-TICKET-037 (Vacation Deduction by Day Plan)**: Spezifikations-Ticket das `vacationDeduction` betrifft, aber kein aktiver Plan-File existiert. Keine laufende Arbeit.

### Cron-Jobs mit Absenz/DailyCalc-Bezug

| Cron | Zeitplan | Relevanz |
|---|---|---|
| `calculate-days/route.ts` | taeglich 02:00 UTC | **KERN**: Ruft `DailyCalcService.calculateDay()` → nutzt `applyDayChangeBehavior()`. Refactoring fliesst durch diesen Pfad. |
| `calculate-months/route.ts` | monatlich 2. um 03:00 UTC | **KERN**: `MonthlyCalcService.recalculateMonth()` liest `AbsenceDay`-Rows direkt (Zeile 315), baut `buildAbsenceSummary()` (monthly-calc.ts:659) → `MonthlyValue.vacationTaken`. |
| `generate-day-plans/route.ts` | woechentlich So 01:00 UTC | **INDIREKT**: Erzeugt EmployeeDayPlan-Rows. Neue Absenz-Logik laedt dayChangeBehavior aus diesen Rows. |

### DATEV-Export-Datenfluss

Der DATEV-Export liest **NICHT** direkt aus `AbsenceDay`. Der Pfad ist:

1. `payroll-export-service.ts:generate()` → `repo.findMonthlyValuesBatch()` → liest `MonthlyValue`-Snapshot
2. `MonthlyValue.vacationTaken` kommt aus `MonthlyCalcService.buildAbsenceSummary()` (monthly-calc.ts:659-691) — summiert `AbsenceDay.duration` direkt (gefiltert nach status="approved" und category)
3. Export emittiert DATEV-Lohnarten 2000 (Urlaub), 2001 (Krankheit), 2002 (sonstige)
4. Zuschlagswerte kommen aus `DailyAccountValue`-Aggregation — DIESE sind durch `DailyCalcService` getrieben (korrekt)

**Abgeschlossene Monate sind eingefroren** — `isClosed=true` verhindert Neuberechnung. Bereits exportierte DATEV-Daten bleiben konsistent.

### Zwei parallele `vacationTaken`-Berechnungen

| Speicherort | Quelle | Berechnung |
|---|---|---|
| `vacation_balances.taken` | `absences-service.ts:recalculateVacationTaken()` | `SUM(vacationDeduction * duration)` — mit DayPlan-Faktor |
| `monthly_values.vacation_taken` | `monthly-calc.ts:buildAbsenceSummary()` | `SUM(duration)` — ohne DayPlan-Faktor |

Beide abhaengig davon, WELCHE `AbsenceDay`-Rows existieren. pflicht-01 aendert, auf welchen Kalendertagen Rows erzeugt werden → beide Berechnungen werden konsistent betroffen.

### Kein Recalc-Trigger bei DayPlan-Aenderung

**`day-plans-service.ts` ruft KEINEN `triggerRecalc` auf.** Wenn `dayChangeBehavior` auf einem DayPlan nachtraeglich geaendert wird:

- Bestehende `AbsenceDay`-Rows bleiben unveraendert
- Bestehende `DailyValue`-Rows bleiben bis zum naechsten Cron-Lauf unveraendert
- `vacation_balances.taken` wird nicht neu berechnet (nur bei Absenz-Lifecycle-Events getriggert)
- Abgeschlossene `MonthlyValue`-Snapshots sind eingefroren

### DailyCalcContext laedt DayPlan-Range NICHT erweitert

`src/lib/services/daily-calc.context.ts:122-138` — Die Booking-Range wird um +/-1 Tag erweitert (Zeilen 116-117), aber die EmployeeDayPlan-Range wird NICHT erweitert. Die Absenz-Repository-Query muss ihre eigene Range unabhaengig um +/-1 Tag erweitern (das DailyCalcContext-Pattern kann hier nicht mitgenutzt werden, weil der Absenz-Service keinen DailyCalcContext nutzt).

### Reports-Service

`src/lib/services/reports-service.ts:496` — `findAbsenceDays()` liest via Raw SQL direkt aus `absence_days`, gefiltert nach `absence_date`. Wenn pflicht-01 aendert, auf welchen Kalendertagen AbsenceDay-Rows liegen, spiegelt sich das sofort in Reports wider (keine separate Neuberechnung noetig).

---

## Code References

### Kern-Dateien fuer pflicht-01

- `src/lib/services/daily-calc.helpers.ts:251-293` — `applyDayChangeBehavior()` (Refactoring-Target)
- `src/lib/services/daily-calc.helpers.ts:194-242` — `pairWorkBookingsAcrossDays()` (intern genutzt)
- `src/lib/services/daily-calc.types.ts:40-43` — Mode-Konstanten
- `src/lib/services/daily-calc.types.ts:78-113` — Type-Definitionen (BookingWithType, CrossDayBooking, CrossDayPair)
- `src/lib/services/daily-calc.ts:484-526` — `loadBookingsForCalculation()` (Einziger Caller von applyDayChangeBehavior)
- `src/lib/services/daily-calc.ts:311-338` — `loadEmployeeDayPlan()` (Lookup-Mechanik)
- `src/lib/services/daily-calc.context.ts:105-234` — `loadEmployeeCalcContext()` (Batch-Loading)
- `src/lib/services/absences-service.ts:120-133` — `shouldSkipDate()` (Erweiterungs-Target)
- `src/lib/services/absences-service.ts:354-593` — `createRange()` (Erweiterungs-Target)
- `src/lib/services/absences-service.ts:176-237` — `recalculateVacationTaken()` (Erweiterungs-Target)
- `src/lib/services/absences-repository.ts:200-218` — `findEmployeeDayPlans()` (Erweiterungs-Target: muss dayChangeBehavior, comeFrom, goTo laden)
- `src/lib/services/absences-repository.ts:365-384` — `findEmployeeDayPlansWithVacationDeduction()` (Potenzielle Range-Erweiterung)
- `src/components/day-plans/day-plan-form-sheet.tsx:854-871` — dayChangeBehavior Select (UI-Warning-Target)
- `docs/TERP_HANDBUCH.md:2621-2631` — Abschnitt 6.5 (Erweiterungs-Target)

### Schema-Referenzen

- `prisma/schema.prisma:2617-2737` — DayPlan Model
- `prisma/schema.prisma:2688` — dayChangeBehavior Feld
- `prisma/schema.prisma:2682` — vacationDeduction Feld
- `prisma/schema.prisma:3418-3454` — EmployeeDayPlan Model
- `prisma/schema.prisma:4650` — AbsenceDay.duration
- `prisma/schema.prisma:3195-3218` — VacationBalance Model
- `prisma/schema.prisma:2171-2204` — EmployeeTariffAssignment Model

### Test-Referenzen

- `src/lib/services/__tests__/daily-calc.helpers.test.ts:396-482` — 4 Tests fuer applyDayChangeBehavior
- `src/lib/services/__tests__/daily-calc.helpers.test.ts:323-394` — 5 Tests fuer pairWorkBookingsAcrossDays
- `src/lib/services/__tests__/absences-auto-approve.test.ts` — Tests fuer createRange

### Translation-Referenzen

- `messages/de.json:1651+` — `adminDayPlans` Block
- `messages/de.json:1739-1742` — dayChangeBehavior Option-Labels
- `messages/de.json:1762` — dayChangeBehaviorHelp
- `messages/en.json` — englische Entsprechungen

### Cron-Referenzen

- `src/app/api/cron/calculate-days/route.ts` — taeglich, nutzt DailyCalcService
- `src/app/api/cron/calculate-months/route.ts` — monatlich, liest AbsenceDay-Rows
- `src/app/api/cron/generate-day-plans/route.ts` — woechentlich, erzeugt EmployeeDayPlan-Rows

---

## Open Questions

1. **`calculateWorkingDays()` in `vacation-impact-preview.tsx`**: Die Client-Side-Preview zaehlt nur Wochentage minus Feiertage. Bei `at_departure`-Nachtschichten wuerden die korrekte Tageszuordnung und die Preview-Anzeige divergieren (z.B. Preview sagt "5 Tage", aber tatsaechlich werden 5 andere Tage gebucht). Ob die Preview angepasst werden muss, ist im Ticket nicht adressiert.

2. **`findEmployeeDayPlansWithVacationDeduction()` Range**: Diese Query in `recalculateVacationTaken()` laedt aktuell den gesamten Jahresbereich. Wenn ein Absenz-Tag durch dayChangeBehavior auf einen anderen Kalendertag verschoben wird, muss die vacationDeduction vom **effektiven** Tag genommen werden, nicht vom **gebuchten** Tag. Dies benoetigt ggf. eine konsistente Lookup-Logik.

3. **Bestehende Absenz-Daten bei Prod-Cutover**: Das Ticket sagt "kein Backfill noetig", aber wenn die Nachtschicht-DayPlaene VOR dem Code-Deploy konfiguriert werden und Absenzen NACH dem Deploy gebucht werden, gibt es ein Zeitfenster in dem das Verhalten inkonsistent ist. Das Cutover-Timing ist relevant.
