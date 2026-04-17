# DATEV-Zuschläge im Export-Template + DayPlanBonus-Update Implementation Plan

## Overview

Schließt die drei konkreten Lücken aus der Recherche `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`:
(A) Template-Engine-Kontext bekommt Konten-Summen, (B) `DayPlanBonus` bekommt eine Update-Operation auf allen Schichten, (C) Demo-Seed und Handbuch werden auf End-to-End-Onboarding getrimmt. **Kein neues Datenmodell, keine Änderung an `calculateSurcharges()`, keine Änderung am hart-codierten `generateDatevLodas()`-Pfad.**

## Current State Analysis

End-to-End-Zuschlags-Flow funktioniert bereits (Recherche-Befund):
```
DayPlanBonus (am Tagesplan) — prisma/schema.prisma:2776-2797
  → convertBonusesToSurchargeConfigs — src/lib/services/daily-calc.helpers.ts:409-424
  → calculateSurcharges — src/lib/calculation/surcharges.ts:31-95
  → DailyAccountValue (source="surcharge") — src/lib/services/daily-calc.ts:1624-1693
  → Pfad A: generateDatevLodas — src/lib/services/payroll-export-service.ts:135-190  ✅ funktioniert
  → Pfad B: LiquidJS-Template-Engine — src/lib/services/export-context-builder.ts:98-124  ❌ Konten-Werte fehlen
```

Die drei konkreten Lücken:

- **Lücke 1 (Template-Kontext)**: `ExportContextEmployee.monthlyValues` (`src/lib/services/export-context-builder.ts:156-163`) exponiert nur sechs Felder (`targetHours`, `workedHours`, `overtimeHours`, `vacationDays`, `sickDays`, `otherAbsenceDays`). Die sechs Seed-Templates in `supabase/migrations/20260418100000_create_phase3_payroll_tables.sql:71-273` und der `default_payroll_wages`-Seed (`supabase/migrations/20260417100000_create_export_templates_and_payroll_wages.sql:104-125`) referenzieren `terpSource`-Werte `nightHours` / `sundayHours` / `holidayHours` für Codes 1003/1004/1005 — diese Felder existieren im Code nicht.
- **Lücke 2 (Update-CRUD)**: `src/lib/services/day-plans-repository.ts:145-166` hat nur `findBonusById`, `createBonus`, `deleteBonus`. Entsprechend fehlt `updateBonus` auf allen Schichten (Service `day-plans-service.ts:784-843`, Router `dayPlans.ts:627-674`, Hook `use-day-plans.ts:177-216`, UI `day-plan-detail-sheet.tsx:322-481`).
- **Lücke 3 (Seed + Doku)**: `supabase/seed.sql:433-441` legt die Demo-Bonus-Konten `NIGHT` / `SAT` / `SUN` ohne `payrollCode` und ohne `isPayrollRelevant=true` an. Handbuch `docs/TERP_HANDBUCH.md` hat nur ein Nachtzuschlag-Praxisbeispiel (`1086-1101`), nicht Sonntag/Feiertag, und keinen End-to-End-Ablauf bis zur Steuerberater-Übergabe.

### Key Discoveries:

- **Aggregationshelfer existiert und ist generisch verwendbar**: `aggregateDailyAccountValues` (`src/lib/services/payroll-export-repository.ts:189-210`) macht `groupBy(['employeeId', 'accountId']).sum('valueMinutes')` ohne `source`-Filter — konsistent mit `generateDatevLodas` und direkt für den Template-Kontext wiederverwendbar.
- **Template-Lookup-Pattern**: Alle 6 Seed-Templates nutzen identisch `{%- assign val = employee.monthlyValues[wage.terpSource] -%}` (`supabase/migrations/20260418100000_create_phase3_payroll_tables.sql:103`, `154`, `188`, `213`, `238`, `264`). Ein zentraler Wechsel auf einen Liquid-Filter ist ein eindeutiges Find-and-Replace.
- **Custom-Filter-Registry existiert**: `src/lib/services/liquid-engine.ts:26-98` registriert bereits 6 Custom-Filter (`datev_date`, `datev_decimal`, `datev_string`, `pad_left`, `pad_right`, `mask_iban`). Einen siebten anzuhängen ist ein minimaler Eingriff.
- **Post-Launch-Stubs existieren bereits**: `thoughts/shared/tickets/post-launch/post-launch-3b-steuerfreie-zuschlaege.md` und `thoughts/shared/tickets/prodi-prelaunch/soll-08-zuschlagsvorlagen-tarifvertraege.md` sind bereits mit dem korrekten Inhalt geschrieben. Block D des Tickets ist Doku-Verifikation, keine neue Arbeit.
- **Modelle heißen `DefaultPayrollWage` / `TenantPayrollWage`** (`prisma/schema.prisma:3875-3906`), nicht `SystemPayrollWage` — die Ticket-Formulierung ist an dieser Stelle ungenau.
- **Existierende Bonus-CRUD emittiert keinen Audit-Log**: `createBonusFn` (`day-plans-service.ts:784-819`) und `removeBonus` (`821-843`) schreiben keine `audit_logs`-Rows. Die geplante `updateBonusFn`-Funktion bekommt Audit-Logging pro Ticket-Forderung B2, weil das semantisch korrekt ist — die bestehende Lücke bei create/delete wird hier nicht mit-repariert (bewusster Scope-Cut, siehe „What We're NOT Doing").
- **Bonus-UI lädt das Konto derzeit nicht korrekt**: `day-plan-detail-sheet.tsx:328` liest `(bonus as { account?: { name: string } }).account?.name`, aber das Output-Schema `dayPlanBonusOutputSchema` (`dayPlans.ts:77-90`) enthält **kein** `account`-Feld, und das Mapping `mapDayPlanToOutput` (`dayPlans.ts:373-388`) liefert auch keines. Die UI zeigt also bereits heute immer `t('unknownAccount')` als Bonus-Label. Dieses Bug-Fix fällt natürlich in den UI-Refactor der Edit-UI (Phase 2) hinein und wird dort mit behoben.

## Desired End State

Nach Abschluss aller Phasen gilt:

1. **Template-Kontext**: `ExportContextEmployee.accountValues: Record<string, number>` (Key = `Account.code`, Value = Stunden = `minutes/60`, sparse — nur Einträge mit Wert ≠ 0). Alle aktiven Konten des Tenants (unabhängig von `accountType`) erscheinen. Verifikation: `buildExportContext()` aufrufen für einen Tenant mit `DailyAccountValue`-Rows und prüfen, dass `accountValues` das Konto enthält.
2. **Template-Filter**: Neuer Liquid-Filter `terp_value` in `liquid-engine.ts` — Signatur `terpSource | terp_value: employee`. Resolved:
   - `terpSource` beginnend mit `"account:"` → `employee.accountValues[code]`
   - alle anderen → `employee.monthlyValues[terpSource]`
   - bei Miss: `0`
   Verifikation: Unit-Tests für alle drei Fälle.
3. **Seed-Templates aktualisiert**: Alle sechs System-Templates (DATEV LODAS Bewegung, DATEV LODAS Stamm+Bewegung, DATEV LuG, Lexware, SAGE, Generic CSV) rendern über den Filter. Verifikation: Template-Rendering gibt für `wage.terpSource="account:NIGHT"` den Wert aus `accountValues.NIGHT` zurück.
4. **PayrollWage-Seed aktualisiert**: `default_payroll_wages` und bestehende `tenant_payroll_wages` haben für Codes 1003/1004/1005 neuen `terp_source` (`account:NIGHT`, `account:SUN`, `account:SUN` bzw. Feiertagskonto — siehe Design-Entscheidung unten).
5. **DayPlanBonus-Update**: Admin kann eine Bonus-Zeile im DayPlan-Detail-Sheet editieren (Inline- oder Sub-Sheet-UI); alle sieben Felder (`accountId` über Select, `timeFrom`, `timeTo`, `calculationType`, `valueMinutes`, `minWorkMinutes`, `appliesOnHoliday`) sind editierbar; Validierung identisch zu Create. Audit-Log wird geschrieben.
6. **Seed + Handbuch**: Demo-Tenant-Bonus-Konten haben `payrollCode` und `isPayrollRelevant=true`; Handbuch hat drei End-to-End-Praxisbeispiele (Nacht, Sonntag, Feiertag) und eine DATEV-Zuschlags-Onboarding-Checkliste.

### Key Discoveries:

- **Backwards-Compat-Hebel**: Tenant-Custom-Templates, die das alte Muster `{{ employee.monthlyValues[wage.terpSource] }}` nutzen, brechen nicht für Nicht-`account:`-`terpSource`-Werte. Für die drei migrierten Codes 1003/1004/1005 würden sie jedoch leer werden (`monthlyValues["account:NIGHT"]` = undefined, → Ausgabe leer). Das ist akzeptabel, weil das ALT-Verhalten für diese drei Codes ebenfalls leer war (`monthlyValues.nightHours` hatte nie einen Wert).
- **Aggregation `source`-Filter**: Die Aggregation summiert bewusst über alle `source`-Werte. Ein Zuschlagskonto (`NIGHT`) bekommt in der Regel ausschließlich `source="surcharge"`-Rows; die Summe ist identisch. Andere Kontentypen (`day`/`month`) können Mischungen haben und werden korrekt summiert — konsistent mit `generateDatevLodas`.

## What We're NOT Doing

- **Keine Änderung an `calculateSurcharges()`** (`src/lib/calculation/surcharges.ts`) oder `postSurchargeValues()` (`daily-calc.ts:1624-1693`).
- **Keine Änderung an `generateDatevLodas()`** (`payroll-export-service.ts:135-190`).
- **Kein neues Prisma-Modell** (kein `SurchargeRule`, keine tenant-weite Zuschlagstabelle).
- **Kein `isActive` / `validFrom` / `validTo` / `taxFreePercentage` / `priority` auf `DayPlanBonus`** — bleibt Post-Launch.
- **Kein §3b-EStG-Split** — bleibt Post-Launch (Ticket existiert bereits).
- **Kein Highest-Wins-/Stacking-Mode** — bleibt Post-Launch.
- **Kein Audit-Log-Backfill** für bestehendes `createBonusFn` / `removeBonus` (bewusster Scope-Cut; wäre eine separate Refactor-Story).
- **Keine UI-Vereinheitlichung zwischen Breaks und Bonuses** — Breaks bleiben ohne Update-Flow (separate Story).
- **Keine Platzhalter-Lohnart-Nummern-Validierung** — der Steuerberater liefert die echten Werte per Admin-UI vor Go-Live; Demo-Seed-Werte sind bewusst Platzhalter.

## Implementation Approach

Vier Phasen, linear ausführbar. Phase 1 und Phase 2 sind weitgehend unabhängig und können auch parallel entwickelt werden, müssen aber sequentiell gemergt werden (Phase 1 liefert `accountValues` als öffentliches Template-Kontext-API; Phase 2 fasst die Seite, die das konsumiert, nicht an). Phase 3 ist reine Seed-/Handbuch-Arbeit und kann jederzeit gezogen werden. Phase 4 ist Verifikation (beide Stubs existieren bereits).

**Design-Entscheidung: `terp_value`-Filter statt Template-Side-If**: Ein einzelner Liquid-Filter zentralisiert die Resolution, bleibt testbar in TypeScript und lässt alle 6 Seed-Templates in einer 1-Zeilen-Änderung pro Template migrieren. Template-Side-If (`{% if wage.terpSource contains "account:" %}…`) wäre verbose und würde die gleiche Logik in jedem Template wiederholen.

**Design-Entscheidung: Zielkonto für Code 1005 (Feiertagsarbeit)**: Das Demo-Seed-Konto heißt `SUN` („Sunday/Holiday Bonus") und wird über `DayPlanBonus.appliesOnHoliday` sowohl für Sonntags- als auch für Feiertagsbuchungen verwendet. Damit der DATEV-Export aber saubere zwei Lohnarten bekommt (Code 1004 = Sonntag, Code 1005 = Feiertag), braucht der Demo-Seed ein **zweites** Feiertags-Konto oder eine andere Trennung. Pragmatisch lösen wir: **`default_payroll_wages` Code 1004 → `account:SUN`, Code 1005 bleibt vorerst bei einem separaten, neu anzulegenden Konto `HOLIDAY` oder zeigt ebenfalls auf `account:SUN`** — der Demo-Seed legt ein zusätzliches `HOLIDAY`-Konto an, so dass Tenants im Pre-Launch die Trennung explizit machen können. Pro-Di kann in seinem echten Setup später entscheiden, ob beide Codes auf dasselbe Konto zeigen (Steuerberater klärt). Siehe Phase 1.4 für die genaue Konto-Definition.

---

## Phase 1: Export-Context um Account-Werte erweitern + Template-Resolution

### Overview
Block A aus dem Ticket. `ExportContextEmployee` bekommt ein neues sparse `accountValues`-Property. Die LiquidJS-Engine bekommt einen neuen `terp_value`-Filter. Die sechs System-Templates werden über eine neue Migration auf den Filter umgestellt und die Codes 1003/1004/1005 bekommen das neue `terpSource`-Format. Rückwärtskompatibilität bleibt erhalten, weil der Filter für nicht-`account:`-Werte auf `monthlyValues` zurückfällt.

### Changes Required:

#### 1. Aggregationshelfer für Account-Summen (Repository)
**File**: `src/lib/services/payroll-export-repository.ts`
**Changes**: Neue Funktion `aggregateAllActiveAccountsForEmployees` — wrapper um `aggregateDailyAccountValues`, der zusätzlich die Kontenliste auflöst (keine Account-ID-Parameter nötig; zieht alle aktiven Konten des Tenants aus `accounts`-Tabelle). Signatur:

```ts
export async function aggregateAccountValuesForContext(
  prisma: PrismaClient,
  tenantId: string,
  employeeIds: string[],
  year: number,
  month: number,
): Promise<Array<{ employeeId: string; accountCode: string; hours: number }>>
```

Implementierung:
1. `prisma.account.findMany({ where: { OR: [{ tenantId }, { tenantId: null }], isActive: true }, select: { id: true, code: true } })` — globale System-Konten + Tenant-Konten.
2. Wiederverwendung von `aggregateDailyAccountValues(prisma, tenantId, employeeIds, accountIds, year, month)`.
3. Join über `accountId → code`, Konvertierung `minutes/60` → hours, filter Werte ≠ 0.

Rationale: Hält die Roh-`groupBy`-Logik in einem Ort; der context-builder muss keine Prisma-Queries kennen.

#### 2. Employee-Kontext um `accountValues` erweitern
**File**: `src/lib/services/export-context-builder.ts`
**Changes**:

- Erweitere `ExportContextEmployee`-Interface (line 98-233): neues Property `accountValues: Record<string, number>` direkt nach `monthlyValues`.
- In `buildExportContext` (line 335-658) nach dem MonthlyValue-Batch (line 479-484) den neuen Helper aufrufen:

```ts
const accountAgg = empIds.length
  ? await repo.aggregateAccountValuesForContext(prisma, tenantId, empIds, year, month)
  : []
const accountValuesMap = new Map<string, Record<string, number>>()
for (const row of accountAgg) {
  const empMap = accountValuesMap.get(row.employeeId) ?? {}
  empMap[row.accountCode] = row.hours
  accountValuesMap.set(row.employeeId, empMap)
}
```

- Im Employee-Mapping (line 486-639) neues Feld setzen:

```ts
accountValues: accountValuesMap.get(emp.id) ?? {},
```

Import auf Datei-Top: `import * as repo from "./payroll-export-repository"` — existiert aktuell **nicht** in `export-context-builder.ts`; Import hinzufügen.

Rationale: Sparse `Record<string, number>` ist JSON-serialisierbar und LiquidJS-freundlich (object-access via `obj[key]`). `ownPropertyOnly: true` im Engine-Setup (`liquid-engine.ts:15`) akzeptiert reine Objekt-Keys.

#### 3. Neuer Liquid-Filter `terp_value`
**File**: `src/lib/services/liquid-engine.ts`
**Changes**: Füge in `registerDatevFilters` einen siebten Filter hinzu:

```ts
engine.registerFilter(
  "terp_value",
  (
    terpSource: string | null | undefined,
    employee:
      | {
          accountValues?: Record<string, number> | null
          monthlyValues?: Record<string, number> | null
        }
      | null
      | undefined,
  ) => {
    if (!terpSource || !employee) return 0
    if (terpSource.startsWith("account:")) {
      const code = terpSource.slice("account:".length)
      return employee.accountValues?.[code] ?? 0
    }
    return employee.monthlyValues?.[terpSource] ?? 0
  },
)
```

Rationale: Pure-Function, gut testbar. Default `0` statt `null`/`undefined` verhindert `NaN` bei anschließendem `datev_decimal`-Filter.

#### 4. Neue Migration — PayrollWage-Seed + System-Templates + Default-Feiertagskonto
**File**: `supabase/migrations/20260418200000_datev_surcharge_terpsource_update.sql` (neue Migration, Zeitstempel später als `20260418100000_create_phase3_payroll_tables`)

**Changes (SQL, 4 Blöcke)**:

Block A — `default_payroll_wages` auf `account:`-Prefix umstellen:
```sql
UPDATE default_payroll_wages SET terp_source = 'account:NIGHT'   WHERE code = '1003';
UPDATE default_payroll_wages SET terp_source = 'account:SUN'     WHERE code = '1004';
UPDATE default_payroll_wages SET terp_source = 'account:HOLIDAY' WHERE code = '1005';
```

Block B — `tenant_payroll_wages`-Bestand migrieren (für bereits initialisierte Tenants):
```sql
UPDATE tenant_payroll_wages SET terp_source = 'account:NIGHT'   WHERE terp_source = 'nightHours';
UPDATE tenant_payroll_wages SET terp_source = 'account:SUN'     WHERE terp_source = 'sundayHours';
UPDATE tenant_payroll_wages SET terp_source = 'account:HOLIDAY' WHERE terp_source = 'holidayHours';
```

Block C — Alle 6 System-Templates auf den neuen Filter umstellen. Pragmatisches REPLACE im Template-Body:
```sql
UPDATE system_export_templates
SET template_body = REPLACE(
  template_body,
  'employee.monthlyValues[wage.terpSource]',
  'wage.terpSource | terp_value: employee'
)
WHERE template_body LIKE '%employee.monthlyValues[wage.terpSource]%';
```

Das erfasst alle sechs Seed-Templates (Muster identisch, siehe Recherche Zeilen 103, 154, 188, 213, 238, 264 in `20260418100000`).

⚠️ **Konkretere Form**: `{%- assign val = employee.monthlyValues[wage.terpSource] -%}` wird zu `{%- assign val = wage.terpSource | terp_value: employee -%}`. Beide Strings sind 1:1-tauschbar. REPLACE ist idempotent (läuft nochmal → no-op).

Block D — `default_payroll_wages` braucht ggf. Name-Update für 1005, wenn wir `HOLIDAY` statt `SUN` verwenden — Name bleibt unverändert ("Feiertagsarbeit"), nur `terp_source` ändert sich.

**Wichtig**: Migration ist **idempotent**:
- `UPDATE … WHERE code = '1003'` kann mehrfach laufen, gleicher Endzustand.
- `REPLACE` auf Template-Body ist idempotent, wenn das Muster nicht mehr existiert.

#### 5. Demo-Seed aktualisieren (Teil von Phase 1, weil es Block C sauber an Phase 1 koppelt)
**File**: `supabase/seed.sql` (Zeilen 433-441)
**Changes**:
- Spalten `payroll_code` und `is_payroll_relevant` ins INSERT aufnehmen.
- Zusätzliches `HOLIDAY`-Konto anlegen für Code 1005 (sonst ist die Seed-Lohnart auf kein reales Konto mappbar).
- Werte: `NIGHT` → `1015`, `SAT` → `1020`, `SUN` → `1025`, **neu** `HOLIDAY` → `1030`. Alle mit `is_payroll_relevant = true`.

Beispiel neuer Insert-Block:
```sql
INSERT INTO accounts (id, tenant_id, code, name, account_type, unit, is_system, is_active, is_payroll_relevant, payroll_code, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000001101', '10000000-0000-0000-0000-000000000001', 'NIGHT',   'Night Shift Bonus',   'bonus', 'minutes', false, true, true, '1015', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001102', '10000000-0000-0000-0000-000000000001', 'SAT',     'Saturday Bonus',      'bonus', 'minutes', false, true, true, '1020', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001103', '10000000-0000-0000-0000-000000000001', 'SUN',     'Sunday Bonus',        'bonus', 'minutes', false, true, true, '1025', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001107', '10000000-0000-0000-0000-000000000001', 'HOLIDAY', 'Holiday Bonus',       'bonus', 'minutes', false, true, true, '1030', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001104', '10000000-0000-0000-0000-000000000001', 'ONCALL',  'On-Call Duty',        'day',   'minutes', false, true, false, NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001105', '10000000-0000-0000-0000-000000000001', 'TRAVEL',  'Travel Time',         'day',   'minutes', false, true, false, NULL, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000001106', '10000000-0000-0000-0000-000000000001', 'SICK',    'Sick Leave Balance',  'month', 'days',    false, true, false, NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
```

Der SUN-Konto-Name wird von "Sunday/Holiday Bonus" auf reines "Sunday Bonus" geändert, weil wir jetzt ein separates HOLIDAY-Konto haben.

### Success Criteria:

#### Automated Verification:
- [x] Typecheck bleibt sauber: `pnpm typecheck` (keine neuen Fehler in geänderten Dateien; pre-existing Fehler unverändert)
- [x] Lint bleibt sauber: `pnpm lint` (keine neuen Befunde; pre-existing Warnungen unverändert)
- [x] Unit-Tests grün: `pnpm vitest run src/lib/services/__tests__/export-context-builder.test.ts`
- [x] Unit-Tests grün: `pnpm vitest run src/lib/services/__tests__/liquid-engine.test.ts` (7 neue `terp_value`-Tests)
- [ ] Integration-Test: Render-Test des Seed-Templates "DATEV LODAS — Bewegungsdaten" mit einem Employee, der `accountValues.NIGHT > 0` hat → Output enthält `;1003;` mit korrektem Stundenwert — _noch nicht hinzugefügt, benötigt DB-Fixture_
- [ ] Migration idempotent: `pnpm db:reset && psql … -c "select count(*) from tenant_payroll_wages where terp_source like 'account:%'"` — erwarteter Count > 0 nach Reset; zweites Laufenlassen der Migration bricht nicht — _manuell zu verifizieren_
- [ ] Keine bestehenden Tests brechen (Regression-Guard): `pnpm test` — _manuell zu verifizieren_

#### Manual Verification:
- [ ] `pnpm db:reset` — Demo-Tenant hat die vier Bonus-Konten `NIGHT`, `SAT`, `SUN`, `HOLIDAY` mit gesetztem `payroll_code`
- [ ] Admin-UI: Verwaltung → Lohnart-Mapping zeigt Codes 1003/1004/1005 mit `terp_source = account:NIGHT/SUN/HOLIDAY`
- [ ] Admin-UI: Verwaltung → Tagespläne → Detail → Zuschlag hinzufügen mit `NIGHT`-Konto, Zeitfenster 22:00–06:00, Wert 25%
- [ ] Demo-Employee bucht Nachtstunden → Monats-Export via Template-basiert mit dem Seed-Template → Download → CSV enthält Lohnart `1003` mit korrektem Stundenwert

**Implementation Note**: Nach Abschluss dieser Phase pausieren und den manuellen Template-Export-Check durch die menschliche Review bestätigen lassen, bevor Phase 2 startet.

---

## Phase 2: DayPlanBonus Update-Operation (Repository → UI)

### Overview
Block B aus dem Ticket. Vollständige Update-Schicht: Repository, Service (mit Audit-Log), tRPC-Router, React-Hook, UI-Edit-Modus im DayPlan-Detail-Sheet. Im selben Aufwasch wird der bestehende UI-Bug behoben, dass `bonus.account.name` nie befüllt ist.

### Changes Required:

#### 1. Repository-Funktion `updateBonus`
**File**: `src/lib/services/day-plans-repository.ts`
**Changes**: Nach Zeile 166 (`deleteBonus`) neue Funktion:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateBonus(prisma: PrismaClient, bonusId: string, data: any) {
  return prisma.dayPlanBonus.update({
    where: { id: bonusId },
    data,
  })
}
```

Signatur analog zu `createBonus` (line 158) — bewusst `any` für `data`, weil das Service-Layer die Typisierung und Validierung macht.

#### 2. Detail-Include mit Account-Name erweitern (UI-Bug-Fix)
**File**: `src/lib/services/day-plans-repository.ts` (line 10-13)
**Changes**: `dayPlanDetailInclude` um das Account-Join für Bonuses erweitern:

```ts
const dayPlanDetailInclude = {
  breaks: { orderBy: { sortOrder: "asc" as const } },
  bonuses: {
    orderBy: { sortOrder: "asc" as const },
    include: { account: { select: { id: true, code: true, name: true } } },
  },
} as const
```

Dies macht `account.name` für die UI verfügbar. Der bestehende `day-plan-detail-sheet.tsx:328`-Zugriff wird dadurch ohne Cast korrekt.

#### 3. Output-Schema erweitern
**File**: `src/trpc/routers/dayPlans.ts` (line 77-90)
**Changes**: `dayPlanBonusOutputSchema` um ein optionales `account`-Nested-Objekt ergänzen:

```ts
const dayPlanBonusOutputSchema = z.object({
  id: z.string(),
  dayPlanId: z.string(),
  accountId: z.string(),
  timeFrom: z.number(),
  timeTo: z.number(),
  calculationType: z.string(),
  valueMinutes: z.number(),
  minWorkMinutes: z.number().nullable(),
  appliesOnHoliday: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  account: z
    .object({ id: z.string(), code: z.string(), name: z.string() })
    .nullable()
    .optional(),
})
```

Und im `mapDayPlanToOutput` (`dayPlans.ts:373-388`) das Account-Mapping ergänzen:

```ts
account: (b.account as { id: string; code: string; name: string } | null | undefined) ?? null,
```

#### 4. Service-Funktion `updateBonusFn` mit Audit-Log
**File**: `src/lib/services/day-plans-service.ts`
**Changes**: Nach `removeBonus` (Zeile 843) neue Funktion:

```ts
export async function updateBonusFn(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    dayPlanId: string
    bonusId: string
    accountId?: string
    timeFrom?: number
    timeTo?: number
    calculationType?: string
    valueMinutes?: number
    minWorkMinutes?: number | null
    appliesOnHoliday?: boolean
    sortOrder?: number
  },
  audit?: AuditContext,
) {
  // Verify parent day plan exists and belongs to tenant
  const dayPlan = await repo.findByIdBasic(prisma, tenantId, input.dayPlanId)
  if (!dayPlan) throw new DayPlanNotFoundError()

  // Verify bonus exists and belongs to the day plan (tenant scope via parent)
  const existing = await repo.findBonusById(prisma, input.bonusId, input.dayPlanId)
  if (!existing) throw new BonusNotFoundError()

  // If both time fields are in the update, validate them together;
  // otherwise merge with the existing value for validation.
  const effectiveFrom = input.timeFrom ?? existing.timeFrom
  const effectiveTo   = input.timeTo   ?? existing.timeTo
  validateBonus(effectiveFrom, effectiveTo)

  // Build partial update data (only provided fields)
  const data: Record<string, unknown> = {}
  if (input.accountId !== undefined)        data.accountId = input.accountId
  if (input.timeFrom !== undefined)         data.timeFrom = input.timeFrom
  if (input.timeTo !== undefined)           data.timeTo = input.timeTo
  if (input.calculationType !== undefined)  data.calculationType = input.calculationType
  if (input.valueMinutes !== undefined)     data.valueMinutes = input.valueMinutes
  if (input.minWorkMinutes !== undefined)   data.minWorkMinutes = input.minWorkMinutes
  if (input.appliesOnHoliday !== undefined) data.appliesOnHoliday = input.appliesOnHoliday
  if (input.sortOrder !== undefined)        data.sortOrder = input.sortOrder

  const updated = await repo.updateBonus(prisma, input.bonusId, data)

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "day_plan_bonus",
        entityId: input.bonusId,
        entityName: null,
        changes: auditLog.computeChanges(
          existing as unknown as Record<string, unknown>,
          updated as unknown as Record<string, unknown>,
          [
            "accountId",
            "timeFrom",
            "timeTo",
            "calculationType",
            "valueMinutes",
            "minWorkMinutes",
            "appliesOnHoliday",
            "sortOrder",
          ],
        ),
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}
```

Rationale: Audit-Log explizit pro Ticket B2. `validateBonus` konsistent mit Create. Ownership-Check via Parent-DayPlan (wie `removeBonus`).

#### 5. tRPC-Router: `updateBonus`-Procedure
**File**: `src/trpc/routers/dayPlans.ts`
**Changes**:

- Neues Input-Schema nach `deleteBonusInputSchema` (line 285-288):

```ts
const updateBonusInputSchema = z.object({
  dayPlanId: z.string(),
  bonusId: z.string(),
  accountId: z.string().optional(),
  timeFrom: z.number().int().optional(),
  timeTo: z.number().int().optional(),
  calculationType: z.enum(CALCULATION_TYPES).optional(),
  valueMinutes: z.number().int().min(1).optional(),
  minWorkMinutes: z.number().int().nullable().optional(),
  appliesOnHoliday: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
```

- Neue Procedure zwischen `createBonus` (line 627) und `deleteBonus` (line 663):

```ts
updateBonus: tenantProcedure
  .use(requirePermission(DAY_PLANS_MANAGE))
  .input(updateBonusInputSchema)
  .output(dayPlanBonusOutputSchema)
  .mutation(async ({ ctx, input }) => {
    try {
      const bonus = await dayPlansService.updateBonusFn(
        ctx.prisma,
        ctx.tenantId!,
        input,
        { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
      )
      return {
        id: bonus.id,
        dayPlanId: bonus.dayPlanId,
        accountId: bonus.accountId,
        timeFrom: bonus.timeFrom,
        timeTo: bonus.timeTo,
        calculationType: bonus.calculationType,
        valueMinutes: bonus.valueMinutes,
        minWorkMinutes: bonus.minWorkMinutes,
        appliesOnHoliday: bonus.appliesOnHoliday,
        sortOrder: bonus.sortOrder,
        createdAt: bonus.createdAt,
        updatedAt: bonus.updatedAt,
      }
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

#### 6. React-Hook `useUpdateDayPlanBonus`
**File**: `src/hooks/use-day-plans.ts`
**Changes**: Nach `useCreateDayPlanBonus` (line 177-194) neuer Hook:

```ts
export function useUpdateDayPlanBonus() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.dayPlans.updateBonus.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.dayPlans.list.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.dayPlans.getById.queryKey() })
      queryClient.invalidateQueries({ queryKey: trpc.employees.dayView.queryKey() })
    },
  })
}
```

Exports über `src/hooks/index.ts` (bereits etabliertes Pattern, keine manuelle Änderung nötig wenn der Hook aus `@/hooks` barrel-export gezogen wird; falls explizit gelistet, entsprechend ergänzen).

#### 7. UI — Edit-Modus pro Bonus-Zeile im Detail-Sheet
**File**: `src/components/day-plans/day-plan-detail-sheet.tsx`
**Changes**:

- Zusätzlicher State für Edit-Modus:

```ts
const [editingBonusId, setEditingBonusId] = useState<string | null>(null)
const [editBonus, setEditBonus] = useState<{
  accountId: string
  timeFrom: number
  timeTo: number
  calculationType: 'fixed' | 'per_minute' | 'percentage'
  valueMinutes: number
  minWorkMinutes: number | null
  appliesOnHoliday: boolean
} | null>(null)
const updateBonusMutation = useUpdateDayPlanBonus()
```

- Bonus-Zeile bekommt einen „Bearbeiten"-Button (Pencil-Icon) neben dem Delete-Button (lines 326-340):

```tsx
<Button
  variant="ghost"
  size="sm"
  className="h-6 w-6 p-0"
  onClick={() => startEditBonus(bonus)}
  disabled={updateBonusMutation.isPending || deleteBonusMutation.isPending}
>
  <Edit className="h-3 w-3" />
</Button>
```

- Wenn `editingBonusId === bonus.id`: Die Zeile rendert das **gleiche Formular** wie die Add-Bonus-Form (lines 359-469), aber gegen den lokalen `editBonus`-State. „Speichern"-Button ruft `updateBonusMutation.mutateAsync({ dayPlanId, bonusId: editingBonusId, ...editBonus })`, „Abbrechen" setzt `editingBonusId = null`.
- Extraktion in eine kleine interne `BonusForm`-Komponente ist sinnvoll, um die Form-Markup-Wiederholung zwischen Add und Edit zu vermeiden (die Add-Form von line 359-469 wird 1:1 für Edit wiederverwendet; die einzige Differenz sind die Default-Werte + Submit-Handler + Labels). Das ist eine saubere `useState`-basierte Refactoring-Maßnahme, kein separates Sheet.
- Aufgrund des bestehenden Scrollareas im Sheet ist ein separates Nested-Sheet nicht nötig; Inline-Edit passt zur UX des Detail-Sheets.

**Translation-Keys** (in `messages/de.json` + `messages/en.json`, Abschnitt `adminDayPlans`):

Neue Keys:
- `editBonus` — „Zuschlag bearbeiten" / „Edit bonus"
- `saveBonus` — „Speichern" / „Save"
- `bonusUpdated` — „Zuschlag aktualisiert" (optional für Toast)

### Success Criteria:

#### Automated Verification:
- [x] Typecheck bleibt sauber: `pnpm typecheck` (keine neuen Fehler in geänderten Dateien)
- [x] Lint bleibt sauber: `pnpm lint` (keine neuen Befunde in geänderten Dateien)
- [x] Unit-Tests grün: `pnpm vitest run src/trpc/routers/__tests__/dayPlans-router.test.ts` (6 neue `updateBonus`-Tests: all-fields / partial / validation / ownership / bonus-not-found / dayplan-not-found)
- [x] `src/lib/services/__tests__/day-plans-service.test.ts` existiert nicht; die gesamte Service-Logik (inkl. Partial-Update/Validation/Ownership) wird über den Router-Test abgedeckt
- [ ] Integration-Test grün: bonus updaten, re-calculate triggern, `DailyAccountValue` hat neue Werte — _manuell zu verifizieren_

#### Manual Verification:
- [ ] Admin öffnet Tagesplan mit bestehendem Bonus → Bleistift-Icon sichtbar
- [ ] Klick auf Bleistift → Inline-Formular öffnet sich mit Default-Werten aus Bonus
- [ ] Änderung `valueMinutes` von 15 auf 25 → Speichern → Liste zeigt neuen Wert sofort
- [ ] Änderung `appliesOnHoliday` → Neu-Berechnung eines Feiertags-Tages zeigt geändertes Verhalten (Zuschlag greift/greift nicht mehr)
- [ ] Audit-Log (falls UI existiert): neue Row `entityType="day_plan_bonus"` / `action="update"` sichtbar
- [ ] Edit zweier unterschiedlicher Bonusse in Folge → States werden korrekt gepflegt (kein Leak)

**Implementation Note**: Nach Abschluss pausieren und UX-Review (Inline vs. Sub-Sheet) menschlich abnehmen lassen.

---

## Phase 3: Handbuch + Seed-Finalisierung (Onboarding-Dokumentation)

### Overview
Block C aus dem Ticket. Demo-Seed wurde in Phase 1 bereits mitgemacht. Diese Phase konzentriert sich auf das Handbuch: drei End-to-End-Praxisbeispiele und eine DATEV-Zuschlags-Onboarding-Checkliste.

### Changes Required:

#### 1. Handbuch — Nachtzuschlag-Beispiel erweitern
**File**: `docs/TERP_HANDBUCH.md` (Zeilen 1086-1101)
**Changes**: Bestehenden Abschnitt „Praxisbeispiel: Nachtzuschlag End-to-End" erweitern um einen expliziten **Schritt 4: Test-Export + Verifikation** und **Schritt 5: Steuerberater-Übergabe**:

Neue Schritte nach Schritt 3:
- **Schritt 4 — Test-Export erzeugen und Zuschlagszeile verifizieren**: 📍 Administration → Lohnexporte → „Export erstellen" → Template-basiert → gewünschtes Template → Generieren → CSV öffnen und die Zeile mit Lohnart `1015` (oder dem konfigurierten Code) prüfen.
- **Schritt 5 — Steuerberater-Freigabe**: Test-Export und Steuerberater-PDF (20f.10) an den Steuerberater schicken. Nach dessen OK: erster Produktivlauf.

#### 2. Handbuch — Neues Praxisbeispiel „Sonntagszuschlag End-to-End"
**File**: `docs/TERP_HANDBUCH.md` (nach Zeile 1103, vor „Beispielkonfigurationen: Früh-, Spät-, Nachtschicht")
**Changes**: Neues Praxisbeispiel analog zum Nachtzuschlag mit Konto `SZ` (Lohncode z. B. `1020`), Zeitfenster 00:00–24:00 am Sonntags-Tagesplan, Berechnungsart **Prozentual**, Wert `50`, „Gilt an Feiertagen" deaktiviert.

Wesentliche Abweichung zum Nachtzuschlag: Der Zuschlag greift für den gesamten Sonntags-Tagesplan (nicht via Zeitfenster, sondern via Zuweisung im Wochenplan).

#### 3. Handbuch — Neues Praxisbeispiel „Feiertagszuschlag End-to-End"
**File**: `docs/TERP_HANDBUCH.md` (nach Sonntagszuschlag)
**Changes**: Neues Praxisbeispiel mit Konto `FZ` (Lohncode z. B. `1030`), Zeitfenster 00:00–24:00, Berechnungsart **Prozentual**, Wert `125`, „Gilt an Feiertagen" **aktiviert**.

Hinweis-Box: Der Feiertagszuschlag greift **zusätzlich** zum Sonntagszuschlag, wenn der Feiertag auf einen Sonntag fällt (beide Bonusse akkumulieren unabhängig — siehe 4.6.1 Zuschläge Detailansicht).

#### 4. Handbuch — Neuer Abschnitt 20f.9.4 „DATEV-Zuschläge: Onboarding-Checkliste"
**File**: `docs/TERP_HANDBUCH.md` (nach 20f.9.3, vor 20f.10)
**Changes**: Neuer Unter-Abschnitt in der DATEV-Onboarding-Sektion:

```markdown
#### 20f.9.4 DATEV-Zuschläge: Onboarding-Checkliste

Für jeden Zuschlag (Nacht, Samstag, Sonntag, Feiertag), den der Steuerberater als eigene Lohnart sehen soll, diese fünf Schritte in Reihenfolge:

1. **Lohnart vom Steuerberater erfragen** — DATEV-Lohnart-Code (4-stellig) und Name. Ohne diesen Code werden die Zuschlagsminuten unter dem Konto-Code als Lohnart ausgegeben, was selten das Richtige ist.
2. **Bonus-Konto anlegen oder anpassen** — 📍 Verwaltung → Konten → neues Konto vom Typ „Bonus" oder bestehendes öffnen → Lohncode eintragen → Lohnrelevant aktivieren.
3. **Zuschlag am Tagesplan konfigurieren** — 📍 Verwaltung → Tagespläne → gewünschten Plan → Detailansicht → „Zuschlag hinzufügen" (oder Bleistift-Icon für Bestand) → Zeitfenster + Berechnungsart + Wert → Speichern.
4. **Test-Export generieren und Probezeile an Steuerberater** — 📍 Administration → Lohnexporte → „Export erstellen" → Template-basiert → Generieren → CSV öffnen → Zeile mit dem konfigurierten Lohnart-Code prüfen → Steuerberater-PDF (siehe 20f.10) zusammen mit der Probedatei an den Steuerberater mailen.
5. **Freigabe einholen, dann Go-Live** — erst nach schriftlichem OK des Steuerberaters ersten Produktivlauf durchführen.

⚠️ **Wichtig**: Lohnart-Codes sind steuerberaterspezifisch. Dieselbe Terp-Quelle (`account:NIGHT`) kann bei zwei Steuerberatern unterschiedliche Codes haben (1003 vs. 1015). Pflegen Sie das Mapping unter Administration → Lohnart-Mapping (siehe 20f.4).
```

#### 5. Handbuch — Template-Engine-Dokumentation: `accountValues` ergänzen
**File**: `docs/TERP_HANDBUCH.md` (Abschnitt 20f zur Template-Engine; konkret im Abschnitt der `employee.*`-Context-Dokumentation — Position: Nach der `monthlyValues`-Tabelle, die die sechs Felder `targetHours` usw. listet. Position via Such-String `monthlyValues` lokalisieren.)
**Changes**: Neuer Absatz:

```markdown
##### employee.accountValues

Zusätzlich zu `monthlyValues` stellt der Kontext `employee.accountValues` bereit — ein Sparse-Objekt mit Kontostunden pro aktivem Konto des Mandanten, Schlüssel = `Account.code` (z. B. `NIGHT`, `SUN`, `HOLIDAY`), Wert = Stunden für den Abrechnungszeitraum. Konten ohne Buchung in der Periode erscheinen nicht im Objekt.

**Auflösung über den `terp_value`-Filter**: In der Lohnart-Mapping-Tabelle (20f.4) können Sie als Terp-Quelle einen `account:<CODE>`-String eintragen (z. B. `account:NIGHT`). Templates rufen den Wert über den neuen Filter auf:

```liquid
{%- assign val = wage.terpSource | terp_value: employee -%}
```

Der Filter löst automatisch auf:
- `wage.terpSource = "account:NIGHT"` → `employee.accountValues.NIGHT`
- `wage.terpSource = "workedHours"` → `employee.monthlyValues.workedHours`
- Unbekannte Source → `0`

**Beispiel im Template**:

```liquid
{{ employee.accountValues.NIGHT | datev_decimal: 2 }}
```

Die sechs mitgelieferten System-Templates verwenden den Filter bereits. Eigene Tenant-Templates, die das alte Muster `employee.monthlyValues[wage.terpSource]` verwenden, funktionieren weiter für Nicht-`account:`-Quellen, sollten aber bei Gelegenheit auf den Filter umgestellt werden.
```

### Success Criteria:

#### Automated Verification:
- [x] Markdown-Lint (falls konfiguriert): `pnpm lint:md` oder Äquivalent — _kein `lint:md`-Target im Projekt konfiguriert_
- [x] Keine Link-Brüche im Handbuch (bestehender Check, falls vorhanden) — _kein automatisierter Check vorhanden_

#### Manual Verification:
- [ ] Handbuch lesbar, kein Text abgeschnitten, drei neue Praxisbeispiele finden sich beim Scrollen durch Abschnitt 4.6
- [ ] Onboarding-Checkliste 20f.9.4 findet sich an der erwarteten Stelle und liest sich schlüssig
- [ ] Ein unabhängiger Reviewer kann das Nacht-Praxisbeispiel befolgen und ein DATEV-LODAS-File mit einer `;1015;`-Zeile erzeugen (Dry-Run im Demo-Tenant nach `pnpm db:reset`)

---

## Phase 4: Verifikation der Post-Launch-Stubs

### Overview
Block D aus dem Ticket. Beide Stubs existieren bereits:
- `thoughts/shared/tickets/post-launch/post-launch-3b-steuerfreie-zuschlaege.md`
- `thoughts/shared/tickets/prodi-prelaunch/soll-08-zuschlagsvorlagen-tarifvertraege.md`

### Changes Required:

#### 1. Cross-Reference prüfen
**Files**: beide oben
**Changes**: Nach Phase 2 sicherstellen, dass `soll-08` korrekt auf den neuen `updateBonus`-Endpunkt verweist. Aktueller Text: „Baut auf pflicht-02-datev-zuschlaege.md auf — insbesondere auf `updateBonus` (Block B)". Das passt bereits.

### Success Criteria:

#### Automated Verification:
- [x] `ls thoughts/shared/tickets/post-launch/post-launch-3b-steuerfreie-zuschlaege.md` → Datei existiert
- [x] `ls thoughts/shared/tickets/prodi-prelaunch/soll-08-zuschlagsvorlagen-tarifvertraege.md` → Datei existiert; enthält den erwarteten `updateBonus`-Verweis

#### Manual Verification:
- [x] Stubs sind mit dem Ticket-Kontext konsistent (Cross-Reference auf Block B `updateBonus` vorhanden)

---

## Testing Strategy

### Unit Tests (Vitest):

**Block A — Export-Context + Filter**:
- `export-context-builder.test.ts`:
  - `accountValues` enthält alle aktiven Konten mit Wert > 0 für den Zeitraum
  - Konten mit Wert 0 erscheinen NICHT im Record
  - `accountValues` ist leer (`{}`), wenn keine `DailyAccountValue`-Rows im Zeitraum existieren
  - `accountValues` summiert über alle `source`-Werte (`net_time`, `capped_time`, `surcharge`, `absence_rule`) — konsistent mit `generateDatevLodas`
  - Key ist `Account.code`, nicht `payrollCode` und nicht `id`
  - Multi-Employee: zwei Employees mit unterschiedlichen Werten → getrennte `accountValues`
- `liquid-engine.test.ts` (neue Datei):
  - `terpSource = "account:NIGHT"` + `employee.accountValues = { NIGHT: 8 }` → `8`
  - `terpSource = "workedHours"` + `employee.monthlyValues = { workedHours: 160 }` → `160`
  - `terpSource = "account:UNKNOWN"` → `0`
  - `terpSource = "unknownField"` → `0`
  - `terpSource = null` → `0`
  - `employee = null` → `0`

**Block B — DayPlanBonus-Update**:
- `dayPlans-router.test.ts` (ergänzen an Zeile ~995):
  - Update aller Felder → Werte im Ergebnis korrekt
  - Partial-Update (nur `valueMinutes`) → andere Felder unverändert
  - `validateBonus`: Update mit `timeFrom === timeTo` (beides gesetzt) → `DayPlanValidationError`
  - Update mit nur `timeFrom` (`timeTo` weggelassen) → Validierung gegen bestehenden `timeTo`
  - Ownership-Check: `dayPlanId` aus anderem Tenant → `DayPlanNotFoundError`
  - `bonusId` nicht in `dayPlanId` → `BonusNotFoundError`

### Integration Tests (Vitest, `describe.sequential`, echte DB):

**`export-template-phase4.integration.test.ts` oder neue Datei**:
- **End-to-End Zuschlag im Export-Kontext**: DayPlan mit Bonus (22:00–06:00, 25% auf `NIGHT`) → Employee mit EmployeeDayPlan → Booking 22:00–06:00 → `calculateDay` → `DailyAccountValue` mit `source="surcharge"` → `buildExportContext` → `employee.accountValues.NIGHT === 8` (bei 8h im Fenster)
- **Template-Rendering mit Filter**: System-Template-Body mit `wage.terpSource = "account:NIGHT"` rendern → Output enthält die Stundenzeile mit korrektem Wert
- **Multi-Tenant-Isolation**: Tenant A (25% Nacht) und Tenant B (30% Nacht) → `buildExportContext` pro Tenant → keine Cross-Contamination
- **Update-Flow**: Bonus erstellen → `updateBonus` mit neuem `valueMinutes` → `calculateDay` für betroffene Tage re-triggern → neue `DailyAccountValue`-Werte
- **Rückwärtskompatibilität**: Template ohne `accountValues`-Zugriff rendert unverändert

### Browser E2E Tests (Playwright):

**`02-arbeitszeitmodelle.spec.ts` erweitern oder neue Spec `66-dayplan-bonus-update.spec.ts`**:
- **Admin ändert Zuschlag**: Login als Admin → Verwaltung → Tagespläne → Detail → Bonus-Edit-Button → `valueMinutes` ändern → Speichern → neuer Wert in Liste sichtbar ohne Reload
- **Export mit Zuschlag**: (optional, falls 62 oder 63-Spec erweiterbar) Konfigurierter Nacht-Bonus → Bookings vorhanden → Administration → Lohnexporte → Template-basierter Export → Download → CSV-Stichprobe enthält `;1015;` (Demo-Seed-payrollCode)

### Manual Testing Steps:

1. `pnpm db:reset` auf Demo-Tenant; Admin-Login
2. Verwaltung → Konten → prüfen, dass `NIGHT`, `SAT`, `SUN`, `HOLIDAY` mit Lohncodes existieren
3. Administration → Lohnart-Mapping → Codes 1003/1004/1005 prüfen, `terp_source` steht auf `account:NIGHT/SUN/HOLIDAY`
4. Verwaltung → Tagespläne → einen bestehenden Plan oder „Nachtschicht (NS)" öffnen → Bonus hinzufügen: `NIGHT`-Konto, 22:00–06:00, **Prozentual**, Wert 25, Holiday aus → Speichern
5. Demo-Employee mit Nachtschicht-Buchungen (bereits im Seed vorhanden oder manuell erzeugen) → Tagesansicht → prüfen, dass Zuschlagsminuten gebucht sind
6. **Bonus editieren**: Bleistift-Icon klicken, Wert von 25 auf 30 ändern → Speichern → Liste zeigt 30
7. Administration → Monatswerte → gewünschten Monat abschließen
8. Administration → Lohnexporte → „Export erstellen" → Template-basiert → „DATEV LODAS — Bewegungsdaten" → aktueller Monat → Generieren → Datei öffnen → Zeile `;…;1015;…` (oder konfigurierter Code) mit 30%-Nachtzuschlag-Stunden prüfen

## Performance Considerations

- `aggregateAccountValuesForContext` macht pro `buildExportContext`-Aufruf einen zusätzlichen `groupBy` auf `daily_account_values` (bislang nur in `generateDatevLodas` aufgerufen). Für einen Monat mit ~100 Employees und ~20 Konten sind das Größenordnungen von 60.000 Rows (30 × 100 × 20). Der bestehende Index `idx_daily_account_values_employee_date` oder Äquivalent (prüfen: `daily_account_values`-Migration) deckt das ab; keine zusätzliche Index-Arbeit nötig.
- Der zusätzliche `prisma.account.findMany`-Aufruf für alle aktiven Konten ist trivial (<100 Rows pro Tenant typisch).
- LiquidJS-Render-Zeit pro Template steigt minimal durch Filter-Aufrufe (konstante Kosten pro Wage-Code pro Employee).

Keine speziellen Caches nötig. Re-Rendering im UI via `refetch` nach Mutation ist akzeptabel.

## Migration Notes

- **Neue Migration** `20260418200000_datev_surcharge_terpsource_update.sql`:
  - Idempotent via `UPDATE … WHERE code = '…'` und `REPLACE(template_body, …)`.
  - Wird auf `pnpm db:reset` und bei nächstem `pnpm db:push:staging` automatisch angewendet.
  - Prod-Rollout: vor Deploy Migration laufen lassen (`supabase db push` oder Äquivalent), dann Code-Deploy. Order: Migration zuerst — Templates mit neuem Filter funktionieren ohne den Code-Deploy nicht, aber weil die Templates bis zum Code-Deploy nicht gerendert werden, ist die Reihenfolge Migration-dann-Code sicher. Alternative: Code-Deploy zuerst (Filter verfügbar, aber Templates zeigen noch `employee.monthlyValues[wage.terpSource]`, Ergebnis leer für 1003/1004/1005 — der bisherige Zustand) → Migration → Templates funktionieren vollständig. Beide Reihenfolgen sind nicht-zerstörend.
- **Seed-Änderung** `supabase/seed.sql`: greift nur bei `pnpm db:reset` (Dev/Demo). Produktions-Tenants, die das Seed nie geladen haben, sind davon nicht betroffen.
- **Bestehende Tenant-Custom-Templates**: Ein einmaliger manueller Tipp in den Release-Notes an Tenant-Admins, Custom-Templates auf den `terp_value`-Filter umzustellen. Keine automatische Migration in `export_templates`, weil wir nicht jede Tenant-Anpassung in User-Templates kennen.

## References

- Original-Ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege.md`
- Code-Recherche: `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`
- Verwandte bestehende Pläne:
  - `thoughts/shared/plans/2026-04-08-datev-lohn-template-export-engine.md` (Template-Engine-Basis, Phase 2)
  - `thoughts/shared/plans/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` (DATEV-Vollständigkeit Phase 3)
- Post-Launch-Follow-ups:
  - `thoughts/shared/tickets/post-launch/post-launch-3b-steuerfreie-zuschlaege.md` (§3b EStG)
  - `thoughts/shared/tickets/prodi-prelaunch/soll-08-zuschlagsvorlagen-tarifvertraege.md` (Zuschlags-Templates)
- Schlüssel-Dateien:
  - `src/lib/services/export-context-builder.ts:98-124` (Kontext-Schema)
  - `src/lib/services/payroll-export-repository.ts:189-210` (`aggregateDailyAccountValues`)
  - `src/lib/services/liquid-engine.ts:26-98` (Filter-Registry)
  - `src/lib/services/day-plans-service.ts:784-843` (bestehende Bonus-CRUD)
  - `src/trpc/routers/dayPlans.ts:627-674` (Bonus-Procedures)
  - `src/components/day-plans/day-plan-detail-sheet.tsx:322-481` (UI)
  - `supabase/migrations/20260417100000_create_export_templates_and_payroll_wages.sql:104-125` (DefaultPayrollWage-Seed)
  - `supabase/migrations/20260418100000_create_phase3_payroll_tables.sql:71-273` (System-Export-Templates)
