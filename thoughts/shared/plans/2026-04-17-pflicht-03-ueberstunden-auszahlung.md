# Konfigurierbare Überstunden-Auszahlung — Implementation Plan

## Overview

Implementierung einer konfigurierbaren Überstunden-Auszahlung: Beim Monatsabschluss wird für jeden Mitarbeiter geprüft, ob Überstunden über einem konfigurierbaren Schwellenwert liegen, und der Überschuss als Auszahlungs-Record (`OvertimePayout`) erzeugt. Die Regel lebt am Tarif, kann per Employee-Override deaktiviert werden, und fließt als DATEV-Lohnart `1010` in den Export.

## Current State Analysis

- `DailyValue.overtime` und `MonthlyValue.totalOvertime` werden korrekt berechnet
- Gleitzeitsaldo lebt auf `MonthlyValue.flextimeStart/flextimeChange/flextimeEnd/flextimeCarryover`
- `closeMonth`/`closeBatch` ist reiner Flag-Toggle ohne nachgelagerte Logik
- `recalculateFromMonth` existiert (`monthly-calc.ts:162-216`), wird aber von keinem Produktionspfad gerufen
- `EmployeeCappingException` dient als vollständige Blueprint für das Override-Muster
- DATEV-Lohnart `1002` (Mehrarbeit/Überstunden) exportiert informative Gesamt-Stunden; Auszahlungs-Anteil fehlt
- Template-Engine (`export-context-builder.ts:568-575`) exponiert `monthlyValues.*`; kein `overtimePayoutHours`

### Key Discoveries:
- `closeBatch` (`monthly-values-service.ts:283-409`) nutzt `mapWithConcurrency(toClose, 5, ...)` mit per-Employee-Error-Catching — Payout-Logik kann im selben Pattern nach dem Close-Flag angehängt werden
- `reopen` (`monthly-values-service.ts:231-281`) delegiert an `monthlyCalcService.reopenMonth` — Payout-Cleanup muss hier eingefügt werden
- `ExportLine` Interface (`payroll-export-service.ts:249-262`) muss um `overtimePayoutHours` erweitert werden
- `generateDatevLodas` (`payroll-export-service.ts:135-190`) hat `baseLohnarten`-Array — `1010` wird dort angefügt
- `copyDefaultsToTenant` (`payroll-wage-repository.ts:56-90`) ist lazy-only → SQL-Backfill nötig
- Tarif-Form (`tariff-form-sheet.tsx`) nutzt plain `useState<FormState>` ohne `react-hook-form`

## Desired End State

1. **Tarif** hat 6 neue Felder zur Konfiguration der Überstunden-Auszahlungsregel
2. **EmployeeOvertimePayoutOverride** erlaubt per-MA Opt-out oder Mode-Override
3. **Monatsabschluss** erzeugt automatisch `OvertimePayout`-Records und — bei Auto-Approve — reduziert `flextimeEnd`
4. **Freigabe-Flow** für `approvalRequired=true`: Pending → Approve (mit `flextimeEnd`-Reduktion + Folgemonat-Recalc) oder Reject
5. **Reopen** löscht zugehörige Payouts und der Standard-Recalc stellt den alten Saldo wieder her
6. **DATEV-Export** enthält Lohnart `1010` mit approved Payout-Stunden
7. **UI**: Tarif-Form-Sektion, Employee-Override-Card, Monthly-Values-Spalte, Freigabe-Übersicht, Dashboard-Hint

### Verification:
- `pnpm typecheck` hat keine neuen Errors
- `pnpm test` — alle neuen + bestehenden Tests grün
- `pnpm lint` — clean
- Manual: Tarif konfigurieren → Monat schließen → Auszahlung in Monatswerten sichtbar → DATEV-Export enthält `1010`

## What We're NOT Doing

- Quartalsweise oder On-Demand-Auszahlung (nur MONTHLY beim Close)
- Euro-Berechnung (Stundenlohn × Stunden) — macht der Steuerberater
- Automatischer Close (Cron) — bleibt manuell
- Rückwirkende Payout-Korrektur ohne Reopen
- Mehrere Payouts pro MA pro Monat
- Email-Notifications für Payout-Freigabe
- `creditType`-Form-State-Bug-Fix (`"complete"` vs. `"complete_carryover"`) — separater Bug-Fix
- `MonthlyEvaluationTemplate`-Integration

## Implementation Approach

**7 Phasen**, angelehnt an die Ticket-Blöcke A–E, aber granularer aufgeteilt für inkrementelle Testbarkeit:

1. **Schema + Migration** — Prisma-Modelle, SQL-DDL, Payroll-Wage-Seed + Backfill
2. **Pure Calculation + Service** — `calculatePayout`, `resolveEffectiveRule`, Repository, Service-CRUD
3. **Close-Integration + Reopen** — `closeBatch`/`close` Payout-Hook, Reopen-Cleanup
4. **Approve/Reject + Recalc** — Freigabe-Logik mit `flextimeEnd`-Reduktion und Folgemonat-Kaskade
5. **DATEV-Export-Integration** — Template-Engine-Variable, Legacy-Engine-Zeile
6. **tRPC-Router + Override-Router** — Tariff-Schema-Erweiterung, OvertimePayouts-Router, Override-Router
7. **UI** — Tarif-Form-Sektion, Employee-Override-Card, Monthly-Values-Spalte, Freigabe-Seite, Dashboard-Hint

---

## Phase 1: Schema + Migration

### Overview
Drei Prisma-Modelle/Erweiterungen und eine Supabase-Migration mit Seed + Backfill.

### Changes Required:

#### 1. Supabase Migration
**File**: `supabase/migrations/20260501000000_overtime_payout.sql` (neue Migration)

```sql
-- ═══════════════════════════════════════════════════
-- 1. Tariff: sechs neue Spalten für Überstunden-Auszahlung
-- ═══════════════════════════════════════════════════
ALTER TABLE tariffs ADD COLUMN overtime_payout_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tariffs ADD COLUMN overtime_payout_threshold_minutes INT;
ALTER TABLE tariffs ADD COLUMN overtime_payout_mode VARCHAR(30);
ALTER TABLE tariffs ADD COLUMN overtime_payout_percentage INT;
ALTER TABLE tariffs ADD COLUMN overtime_payout_fixed_minutes INT;
ALTER TABLE tariffs ADD COLUMN overtime_payout_approval_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tariffs ADD CONSTRAINT chk_tariffs_overtime_payout_mode
  CHECK (overtime_payout_mode IS NULL OR overtime_payout_mode IN ('ALL_ABOVE_THRESHOLD', 'PERCENTAGE', 'FIXED_AMOUNT'));
ALTER TABLE tariffs ADD CONSTRAINT chk_tariffs_overtime_payout_percentage
  CHECK (overtime_payout_percentage IS NULL OR (overtime_payout_percentage >= 0 AND overtime_payout_percentage <= 100));

-- ═══════════════════════════════════════════════════
-- 2. OvertimePayout
-- ═══════════════════════════════════════════════════
CREATE TABLE overtime_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month >= 1 AND month <= 12),
    payout_minutes INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    source_flextime_end INT NOT NULL,
    tariff_rule_snapshot JSONB NOT NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejected_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, employee_id, year, month)
);

CREATE INDEX idx_overtime_payouts_tenant ON overtime_payouts(tenant_id);
CREATE INDEX idx_overtime_payouts_employee ON overtime_payouts(employee_id);
CREATE INDEX idx_overtime_payouts_status ON overtime_payouts(tenant_id, status);
CREATE INDEX idx_overtime_payouts_period ON overtime_payouts(tenant_id, year, month);

CREATE TRIGGER update_overtime_payouts_updated_at
  BEFORE UPDATE ON overtime_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════
-- 3. EmployeeOvertimePayoutOverride
-- ═══════════════════════════════════════════════════
CREATE TABLE employee_overtime_payout_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    overtime_payout_enabled BOOLEAN NOT NULL,
    overtime_payout_mode VARCHAR(30),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, employee_id),
    CONSTRAINT chk_override_overtime_payout_mode
      CHECK (overtime_payout_mode IS NULL OR overtime_payout_mode IN ('ALL_ABOVE_THRESHOLD', 'PERCENTAGE', 'FIXED_AMOUNT'))
);

CREATE INDEX idx_eopo_tenant ON employee_overtime_payout_overrides(tenant_id);
CREATE INDEX idx_eopo_employee ON employee_overtime_payout_overrides(employee_id);

CREATE TRIGGER update_eopo_updated_at
  BEFORE UPDATE ON employee_overtime_payout_overrides
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════
-- 4. DefaultPayrollWage Seed: Lohnart 1010
-- ═══════════════════════════════════════════════════
INSERT INTO default_payroll_wages (code, name, terp_source, category, description, sort_order)
VALUES ('1010', 'Überstunden-Auszahlung', 'overtimePayoutHours', 'time', 'Auszahlung von Überstunden über dem Schwellenwert', 35)
ON CONFLICT (code) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- 5. Backfill: Lohnart 1010 für alle existierenden Tenants
-- ═══════════════════════════════════════════════════
INSERT INTO tenant_payroll_wages (id, tenant_id, code, name, terp_source, category, description, sort_order, is_active)
SELECT
  gen_random_uuid(),
  t.id,
  '1010',
  'Überstunden-Auszahlung',
  'overtimePayoutHours',
  'time',
  'Auszahlung von Überstunden über dem Schwellenwert',
  35,
  true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_payroll_wages tpw
  WHERE tpw.tenant_id = t.id AND tpw.code = '1010'
);

-- ═══════════════════════════════════════════════════
-- 6. Permission Seed: overtime_payouts.manage
-- ═══════════════════════════════════════════════════
-- UUID is deterministic (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1)
-- Generated via: uuidv5('overtime_payouts.manage', PERMISSION_NAMESPACE)
-- IMPORTANT: isAdmin users (UserGroup.isAdmin=true) bypass all permission checks,
-- so admins get access automatically. Non-admin groups need explicit assignment.
INSERT INTO permissions (id, key, module, action, description)
VALUES (gen_random_uuid(), 'overtime_payouts.manage', 'overtime_payouts', 'manage', 'Manage overtime payout approvals')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- 7. Assign overtime_payouts.manage to PERSONAL group
-- ═══════════════════════════════════════════════════
-- Pattern: 20260417100002_assign_payroll_permissions_to_groups.sql
-- ADMIN group: isAdmin=true → gets all permissions automatically, no assignment needed.
-- PERSONAL (Personalleitung): needs explicit assignment for approve/reject flow.
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT to_jsonb((SELECT id::text FROM permissions WHERE key = 'overtime_payouts.manage'))
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;
```

#### 2. Prisma Schema
**File**: `prisma/schema.prisma`

Neue Felder auf `Tariff` (nach `vacationCappingRuleGroupId`, vor `createdAt`):
```prisma
  // Overtime payout fields (migration 20260501000000)
  overtimePayoutEnabled          Boolean  @default(false) @map("overtime_payout_enabled")
  overtimePayoutThresholdMinutes Int?     @map("overtime_payout_threshold_minutes")
  overtimePayoutMode             String?  @map("overtime_payout_mode") @db.VarChar(30)
  overtimePayoutPercentage       Int?     @map("overtime_payout_percentage")
  overtimePayoutFixedMinutes     Int?     @map("overtime_payout_fixed_minutes")
  overtimePayoutApprovalRequired Boolean  @default(false) @map("overtime_payout_approval_required")
```

Neues Modell `OvertimePayout`:
```prisma
model OvertimePayout {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String    @map("tenant_id") @db.Uuid
  employeeId          String    @map("employee_id") @db.Uuid
  year                Int
  month               Int
  payoutMinutes       Int       @map("payout_minutes")
  status              String    @default("pending") @db.VarChar(20)
  sourceFlextimeEnd   Int       @map("source_flextime_end")
  tariffRuleSnapshot  Json      @map("tariff_rule_snapshot")
  approvedBy          String?   @map("approved_by") @db.Uuid
  approvedAt          DateTime? @map("approved_at") @db.Timestamptz(6)
  rejectedBy          String?   @map("rejected_by") @db.Uuid
  rejectedAt          DateTime? @map("rejected_at") @db.Timestamptz(6)
  rejectedReason      String?   @map("rejected_reason") @db.Text
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([tenantId, employeeId, year, month])
  @@index([tenantId])
  @@index([employeeId])
  @@index([tenantId, status])
  @@index([tenantId, year, month])
  @@map("overtime_payouts")
}
```

Neues Modell `EmployeeOvertimePayoutOverride`:
```prisma
model EmployeeOvertimePayoutOverride {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId              String    @map("tenant_id") @db.Uuid
  employeeId            String    @map("employee_id") @db.Uuid
  overtimePayoutEnabled Boolean   @map("overtime_payout_enabled")
  overtimePayoutMode    String?   @map("overtime_payout_mode") @db.VarChar(30)
  notes                 String?   @db.Text
  isActive              Boolean   @default(true) @map("is_active")
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([tenantId, employeeId])
  @@index([tenantId])
  @@index([employeeId])
  @@map("employee_overtime_payout_overrides")
}
```

Back-Relations auf `Tenant` und `Employee`:
```prisma
// On Tenant model:
  overtimePayouts                OvertimePayout[]
  employeeOvertimePayoutOverrides EmployeeOvertimePayoutOverride[]

// On Employee model:
  overtimePayouts                OvertimePayout[]
  overtimePayoutOverride         EmployeeOvertimePayoutOverride?
```

#### 3. Permission Catalog
**File**: `src/lib/auth/permission-catalog.ts`

Neue Permission nach `reports.manage`:
```ts
p("overtime_payouts.manage", "overtime_payouts", "manage", "Manage overtime payout approvals"),
```

### Success Criteria:

#### Automated Verification:
- [x] Migration applies cleanly: `pnpm db:reset`
- [x] Prisma client regenerates: `pnpm db:generate`
- [x] Type-check passes: `pnpm typecheck`
- [x] Existing tests pass: `pnpm test`
- [x] `default_payroll_wages` contains row with `code='1010'`
- [x] All existing `tenant_payroll_wages` have `code='1010'` row

#### Manual Verification:
- [ ] Prisma Studio shows new models + fields
- [ ] Existing tariffs have `overtimePayoutEnabled=false` (default)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Pure Calculation + Service Layer

### Overview
`calculatePayout` pure function, `resolveEffectiveRule`, Repository, and Service CRUD für `OvertimePayout` und `EmployeeOvertimePayoutOverride`.

### Changes Required:

#### 1. Overtime Payout Service
**File**: `src/lib/services/overtime-payout-service.ts` (neu)

```ts
// --- Error Classes ---
export class OvertimePayoutNotFoundError extends Error { ... }
export class OvertimePayoutValidationError extends Error { ... }
export class OvertimePayoutConflictError extends Error { ... }

// --- Types ---
export interface PayoutRule {
  overtimePayoutEnabled: boolean
  overtimePayoutThresholdMinutes: number | null
  overtimePayoutMode: string | null    // 'ALL_ABOVE_THRESHOLD' | 'PERCENTAGE' | 'FIXED_AMOUNT'
  overtimePayoutPercentage: number | null
  overtimePayoutFixedMinutes: number | null
  overtimePayoutApprovalRequired: boolean
  overrideApplied: boolean
  overrideMode: string | null
}

export interface PayoutResult {
  payoutMinutes: number
  remainingBalance: number
}

// --- Pure Function ---
export function calculatePayout(flextimeEnd: number, rule: PayoutRule): PayoutResult {
  // Disabled or non-positive balance → no payout
  if (!rule.overtimePayoutEnabled || flextimeEnd <= 0) {
    return { payoutMinutes: 0, remainingBalance: flextimeEnd }
  }
  const threshold = rule.overtimePayoutThresholdMinutes ?? 0
  // At or below threshold (exclusive) → no payout
  if (flextimeEnd <= threshold) {
    return { payoutMinutes: 0, remainingBalance: flextimeEnd }
  }
  const excess = flextimeEnd - threshold
  const effectiveMode = rule.overrideMode ?? rule.overtimePayoutMode

  let payoutMinutes: number
  switch (effectiveMode) {
    case 'ALL_ABOVE_THRESHOLD':
      payoutMinutes = excess
      break
    case 'PERCENTAGE':
      payoutMinutes = Math.floor(excess * (rule.overtimePayoutPercentage ?? 0) / 100)
      break
    case 'FIXED_AMOUNT':
      payoutMinutes = Math.min(rule.overtimePayoutFixedMinutes ?? 0, excess)
      break
    default:
      payoutMinutes = 0
  }
  return {
    payoutMinutes: Math.max(0, payoutMinutes),
    remainingBalance: flextimeEnd - payoutMinutes,
  }
}

// --- Resolve Effective Rule ---
export function resolveEffectiveRule(
  tariff: { overtimePayoutEnabled: boolean; overtimePayoutThresholdMinutes: number | null; overtimePayoutMode: string | null; overtimePayoutPercentage: number | null; overtimePayoutFixedMinutes: number | null; overtimePayoutApprovalRequired: boolean },
  override?: { overtimePayoutEnabled: boolean; overtimePayoutMode: string | null; isActive: boolean } | null,
): PayoutRule {
  const base: PayoutRule = {
    overtimePayoutEnabled: tariff.overtimePayoutEnabled,
    overtimePayoutThresholdMinutes: tariff.overtimePayoutThresholdMinutes,
    overtimePayoutMode: tariff.overtimePayoutMode,
    overtimePayoutPercentage: tariff.overtimePayoutPercentage,
    overtimePayoutFixedMinutes: tariff.overtimePayoutFixedMinutes,
    overtimePayoutApprovalRequired: tariff.overtimePayoutApprovalRequired,
    overrideApplied: false,
    overrideMode: null,
  }
  if (override && override.isActive) {
    base.overtimePayoutEnabled = override.overtimePayoutEnabled
    base.overrideApplied = true
    if (override.overtimePayoutMode) {
      base.overrideMode = override.overtimePayoutMode
    }
  }
  return base
}

// --- Build Tariff Rule Snapshot ---
export function buildTariffRuleSnapshot(rule: PayoutRule): Record<string, unknown> {
  return {
    enabled: rule.overtimePayoutEnabled,
    thresholdMinutes: rule.overtimePayoutThresholdMinutes,
    mode: rule.overrideMode ?? rule.overtimePayoutMode,
    percentage: rule.overtimePayoutPercentage,
    fixedMinutes: rule.overtimePayoutFixedMinutes,
    approvalRequired: rule.overtimePayoutApprovalRequired,
    overrideApplied: rule.overrideApplied,
    overrideMode: rule.overrideMode,
  }
}
```

#### 2. Overtime Payout Repository
**File**: `src/lib/services/overtime-payout-repository.ts` (neu)

```ts
// Standard CRUD: findMany, findById, findByEmployeeMonth, create, update, deleteByEmployeeMonth, deleteById
// findMany supports filters: tenantId, employeeId?, year?, month?, status?, departmentId?
// aggregateApprovedMinutes(prisma, tenantId, employeeId, year, month) → sum of payoutMinutes where status='approved'
```

Key functions:
- `findMany(prisma, tenantId, params)` — mit `include: { employee: { select: { firstName, lastName, personnelNumber, departmentId } } }`, paginiert
- `findById(prisma, tenantId, id)` — single-fetch
- `findByEmployeeMonth(prisma, tenantId, employeeId, year, month)` — für Unique-Check
- `create(prisma, data)` — Insert
- `update(prisma, tenantId, id, data)` — per `tenantScopedUpdate`
- `deleteByEmployeeMonth(prisma, tenantId, employeeId, year, month)` — für Reopen-Cleanup
- `aggregateApprovedMinutes(prisma, tenantId, employeeId, year, month)` — `aggregate({ where: { status: 'approved' }, _sum: { payoutMinutes } })`
- `batchFindByEmployeeMonth(prisma, tenantId, employeeIds, year, month)` — für Batch-Close → `Map<employeeId, OvertimePayout>`

#### 3. Employee Overtime Payout Override Service
**File**: `src/lib/services/employee-overtime-payout-override-service.ts` (neu)

Analog zu `employee-capping-exception-service.ts`:
- Error-Klassen: `OverrideNotFoundError`, `OverrideValidationError`, `OverrideConflictError`
- `list(prisma, tenantId, params)` — optional `employeeId`, `scopeWhere`
- `getById(prisma, tenantId, id)`
- `getByEmployeeId(prisma, tenantId, employeeId)` — für Kalkulation
- `create(prisma, tenantId, input, audit?)` — Unique-Check via `findByEmployeeId`, Audit
- `update(prisma, tenantId, id, input, audit?)` — Partial-Update + Audit
- `remove(prisma, tenantId, id, audit?)`

#### 4. Employee Overtime Payout Override Repository
**File**: `src/lib/services/employee-overtime-payout-override-repository.ts` (neu)

- `findMany`, `findById`, `findByEmployeeId`, `create`, `update`, `deleteById`
- `batchFindByEmployeeIds(prisma, tenantId, employeeIds)` — für Batch-Close → `Map<employeeId, Override>`

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes
- [x] Unit tests for `calculatePayout`:
  - `ALL_ABOVE_THRESHOLD`: 20h Saldo, 10h Schwelle → 10h Payout
  - `PERCENTAGE` 50%: 20h Saldo, 10h Schwelle → 5h Payout
  - `FIXED_AMOUNT` 10h: 20h Saldo, 5h Schwelle → 10h; 12h Saldo, 5h Schwelle → 7h
  - Unter Schwelle: 8h Saldo, 10h Schwelle → 0h
  - Exakt Schwelle (exklusiv): 10h, 10h → 0h
  - Null-Saldo: 0h → 0h
  - Negativer Saldo: -5h → 0h
  - Dezimalminuten: 630min, 600min Schwelle → 30min
  - `PERCENTAGE` mit Rundung: 603min, 600min Schwelle, 50% → 1min (floor)
  - Override deaktiviert: Tarif enabled, Override `enabled=false` → 0h
  - Override Mode: Tarif `ALL_ABOVE_THRESHOLD`, Override `PERCENTAGE` → effektiver Mode `PERCENTAGE`
  - Snapshot-Serialisierung: alle Felder, JSON-serialisierbar
- [ ] Unit tests for Override Service CRUD (mock Prisma)
- [ ] `pnpm test` all green

#### Manual Verification:
- [ ] (keine — pure Functions + CRUD, alles über Tests verifizierbar)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for confirmation before proceeding to Phase 3.

---

## Phase 3: Close-Integration + Reopen

### Overview
`closeBatch`/`close` erzeugen nach erfolgreichem Flag-Toggle pro MA einen `OvertimePayout`-Record. Auto-Approve-Pfad reduziert sofort `flextimeEnd`. Reopen löscht zugehörige Payouts.

### Changes Required:

#### 1. Payout-Hook nach Close
**File**: `src/lib/services/monthly-values-service.ts`

Neue Funktion `createPayoutForClosedMonth(prisma, tenantId, employeeId, year, month, userId)`:
1. Employee laden (mit `tariffId` oder `tariff` include)
2. Tarif laden (die 6 neuen Felder)
3. Override laden via `overrideRepo.findByEmployeeId(prisma, tenantId, employeeId)`
4. `resolveEffectiveRule(tariff, override)` aufrufen
5. Wenn `!rule.overtimePayoutEnabled` → return (kein Record)
6. `MonthlyValue` für diesen Monat holen → `mv.flextimeEnd`
7. `calculatePayout(mv.flextimeEnd, rule)` aufrufen
8. Wenn `payoutMinutes === 0` → return
9. Wenn `!rule.overtimePayoutApprovalRequired` (Auto-Approve):
   - `prisma.$transaction`:
     - `OvertimePayout` erstellen mit `status='approved'`, `approvedBy=userId`, `approvedAt=now()`, `sourceFlextimeEnd=mv.flextimeEnd`, `tariffRuleSnapshot=buildTariffRuleSnapshot(rule)`
     - `MonthlyValue.flextimeEnd` um `payoutMinutes` reduzieren: `prisma.monthlyValue.update({ where: { id: mv.id }, data: { flextimeEnd: mv.flextimeEnd - payoutMinutes, flextimeCarryover: mv.flextimeEnd - payoutMinutes } })`
10. Wenn `rule.overtimePayoutApprovalRequired` (Pending):
    - `OvertimePayout` erstellen mit `status='pending'`, `sourceFlextimeEnd=mv.flextimeEnd`, `tariffRuleSnapshot=buildTariffRuleSnapshot(rule)`
    - `flextimeEnd` bleibt **unverändert**

Einfügen in `closeBatch` (`monthly-values-service.ts:376-401`): **Nach** `closeMonth` im `try`-Block, **vor** `closedCount++`:

```ts
// Payout hook — errors collected, not thrown
try {
  await createPayoutForClosedMonth(prisma, tenantId, empId, year, month, userId)
} catch (payoutErr) {
  // Payout failure must NOT undo the close
  console.error(`[OvertimePayout] Failed for employee ${empId}:`, payoutErr)
  // Optionally push a non-blocking warning into errors — but DO NOT decrement closedCount
}
```

Einfügen in `close` (`monthly-values-service.ts:168-229`): Analog nach `closeMonth` (Z. 209), vor Re-Fetch (Z. 212).

**Wichtig**: Payout-Fehler dürfen Close nicht rückgängig machen. Close-Flag und Payout sind **getrennte atomare Schritte**.

#### 2. Batch-Optimierung
Für `closeBatch`: Pre-Fetch-Pattern für Batch-Performance:
- Vor dem `mapWithConcurrency`-Loop: **Eine** Query für alle Employee-Tariffs und **eine** Query für alle Overrides
- `Map<employeeId, Tariff>` und `Map<employeeId, Override>` aufbauen
- Im Loop-Callback Daten aus Maps lesen statt N einzelne Queries

#### 3. Reopen-Cleanup
**File**: `src/lib/services/monthly-values-service.ts`

In `reopen()` (Z. 231-281), **nach** `monthlyCalcService.reopenMonth` (Z. 271-276):

```ts
// Delete overtime payouts for this month (approved payouts: flextimeEnd reduction
// is automatically reversed by the subsequent recalc, since the close + payout
// wrote the reduced value and reopenMonth triggers a recalc that reads prevMonth
// fresh — the payout was the only entity that modified flextimeEnd post-close)
await overtimePayoutRepo.deleteByEmployeeMonth(prisma, tenantId, mv.employeeId, mv.year, mv.month)
```

**Kein expliziter `flextimeEnd`-Restore nötig**: Der Standard-Recalc nach Reopen + ggf. erneutem Close berechnet `flextimeEnd` aus `flextimeChange` + `previousCarryover` neu. Die Payout-Reduktion war ein separater Post-Close-Schritt. Nach Payout-Löschung ist der Zustand wie vor dem Close.

**Aber**: Wenn der Payout `approved` war, wurde `flextimeEnd` im MonthlyValue bereits reduziert. Nach Löschen des Payouts muss `flextimeEnd` wieder den Pre-Payout-Wert erhalten. Lösung: `sourceFlextimeEnd` aus dem gelöschten Payout lesen und `MonthlyValue.flextimeEnd` restaurieren:

```ts
const existingPayout = await overtimePayoutRepo.findByEmployeeMonth(prisma, tenantId, mv.employeeId, mv.year, mv.month)
if (existingPayout) {
  if (existingPayout.status === 'approved') {
    // Restore the pre-payout flextimeEnd
    await prisma.monthlyValue.update({
      where: { id: mv.id },
      data: {
        flextimeEnd: existingPayout.sourceFlextimeEnd,
        flextimeCarryover: existingPayout.sourceFlextimeEnd,
      },
    })
  }
  await overtimePayoutRepo.deleteByEmployeeMonth(prisma, tenantId, mv.employeeId, mv.year, mv.month)
}
```

**Danach** folgt `monthlyCalcService.reopenMonth` — der Monat ist jetzt offen, `flextimeEnd` ist restauriert. Wenn der User den Monat erneut recalculiert + schließt, wird `flextimeEnd` durch den Recalc frisch berechnet und ein neuer Payout erzeugt.

**Reihenfolge in `reopen()` anpassen**: Payout-Restore **VOR** `reopenMonth`, damit der atomare `updateMany({ where: { isClosed: true } })`-Guard noch greift (der Monat ist noch geschlossen, also dürfen wir `flextimeEnd` schreiben). Tatsächlich: `reopenMonth` setzt nur `isClosed=false` — es recalculiert nicht. Also ist die Reihenfolge:
1. Payout lesen
2. Wenn approved: `flextimeEnd` restaurieren
3. Payout löschen
4. `reopenMonth` aufrufen (setzt `isClosed=false`)

> **Known Limitation**: Wenn der Folgemonat bereits geschlossen war, hat dessen `flextimeStart` den reduzierten Wert (nach Payout). Nach dem Restore des Vormonats wird der geschlossene Folgemonat **nicht** automatisch recalculiert — `recalculateFromMonth` skipped geschlossene Monate silent (`ERR_MONTH_CLOSED → skippedMonths++`). HR muss den Folgemonat ebenfalls reopenen und recalculieren, damit `flextimeStart` den korrekten Wert erhält. Das ist eine bestehende Systemlimitation (kein kaskadierender Recalc bei geschlossenen Monaten) und nicht spezifisch für die Payout-Logik. Dieser Hinweis wird im Handbuch (Phase 8) dokumentiert.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm typecheck` passes
- [ ] Integration-Test: Happy Path — MA mit 720min (12h) Saldo, Tarif `ALL_ABOVE_THRESHOLD`, Schwelle 600min (10h), `approvalRequired=false` → Close → `OvertimePayout.status='approved'`, `payoutMinutes=120`, `MonthlyValue.flextimeEnd=600`
- [ ] Integration-Test: Approval-Flow — Tarif mit `approvalRequired=true` → Close → Payout `pending`, `flextimeEnd` unverändert bei 720min
- [ ] Integration-Test: Batch-Close 3 MA — MA1 `ALL_ABOVE_THRESHOLD` (2h Payout), MA2 `PERCENTAGE` 50% (5h Payout), MA3 kein `overtimePayoutEnabled` (0 Payout)
- [ ] Integration-Test: Employee-Override wirksam — Override `enabled=false` → kein Payout
- [ ] Integration-Test: Reopen-Kaskade — Close → approved Payout → Reopen → Payout gelöscht → `flextimeEnd` restauriert
- [ ] Integration-Test: Close schlägt nicht wegen Payout-Fehler fehl — simulierte Payout-Exception → Close-Flag trotzdem gesetzt, Fehler in `errors[]`
- [ ] `pnpm test` all green

#### Manual Verification:
- [ ] (keine — Integration-Tests decken alle Pfade ab)

**Implementation Note**: After completing this phase, pause for confirmation before Phase 4.

---

## Phase 4: Approve/Reject + Folgemonat-Recalc

### Overview
`approve()` und `reject()` im Payout-Service. Approve reduziert `flextimeEnd` und triggert `recalculateFromMonth` für Folgemonate.

### Changes Required:

#### 1. Approve + Reject
**File**: `src/lib/services/overtime-payout-service.ts`

```ts
export async function approve(
  prisma: PrismaClient,
  tenantId: string,
  payoutId: string,
  userId: string,
  audit?: AuditContext
): Promise<OvertimePayout> {
  const payout = await repo.findById(prisma, tenantId, payoutId)
  if (!payout) throw new OvertimePayoutNotFoundError()
  if (payout.status !== 'pending') {
    throw new OvertimePayoutValidationError(`Cannot approve payout with status '${payout.status}'`)
  }

  // Atomically: update payout status + reduce flextimeEnd
  const [updated] = await prisma.$transaction([
    prisma.overtimePayout.update({
      where: { id: payoutId },
      data: {
        status: 'approved',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    }),
    prisma.monthlyValue.updateMany({
      where: {
        employeeId: payout.employeeId,
        year: payout.year,
        month: payout.month,
        tenantId,
      },
      data: {
        flextimeEnd: payout.sourceFlextimeEnd - payout.payoutMinutes,
        flextimeCarryover: payout.sourceFlextimeEnd - payout.payoutMinutes,
      },
    }),
  ])

  // Trigger cascading recalc for subsequent months
  const nextMonth = payout.month === 12 ? 1 : payout.month + 1
  const nextYear = payout.month === 12 ? payout.year + 1 : payout.year
  const monthlyCalcService = new MonthlyCalcService(prisma, tenantId)
  await monthlyCalcService.recalculateFromMonth(payout.employeeId, nextYear, nextMonth)

  // Audit log (non-blocking)
  if (audit) {
    auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: 'approve',
      entityType: 'overtime_payout', entityId: payoutId,
      entityName: `${payout.year}-${payout.month}`,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function reject(
  prisma: PrismaClient,
  tenantId: string,
  payoutId: string,
  userId: string,
  reason: string,
  audit?: AuditContext
): Promise<OvertimePayout> {
  const payout = await repo.findById(prisma, tenantId, payoutId)
  if (!payout) throw new OvertimePayoutNotFoundError()
  if (payout.status !== 'pending') {
    throw new OvertimePayoutValidationError(`Cannot reject payout with status '${payout.status}'`)
  }

  const updated = await prisma.overtimePayout.update({
    where: { id: payoutId },
    data: {
      status: 'rejected',
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectedReason: reason,
    },
  })

  // No flextimeEnd change for rejection

  if (audit) {
    auditLog.log(prisma, {
      tenantId, userId: audit.userId, action: 'reject',
      entityType: 'overtime_payout', entityId: payoutId,
      entityName: `${payout.year}-${payout.month}`,
      ipAddress: audit.ipAddress, userAgent: audit.userAgent,
      metadata: { reason },
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}
```

#### 2. Batch-Approve
**File**: `src/lib/services/overtime-payout-service.ts`

```ts
export async function approveBatch(
  prisma: PrismaClient,
  tenantId: string,
  payoutIds: string[],
  userId: string,
  audit?: AuditContext
): Promise<{ approvedCount: number; errors: Array<{ payoutId: string; reason: string }> }> {
  const errors: Array<{ payoutId: string; reason: string }> = []
  let approvedCount = 0

  // Sequential to avoid concurrent flextimeEnd writes for same employee
  for (const payoutId of payoutIds) {
    try {
      await approve(prisma, tenantId, payoutId, userId, audit)
      approvedCount++
    } catch (err) {
      errors.push({ payoutId, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return { approvedCount, errors }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm typecheck` passes
- [ ] Integration-Test: Approval-Flow End-to-End — Close mit `approvalRequired=true` → Payout `pending`, `flextimeEnd=720` → `approve()` → Payout `approved`, `flextimeEnd=600`, Folgemonat `flextimeStart=600`
- [ ] Integration-Test: Rejection-Flow — Payout `pending` → `reject(reason='Test')` → Status `rejected`, `flextimeEnd` unverändert
- [ ] Integration-Test: Approve already-approved throws `ValidationError`
- [ ] Integration-Test: Reject already-rejected throws `ValidationError`
- [ ] Integration-Test: Batch-Approve — 3 pending Payouts → `approveBatch` → `approvedCount=3`
- [ ] `pnpm test` all green

#### Manual Verification:
- [ ] (keine — Integration-Tests decken alle Pfade ab)

**Implementation Note**: Pause for confirmation before Phase 5.

---

## Phase 5: DATEV-Export-Integration

### Overview
Template-Engine-Variable `overtimePayoutHours` und Legacy-Engine-Zeile für Lohnart `1010`.

### Changes Required:

#### 1. Template-Engine
**File**: `src/lib/services/export-context-builder.ts`

In der Employee-Context-Map (`monthlyValues`-Block, Z. 568-575), neues Feld hinzufügen:

```ts
monthlyValues: {
  targetHours: mv ? mv.totalTargetTime / 60 : 0,
  workedHours: mv ? mv.totalNetTime / 60 : 0,
  overtimeHours: mv ? mv.totalOvertime / 60 : 0,
  overtimePayoutHours: 0, // will be set below after payout query
  vacationDays: mv ? Number(mv.vacationTaken) : 0,
  sickDays: mv ? mv.sickDays : 0,
  otherAbsenceDays: mv ? mv.otherAbsenceDays : 0,
},
```

Payout-Query: Batch-Query für alle Employee-IDs, `status='approved'`, für den Export-Monat:
```ts
const payoutAgg = await prisma.overtimePayout.groupBy({
  by: ['employeeId'],
  where: { tenantId, employeeId: { in: empIds }, year, month, status: 'approved' },
  _sum: { payoutMinutes: true },
})
const payoutMap = new Map(payoutAgg.map(p => [p.employeeId, (p._sum.payoutMinutes ?? 0) / 60]))
```

Dann im per-Employee-Block: `overtimePayoutHours: payoutMap.get(emp.id) ?? 0`.

#### 2. Legacy Engine
**File**: `src/lib/services/payroll-export-service.ts`

`ExportLine` Interface erweitern (Z. 249-262):
```ts
export interface ExportLine {
  // ...existing fields...
  overtimePayoutHours: number  // NEW
  accountValues: Record<string, number>
}
```

In `generateDatevLodas` `baseLohnarten`-Array (Z. 143-150), neue Zeile **nach** `1002`:
```ts
{ code: "1010", getValue: (l) => ({ hours: l.overtimePayoutHours, days: 0 }) },
```

In `generateStandardCsv` Header (Z. 95-108): `"OvertimePayoutHours"` nach `"OvertimeHours"` hinzufügen.

In `generate()` (Z. 305+): Payout-Query analog zum Template-Engine-Ansatz, Wert in `ExportLine.overtimePayoutHours` setzen.

#### 3. Liquid-Engine terpSource-Dispatch
**File**: `src/lib/services/liquid-engine.ts` (oder `export-context-builder.ts`)

Der `terp_value`-Filter resolvet `terpSource`-Strings zu Werten. `overtimePayoutHours` wird automatisch über `employee.monthlyValues.overtimePayoutHours` aufgelöst, da der Filter den Pfad `monthlyValues.<terpSource>` traversiert. **Kein zusätzlicher Code nötig** — der bestehende Dispatch greift, solange der Wert im Context-Objekt existiert.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm typecheck` passes
- [ ] Integration-Test: DATEV-Export mit approved Payout — Lohnart `1010` mit korrekten Stunden erscheint
- [ ] Integration-Test: DATEV-Export ohne Payout (oder pending) — Lohnart `1010` erscheint **nicht**
- [ ] Integration-Test: Lohnart `1002` bleibt unverändert (Gesamt-Überstunden)
- [ ] Integration-Test: Template-Engine `overtimePayoutHours` korrekt aufgelöst
- [ ] `pnpm test` all green

#### Manual Verification:
- [ ] DATEV-Export-Preview zeigt Lohnart `1010` für MA mit approved Payout

**Implementation Note**: Pause for confirmation before Phase 6.

---

## Phase 6: tRPC-Router

### Overview
Tariff-Router erweitern, OvertimePayouts-Router und Override-Router anlegen.

### Changes Required:

#### 1. Tariff-Router Erweiterung
**File**: `src/trpc/routers/tariffs.ts`

Zod-Schema `createTariffInputSchema` (Z. 155+) erweitern:
```ts
overtimePayoutEnabled: z.boolean().optional(),
overtimePayoutThresholdMinutes: z.number().int().min(0).optional(),
overtimePayoutMode: z.enum(['ALL_ABOVE_THRESHOLD', 'PERCENTAGE', 'FIXED_AMOUNT']).optional(),
overtimePayoutPercentage: z.number().int().min(0).max(100).optional(),
overtimePayoutFixedMinutes: z.number().int().min(0).optional(),
overtimePayoutApprovalRequired: z.boolean().optional(),
```

Zod-Schema `updateTariffInputSchema` (Z. 196+): gleiche Felder, alle `.nullable().optional()`.

`mapToOutput` (Z. 244+): sechs neue Felder durchreichen (Integers, direkt als `number | null`).

Cross-Field-Validation via `.superRefine()` auf dem Input:
- Wenn `overtimePayoutEnabled === true`, dann `overtimePayoutMode` ist Pflicht
- Wenn `overtimePayoutMode === 'PERCENTAGE'`, dann `overtimePayoutPercentage` ist Pflicht
- Wenn `overtimePayoutMode === 'FIXED_AMOUNT'`, dann `overtimePayoutFixedMinutes` ist Pflicht
- Wenn `overtimePayoutMode === 'ALL_ABOVE_THRESHOLD'`, dann keine zusätzlichen Pflichtfelder

Tariff-Service (`tariffs-service.ts`): `create` + `update` verarbeiten die sechs neuen Felder analog zu den Flextime-Feldern (direkt auf Prisma-Data, kein Decimal-Wrapping). `TRACKED_FIELDS` erweitern um `"overtimePayoutEnabled"`.

#### 2. OvertimePayouts-Router
**File**: `src/trpc/routers/overtimePayouts.ts` (neu)

Permission: `overtime_payouts.manage` (neuer Permission-Key aus Phase 1).

Procedures:
- `list` (`.query`) — Input: `{ year?, month?, status?, departmentId?, employeeId? }`, Output: paginated list
- `getById` (`.query`) — Input: `{ id }`, Output: single payout with snapshot
- `approve` (`.mutation`) — Input: `{ id }`, Output: updated payout
- `reject` (`.mutation`) — Input: `{ id, reason: z.string().min(1) }`, Output: updated payout
- `approveBatch` (`.mutation`) — Input: `{ ids: z.array(z.string()) }`, Output: `{ approvedCount, errors }`
- `countPending` (`.query`) — Input: `{ year?, month? }`, Output: `{ count: number }`

Alle mit `tenantProcedure.use(requirePermission(...)).use(applyDataScope())`.

Registrierung in `_app.ts`: `overtimePayouts: overtimePayoutsRouter`.

#### 3. Employee Overtime Payout Override Router
**File**: `src/trpc/routers/employeeOvertimePayoutOverrides.ts` (neu)

Analog zu `employeeCappingExceptions.ts`:
- `list`, `getById`, `getByEmployeeId`, `create`, `update`, `delete`
- Permission: `overtime_payouts.manage` (oder `tariffs.manage` — Overrides sind Konfigurationsdaten, keine Freigabe-Aktionen; `tariffs.manage` passt semantisch besser, da HR die gleichen Leute sind die Tarife pflegen)

**Entscheidung**: `tariffs.manage` für Override-CRUD, `overtime_payouts.manage` für Approve/Reject.

Registrierung in `_app.ts`: `employeeOvertimePayoutOverrides: employeeOvertimePayoutOverridesRouter`.

#### 4. MonthlyValues-Router Admin-List erweitern
**File**: `src/trpc/routers/monthlyValues.ts`

`list` Output-Schema um optionales Payout-Feld erweitern:
```ts
overtimePayout: z.object({
  id: z.string(),
  payoutMinutes: z.number(),
  status: z.string(),
}).nullable().optional(),
```

Im `list`-Service (oder im Router-Mapper): Pro Employee `OvertimePayout` für den Monat joinen (Batch-Query). Synthetic-Items bekommen `overtimePayout: null`.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Router-Unit-Tests: Tariff create/update mit Payout-Feldern + Cross-Field-Validation
- [ ] Router-Unit-Tests: OvertimePayouts list/getById/approve/reject/approveBatch/countPending
- [ ] Router-Unit-Tests: Override CRUD
- [ ] `pnpm test` all green

#### Manual Verification:
- [ ] (keine — Router-Tests decken alle Procedures ab)

**Implementation Note**: Pause for confirmation before Phase 7.

---

## Phase 7: UI

### Overview
Fünf UI-Stellen: Tarif-Formular-Sektion, Employee-Override-Card, Monatswerte-Spalte, Freigabe-Übersichtsseite, Dashboard-Hint.

### Changes Required:

#### 1. Tarif-Formular — Sektion "Überstunden-Auszahlung"
**File**: `src/components/tariffs/tariff-form-sheet.tsx`

**FormState** (Z. 52-89) erweitern:
```ts
// Overtime payout fields
overtimePayoutEnabled: boolean
overtimePayoutThresholdMinutes: number | null
overtimePayoutMode: string | null
overtimePayoutPercentage: number | null
overtimePayoutFixedMinutes: number | null
overtimePayoutApprovalRequired: boolean
```

**Tab-Struktur** (Z. 359-366): Neuer 6. Tab:
```ts
{ value: 'payout', label: t('tabOvertimePayout'), icon: Banknote }
```

**Tab-JSX**: Neuer Tab-Content nach dem Flextime-Tab (Z. 893+):

```tsx
<TabsContent value="payout" className="space-y-4">
  <p className="text-sm text-muted-foreground">{t('overtimePayoutDescription')}</p>

  {/* Enable Switch */}
  <div className="flex items-center justify-between">
    <Label>{t('fieldOvertimePayoutEnabled')}</Label>
    <Switch
      checked={form.overtimePayoutEnabled}
      onCheckedChange={(checked) => setForm({ ...form, overtimePayoutEnabled: checked })}
    />
  </div>

  {form.overtimePayoutEnabled && (
    <div className="border rounded-lg p-4 space-y-4">
      {/* Mode Select */}
      <div className="space-y-2">
        <Label>{t('fieldOvertimePayoutMode')}</Label>
        <Select value={form.overtimePayoutMode ?? ''} onValueChange={...}>
          <SelectItem value="ALL_ABOVE_THRESHOLD">{t('modeAllAboveThreshold')}</SelectItem>
          <SelectItem value="PERCENTAGE">{t('modePercentage')}</SelectItem>
          <SelectItem value="FIXED_AMOUNT">{t('modeFixedAmount')}</SelectItem>
        </Select>
        <p className="text-xs text-muted-foreground">{t(`modeHelp_${form.overtimePayoutMode}`)}</p>
      </div>

      {/* Threshold (always when enabled) */}
      <div className="space-y-2">
        <Label>{t('fieldThresholdMinutes')}</Label>
        <DurationInput format="hhmm" value={form.overtimePayoutThresholdMinutes} onChange={...} />
        <p className="text-xs text-muted-foreground">{t('thresholdHelp')}</p>
      </div>

      {/* Mode-specific fields */}
      {form.overtimePayoutMode === 'PERCENTAGE' && (
        <div className="space-y-2">
          <Label>{t('fieldPercentage')}</Label>
          <Input type="number" min={0} max={100} value={form.overtimePayoutPercentage ?? ''} onChange={...} />
        </div>
      )}
      {form.overtimePayoutMode === 'FIXED_AMOUNT' && (
        <div className="space-y-2">
          <Label>{t('fieldFixedMinutes')}</Label>
          <DurationInput format="hhmm" value={form.overtimePayoutFixedMinutes} onChange={...} />
        </div>
      )}

      {/* Approval Required Switch */}
      <div className="flex items-center justify-between">
        <Label>{t('fieldApprovalRequired')}</Label>
        <Switch
          checked={form.overtimePayoutApprovalRequired}
          onCheckedChange={(checked) => setForm({ ...form, overtimePayoutApprovalRequired: checked })}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('approvalRequiredHelp')}</p>
    </div>
  )}
</TabsContent>
```

**Submit-Handler** (Z. 322): Die sechs neuen Felder in der Mutation-Payload.

**`validateForm()`**: Cross-Field-Validation (Mode-Pflicht wenn enabled, Percentage-Pflicht wenn PERCENTAGE, etc.).

#### 2. Employee-Override-Card
**File**: `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx`

Neuer Tab oder Card innerhalb des bestehenden Tab-Systems. Da die Employee-Detail-Seite 12 Tabs hat und Override-Konfiguration zur HR-Verwaltung gehört, **Karte auf dem Overview-Tab** oder **eigener kleiner Bereich** im `tariff-assignments`-Tab (da thematisch verwandt).

**Entscheidung**: Card im `tariff-assignments`-Tab, unter der `EffectiveTariffPreview`. Zeigt:
- Wenn kein Override: "Tarif-Regel wird angewendet" mit `<Badge variant="secondary">`
- Wenn Override existiert: Enabled/Disabled Switch + optionaler Mode-Override
- Source-Badge-Pattern: `badge variant="default"` für "Override aktiv", `variant="secondary"` für "Tarif-Regel"

**Component**: `src/components/employees/overtime-payout-override-card.tsx` (neu)

```tsx
export function OvertimePayoutOverrideCard({ employeeId }: { employeeId: string }) {
  // useEmployeeOvertimePayoutOverride(employeeId) query
  // useCreateOverride, useUpdateOverride, useDeleteOverride mutations
  // Display: Card with title "Überstunden-Auszahlung"
  // If no override: "Tarif-Regel wird angewendet" + Badge + "Override erstellen" Button
  // If override: Switch for enabled, Select for mode (optional), Delete button
  // Save inline (like payroll-tab edit/save pattern)
}
```

#### 3. Monthly-Values-Spalte
**File**: `src/components/monthly-values/monthly-values-data-table.tsx`

Neue Spalte nach "Balance" (Pos 9), vor Checkbox-Aktionen:

| Pos | Header | Feld | Renderer |
|---|---|---|---|
| 10 | `table.payout` | `overtimePayout` | `PayoutStatusCell` |

```tsx
function PayoutStatusCell({ payout }: { payout: { payoutMinutes: number; status: string } | null }) {
  if (!payout) return <span className="text-muted-foreground">—</span>
  const formatted = formatMinutes(payout.payoutMinutes) // "X:YY"
  switch (payout.status) {
    case 'pending': return <span className="text-yellow-600">{formatted} ({t('pending')})</span>
    case 'approved': return <span className="text-green-600">{formatted} ({t('approved')})</span>
    case 'rejected': return <span className="text-muted-foreground">— ({t('rejected')})</span>
    default: return <span>—</span>
  }
}
```

**Filter**: Optional `hasPending`-Toggle in `monthly-values-toolbar.tsx` — neuer Button/Checkbox der pending-Payouts hervorhebt.

#### 4. Freigabe-Übersichtsseite
**File**: `src/app/[locale]/(dashboard)/admin/overtime-payouts/page.tsx` (neu)

`'use client'`, Permission `overtime_payouts.manage`.

Struktur:
- **Toolbar**: Year/Month-Navigator, Department-Select, Status-Filter (`all | pending | approved | rejected`), Search
- **Tabelle**: Employee, Personalnummer, Monat, Stunden (DurationDisplay), Status (Badge), Saldo vor Auszahlung, Actions (Approve/Reject Buttons bei `pending`)
- **Batch-Approve**: Button "Alle ausstehenden genehmigen" mit ConfirmDialog
- **Detail-Sheet**: `tariffRuleSnapshot` + `sourceFlextimeEnd` für Nachvollziehbarkeit
- **Reject-Dialog**: Pflicht-Reason (min 10 Zeichen)

**Hooks**: `src/hooks/use-overtime-payouts.ts` (neu)
- `useOvertimePayouts(params)` — list query
- `useOvertimePayout(id)` — getById query
- `useApproveOvertimePayout()` — approve mutation
- `useRejectOvertimePayout()` — reject mutation
- `useBatchApproveOvertimePayouts()` — approveBatch mutation
- `useCountPendingPayouts(params)` — countPending query

**Sidebar**: `sidebar-nav-config.ts` — neuer Eintrag nach `monthlyValues` in `subgroupEvaluations`:
```ts
{
  titleKey: 'overtimePayouts',
  href: '/admin/overtime-payouts',
  icon: Banknote,
  permissions: ['overtime_payouts.manage'],
},
```

#### 5. Dashboard-Hint
**File**: `src/components/dashboard/flextime-balance-card.tsx`

Nach dem Balance-Display (Z. 119), neuer Hint-Block:

```tsx
{/* Payout hint */}
{payout && (
  <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
    {t('payoutHint', {
      month: payoutMonth,
      hours: formatMinutes(payout.payoutMinutes),
      status: t(`payoutStatus_${payout.status}`),
    })}
  </p>
)}
```

Payout-Query: Neuer tRPC-Query `overtimePayouts.getByEmployeeMonth` oder ein erweiterter `monthlyValues.forEmployee` der den Payout mitliefert.

#### 6. i18n
**Files**: `messages/de.json`, `messages/en.json`

Neue Keys in `adminTariffs` Namespace:
```json
"tabOvertimePayout": "Auszahlung",
"overtimePayoutDescription": "Konfigurieren Sie, welche Überstunden automatisch beim Monatsabschluss zur Auszahlung vorgemerkt werden.",
"fieldOvertimePayoutEnabled": "Überstunden-Auszahlung aktivieren",
"fieldOvertimePayoutMode": "Auszahlungsmodus",
"modeAllAboveThreshold": "Alles über Schwellenwert",
"modePercentage": "Prozentsatz",
"modeFixedAmount": "Festbetrag",
"modeHelp_ALL_ABOVE_THRESHOLD": "Alle Minuten über dem Schwellenwert werden zur Auszahlung vorgemerkt.",
"modeHelp_PERCENTAGE": "Ein Prozentsatz der Minuten über dem Schwellenwert wird zur Auszahlung vorgemerkt.",
"modeHelp_FIXED_AMOUNT": "Ein fester Minutenbetrag wird zur Auszahlung vorgemerkt (max. bis zum Überschuss).",
"fieldThresholdMinutes": "Schwellenwert (Gleitzeitkonto)",
"thresholdHelp": "Überstunden werden erst ab diesem Kontostand zur Auszahlung vorgemerkt (exklusiv).",
"fieldPercentage": "Prozentsatz (%)",
"fieldFixedMinutes": "Fester Auszahlungsbetrag",
"fieldApprovalRequired": "Freigabe erforderlich",
"approvalRequiredHelp": "Wenn aktiviert, müssen Auszahlungen nach dem Monatsabschluss einzeln freigegeben werden."
```

Neuer Namespace `overtimePayouts` für die Freigabe-Seite.

Neue Keys in `dashboard` Namespace:
```json
"payoutHint": "Auszahlung {month}: {hours} ({status})",
"payoutStatus_pending": "ausstehend",
"payoutStatus_approved": "genehmigt",
"payoutStatus_rejected": "abgelehnt"
```

Neue Keys in `monthlyValues` Namespace:
```json
"table.payout": "Auszahlung",
"pending": "ausstehend",
"approved": "genehmigt",
"rejected": "abgelehnt"
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [ ] `pnpm build` succeeds
- [x] `pnpm test` all green

#### Manual Verification:
- [ ] Tarif bearbeiten → Tab "Auszahlung" → Switch + Mode + Schwelle → Speichern → Reload → Werte persistiert
- [ ] Cross-Field-Validation: enabled=true ohne Mode → Fehlermeldung
- [ ] Employee-Detailseite → Tarif-Tab → Override-Card zeigt "Tarif-Regel wird angewendet"
- [ ] Override erstellen → `enabled=false` → Speichern → Badge wechselt auf "Override aktiv"
- [ ] `/admin/monthly-values` → Spalte "Auszahlung" zeigt Payout-Status für betroffene MA
- [ ] `/admin/overtime-payouts` → Tabelle mit Payouts, Filter funktioniert
- [ ] Pending Payout → Approve-Button → Status wechselt, Saldo-Spalte aktualisiert
- [ ] Pending Payout → Reject mit Reason → Status rejected
- [ ] Batch-Approve → alle pending genehmigt
- [ ] Dashboard → FlextimeBalanceCard zeigt Payout-Hint
- [ ] Dev-Server läuft ohne Console-Errors

**Implementation Note**: After UI verification, proceed to Handbook (can be done in a separate commit).

---

## Phase 8: Handbuch + E2E-Tests

### Overview
Handbuch-Abschnitt und Playwright Browser-E2E-Tests.

### Changes Required:

#### 1. Handbuch
**File**: `TERP_HANDBUCH_V2.md`

Neuer Abschnitt "Überstunden-Auszahlung konfigurieren":

Praxisbeispiel mit konkreten Zahlen:
1. Tarife → Tarif "Standard-Vollzeit" bearbeiten → Tab "Auszahlung"
2. "Überstunden-Auszahlung aktivieren" → Ein
3. Modus "Alles über Schwellenwert" wählen
4. Schwellenwert 10:00 (600 Minuten) eingeben
5. "Freigabe erforderlich" → Aus (für automatische Genehmigung)
6. Speichern
7. Monatswerte → Batch-Abschluss für März
8. Mitarbeiter "Max Mustermann" hat Gleitzeitkonto von 12:00 → Auszahlung 2:00, verbleibender Saldo 10:00
9. Payroll-Export → DATEV-Lohn-Export → Lohnart 1010 zeigt 2,00 Stunden
10. An Steuerberater übergeben

Zweites Praxisbeispiel: Freigabe-Flow (approvalRequired=true):
1. Tarif mit "Freigabe erforderlich" → Ein konfigurieren
2. Monatsabschluss → Auszahlung 2:00 als "ausstehend" angezeigt
3. Überstunden-Auszahlung → Freigabe-Übersicht → Genehmigen
4. Monatswerte zeigt reduzierten Saldo

Drittes Praxisbeispiel: Hinweis zum Reopen bei bereits geschlossenen Folgemonaten:

> **Wichtiger Hinweis**: Wenn Sie einen Monat mit genehmigter Auszahlung wiedereröffnen und der Folgemonat bereits geschlossen ist, wird der Saldo im Folgemonat **nicht** automatisch korrigiert. Der geschlossene Folgemonat behält seinen alten `flextimeStart`-Wert. Um den korrekten Saldo wiederherzustellen, müssen Sie auch den Folgemonat wiedereröffnen und neu berechnen lassen. Dies ist eine generelle Systemeigenschaft: geschlossene Monate werden bei der Neuberechnung übersprungen.

#### 2. E2E-Tests
**File**: `src/e2e-browser/XX-overtime-payouts.spec.ts` (neu)

Tests:
1. Admin konfiguriert Auszahlungsregel im Tarif-Formular
2. HR schließt Monat (Auto-Approve) → Auszahlungs-Spalte zeigt Betrag
3. HR Freigabe-Flow (approvalRequired → pending → approve)
4. HR Rejection-Flow (pending → reject mit Reason)
5. Employee-Override: Override erstellen → nächster Close erzeugt keinen Payout
6. Export nach Freigabe: DATEV-Export zeigt Lohnart 1010

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm test` all green
- [ ] E2E-Tests: `npx playwright test src/e2e-browser/XX-overtime-payouts.spec.ts`

#### Manual Verification:
- [ ] Handbuch-Abschnitt ist step-by-step klickbar (Praxisbeispiele funktionieren mit echten Zahlen)

---

## Testing Strategy

### Unit Tests (`pnpm vitest run`):
- `src/lib/services/__tests__/overtime-payout-service.test.ts` — 12+ Tests für `calculatePayout`, `resolveEffectiveRule`, Snapshot-Serialisierung
- `src/trpc/routers/__tests__/overtimePayouts.test.ts` — Router-Procedures mit mock Prisma
- `src/trpc/routers/__tests__/employeeOvertimePayoutOverrides.test.ts` — Override CRUD
- `src/trpc/routers/__tests__/tariffs.test.ts` — erweitert um Payout-Felder + Cross-Field-Validation

### Integration Tests (`describe.sequential`, echte DB):
- `src/lib/services/__tests__/overtime-payout-integration.test.ts`:
  - Happy Path (Auto-Approve)
  - Approval-Flow
  - Rejection-Flow
  - Batch-Close 3 MA
  - Employee-Override wirksam
  - DATEV-Export mit approved Payout
  - DATEV-Export ohne pending Payout
  - Multi-Tenant-Isolation
  - Reopen-Kaskade
  - Close-Fehlerresilienz

### Browser E2E (Playwright):
- Tarif konfigurieren
- Monat schließen (Auto-Approve)
- Freigabe-Flow
- Rejection-Flow
- Employee-Override
- Export nach Freigabe

## Performance Considerations

- **Batch-Close Pre-Fetch**: Tariffs und Overrides werden in **je einer** Query für den gesamten Batch geladen (nicht N+1)
- **Payout-Query im Export**: `groupBy` mit `_sum` statt N Einzelqueries
- **`recalculateFromMonth` nach Approve**: Läuft sequenziell pro Employee über Folgemonate — für typische 3-6 offene Monate kein Performance-Problem
- **`approveBatch`**: Sequential, nicht parallel — vermeidet konkurrierende `flextimeEnd`-Writes für denselben Employee (kann nicht vorkommen, da UNIQUE, aber der Recalc könnte kollidieren)
- **Index auf `(tenant_id, status)`**: Optimiert die Freigabe-Übersicht-Query

## Migration Notes

- **Defaults**: `overtimePayoutEnabled=false` auf allen existierenden Tarife → keine Verhaltensänderung im bestehenden Close-Flow
- **Backfill**: Lohnart `1010` wird in der Migration für alle existierenden Tenants eingefügt
- **Permission**: `overtime_payouts.manage` muss Admins und HR-Rollen zugewiesen werden (via Admin-UI oder Seed)
- **Kein Daten-Reset nötig**: Neue Spalten mit Defaults, neue Tabellen leer

## References

- Ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-03-ueberstunden-auszahlung.md`
- Research (Ist-Zustand): `thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md`
- Research (Impact-Map): `thoughts/shared/research/2026-04-17-pflicht-03-ueberstunden-auszahlung-impact-map.md`
- EmployeeCappingException-Template: `src/lib/services/employee-capping-exception-service.ts`
- Payroll-Wage-Seed-Backfill-Muster: `supabase/migrations/20260430000000_datev_surcharge_terpsource_update.sql`
- DATEV-Zuschläge-Plan (Voraussetzung): `thoughts/shared/plans/2026-04-17-pflicht-02-datev-zuschlaege.md`
- Monthly-Calc-Service: `src/lib/services/monthly-calc.ts:162-216` (`recalculateFromMonth`)
- Close-Batch-Service: `src/lib/services/monthly-values-service.ts:283-409`
- Export-Context-Builder: `src/lib/services/export-context-builder.ts:568-575`
- Legacy-Engine: `src/lib/services/payroll-export-service.ts:135-190`
- Tariff-Form: `src/components/tariffs/tariff-form-sheet.tsx:808-893`
