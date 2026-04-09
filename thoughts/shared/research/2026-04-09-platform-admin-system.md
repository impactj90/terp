---
date: 2026-04-09T10:02:23+02:00
researcher: impactj90
git_commit: 8d1aac8961be4ac2e323822fe437ae7b00c55bc8
branch: staging
repository: terp
topic: "Platform-Admin-System — as-is codebase integration points"
tags: [research, codebase, platform-admin, auth, tenants, audit-log, supabase, impersonation, subdomain, mfa, rate-limit, dsgvo]
status: complete
last_updated: 2026-04-09
last_updated_by: impactj90
---

# Research: Platform-Admin-System — bestehende Auth-/Tenant-/Admin-Infrastruktur als Integrationsgrundlage

**Date**: 2026-04-09T10:02:23+02:00
**Researcher**: impactj90
**Git Commit**: 8d1aac8961be4ac2e323822fe437ae7b00c55bc8
**Branch**: staging
**Repository**: terp

## Research Question

Wie sieht die bestehende Auth-, Tenant-, Admin-, Audit-Log-, Session- und Routing-Infrastruktur im terp-Codebase heute aus — als Grundlage für die spätere Planung eines **Platform-Admin-Systems** (separate Domäne oberhalb der Tenant-Welt, eigene `PlatformUser`-Tabelle, eigene Auth, eigene Session, 2FA, Impersonation mit Einwilligung und Audit, eigener Admin-Bereich auf `admin.terp.de` oder `/admin`)?

Das Konzept-Dokument (siehe Argumente des `/research_codebase`-Aufrufs) ist der Input; das Ziel dieser Recherche ist es **nur**, den Ist-Zustand zu dokumentieren, an den ein Platform-Admin-System andocken würde — keine Bewertung, keine Empfehlungen.

## Summary

Der terp-Codebase ist durchgängig als **Single-Domain Multi-Tenant-App** gebaut: ein Supabase-Auth-Projekt, eine `public.users`-Tabelle, ein tRPC-Context-Factory, ein API-Route-Handler, ein `appRouter`, eine sidebar-basierte Admin-UI innerhalb der `(dashboard)`-Route-Group. Eine zweite Sicherheits-/User-Domäne existiert nirgends. Konkret:

- **Auth ist hard-wired auf `public.users`**: `createTRPCContext` (`src/trpc/init.ts:103`) macht `prisma.user.findUnique({ where: { id: supabaseUser.id } })` — die Supabase `auth.users`-UUID wird direkt als PK für `public.users` verwendet. Es gibt keine Abstraktion, die ein zweites User-Modell zulassen würde.
- **Keine Routing-Trennung**: Es gibt genau eine tRPC-Route (`src/app/api/trpc/[trpc]/route.ts`), einen `appRouter` mit ~71 Sub-Routern, eine `(dashboard)`-Route-Group und eine `(auth)`-Route-Group. Keine Subdomain-Behandlung in `next.config.ts`, `vercel.json`, `src/proxy.ts` oder `src/middleware.ts`. `vercel.json` enthält **nur** Cron-Definitionen, keine `rewrites`/`headers`.
- **Keine MFA/2FA** im gesamten Code: 0 Vorkommen von `mfa`, `totp`, `webauthn`, `passkey`, `enrollFactor`, `aal` in `src/` und `supabase/`. Password-Policy = `z.string().min(8).max(128)` ohne Komplexitätsregeln oder Pwned-Checks.
- **Keine Rate-Limiting-Middleware** für Login/Mutations. Einziges rate-limiting: domain-spezifisch im `ai-assistant-service.ts` über eine DB-Counter-Tabelle. Kein `@upstash/ratelimit`, kein Redis, kein IP-Whitelisting, kein CORS-Konfig, keine CSP-Header.
- **Audit-Log-Infrastruktur ist vollständig und wiederverwendbar**: `AuditLog`-Prisma-Modell (`prisma/schema.prisma:2883`), Service `src/lib/services/audit-logs-service.ts` mit `log()` und `computeChanges()`, Repository, Router `src/trpc/routers/auditLogs.ts`, Viewer-UI unter `/admin/audit-logs`. **Alle** Einträge sind aber `tenantId String` (non-null) — ein Platform-Level-Audit-Log ohne `tenantId` würde nicht in dieses Schema passen. Das bestehende Modell hat auch keine `performedBy`-Kolumne für Platform-User (nur `userId` → `public.users`).
- **Supabase Admin API ist fast ungenutzt**: Genau **zwei** Call-Sites in der gesamten Codebase verwenden `supabase.auth.admin.*`: `users-service.ts:329` (`updateUserById` für Passwort-Change) und `auth-service.ts:62` (`signOut` für Server-Logout). **Kein** `createUser`, `generateLink`, `inviteUserByEmail`, `deleteUser`, `listUsers`. User-Anlage läuft via direktem Prisma-Insert ohne parallelen `auth.users`-Write; nur der Trigger `handle_new_user` synchronisiert bei externen Inserts.
- **Bestehender Admin-Bereich** unter `src/app/[locale]/(dashboard)/admin/` enthält 42 Seiten (users, tenants, settings, audit-logs, etc.), die alle über `requirePermission(KEY)` geschützt sind. Es gibt keinen `adminProcedure`-Factory und keine separate Platform-Admin-Rolle. "Admin" = `UserGroup.isAdmin` Flag oder `User.role === "admin"`.
- **Tenant-Modell** (`prisma/schema.prisma:94-163`) hat keine `supportAccessEnabled`/`supportAccessExpiresAt`-Felder. Tenant-Zugriffskontrolle läuft ausschließlich über `user_tenants` + in-memory Scan in `tenantProcedure` (`src/trpc/init.ts:210-238`).
- **Prior Art**: `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` existiert (unimplementiert). Es beschreibt einen **einfacheren** Ansatz: `platform_admins`-Tabelle mit `user_id` als Flag auf `auth.users`, Tenant-Switcher im Header, Read-only-Modus als Default, Bypass von `user_tenants`-Check. **Das aktuelle Konzept dieses Research-Inputs ist strikter**: eigene `PlatformUser`-Tabelle (nicht Flag), keine Aufweichung der Tenant-Isolation, Impersonation nur mit expliziter Einwilligung. Die beiden Ansätze sind inkompatibel miteinander.
- **Das Demo-Tenant-Research** (`thoughts/shared/research/2026-04-09-demo-tenant-system.md`, vom selben Tag) deckt Tenant-Modell, `tenantProcedure`, Tenant-CRUD, Modul-Aktivierung, User-Creation-Flow, Permission-System, Seeds und Cron detailliert ab. Diese Recherche **baut darauf auf** und fokussiert auf die für Platform-Admin zusätzlich relevanten Punkte: Audit-Log, Supabase-Admin-API, Subdomain-Routing, Session-/MFA-/Rate-Limit-Infra, Admin-UI-Struktur, Prior-Art-Ticket.

## Detailed Findings

### 1. tRPC Auth Infrastructure (Single-Domain-Architektur)

**`src/trpc/init.ts:61-144`** — `createTRPCContext`
- Liest `authorization` und `x-tenant-id` aus Headers oder SSE `connectionParams` (67-79)
- Erstellt **inline** einen Service-Role-Supabase-Client (87-93), `autoRefreshToken: false, persistSession: false`
- Validiert Token via `supabase.auth.getUser(authToken)` (96-99)
- Harter Lookup: `prisma.user.findUnique({ where: { id: supabaseUser.id }, include: { userGroup, userTenants: { include: { tenant } } } })` (103-111)
- User wird nur gesetzt wenn `dbUser.isActive !== false && !dbUser.isLocked` (113)
- Baut minimales `Session`-Objekt `{ access_token, user: supabaseUser }` (116-119)
- Extrahiert `ipAddress` aus `x-forwarded-for` (first value) oder `x-real-ip` (129-132), `userAgent` aus `user-agent` (133)
- Rückgabe: `{ prisma, authToken, user, session, tenantId, ipAddress, userAgent }` (135-143)

**Schlüssel-Annahme**: Zeile 103 hard-coded den Prisma-Lookup auf `prisma.user`. Ein zweites User-Modell kann nur durch einen **zweiten Context-Factory** eingeführt werden — nicht durch eine Erweiterung dieses.

**`src/trpc/init.ts:179`** — `publicProcedure` = `t.procedure`
**`src/trpc/init.ts:185-200`** — `protectedProcedure` checkt `!ctx.user || !ctx.session` → throws `UNAUTHORIZED`
**`src/trpc/init.ts:210-238`** — `tenantProcedure`:
1. Throws `FORBIDDEN "Tenant ID required"` wenn `ctx.tenantId` fehlt
2. In-memory-Scan `ctx.user.userTenants.some(ut => ut.tenantId === ctx.tenantId)` — wirft `FORBIDDEN "Access to tenant denied"` wenn kein Match

**Kein `adminProcedure`**. Admin-only-Procedures komponieren manuell: `protectedProcedure.use(requirePermission(TENANTS_MANAGE))`.

**`src/app/api/trpc/[trpc]/route.ts`** — EINE Next.js-Route, `fetchRequestHandler` mit `router: appRouter`, `createContext: createTRPCContext`. `GET` und `POST` über denselben Handler. Keine Path-basierte Dispatch-Logik.

**`src/trpc/routers/_app.ts`** — Ein `appRouter` mit ~71 gemergten Sub-Routern. Ein `AppRouter`-Typ-Export. Ein `createCaller` für Server-Side-Calls.

**`src/trpc/client.tsx:70-132`** — `TRPCReactProvider`
- `getHeaders()` (80-99): liest `supabase.auth.getSession()` → setzt `authorization`; liest `tenantIdStorage.getTenantId()` → setzt `x-tenant-id`
- `splitLink` auf `op.type === "subscription"`:
  - Subscriptions: `httpSubscriptionLink` mit `connectionParams` (weil SSE keine Custom-Header kann)
  - Queries/Mutations: `httpBatchLink` mit `headers: getHeaders`
- Alle Requests gehen auf dieselbe URL `/api/trpc`

**`src/lib/storage.ts:42-67`** — `tenantIdStorage` via `localStorage["tenant_id"]`. Die einzige Tenant-Identity-Quelle im Browser.

### 2. Supabase Clients und Session-Handling

Vier Client-Factories unter `src/lib/supabase/`:

- **`admin.ts`** — `createAdminClient()`: Service-Role-Key, `autoRefreshToken: false, persistSession: false`. Bypasst RLS. Wird **nur** in 2 Service-Dateien genutzt.
- **`client.ts`** — `createBrowserClient()` von `@supabase/ssr`, Anon-Key. Browser-Session via Cookies. Wird in `src/trpc/client.tsx` und allen Client-Komponenten genutzt.
- **`server.ts`** — `createServerClient()` von `@supabase/ssr`, Anon-Key, Cookie-basiert. Für Server Components / Route Handlers.
- **`middleware.ts`** — `updateSession()`: in jedem Request aufgerufen (siehe `src/proxy.ts`), ruft `supabase.auth.getUser()` zum Cookie-Refresh.

**`src/trpc/init.ts:87-93`** konstruiert **inline** einen weiteren Service-Role-Client statt `createAdminClient()` zu nutzen (Duplikation).

**Session-Timeout-Konfiguration**:
- `.env:10` — `JWT_EXPIRY=24h` (vom Next.js-Code nicht konsumiert; Supabase-Dashboard-Setting)
- `src/providers/auth-provider.tsx:115` — `staleTime: 5 * 60 * 1000` (5 Min tRPC-Query-Cache für `auth.me`)
- `supabase/config.toml` enthält **keine** `jwt_expiry`/`session_timebox`/`refresh_token_rotation`-Settings — alles wird im Supabase-Cloud-Dashboard konfiguriert

**Supabase Admin API Calls — vollständige Liste**:
1. `src/lib/services/auth-service.ts:62` — `adminClient.auth.admin.signOut(accessToken)` (Server-Side-Logout)
2. `src/lib/services/users-service.ts:329` — `adminClient.auth.admin.updateUserById(userId, { password: newPassword })` (nur in `changePassword`)

**Kein** `createUser`, `generateLink`, `inviteUserByEmail`, `deleteUser`, `listUsers` irgendwo im Code. User-Anlage via `users.create` tRPC schreibt **nur** in `public.users` + `user_tenants`; der `password`-Parameter im Input-Schema wird **akzeptiert und verworfen** (siehe `users-service.ts:60-135`).

**`supabase/migrations/20260101000002_handle_new_user_trigger.sql`** — AFTER INSERT Trigger auf `auth.users` → Insert in `public.users` (kopiert `id`, `email`, setzt `username=email`, `display_name`, `role='user'`, `is_active=true`). Feuert nur bei externen Inserts (Supabase Dashboard / Admin API), nicht vom App-Code.

### 3. Auth-Pages und Middleware

**`src/proxy.ts`** — Next.js-Middleware-Entry (nicht `src/middleware.ts`):
- Chain: `updateSession(request)` → `createIntlMiddleware(routing)`
- `config.matcher = '/((?!api|trpc|_next|_vercel|.*\\..*).*)'` — schließt API/tRPC/Statics aus
- **Keine** Redirect-Logik, **keine** Route-Guard-Prüfung, **keine** Subdomain-Behandlung
- Unauthenticated-Redirects laufen erst client-side via `src/components/auth/protected-route.tsx`

**Auth-Pages** unter `src/app/[locale]/(auth)/`:
- `login/page.tsx` — ruft client-side `supabase.auth.signInWithPassword()` (Zeile 41, 72). Enthält Links zu `/forgot-password` und `/register`, die **beide nicht existieren**
- `layout.tsx` — zentriertes `max-w-md`-Layout

Es gibt **keinen** serverseitigen Login-Handler, kein `forgot-password`, `reset-password`, `register`, `invite`, `auth/callback` Page.

### 4. Admin-Routes und UI-Struktur

**`src/app/[locale]/(dashboard)/admin/`** — 42 Seiten, flach (ein Verzeichnis pro Feature + einige `[id]`-Subpaths):

tenants, users, user-groups, audit-logs, settings, access-control, approvals, calculation-rules, accounts, contact-types, cost-centers, day-plans, departments, dsgvo, email-settings, employee-messages, employees, employment-types, evaluations, export-interfaces, export-templates (new), payroll-wages (new), holidays, locations, macros, monthly-evaluations, monthly-values, orders, payroll-exports, reports, schedules, shift-planning, tariffs, teams, terminal-bookings, vacation-balances, vacation-config, week-plans, absence-types, billing-config, booking-types, correction-assistant.

**`src/app/[locale]/(dashboard)/layout.tsx`** — Wrapper-Kette: `ProtectedRoute` → `TenantProvider` → `TenantGuard` → `AppLayout`. Jede Admin-Seite erbt diese ganze Kette und braucht einen gewählten Tenant.

**`src/app/[locale]/layout.tsx`** — Root-Locale-Layout mit `NextIntlClientProvider`, `ThemeProvider`, `TRPCReactProvider`, `AuthProvider`.

**Kein separater Route-Group-Kandidat** für Platform-Admin: Es gibt nur `(dashboard)` und `(auth)`. Ein `(platform)`/`(superadmin)`/`(admin-panel)` existiert nicht.

**Sidebar-Navigation**: `src/components/layout/sidebar/sidebar-nav-config.ts` (Admin-Section ab Zeile ~505) definiert die Einträge für `/admin/*`-Pages. Rendert via `sidebar-nav.tsx`, zusammengesetzt in `src/components/layout/app-layout.tsx`.

**i18n-Setup** (`src/i18n/routing.ts`): `locales: ['de', 'en']`, `defaultLocale: 'de'`, `localePrefix: 'as-needed'`. Alle Pages liegen unter `src/app/[locale]/`.

**`next.config.ts`** — minimal:
```ts
const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
}
export default withNextIntl(nextConfig)
```
**Keine** `rewrites`, `headers`, `redirects`, `matcher`. Keine CSP. Keine CORS.

**`vercel.json`** — nur `crons: [...]` (9 Einträge), keine `rewrites`/`headers`/`functions`/`regions`/`env`.

### 5. Existierende Permission- und Authorization-Middleware

**`src/lib/auth/permission-catalog.ts`** — 158 `Permission`-Objekte, deterministisch generiert via UUID v5 aus Key-Strings. Relevante System-Admin-Keys: `users.manage`, `tenants.manage`, `settings.manage`, `audit_log.export` (neu).

**`src/lib/auth/permissions.ts`**:
- `resolvePermissions(user)` (26): Admin-Flag → leer, sonst JSONB-Array
- `isUserAdmin(user)` (56): `user.userGroup?.isAdmin || user.role === "admin"`
- `hasPermission(user, id)` (73-93): Admin-Bypass, JSONB-Array-Check, Key-String-Fallback via `lookupPermission`

**`src/lib/auth/middleware.ts`**:
- `requirePermission(...ids)` (39-58) — OR, throws FORBIDDEN
- `requireSelfOrPermission(getter, id)` (72-108)
- `requireEmployeePermission(getter, own, all)` (124-191) — Admin-Bypass, Team-Check
- `applyDataScope()` (218-233) — hängt `ctx.dataScope` an

**Admin-Erkennung heute** = `UserGroup.isAdmin` **oder** `User.role === "admin"`. Kein separates Platform-Admin-Konzept.

### 6. Audit-Log-Infrastruktur

**Prisma Model**: `prisma/schema.prisma:2883` — `model AuditLog`
```
id, tenantId (String, non-null), userId (String?), action, entityType, entityId,
entityName?, changes (Json?), metadata (Json?), ipAddress?, userAgent?, performedAt
@@index([tenantId, ...]), @@index([userId, ...]), @@index([entityType, entityId])
```

**Wichtig**: `tenantId` ist **non-null**. Ein Platform-Level-Audit (z.B. "Tenant XYZ created by PlatformUser abc") passt **nicht** in dieses Schema ohne Modification — entweder `tenantId` nullable machen oder eine separate `PlatformAuditLog`-Tabelle einführen (wie das Konzept vorschlägt).

**Service**: `src/lib/services/audit-logs-service.ts`
- `log(prisma, data: AuditLogCreateInput)` (168-182) — **fire-and-forget**, fängt alle Errors intern, `console.error` bei Fehler, wirft nie
- `logBulk(prisma, data[])` (190-203) — Batch via `createMany`
- `computeChanges(before, after, fieldsToTrack?)` (104-125) — normalisiert Date/Decimal/undefined, deep-equal, returns `{ field: { old, new } } | null`
- `list(prisma, tenantId, params?)` (60-76) — mit `count` parallel
- `getById(prisma, tenantId, id)` (78-90) — wirft `AuditLogNotFoundError`

**Callers**: ~131 Service-Dateien importieren `audit-logs-service` und rufen `log()`/`computeChanges()`. Auch **inline im Router**: `src/trpc/routers/tenants.ts:344, 495, 500, 566` — die einzige Stelle, wo der Tenant-Router direkt `auditLog` aufruft (weil der Service-Layer dort nicht genutzt wird).

**Router**: `src/trpc/routers/auditLogs.ts` — registriert in `_app.ts` als `auditLogs`
**Hook**: `src/hooks/use-audit-logs.ts`
**Viewer-UI**: `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` + `src/components/audit-logs/*` (data-table, detail-sheet, json-diff, filters, skeleton)
**PDF Export**: `src/lib/pdf/audit-log-export-pdf.tsx`
**Service**: `src/lib/services/audit-log-export-service.ts`

**Migrations**:
- `supabase/migrations/20260101000041_create_audit_logs.sql` — Tabellenanlage
- `supabase/migrations/20260322201658_add_hot_path_composite_indexes.sql` — Indizes
- `supabase/migrations/20260415100000_add_audit_log_export_permission.sql` — Export-Permission

### 7. Rate-Limiting / MFA / Security-Hardening

**Rate-Limiting**: **Kein** globales Rate-Limiting. Einziger Treffer:
- `src/lib/services/ai-assistant-service.ts:26, 86, 101, 139, 231` — `AiAssistantRateLimitError` via DB-Counter (nicht Redis/Upstash)
- Gefangen in `src/trpc/routers/aiAssistant.ts:64` und `src/app/api/ai-assistant/route.ts:125`

**MFA / 2FA / WebAuthn / TOTP / Passkey / AAL**: **Null Vorkommen** im gesamten `src/` und `supabase/`. Supabase MFA ist weder aktiviert noch im Code abgefragt.

**Password-Policy**:
- `src/trpc/routers/users.ts:87, 124` — `z.string().min(8).max(128)` (keine Komplexitätsregeln)
- `src/components/users/user-form-sheet.tsx:87-88` — UI-Check `< 8`
- `src/components/users/change-password-dialog.tsx:89-93` — UI-Check + Confirm-Match

**IP-Whitelisting / IP-Blocking**: **Null** Vorkommen (keine `allowlist`, `whitelist`, `blocklist`, IP-Gate).

**CSP / Content-Security-Policy**: **Keine** Header-Konfiguration irgendwo (weder `next.config.ts`, `vercel.json`, Middleware, Route-Handlers).

**CORS**: **Keine** Konfiguration. `src/app/api/trpc/[trpc]/route.ts` ruft `fetchRequestHandler` ohne `cors`-Option auf.

### 8. Subdomain-Routing

**Null Vorkommen** von `subdomain`, `hostname`, `host.includes`, `request.headers.get('host')` in `src/`. Der Next.js-Middleware-Entry (`src/proxy.ts`) macht keine Host-basierte Dispatch.

Für eine `admin.terp.de`-Trennung ist weder ein `middleware.ts`-Check auf `request.nextUrl.hostname` noch eine `next.config.ts`-`rewrites`-Regel vorhanden — das müsste neu gebaut werden.

### 9. Prior Art: `platform-admin-tenant-access.md`

**Datei**: `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` (unimplementiert)

Was das Ticket beschreibt:
1. **Datenmodell**: `platform_admins (user_id PK → auth.users, created_at, created_by)` — Flag-Tabelle neben `public.users`, KEIN separates User-Modell
2. **Tenant-Switcher UI**: Dropdown im Header, nur für Platform-Admins sichtbar
3. **Read-Only-Modus (Default)**: Platform-Admin sieht alle Daten, kann default nichts ändern; optionaler "Write-Mode" mit expliziter Bestätigung
4. **Audit-Logging**: Jeder Zugriff wird in `platform_admin_access_log (id, user_id, tenant_id, action 'switch'|'view'|'write', metadata, created_at)` geloggt
5. **Impersonation-Banner**: "Du siehst Mandant XYZ als Platform-Admin"
6. **Middleware**: `isPlatformAdmin()` in `src/lib/auth/` — Bypass des `user_tenants`-Check mit Logging
7. **DSGVO-Passagen**: AVV-Ergänzung, Art. 6 Abs. 1 lit. b/f, Zweckbindung, Read-only als Datensparsamkeit, Audit-Trail

**Inkompatibilität zum aktuellen Konzept**:
| Aspekt | Ticket (2025-?) | Neues Konzept (2026-04) |
|---|---|---|
| User-Modell | Flag-Tabelle `platform_admins` auf `auth.users` | Eigene `PlatformUser`-Tabelle mit eigenem PasswordHash |
| Auth | Teilt Supabase-Auth-Session mit Tenant-World | **Eigene Auth-Domäne**, eigene Session |
| Zugriff | Bypass `user_tenants`-Check (Super-User-Lesemodus) | **Kein** Bypass — nur via Impersonation mit Einwilligung |
| Default-Mode | Read-only auf allem | Null Zugriff ohne vorherige Einwilligung |
| Consent-Workflow | Nicht vorgesehen | Pflichtfeld `reason`, `consentType`, `consentReference` |
| Subdomain | Keine | `admin.terp.de` oder `/admin` als eigene Route |
| 2FA | Nicht vorgesehen | Zwingend für alle `PlatformUser` |

### 10. Demo-Tenant-Research (Vorarbeit vom selben Tag)

`thoughts/shared/research/2026-04-09-demo-tenant-system.md` deckt bereits detailliert ab:
- Tenant Data Model + `TenantModule`
- `tenantProcedure` Middleware + In-Memory-Scan
- Tenant-CRUD-Flow mit Service-Router-Duplikation
- User-Creation-Flow (kein Supabase-Admin-API-Write)
- Permission-System
- Seed-Infrastruktur (`supabase/seed.sql`, 4400+ Zeilen, keine TS-Factories)
- Cron-Infrastruktur (9 Routes, 6 davon iterieren Tenants)
- Metriken (**kein** `prisma.tenant.count`, **kein** MRR/ARR-Code, **kein** Subscription-Billing)
- Tenant-Admin-UI unter `/admin/tenants`

Diese Research-Datei **ergänzt** das Demo-Tenant-Research um die Platform-Admin-spezifischen Integrationspunkte (Audit-Log, Supabase-Admin-API, Subdomain, Admin-Routes, MFA, Rate-Limit, Prior-Art-Ticket).

## Code References

### tRPC Auth Core
- `src/trpc/init.ts:28-31` — `ContextUser` (`PrismaUser & { userGroup, userTenants }`)
- `src/trpc/init.ts:39-53` — `TRPCContext` type
- `src/trpc/init.ts:61-144` — `createTRPCContext` (Header parse, Supabase validate, Prisma lookup)
- `src/trpc/init.ts:87-93` — Inline Service-Role-Client (statt `createAdminClient`)
- `src/trpc/init.ts:103-111` — **Harter** Prisma-User-Lookup (blockiert zweite User-Domäne)
- `src/trpc/init.ts:179` — `publicProcedure`
- `src/trpc/init.ts:185-200` — `protectedProcedure`
- `src/trpc/init.ts:210-238` — `tenantProcedure` + in-memory `userTenants`-Scan
- `src/app/api/trpc/[trpc]/route.ts` — einzige tRPC-Route, `fetchRequestHandler`
- `src/trpc/routers/_app.ts` — einziger `appRouter`
- `src/trpc/client.tsx:70-148` — `TRPCReactProvider`, `getHeaders`, splitLink

### Supabase Clients & Sessions
- `src/lib/supabase/admin.ts` — `createAdminClient()` (service role)
- `src/lib/supabase/client.ts` — `createBrowserClient()` (anon)
- `src/lib/supabase/server.ts` — `createServerClient()` (anon, cookies)
- `src/lib/supabase/middleware.ts:37` — `updateSession()` Refresh
- `src/proxy.ts` — Next.js middleware (chains `updateSession` + `next-intl`)
- `src/lib/services/auth-service.ts:62` — einziger `admin.signOut`
- `src/lib/services/users-service.ts:329` — einziger `admin.updateUserById`
- `src/providers/auth-provider.tsx:82, 115, 120` — browser session lifecycle
- `src/lib/storage.ts:42-67` — `tenantIdStorage`
- `supabase/migrations/20260101000002_handle_new_user_trigger.sql` — `handle_new_user` trigger
- `src/app/[locale]/(auth)/login/page.tsx:41, 72` — client-side `signInWithPassword`
- `src/app/[locale]/(auth)/layout.tsx` — auth layout

### Admin Routes & UI
- `src/app/[locale]/(dashboard)/admin/` — 42 Admin-Pages (flach + einige `[id]`)
- `src/app/[locale]/(dashboard)/admin/tenants/page.tsx` — existierende Tenant-Liste
- `src/app/[locale]/(dashboard)/admin/users/page.tsx`
- `src/app/[locale]/(dashboard)/admin/user-groups/page.tsx`
- `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx`
- `src/app/[locale]/(dashboard)/admin/settings/page.tsx`
- `src/app/[locale]/(dashboard)/layout.tsx` — `ProtectedRoute → TenantProvider → TenantGuard → AppLayout`
- `src/app/[locale]/layout.tsx` — Root locale layout
- `src/components/layout/sidebar/sidebar-nav-config.ts` — Sidebar-Config (Admin-Section)
- `src/components/layout/sidebar/sidebar-nav.tsx`
- `src/components/layout/app-layout.tsx`
- `src/components/auth/protected-route.tsx` — client-side Guard
- `src/components/auth/tenant-guard.tsx` — Tenant-Selection-Guard
- `next.config.ts` — minimal, keine rewrites/headers
- `vercel.json` — nur `crons`
- `src/i18n/routing.ts` — i18n-Konfiguration (`locales: ['de', 'en']`, `as-needed`)

### Permission & Authorization
- `src/lib/auth/permission-catalog.ts` — 158 Permissions
- `src/lib/auth/permissions.ts:26, 56, 73-93` — `resolvePermissions`, `isUserAdmin`, `hasPermission`
- `src/lib/auth/middleware.ts:39-58, 72-108, 124-191, 218-233` — `requirePermission`, `requireSelfOrPermission`, `requireEmployeePermission`, `applyDataScope`
- `src/hooks/use-has-permission.ts`
- `prisma/schema.prisma:1111-1135` — `UserGroup` (`permissions: Json`, `isAdmin: Boolean`)

### Audit Log Infrastructure
- `prisma/schema.prisma:2883` — `model AuditLog` (`tenantId` **non-null**)
- `src/lib/services/audit-logs-service.ts:60-76` — `list`
- `src/lib/services/audit-logs-service.ts:78-90` — `getById` + `AuditLogNotFoundError`
- `src/lib/services/audit-logs-service.ts:104-125` — `computeChanges`
- `src/lib/services/audit-logs-service.ts:168-182` — `log` (fire-and-forget)
- `src/lib/services/audit-logs-service.ts:190-203` — `logBulk`
- `src/lib/services/audit-logs-repository.ts`
- `src/lib/services/audit-log-export-service.ts`
- `src/trpc/routers/auditLogs.ts`
- `src/trpc/routers/tenants.ts:344, 495, 500, 566` — inline Audit-Calls im Router
- `src/hooks/use-audit-logs.ts`
- `src/components/audit-logs/audit-log-data-table.tsx`
- `src/components/audit-logs/audit-log-detail-sheet.tsx`
- `src/components/audit-logs/audit-log-json-diff.tsx`
- `src/components/audit-logs/audit-log-filters.tsx`
- `src/lib/pdf/audit-log-export-pdf.tsx`
- `supabase/migrations/20260101000041_create_audit_logs.sql`
- `supabase/migrations/20260322201658_add_hot_path_composite_indexes.sql`
- `supabase/migrations/20260415100000_add_audit_log_export_permission.sql`

### MFA / Rate-Limit / Security (nicht vorhanden)
- `src/lib/services/ai-assistant-service.ts:26, 86, 101, 139, 231` — einziges rate limiting (DB-Counter, domain-specific)
- `src/trpc/routers/users.ts:87, 124` — `z.string().min(8).max(128)` (keine Komplexität)

### Tenant Model & Middleware
- `prisma/schema.prisma:94-163` — `model Tenant` (ohne `supportAccess*` Felder)
- `prisma/schema.prisma:271-284` — `model TenantModule`
- `prisma/schema.prisma:1144-1157` — `model UserTenant`
- `supabase/migrations/20260101000085_create_user_tenants.sql`

## Architecture Documentation

### Patterns in Place

**Single Auth Domain**: Eine `public.users`-Tabelle, ein Supabase-Auth-Projekt, ein `createTRPCContext`, ein API-Route-Handler. Alle 71 tRPC-Sub-Router teilen denselben `TRPCContext`-Typ. Der Lookup `prisma.user.findUnique({ where: { id: supabaseUser.id } })` ist die zentrale Annahme, die eine zweite User-Domäne blockiert.

**Tenant-Isolation ohne Bypass**: `tenantProcedure` prüft in-memory gegen `ctx.user.userTenants`. Es gibt keinen Super-User-Bypass. Alle Repository-Calls übergeben `tenantId` explizit (Demo-Tenant-Research Abschnitt 1-2).

**Permission-basierte Admin-Rechte**: "Admin" ist keine Rolle, sondern ein Flag (`UserGroup.isAdmin` oder `User.role === 'admin'`). Platform-wide Actions wie `tenants.manage` / `users.manage` sind Permissions, die normalen Tenant-Usern vergeben werden können.

**Audit-Log ist Tenant-scoped**: `AuditLog.tenantId` ist non-null. Der Service `log()` schluckt Fehler per `console.error`. Das Modell ist optimiert für Tenant-interne Actions — nicht für Plattform-Actions ohne Tenant-Kontext.

**Keine Server-Side Login-Logik**: Login läuft ausschließlich client-side über `supabase.auth.signInWithPassword`. Es gibt keinen Server-Handler, der Login-Attempts rate-limiten oder MFA prüfen könnte. Alle auth.users-Actions laufen über die Supabase-Cloud direkt.

**Route-Group-Struktur**: Nur zwei Route-Groups in `src/app/[locale]/`: `(auth)` und `(dashboard)`. Keine Subdomain-Behandlung, keine Host-basierte Dispatch. Alle Admin-Pages leben innerhalb von `(dashboard)/admin/` und erben den Tenant-Guard.

**Supabase Admin API minimal genutzt**: 2 Call-Sites in der gesamten Codebase. User-Anlage schreibt nicht in `auth.users` — das ist ein bekanntes Gap (auch im Demo-Tenant-Research notiert).

**Keine Security-Hardening-Layer**: Keine CSP, keine CORS, keine Rate-Limits, keine IP-Allowlists, keine MFA, keine IP-Whitelisting. Alles, was der Platform-Admin-Konzept als "zusätzliche Sicherheitsanforderungen" auflistet, existiert heute nicht und müsste komplett neu gebaut werden.

### What Does Not Exist

- `PlatformUser`-Model oder separate User-Tabelle neben `public.users`
- Separater Context-Factory oder zweite tRPC-Route für Platform-Admin
- Subdomain-/Host-basiertes Routing (`admin.terp.de`)
- Impersonation / Support-Session-Modell
- Consent-Flow für Support-Zugriff im Tenant
- `SupportSession`-Tabelle oder Feld `Tenant.supportAccessEnabled`
- Platform-Audit-Log ohne `tenantId`
- 2FA / TOTP / WebAuthn / Passkey in irgendeiner Form
- Rate-Limiting auf Login-Endpunkte oder Mutations
- CSP-Header, CORS-Konfiguration, IP-Whitelisting
- Subscription-/Billing-Plan/MRR-Tracking (`prisma.tenant.count` existiert 0× — siehe Demo-Tenant-Research Abschnitt 11)
- Server-Side-Login-Handler
- `generateLink` / `inviteUserByEmail` / `admin.createUser` Call-Sites
- Bootstrap-Flow für ersten Platform-User (kein Seed, kein CLI-Script)
- Feature-Flag-System / Wartungsmodus / System-weite Banner
- Per-Tenant Default-Module-Aktivierung bei Create (siehe Demo-Tenant-Research Abschnitt 6)

## Historical Context (from thoughts/)

### Prior Art — direktes Thema
- `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` — **Unimplementiertes Ticket** mit einfacherem Ansatz: `platform_admins`-Flag-Tabelle, Tenant-Switcher, Read-only-Modus mit Bypass. **Konzeptionell inkompatibel** mit dem neuen Konzept (separate User-Domäne ohne Bypass).

### Tenant-Infrastruktur (historischer Kontext)
- `thoughts/shared/tickets/ZMI-TICKET-210-tenants-users-usergroups.md` + plan + research (März 2026) — Ursprüngliche Tenant-Router-Implementierung (Go-Port)
- `thoughts/shared/plans/2026-03-03-ZMI-TICKET-210-tenants-users-usergroups.md`
- `thoughts/shared/research/2026-03-03-ZMI-TICKET-210-tenants-users-usergroups.md`
- `thoughts/shared/tickets/ZMI-TICKET-055-system-settings-tenant-admin-ui.md` + plan + research (Februar 2026) — Tenant-Admin-UI und System-Settings
- `thoughts/shared/plans/2026-02-04-ZMI-TICKET-055-system-settings-tenant-admin-ui.md`
- `thoughts/shared/research/2026-02-04-ZMI-TICKET-055-system-settings-tenant-admin-ui.md`
- `thoughts/shared/docs/admin-tenants.md` — Status-Doc (nicht-implementiert-Hinweis, jetzt veraltet)

### Audit-Logging (Bausteine für Platform-Audit-Log)
- `thoughts/shared/tickets/ZMI-TICKET-034-audit-logging.md` — Urspruenglicher Audit-Log-Schema-Entwurf
- `thoughts/shared/tickets/ZMI-TICKET-053-audit-log-viewer-ui.md` — Viewer-UI Ticket
- `thoughts/shared/tickets/ZMI-TICKET-221-systemsettings-auditlogs-notifications.md` — tRPC-Router für Audit-Logs
- `thoughts/shared/plans/2026-02-04-ZMI-TICKET-053-audit-log-viewer-ui.md`
- `thoughts/shared/plans/2026-03-06-ZMI-TICKET-221-systemsettings-auditlogs-notifications.md`
- `thoughts/shared/research/2026-03-06-ZMI-TICKET-221-systemsettings-auditlogs-notifications.md`
- `thoughts/shared/plans/2026-03-20-audit-logging-implementation.md` — Nachzügler: Write-Path-Integration
- `thoughts/shared/research/2026-03-20-audit-logging-setup-analysis.md`
- `thoughts/shared/plans/2026-04-07-audit-protocol-coverage.md` — Coverage-Gap-Fix
- `thoughts/shared/research/2026-04-07-audit-protocol-coverage.md`
- `thoughts/shared/plans/2026-04-08-audit-log-export.md` — Export-Feature
- `thoughts/shared/research/2026-04-08-audit-log-export.md`

### DSGVO / Compliance
- `thoughts/shared/tickets/orgAuftrag/TICKET_SYS_01_DSGVO_LOESCHUNG.md` — Retention-Löschung
- `thoughts/shared/plans/2026-03-27-SYS_01-dsgvo-loeschung.md`
- `thoughts/shared/research/2026-03-27-SYS_01-dsgvo-loeschung.md`
- `thoughts/shared/research/2026-04-02-dsgvo-deletion-analysis.md`

### Production-Readiness / Isolation-Audits
- `thoughts/shared/plans/research/production-readiness-audit-2026-03-11.md`
- `thoughts/shared/plans/2026-03-22-AUDIT-006-tenant-isolation-find-without-tenantid.md` + Siblings AUDIT-001..004

### Demo-Tenant (Parallelarbeit)
- `thoughts/shared/research/2026-04-09-demo-tenant-system.md` — **Direkt verwandte** Recherche vom selben Tag, deckt Tenant-Modell/Middleware/CRUD/Module/User-Creation/Permissions/Seed/Cron detailliert ab

### Keine existierenden Dokumente zu:
- 2FA / MFA / WebAuthn / Passkey
- Rate-Limiting (außer AI-Assistant)
- Subdomain / `admin.terp.de`
- Separate Auth-Domäne
- Feature-Flags / Wartungsmodus
- SaaS-Subscription-Billing / Stripe / MRR / Chargebee
- Pro-Di / ProDi (kein Kontext im Repo)

## Related Research

- `thoughts/shared/research/2026-04-09-demo-tenant-system.md` — Demo-Tenant-System (Parallelarbeit, deckt Tenant-Infrastruktur ab)
- `thoughts/shared/research/2026-03-20-audit-logging-setup-analysis.md` — Audit-Log-Write-Path-Analyse
- `thoughts/shared/research/2026-04-07-audit-protocol-coverage.md` — Audit-Coverage-Analyse
- `thoughts/shared/research/2026-04-08-audit-log-export.md` — Audit-Log-Export-Research
- `thoughts/shared/research/2026-03-22-AUDIT-006-tenant-isolation-find-without-tenantid.md` — Tenant-Isolation-Audit
- `thoughts/shared/research/2026-03-03-ZMI-TICKET-210-tenants-users-usergroups.md` — Ursprüngliche Tenant-CRUD-Migration

## Open Questions

Diese Fragen sind für die **Planungsphase** des Platform-Admin-Systems relevant und wurden durch die Recherche nicht automatisch beantwortet, sondern nur umrahmt:

1. **Zweiter tRPC-Context vs. erweiterter Context**: Soll Platform-Admin einen komplett **zweiten** `createPlatformTRPCContext` + zweite API-Route (`/api/trpc-platform/[trpc]/route.ts`) + zweiten `platformAppRouter` bekommen? Oder ein zweiter Branch im bestehenden Context-Factory (discriminated union `ctx.actor: { type: 'tenantUser', ... } | { type: 'platformUser', ... }`)? Heute ist die gesamte Infrastruktur single-domain.

2. **Platform-Auth-Quelle**: Eigenes Supabase-Auth-Projekt (zweite Instanz) oder eigene Credentials-Tabelle mit bcrypt/argon2 in `public.platform_users`? Die terp-App hat heute **keine** eigene Passwort-Hashing-Infrastruktur — alle Passwörter liegen in Supabase `auth.users`.

3. **Admin-Subdomain**: `admin.terp.de` vs. `app.terp.de/admin` — heute gibt es keinerlei Subdomain-Behandlung. Subdomain erfordert `middleware.ts`-Check auf `request.nextUrl.hostname`, ggf. Vercel-Domain-Config, und eine zweite Route-Group `(platform)` parallel zu `(dashboard)`/`(auth)`.

4. **Platform-Audit-Log-Schema**: `AuditLog.tenantId` ist non-null. Neue separate Tabelle `PlatformAuditLog` (wie im Konzept) oder `tenantId` nullable machen und Event-Types unterscheiden? Letzteres würde alle 131 bestehenden Caller-Stellen nicht brechen.

5. **MFA-Implementation**: Supabase MFA (wenn weiterhin Supabase-Auth) oder eigene TOTP-Lib (`otpauth`, `speakeasy`) wenn eigene User-Tabelle? Heute existiert **keine einzige** Zeile MFA-Code im Repo.

6. **Impersonation-Flow zur Tenant-Welt**: Das Konzept sagt "PlatformUser wird im Tenant als 'Support (Tolga)' eingeblendet". Wie wird das in `ctx.user` repräsentiert — als synthetic-injected `ContextUser` mit `SupportSession`-Ref? `tenantProcedure`'s `userTenants`-Scan müsste erweitert werden (oder umgangen werden mit zusätzlicher Consent-Prüfung).

7. **Tenant-Side-Consent-UI**: Wo lebt die "Support-Zugriff für 60 Minuten freigeben"-Schaltfläche? Unter `(dashboard)/admin/settings/`? Permission? Feld-Erweiterung am `Tenant`-Model?

8. **Session-Timeouts**: Der Konzept-Punkt "30 Min Idle, 4h max" erfordert Client-seitige Idle-Detection + Server-Side-Enforcement. Heute gibt es nur die Supabase-Default-Timeouts (im Cloud-Dashboard konfiguriert).

9. **Rate-Limiting-Stack**: Das Konzept erwähnt Rate-Limiting auf Platform-Login und Impersonation. Heute gibt es keinen Stack — Upstash-Redis, Vercel-Edge-Config, oder DB-Counter (wie `ai-assistant-service.ts`) sind die Optionen.

10. **Bootstrap-Prozess**: Wie wird der **erste** PlatformUser angelegt? Heute gibt es keinen `prisma/seed.ts`, kein CLI-Script, keinen Bootstrap-Flow. Der Supabase-Seed (`supabase/seed.sql`) legt nur `admin@dev.local` in `auth.users` an, nicht in einer hypothetischen `platform_users`-Tabelle.

11. **Prior-Art-Ticket**: Soll `thoughts/shared/tickets/misc/platform-admin-tenant-access.md` als **obsolet** markiert werden (zugunsten des neuen Konzepts)? Beide Ansätze gleichzeitig zu verfolgen wäre widersprüchlich.

12. **Migration-Pfad zum Tenant-Audit-Log**: Soll ein Platform-initiierter Write (z.B. "Tenant X Modul Y aktiviert durch PlatformUser Z") im **bestehenden** Tenant-Audit-Log sichtbar werden (mit `userId=NULL` und `metadata.performedByPlatformUserId`) oder ausschließlich im Platform-Audit-Log?
