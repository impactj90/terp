---
date: 2026-03-25T12:00:00+01:00
researcher: Claude
git_commit: b2a3ac82
branch: staging
repository: terp
topic: "Module architecture: tRPC routers vs services/repositories organization and per-tenant module activation"
tags: [research, codebase, architecture, modules, services, repositories, multi-tenancy]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Module Architecture — Routers vs Services/Repositories Organization

**Date**: 2026-03-25
**Git Commit**: b2a3ac82
**Branch**: staging

## Research Question

The tRPC routers are modularized into subdirectories (`crm/`, `billing/`, `warehouse/`), but services and repositories remain in a flat `src/lib/services/` directory. Why? What would a modularized structure look like, and would it enable easier per-tenant module activation/deactivation?

## Summary

The codebase has a **two-speed architecture**: tRPC routers were modularized into subdirectories when module gating (`requireModule`) was introduced, but the service and repository layers were not refactored at the same time. All ~180 service/repository files live flat in `src/lib/services/`. The module system already works at the API layer (tRPC middleware) and UI layer (sidebar filtering), but the file organization doesn't reflect module boundaries below the router layer.

---

## Detailed Findings

### 1. Current tRPC Router Organization (Modularized)

`src/trpc/routers/` has three subdirectory modules with `index.ts` barrel files:

| Module | Directory | Sub-routers | Module guard |
|--------|-----------|-------------|--------------|
| CRM | `src/trpc/routers/crm/` | 6 files (addresses, correspondence, inquiries, numberSequences, reports, tasks) | `requireModule("crm")` |
| Billing | `src/trpc/routers/billing/` | 8 files (documents, documentTemplates, payments, priceLists, recurringInvoices, serviceCases, tenantConfig) | `requireModule("billing")` |
| Warehouse | `src/trpc/routers/warehouse/` | 7 files (articles, articlePrices, purchaseOrders, stockMovements, supplierInvoices, withdrawals) | `requireModule("warehouse")` |

The remaining **~65 flat router files** in `src/trpc/routers/*.ts` belong to "core" (always enabled). They are imported individually into `_app.ts` (lines 8-83).

Each module directory has an `index.ts` that creates a merged router:
```typescript
// src/trpc/routers/warehouse/index.ts
export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  // ...
})
```

The root `_app.ts` mounts them as namespaced keys:
```typescript
crm: crmRouter,        // line 159
billing: billingRouter, // line 160
warehouse: warehouseRouter, // line 161
```

### 2. Current Service/Repository Organization (Flat)

`src/lib/services/` contains **everything flat** — no subdirectories except `__tests__/`:

| Category | Count |
|----------|-------|
| `*-repository.ts` | 85 files |
| `*-service.ts` | 95 files |
| Utility/helper files | 10 files |
| Test files (`__tests__/`) | 31 files |
| **Total** | **221 files** |

Module boundaries are only indicated by **naming conventions**:

- **CRM**: `crm-address-*`, `crm-correspondence-*`, `crm-inquiry-*`, `crm-task-*`, `crm-report-*` (9 files)
- **Billing**: `billing-document-*`, `billing-payment-*`, `billing-price-list-*`, `billing-recurring-*`, `billing-service-case-*`, `billing-tenant-config-*` (16 files)
- **Warehouse**: `wh-article-*`, `wh-purchase-order-*`, `wh-stock-movement-*`, `wh-supplier-invoice-*`, `wh-withdrawal-*` (14 files)
- **Core**: Everything else (~182 files) — employees, bookings, absences, vacations, schedules, time tracking, travel, vehicles, departments, etc.

### 3. Current Hooks Organization (Flat)

`src/hooks/` is also flat (101 files, no subdirectories). Module prefixes exist:

| Prefix | Count |
|--------|-------|
| `use-crm-*` | 5 |
| `use-billing-*` | 7 |
| `use-wh-*` | 8 |
| Unprefixed (core) | ~80 |

### 4. How Module Gating Works Today

The module system is enforced at **two layers**:

**API layer** — `src/lib/modules/index.ts`:
- `requireModule(module)` is a tRPC middleware that checks `tenant_modules` table
- Each module router creates a local base procedure: `const crmProcedure = tenantProcedure.use(requireModule("crm"))`
- `"core"` always short-circuits to `true` — no DB query needed

**UI layer** — `src/components/layout/sidebar/sidebar-nav.tsx`:
- `useModules()` fetches enabled modules via `tenantModules.list`
- Navigation items/sections with `module: 'crm' | 'billing' | 'warehouse'` are hidden when the module is disabled
- Defined in `sidebar-nav-config.ts` (lines 284, 318, 366)

**Database** — `tenant_modules` table:
- `TenantModule` model in Prisma with composite unique `[tenantId, module]`
- CHECK constraint: `module IN ('core', 'crm', 'billing', 'warehouse')`
- CRUD via `tenant-module-service.ts` / `tenant-module-repository.ts`
- Admin toggle UI in `src/components/settings/module-settings.tsx`

### 5. Import Patterns

**Router -> Service** (absolute paths):
```typescript
// src/trpc/routers/warehouse/articles.ts
import * as whArticleService from "@/lib/services/wh-article-service"
```

**Service -> Repository** (relative paths):
```typescript
// src/lib/services/wh-article-service.ts
import * as repo from "./wh-article-repository"
```

**Cross-module service dependencies** (relative paths, all within `src/lib/services/`):
- `wh-purchase-order-pdf-service.ts` imports `billing-tenant-config-repository` (company address for PDF)
- `crm-inquiry-service.ts` imports `order-service`
- `billing-document-service.ts` imports `order-service` and `system-settings-service`
- `billing-service-case-service.ts` imports `billing-document-service`

### 6. Proposed Modular Structure

The user's proposed structure:

```
src/lib/services/
  core/        # employees, bookings, absences, vacations, time, schedules, etc.
  crm/         # crm-address, crm-correspondence, crm-inquiry, crm-task, crm-report
  billing/     # billing-document, billing-payment, etc.
  warehouse/   # wh-article, wh-stock, wh-purchase-order, etc.

src/lib/repositories/
  core/        # matching repository files
  crm/
  billing/
  warehouse/
```

### 7. File Counts for Proposed Module Split

Based on naming conventions, the split would be roughly:

| Module | Services | Repositories | Utilities | Total |
|--------|----------|-------------|-----------|-------|
| **core** | ~72 | ~68 | ~10 | ~150 |
| **crm** | 5 | 4 | 0 | 9 |
| **billing** | 9 | 7 | 0 | 16 |
| **warehouse** | 9 | 5 | 0 | 14 |

### 8. Cross-Module Dependencies That Would Need Explicit Module Boundaries

These imports currently use `./` relative paths and would need to become cross-module imports:

| From (module) | To (module) | Files |
|--------------|-------------|-------|
| warehouse | billing | `wh-purchase-order-pdf-service` -> `billing-tenant-config-repository` |
| crm | core | `crm-inquiry-service` -> `order-service` |
| billing | core | `billing-document-service` -> `order-service`, `system-settings-service` |
| billing | billing (intra) | `billing-service-case-service` -> `billing-document-service` |
| billing | billing (intra) | `billing-recurring-invoice-service` -> `billing-document-service` |
| all modules | core | Nearly every service imports `audit-logs-service` |
| all repos | core | Nearly every repository imports `prisma-helpers` |

### 9. Relevance to Per-Tenant Module Activation

The current module activation system (`tenant_modules` + `requireModule` middleware) works purely at the API routing layer. The service and repository layers have **no module awareness** — they're just functions that receive a Prisma client and tenant ID.

A modularized directory structure would provide:
- **Clear ownership boundaries**: Every file belongs to exactly one module
- **Import graph visibility**: Cross-module imports become explicit (e.g., `@/lib/services/billing/...` instead of `./billing-...`)
- **Potential for dynamic loading**: Module directories could theoretically be conditionally registered, though the current `requireModule` middleware approach is simpler and works well
- **Developer ergonomics**: Finding all files related to a module becomes a directory listing instead of a grep

The actual runtime gating would remain unchanged — `requireModule` middleware at the tRPC layer is the enforcement point, not the file structure.

## Code References

- `src/trpc/routers/_app.ts:81-83` — Module router imports (crm, billing, warehouse)
- `src/trpc/routers/_app.ts:159-161` — Module router registration in appRouter
- `src/trpc/routers/crm/index.ts` — CRM sub-router barrel
- `src/trpc/routers/billing/index.ts` — Billing sub-router barrel
- `src/trpc/routers/warehouse/index.ts` — Warehouse sub-router barrel
- `src/lib/modules/index.ts:70-98` — `requireModule` middleware
- `src/lib/modules/constants.ts` — `AVAILABLE_MODULES` definition
- `src/lib/services/tenant-module-service.ts` — Module CRUD service
- `src/lib/services/tenant-module-repository.ts` — Module Prisma queries
- `src/trpc/routers/tenantModules.ts` — Module management API router
- `src/components/settings/module-settings.tsx` — Admin module toggle UI
- `src/components/layout/sidebar/sidebar-nav.tsx:21-74` — Sidebar module filtering
- `src/components/layout/sidebar/sidebar-nav-config.ts:284,318,366` — Module assignments on nav sections
- `src/hooks/use-modules.ts` — Client-side module hooks
- `prisma/schema.prisma:216-228` — TenantModule model
- `supabase/migrations/20260101000093_create_tenant_modules.sql` — tenant_modules DDL

## Architecture Documentation

### Current State Diagram

```
Layer 1 — tRPC Routers (MODULARIZED for crm/billing/warehouse)
  ├── src/trpc/routers/crm/       → requireModule("crm")
  ├── src/trpc/routers/billing/   → requireModule("billing")
  ├── src/trpc/routers/warehouse/ → requireModule("warehouse")
  └── src/trpc/routers/*.ts       → core (always enabled, ~65 flat files)

Layer 2 — Services (FLAT — all in src/lib/services/)
  └── 95 service files, distinguished only by naming prefix (crm-*, billing-*, wh-*, or none)

Layer 3 — Repositories (FLAT — colocated with services in src/lib/services/)
  └── 85 repository files, same naming convention

Layer 4 — Hooks (FLAT — all in src/hooks/)
  └── 101 hook files, module-prefixed (use-crm-*, use-billing-*, use-wh-*) or plain
```

### Import Flow

```
Router (modular)
  └── import * as fooService from "@/lib/services/foo-service"  (absolute)
        └── import * as repo from "./foo-repository"  (relative, same dir)
        └── import * as auditLog from "./audit-logs-service"  (relative, cross-concern)
```

## Open Questions

1. **Where should shared utilities live?** Files like `prisma-helpers.ts`, `daily-calc.helpers.ts`, `holiday-calendar.ts` are used across modules. They could stay in `src/lib/services/core/` or a separate `src/lib/services/shared/` directory.
2. **Should `number-sequence-service.ts` be core or billing?** It's used by both CRM and billing for generating sequential document numbers.
3. **How to handle cross-module imports cleanly?** Options: barrel `index.ts` files per module, or explicit deep imports. Barrel files would mirror the tRPC router pattern.
4. **Should tests move with their module?** Currently `src/lib/services/__tests__/` is flat. Tests could be colocated per module: `src/lib/services/billing/__tests__/`.
5. **Impact scope**: ~221 files in services + ~101 hooks + all router imports would need path updates. TypeScript path aliases (`@/lib/services/...`) mean no runtime changes, but every import statement referencing `@/lib/services/` would need updating.
