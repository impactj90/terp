# Service/Repository Modularization — Implementation Plan

## Overview

Modularize `src/lib/services/` from a flat directory (221 files) into module subdirectories (`core/`, `crm/`, `billing/`, `warehouse/`), matching the existing tRPC router module structure. Services and repositories stay colocated. No barrel imports. One atomic PR.

## Current State Analysis

```
src/lib/services/          ← 222 files flat (95 services, 85 repos, 12 utils, 32 tests)
src/trpc/routers/          ← already modularized (crm/, billing/, warehouse/ subdirs)
src/hooks/                 ← flat, NOT in scope (separate PR)
```

**Import landscape**: 173 files with 201 import statements reference `@/lib/services/`.
- Hooks: 0 changes (they wrap tRPC, not services)
- Routers + tests: 101 files
- Inter-service: 65 files
- Cron routes: 6 files
- Components: 1 file

## Desired End State

```
src/lib/services/
  core/                    ← ~152 files (employees, bookings, absences, vacations, schedules, etc.)
    __tests__/             ← 12 core test files
  crm/                     ← 9 files
    __tests__/             ← 5 test files (incl. generateLetterSalutation)
  billing/                 ← 14 files (minus tenant-config, moved to core)
    __tests__/             ← 6 test files
  warehouse/               ← 13 files (9 services + 4 repos, no wh-article-image-repository)
    __tests__/             ← 9 test files
```

### Verification:
- `pnpm typecheck` passes with zero new errors
- `pnpm test` passes (all 32 service tests + all router tests)
- `pnpm build` succeeds
- All imports use direct paths (no barrel `index.ts` in any module dir)

## What We're NOT Doing

- No barrel/index.ts files — direct imports only
- No hooks refactoring (separate PR)
- No router restructuring (already done)
- No component restructuring
- No runtime behavior changes — `requireModule` middleware stays as-is
- No new TypeScript path aliases
- No renaming of files (except billing-tenant-config → tenant-config)

## Implementation Approach

One atomic commit: create dirs → git mv all files → fix all imports → verify.

---

## Phase 1: Rename `billing-tenant-config-*` → `tenant-config-*`

### Rationale
Firmenadresse/Logo ist Tenant-Stammdaten, nicht Billing-Logik. Wird von Billing UND Warehouse gebraucht.

### Files to rename (before moving):
```bash
git mv src/lib/services/billing-tenant-config-repository.ts src/lib/services/tenant-config-repository.ts
git mv src/lib/services/billing-tenant-config-service.ts src/lib/services/tenant-config-service.ts
```

### Internal changes in renamed files:
**`tenant-config-service.ts`**: Update import
```typescript
// OLD
import * as repo from "./billing-tenant-config-repository"
// NEW
import * as repo from "./tenant-config-repository"
```

### Consumers to update (8 files):

| File | Old import | New import |
|------|-----------|------------|
| `src/lib/services/billing-document-service.ts` | `./billing-tenant-config-repository` | `./tenant-config-repository` (temporarily, changes again in Phase 3) |
| `src/lib/services/billing-document-pdf-service.ts` | `./billing-tenant-config-repository` | same |
| `src/lib/services/billing-document-einvoice-service.ts` | `./billing-tenant-config-repository` | same |
| `src/lib/services/wh-purchase-order-pdf-service.ts` | `./billing-tenant-config-repository` | same |
| `src/trpc/routers/billing/tenantConfig.ts` | `@/lib/services/billing-tenant-config-service` | `@/lib/services/core/tenant-config-service` (final path after Phase 3) |
| `src/lib/services/__tests__/wh-purchase-order-pdf-service.test.ts` | `../billing-tenant-config-repository` + vi.mock `@/lib/services/billing-tenant-config-repository` | update both |
| `src/lib/services/__tests__/audit-004-tenant-isolation.test.ts` | vi.mock `../billing-tenant-config-repository` | update mock path |

---

## Phase 2: Create Directory Structure + Move All Files

### Create directories:
```bash
mkdir -p src/lib/services/{core,crm,billing,warehouse}/{__tests__}
```

### Move CRM (9 files + 5 tests):

**Services:**
```bash
git mv src/lib/services/crm-address-service.ts src/lib/services/crm/
git mv src/lib/services/crm-correspondence-service.ts src/lib/services/crm/
git mv src/lib/services/crm-inquiry-service.ts src/lib/services/crm/
git mv src/lib/services/crm-report-service.ts src/lib/services/crm/
git mv src/lib/services/crm-task-service.ts src/lib/services/crm/
```

**Repositories:**
```bash
git mv src/lib/services/crm-address-repository.ts src/lib/services/crm/
git mv src/lib/services/crm-correspondence-repository.ts src/lib/services/crm/
git mv src/lib/services/crm-inquiry-repository.ts src/lib/services/crm/
git mv src/lib/services/crm-task-repository.ts src/lib/services/crm/
```

**Tests:**
```bash
git mv src/lib/services/__tests__/crm-correspondence-service.test.ts src/lib/services/crm/__tests__/
git mv src/lib/services/__tests__/crm-inquiry-service.test.ts src/lib/services/crm/__tests__/
git mv src/lib/services/__tests__/crm-report-service.test.ts src/lib/services/crm/__tests__/
git mv src/lib/services/__tests__/crm-task-service.test.ts src/lib/services/crm/__tests__/
```

```bash
git mv src/lib/services/__tests__/generateLetterSalutation.test.ts src/lib/services/crm/__tests__/
```

### Move Billing (14 files + 6 tests):

**Services (8):**
```bash
git mv src/lib/services/billing-document-service.ts src/lib/services/billing/
git mv src/lib/services/billing-document-pdf-service.ts src/lib/services/billing/
git mv src/lib/services/billing-document-einvoice-service.ts src/lib/services/billing/
git mv src/lib/services/billing-document-template-service.ts src/lib/services/billing/
git mv src/lib/services/billing-payment-service.ts src/lib/services/billing/
git mv src/lib/services/billing-price-list-service.ts src/lib/services/billing/
git mv src/lib/services/billing-recurring-invoice-service.ts src/lib/services/billing/
git mv src/lib/services/billing-service-case-service.ts src/lib/services/billing/
```

**Repositories (6):**
```bash
git mv src/lib/services/billing-document-repository.ts src/lib/services/billing/
git mv src/lib/services/billing-document-template-repository.ts src/lib/services/billing/
git mv src/lib/services/billing-payment-repository.ts src/lib/services/billing/
git mv src/lib/services/billing-price-list-repository.ts src/lib/services/billing/
git mv src/lib/services/billing-recurring-invoice-repository.ts src/lib/services/billing/
git mv src/lib/services/billing-service-case-repository.ts src/lib/services/billing/
```

**Tests:**
```bash
git mv src/lib/services/__tests__/billing-document-service.test.ts src/lib/services/billing/__tests__/
git mv src/lib/services/__tests__/billing-document-einvoice-service.test.ts src/lib/services/billing/__tests__/
git mv src/lib/services/__tests__/billing-payment-service.test.ts src/lib/services/billing/__tests__/
git mv src/lib/services/__tests__/billing-price-list-service.test.ts src/lib/services/billing/__tests__/
git mv src/lib/services/__tests__/billing-recurring-invoice-service.test.ts src/lib/services/billing/__tests__/
git mv src/lib/services/__tests__/billing-service-case-service.test.ts src/lib/services/billing/__tests__/
```

### Move Warehouse (13 files + 9 tests):

**Services (9):**
```bash
git mv src/lib/services/wh-article-service.ts src/lib/services/warehouse/
git mv src/lib/services/wh-article-group-service.ts src/lib/services/warehouse/
git mv src/lib/services/wh-article-image-service.ts src/lib/services/warehouse/
git mv src/lib/services/wh-article-price-service.ts src/lib/services/warehouse/
git mv src/lib/services/wh-purchase-order-service.ts src/lib/services/warehouse/
git mv src/lib/services/wh-purchase-order-pdf-service.ts src/lib/services/warehouse/
git mv src/lib/services/wh-stock-movement-service.ts src/lib/services/warehouse/
git mv src/lib/services/wh-supplier-invoice-service.ts src/lib/services/warehouse/
git mv src/lib/services/wh-withdrawal-service.ts src/lib/services/warehouse/
```

**Repositories (4):**
```bash
git mv src/lib/services/wh-article-repository.ts src/lib/services/warehouse/
git mv src/lib/services/wh-purchase-order-repository.ts src/lib/services/warehouse/
git mv src/lib/services/wh-stock-movement-repository.ts src/lib/services/warehouse/
git mv src/lib/services/wh-supplier-invoice-repository.ts src/lib/services/warehouse/
```

Note: `wh-article-image-repository.ts`, `wh-article-group-repository.ts`, `wh-article-price-repository.ts`, and `wh-withdrawal-repository.ts` do not exist — these services use Prisma directly or delegate to other repos.

**Tests (9):**
```bash
git mv src/lib/services/__tests__/wh-article-group-service.test.ts src/lib/services/warehouse/__tests__/
git mv src/lib/services/__tests__/wh-article-image-service.test.ts src/lib/services/warehouse/__tests__/
git mv src/lib/services/__tests__/wh-article-price-service.test.ts src/lib/services/warehouse/__tests__/
git mv src/lib/services/__tests__/wh-article-service.test.ts src/lib/services/warehouse/__tests__/
git mv src/lib/services/__tests__/wh-purchase-order-pdf-service.test.ts src/lib/services/warehouse/__tests__/
git mv src/lib/services/__tests__/wh-purchase-order-service.test.ts src/lib/services/warehouse/__tests__/
git mv src/lib/services/__tests__/wh-stock-movement-service.test.ts src/lib/services/warehouse/__tests__/
git mv src/lib/services/__tests__/wh-supplier-invoice-service.test.ts src/lib/services/warehouse/__tests__/
git mv src/lib/services/__tests__/wh-withdrawal-service.test.ts src/lib/services/warehouse/__tests__/
```

### Move Core (everything remaining → core/):

All remaining `*-service.ts`, `*-repository.ts`, and utility files:
```bash
# Move all remaining service/repository files (CRM/billing/warehouse already moved)
git mv src/lib/services/*-service.ts src/lib/services/core/
git mv src/lib/services/*-repository.ts src/lib/services/core/

# Move utility files (these don't match *-service.ts or *-repository.ts globs)
git mv src/lib/services/prisma-helpers.ts src/lib/services/core/
git mv src/lib/services/daily-calc.ts src/lib/services/core/
git mv src/lib/services/daily-calc.context.ts src/lib/services/core/
git mv src/lib/services/daily-calc.helpers.ts src/lib/services/core/
git mv src/lib/services/daily-calc.types.ts src/lib/services/core/
git mv src/lib/services/monthly-calc.ts src/lib/services/core/
git mv src/lib/services/monthly-calc.types.ts src/lib/services/core/
git mv src/lib/services/recalc.ts src/lib/services/core/
git mv src/lib/services/recalc.types.ts src/lib/services/core/
git mv src/lib/services/holiday-calendar.ts src/lib/services/core/
git mv src/lib/services/carryover-calculation.ts src/lib/services/core/
git mv src/lib/services/vacation-calculation.ts src/lib/services/core/
git mv src/lib/services/vacation-balance-output.ts src/lib/services/core/
git mv src/lib/services/vacation-helpers.ts src/lib/services/core/
git mv src/lib/services/cron-execution-logger.ts src/lib/services/core/
git mv src/lib/services/macro-executor.ts src/lib/services/core/
git mv src/lib/services/employee-day-plan-generator.ts src/lib/services/core/
```

**Remaining tests (12) → core/__tests__/:**
```bash
git mv src/lib/services/__tests__/absences-auto-approve.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/audit-004-tenant-isolation.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/audit-005-bookings-service.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/audit-005-tenant-isolation.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/audit-logs-repository.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/audit-logs-service.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/daily-account-values-summary.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/daily-calc.audit-003.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/daily-calc.helpers.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/daily-calc.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/monthly-calc.test.ts src/lib/services/core/__tests__/
git mv src/lib/services/__tests__/recalc.test.ts src/lib/services/core/__tests__/
# Then remove empty __tests__/ dir
rmdir src/lib/services/__tests__/
```

---

## Phase 3: Fix All Imports

### Import Rewrite Rules

All changes follow these mechanical patterns:

#### Rule 1: Absolute imports from routers/cron/components → add module prefix

```typescript
// CRM services (in routers, cron, components)
"@/lib/services/crm-*"  →  "@/lib/services/crm/crm-*"

// Billing services
"@/lib/services/billing-*"  →  "@/lib/services/billing/billing-*"

// Warehouse services
"@/lib/services/wh-*"  →  "@/lib/services/warehouse/wh-*"

// tenant-config (renamed from billing-tenant-config)
"@/lib/services/billing-tenant-config-*"  →  "@/lib/services/core/tenant-config-*"
"@/lib/services/tenant-config-*"  →  "@/lib/services/core/tenant-config-*"

// Core services (everything else)
"@/lib/services/<name>"  →  "@/lib/services/core/<name>"
```

#### Rule 2: Intra-module relative imports → unchanged

```typescript
// Service importing its own repository (same module dir) — NO CHANGE
import * as repo from "./crm-address-repository"  // stays as-is
```

#### Rule 3: Cross-module relative imports → absolute

```typescript
// CRM → Core (was relative, becomes absolute)
// In crm/crm-address-service.ts:
import * as auditLog from "./audit-logs-service"
→ import * as auditLog from "@/lib/services/core/audit-logs-service"

import * as numberSeqService from "./number-sequence-service"
→ import * as numberSeqService from "@/lib/services/core/number-sequence-service"

// Billing → Core
// In billing/billing-document-service.ts:
import * as orderService from "./order-service"
→ import * as orderService from "@/lib/services/core/order-service"

import * as systemSettingsService from "./system-settings-service"
→ import * as systemSettingsService from "@/lib/services/core/system-settings-service"

// Warehouse → Core
// In warehouse/wh-purchase-order-pdf-service.ts:
import * as billingTenantConfigRepo from "./billing-tenant-config-repository"
→ import * as tenantConfigRepo from "@/lib/services/core/tenant-config-repository"

// All modules → Core (audit-logs)
import * as auditLog from "./audit-logs-service"
→ import * as auditLog from "@/lib/services/core/audit-logs-service"

// All module repos → Core (prisma-helpers)
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"
→ import { tenantScopedUpdate } from "@/lib/services/core/prisma-helpers"
```

#### Rule 4: Test file imports → adjust relative depth

```typescript
// Tests in module/__tests__/ importing from module/:
import * as svc from "../crm-address-service"  // stays ../

// Tests in module/__tests__/ importing from core/:
import * as svc from "../../core/audit-logs-service"

// vi.mock paths must match the final absolute paths:
vi.mock("@/lib/services/core/tenant-config-repository", () => ({ ... }))
```

#### Rule 5: Utility imports from tRPC routers → add core/

```typescript
// In src/trpc/routers/monthlyValues.ts:
import type { MonthSummary } from "@/lib/services/monthly-calc.types"
→ import type { MonthSummary } from "@/lib/services/core/monthly-calc.types"

// In src/trpc/routers/vacation.ts:
import { vacationBalanceOutputSchema } from "@/lib/services/vacation-balance-output"
→ import { vacationBalanceOutputSchema } from "@/lib/services/core/vacation-balance-output"
```

#### Rule 6: Cron route imports → add core/

```typescript
// In src/app/api/cron/*/route.ts:
import { logCronExecution } from "@/lib/services/cron-execution-logger"
→ import { logCronExecution } from "@/lib/services/core/cron-execution-logger"
```

### Complete Cross-Module Import Map

After all moves, these are the explicit cross-module imports:

| From file (module) | Imports from (module) | Import path |
|--------------------|-----------------------|-------------|
| `crm/crm-address-service.ts` | core | `@/lib/services/core/number-sequence-service` |
| `crm/crm-address-service.ts` | core | `@/lib/services/core/audit-logs-service` |
| `crm/crm-address-repository.ts` | core | `@/lib/services/core/prisma-helpers` |
| `crm/crm-inquiry-service.ts` | core | `@/lib/services/core/order-service` |
| `crm/crm-inquiry-service.ts` | core | `@/lib/services/core/number-sequence-service` |
| `crm/crm-correspondence-service.ts` | core | `@/lib/services/core/audit-logs-service` |
| `crm/crm-task-service.ts` | core | `@/lib/services/core/audit-logs-service` |
| `billing/billing-document-service.ts` | core | `@/lib/services/core/order-service` |
| `billing/billing-document-service.ts` | core | `@/lib/services/core/system-settings-service` |
| `billing/billing-document-service.ts` | core | `@/lib/services/core/number-sequence-service` |
| `billing/billing-document-service.ts` | core | `@/lib/services/core/tenant-config-repository` |
| `billing/billing-document-service.ts` | core | `@/lib/services/core/audit-logs-service` |
| `billing/billing-document-pdf-service.ts` | core | `@/lib/services/core/tenant-config-repository` |
| `billing/billing-document-einvoice-service.ts` | core | `@/lib/services/core/tenant-config-repository` |
| `billing/billing-recurring-invoice-service.ts` | core | `@/lib/services/core/number-sequence-service` |
| `billing/billing-service-case-service.ts` | core | `@/lib/services/core/number-sequence-service` |
| `warehouse/wh-article-service.ts` | core | `@/lib/services/core/number-sequence-service` |
| `warehouse/wh-article-service.ts` | core | `@/lib/services/core/audit-logs-service` |
| `warehouse/wh-purchase-order-service.ts` | core | `@/lib/services/core/number-sequence-service` |
| `warehouse/wh-purchase-order-pdf-service.ts` | core | `@/lib/services/core/tenant-config-repository` |
| `warehouse/wh-article-repository.ts` | core | `@/lib/services/core/prisma-helpers` |
| `warehouse/wh-purchase-order-repository.ts` | core | `@/lib/services/core/prisma-helpers` |
| `warehouse/wh-supplier-invoice-repository.ts` | core | `@/lib/services/core/prisma-helpers` |

---

## Phase 4: Verification

### Automated Verification:
- [ ] `pnpm typecheck` — zero new errors beyond existing baseline (~1463)
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm build` — build succeeds
- [ ] `pnpm lint` — no new lint errors
- [ ] Verify no files remain in `src/lib/services/` root (only subdirectories)
- [ ] Verify no `index.ts` barrel files exist in any module directory
- [ ] Verify `src/lib/services/__tests__/` is removed (empty)

### Manual Verification:
- [ ] `pnpm dev` — dev server starts, HMR works
- [ ] Navigate to CRM, Billing, Warehouse sections — all functional
- [ ] Disable a module in tenant settings — gating still works
- [ ] Check git diff: only file moves + import path changes, no logic changes

---

## Risk Assessment

**Low risk**: This is purely mechanical — file moves + import rewrites. No logic, no runtime behavior, no schema changes.

**Rollback**: `git revert <commit>` — one commit, clean revert.

**Biggest risk**: Missing an import. Mitigated by typecheck — TypeScript will catch every broken import path.

## Implementation Notes

- Use `git mv` for all moves to preserve git history
- Cross-module imports should use absolute `@/lib/services/<module>/` paths (not relative `../`)
- Intra-module imports stay relative (`./`)
- The `billing/tenantConfig.ts` router now imports from `@/lib/services/core/tenant-config-service` — the service moved modules AND was renamed
- `number-sequence-service` router lives at `src/trpc/routers/crm/numberSequences.ts` but imports from `@/lib/services/core/number-sequence-service` — this is fine, the router location doesn't need to match the service location

## References

- Research: `thoughts/shared/research/2026-03-25-module-architecture-services-repositories.md`
- Module system: `src/lib/modules/index.ts` (requireModule middleware)
- Root router: `src/trpc/routers/_app.ts`
