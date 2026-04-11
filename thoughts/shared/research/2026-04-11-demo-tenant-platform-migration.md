---
date: 2026-04-11T14:32:21+02:00
researcher: tolga
git_commit: 9e4e0b2757b343690a6d401483d1de17fb0c6ea4
branch: staging
repository: terp
topic: "Demo-Tenant-Migration von /admin/tenants (tenants.manage) nach /platform/* (platformProcedure)"
tags: [research, demo-tenant, platform-admin, migration, subscription-bridge, audit, tenants-manage]
status: complete
last_updated: 2026-04-11
last_updated_by: tolga
---

# Research: Demo-Tenant-Migration von Tenant-App nach Platform-Admin

**Date**: 2026-04-11T14:32:21+02:00
**Researcher**: tolga
**Git Commit**: 9e4e0b27 (staging)
**Branch**: staging
**Repository**: terp

## Research Question

Vollständiger Call-Graph und Bestandsaufnahme für die Migration des Demo-Tenant-Bereichs aus der Tenant-App (`/admin/tenants`, gegated mit `tenants.manage`) in die Platform-Admin-Welt (`/platform/*`, gegated mit `platformAuthedProcedure`). Fakten, keine Lösungsentscheidungen.

## Summary

- **Demo-Tenant-Stack heute**: 1 Router (`src/trpc/routers/demo-tenants.ts`, 7 Procedures), 1 Service (`demo-tenant-service.ts`, ~760 LOC inkl. `wipeTenantData`), 1 Repo, 4 UI-Komponenten unter `src/components/tenants/demo/*`, 1 Hook-Modul (`src/hooks/use-demo-tenants.ts`), 1 Template (`industriedienstleister_150.ts`), 1 Cron-Route, 7 Audit-Events — alle schreiben in die tenant-scoped Tabelle `audit_logs`. Gegated durch `tenants.manage` auf 6 der 7 Procedures; `requestConvertFromExpired` läuft ungegated (nur `protectedProcedure`).
- **Platform-Admin-Stack existiert schon vollständig**: eigene tRPC-Hierarchie unter `src/trpc/platform/**`, eigener Route-Adapter `/api/trpc-platform/[trpc]`, eigener Cookie/JWT-Stack (`src/lib/platform/{jwt,cookie,password}.ts`), eigener Audit-Service (`src/lib/platform/audit-service.ts` → `platform_audit_logs`), eigenes UI unter `src/app/platform/(authed)/**`, sechs Haupt-Routers. Der Tenant-Create-Pfad ist bereits als `tenantManagement.create` implementiert und wird in `/platform/tenants/new/page.tsx` aufgerufen — das ist der existierende Andockpunkt.
- **Subscription-Bridge**: `subscription-service.createSubscription()` ist der direkte Entry-Point. Nimmt `PrismaClient` (nicht `Tx`), öffnet interne `$transaction`, schreibt keine Audit-Logs selbst. `enableModule` ruft es heute an genau einer Stelle (`tenantManagement.ts:569`). Die House-Rule (`isOperatorTenant`) verhindert Self-Billing.
- **Inbox-Pattern für Convert-Requests fehlt**: Die einzige Action-Queue im Platform-UI ist die Support-Sessions-Seite. `email_send_log` wird in `/platform/**` nirgends gelesen — `notifyConvertRequest` schreibt heute nur eine Pending-Email, keine durchsuchbare Queue. Der Platform-Dashboard-Code enthält einen expliziten Comment (Zeile 11–13), dass die Demo-Convert-Request-Card auf eine "platform-side materialization" wartet.
- **Harte Migrations-Risiken**: FK `demo_created_by` → `users(id)` mit `ON DELETE SET NULL` (eine einzige Migration). Dual-Write-Audit-Pattern existiert heute nur implizit für Impersonation-Sessions (via `AsyncLocalStorage`), nicht als wiederverwendbarer Helper. Kein einziger Test prüft `tenants.manage` als FORBIDDEN-Gate auf Demo-Procedures. Keine Seed- oder Fixture-Demo-Rows in Dev/Prod — das Risiko bestehender Zeilen ist auf die integration-test-Fixtures beschränkt.

## Heutiger Zustand

### A. Demo-Tenant Tenant-App-Stack

#### A.1 Router `src/trpc/routers/demo-tenants.ts`

Registriert in `src/trpc/routers/_app.ts:13` (Import) und `_app.ts:120` als `demoTenants: demoTenantsRouter`. Client-Namespace: `trpc.demoTenants.*`.

Permission-Konstante oben im File: `src/trpc/routers/demo-tenants.ts:17` `const TENANTS_MANAGE = permissionIdByKey("tenants.manage")!`.

Sieben Procedures (alle `protectedProcedure`):

| Procedure | Gate | Input | Service-Call | Datei:Zeile |
|---|---|---|---|---|
| `templates` | `requirePermission(TENANTS_MANAGE)` | — | `listDemoTemplates()` (sync) | `demo-tenants.ts:42–44` |
| `list` | `requirePermission(TENANTS_MANAGE)` | — | `demoService.listActiveDemos(ctx.prisma)` | `demo-tenants.ts:50–58` |
| `create` | `requirePermission(TENANTS_MANAGE)` | `createDemoInputSchema` (siehe Zeilen 19–35) | `demoService.createDemo(ctx.prisma, ctx.user!.id, input, audit)` | `demo-tenants.ts:65–78` |
| `extend` | `requirePermission(TENANTS_MANAGE)` | `{tenantId, additionalDays: 7\|14}` | `demoService.extendDemo(...)` | `demo-tenants.ts:84–107` |
| `convert` | `requirePermission(TENANTS_MANAGE)` | `{tenantId, discardData}` | `demoService.convertDemo(...)` | `demo-tenants.ts:114–137` |
| `expireNow` | `requirePermission(TENANTS_MANAGE)` | `{tenantId}` | `demoService.expireDemoNow(...)` | `demo-tenants.ts:143–156` |
| `delete` | `requirePermission(TENANTS_MANAGE)` | `{tenantId}` | `demoService.deleteDemo(...)` | `demo-tenants.ts:164–177` |
| `requestConvertFromExpired` | **ungegated** (nur `protectedProcedure`) | `{tenantId}` | `demoService.requestConvertFromExpired(...)` | `demo-tenants.ts:188–205` |

Der `requestConvertFromExpired`-Kommentar (Zeile 182–187) dokumentiert explizit, dass der Demo-Admin-User `tenants.manage` nicht besitzt und der Service selbst die Membership plus den Expired-Status prüft (`demo-tenant-service.ts:463–481`).

`createDemoInputSchema` (`demo-tenants.ts:19–35`) hat Felder: `tenantName`, `tenantSlug` (regex `/^[a-z0-9-]+$/`), `addressStreet`, `addressZip`, `addressCity`, `addressCountry`, `adminEmail`, `adminDisplayName`, `demoTemplate` (default `DEFAULT_DEMO_TEMPLATE`), `demoDurationDays` (1–90), `notes`.

#### A.2 Service + Repository

**`src/lib/services/demo-tenant-service.ts`** (~760 Zeilen). Konstanten: `DEMO_DEFAULT_DURATION_DAYS = 14` (Zeile 22), `DEMO_MODULES = ["core", "crm", "billing", "warehouse"]` (Zeile 23). Domain-Fehlerklassen: `DemoTenantValidationError`, `DemoTenantNotFoundError`, `DemoTenantForbiddenError` (Zeilen 27–46).

- `createDemo` (Zeile 104): Eine äußere `prisma.$transaction` mit 120s Timeout. Schritte im Inneren:
  1. `repo.createDemoTenant(tx, ...)` (Zeile 127)
  2. For-Each über `DEMO_MODULES`: `tx.tenantModule.upsert` (Zeile 143)
  3. `repo.findSystemDemoAdminGroup(tx)` (Zeile 155) — Demo-Admin-Group Lookup
  4. `createUser(tx, tenant.id, ...)` (Zeile 161) via `users-service.create` — erzeugt Supabase-Auth-User + Welcome-Email
  5. `template.apply({tx, tenantId, adminUserId})` (Zeile 176)

  Außerhalb der Transaction: `auditLog.log` mit `action: "demo_create"` (Zeile 192), fire-and-forget.
  Compensation-Catch (Zeile 218): Falls tx rollback und `createdAuthUserId` gesetzt, manueller `supabaseAdmin.auth.admin.deleteUser(...)`.

- `listActiveDemos` (Zeile 239): `repo.findActiveDemos` + Map auf `daysRemaining`.

- `extendDemo` (Zeile 263): Zieht Tenant, berechnet Base (`demoExpiresAt` falls in der Zukunft, sonst `now`), setzt `demoExpiresAt = addDays(base, additionalDays)`. **Re-Aktivierung expired Demos** ist explizit dokumentiert (Zeile 252–262): falls `isActive=false`, wird es wieder auf `true` gesetzt. Audit `demo_extend` (Zeile 294).

- `convertDemo` (Zeile 318): `$transaction` mit optionaler `wipeTenantData(tx, tenantId, {keepAuth: true})` wenn `discardData=true`, dann `repo.convertDemoKeepData(tx, tenantId)` (strippt `isDemo=false`, `demoExpiresAt=null`, `demoTemplate=null`, `demoCreatedById=null`, `demoNotes=null`). Audit `demo_convert` (Zeile 344). **Ruft anschließend `notifyConvertRequest`** (Zeile 361) — dieselbe Funktion wie der Self-Service-Pfad.

- `expireDemoNow` (Zeile 370): `repo.markDemoExpired(prisma, tenantId, new Date())`. Audit `demo_manual_expire` (Zeile 384).

- `deleteDemo` (Zeile 402): Wirft `DemoTenantForbiddenError` falls `isActive !== false`. Audit **vor** dem Löschen (`demo_delete`, Zeile 421), Begründung in Kommentar: `audit_logs` hat keinen FK auf `tenants`, also überlebt die Zeile. Danach `$transaction` mit `wipeTenantData(..., {keepAuth: false})` + `tx.tenant.delete(...)` (Zeile 440).

- `requestConvertFromExpired` (Zeile 458): Explizite Membership-Prüfung via `prisma.userTenant.findUnique` (Zeile 465), anschließend Demo-Check und `demoExpiresAt > now` → Forbidden. Fire-and-forget `notifyConvertRequest` (Zeile 484), Audit `demo_convert_req` (Zeile 496).

- **`wipeTenantData`** (Zeile 575–762): Deletes in FK-safe order, in Layer L1–L5 gruppiert. L1 sind Leaves (bookings, time-tracking, employee-extensions, warehouse, inbound-invoices, billing, CRM, exports). L2 sind mid-tier (employees, orders, shifts, macros, vehicles). L3 sind master data (tariffs, weekPlans, dayPlans, departments, teams, absenceTypes, holidays, emailTemplates, tenantModule, systemSetting, imap/smtp configs). L4 (nur bei `keepAuth=false`): `userTenant.deleteMany` → `user.deleteMany` (nur mit `tenantId=tenantId AND userTenants.none`) → `userGroup.deleteMany`. L5: `tenant.delete` (nur in `deleteDemo` selbst aufgerufen).

- **`notifyConvertRequest`** (Zeile 525–551): Privat. Schreibt genau **eine** Row via `emailSendLogRepo.create(prisma, tenant.id, {...})` in die `email_send_log` Tabelle — scoped auf die **Demo-Tenant-ID** (nicht auf den Operator). Recipient: `process.env.DEMO_CONVERT_NOTIFICATION_EMAIL ?? "sales@terp.dev"`. Keine weiteren Side-Effects.

**`src/lib/services/demo-tenant-repository.ts`**: `DEMO_ADMIN_GROUP_ID = "dd000000-0000-0000-0000-000000000001"` (Zeile 15). Funktionen: `createDemoTenant` (Zeile 31), `findActiveDemos` (Zeile 51, include `demoCreatedBy`), `findExpiredActiveDemos` (Zeile 63), `extendDemoExpiration` (Zeile 77), `markDemoExpired` (Zeile 92), `convertDemoKeepData` (Zeile 107), `findSystemDemoAdminGroup` (Zeile 124).

#### A.3 Template-Engine

**`src/lib/demo/registry.ts`**: Record von `key → DemoTemplate`. `getDemoTemplate(key)` wirft bei unbekannten Keys. `listDemoTemplates()` für UI-Dropdown. `DEFAULT_DEMO_TEMPLATE = industriedienstleister150.key`.

**`src/lib/demo/types.ts`**: `DemoTemplateContext = { tenantId, adminUserId, tx: Prisma.TransactionClient }`. `DemoTemplate = { key, label, description, apply(ctx) }`. Der Kontrakt ist: alle Writes laufen durch `ctx.tx`, keine externen Side-Effects.

**`src/lib/demo/templates/industriedienstleister_150.ts`**: Einziges registriertes Template. `apply(ctx)` (ab Zeile 135) ruft `faker.seed(42)` (deterministische Wiederholbarkeit). Schreibt ausschließlich durch `ctx.tx`, mit `tenantId=ctx.tenantId`:

- HR/Scheduling (Z. 177–441): 4 Departments (`seedDepartments`), 1 AccountGroup + 10 Accounts (`seedAccounts`), 3 DayPlans (`seedDayPlans`), 3 WeekPlans (`seedWeekPlans`), 12 Tariffs (`seedTariffs`), 8 BookingTypes, 6 AbsenceTypes, 20 Holidays, 150 Employees, ~3000–4500 EmployeeDayPlans in Batches von 1000 (`seedEmployeeDayPlans`).
- CRM (Z. 443–487): 3 `crmAddress` vom Typ CUSTOMER.
- Billing (Z. 489–577): 5 `billingDocument` (DRAFT/INVOICE) mit je 3 Positions (total 15).
- Warehouse (Z. 579–626): 2 Warengruppen, 30 Artikel.

Keine HTTP/Filesystem/Supabase-Calls. `ctx.adminUserId` wird im aktuellen Template nicht direkt in Writes verwendet — nur `tenantId` scoped alle Rows.

#### A.4 Schema Fields + Migrationen

**`prisma/schema.prisma`** Model `Tenant` (Zeilen 113–121):

| Zeile | Feld |
|---|---|
| 114 | `isDemo Boolean @default(false) @map("is_demo")` |
| 115 | `demoExpiresAt DateTime? @map("demo_expires_at") @db.Timestamptz(6)` |
| 116 | `demoTemplate String? @map("demo_template") @db.VarChar(100)` |
| 117 | `demoCreatedById String? @map("demo_created_by") @db.Uuid` |
| 118 | `demoNotes String? @map("demo_notes") @db.Text` |
| 121 | `demoCreatedBy User? @relation("DemoTenantCreatedBy", fields:[demoCreatedById], references:[id], onDelete: SetNull)` |

Index Zeile 279: `@@index([isDemo, demoExpiresAt], map: "idx_tenant_demo_expiration")` — auf SQL-Ebene als Partial-Index (`WHERE is_demo = true`) implementiert.

Back-Reference am `User` Model: `prisma/schema.prisma:64` `demoTenantsCreated Tenant[] @relation("DemoTenantCreatedBy")`.

**Migrationen**:

- `supabase/migrations/20260420100000_add_tenant_demo_fields.sql` — fügt alle 5 Demo-Spalten hinzu, Partial-Index `idx_tenant_demo_expiration` auf `demo_expires_at WHERE is_demo = true`, CHECK `tenants_demo_expiration_consistency` (`demo_expires_at` ist NULL gdw. `is_demo=false`). FK-Zeile (Zeile 8 der Migration): `ADD COLUMN demo_created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,`.
- `supabase/migrations/20260420100002_seed_demo_admin_group.sql` — Idempotenter INSERT von `user_groups` Row mit `id='dd000000-0000-0000-0000-000000000001'::uuid`, `tenant_id=NULL` (system-wide), `code='DEMO_ADMIN'`, `name='Demo Admin'`, `permissions='[]'::jsonb`, `is_admin=true`, `is_system=true`, `is_active=true`. Keine FK-Dependencies auf `users(id)` oder `platform_users(id)`.

#### A.5 Audit-Log Events

Alle Demo-Events schreiben in die tenant-scoped Tabelle `audit_logs` (`prisma/schema.prisma:3043–3067`, `@@map("audit_logs")`). **Nicht** in `platform_audit_logs`. Kein FK von `audit_logs` auf `tenants` (bewusst, damit `demo_delete`-Eintrag den Tenant-Delete überlebt).

| Action | File:Line | userId | Key Metadata |
|---|---|---|---|
| `demo_create` | `demo-tenant-service.ts:192` | `creatingUserId` (user who created demo) | `demoTemplate`, `demoExpiresAt`, `durationDays`, `adminUserId`, `adminEmail`, `welcomeEmailSent` |
| `demo_extend` | `demo-tenant-service.ts:294` | `audit.userId` | `changes: {demoExpiresAt, [isActive]}`, `additionalDays` |
| `demo_convert` | `demo-tenant-service.ts:344` | `audit.userId` | `changes: {isDemo:true→false}`, `discardData`, `originalTemplate` |
| `demo_manual_expire` | `demo-tenant-service.ts:384` | `audit.userId` | `changes: {isActive:→false}` |
| `demo_delete` | `demo-tenant-service.ts:421` | `audit.userId` | `originalTemplate`, `createdAt`, `demoExpiredAt` (geschrieben **vor** dem Delete) |
| `demo_convert_req` | `demo-tenant-service.ts:496` | `requestingUserId` | `requestedBy`, `expiredAt` |
| `demo_expired` | `expire-demo-tenants/route.ts:67` | **`null`** | `trigger:"cron"`, `demoExpiresAt`; UA `"cron/expire-demo-tenants"` |

Helper: `src/lib/services/audit-logs-service.ts:173` `log(prisma, data)`. `userId` ist nullable. **Besonderheit** (Zeile 177–213): Wenn `getImpersonation()` (aus `src/lib/platform/impersonation-context.ts`) einen aktiven Impersonation-Context liefert, schreibt `log()` **zusätzlich** eine Row in `platform_audit_logs` mit `action="impersonation.${data.action}"`, mit `platformUserId` und `supportSessionId` aus dem Context. Das ist das einzige existierende Dual-Write-Pattern (implizit, via `AsyncLocalStorage`).

#### A.6 Cron `/api/cron/expire-demo-tenants`

**`src/app/api/cron/expire-demo-tenants/route.ts`**. `runtime="nodejs"`, `maxDuration=300`. Gating: reines `Authorization: Bearer ${CRON_SECRET}` Check (Zeilen 140–151). Keine `tenantProcedure`, kein tRPC-Context.

Ablauf in `executeExpireDemoTenants(now)` (Zeile 29):
1. `repo.findExpiredActiveDemos(prisma, now)` (Zeile 34) — zieht Rows mit `isDemo=true AND isActive=true AND demoExpiresAt<now`.
2. Checkpoint-Query (`cronCheckpoint` Tabelle, `cronName="expire_demo_tenants"`, `runKey=YYYY-MM-DD`) für Idempotenz bei Re-Runs.
3. Pro Demo: `repo.markDemoExpired(prisma, demo.id)` → Audit `demo_expired` mit `userId=null` → `cronCheckpoint.upsert`.
4. Fehler pro Tenant isoliert, kein Rollback — summarische Response mit `{ok, runKey, processed, failed, results}`.

Vercel-Schedule: `vercel.json:43–46`, `"schedule": "0 1 * * *"` (01:00 UTC).

Es ist der einzige Cron, der `isDemo` / `is_demo` filtert. Alle anderen Cron-Routen unter `src/app/api/cron/**` (calculate-days, calculate-months, generate-day-plans, execute-macros, recurring-invoices, platform-subscription-autofinalize, wh-corrections, email-retry, email-imap-poll, inbound-invoice-escalations, platform-cleanup, dsgvo-retention, export-template-schedules) haben keinen `isDemo`-Filter.

#### A.7 Admin-UI Komponenten

Alle unter `src/components/tenants/demo/`:

| Datei | Aufgabe | tRPC-Calls |
|---|---|---|
| `demo-tenants-panel.tsx` | Top-level Card, rendert Loading/Empty/Table, mountet `DemoCreateSheet` + `DemoConvertDialog` als Portal. | `useDemoTenants()` → `trpc.demoTenants.list` |
| `demo-tenants-table.tsx` | Daten-Tabelle mit Spalten (name/slug, template, creator, created, days-remaining badge, Aktionen-DropdownMenu). Row-Actions: Extend (7/14), Convert, Expire Now (ConfirmDialog), Delete (ConfirmDialog, nur bei `daysRemaining<=0`) | `useExtendDemoTenant`, `useExpireDemoTenantNow`, `useDeleteDemoTenant` |
| `demo-create-sheet.tsx` | Sheet mit Sektionen Tenant/Adresse/Admin + Demo (Template-Dropdown, Duration, Notes). Bei Response mit `inviteLink` schaltet das Sheet auf Invite-Link-Display um statt zu schließen. | `useDemoTemplates`, `useCreateDemoTenant` |
| `demo-convert-dialog.tsx` | Dialog mit RadioGroup "discard" vs. "keep" | `useConvertDemoTenant` |
| `index.ts` | Re-exports | — |

**Hook-Modul**: `src/hooks/use-demo-tenants.ts` wrappt alle Client-Aufrufe. Mutations invalidieren nach Erfolg konsequent `trpc.demoTenants.list.queryKey()`.

**Mount-Punkt** (einziger): `src/app/[locale]/(dashboard)/admin/tenants/page.tsx:122` rendert `<DemoTenantsPanel />`. Die Seite ist `'use client'`, macht am Anfang `const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['tenants.manage'])` (Zeile 32), redirected auf `/dashboard` falls nicht erlaubt (Zeilen 59–61). Der gesamte Panel wird also erst sichtbar, wenn der Client-Permission-Check erfolgreich ist.

Der Layout-Stack darüber (`src/app/[locale]/(dashboard)/layout.tsx`): `DashboardLayout` → `ProtectedRoute` → `TenantProvider` → `TenantGuard` → `DemoExpirationGate` → `AppLayout` → `DemoBanner` → children.

**Platform-Dashboard-Hinweis**: `src/app/platform/(authed)/dashboard/page.tsx:11–13` enthält einen Comment, der die Demo-Convert-Request-Card explizit bis zur "platform-side materialization" von `demoTenants.requestConvertFromExpired` zurückstellt.

#### A.8 `tenants.manage` Permission References (Demo-Kontext)

- `src/trpc/routers/demo-tenants.ts:17` — Konstante `TENANTS_MANAGE = permissionIdByKey("tenants.manage")!`, verwendet auf 6 Procedures (`43,51,66,85,115,144,165`). Die 7. (`requestConvertFromExpired`) ist explizit ungegated (Zeile 188).
- `src/lib/services/demo-tenant-service.ts:455` — Kommentar über die Ungegated-Absicht von `requestConvertFromExpired`.
- `src/hooks/use-demo-tenants.ts:8` und `:90` — JSDoc-Kommentare an den Hooks.
- `src/app/[locale]/(dashboard)/admin/tenants/page.tsx:32` — Client-Side-Gate via `useHasPermission(['tenants.manage'])`.

**Andere (nicht-Demo) Nutzungen** von `tenants.manage`:
- `src/trpc/routers/tenants.ts` Zeilen ~209/256/289/416/554 — gesamter regulärer Tenant-Router ist ebenfalls damit gegated.
- `src/components/layout/sidebar/sidebar-nav-config.ts:542` — `/admin/tenants` Sidebar-Entry hat `permissions: ['tenants.manage']`.
- `src/lib/auth/permission-catalog.ts:129` — kanonische Definition.

#### A.9 Tenant-seitige Demo-UX, die **bleibt**

Diese drei Komponenten laufen **im Kontext eines Demo-Tenants selbst**, nicht im Admin-Panel, und sollen nicht migriert werden:

- **`src/components/layout/demo-banner.tsx`** — Yellow Sticky-Banner mit Sparkles-Icon, zeigt `daysRemaining`. Keine eigene tRPC-Query, liest `tenant` aus `useTenant()` (Cache-Hit auf `trpc.tenants.list`). Mount: `src/app/[locale]/(dashboard)/layout.tsx:26` innerhalb `AppLayout`. Rendert null bei `daysRemaining<=0`. i18n-Key `adminTenants.demo.banner.message`.

- **`src/components/layout/demo-expiration-gate.tsx`** — Wrapper-Komponente. `useEffect` prüft `tenant.isDemo && demoExpiresAt < now` und calls `router.replace('/demo-expired')`. Rendert Children unconditional (Redirect ist Navigation-Side-Effect). Mount: `src/app/[locale]/(dashboard)/layout.tsx:23`. Kein tRPC-Call.

- **`src/app/[locale]/demo-expired/page.tsx`** — `'use client'`. Centered Card mit statischem Text + CTA-Button. Button ruft `useRequestConvertFromExpired()` → `trpc.demoTenants.requestConvertFromExpired`. Bei Success ersetzt ein `Alert` den Button. Layout `src/app/[locale]/demo-expired/layout.tsx` wrappt in `ProtectedRoute + TenantProvider`, **bewusst ohne** `TenantGuard`, `AppLayout`, `DemoExpirationGate`, `DemoBanner`.

Kein `middleware.ts` auf Root-Level enthält `is_demo`-Logik. Die Supabase-Middleware (`src/lib/supabase/middleware.ts`) macht nur Session-Token-Refresh. Der `TenantProvider` hat keine Demo-Logik.

### B. Platform-Admin-System (Ziel-Welt)

#### B.1 Platform tRPC Setup

**`src/trpc/platform/`** (Tree):

```
init.ts                      — Context-Factory + 3 Procedure-Typen
_app.ts                      — Root-Router (6 Subrouter)
context.ts                   — React-Context (usePlatformTRPC etc.)
client.tsx                   — PlatformTRPCProvider Komponente
routers/
  auth.ts                    — passwordStep, mfaEnroll, mfaVerify, logout, me
  platformUsers.ts           — Operator CRUD
  tenants.ts                 — Read-only Directory + impersonation-gated Detail
  tenantManagement.ts        — Tenant CRUD + Module enable/disable + Subscription
  supportSessions.ts         — List/getById/activate/revoke
  auditLogs.ts               — Paginated Read von platform_audit_logs
  __tests__/                 — 5 Test-Dateien
__tests__/
  helpers.ts
  init.test.ts
```

**`src/trpc/platform/init.ts`** (250 Zeilen):

- `PlatformTRPCContext` Typ (Zeile 54–71): `prisma`, `platformUser: PlatformContextUser | null`, `claims: PlatformJwtClaims | null`, `activeSupportSessionId: string | null`, `ipAddress`, `userAgent`, `responseHeaders: Headers`.
- `createPlatformTRPCContext(opts, responseHeaders)` (Zeile 98–153): extrahiert Token aus Cookie oder Bearer-Header, verifiziert via `@/lib/platform/jwt.verify`, lädt `prisma.platformUser.findUnique`, prüft `isActive`, strippt Secrets (`passwordHash`, `mfaSecret`, `recoveryCodes`). Bei gültigem Token: `refresh()` schreibt ein neues Cookie in `responseHeaders`. Bei ungültig/abgelaufen/deaktiviert: `buildClearCookie()` an `responseHeaders` angehängt.
- Drei exponierte Procedure-Typen:
  - `platformPublicProcedure` (Zeile 179) — für `auth.passwordStep`, `auth.mfaVerify`, `auth.mfaEnroll`.
  - `platformAuthedProcedure` (Zeile 185–208) — wirft UNAUTHORIZED wenn `!ctx.platformUser || !ctx.claims`, und wenn `!ctx.claims.mfaVerified`.
  - `platformImpersonationProcedure` (Zeile 218–249) — liest auf jedem Call frisch `supportSession.findFirst({id, platformUserId, status:"active", expiresAt:{gt:new Date()}})`, wirft FORBIDDEN sonst. Attachert `supportSession` an den `ctx`.

**Route-Adapter**: `src/app/api/trpc-platform/[trpc]/route.ts` — ein Handler, exportiert als `GET` und `POST`. Erzeugt pro Request ein neues `responseHeaders = new Headers()`, stamped `x-auth-domain: platform`, ruft `createPlatformTRPCContext(opts, responseHeaders)`, nach `fetchRequestHandler`-Return werden Headers auf die Response kopiert und `Set-Cookie` einzeln via `responseHeaders.getSetCookie()` angehängt.

**Client** `src/trpc/platform/client.tsx`: Endpoint `/api/trpc-platform`, `credentials:"include"`, `platformFetch` Interceptor prüft `status===401 && x-auth-domain==="platform"` und hard-redirected auf `/platform/login?reason=session`. Kein Supabase-Session, kein `x-tenant-id` Header. QueryClient: `staleTime:60_000`, `retry:0`, `refetchOnWindowFocus:false`, `MutationCache.onError` toastet global über Sonner.

**React-Context** `src/trpc/platform/context.ts:11–15`: `createTRPCContext<PlatformAppRouter>()` → `PlatformTRPCContextProvider`, `usePlatformTRPC`, `usePlatformTRPCClient`. Typ-getrennt vom Tenant-`useTRPC`.

#### B.2 Platform Auth

**`src/lib/platform/jwt.ts`** (HS256 via `jose`):
- `sign`, `verify`, `refresh` für Session-Tokens mit `sub`, `email`, `displayName`, `lastActivity`, `sessionStartedAt`, `mfaVerified`.
- Verify enforced 30-Min Idle (`SESSION_IDLE_MS`) und 4-Std Absolute Cap (`SESSION_MAX_MS`) in-memory.
- Separate Audiences: `terp-platform-mfa-enrollment`, `terp-platform-mfa-challenge` (5 Min Expiry).

**`src/lib/platform/cookie.ts`**: `PLATFORM_SESSION_COOKIE_NAME="platform-session"`. Attribute `HttpOnly; Secure; SameSite=Strict; Max-Age=14400`. Optional `Domain=` wenn `serverEnv.platformCookieDomain` gesetzt.

**`src/lib/platform/password.ts`**: Argon2id, `memoryCost:19456`, `timeCost:2`. 12-Zeichen Minimum.

**Prisma Models**:

- `PlatformUser` (`prisma/schema.prisma:1244–1261`): `id`, `email` (unique), `passwordHash`, `displayName`, `isActive`, `mfaSecret?`, `mfaEnrolledAt?`, `recoveryCodes?`, `lastLoginAt?`, `lastLoginIp?`, `createdAt`, `createdBy?` (self-FK). Relation `supportSessions SupportSession[]`. Mapped `platform_users`.
- `SupportSession` (`prisma/schema.prisma:1263–1282`): `tenantId` (FK cascade), `platformUserId?` (SetNull), `requestedByUserId` (uuid, kein Prisma-Relation), `reason`, `consentReference?`, `status` (pending/active/expired/revoked), `expiresAt`, `activatedAt?`, `revokedAt?`. Indexe auf `(tenantId,status)`, `(platformUserId,status)`, `(status,expiresAt)`.
- `PlatformAuditLog` (`prisma/schema.prisma:1285–1302`): `platformUserId?` (uuid, **kein Prisma-Relation** zu PlatformUser), `action`, `entityType?`, `entityId?`, `targetTenantId?`, `supportSessionId?`, `changes?` (jsonb), `metadata?` (jsonb), `ipAddress?`, `userAgent?`, `performedAt`. SQL-level FKs existieren in der Migration, sind aber nicht als Prisma-Relations deklariert.

**Migrationen**:
- `supabase/migrations/20260421000000_create_platform_admin_tables.sql` — `platform_users`, `support_sessions`, `platform_audit_logs`, `platform_login_attempts`.
- `supabase/migrations/20260421100000_add_platform_support_access_permission.sql` — `support_access_grant` Permission.
- `supabase/migrations/20260421200000_create_platform_system_user.sql` — widert `users.role` CHECK um `'system'`, inserted `00000000-0000-0000-0000-00000000beef`.
- `supabase/migrations/20260421300001_add_tenant_module_platform_fields.sql` — `enabledByPlatformUserId` auf `tenant_modules`.
- `supabase/migrations/20260422000000_create_platform_subscriptions.sql` — `platform_subscriptions` Tabelle.

**Seeding**: Kein Seed-Script oder Migration für `platform_users`. Einziges Mechanismus: `scripts/bootstrap-platform-user.ts` — CLI liest `.env`/`.env.local`, prompted interaktiv für Password, ruft `prisma.platformUser.create` (Zeile 178), schreibt `platformAudit.log` mit `platformUserId:null`.

#### B.3 Platform UI `/platform/*`

**File-Tree `src/app/platform/`**:

- `layout.tsx` — Root: Inter Font, `ThemeProvider`, `PlatformTRPCProvider`, `Toaster`. Kein `NextIntl`, kein `AuthProvider`, kein Tenant-TRPC.
- `page.tsx` — Server Component: liest `platform-session` Cookie, verifiziert JWT, redirected `/platform/dashboard` oder `/platform/login`.
- `login/page.tsx` — Client, 4-State-Machine (password → mfa_enrollment → mfa_enrollment_codes → mfa_verify).
- `(authed)/layout.tsx` — Client. Mountet `PlatformSidebar` + `SidebarInset`. Ruft `auth.me`. Ruft `usePlatformIdleTimeout()`. Top-bar: Avatar mit Initialen, Display-Name, Email, "Profil & MFA" Link, "Abmelden" Mutation (`auth.logout`).
- `(authed)/dashboard/page.tsx` — 3 Stat-Cards (pending Sessions, active Sessions, Audit-Total) + 2-Column Panel (Open Requests, Recent Audit).
- `(authed)/tenants/page.tsx` — Paginated Tenant-List mit Search + Status-Filter, Row-Actions DropdownMenu.
- `(authed)/tenants/new/page.tsx` — Create-Tenant-Form, 3 Cards, Auto-Slugify, InviteLink-Fallback-Dialog.
- `(authed)/tenants/[id]/page.tsx` — Tenant-Detail, 3 Tabs (Übersicht, Einstellungen, Audit-Log).
- `(authed)/tenants/[id]/modules/page.tsx` — Modul-Management, Enable/Disable Dialogs.
- `(authed)/support-sessions/page.tsx` — 3 Tabs (Offen, Aktiv, Abgelaufen/Widerrufen).
- `(authed)/audit-logs/page.tsx` — Paginated Audit mit Action- und Tenant-UUID-Filter, Detail-Sheet.
- `(authed)/platform-users/page.tsx` — Operator-List mit inline Switch, Create-Dialog, MFA-Reset, Delete.
- `(authed)/profile/mfa/page.tsx` — MFA-Status Ansicht.

**Sidebar** `src/components/platform/sidebar.tsx` (einzige Datei in `src/components/platform/`):

`NAV`-Array (`sidebar.tsx:47–62`):

| href | label | icon |
|---|---|---|
| `/platform/dashboard` | Dashboard | LayoutDashboard |
| `/platform/tenants` | Tenants | Building2 |
| `/platform/support-sessions` | Support-Sessions | LifeBuoy |
| `/platform/audit-logs` | Audit-Log | ScrollText |
| `/platform/platform-users` | Platform-Users | UsersRound |
| `/platform/profile/mfa` | Profil | UserCog |

Tenants-Entry hat einen `SidebarMenuSub` (Zeile 111–125) mit einem Sub-Item `/platform/tenants/new` (Label "Neuer Tenant", Icon Plus).

**Wichtig**: Es gibt keine weiteren geteilten Komponenten unter `src/components/platform/` — alle Dialoge, Tabellen und Forms sind inline in den Page-Files.

#### B.4 Tenant-Create in der Platform (existierender Andockpunkt)

**Router**: `src/trpc/platform/routers/tenantManagement.ts:135–242` `create`-Mutation.

Input-Fields: `name`, `slug` (lowercase, regex `/^[a-z0-9-]+$/`), `contactEmail`, `initialAdminEmail`, `initialAdminDisplayName`, `addressStreet`, `addressZip`, `addressCity`, `addressCountry`.

Ablauf:
1. `prisma.$transaction` (60s Timeout).
2. Inside: Slug-Eindeutigkeit prüfen → CONFLICT falls existent.
3. `tx.tenant.create({data: { name, slug, email, addressStreet, addressZip, addressCity, addressCountry, isActive:true }})`.
4. `createUserService(tx, tenant.id, {email, displayName, isActive:true, isLocked:false}, {userId: PLATFORM_SYSTEM_USER_ID, ipAddress, userAgent})` — note: der `userId` für die **tenant-seitige** Audit-Attribuierung ist der Sentinel `00000000-0000-0000-0000-00000000beef`.
5. Nach Transaction-Commit: `platformAudit.log({platformUserId: ctx.platformUser.id, action:"tenant.created", entityType:"tenant", entityId: result.tenant.id, targetTenantId: result.tenant.id, metadata:{slug, initialAdminEmail, welcomeEmailSent}})` (Zeile 212).
6. Return: `{tenant, inviteLink: welcomeEmail.fallbackLink, welcomeEmailSent}`.

Ein `createdAuthUserId`-Tracking + Compensation gibt es als defensives Pattern (Zeile 159, 232–241), aber `users-service.create` macht bereits seinen eigenen Auth-Rollback intern — deshalb ist das Pattern als `void` markiert.

**UI-Call-Site**: `src/app/platform/(authed)/tenants/new/page.tsx` — einzelne selbst-enthaltene Page-Komponente (keine Extraktion in `src/components/platform/**`, da dort nur `sidebar.tsx` lebt). Drei Cards: Tenant (Firmenname/Slug/Kontakt-Email, Slug wird automatisch aus Name slugifiziert und ist editierbar), Adresse, Initialer Administrator. Mutation: `trpc.tenantManagement.create.mutationOptions()` (Zeile 73). On success (Zeile 75–88): Falls `data.inviteLink` present, öffnet Dialog mit readonly-Input + Copy-Button, danach Navigate zu Detail-Page. Andernfalls `toast.success` + Redirect.

Kein Hook unter `src/hooks/platform/**` — dieses Verzeichnis existiert nicht. Mutation wird inline via `useMutation` gerufen.

#### B.5 Platform Audit Service (`src/lib/platform/audit-service.ts`)

`log(prisma: Tx, data: PlatformAuditLogInput)` (Zeile 82–108):

```ts
data: {
  platformUserId,        // nullable — cron/bootstrap nutzen null
  action,
  entityType, entityId,
  targetTenantId, supportSessionId,
  changes, metadata,     // jsonb
  ipAddress, userAgent
}
```

Writing: `prisma.platformAuditLog.create({data})`. **Wirft nie** — catch + `console.error`. `list(prisma, params?)` (Zeile 112–131) paginiert (default 1/20), Filter auf `platformUserId`, `targetTenantId`, `action`, `fromDate`/`toDate`. `getById` (Zeile 133–138) throwt `PlatformAuditLogNotFoundError`.

**Vollständiger Call-Site-Katalog** (`grep platformAudit.log` über den ganzen Workspace):

| File | Line | action |
|---|---|---|
| `src/trpc/platform/routers/auth.ts` | 153 | `"logout"` |
| `src/lib/platform/login-service.ts` | 177 | `"login.success"` |
| `src/lib/platform/login-service.ts` | 300 | `"mfa.enrolled"` |
| `src/trpc/platform/routers/supportSessions.ts` | 150 | `"support_session.activated"` |
| `src/trpc/platform/routers/supportSessions.ts` | 200 | `"support_session.revoked"` |
| `src/trpc/platform/routers/platformUsers.ts` | 98 | `"platform_user.created"` |
| `src/trpc/platform/routers/platformUsers.ts` | 124 | `"platform_user.password_changed"` |
| `src/trpc/platform/routers/platformUsers.ts` | 147 | `"platform_user.mfa_reset"` |
| `src/trpc/platform/routers/platformUsers.ts` | 175 | `"platform_user.activated"` / `"platform_user.deactivated"` |
| `src/trpc/platform/routers/platformUsers.ts` | 199 | `"platform_user.deleted"` |
| `src/trpc/platform/routers/tenantManagement.ts` | 212 | `"tenant.created"` |
| `src/trpc/platform/routers/tenantManagement.ts` | 281 | `"tenant.updated"` |
| `src/trpc/platform/routers/tenantManagement.ts` | 315 | `"tenant.deactivated"` |
| `src/trpc/platform/routers/tenantManagement.ts` | 344 | `"tenant.reactivated"` |
| `src/trpc/platform/routers/tenantManagement.ts` | 380 | `"tenant.soft_deleted"` |
| `src/trpc/platform/routers/tenantManagement.ts` | 581 | `"module.enabled"` |
| `src/trpc/platform/routers/tenantManagement.ts` | 664 | `"module.disabled"` |
| `src/trpc/routers/tenants.ts` | 654 | `"support_session.requested"` (platformUserId: null) |
| `src/trpc/routers/tenants.ts` | 726 | `"support_session.revoked"` (revokedByTenantUserId in metadata) |
| `src/app/api/cron/platform-cleanup/route.ts` | 61 | `"support_session.expired"` |
| `src/lib/platform/subscription-autofinalize-service.ts` | 179 | `"subscription.invoice_auto_finalized"` (platformUserId: null) |
| `scripts/bootstrap-platform-user.ts` | 148 | `"platform_user.mfa_reset"` (platformUserId: null) |
| `scripts/bootstrap-platform-user.ts` | 181 | `"platform_user.created"` (platformUserId: null) |

**Dual-Write-Helper-Status**: Es existiert **kein** standalone Dual-Write-Helper, der gleichzeitig `platform_audit_logs` + `audit_logs` schreibt. Die einzige Dual-Write ist implizit in `src/lib/services/audit-logs-service.ts:177–213`: wenn `getImpersonation()` (aus `src/lib/platform/impersonation-context.ts`, via `AsyncLocalStorage`) einen aktiven Impersonation-Context liefert, schreibt `log()` zusätzlich eine `platform_audit_logs`-Row mit Prefix `impersonation.${action}` und `platformUserId` + `supportSessionId` aus dem Context. `logBulk()` macht dasselbe (Zeile 227–260).

Für rein platform-initiierte Writes (z. B. alle `tenantManagement.*` Procedures) ist das heutige Pattern: **schreibe nur `platform_audit_logs`**, kein Tenant-seitiges `audit_logs`.

#### B.6 `PLATFORM_SYSTEM_USER_ID` Sentinel

Definition: `src/trpc/init.ts:33–34` `export const PLATFORM_SYSTEM_USER_ID = "00000000-0000-0000-0000-00000000beef"`.

Nutzungen in `src/`:

| File | Line | Zweck |
|---|---|---|
| `src/trpc/init.ts` | 185 | Context-Builder lädt diese Row aus `users` beim Build des Impersonation-Context, sodass `ctx.user` non-null während Platform-Support-Sessions. |
| `src/trpc/platform/routers/tenantManagement.ts` | 200 | Als `userId` an `createUserService()` übergeben, damit tenant-seitige `AuditLog` Rows den New-User-Create dem System-Sentinel zuordnen. |
| `src/lib/platform/subscription-service.ts` | 152, 332 | Als `userId` an Terp-Billing-Service-Calls übergeben (CrmAddress-Create, Invoice-Create). |
| `src/lib/platform/subscription-autofinalize-service.ts` | 158 | Als Acting-User für `billingDocumentService.finalize()`. |

Zweck: Wenn platform-originated Code in existierende Terp-Services callt, die einen tenant-scoped `userId` brauchen (`AuditLog.userId`, `BillingDocument.createdById`, …), dient der Sentinel als synthetischer User in diesen Writes. Der echte Actor wird parallel in `platform_audit_logs` durch Router/Service gelogged.

Migration: `supabase/migrations/20260421200000_create_platform_system_user.sql` — widert `users.role` CHECK um `'system'`, inserted Row mit `email='platform-system@internal.terp'`, `username='platform-system'`, `display_name='Platform System'`, `role='system'`, `is_active=false`, `is_locked=true`, `tenant_id=NULL`.

**Kein korrespondierender `PlatformUser`-Row**: Der Sentinel existiert nur in `public.users`, nicht in `platform_users`. Platform-Side-Audit-Writes aus Crons/Bootstrap verwenden stattdessen `platformUserId: null`.

#### B.7 Tenant-List/Detail UI-Konventionen im Platform-UI

**List `/platform/(authed)/tenants/page.tsx`**:
- Fetch: `trpc.tenantManagement.list.queryOptions({search, status, page, pageSize:20})`. Server: `findMany + count` in `Promise.all`.
- Pagination: simpler prev/next-Button-Pair, nur bei `total > pageSize`. State-Reset auf 1 bei Search/Filter-Change.
- Search: Controlled `<Input>`, trimmed als `search` an Procedure.
- Sort: fix serverseitig `orderBy:{createdAt:"desc"}`.
- UI: `Card` + `CardHeader/Content`, `Input`, `Select` (all/active/inactive), `Table/TableHeader/TableRow/TableCell`, `Badge` (Aktiv/Inaktiv/**Demo**), `DropdownMenu`, `Dialog` (für Deactivate/Soft-Delete Reason), `Textarea`, `Button`, `Skeleton`.
- Per-Row-Actions: Details → `/platform/tenants/${id}`, Module verwalten → `/platform/tenants/${id}/modules`, Deaktivieren (Reason-Dialog), Reaktivieren (immediate), Löschen Soft (Reason-Dialog). Plus ghost-button "Support-Email-Template kopieren".
- **Die Tabelle zeigt bereits ein `Demo`-Badge** wenn `t.isDemo` (Zeile 269), aber kein Filter / separater Tab für Demo-Tenants.

**Detail `/platform/(authed)/tenants/[id]/page.tsx`**:
- Zwei parallele Queries beim Mount: `tenantManagement.getById({id})` und `auditLogs.list({targetTenantId:id, page:1, pageSize:50})`.
- Drei Tabs (shadcn `Tabs`): Übersicht (Stammdaten + Kennzahlen: users/modules/active sessions), Einstellungen (inline Form mit name+contactEmail → `update`-Mutation), Audit-Log (Table der 50 jüngsten Entries mit Zeitpunkt/Aktion/Operator/Metadaten).
- "Module verwalten" Button im Page-Header → `/modules` Sub-Page.

**Modules `/platform/(authed)/tenants/[id]/modules/page.tsx`**:
- Drei Queries: `getById`, `listModules`, `listSubscriptions`.
- Table zeigt alle `AVAILABLE_MODULES` (inkl. disabled) mit Spalten: Modul (label+key), Status, Aktiviert am, Notiz (operatorNote), Operator (kind="tenant"|"platform" + displayName), Abo (billingCycle, unitPrice, nextDueDate, lastInvoiceNumber, overdue badge).
- Enable-Dialog: `operatorNote` (Input) + `billingCycle` (Select). Submit → `enableModule`.
- Disable-Dialog: `disableReason` (Textarea). Submit → `disableModule`. Core-Modul client-side disabled.
- Nach Mutation: invalidate `listModules`, `listSubscriptions`, `getById`.

### C. Subscription-Bridge

#### C.1 `createSubscription` / `cancelSubscription`

**`src/lib/platform/subscription-service.ts`**:

- `requireOperatorTenantId()` (Zeile 62) — liest `serverEnv.platformOperatorTenantId`, wirft `PlatformSubscriptionConfigError` bei leerem String.
- `isSubscriptionBillingEnabled()` (Zeile 69) — `serverEnv.platformOperatorTenantId !== ""`.
- `isOperatorTenant(tenantId)` (Zeile 89) — constant-time Equality.
- `findOrCreateOperatorCrmAddress(prisma, customerTenantId)` (Zeile 105) — intern, ruft `crmAddressService.create` mit `PLATFORM_SYSTEM_USER_ID` als Audit-User.
- `platformSubscriptionMarker(subId)` (Zeile 186) — `"[platform_subscription:${subId}]"`.
- `appendMarker` (Zeile 218), `removeMarker` (Zeile 232).
- `createSubscription(prisma, input, platformUserId)` (Zeile 262) — siehe unten.
- `cancelSubscription(prisma, input, platformUserId)` (Zeile 405) — `$transaction`, Lädt Row, wirft `PlatformSubscriptionNotFoundError` oder `CONFLICT` bei non-active, Path A / Path B je nach Sibling-Count, setzt `status="cancelled"`, `endDate`, `cancelledAt`, `cancelledByPlatformUserId`, `cancellationReason`. Keine Audit-Writes — der Caller ist verantwortlich.
- `listForCustomer(prisma, customerTenantId)` (Zeile 542) — Alle Subscriptions des Customers + optionale Joins auf `billingRecurringInvoice` und `billingDocument` (beide im Operator-Tenant-Scope).
- `sweepEndedSubscriptions(prisma)` (Zeile 634) — Autofinalize-Cron Post-Step, setzt `cancelled → ended` wenn `billingRecurringInvoice.isActive=false`.

**Error-Klassen** (Zeilen 29, 36, 48):
- `PlatformSubscriptionConfigError` — env unset
- `PlatformSubscriptionNotFoundError` — subscription row not found in cancel
- `PlatformSubscriptionSelfBillError` — defense-in-depth gegen `customerTenantId === operatorTenantId`

**`createSubscription` Ablauf im Detail** (akzeptiert `PrismaClient`, nicht `Tx`, weil es eine eigene `$transaction` öffnet):

1. **House-Check** (Zeile 272–274): Wenn `customerTenantId === operatorTenantId`, sofort `PlatformSubscriptionSelfBillError` (bevor tx geöffnet wird).
2. **`prisma.$transaction`** (Zeile 281) — innen:
3. **CrmAddress** (Zeile 282–285): `findOrCreateOperatorCrmAddress(tx, customerTenantId)`. Entweder Reuse eines existierenden `operatorCrmAddressId` aus einer bestehenden `platformSubscription` des Customers, oder Create einer neuen `CrmAddress` **im Operator-Tenant** via `crmAddressService.create(...)` (Zeile 140–155) — mit `PLATFORM_SYSTEM_USER_ID` als Audit-User.
4. **Insert `platform_subscription`** (Zeile 287–300) mit `billingRecurringInvoiceId=null`: Felder `tenantId`, `module`, `status="active"`, `billingCycle`, `unitPrice` (aus `getModulePrice`), `currency="EUR"`, `startDate`, `operatorCrmAddressId`, `createdByPlatformUserId`.
5. **Find existing `BillingRecurringInvoice`** (Zeile 302–311): scoped auf `{tenantId:operatorTenantId, addressId:operatorCrmAddressId, interval, isActive:true}`, orderBy createdAt desc.
6. **Path 4a — kein existierendes Recurring** (Zeile 318–334): `billingRecurringService.create(tx as PrismaClient, operatorTenantId, {..., internalNotes: platformSubscriptionMarker(sub.id), autoGenerate:true, paymentTermDays:14})`. **Einziger immediate Write in die Billing-Schicht**. Kein `BillingDocument` wird hier erzeugt — die erste Rechnung entsteht vom Daily-Cron 04:00 UTC wenn `nextDueDate` erreicht.
7. **Path 4b — existierendes Recurring** (Zeile 336–353): `billingRecurringService.update(tx as PrismaClient, operatorTenantId, {id, positionTemplate: updatedPositions, internalNotes: updatedNotes})` — appended neue Position + Marker.
8. **Update `platform_subscription.billingRecurringInvoiceId`** (Zeile 355–358).

Keine Audit-Writes innerhalb `createSubscription`. Der Module-Price-Catalog (`src/lib/platform/module-pricing.ts:51`) ist ein `Record<ModuleId, {monthly, annual, vatRate, description}>` mit Entries für `core` (8/80), `crm` (4/40), `billing` (4/40), `warehouse` (4/40), `inbound_invoices` (3/30), alle `vatRate:19`.

#### C.2 `enableModule` Call-Site in `tenantManagement.ts`

`tenantManagement.ts` Ablauf der `enableModule` Mutation:
1. Tenant-Existence-Check (Zeile 517–523).
2. `tenantModule.upsert` (Zeile 525–546).
3. `isHouseTenant = subscriptionService.isOperatorTenant(input.tenantId)` (Zeile 558).
4. Guard `if (isSubscriptionBillingEnabled() && !isHouseTenant)` (Zeile 559).
5. Inner-Check: already-active Subscription auf `(tenantId, module)` (Zeile 560–567).
6. **Call**: `subscriptionService.createSubscription(ctx.prisma, {customerTenantId, module, billingCycle}, ctx.platformUser.id)` an **Zeile 569**.
7. `platformAudit.log({action:"module.enabled", ..., subscriptionId, billingRecurringInvoiceId})` an Zeile 581–597.

Reihenfolge: `tenantModule.upsert` → `createSubscription` (eigene interne `$transaction`) → `platformAudit.log`.

#### C.3 Autofinalize-Cron

**Route** `src/app/api/cron/platform-subscription-autofinalize/route.ts`: GET-Handler, `Authorization: Bearer ${CRON_SECRET}`, callt `autofinalize.autofinalizePending(prisma, now)`. Schedule 04:15 UTC (15 Min nach dem `recurring-invoices` Cron).

**Service** `src/lib/platform/subscription-autofinalize-service.ts`: `autofinalizePending(prisma, now)` (Zeile 46). Fetched alle `active` Subscriptions mit non-null `billingRecurringInvoiceId`. Pro Sub: prüft ob `BillingRecurringInvoice.lastGeneratedAt >= today 00:00 UTC` → falls ja, querd `billingDocument.findFirst({tenantId:operatorTenantId, type:"INVOICE", internalNotes:{contains:marker}})`. Für DRAFT-Dokumente: `billingDocService.finalize(prisma, operatorTenantId, docByMarker.id, PLATFORM_SYSTEM_USER_ID)`. Update `platformSubscription.lastGeneratedInvoiceId`. Schreibt `platformAudit.log({action:"subscription.invoice_auto_finalized", platformUserId:null})`. Post-Step: `sweepEndedSubscriptions`.

#### C.4 Callable Entry-Point (ohne `enableModule`)

`createSubscription` selbst ist der Entry-Point. Signatur:

```ts
createSubscription(
  prisma: PrismaClient,           // NICHT Tx
  input: { customerTenantId, module, billingCycle, startDate? },
  platformUserId: string
): Promise<CreateSubscriptionResult>
```

**Wichtig**: Akzeptiert `PrismaClient`, nicht `Tx`, weil es intern sein eigenes `$transaction` öffnet. **Kann nicht innerhalb einer bereits offenen Transaction aufgerufen werden** — Prisma unterstützt keine nested Interactive-Transactions.

Keine tRPC-Auth-Sentinel-Anforderung (nimmt `platformUserId: string` direkt). Callable aus jedem Service-Layer-Code mit Prisma-Singleton + bekannter `platformUserId`. Der Caller ist verantwortlich für das `platformAudit.log` danach (siehe Zeile 11–16 im File-Header-Kommentar).

### D. Inbox / Queue / Pending-Request Patterns

#### D.1 Support-Sessions-Queue (die einzige existierende Action-Queue im Platform-UI)

**`src/app/platform/(authed)/support-sessions/page.tsx`** — Tabbed-List mit 3 Tabs (Offen/Aktiv/Abgelaufen+Widerrufen). Default-Tab: Offen.

tRPC-Queries: vier conditional `enabled`-Queries (Zeile 80/84/87/91):
- `supportSessions.list({status:"pending"})`
- `supportSessions.list({status:"active"})`
- `supportSessions.list({status:"revoked"})`
- `supportSessions.list({status:"expired"})`

Row-Actions:
- Pending: "Beitreten" (Zeile 174) → `supportSessions.activate`-Mutation, dann Invalidate.
- Active: "Tenant öffnen" (Zeile 183) → setzt `platformImpersonationStorage` + `tenantIdStorage`, hard-navigation zu `/de/dashboard`. Plus "Widerrufen" (Zeile 208) → `supportSessions.revoke`.
- Closed Rows: keine Actions.

Persistiert auf `SupportSession`-Tabelle. Polling via React-Query-Defaults (kein WebSocket, kein SSE).

**Dashboard-Surface**: `src/app/platform/(authed)/dashboard/page.tsx:47–51, 77–82` — zeigt Pending-Sessions als Summary-Card; Zeile 159–176 zeigt eine Short-List von bis zu 5 Pending-Sessions. Beides aus derselben Query.

#### D.2 Audit-Log (nicht Queue, read-only)

`src/app/platform/(authed)/audit-logs/page.tsx` — paginierte filterable Lese-Ansicht auf `platform_audit_logs`, Detail-Sheet mit JSON-Diff. Keine Action-Buttons, kein Approve/Reject.

#### D.3 Keine incoming-request-Queue existiert

- Kein Page in `src/app/platform/**` listet incoming Emails, Form-Submissions, Support-Tickets oder Demo-Convert-Requests von Tenants.
- `src/app/platform/(authed)/dashboard/page.tsx:11–13` enthält einen expliziten Comment: *"The demo-convert-request card referenced in the Phase 5 plan is deferred until `demoTenants.requestConvertFromExpired` has a corresponding platform-side materialization."*

#### D.4 `email_send_log`

`src/lib/services/email-send-log-repository.ts` — `create()` Signature (Zeilen 3–38):

```ts
create(prisma, tenantId, {
  documentId?, documentType?, toEmail, ccEmails?,
  subject, bodyHtml, templateId?, status?, sentBy?, nextRetryAt?
})
```

Writes eine Row via `prisma.emailSendLog.create`. `status` default `"pending"`. Die Tabelle wird vom Email-Retry-Cron durch `findRetryable` (Zeile 65) durchlaufen.

**Kein Platform-Side-Consumer**: Grep nach `emailSendLog` / `email_send_log` in `src/app/platform/**` und `src/trpc/platform/**` liefert **null Treffer**. Die Tabelle wird vom Platform-UI nicht gelesen.

#### D.5 `notifyConvertRequest` heute

`src/lib/services/demo-tenant-service.ts:525–551`. Privat, nicht exportiert. Aufgerufen in:
- `convertDemo` Zeile 361 (nach Transaction-Commit + Audit)
- `requestConvertFromExpired` Zeile 484 (vor Audit)

Macht **exakt eine Sache**: `emailSendLogRepo.create(prisma, tenant.id, {toEmail, subject, bodyHtml, status:"pending"})` an Zeile 545 — scoped auf die **Demo-Tenant-ID** (nicht Operator). Recipient aus `process.env.DEMO_CONVERT_NOTIFICATION_EMAIL ?? "sales@terp.dev"`. Kein `platform_audit_logs`-Write, kein `platform_subscriptions`-Write, keine Supabase-Call, kein Webhook.

## Ziel-Architektur-Bausteine, die schon existieren

Diese Komponenten sind heute schon vorhanden und können als Fundamente für die Migration dienen — wohlgemerkt als Fakten, nicht als Vorschriften:

1. **Platform-tRPC-Stack vollständig** — `src/trpc/platform/{init,_app,context,client}.tsx`, `platformAuthedProcedure` (MFA-validated), `platformImpersonationProcedure` (Session-validated). Route-Adapter `/api/trpc-platform/[trpc]` mit sauberer Set-Cookie-Propagation.
2. **Platform-Auth-Stack** — JWT (`jwt.ts`), Cookie (`cookie.ts`), Password-Hashing (`password.ts`), Bootstrap-Script (`scripts/bootstrap-platform-user.ts`).
3. **Tenant-Create-Pfad in der Platform** — `platformTenantManagementRouter.create` schreibt `tenant + admin user + platform_audit_log` in einer Transaction. UI dazu: `src/app/platform/(authed)/tenants/new/page.tsx`. Schon mit `inviteLink`-Fallback ausgestattet.
4. **Platform-Audit-Service** — `src/lib/platform/audit-service.ts` mit `log(prisma, data)` (nie throwt) und 23 bekannten Action-Strings im Katalog (siehe B.5).
5. **`PLATFORM_SYSTEM_USER_ID` Sentinel** — `00000000-0000-0000-0000-00000000beef` existiert in `public.users`, wird von `tenantManagement.create`, `subscription-service` und `subscription-autofinalize-service` genutzt, um tenant-seitige Audit-Rows (die einen non-null `userId` brauchen) zu attribuieren.
6. **Subscription-Bridge-Entry-Point** — `subscription-service.createSubscription(prisma, input, platformUserId)`: House-Check integriert, eigene Transaction, keine tRPC-Abhängigkeit, kein Tx-Kontext nötig. `isOperatorTenant`, `isSubscriptionBillingEnabled` als Guard-Helpers.
7. **Module-Pricing-Catalog** — `src/lib/platform/module-pricing.ts` + `AVAILABLE_MODULES` aus `src/lib/modules/constants`.
8. **Platform-UI-Konventionen** — Card + Table + DropdownMenu + Dialog + Tabs. List-Page-Pattern (Search, Status-Filter, Pagination, Row-Action-Menu). Detail-Page-Pattern (Tabs: Übersicht/Einstellungen/Audit-Log). Alle Komponenten in der Page-Datei inline, keine separate Component-Layer unter `src/components/platform/**` außer `sidebar.tsx`.
9. **Support-Sessions als Queue-Vorbild** — Tabbed-List mit `enabled`-Queries pro Status, Action-Buttons pro Row, React-Query-Invalidation nach Mutation. Dashboard-Surface mit Summary-Card + Short-List.
10. **Platform-Audit-Sidebar-Navigation** — Sidebar in `src/components/platform/sidebar.tsx:47–62` mit Sub-Menu-Pattern (Tenants → Neuer Tenant). Drop-in-fähig für weitere Sub-Items.
11. **Impliziter Dual-Write via Impersonation-Context** — `src/lib/services/audit-logs-service.ts:177–213` schreibt automatisch in `platform_audit_logs` wenn `getImpersonation()` non-null. Nur aktiv innerhalb einer aktiven Support-Session, nicht für direkte Operator-Aktionen.

## Offene Fragen & Risiken

### 1. FK-Migration `demo_created_by` → `users.id`

**Fakt**: Es gibt heute **einen** FK `demo_created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL` (eine einzige Migration: `20260420100000_add_tenant_demo_fields.sql:8`). Die Prisma `@relation` auf `prisma/schema.prisma:121` spiegelt das wider (`DemoTenantCreatedBy`, back-ref auf `User.demoTenantsCreated` an Zeile 64).

**Konsequenzen**: Wenn `tenants.manage` nicht mehr der Gate ist, entsteht die Frage wie `demoCreatedById` künftig gefüllt wird. Heute wird `ctx.user!.id` aus dem Tenant-Supabase-Kontext geschrieben. Platform-Procedures haben diesen Wert nicht — sie hätten `ctx.platformUser.id` (FK-Target `platform_users.id`), nicht `users.id`.

**Optionen (neutral aufgezählt, keine Empfehlung)**:
- (a) Spalte null setzen und Creator-Info nur in `platform_audit_logs.metadata` halten. `demoCreatedById` bliebe nullable mit `ON DELETE SET NULL`, kein Schema-Change — aber `demoCreatedBy`-Join in `findActiveDemos` (`demo-tenant-repository.ts:55–59`) würde immer null liefern, die UI-Spalte "Creator" in `demo-tenants-table.tsx` müsste anders gefüttert werden.
- (b) Neue Spalte `demoCreatedByPlatformUserId` parallel dazu, ohne Löschen der alten. Zweiter Pfad im Lookup: erst Platform-User, sonst Tenant-User. Mirrort das Pattern von `tenant_modules.enabled_by_platform_user_id` (siehe Migration `20260421300001`).
- (c) Existing Column umwidmen: `ON DELETE SET NULL` beibehalten, aber neu als `REFERENCES platform_users(id)` mit passender Daten-Migration. Risikoreich wenn bereits Rows mit `users.id` existieren (siehe Punkt 3).
- (d) Sentinel-User-Ansatz: `demoCreatedById = PLATFORM_SYSTEM_USER_ID` für platform-initiierte Creates, echter Actor nur in `platform_audit_logs`. Mirrort das existierende Pattern aus `tenantManagement.create` (`tenantManagement.ts:200`).

### 2. Tests, die `tenants.manage` als Demo-Gate voraussetzen

**Fakt**: **Null** Tests assertieren einen FORBIDDEN/403 Response wenn der Caller `tenants.manage` **nicht** hat und eine Demo-Procedure trifft. Der Gate in `demo-tenants.ts:17–177` existiert, wird aber von keinem Test angefasst.

Die existierenden Tests sind:
- `src/lib/services/__tests__/demo-tenant-service.test.ts` — Unit-Tests mit `makeFakePrisma()`, testet nur die Service-Layer-Logik (Validation, Not-Found, Forbidden auf der Service-Seite). Kein `TENANTS_MANAGE`, keine `createCaller`-Aufrufe, keine Permission-Assertions.
- `src/lib/services/__tests__/demo-tenant-service.integration.test.ts` — Integration-Tests gegen echte DB. Hardcoded `SEED_ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001"` als `creatingUserId` direkt an den Service. Bypasses tRPC vollständig.
- `src/app/api/cron/expire-demo-tenants/__tests__/integration.test.ts` — testet Cron-Flow.
- E2E unter `src/e2e-browser/**` — grep `isDemo|demoTenants|demo-expired`: **null Matches**.

**Konsequenz**: Ein Permission-Wechsel (z. B. Umstellung auf `platformAuthedProcedure` statt `tenants.manage`) würde heute keinen bestehenden Test brechen.

### 3. Bestehende Demo-Rows in Dev/Staging/Prod

**Fakt**:
- `supabase/seed.sql` — grep nach `is_demo|demo_template|demo_created_by|demo_expires_at`: **null Matches**.
- `prisma/seed*.ts` — existiert nicht.
- `scripts/**` — grep: null Matches. Weder `seed-staging.ts` noch `reset-staging.ts` legen Demo-Tenants an.
- `demo-tenant-service.integration.test.ts` — erzeugt Demo-Tenants inline via `createDemo` und cleanup in afterAll. Creator-ID ist `SEED_ADMIN_USER_ID="00000000-0000-0000-0000-000000000001"` (Zeile 37).
- `expire-demo-tenants/__tests__/integration.test.ts` — erzeugt 3 Tenants inline (Zeilen 64–101), beide Demo-Tenants **ohne** `demoCreatedById` (Field absent → `NULL`).

**Konsequenz**: Keine Seed- oder Fixture-Demo-Rows existieren in Dev oder Prod. Der einzige `demo_created_by_id`-Wert, der bei Test-Läufen referenziert wird, ist `"00000000-0000-0000-0000-000000000001"` aus dem Seed-Admin-User — der existiert im Dev-Seed als echte `users`-Row. Das Risiko bestehender Zeilen ist auf Integration-Test-Fixtures beschränkt.

Für Prod/Staging ist offen: gibt es dort echte erzeugte Demos? Kein Check im Repository kann das beantworten — das muss vor der Migration per DB-Query bestätigt werden (`SELECT COUNT(*) FROM tenants WHERE is_demo = true`).

### 4. Kann der Cron unverändert bleiben?

**Fakt**: Der Cron-Handler (`src/app/api/cron/expire-demo-tenants/route.ts`):
- Liest keine Tenant-Scoped-Middleware, keine `x-tenant-id`, kein tRPC-Kontext.
- Validiert nur `Authorization: Bearer ${CRON_SECRET}`.
- Schreibt `audit_logs` mit `userId=null` (Zeile 63–75). Die `log()`-Funktion akzeptiert `userId: null`.
- Benutzt `cronCheckpoint` für Idempotenz mit `cronName="expire_demo_tenants"`.
- Registriert in `vercel.json:43–46` als `"schedule": "0 1 * * *"`.

**Offene Frage**: Soll die Audit-Quelle auf `platform_audit_logs` wechseln (wenn Demo-Verwaltung in die Platform-Welt zieht), oder bleibt sie auf `audit_logs` (da die Audit-Zeile im Tenant-Kontext sinnvoll bleibt: "dieser Tenant wurde expired")? Technisch kann der Handler sowohl dies als auch das (der Helper `platformAudit.log` erlaubt `platformUserId: null` — siehe Catalog in B.5, z. B. `subscription-autofinalize-service.ts:179`).

### 5. Audit-Dual-Write-Frage

**Fakt**: Es existiert heute **kein** Helper der sowohl `audit_logs` als auch `platform_audit_logs` in einem Call schreibt. Der einzige implizite Dual-Write passiert in `audit-logs-service.log()` (Zeile 177–213) nur bei aktiver Impersonation via `AsyncLocalStorage`. Für direkte Operator-Aktionen (`tenantManagement.*`) ist das heutige Muster "nur `platform_audit_logs` schreiben".

**Offene Frage**: Soll ein zu migrierender Demo-Create sowohl `platform_audit_logs` (neues Pattern) als auch `audit_logs` (altes Pattern für Demo-Events wie `demo_create`) schreiben? Heutige Demo-Service-Writes gehen nur an `audit_logs` (siehe A.5 Tabelle). Ein Wechsel auf Platform-only würde den Audit-Verlauf eines Demos in `audit_logs` brechen — ab Migration gäbe es keine Demo-Events mehr in der Tenant-Audit-Tabelle.

Mögliche Muster (neutral):
- (a) Nur `platform_audit_logs` schreiben (konsistent mit `tenantManagement.*`).
- (b) Dual-Write explizit in jeder Procedure (copy-paste Pattern).
- (c) Neuer Shared-Helper `dualWriteAudit(prisma, {platform:..., tenant:...})`.
- (d) Sentinel-User-Ansatz: `audit_logs.userId = PLATFORM_SYSTEM_USER_ID` + parallel `platform_audit_logs` mit echtem Operator. Mirrort den bestehenden Ansatz in `tenantManagement.create`.

### 6. Subscription-Bridge beim Convert

**Fakt**: Der heutige `convertDemo`-Flow (`demo-tenant-service.ts:318–366`):
- Optional `wipeTenantData(tx, tenantId, {keepAuth:true})` falls `discardData=true`.
- `repo.convertDemoKeepData(tx, tenantId)` strippt alle Demo-Flags.
- `auditLog.log({action:"demo_convert"})`.
- Fire-and-forget `notifyConvertRequest` an Sales-Email.

**Was nicht passiert**: Weder `createSubscription` noch `enableModule` wird gecallt. Die 4 Module (`core, crm, billing, warehouse`) wurden beim `createDemo` in `tenant_modules` via `tenantModule.upsert` eingetragen — aber **ohne** eine `platform_subscription`-Row zu erzeugen (da `createDemo` heute keinen Platform-Kontext kennt).

**Offene Frage**: Soll der Convert-Flow nach Migration für jedes heute aktivierte Modul eine `platform_subscription` anlegen? Der existierende Bridge-Entry ist `createSubscription(prisma, {customerTenantId, module, billingCycle}, platformUserId)`. Constraints:
- Läuft **nicht** innerhalb einer Outer-Transaction (öffnet eigene `$transaction`).
- House-Rule: wirft `PlatformSubscriptionSelfBillError` wenn Demo-Tenant zufällig gleich Operator-Tenant (praktisch unmöglich, aber defensiv).
- Braucht `platformUserId` als String — müsste aus `ctx.platformUser.id` oder `PLATFORM_SYSTEM_USER_ID` kommen.
- Kein Default für `billingCycle` — der Caller müsste beide Modi (MONTHLY/ANNUALLY) exponieren.
- `billingRecurringInvoice` wird angelegt, aber **erste Rechnung** wird erst vom `recurring-invoices` Cron 04:00 UTC erzeugt. Autofinalize läuft um 04:15. Bei einem Convert am Tag x wäre die erste Invoice erst am Tag x+1 finalisiert.

### 7. Convert-Request-Inbox statt Email

**Fakt**: `requestConvertFromExpired` schreibt heute nur eine `email_send_log`-Row (D.5). Es existiert keine Inbox/Queue im Platform-UI die das surfacen könnte, und `email_send_log` wird vom Platform-UI nirgends gelesen (D.4).

**Offene Frage**: Soll eine parallele "Demo-Convert-Request"-Tabelle eingeführt werden, oder lässt sich der Email-Log als Daten-Quelle des Platform-UI nutzen? Pattern-Vorlagen im Repo:
- **Support-Sessions** (D.1) — eigene Tabelle, 3 Status-Tabs, Action-Buttons. Schließt am besten an existing UX an.
- **Dashboard-Card** (`/platform/(authed)/dashboard/page.tsx:11–13`) — Comment wartet auf genau diese Materialisierung.

Eine neue Tabelle `DemoConvertRequest` würde dem Support-Session-Pattern folgen (eigene Model, Status, `requestedAt`, `requestedByUserId`, `resolvedAt`, `resolvedByPlatformUserId`). Die alternative ist die bestehende `email_send_log`-Zeile im Platform-UI zu lesen (durch einen Filter auf `subject LIKE '[Terp] Demo-Konvertierung%'` — brüchig).

### 8. `requestConvertFromExpired` bleibt Tenant-Side

`requestConvertFromExpired` wird vom Demo-Tenant-User selbst gerufen (Self-Service auf `/demo-expired`). Der Caller hat nur einen Tenant-Supabase-Context — **keinen Platform-Context**. Diese Procedure kann also nicht nach `/platform/*` migriert werden. Sie muss in einem tenant-scoped tRPC-Router bleiben.

**Folge-Frage**: Wenn der Rest des Demo-Routers nach `/platform/*` geht, wo lebt `requestConvertFromExpired`? Ein eigener kleiner Tenant-Router (z. B. `demoSelfService`) oder eingebettet in einen bestehenden Router (`tenants`)? Die existierende Gate-Logik (Membership-Check + Demo-Expired-Check) liegt im Service, nicht in der Procedure — das macht einen Reparenting unkompliziert.

### 9. Welcher Tenant-Router-Clean-Up ist notwendig?

`src/trpc/routers/_app.ts:13` importiert `demoTenantsRouter`, `_app.ts:120` registriert ihn als `demoTenants`. Nach Migration müssten diese beiden Zeilen entfernt werden — und der gesamte Client-Code in `src/hooks/use-demo-tenants.ts` wäre auf einen Platform-Client umzustellen. Die 6 Admin-Hooks (`useDemoTenants, useDemoTemplates, useCreateDemoTenant, useExtendDemoTenant, useConvertDemoTenant, useExpireDemoTenantNow, useDeleteDemoTenant`) callen alle `trpc.demoTenants.*`. Ausnahme: `useRequestConvertFromExpired` (Zeile 96) — bleibt auf dem Tenant-Client, da die Procedure selbst bleibt (siehe Punkt 8).

### 10. Tenant-App `/admin/tenants` Seite nach Migration

Heute zeigt die Seite den "normalen" Tenant-CRUD (über `tenants.*` Router, gegated `tenants.manage`) **plus** den Demo-Panel. Nach einem Reinzug des Demo-Teils nach `/platform/*` bleibt die Seite funktional gültig (der Tenant-CRUD-Teil), nur der `DemoTenantsPanel`-Mount an Zeile 122 müsste entfernt werden — zusammen mit den dazugehörigen Imports.

Offene Frage: Bleibt `/admin/tenants` als Seite dann überhaupt sinnvoll, oder wird sie komplett obsolet? Der Sidebar-Entry in `sidebar-nav-config.ts:542` hängt weiterhin an `tenants.manage` — eine Design-Entscheidung außerhalb der reinen Fakten-Sammlung.

## Code References

### Demo-Tenant-Stack (Tenant-App-Seite)
- `src/trpc/routers/demo-tenants.ts:17-206` — 7 Procedures + `tenants.manage` Gate
- `src/trpc/routers/_app.ts:13,120` — Router-Registration
- `src/lib/services/demo-tenant-service.ts:104-235` — `createDemo` mit Transaction + Supabase-Compensation
- `src/lib/services/demo-tenant-service.ts:263-314` — `extendDemo` + Re-Activation-Logik
- `src/lib/services/demo-tenant-service.ts:318-366` — `convertDemo`
- `src/lib/services/demo-tenant-service.ts:370-398` — `expireDemoNow`
- `src/lib/services/demo-tenant-service.ts:402-446` — `deleteDemo` + `wipeTenantData` full-wipe
- `src/lib/services/demo-tenant-service.ts:458-513` — `requestConvertFromExpired` ungegated Self-Service
- `src/lib/services/demo-tenant-service.ts:525-551` — `notifyConvertRequest` (privat, email-send-log only)
- `src/lib/services/demo-tenant-service.ts:575-762` — `wipeTenantData` L1–L5 Delete-Ordering
- `src/lib/services/demo-tenant-repository.ts:15-134` — `DEMO_ADMIN_GROUP_ID` + 7 Repo-Funktionen
- `src/lib/demo/registry.ts:1-26`, `src/lib/demo/types.ts:1-26` — Template-Engine-Contract
- `src/lib/demo/templates/industriedienstleister_150.ts:135` — `apply(ctx)` Entry
- `src/app/api/cron/expire-demo-tenants/route.ts:29-164` — Cron-Handler + CRON_SECRET Auth
- `vercel.json:43-46` — Cron-Schedule `0 1 * * *`
- `src/components/tenants/demo/demo-tenants-panel.tsx` — Top-level Panel
- `src/components/tenants/demo/demo-tenants-table.tsx` — Daten-Tabelle + Row-Actions
- `src/components/tenants/demo/demo-create-sheet.tsx` — Create-Sheet + Invite-Link-Fallback
- `src/components/tenants/demo/demo-convert-dialog.tsx` — Convert-Dialog (discard/keep)
- `src/hooks/use-demo-tenants.ts:13-96` — alle 7 tRPC-Client-Hooks
- `src/app/[locale]/(dashboard)/admin/tenants/page.tsx:32,59,122` — Mount-Punkt + Permission-Gate
- `src/components/layout/demo-banner.tsx` — Sticky-Banner (bleibt)
- `src/components/layout/demo-expiration-gate.tsx` — Redirect-Wrapper (bleibt)
- `src/app/[locale]/demo-expired/page.tsx` — Expired-Page mit CTA (bleibt)
- `src/app/[locale]/demo-expired/layout.tsx` — isolated Layout (bleibt)

### Schema + Migrations
- `prisma/schema.prisma:113-121,64,279` — `Tenant` Demo-Fields + `User` Back-Relation + Index
- `supabase/migrations/20260420100000_add_tenant_demo_fields.sql` — Columns + FK + Partial-Index
- `supabase/migrations/20260420100002_seed_demo_admin_group.sql` — Demo-Admin-Group-Seed

### Audit-Logging
- `src/lib/services/audit-logs-service.ts:173-260` — `log()` + `logBulk()` inkl. impliziter Impersonation-Dual-Write
- `src/lib/platform/impersonation-context.ts` — `AsyncLocalStorage`-Backend
- `prisma/schema.prisma:3043-3067` — `AuditLog` Model
- `prisma/schema.prisma:1285-1302` — `PlatformAuditLog` Model (keine Prisma-Relations)

### Platform-tRPC-Stack
- `src/trpc/platform/init.ts:98-249` — Context-Factory + 3 Procedure-Typen
- `src/trpc/platform/_app.ts:1-27` — 6 Subrouter merged
- `src/trpc/platform/context.ts:11-15` — Typed React-Context
- `src/trpc/platform/client.tsx:34-88` — Platform-Fetch + 401-Interceptor
- `src/app/api/trpc-platform/[trpc]/route.ts` — Route-Adapter mit Set-Cookie-Forwarding
- `src/trpc/platform/routers/tenantManagement.ts:135-242` — `create` Procedure (Andockpunkt)
- `src/trpc/platform/routers/tenantManagement.ts:507-600` — `enableModule` + Subscription-Bridge-Call
- `src/trpc/platform/routers/tenantManagement.ts:602-681` — `disableModule` + Subscription-Cancel

### Platform-Auth
- `src/lib/platform/jwt.ts` — HS256, 30-min idle, 4-h max
- `src/lib/platform/cookie.ts` — `platform-session` Cookie
- `src/lib/platform/password.ts` — Argon2id
- `prisma/schema.prisma:1244-1282` — `PlatformUser` + `SupportSession`
- `supabase/migrations/20260421000000_create_platform_admin_tables.sql` — Platform Tables
- `supabase/migrations/20260421200000_create_platform_system_user.sql` — Sentinel `00000000-0000-0000-0000-00000000beef`
- `scripts/bootstrap-platform-user.ts:148,178,181` — Bootstrap-CLI

### Platform-UI
- `src/app/platform/layout.tsx` — Root Layout
- `src/app/platform/(authed)/layout.tsx` — Auth-Gate + Sidebar + Top-bar
- `src/app/platform/(authed)/tenants/page.tsx` — List-Page mit Search/Filter/Pagination
- `src/app/platform/(authed)/tenants/new/page.tsx:73-88` — Create-Page mit Invite-Link-Fallback
- `src/app/platform/(authed)/tenants/[id]/page.tsx` — Detail 3-Tabs
- `src/app/platform/(authed)/tenants/[id]/modules/page.tsx` — Module-Management
- `src/app/platform/(authed)/support-sessions/page.tsx:80-208` — Queue-Pattern-Vorbild
- `src/app/platform/(authed)/dashboard/page.tsx:11-13,47-82,159-176` — Dashboard + deferred Convert-Request-Comment
- `src/app/platform/(authed)/audit-logs/page.tsx` — Paginated Read + Detail-Sheet
- `src/components/platform/sidebar.tsx:47-125` — Nav-Array + Sub-Menu-Pattern

### Audit-Service + Sentinel
- `src/lib/platform/audit-service.ts:82-138` — `log/list/getById` Signaturen
- `src/trpc/init.ts:33-34,185` — `PLATFORM_SYSTEM_USER_ID` Definition + Usage
- `src/trpc/platform/routers/tenantManagement.ts:200` — Sentinel-Usage in tenant-create
- `src/lib/platform/subscription-service.ts:152,332` — Sentinel-Usage in Subscription-Bridge

### Subscription-Bridge
- `src/lib/platform/subscription-service.ts:62-92` — Env/House-Guards
- `src/lib/platform/subscription-service.ts:186-244` — Marker-Helpers
- `src/lib/platform/subscription-service.ts:262-403` — `createSubscription` full flow
- `src/lib/platform/subscription-service.ts:405-540` — `cancelSubscription` Path A / Path B
- `src/lib/platform/subscription-service.ts:542-632` — `listForCustomer`
- `src/lib/platform/subscription-service.ts:634-...` — `sweepEndedSubscriptions`
- `src/lib/platform/module-pricing.ts:51,84` — Module-Price-Catalog + `getModulePrice`
- `src/lib/platform/subscription-autofinalize-service.ts:46-200` — Autofinalize
- `src/app/api/cron/platform-subscription-autofinalize/route.ts` — Autofinalize-Cron
- `src/trpc/platform/routers/tenantManagement.ts:558-597` — `enableModule` Subscription-Call-Site
- `src/trpc/platform/routers/tenantManagement.ts:641-681` — `disableModule` Cancel-Call-Site

### Tests + Fixtures
- `src/lib/services/__tests__/demo-tenant-service.test.ts` — Service-Unit-Tests, kein `tenants.manage`
- `src/lib/services/__tests__/demo-tenant-service.integration.test.ts:37,161` — DB-Integration, hardcoded Seed-Admin-ID
- `src/app/api/cron/expire-demo-tenants/__tests__/integration.test.ts:64-101` — Cron-Integration-Tests
- `src/trpc/routers/__tests__/tenants-list-impersonation.test.ts:39` — Test-Fixture, setzt `demoCreatedById: null`

### Permission-Catalog
- `src/lib/auth/permission-catalog.ts:129` — `tenants.manage` Kanonische Definition
- `src/components/layout/sidebar/sidebar-nav-config.ts:542` — `/admin/tenants` Sidebar-Gate

## Historical Context (from thoughts/)

- `thoughts/shared/plans/2026-04-09-demo-tenant-system.md` — Phase 3 Plan (Service-Struktur) + Phase 4 Plan (Cron). Referenced aus Comments in `demo-tenants.ts:7`, `demo-tenant-service.ts:8`, `expire-demo-tenants/route.ts:8`, `demo-tenant-repository.ts:5`.
- `thoughts/shared/plans/2026-04-09-platform-admin-system.md` — Ursprünglicher Platform-Plan (Phase 0/1/2). Definiert die `src/trpc/platform/**` Struktur.
- `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` — Phase 10a Subscription-Bridge-Plan. Referenced aus `CLAUDE.md` Projekt-Header.
- `thoughts/shared/research/2026-04-09-...` — ggf. frühere Recherche zu denselben Themen (nicht direkt durchsucht in dieser Session).

## Open Questions

Die folgenden Punkte sind nicht durch Code-Lesen lösbar und gehören in die Plan-Phase:

1. **FK-Strategie für `demo_created_by`** — welche der vier Optionen in §1?
2. **Dual-Write vs. Platform-only Audit** für Demo-Events — (§5)
3. **Subscription-Bridge-Kopplung beim Convert-Flow** — an welcher Stelle, für welche Module, wer trägt die `platformUserId`? (§6)
4. **Convert-Request-Materialisierung** — eigene Tabelle oder bestehende `email_send_log` reverse-nutzen? (§7)
5. **Standort von `requestConvertFromExpired`** nach der Migration — eigener Tenant-Router oder Re-Home in `tenants.*`? (§8)
6. **Bestandsaufnahme Prod/Staging** — existieren dort bereits erzeugte Demo-Rows mit gefülltem `demo_created_by`? Muss per DB-Query bestätigt werden.
7. **Cron-Audit-Source** — `audit_logs` oder `platform_audit_logs` nach Migration? (§4)
8. **Sidebar-Design** — bekommt Demo einen eigenen Top-Nav-Entry in `sidebar.tsx:NAV`, oder wird er als Sub-Menü unter "Tenants" gemountet (wie "Neuer Tenant")? Keine reine Code-Frage.
