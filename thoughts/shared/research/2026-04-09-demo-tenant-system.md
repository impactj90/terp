---
date: 2026-04-09T09:43:22+02:00
researcher: impactj90
git_commit: 8d1aac8961be4ac2e323822fe437ae7b00c55bc8
branch: staging
repository: terp
topic: "Demo-Tenant-System — as-is tenant infrastructure research"
tags: [research, codebase, tenants, multi-tenant, tenant-modules, user-creation, cron, seeds, permissions, demo-tenant]
status: complete
last_updated: 2026-04-09
last_updated_by: impactj90
last_updated_note: "Review corrections — verified login gap (no Supabase Auth path on user create), dead-code status of tenant-service.ts, absence of read/write differentiation in tRPC middleware, and historical git search for auth-path user_tenants inserts (none found)."
---

# Research: Demo-Tenant-System — Grundlage der bestehenden Tenant-Infrastruktur

**Date**: 2026-04-09T09:43:22+02:00
**Researcher**: impactj90
**Git Commit**: 8d1aac8961be4ac2e323822fe437ae7b00c55bc8
**Branch**: staging
**Repository**: terp

## Research Question

Wie sieht die bestehende Tenant-Infrastruktur (Modell, Context/Middleware, CRUD-Flows, User-Anlage, Modul-Aktivierung, Seeds, Cron, Permissions, Admin-UI, Metriken) heute im terp-Codebase aus — als Grundlage für die spätere Planung eines Demo-Tenant-Systems (gated Sales-Enablement-Sandbox, 14 Tage, Template-basierend, `is_demo`-Flag auf produktiver Infrastruktur)?

Das Konzept-Dokument aus `/research_codebase`-Argumenten ist der Input; das Ziel dieser Recherche ist es **nur** den Ist-Zustand zu dokumentieren, auf dem ein Demo-Tenant-System aufsetzen würde — keine Bewertung, keine Empfehlungen.

## Summary

Die Tenant-Infrastruktur ist vollständig aufgebaut und auf Multi-Tenant-Produktion ausgelegt, enthält aber **keinerlei Demo-/Trial-/Sandbox-Konzepte**:

- **Datenmodell**: `Tenant` (`prisma/schema.prisma:94`) hat nur `isActive`, `vacationBasis` und kaufmännische Felder — **keine** `is_demo`, `demo_expires_at`, `demo_template`, `demo_created_by`, `demo_notes` Spalten. `TenantModule` existiert als separate Tabelle mit 5 bekannten Modulen.
- **Tenant-Access-Control** läuft über das `user_tenants` Join (Migration `20260101000085`), geprüft in-memory im `tenantProcedure` Middleware (`src/trpc/init.ts:210-238`). Ein Tenant-scoped Prisma-Client existiert nicht — jeder Repository-Call übergibt `tenantId` explizit.
- **Tenant-CRUD** ist im Router `src/trpc/routers/tenants.ts` implementiert; das `tenant-service.ts` existiert parallel, wird aber **von niemandem aufgerufen** — verifiziert per Grep über `src/`: null Imports (Dead Code, siehe Abschnitt 4).
- **User-Anlage** via tRPC `users.create` schreibt **nur** in `public.users` + `user_tenants` — es gibt **keinen** Call zu `supabase.auth.admin.createUser`, keine Passwort-Reset-Link-Generierung, keine Invite-E-Mail. Ein Trigger `handle_new_user` sync't `auth.users → public.users` nur bei externer Insert (z. B. Supabase Dashboard). Der `password`-Parameter im Input-Schema wird akzeptiert, **nie verwendet**. **Konsequenz — "Login Gap"**: Ein über diesen Flow angelegter User kann sich **nicht einloggen**, weil kein korrespondierender Eintrag in `auth.users` existiert. Der einzige login-fähige User-Weg heute führt über externen `auth.users`-Insert (Supabase Dashboard oder `supabase/seed.sql`). Siehe Abschnitt 7 für die vollständige Verkettung.
- **tRPC-Middleware ohne Read/Write-Unterscheidung**: Kein Middleware im Codebase greift auf `opts.type` / `opts.meta` / `.meta({...})` zu (verifiziert per Grep über `src/`). `tenantProcedure` und Authorization-Middleware destrukturieren nur `ctx` und `next`. Eine Unterscheidung zwischen Query- und Mutation-Operations (relevant für einen Demo-Expired-Read-Only-Mode) müsste neu eingeführt werden.
- **Module-Aktivierung** ist separat (`tenantModules`-Router) mit fixer Whitelist `["core", "crm", "billing", "warehouse", "inbound_invoices"]`. `"core"` ist immer aktiv. Beim Anlegen eines neuen Tenants wird **kein** `TenantModule`-Eintrag erzeugt — die Migration 093 hat nur existierende Tenants einmalig mit `core` befüllt.
- **Seed-Infrastruktur**: Kein `prisma/seed.ts` und kein `prisma/seeds/`-Verzeichnis. Alles in **einer** großen Datei `supabase/seed.sql` (~4400+ Zeilen) plus ein Script `scripts/seed-staging.ts` das diese Datei per `psql` gegen Staging pipet. Es gibt **keine** Template-/Factory-Funktionen für programmatische Datenerzeugung.
- **Cron**: 9 Routes in `src/app/api/cron/`, registriert in `vercel.json`. Sechs davon iterieren über `prisma.tenant.findMany({ where: { isActive: true } })`. Authentication via `Authorization: Bearer <CRON_SECRET>`. Checkpointing via `CronCheckpoint` Tabelle.
- **Default-Daten für neue Tenants**: **Keine programmatische Seeding-Logik bei Tenant-Create**. Default-Absence-Types, Booking-Types, User-Groups, Employment-Types und Accounts sind via Migrations mit `tenant_id IS NULL` global seeded und werden von Services zusammen mit tenant-spezifischen Zeilen zurückgegeben.
- **Metriken/Billing**: Es existiert **kein** MRR/ARR/Subscription/SaaS-Billing-Code. "Billing"-Modul bezieht sich auf Kunden-Rechnungen (Outbound), nicht Plattform-Billing. `prisma.tenant.count` kommt **nirgendwo** vor. Einzige Tenant-Aggregation ist das Admin-UI `/admin/tenants`.
- **Platform-Admin** als Rolle existiert nicht. Admin-Erkennung läuft über `UserGroup.isAdmin` oder `User.role === "admin"`. Ein separater `adminProcedure`-Factory existiert nicht — Admin-only-Procedures verwenden `protectedProcedure.use(requirePermission(TENANTS_MANAGE))`.
- **Prior art**: `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` ist das thematisch nächste bestehende Dokument (Platform-Admin-Rolle mit Tenant-Switcher und Read-only-Modus). Zu Demo/Trial/Sandbox/ProDi gibt es **keinerlei** Dokumente in `thoughts/`.

## Detailed Findings

### 1. Tenant Data Model

**`prisma/schema.prisma:94-163`** — `model Tenant`

Aktuelle Felder:
- `id` UUID (`gen_random_uuid()`)
- `name` VarChar(255), `slug` VarChar(100, unique), `settings` Json?
- `isActive` Boolean default true (soft-delete via `deactivate`)
- `createdAt`, `updatedAt` Timestamptz
- `addressStreet/Zip/City/Country`, `phone`, `email`
- `payrollExportBasePath`, `notes`, `vacationBasis` (`calendar_year` | `entry_date`)
- ~40+ One-to-Many Relations (employees, bookings, orders, absences, tariffs, etc.)

**Keine** Demo-/Trial-Felder. Die im Konzept vorgeschlagenen Felder `is_demo`, `demo_expires_at`, `demo_template`, `demo_created_by`, `demo_notes` sind neu hinzuzufügen.

**`prisma/schema.prisma:271-284`** — `model TenantModule`
- `id`, `tenantId`, `module` (VarChar 50), `enabledAt`, `enabledById`
- `@@unique([tenantId, module])`
- Schema-Kommentar listet `core, crm, orders, warehouse`, authoritative Liste ist aber in TypeScript-Konstanten (siehe Abschnitt 6)

**`prisma/schema.prisma:1144-1157`** — `model UserTenant`
- Composite PK `(userId, tenantId)`
- `role` VarChar(50) default `"member"` — diese `role`-Spalte wird vom Tenant-Router auf `"owner"` gesetzt wenn der Creator in der Transaction angelegt wird, auf `"member"` bei normaler User-Anlage. Wird im Code ansonsten **nicht konsumiert**.

**Migration**: `supabase/migrations/20260101000085_create_user_tenants.sql` (einmaliger Backfill für pre-existing users).

### 2. tRPC Tenant Context + Middleware

**`src/trpc/init.ts:39-53`** — `TRPCContext` Typ
```ts
{ prisma, authToken, user, session, tenantId, ipAddress, userAgent }
```

**`src/trpc/init.ts:28-31`** — `ContextUser`
Ein Prisma `User` augmentiert mit eager-loaded `userGroup: UserGroup | null` und `userTenants: (UserTenant & { tenant: Tenant })[]`. Die komplette Liste der Tenants eines Users liegt bei jedem Request im Context.

**`src/trpc/init.ts:61-144`** — `createTRPCContext`
1. Liest `Authorization: Bearer <jwt>` und `x-tenant-id` aus Headers (oder SSE `connectionParams`)
2. Erstellt Supabase Service-Role-Client und validiert JWT via `supabase.auth.getUser(authToken)`
3. Lädt `prisma.user.findUnique({ include: { userGroup: true, userTenants: { include: { tenant: true } } } })`
4. Setzt `user` nur wenn `dbUser.isActive !== false && !dbUser.isLocked`
5. Speichert IP/UA für Audit-Logging

**`src/trpc/init.ts:179-238`** — Procedure-Tiers
- **`publicProcedure`** (179): bare `t.procedure`
- **`protectedProcedure`** (185-200): prüft `ctx.user && ctx.session`, throws `UNAUTHORIZED`
- **`tenantProcedure`** (210-238): chained auf `protectedProcedure`
  - Throws `FORBIDDEN "Tenant ID required"` wenn `ctx.tenantId` fehlt (213)
  - In-Memory-Scan `ctx.user.userTenants.some(ut => ut.tenantId === ctx.tenantId)` (220-223)
  - Throws `FORBIDDEN "Access to tenant denied"` wenn kein Match
  - `next()` mit `tenantId` verengt auf `string`

**Kein `adminProcedure`**. Admin-only Procedures komponieren manuell: `protectedProcedure.use(requirePermission(TENANTS_MANAGE))`.

**`src/lib/auth/middleware.ts`** — Authorization-Middleware
- `requirePermission(...ids)` (39): OR-Logik, throws `FORBIDDEN`
- `requireSelfOrPermission(getter, id)` (72): self bypasst
- `requireEmployeePermission(getter, own, all)` (124): Admin bypass (140), eigene-Daten oder Team-Mitgliedschaft
- `applyDataScope()` (218): liest `user.dataScope*` Felder und hängt `ctx.dataScope` an

**`tenantScopedUpdate`** Helper — **`src/lib/services/prisma-helpers.ts:33-53`**
```ts
delegate.updateMany({ where: { id, tenantId, ...extra }, data })
```
Blockiert cross-tenant writes auf Query-Ebene; throws `TenantScopedNotFoundError` wenn `count === 0`.

**Keine Read/Write-Differenzierung im Middleware**: Alle Middleware-Definitionen im Codebase verwenden ausschließlich `async ({ ctx, next }) => ...` — die tRPC-MiddlewareBuilder-Signatur exponiert zwar `type: 'query' | 'mutation' | 'subscription'`, `path`, `input`, `meta`, `rawInput`, aber **keine einzige Stelle** im Source-Tree greift auf `opts.type` zu (verifiziert per grep über `src/`: `opts.type`, `type === 'mutation'`, `type === 'query'` → 0 Treffer). `protectedProcedure` (`src/trpc/init.ts:185-200`) und `tenantProcedure` (`src/trpc/init.ts:210-238`) destrukturieren nur `ctx` und `next`. Es gibt auch keine Nutzung von `.meta({...})` auf Procedures. Konsequenz: Heute existiert **kein** Pattern, mit dem ein Middleware anhand des Operation-Typs (Read vs. Write) unterschiedlich reagieren kann, ohne dass diese Distinktion neu eingeführt wird.

### 3. Frontend Tenant Selection

**`src/lib/storage.ts:42-67`** — `tenantIdStorage` via `localStorage["tenant_id"]`.

**`src/providers/tenant-provider.tsx`**:
- Lädt gespeicherte Tenant-ID bei Mount
- Ruft `trpc.tenants.list` (`protectedProcedure` — braucht kein `x-tenant-id`)
- Clear wenn stored nicht mehr in Liste
- Auto-Select wenn genau ein Tenant
- `selectTenant()` → `tenantIdStorage.setTenantId()` + `window.location.reload()`

**`src/trpc/client.tsx:80-99`** — Header-Injection
Bei jedem HTTP-Batch: refresh Supabase session, setzt `authorization` + `x-tenant-id` Header.
SSE (110-124): gleiche Werte in `connectionParams` statt Headers.

### 4. Tenant CRUD Flows

**Router: `src/trpc/routers/tenants.ts`**

**Wichtig**: Der Router nutzt `protectedProcedure` (nicht `tenantProcedure`) für **alle** Operationen, weil Tenant-Management ein Super-Tenant-Level Action ist und kein `x-tenant-id` Context benötigt.

Alle Procedures außer `list` erfordern `tenants.manage` Permission.

Procedures:
- **`list`** (130-184): ohne Permission. Lädt alle Tenants via `userTenant.findMany` für den Calling-User. Optional Filter `name` (case-insensitive substring) und `active` — beide in-memory.
- **`getById`** (193-233): Requires `tenants.manage`. Calls `assertUserHasTenantAccess(ctx.user.userTenants, input.id)` (105-116).
- **`create`** (243-377): Requires `tenants.manage`. Normalisiert `slug` (trim + lowercase), validiert Address-Felder. `prisma.$transaction`:
  1. `tx.tenant.findUnique({ where: { slug } })` für Uniqueness
  2. `tx.tenant.create({ data, isActive: true })`
  3. `tx.userTenant.upsert(...)` mit `role: "owner"` für den Creator
  Danach Audit-Log `action: "create"`.
  **Keine** Default-Modul-Aktivierung, keine Default-Daten, kein Seed.
- **`update`** (387-533): Partial PATCH. `slug` ist nach Create **immutable** (update-Schema enthält kein `slug`-Feld). Audit-Log mit `auditLog.computeChanges`.
- **`deactivate`** (542-582): Soft-Delete via `isActive: false`. Audit-Log mit `changes: { isActive: { old: true, new: false } }`. Keine hard-delete Procedure existiert.

**Service-Duplikation (verifiziert 2026-04-09)**: `src/lib/services/tenant-service.ts` existiert parallel und spiegelt die Router-Logik — wird aber **von niemandem aufgerufen**. Grep über `src/` nach `tenant-service`: **null Source-Imports** (nur Erwähnungen in `thoughts/` und Docs). Git-Log zeigt nur zwei Commits auf der Datei: `70018ffc TICKET-304-325: Service+repository extraction for all 68 routers + flatten hooks` (die ursprüngliche Extraktion) und `6d0515ce Fix holiday date type error breaking Vercel build`. Der Service hat Funktionen `list`, `getById`, `create` (lines 76-149), `update` (151-244), `deactivate` (246-254). Alle sprechen direkt das Repository an und rufen zusätzlich `repo.upsertUserTenant` mit role `"owner"` auf (line 146). **Der Service ist Dead Code** — er wird weder vom tenant-Router noch von einem anderen Service/Route/Test konsumiert. Die komplette Tenant-CRUD-Logik lebt ausschließlich im Router inline.

**Repository: `src/lib/services/tenant-repository.ts`**
- `findTenantsForUser`, `findById`, `findBySlug`, `create`, `update`, `upsertUserTenant`

### 5. Tenant Admin UI

**Seite**: `src/app/[locale]/(dashboard)/admin/tenants/page.tsx`
- Permission: `useHasPermission(['tenants.manage'])` + redirect zu `/dashboard` bei Deny
- `useTenants({ params: { include_inactive: showInactive } })`
- "Show Inactive" Switch
- Client-seitige Suche (name, slug, addressCity)
- Count-Anzeige `countSingular/countPlural`

**Komponenten** in `src/components/tenants/`:
- `tenant-data-table.tsx`: Columns Name, Slug (mono), City, Country, Vacation Basis Badge, Status Badge. Dropdown-Actions: View, Edit, Deactivate (nur wenn `isActive`).
- `tenant-form-sheet.tsx`: Right-side Sheet für Create/Edit. Sections: Identity (Name, Slug mit kebab-case Auto-Generation, slug-disabled on edit), Address (alle required), Contact (Phone, Email), Settings (Payroll-Base-Path, Notes, VacationBasis Select), Status (nur Edit, `isActive` Switch). Slug-Regex `/^[a-z0-9-]+$/`.
- `tenant-detail-sheet.tsx`: Read-only Sheet, re-fetched via `useTenant(tenantId, open && !!tenantId)`. Footer: Edit- und Deactivate-Buttons.
- `tenant-deactivate-dialog.tsx`: `ConfirmDialog` mit destructive styling.

**Hook**: `src/hooks/use-tenants.ts` — `useTenants`, `useTenant`, `useCreateTenant`, `useUpdateTenant`, `useDeactivateTenant`.

### 6. Module Aktivierung

**Whitelist**: `src/lib/modules/constants.ts:9`
```ts
export const AVAILABLE_MODULES = ["core", "crm", "billing", "warehouse", "inbound_invoices"] as const
```

**Enforcement**: `src/lib/modules/index.ts:70-98` — `requireModule(module)`
1. Throws `FORBIDDEN` wenn `tenantId` fehlt
2. `"core"` short-circuits immer `true` (84)
3. `hasModule(prisma, tenantId, module)` → `prisma.tenantModule.findUnique({ where: { tenantId_module } })`
4. Throws `FORBIDDEN "Module X is not enabled for this tenant"` wenn nicht gefunden

**Pattern in Routern**:
```ts
const crmProcedure = tenantProcedure.use(requireModule("crm"))
```
Beispiele: `src/trpc/routers/crm/addresses.ts:17`, `billing/documents.ts:20`, `warehouse/articles.ts:28`, `invoices/inbound.ts:24`. Alle Sub-Routes erben automatisch den Modul-Check.

**Router**: `src/trpc/routers/tenantModules.ts`
- `list` — keine Permission. Service fügt `"core"` synthetisch hinzu wenn nicht in DB.
- `enable` — requires `settings.manage`, validiert gegen `AVAILABLE_MODULES`, upsert (no-op on conflict)
- `disable` — requires `settings.manage`, hart-blockt `module === "core"` (service:103), dann `deleteMany`

**Migration 093** (`20260101000093_create_tenant_modules.sql`): erstellt Tabelle und befüllt einmalig für **existierende** Tenants `core`. **Neue** Tenants bekommen keinen `core`-Eintrag in der DB — der Code umgeht das per synthetischem Inject und Short-Circuit in `hasModule`.

**Verifiziert — keine Modul-Aktivierung bei Tenant-Create (2026-04-09)**: Beide Code-Pfade wurden komplett gelesen:
- Router `tenants.ts:243-377` (`create` Transaction): enthält `tx.tenant.create`, `tx.userTenant.upsert` mit `role: "owner"`, danach Audit-Log. Zwischen Zeile 286 und 342 existiert **kein** `tenantModule.create`, `tenantModule.createMany` oder `tenantModule.upsert`.
- Service `tenant-service.ts:76-149` (`create`, ungenutzt): ruft `repo.create` und `repo.upsertUserTenant` auf — ebenfalls **keine** Modul-Aktivierung.
- Der einzige `prisma.tenantModule.upsert` im gesamten Source-Tree ist `tenant-module-repository.ts:33`, aufgerufen nur aus `tenantModule.enable` (d.h. via separatem Admin-Toggle, nicht automatisch).
Konsequenz: Ein frisch angelegter Tenant hat im produktiven System **null** Einträge in `tenant_modules`. Sämtliches "Core funktioniert trotzdem" läuft über die hard-coded Short-Circuits in `hasModule` und den synthetischen `core`-Eintrag in `getEnabledModules`.

**Admin UI**: `src/components/settings/module-settings.tsx` — iteriert `AVAILABLE_MODULES`, rendered Switch per Modul, `"core"` Switch ist `disabled`. Eingebunden in `src/app/[locale]/(dashboard)/admin/settings/page.tsx`, guarded durch `settings.manage`.

**Hook**: `src/hooks/use-modules.ts` — `useModules`, `useEnableModule`, `useDisableModule`. Kein `useModuleEnabled("crm")` Hook; Consumer bauen selbst `Set` und prüfen `has()`.

### 7. User Creation Flow

**Router**: `src/trpc/routers/users.ts:274-290` — `users.create`
- Auth: `tenantProcedure.use(requirePermission(USERS_MANAGE))`
- Input schema `createUserInputSchema` (81-104): `email`, `displayName`, `username?`, `userGroupId?`, `employeeId?`, `password?` (8-128 chars, **akzeptiert aber nie verwendet**), `ssoId?`, `isActive`, `isLocked`, `dataScope*`

**Service**: `src/lib/services/users-service.ts:60-135` — `create`
1. **Role derivation** (80-94): wenn `userGroupId` gesetzt, `repo.findUserGroupById`, dann `role = group.isAdmin ? "admin" : "user"`
2. **Prisma insert** (101-116): `repo.create` → `prisma.user.create({ data })`. **`password` wird nicht in das data-Objekt übernommen.**
3. **`user_tenants` insert** (119): `repo.upsertUserTenant(prisma, user.id, tenantId)` — hardcoded `role: "member"`
4. **Audit log** (122-132): errors swallowed mit `console.error`

**Keine Supabase Auth Interaktion im Create-Flow**: `createAdminClient` ist importiert, wird aber **nur** in `changePassword` (328) aufgerufen. Kein `supabase.auth.admin.createUser`, kein `generateLink`, kein `inviteUserByEmail`.

**`supabase.auth.admin.updateUserById`** in `users-service.ts:314-350` (`changePassword`) — der **einzige** Admin-API-Call im gesamten Service-Layer. Erfordert dass der User bereits in `auth.users` existiert.

**PostgreSQL Trigger**: `supabase/migrations/20260101000002_handle_new_user_trigger.sql`
- `AFTER INSERT ON auth.users` → insert in `public.users`
- Kopiert `id`, `email`; setzt `username = email`, `display_name` aus `raw_user_meta_data->>'display_name'` oder email-Prefix, `role = 'user'`, `is_active = true`
- **Kein** `user_tenants` Insert
- Feuert **nur** wenn jemand von außen (Supabase Dashboard, Admin API) in `auth.users` schreibt

**Login-Flow**: `src/app/[locale]/(auth)/login/page.tsx:41-44` ruft direkt `supabase.auth.signInWithPassword` im Client. **Kein** serverseitiger Login-Handler — `src/trpc/routers/auth.ts` exportiert nur `me`, `permissions`, `logout`; `src/lib/services/auth-service.ts` exportiert nur `getMe`, `getPermissions`, `logout`. Kein Login-Hook, kein Session-Callback. **Kein** Auto-Backfill von `user_tenants` bei Login.

**Memory-Note-Korrektur (verifiziert 2026-04-09 via Git-History)**: Eine ältere Memory-Notiz behauptete "Login handler adds `user_tenants` entry on successful auth". Dieser Code-Pfad existiert nicht und hat **nie existiert**:
- `git log --all -S "upsertUserTenant"` gegen `src/lib/services/auth-service.ts` und `src/trpc/routers/auth.ts`: null Treffer
- `git log --all -S "user_tenants"` gegen alle Auth-Pfade (`src/app/*login*`, `src/app/api/auth*`, `src/trpc/routers/auth.ts`, `src/lib/services/auth-service.ts`): null Treffer
- Das einzige Git-Commit das `auth.admin.createUser` als String überhaupt enthält, ist `6523a468 Migrate authentication from Go JWT backend to Supabase Auth` — und dort nur in einem Markdown-Test-Setup-Checklist, **nicht in Production-Code**
- Die Memory-Notiz wurde bereits im vorherigen Research-Turn in `MEMORY.md` korrigiert

**Login Gap (verifiziert 2026-04-09)**: Ein über `users.create` angelegter User kann sich **nicht einloggen**. Begründung — Verkettung der obigen Fakten:
- `users.create` → `userService.create` schreibt nur in `public.users` + `user_tenants`. Es erstellt **keinen** Eintrag in `auth.users`.
- Supabase Login (`signInWithPassword`) prüft ausschließlich `auth.users`. Ohne Eintrag dort gibt es keine Supabase-Auth-Identität und kein JWT.
- Der `handle_new_user` Trigger (`20260101000002_handle_new_user_trigger.sql`) läuft in die **andere Richtung**: `auth.users INSERT → public.users INSERT`, nicht umgekehrt.
- Die einzigen Wege, über die heute ein login-fähiger User entsteht, sind:
  1. Manueller Insert in `auth.users` via Supabase Dashboard/Studio → Trigger sync't nach `public.users`
  2. Direkter `supabase.auth.admin.createUser(...)` Call — dieser existiert aber **nirgendwo** in `src/` (verifiziert per Grep über den gesamten Source-Tree)
  3. Der seed-Flow in `supabase/seed.sql` der `auth.users` + `auth.identities` direkt über SQL befüllt (für die dev-Accounts `admin@dev.local`/`user@dev.local`)
- Konsequenz: `userService.create` erzeugt faktisch "verwaiste" `public.users` + `user_tenants` Rows, die keinem login-fähigen Supabase-Auth-User entsprechen. Der `password?`-Input im Schema (zwar akzeptiert, nie verwendet) verstärkt den Eindruck einer scheinbar funktionierenden User-Anlage, die in der Praxis keinen einloggbaren User produziert.

**Schreiber von `user_tenants`** (vollständige Liste, verifiziert per Grep 2026-04-09):
1. `src/lib/services/users-service.ts:119` — on user create (`role: "member"`) — **aktive Production-Code-Pfad**
2. `src/trpc/routers/tenants.ts:326-339` — Router-Transaction on tenant create (`role: "owner"`) — **aktiver Production-Code-Pfad**
3. `src/lib/services/tenant-service.ts:146` — on tenant create (`role: "owner"`) — **Dead Code** (der Service wird nirgends importiert, siehe Abschnitt 4)
4. Einmaliger Backfill in Migration `20260101000085_create_user_tenants.sql` für pre-existing users

Test-Files enthalten zusätzlich direkte `prisma.userTenant.upsert`-Aufrufe zur Testdaten-Einrichtung (`src/app/api/cron/inbound-invoice-escalations/__tests__/integration.test.ts:52`, `src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts:79`, `src/lib/services/__tests__/inbound-invoice-approval-service.integration.test.ts:89`, `src/lib/services/__tests__/inbound-invoice-service.integration.test.ts:75`) — diese sind nicht Production und werden in der obigen Liste nicht gezählt.

### 8. Auth & Permission System

**`src/lib/auth/permission-catalog.ts`**: 158 `Permission`-Objekte, statisch. Jede via `p(key, ...)` mit deterministic UUID v5 (namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`) aus key-String generiert. Exports: `lookupPermission(id)`, `permissionIdByKey(key)`, `listPermissions()`. Groups (informell per Kommentar): Core HR, Time tracking, Booking overview, Absences, Plans/config, Reports, System admin, CRM, Billing, Warehouse, HR Personnel File, DSGVO, Email, Inbound Invoices, Audit Log, Personnel Payroll, Export Templates.

Relevante System-Admin-Permissions: `users.manage`, `tenants.manage`, `settings.manage`.

**`src/lib/auth/permissions.ts`**
- `resolvePermissions(user)` (26): gibt leer-Array zurück bei Admin (is_admin-Flag) oder inactive Group
- `isUserAdmin(user)` (56): `user.userGroup?.isAdmin || user.role === "admin"`
- `hasPermission(user, permId)` (73): Admin-Bypass, dann JSONB-Array-Check, auch Cross-check per Key-String
- `hasAnyPermission(user, [ids])` (99): OR short-circuit

**`UserGroup` Model** (`prisma/schema.prisma:1111-1135`):
- `tenantId` **nullable** (null = system-wide group)
- `permissions Json @default("[]")` — Array von Permission-UUIDs in JSONB
- `isAdmin Boolean` — Bypass-Flag
- `isSystem Boolean`
- `isActive Boolean`

**Kein** separates `PermissionGroup`/`UserPermissionGroup` Join. Permissions sind direkt als JSONB im UserGroup-Row.

**Frontend Permission Gate**: `src/hooks/use-has-permission.ts` — `useHasPermission`, `usePermissionChecker`. Ruft `trpc.auth.permissions` (gibt `{ permission_ids, is_admin }`), checkt `is_admin` zuerst.

### 9. Seed Infrastruktur

**Kein `prisma/seed.ts`**, kein `prisma/seeds/` Verzeichnis, kein `prisma.seed`-Eintrag in `package.json`.

**`supabase/seed.sql`** — eine ~4400+ Zeilen SQL-Datei, idempotent (`ON CONFLICT ... DO NOTHING/UPDATE`). Inhalt:
- Auth users (`auth.users` + `auth.identities`): `admin@dev.local`, `user@dev.local`
- Dev-Tenant ID `10000000-0000-0000-0000-000000000001`
- Admin user group (alle Permissions)
- `public.users`, `user_tenants`
- 14 Employees (EMP001-EMP014) — Batch 1 (205-217) und Batch 2 (3022-3036)
- Departments (hierarchy), Day plans, Week plans, Tariffs
- Holidays (Bayern 2026), Teams, Accounts
- Bookings, daily/monthly values, vacation data
- Billing documents, warehouse data, HR personnel file entries
- Payroll master data (4267+): Encrypted tax_id/iban, Steuerklassen, Health Insurance Providers, Personnel Group Codes, Activity Codes, Children, Company Cars, Pensions, Savings
- Payroll lookup tables (4086+): ~70 GKV providers, 20 DEÜV codes, 9 BG institutions, KldB Tätigkeitsschlüssel
- PL/pgSQL `DO $$` Block (3077-3132): generiert Shift-Schedule-Pläne für 4 Arbeiter über rolling Zeitraum `2026-01-05` bis `CURRENT_DATE + 90` (FS/SS/NS Rotation in 3-Wochen-Blöcken)

**Invocation**: `pnpm db:reset` → `supabase db reset` → `supabase/seed.sql`.

**Staging Seed**: `scripts/seed-staging.ts` (invoked via `seed:staging` in `package.json:42`) liest `supabase/seed.sql` und pipet an `psql` der staging-DATABASE_URL. Strippt `pgbouncer`/`supa` Query-Params, normalisiert `sslmode=no-verify` → `sslmode=require`.

**Es gibt keine Factory-/Generator-Funktionen** für programmatische Daten-Erzeugung (Employees, Bookings, Shifts, etc.) im TypeScript-Code. Alles ist statisches SQL.

**E2E Cleanup**: `src/e2e-browser/global-setup.ts:294` — `globalSetup()` schreibt 290-Zeilen `CLEANUP_SQL` in Temp-Datei, `psql` → 10s Timeout. Löscht E2E-prefixed Records aus ~30 Tabellen (incl. Tenant B `e2e150ff-...` isolation data), resetet `number_sequences` (next_value 100), cleaned E2E users/groups, re-inserted Tenant B deterministisch.

### 10. Cron Infrastruktur

**`src/app/api/cron/` — 9 Routes**, alle mit `Authorization: Bearer <CRON_SECRET>` Auth. Alle Routen mit Tenant-Iteration nutzen `prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } })`:

| Route | Schedule | Iteriert Tenants? | Action |
|---|---|---|---|
| `calculate-days/route.ts` | `0 2 * * *` | ✅ | `RecalcService.triggerRecalcAll()` per Tenant, Checkpoint per Date |
| `calculate-months/route.ts` | `0 3 2 * *` | ✅ | `MonthlyCalcService.calculateMonthBatch()` per Tenant, Checkpoint per `year:month` |
| `generate-day-plans/route.ts` | `0 1 * * 0` (Sonntag) | ✅ | `EmployeeDayPlanGenerator.generateFromTariff()`, 14d window |
| `execute-macros/route.ts` | `*/15 * * * *` | ✅ | `MacroExecutor.executeDueMacros()` |
| `recurring-invoices/route.ts` | `0 4 * * *` | ❌ (direkt) | `recurringService.generateDue()` — Checkpoint-Key `"tenantId:templateId"` |
| `wh-corrections/route.ts` | `0 6 * * *` | ✅ via TenantModule JOIN | Nur Tenants mit `module = "warehouse"` aktiv |
| `email-retry/route.ts` | `*/5 * * * *` | ❌ | 50 retryable `email_send_log` records, exp backoff max 3 |
| `email-imap-poll/route.ts` | `*/3 * * * *` | ❌ | `imapConfigRepo.findAllActive`, 3+ consecutive failures → Admin-Notify |
| `dsgvo-retention/route.ts` | **nicht in `vercel.json`** | ✅ | Suspended by default. `dsgvoService.executeRetention()` |

**`vercel.json`**: 9 Cron-Einträge (dsgvo-retention fehlt). Kein `functions`, `regions`, `env`.

**Pattern**: Alle Tenant-iterating Crons folgen: sequential processing, `CronCheckpoint` upsert, 240s elapsed-time warning, 300s `maxDuration` cap. Helper `CronExecutionLogger` und `CronCheckpoint` Models.

### 11. Metriken & Billing (Plattform-Ebene)

- **`prisma.tenant.count`**: **0 Vorkommen** im gesamten `src/`
- **`prisma.tenant.findMany`**: nur Crons (mit `isActive: true` Filter) und Tenant-Router
- **`prisma.user.count` tenant-scoped**: `users-repository.ts:43` (pagination total), `user-group-repository.ts:41` (users per group via `_count`)
- **Kein MRR/ARR/Subscription/SaaS-Billing-Code**. Search nach `stripe`, `paddle`, `lemon_squeezy`, `chargebee`, `subscription_plan` → 0 Source-Files (nur pnpm-lock.yaml und thoughts/ Markdown)
- **"Billing"-Modul** bezieht sich ausschließlich auf **Kunden-Rechnungen (outbound)**, nicht auf Plattform-Billing
- **Admin Dashboard Tenant-Stats**: Nur `admin/tenants/page.tsx`, kein Stats-Panel. Einfaches CRUD mit `count`-Anzeige der gefilterten Rows (i18n `countSingular/countPlural`). Kein employee count per tenant, keine usage metrics, kein revenue.
- **`isActive`-Filter-Pattern**: Crons filtern `where: { isActive: true }`. `tenants.deactivate` setzt `isActive: false` (Soft-Delete, no hard delete). `tenants.list` tRPC supports optional `active` Boolean mit in-memory Filter.

### 12. Prior Art in `thoughts/`

**Kein einziges Dokument zu Demo-Tenants, Sandbox, Trial, Sales-Enablement oder ProDi** im gesamten `thoughts/` Verzeichnis.

Nächstliegendes Dokument:
- `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` — Ticket für eine Platform-Admin-Rolle mit Tenant-Switcher-UI, Read-only-Modus default, Audit-Logging per Access, DSGVO-Erwägungen. Data model für `platform_admins` und `platform_admin_access_log` Tables. **Nicht implementiert.** → Relevant weil "Read-only Modus" und "Cross-Tenant-Access-Audit" konzeptionelle Überschneidung mit Demo-Tenant-Expired-Flow haben.

Tenant-Architektur (Ist-Implementierung, historischer Kontext):
- `thoughts/shared/tickets/ZMI-TICKET-210-tenants-users-usergroups.md` + research + plan (März 2026) — Tenants/Users/UserGroups CRUD in tRPC-Migration
- `thoughts/shared/tickets/ZMI-TICKET-055-system-settings-tenant-admin-ui.md` + research + plan (Februar 2026) — System-Settings und Tenant-Admin-UI
- `thoughts/shared/tickets/ZMI-TICKET-001-mandant-master-data.md` + research + plan (Januar 2026) — Mandant Master-Data Grundlage

Tenant-Isolation Audit (relevant weil Demo-Tenants dieselbe Isolation-Infrastruktur nutzen):
- `thoughts/shared/plans/2026-03-22-AUDIT-006-tenant-isolation-find-without-tenantid.md`
- `thoughts/shared/plans/2026-03-21-tenant-scoped-updates.md`
- `thoughts/shared/plans/2026-03-21-cross-tenant-isolation-e2e.md`
- `thoughts/shared/plans/2026-03-22-AUDIT-001..004-*.md` (4 Plans für Isolation-Fixes in Billing/Orders/Travel, HR/Time-Planning, Reference Data A/B)

Seeding (dev-mode, nicht demo):
- `thoughts/shared/research/2026-01-27-dev-mode-seeding-investigation.md`
- `thoughts/shared/plans/2026-01-27-dev-mode-seed-missing-entities.md`
- `thoughts/shared/plans/2026-03-15-seed-default-accounts-and-apply-calculation-rules.md`

Infra:
- `thoughts/shared/research/2026-02-26-gcp-terraform-deployment-research.md`
- `thoughts/shared/plans/2026-02-26-gcp-terraform-deployment.md`
- `thoughts/shared/plans/research/production-readiness-audit-2026-03-11.md`

## Code References

### Tenant Model & Migration
- `prisma/schema.prisma:94-163` — `model Tenant`
- `prisma/schema.prisma:271-284` — `model TenantModule`
- `prisma/schema.prisma:1111-1135` — `model UserGroup` (permissions JSONB + isAdmin)
- `prisma/schema.prisma:1144-1157` — `model UserTenant` (composite PK)
- `supabase/migrations/20260101000085_create_user_tenants.sql` — user_tenants creation + backfill
- `supabase/migrations/20260101000093_create_tenant_modules.sql` — tenant_modules + one-time `core` backfill

### tRPC Core
- `src/trpc/init.ts:39-53` — `TRPCContext` type
- `src/trpc/init.ts:28-31` — `ContextUser` type
- `src/trpc/init.ts:61-144` — `createTRPCContext` factory
- `src/trpc/init.ts:179-238` — `publicProcedure`, `protectedProcedure`, `tenantProcedure`
- `src/trpc/errors.ts:10-107` — `handleServiceError`
- `src/lib/services/prisma-helpers.ts:33-53` — `tenantScopedUpdate`

### Tenant Router / Service / Repo
- `src/trpc/routers/tenants.ts:105-116` — `assertUserHasTenantAccess` helper
- `src/trpc/routers/tenants.ts:130-184` — `list`
- `src/trpc/routers/tenants.ts:193-233` — `getById`
- `src/trpc/routers/tenants.ts:243-377` — `create` (inline, not using service)
- `src/trpc/routers/tenants.ts:326-339` — `UserTenant` upsert with `role: "owner"`
- `src/trpc/routers/tenants.ts:387-533` — `update`
- `src/trpc/routers/tenants.ts:542-582` — `deactivate`
- `src/lib/services/tenant-service.ts:45-254` — parallel service (unused by router)
- `src/lib/services/tenant-repository.ts:65-85` — `upsertUserTenant`

### Frontend Tenant
- `src/lib/storage.ts:42-67` — `tenantIdStorage`
- `src/providers/tenant-provider.tsx` — `TenantProvider`
- `src/trpc/client.tsx:80-99` — Header injection
- `src/app/[locale]/(dashboard)/admin/tenants/page.tsx` — Admin page
- `src/components/tenants/tenant-data-table.tsx`
- `src/components/tenants/tenant-form-sheet.tsx`
- `src/components/tenants/tenant-detail-sheet.tsx`
- `src/components/tenants/tenant-deactivate-dialog.tsx`
- `src/hooks/use-tenants.ts`

### Module Activation
- `src/lib/modules/constants.ts:9` — `AVAILABLE_MODULES`
- `src/lib/modules/index.ts:53` — `hasModule` (core short-circuit)
- `src/lib/modules/index.ts:70-98` — `requireModule` middleware
- `src/lib/services/tenant-module-service.ts:35-38, 52` — core-synthesis on list
- `src/lib/services/tenant-module-service.ts:69, 103, 107` — AVAILABLE_MODULES validation + core-disable-block
- `src/trpc/routers/tenantModules.ts` — list/enable/disable
- `src/trpc/routers/crm/addresses.ts:17` — example `tenantProcedure.use(requireModule("crm"))`
- `src/trpc/routers/billing/documents.ts:20` — billing gate
- `src/trpc/routers/warehouse/articles.ts:28` — warehouse gate
- `src/trpc/routers/invoices/inbound.ts:24` — inbound_invoices gate
- `src/components/settings/module-settings.tsx` — admin toggle UI
- `src/hooks/use-modules.ts`

### User Creation
- `src/trpc/routers/users.ts:81-104` — `createUserInputSchema`
- `src/trpc/routers/users.ts:274-290` — `users.create` procedure
- `src/lib/services/users-service.ts:60-135` — `create` flow
- `src/lib/services/users-service.ts:119` — `repo.upsertUserTenant` call (role: member)
- `src/lib/services/users-service.ts:314-350` — `changePassword` (only Admin-API usage)
- `src/lib/services/users-repository.ts:83-103` — `create` Prisma insert (no password)
- `src/lib/services/users-repository.ts:105-117` — `upsertUserTenant`
- `src/lib/supabase/admin.ts:12-23` — `createAdminClient`
- `src/lib/config.ts:9` — `SUPABASE_SERVICE_ROLE_KEY` binding
- `supabase/migrations/20260101000002_handle_new_user_trigger.sql` — `handle_new_user` trigger
- `src/app/[locale]/(auth)/login/page.tsx:41-44` — client-side signInWithPassword
- `src/trpc/routers/auth.ts:62-68` — `auth.me`
- `src/lib/services/auth-service.ts:61` — `logout` (Admin client usage)

### Permissions
- `src/lib/auth/permission-catalog.ts` — catalog + helpers
- `src/lib/auth/permissions.ts:26` — `resolvePermissions`
- `src/lib/auth/permissions.ts:56` — `isUserAdmin`
- `src/lib/auth/permissions.ts:73-93` — `hasPermission`
- `src/lib/auth/middleware.ts:39-58` — `requirePermission`
- `src/lib/auth/middleware.ts:72-108` — `requireSelfOrPermission`
- `src/lib/auth/middleware.ts:124-191` — `requireEmployeePermission`
- `src/lib/auth/middleware.ts:218-233` — `applyDataScope`
- `src/hooks/use-has-permission.ts`

### Seeds / Cron / Metrics
- `supabase/seed.sql` — 4400+ Zeilen, einziger Seed
- `supabase/seed.sql:205-217` — EMP001-EMP010
- `supabase/seed.sql:3022-3036` — EMP011-EMP014
- `supabase/seed.sql:3077-3132` — PL/pgSQL shift-schedule generator
- `supabase/seed.sql:4086+` — payroll lookup tables
- `supabase/seed.sql:4267+` — payroll master data
- `scripts/seed-staging.ts` — staging seeder
- `src/e2e-browser/global-setup.ts:9-292, 294` — CLEANUP_SQL + globalSetup
- `src/app/api/cron/calculate-days/route.ts:108` — `tenant.findMany isActive`
- `src/app/api/cron/calculate-months/route.ts:78`
- `src/app/api/cron/generate-day-plans/route.ts:72`
- `src/app/api/cron/execute-macros/route.ts:73`
- `src/app/api/cron/wh-corrections/route.ts:30-35` — TenantModule join
- `src/app/api/cron/recurring-invoices/route.ts:44`
- `src/app/api/cron/email-retry/route.ts`
- `src/app/api/cron/email-imap-poll/route.ts:68` — admin-notify via $queryRaw
- `src/app/api/cron/dsgvo-retention/route.ts:34` — **not in vercel.json**
- `vercel.json` — 9 cron entries
- `src/lib/services/users-repository.ts:43` — `user.count` tenant-scoped
- `src/lib/services/user-group-repository.ts:41` — `_count` users per group

## Architecture Documentation

### Patterns in Place

**Multi-Tenancy via Manual Scoping**: Jeder Repository-Call übergibt `tenantId` explizit als Parameter und merged es in `where`. Es gibt keinen scoped Prisma-Client, keinen Prisma Extension Hook. Das `tenantScopedUpdate` Helper ist die einzige zentralisierte tenant-scoping Abstraction und wird nur für writes verwendet.

**User-Tenant-Access via In-Memory-Scan**: `ctx.user.userTenants` wird beim Context-Build gejoint und im `tenantProcedure` Middleware in-memory gescannt. Keine zusätzlichen DB-Roundtrips per Request.

**Service + Repository + Router Layering**: Standard überall außer im Tenant-Router selbst, wo Router die Logik inline implementiert und das parallele Service nicht benutzt (Code-Duplikation).

**Module-Gating als Procedure-Base**: Feature-Module (`crm`, `billing`, `warehouse`, `inbound_invoices`) werden durch lokale Procedure-Bases umgesetzt. `"core"` ist hard-coded im `hasModule`.

**Admin-only Procedures**: Komposition von `protectedProcedure.use(requirePermission(KEY))`. Kein eigener Factory, kein `adminProcedure`. Platform-Admin-Konzept existiert nicht.

**Audit-Logging**: Manuell per Service-Call am Ende jeder Mutation. Swallowed auf Fehler.

**Soft Delete** auf `Tenant`: `isActive: false`, kein hard delete.

**Validation**: Tenant-Validation erfolgt sowohl im Router (inline) als auch parallel im Service (unused by router). Slug ist nach Create **immutable**.

### What Does Not Exist

- Demo-/Trial-/Sandbox-Konzept im Tenant Model
- Tenant-Expiration/TTL Mechanik
- Read-only Mode für Tenants
- Tenant-Templates / programmatische Daten-Generatoren
- Self-Service User-Provisioning über Supabase Admin API
- Invitation/Password-Reset-Link Generation
- Login-fähige User-Anlage via Service-Layer. Der einzige Weg einen einloggbaren User zu erzeugen ist ein externer Insert in `auth.users` (Supabase Dashboard, manueller Admin-API-Call außerhalb des Codes, oder `supabase/seed.sql`). Der tRPC-Flow `users.create` erzeugt nur `public.users` + `user_tenants` ohne Supabase-Auth-Seite und produziert damit keinen login-fähigen User (siehe "Login Gap" in Abschnitt 7).
- Read/Write-differenzierendes tRPC Middleware. Keine Stelle im Code liest `opts.type` / `.meta()`; `tenantProcedure` und Authorization-Middleware operieren nur über `ctx` und `next`. Ein "bei Mutations anders reagieren als bei Queries"-Pattern muss neu eingeführt werden, falls es gebraucht wird.
- Platform-Admin-Rolle
- Subscription/Billing-Plan/MRR-Tracking
- `"billing tenant" vs "demo tenant"` Unterscheidung in irgendeiner Query
- `prisma/seeds/` Directory oder Template-Dateien
- Per-Tenant Seed-Runner

## Historical Context (from thoughts/)

- `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` — Platform-Admin Ticket (nicht implementiert): Tenant-Switcher, Read-only Mode, Audit-Log per Access, DSGVO, `platform_admins` + `platform_admin_access_log` Tables. **Thematisch nächstes vorhandenes Dokument.**
- `thoughts/shared/tickets/ZMI-TICKET-210-tenants-users-usergroups.md` + plan + research (März 2026) — Ursprüngliche Tenant-Router-Implementierung
- `thoughts/shared/tickets/ZMI-TICKET-055-system-settings-tenant-admin-ui.md` + plan + research (Februar 2026) — Tenant-Admin-UI
- `thoughts/shared/tickets/ZMI-TICKET-001-mandant-master-data.md` + plan + research (Januar 2026) — Mandant Master-Data Grundschema
- `thoughts/shared/plans/2026-03-22-AUDIT-006-tenant-isolation-find-without-tenantid.md` + siblings AUDIT-001..004 — Tenant-Isolation Audit-Plans, wichtig weil Demo-Tenants auf derselben Isolation-Infrastruktur basieren würden
- `thoughts/shared/plans/2026-03-21-cross-tenant-isolation-e2e.md` — E2E Tests für Cross-Tenant Data-Leakage
- `thoughts/shared/research/2026-01-27-dev-mode-seeding-investigation.md` + plan — Dev-Mode Seed Investigation (nicht Demo-spezifisch)
- `thoughts/shared/research/2026-02-26-gcp-terraform-deployment-research.md` + plan — Multi-Tenant Infrastruktur Context

**Keine** existierenden Dokumente zu: Demo-Tenants, Sandbox, Trial-Accounts, Sales-Enablement, Tenant-Expiration, Tenant-Templates, Demo-User-Provisioning, ProDi/Pro-Di.

## Related Research

- `thoughts/shared/research/2026-03-03-ZMI-TICKET-210-tenants-users-usergroups.md` — Ursprüngliche Tenant-CRUD Migration Research
- `thoughts/shared/research/2026-03-22-AUDIT-006-tenant-isolation-find-without-tenantid.md` — Tenant-Isolation Audit Research
- `thoughts/shared/research/2026-03-21-tenant-scoped-updates.md`
- `thoughts/shared/research/2026-03-21-cross-tenant-isolation-e2e.md`

## Open Questions

Diese Fragen sind für die **Planungsphase** (nach Pro-Di Go-Live) relevant und wurden durch die Recherche nicht automatisch beantwortet, sondern nur umrahmt:

1. **Demo-Tenant-Middleware**: Sollte ein Expired-Demo-Read-Only-Mode als eigenes Middleware (`blockIfDemoExpired`) oder als Erweiterung von `tenantProcedure` umgesetzt werden? Heute verarbeitet `tenantProcedure` keine Write/Read-Unterscheidung — kein Middleware im gesamten Codebase liest `opts.type` oder `.meta()` (verifiziert per Grep). Eine Read/Write-Unterscheidung müsste neu eingeführt werden, entweder (a) über `opts.type`-Checks im Middleware oder (b) über `.meta({ readOnly: true })`-Annotations pro Procedure oder (c) über zwei separate Procedure-Bases (`demoReadProcedure` / `demoWriteProcedure`).
2. **`is_demo`-Filter-Zentralisierung**: Wo genau soll der `getBillableTenants()` Helper leben? Heute fragt **nur** die Cron-Infrastruktur mit `isActive` filter — es gibt keine billbaren Aggregations-Endpunkte, die gefiltert werden müssten. Der Filter wird erst relevant wenn Subscription/Billing-Infrastruktur dazukommt.
3. **Seed-Templates als TS-Factories**: Da es heute keine Factory-Funktionen gibt (alles SQL), wäre ein `prisma/seeds/demo/*.ts` ein neues Pattern — oder SQL-Templates wie `supabase/seed.sql` als Basis genommen werden?
4. **User-Anlage für Demo-Admin**: Braucht es einen **neuen Codepfad** der `supabase.auth.admin.createUser` + `generateLink` aufruft? Heute existiert das nirgendwo im Service-Layer (nur `auth.admin.updateUserById` in `users-service.ts:328` für `changePassword`). **Wichtig — dieser Code-Pfad fehlt nicht nur für Demo-Tenants, sondern grundsätzlich**: siehe "Login Gap" in Abschnitt 7 — kein tRPC-User-Create-Flow produziert heute einen einloggbaren User. Die Memory-Note über "login auto-backfill" ist bereits korrigiert (verifiziert per Git-History: kein solcher Code-Pfad hat je existiert).
5. **Demo-Module-Default**: Welche Module sollen bei Demo-Tenant-Create auto-enabled werden? Heute wird bei Tenant-Create **kein** Modul aktiviert (verifiziert in Router und Service Create-Pfaden, siehe Abschnitt 6) — `"core"` funktioniert nur über Short-Circuits in `hasModule`, nicht über einen DB-Row.
6. **Cron-Expiration-Integration**: Ein neuer `cron/expire-demo-tenants/route.ts` würde dem bestehenden Pattern folgen (`Authorization: Bearer <CRON_SECRET>`, `CronCheckpoint`, `maxDuration: 300`). Timing und Frequenz offen.
7. **Nicht-Implementierung Platform-Admin**: Das Demo-Tenant-Konzept beschreibt eine "Admin-Action" für Demo-Tenant-Create. Heute gibt es keine Platform-Admin-Rolle — der Create-Flow würde über `tenants.manage` (bereits vorhanden) oder eine neue separate Permission laufen.
8. **Sequenzierung Login-Gap-Fix vs. Demo-Tenant-Plan**: Soll die User-Creation-Lücke (fehlender Supabase-Auth-Call in `userService.create`, akzeptiertes-aber-ignoriertes `password?`-Input, fehlende Invite/Reset-Link-Generation) als **eigenständiges Vorab-Ticket** behandelt werden, oder als Teil des Demo-Tenant-Plans? Die Lücke betrifft jede tRPC-basierte User-Anlage, nicht nur Demo-Tenants — sie ist aber Blocker für den Demo-Admin-Anlage-Flow, der im Konzept-Dokument unter "Admin-Action: Demo-Tenant anlegen, Schritt 4" beschrieben ist ("Admin-User für Interessent anlegen + Passwort-Reset-Link generieren"). Reine Feststellung — die Sequenzierung ist ein Planungsentscheid.
9. **Aufräumen von `tenant-service.ts` Dead Code**: Der Service wird heute von niemandem aufgerufen (verifiziert per Grep, Abschnitt 4). Der Demo-Tenant-Create-Flow muss entscheiden, ob er (a) dem Router-Inline-Pattern folgt (und die Duplikation verschärft), (b) den Service reaktiviert und den Router darauf umstellt, oder (c) die Logik gemäß dem sonst üblichen Service+Repository+Router-Pattern komplett neu zieht. Reine Feststellung — die Duplikation existiert unabhängig vom Demo-Tenant-Thema.
