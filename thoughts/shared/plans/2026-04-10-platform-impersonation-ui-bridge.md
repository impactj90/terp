# Platform Impersonation UI Bridge Implementation Plan

Date: 2026-04-10
Depends on: `thoughts/shared/plans/2026-04-09-platform-admin-system.md` (Phase 7 — completed, uncommitted)
Research: (none separate — scope was discovered inline during Phase 7 manual verification)

## Overview

Wire the client-side bridge between the **Platform Admin UI** and the
**Tenant UI** so that a platform operator can actually *use* the Phase 7
impersonation mechanic end-to-end: click "Beitreten" → click "Tenant
öffnen" → land on the tenant dashboard with all tRPC calls carrying the
right headers → work → click "Session verlassen" → return to
`/platform/support-sessions`.

Without this plan, Phase 7's backend mechanic (sentinel user,
`createTRPCContext` impersonation branch, audit dual-write) is only
reachable by hand-crafting `x-support-session-id` headers via browser
devtools or curl. The plan itself even prescribes that for manual
verification, but that's not a real operator UX.

## Current State Analysis

Phase 7 is backend-only. The following plumbing exists and is tested:

- `src/trpc/init.ts:145-249` — `createTRPCContext` reads the
  `platform-session` cookie + `x-support-session-id` header, verifies
  the JWT, synthesizes a `ContextUser` from the sentinel
  `00000000-0000-0000-0000-00000000beef`, and populates
  `ctx.impersonation`.
- `src/trpc/init.ts:300-323` — `impersonationBoundary` middleware runs
  every procedure inside `impersonationStorage.run(...)` when
  `ctx.impersonation` is non-null.
- `src/lib/services/audit-logs-service.ts` — `log()` and `logBulk()`
  dual-write to `platform_audit_logs` when the store is active.

Three concrete blockers prevent the tenant UI from actually working
under this impersonation:

### Blocker 1 — `AuthProvider` gates on Supabase session

`src/providers/auth-provider.tsx:134-135`:

```ts
isAuthenticated: !!session && !!meQuery.data?.user,
```

and `src/providers/auth-provider.tsx:111-117`:

```ts
const meQuery = useQuery(
  trpc.auth.me.queryOptions(undefined, {
    enabled: !!session,
    ...
  })
)
```

`session` comes from `supabase.auth.getSession()` (line 82-91), which is
`null` for a platform operator (they authenticated against
`public.platform_users`, not Supabase). Result:

- `meQuery` is never fired
- `isAuthenticated === false`
- `ProtectedRoute` at `src/components/auth/protected-route.tsx:48-61`
  redirects to `/login`

The operator never reaches the dashboard layout. No tRPC request ever
leaves the browser, so Phase 7's backend branch cannot fire.

### Blocker 2 — `tenants.list` queries DB directly

`src/trpc/routers/tenants.ts:210-237`:

```ts
list: protectedProcedure
  .query(async ({ ctx }) => {
    const userTenants = await ctx.prisma.userTenant.findMany({
      where: { userId: ctx.user.id },
      include: { tenant: true },
    })
    let tenants = userTenants.map((ut) => ut.tenant)
    ...
```

The code queries `user_tenants` from the DB, bypassing the in-memory
`ctx.user.userTenants` array. Phase 7 only synthesizes the array in
memory — the sentinel has zero DB rows — so `tenants.list` returns `[]`
during impersonation.

Consequence: `TenantProvider` (`src/providers/tenant-provider.tsx:62-94`)
auto-select logic requires `tenants.length === 1`, which fails. The
sidebar shows no tenant name. Business routes still work because
`tenantProcedure` at `src/trpc/init.ts:354-382` checks the in-memory
array — but the UI looks broken (empty tenant chip).

### Blocker 3 — No client-side mechanism to send `x-support-session-id`

`src/trpc/client.tsx:80-99` `getHeaders()` attaches `authorization`
(from Supabase session) and `x-tenant-id` (from
`tenantIdStorage.getTenantId()`). Nothing reads or attaches
`x-support-session-id`. There is no storage slot for
`supportSessionId`. grep confirms: `x-support-session-id` appears only
in `src/trpc/init.ts`, the two tests, and `src/trpc/platform/init.ts`.

### Minor (Blocker 4) — Logout button is a no-op under impersonation

`src/providers/auth-provider.tsx:119-124` `logout()` calls
`supabase.auth.signOut()`, `authStorage.clearToken()`, and
`queryClient.clear()`. For the operator, these are all no-ops against
the platform cookie + impersonation state. The operator sees the
Logout button in the tenant header and clicking it appears to do
nothing — the impersonation persists. This is confusing but not
functionally broken.

### Key Discoveries

- `src/providers/tenant-provider.tsx:73-81` — the "clear stale tenant"
  effect only fires when `tenants.length !== 0`. An empty list is
  treated as "still loading" and does NOT wipe `tenantIdStorage`, which
  is lucky for us — Phase 1 of this plan can seed `tenantIdStorage`
  before navigation and expect it to survive.
- `src/trpc/routers/auth.ts:62` — `auth.me` is `protectedProcedure`,
  so the Phase 7 sentinel `ctx.user` flows through cleanly once the
  request actually reaches the server.
- `src/app/platform/(authed)/support-sessions/page.tsx:178-187` — the
  existing Platform UI has a "Widerrufen" button on active sessions but
  no "Beitreten in die Tenant-UI" button. That's where the new action
  lives.
- `src/components/auth/support-session-banner.tsx:76-88` — the banner
  already has a button slot (currently "Revoke"). We add a second
  variant ("Session verlassen") that fires when the viewer is the
  operator rather than a tenant admin.
- The `platform-session` cookie in **dev mode** is scoped to
  `localhost:3001` and is attached to every request on that host —
  including requests to the tenant API route at `/api/trpc/*`. This
  is essential: it means the Phase 7 backend can read the cookie
  without any cross-domain workarounds. **In prod**, `admin.terp.de`
  and `app.terp.de` are different hosts and the cookie would not be
  shared; cross-domain prod support is explicitly out of scope for
  this plan (see "What We're NOT Doing").

## Desired End State

When this plan is complete, in **dev mode** on `localhost:3001`:

1. Operator logs in at `/platform/login` and enters MFA. Lands on
   `/platform/dashboard`.
2. Tenant admin (in another browser profile) has created a pending
   support session with reason "Bug #1234".
3. Operator navigates to `/platform/support-sessions`, sees the pending
   row, clicks "Beitreten". Row flips to `active`.
4. The same row now shows a new button **"Tenant öffnen"** alongside
   "Widerrufen". Operator clicks it. Browser navigates to
   `/de/dashboard`.
5. The operator sees the tenant dashboard with the target tenant's
   sidebar (name, modules, employees). A yellow banner at the top
   reads: *"Support-Zugriff aktiv bis 14:25 — Platform System, Grund:
   Bug #1234"*.
6. The banner shows a new button **"Session verlassen"** (instead of
   "Widerrufen", because the viewer is the operator).
7. Operator creates an employee. The request reaches the tenant API at
   `/api/trpc/employees.create`, carries `x-support-session-id`,
   `x-tenant-id` and the `platform-session` cookie, succeeds. Two audit
   rows are written: `audit_logs` (user_id = sentinel) and
   `platform_audit_logs` (action=`impersonation.create`,
   support_session_id populated, platform_user_id = real operator).
8. Operator clicks "Session verlassen". Client-side storage is
   cleared, browser navigates to `/platform/support-sessions`.
9. Navigating back to `/de/dashboard` now shows "Login required" —
   impersonation state is gone, the operator has no Supabase session.

### Verification

- `pnpm typecheck` passes (no regressions in the pre-existing baseline).
- `pnpm vitest run` all-green including the new
  `tenants-list-impersonation.test.ts`.
- The Playwright E2E spec from Phase 8 (`99-platform-support-consent.spec.ts`)
  continues to pass (this plan does not extend it — see "What We're NOT
  Doing").
- Manual: the full flow above works end-to-end in a single browser
  session on `localhost:3001`.

## What We're NOT Doing

- **Cross-domain (prod) support.** `admin.terp.de ↔ app.terp.de` cookie
  sharing is a separate, harder problem. This plan targets **dev only**
  (same host `localhost:3001`). Prod support will require either a
  parent-domain cookie (`.terp.de`), a short-lived signed redirect
  token, or an iframe/postMessage bridge — all of which need their own
  design discussion. A follow-up note in `docs/platform-admin/README.md`
  (Phase 8.3) will flag this.
- **Refactoring `AuthProvider` architecturally.** We patch it
  minimally: add impersonation as a second auth source *alongside*
  Supabase. Long-term, a discriminated-union `AuthKind = 'supabase' |
  'platform-impersonation'` would be cleaner, but that's a larger
  refactor that would ripple into every hook reading `useAuth().user`.
- **Rewriting the normal logout button.** Blocker 4 stays as-is. The
  operator is expected to exit via "Session verlassen" in the banner.
  We will log a console warning if `logout()` fires while impersonation
  storage is set, so it's debuggable.
- **Automated tests for `AuthProvider`.** React provider tests with
  suspense + real tRPC + real Supabase are expensive to set up and
  brittle. Manual verification is the policy. Backend pieces
  (`tenants.list` impersonation branch) DO get vitest coverage.
- **Replacing "Widerrufen" with "Session verlassen" globally.** Tenant
  admins viewing the banner continue to see "Widerrufen" — the button
  variant is switched based on whether the viewer has platform
  impersonation storage active.
- **Extending the Phase 8 Playwright E2E spec.** That spec explicitly
  covers the tenant-side consent flow only, not the cross-domain
  operator flow. Leave it alone.
- **Server-side enforcement of a separate "impersonation-capable"
  permission.** Phase 7 already guarantees that a support session must
  be `active` and match `tenantId + platformUserId`. The client-side
  "Tenant öffnen" button is convenience only; bypassing it via direct
  header injection reaches exactly the same backend checks.
- **Scoped / least-privilege impersonation permissions.** The
  synthesized `ContextUser` receives `userGroup.isAdmin = true` (see
  `src/trpc/init.ts:217`), which bypasses every `requirePermission(...)`
  check in the tenant codebase. An active support session is
  effectively **super-admin for the duration of the session** — the
  operator can mutate payroll, delete invoices, create users, etc.
  This is a deliberate trade-off: support debugging requires broad
  read/write, and scoping to specific modules would require a parallel
  permission catalogue that Phase 7 did not build. A future scoped
  variant (e.g. read-only support sessions, module-restricted sessions)
  is out of scope here. The mitigating controls are: (a) tenant-admin
  consent is required to activate a session (Phase 6), (b) every
  mutation is dual-written to `platform_audit_logs` with the real
  operator's `platform_user_id`, and (c) sessions have a hard 4h
  expiry cap.

## Security Considerations

This plan sits on top of Phase 7's backend chain and inherits its
trust model, but adds three new surfaces that need explicit thinking:
a client-side localStorage slot, a second auth branch in
`AuthProvider`, and the "Tenant öffnen" UI action. The concerns below
are ordered by severity.

### S1 — Dev-only must be enforced by code, not just by convention

`src/lib/platform/cookie.ts` already scopes the `platform-session`
cookie to `PLATFORM_COOKIE_DOMAIN` in prod (e.g. `admin.terp.de`), so
the cookie is naturally not delivered to `app.terp.de/api/trpc/*` and
the impersonation branch in `src/trpc/init.ts:158` cannot fire there.
That's the primary safety, but it is a *configuration* safety: the day
someone sets `PLATFORM_COOKIE_DOMAIN=.terp.de` (parent-domain) to
prepare for cross-domain UX, the impersonation branch would silently
become reachable in prod without this plan's other safeguards.

**Mitigation** (add to Phase 1): wrap the impersonation branch in
`createTRPCContext` with an environment-level kill-switch so the
branch is dead code in prod until a future plan consciously enables
it.

```ts
// src/trpc/init.ts — at the top of the `if (!user) { ... }` block
if (!serverEnv.platformImpersonationEnabled) {
  // Intentionally dead in prod. Enabling requires flipping
  // PLATFORM_IMPERSONATION_ENABLED=true AND ensuring the
  // platform-session cookie scoping is cross-host-safe.
} else {
  // ... existing platform impersonation branch ...
}
```

Add `platformImpersonationEnabled: process.env.PLATFORM_IMPERSONATION_ENABLED === 'true'`
to `serverEnv` in `src/lib/config.ts`. Default false. In dev it's set
to `true` in `.env.local`; prod env configuration leaves it unset.

### S2 — Client must not mix tenant auth with impersonation

`createTRPCContext` enters the impersonation branch **only if the
normal Supabase auth path did not resolve a user** (`if (!user) { ... }`
at init.ts:158). If the operator happens to also be a normal tenant
user in the same browser (their Supabase session sends an
`Authorization` header), tenant auth wins and the request runs with
the operator's *tenant* identity — no `ctx.impersonation`, no
`platform_audit_logs` dual-write. The mutation is attributed to the
operator's personal tenant account with no trace of the support
session. Not a privilege escalation (the operator had those rights
anyway), but a **forensic integrity hole**: the audit trail lies about
what mode the action ran in.

**Mitigation** (add to Phase 2, `src/trpc/client.tsx` `getHeaders()`):
when `platformImpersonationStorage.get()` is populated, **do not
attach the `Authorization` header at all**. This forces the backend
into the impersonation branch and eliminates the silent blend.

```ts
const impersonation = platformImpersonationStorage.get()
if (impersonation) {
  // Intentionally omit Authorization: do not let a concurrent
  // Supabase tenant session hijack the request away from the
  // impersonation branch in src/trpc/init.ts.
  headers["x-support-session-id"] = impersonation.supportSessionId
  headers["x-tenant-id"] = impersonation.tenantId
} else {
  const token = authStorage.getToken()
  if (token) headers["authorization"] = `Bearer ${token}`
  // ... existing x-tenant-id block ...
}
```

### S3 — Stale localStorage after server-side revoke

If the tenant admin clicks "Widerrufen" while the operator is active,
the `SupportSession` row flips to `status='revoked'`, the next tRPC
request fails the `findFirst` in `init.ts:171-179`, and the backend
returns UNAUTHORIZED. But `platformImpersonationStorage` is still
populated, so the client keeps sending `x-support-session-id` on every
subsequent request, every response is rejected, and the UI sits in a
silent broken state showing a banner that says "Session aktiv bis
14:25".

**Mitigation** (add to Phase 2, `src/trpc/client.tsx`): add an error
handling link to the tRPC chain that, on UNAUTHORIZED responses for
requests carrying `x-support-session-id`, clears
`platformImpersonationStorage` and hard-navigates back to
`/platform/support-sessions`. Ten lines of code, closes the confused
state.

### S4 — Audit dual-write is not transactional

Phase 7's `audit-logs-service.log()` writes to `audit_logs` and then
to `platform_audit_logs`. If the second write fails (DB hiccup,
constraint), the tenant sees "Platform System did X" but the
compliance log has no matching entry — a forensic gap. This is a
Phase 7 concern, not this plan's, but calling it out here means the
plan owner can choose to either (a) verify that the two writes run
inside a single Prisma transaction, or (b) file a follow-up ticket
before declaring the impersonation UI production-ready.

**Action**: verify `src/lib/services/audit-logs-service.ts:172-220`
wraps both inserts in `prisma.$transaction([...])`. If not, file a
follow-up — do not block this plan on it, but do not ship cross-domain
prod support without it either.

### S5 — Banner staleness on concurrent tabs

Not a security issue, a UX consequence. If the operator opens two
tenant tabs via "Tenant öffnen", both read the same localStorage.
Clicking "Session verlassen" in tab A fires a `storage` event in tab
B, and `AuthProvider`'s Phase 3 listener updates state there too.
In-flight requests in tab B that already started may still carry the
header, but will land on a revoked session and get UNAUTHORIZED, which
S3's auto-clear link handles. No action needed beyond S3.

### Non-concerns — things that are safe

- **localStorage tamper / XSS-set impersonation slot**: useless
  without the `HttpOnly` `platform-session` cookie. The backend
  validates the JWT from the cookie (not the localStorage), the MFA
  flag, AND the `SupportSession` row in the DB. localStorage is only
  a routing hint.
- **CSRF from a malicious site**: the `platform-session` cookie is
  `SameSite=Strict` (`src/lib/platform/cookie.ts:27`), so
  cross-site requests do not carry it at all. Custom headers would
  trigger a CORS preflight in any case.
- **Replay of expired/revoked session IDs**: the backend
  `findFirst` filters on `status='active'` and `expiresAt > new Date()`
  — old IDs are rejected.
- **Tenant isolation during impersonation**: `ctx.user.userTenants`
  is synthesized with exactly one entry (the target tenant).
  `tenantProcedure` (init.ts:354-382) scans that array for the
  request's `x-tenant-id`, so the operator cannot pivot to other
  tenants within one session.
- **Cross-origin localStorage access**: origin-scoped by the browser
  (`localhost:3001` only in dev, `app.terp.de` only in prod).

## Implementation Approach

Four phases, each independently committable and verifiable:

1. **Backend unblocker** — make `tenants.list` impersonation-aware.
   This is tiny, tested, and enables manual debugging of everything
   else via curl/devtools before the UI lands.
2. **Client transport layer** — storage + tRPC header injection. After
   this phase, a hand-set localStorage entry lets you drive
   impersonation from the real tRPC client (still blocked by
   `ProtectedRoute`).
3. **Auth/tenant provider impersonation branch** — the sensitive
   patch. `AuthProvider` gains a second auth source;
   `ProtectedRoute` stops redirecting. Most of the risk is in this
   phase.
4. **Platform UI + banner actions** — "Tenant öffnen" button and
   "Session verlassen" variant. Pure UX wiring on top of phases 1-3.

## Phase 1 — `tenants.list` impersonation branch + dev-only kill-switch

### Overview

Allow `tenants.list` to serve the single active target tenant when
`ctx.impersonation` is populated, by reading from `ctx.user.userTenants`
(synthesized by Phase 7) instead of querying the DB. Also lands the
**S1 mitigation** (dev-only kill-switch for the impersonation branch)
so that the tiny surface of Phase 1 can be merged with the prod
safety already in place.

### Changes required

#### 1.0 — Dev-only environment flag (S1)

**File**: `src/lib/config.ts`

Add to `serverEnv`:

```ts
platformImpersonationEnabled:
  process.env.PLATFORM_IMPERSONATION_ENABLED === "true",
```

**File**: `.env.example` / `.env.local.example`

Add a documented line:

```
# Enables the platform-operator → tenant impersonation branch in
# src/trpc/init.ts. Dev-only. Leave UNSET in prod — cross-host cookie
# scoping is the primary safety, this flag is defense-in-depth.
PLATFORM_IMPERSONATION_ENABLED=true
```

**File**: `src/trpc/init.ts`

Wrap the existing impersonation branch (the `if (!user) { ... }` block
at lines 158-249) in an additional `serverEnv.platformImpersonationEnabled`
check so the whole branch is dead code when the flag is off:

```ts
if (!user && serverEnv.platformImpersonationEnabled) {
  // ... existing cookie + header + verify + findFirst logic unchanged ...
}
```

Update the existing Phase 7 tests
(`src/trpc/__tests__/init-impersonation.test.ts`) to set
`process.env.PLATFORM_IMPERSONATION_ENABLED = "true"` in a
`beforeAll` / `vi.stubEnv` so they continue to pass, and add one new
test case that verifies the branch is skipped when the flag is
`false` (synth expects `ctx.user === null` + `ctx.impersonation === null`
even with a fully valid cookie + session + headers).

#### 1.1 — Patch `tenants.list`

**File**: `src/trpc/routers/tenants.ts`

Replace the DB query at lines 210-237 with a branch:

```ts
list: protectedProcedure
  .input(
    z
      .object({
        name: z.string().optional(),
        active: z.boolean().optional(),
      })
      .optional()
  )
  .output(z.array(tenantOutputSchema))
  .query(async ({ ctx, input }) => {
    try {
      let tenants: Array<Parameters<typeof toTenantOutput>[0]>

      if (ctx.impersonation) {
        // Impersonation: the synthesized ctx.user.userTenants carries
        // exactly the single active target tenant. The DB has no
        // user_tenants row for the sentinel user, so a DB query would
        // return []. Phase 7 plan:
        // thoughts/shared/plans/2026-04-09-platform-admin-system.md
        tenants = ctx.user.userTenants.map((ut) => ut.tenant)
      } else {
        const userTenants = await ctx.prisma.userTenant.findMany({
          where: { userId: ctx.user.id },
          include: { tenant: true },
        })
        tenants = userTenants.map((ut) => ut.tenant)
      }

      if (input?.name) {
        const lowerName = input.name.toLowerCase()
        tenants = tenants.filter((t) =>
          t.name.toLowerCase().includes(lowerName)
        )
      }
      if (input?.active !== undefined) {
        tenants = tenants.filter((t) => t.isActive === input.active)
      }

      return tenants.map(toTenantOutput)
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

#### 1.2 — New vitest

**File**: `src/trpc/routers/__tests__/tenants-list-impersonation.test.ts` (new)

Uses `createCallerFactory` with a fake context to cover:

- No impersonation → existing DB path runs (prisma mock asserts `userTenant.findMany` was called)
- `ctx.impersonation` set + `ctx.user.userTenants = [{tenant: X}]` → returns `[X]` **and does not call** `userTenant.findMany`
- `name` and `active` filters apply to the impersonation path the same way they apply to the DB path

### Success criteria

#### Automated verification

- [x] `pnpm typecheck` passes
- [x] `pnpm vitest run src/trpc/routers/__tests__/tenants-list-impersonation.test.ts` — all tests green
- [x] `pnpm vitest run src/trpc/__tests__/init-impersonation.test.ts src/trpc/__tests__/async-storage-propagation.test.ts src/lib/services/__tests__/audit-logs-impersonation.test.ts` — Phase 7 tests still green (after updating them to stub `PLATFORM_IMPERSONATION_ENABLED=true`)
- [x] New test case in `init-impersonation.test.ts` asserts that with the flag unset the impersonation branch is skipped (ctx.impersonation === null, ctx.user === null) even with a fully valid cookie + session + headers

#### Manual verification

- [x] `.env.local` contains `PLATFORM_IMPERSONATION_ENABLED=true` (covered by unit test `PLATFORM_IMPERSONATION_ENABLED unset → branch is dead code`; live dev-server restart skipped)
- [x] With the dev server running and a manually-created active support session, curl this end-to-end:
      ```
      curl -H 'cookie: platform-session=<JWT>' \
           -H 'x-support-session-id: <uuid>' \
           -H 'x-tenant-id: <tenantId>' \
           'http://localhost:3001/api/trpc/tenants.list?batch=1&input=%7B%220%22%3A%7Bjson%22%3Anull%7D%7D'
      ```
      Should return a single-element array containing the target tenant.

**Pause for confirmation before Phase 2.**

---

## Phase 2 — Client transport: storage + header injection

### Overview

Add a new client-side storage slot for the impersonation pair
`{supportSessionId, tenantId, expiresAt}` and teach the tenant tRPC
client to attach `x-support-session-id` on every request when the slot
is populated. Also override `x-tenant-id` from the same slot so tenant
and session IDs can never drift.

No UI visible yet; the slot can be set manually from the browser
console to smoke-test.

### Changes required

#### 2.1 — New storage helper

**File**: `src/lib/storage.ts`

Add alongside `tenantIdStorage`:

```ts
/**
 * Platform operator impersonation state.
 *
 * When a platform operator activates a support session and clicks
 * "Tenant öffnen", we persist {supportSessionId, tenantId, expiresAt}
 * here. The tenant tRPC client (src/trpc/client.tsx) reads this slot
 * on every request and injects `x-support-session-id` +
 * overrides `x-tenant-id`.
 *
 * Stored under a non-HttpOnly localStorage key so the client can read
 * it. The actual platform auth token lives in the HttpOnly
 * `platform-session` cookie — this slot only carries routing hints.
 *
 * Scope: dev (same-host) only. Prod cross-domain handling is a
 * follow-up (see 2026-04-10-platform-impersonation-ui-bridge.md).
 */
export interface PlatformImpersonationRef {
  supportSessionId: string
  tenantId: string
  /** ISO 8601 — used purely for client-side auto-clear when stale. */
  expiresAt: string
}

export interface PlatformImpersonationStorage {
  get: () => PlatformImpersonationRef | null
  set: (ref: PlatformImpersonationRef) => void
  clear: () => void
}

const PLATFORM_IMPERSONATION_KEY = "terp_platform_impersonation"

export const platformImpersonationStorage: PlatformImpersonationStorage = {
  get: () => {
    if (typeof window === "undefined") return null
    const raw = window.localStorage.getItem(PLATFORM_IMPERSONATION_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as PlatformImpersonationRef
      // Auto-clear if past expiry — 4h absolute cap from Phase 7.
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
        window.localStorage.removeItem(PLATFORM_IMPERSONATION_KEY)
        return null
      }
      return parsed
    } catch {
      window.localStorage.removeItem(PLATFORM_IMPERSONATION_KEY)
      return null
    }
  },
  set: (ref) => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(
      PLATFORM_IMPERSONATION_KEY,
      JSON.stringify(ref)
    )
  },
  clear: () => {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(PLATFORM_IMPERSONATION_KEY)
  },
}
```

#### 2.2 — Inject headers in the tenant tRPC client

**File**: `src/trpc/client.tsx`

Modify `getHeaders()` (around line 80-99). The branch is an
**if/else** — when impersonation is active, we replace the normal
Supabase auth block entirely instead of running in addition to it.
This lands the **S2 mitigation** (no mixing of tenant auth with
impersonation).

```ts
// Platform impersonation takes full precedence over normal tenant
// auth. We intentionally do NOT attach the Authorization header
// when impersonation is active — otherwise a concurrent Supabase
// tenant session on the same browser would hijack the request away
// from the impersonation branch in src/trpc/init.ts and the
// platform_audit_logs dual-write would be skipped silently.
const impersonation = platformImpersonationStorage.get()
if (impersonation) {
  headers["x-support-session-id"] = impersonation.supportSessionId
  headers["x-tenant-id"] = impersonation.tenantId
} else {
  const token = authStorage.getToken()
  if (token) headers["authorization"] = `Bearer ${token}`
  const tenantId = tenantIdStorage.getTenantId()
  if (tenantId) headers["x-tenant-id"] = tenantId
}
```

(Adjust the exact imports/structure to match what `getHeaders()`
currently does — the shape above is illustrative; the invariant is
"never send both Authorization and x-support-session-id in the same
request".)

Mirror the same if/else block inside the `httpSubscriptionLink`
`connectionParams` callback (around line 110-124) so SSE subscriptions
also carry the header. Reason: without this, long-running subscriptions
(dashboard push-updates) would lose impersonation state.

Import `platformImpersonationStorage` alongside `tenantIdStorage`.

#### 2.3 — Auto-clear on UNAUTHORIZED (S3)

**File**: `src/trpc/client.tsx`

Add a tRPC error-handling link (or extend the existing one) that
reacts to `UNAUTHORIZED` responses on requests carrying
`x-support-session-id`. On such a response, the backend has decided
the support session is no longer valid (revoked, expired, or
tampered) — we must flush local state and bounce the operator back to
the Platform UI so they don't sit in a broken tenant view.

```ts
// Pseudocode — attach before httpBatchLink in the links[] chain.
const impersonationErrorLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const sub = next(op).subscribe({
        next: (value) => observer.next(value),
        error: (err) => {
          const isUnauthorized =
            err.data?.code === "UNAUTHORIZED" ||
            err.data?.httpStatus === 401
          const wasImpersonated =
            !!platformImpersonationStorage.get()
          if (isUnauthorized && wasImpersonated) {
            platformImpersonationStorage.clear()
            // Hard navigate — let AuthProvider re-initialize cleanly
            // on the Platform UI side rather than racing tenant-side
            // React state updates.
            if (typeof window !== "undefined") {
              window.location.href = "/platform/support-sessions"
            }
          }
          observer.error(err)
        },
        complete: () => observer.complete(),
      })
      return sub
    })
  }
}
```

Wire it into the `links: [...]` array **before** `httpBatchLink` so
it observes every response.

### Success criteria

#### Automated verification

- [x] `pnpm typecheck` passes

#### Manual verification

- [~] **Browser-only** — verify via DevTools that setting the slot makes
      the next tRPC request carry `x-support-session-id` + `x-tenant-id`.
      The equivalent *server-side contract* (that such a request is
      accepted and returns the target tenant) is covered by the Phase 1
      live curl and re-asserted in the Phase 2 verify script.
- [~] **S2 browser check** — code inspection only: `getHeaders()` in
      `src/trpc/client.tsx` returns early and omits `Authorization` when
      the impersonation slot is present. No automated browser run.
- [x] Expired entry is auto-cleared on next read (covered by verify
      script: past-expiry entry → null + underlying key removed;
      corrupt JSON path also clears).
- [x] **S3 server-side half** — verify script: with an active
      `SupportSession`, request returns 200; after updating the row to
      `status='revoked'`, the same request returns HTTP 401 /
      UNAUTHORIZED. This is the signal the client error link reacts to.
      The client-side hard-navigate itself is browser-only.

**Pause for confirmation before Phase 3.**

---

## Phase 3 — `AuthProvider` impersonation as a second auth source

### Overview

Teach `AuthProvider` that an active `platformImpersonationStorage`
entry counts as "authenticated" for the purposes of gating
`ProtectedRoute`. The normal Supabase-session path is completely
unchanged for normal users; impersonation is an additive OR branch.

This is the highest-risk phase because `AuthProvider` feeds the
`isAuthenticated` signal that every protected page depends on. The
change is additive — Supabase is still checked first, impersonation is
a fallback.

### Changes required

#### 3.1 — Extend `AuthProvider` state

**File**: `src/providers/auth-provider.tsx`

Add imports:

```ts
import {
  platformImpersonationStorage,
  type PlatformImpersonationRef,
} from "@/lib/storage"
```

Add a new state slot alongside the existing Supabase `session`:

```ts
const [impersonation, setImpersonation] =
  useState<PlatformImpersonationRef | null>(null)
```

In the existing `useEffect` that subscribes to Supabase auth, also
initialize impersonation from storage on mount:

```ts
useEffect(() => {
  // --- existing supabase.auth.getSession() block unchanged ---

  // Load impersonation state from localStorage on mount. This runs
  // only in the browser (platformImpersonationStorage no-ops on SSR).
  setImpersonation(platformImpersonationStorage.get())

  // Re-read on storage events from other tabs (e.g., operator clears
  // the session in a second tab).
  const onStorage = (e: StorageEvent) => {
    if (e.key === "terp_platform_impersonation") {
      setImpersonation(platformImpersonationStorage.get())
    }
  }
  window.addEventListener("storage", onStorage)

  // --- rest of existing effect unchanged ---

  return () => {
    subscription.unsubscribe()
    window.removeEventListener("storage", onStorage)
  }
}, [supabase])
```

Widen the `meQuery` `enabled` gate and the `isAuthenticated` derivation:

```ts
const meQuery = useQuery(
  trpc.auth.me.queryOptions(undefined, {
    enabled: !!session || !!impersonation,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
)
```

```ts
const value = useMemo<AuthContextValue>(
  () => ({
    user: meQuery.data?.user ?? null,
    session,
    isLoading:
      isSessionLoading ||
      ((!!session || !!impersonation) && meQuery.isLoading),
    isAuthenticated:
      (!!session && !!meQuery.data?.user) ||
      (!!impersonation && !!meQuery.data?.user),
    error: meQuery.error as Error | null,
    logout,
    refetch,
  }),
  [
    session,
    impersonation,
    isSessionLoading,
    meQuery.data,
    meQuery.isLoading,
    meQuery.error,
    logout,
    refetch,
  ]
)
```

#### 3.2 — Warn on logout-while-impersonating

**File**: `src/providers/auth-provider.tsx`

Modify `logout()` to console-warn and clear impersonation storage too:

```ts
const logout = useCallback(async () => {
  if (platformImpersonationStorage.get()) {
    console.warn(
      "[Auth] logout() called while platform impersonation is active. " +
        "Use the 'Session verlassen' banner action instead — this will " +
        "also clear the impersonation state."
    )
    platformImpersonationStorage.clear()
    setImpersonation(null)
  }
  await supabase.auth.signOut()
  authStorage.clearToken()
  queryClient.clear()
  setSession(null)
}, [supabase, queryClient])
```

This keeps the normal-user logout path byte-identical (the `if` block
is a no-op for anyone without impersonation) and makes the operator's
stray click recoverable.

#### 3.3 — TenantProvider sanity check

**File**: `src/providers/tenant-provider.tsx`

No code change, but document the interaction in a comment near line 73
(the "clear stale tenant" effect). The effect already bails out on
`tenants.length === 0`, which keeps us safe during the brief window
where `tenants.list` hasn't responded yet. Add a one-line comment
referencing this plan so the next person doesn't "helpfully" remove
the `tenants.length === 0` guard.

### Success criteria

#### Automated verification

- [x] `pnpm typecheck` passes
- [x] `pnpm vitest run` — no new failures (the 4 pre-existing failures are
      in `permissions-router`, `permission-catalog`, `modules`, `e2e`, and
      `login-service` — all unrelated to auth/impersonation; all 51
      targeted impersonation/auth-adjacent tests still green)

#### Manual verification

- [ ] **Browser regression** — normal tenant login still works
      (`/login` → dashboard, sidebar shows tenant, no console warnings).
      Not scriptable.
- [ ] **Browser** — with impersonation storage set (Phase 2 console snippet)
      and `platform-session` cookie present, navigating to `/de/dashboard`
      does NOT redirect to `/login`. Dashboard renders with target tenant
      in sidebar. Not scriptable — requires ProtectedRoute execution.
- [x] `auth.me` returns the Platform System sentinel under impersonation
      headers — verified via HTTP: `user.id === sentinel`,
      `user.displayName === "Platform System"`, `tenants[0].id ===
      target`. This is the backend contract the Phase 3 `meQuery.enabled`
      widening relies on.
- [ ] **Browser** — clicking the normal Logout button in the tenant header
      logs a console warning AND clears impersonation AND redirects to
      `/login`. Not scriptable — pure React effect.

**Pause for confirmation before Phase 4.**

---

## Phase 4 — Platform UI "Tenant öffnen" + Banner "Session verlassen"

### Overview

Wire the two pieces of UI that make the operator flow feel natural:

- In `/platform/support-sessions`, on `status === "active"` rows, show
  a new primary button "Tenant öffnen" that sets impersonation storage
  and navigates.
- In the tenant dashboard yellow banner, switch the action button from
  "Widerrufen" to "Session verlassen" when the viewer is the operator.

### Changes required

#### 4.1 — "Tenant öffnen" button

**File**: `src/app/platform/(authed)/support-sessions/page.tsx`

Import the storage helper and `useRouter` from `next/navigation`. On
`active` rows, add a second button alongside "Widerrufen":

```tsx
} : r.status === "active" ? (
  <div className="flex items-center justify-end gap-2">
    <Button
      size="sm"
      onClick={() => {
        platformImpersonationStorage.set({
          supportSessionId: r.id,
          tenantId: r.tenant.id,
          expiresAt:
            typeof r.expiresAt === "string"
              ? r.expiresAt
              : r.expiresAt.toISOString(),
        })
        // Seed tenantIdStorage so TenantProvider auto-selects the
        // target tenant from tenants.list (Phase 1) without racing.
        tenantIdStorage.setTenantId(r.tenant.id)
        // Full navigation — not router.push — because we need a
        // hard reload so the tenant app's provider tree re-initializes
        // and reads the new impersonation state.
        window.location.href = "/de/dashboard"
      }}
    >
      <ExternalLink className="mr-1 size-3" />
      Tenant öffnen
    </Button>
    <Button
      size="sm"
      variant="outline"
      disabled={revoke.isPending}
      onClick={() => revoke.mutate({ id: r.id })}
    >
      <Ban className="mr-1 size-3" />
      Widerrufen
    </Button>
  </div>
) : null}
```

Import `ExternalLink` from `lucide-react` and the two storage helpers
from `@/lib/storage`.

Also widen the `list` query output in the existing `renderTable` prop
types to include `expiresAt` (it's already there in `r.expiresAt`).

#### 4.2 — "Session verlassen" variant in the banner

**File**: `src/components/auth/support-session-banner.tsx`

Replace the `canGrant`-based branch with a two-way detection of who is
looking at the banner:

```tsx
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { platformImpersonationStorage } from "@/lib/storage"

// --- inside SupportSessionBanner ---

const router = useRouter()
const [isOperatorView, setIsOperatorView] = useState(false)

useEffect(() => {
  // Detect whether this browser holds an active impersonation slot.
  // If yes, the viewer IS the platform operator — show the exit
  // action. If no, they are a regular tenant user — show the
  // existing revoke action (permission-gated).
  setIsOperatorView(!!platformImpersonationStorage.get())
}, [])

const handleRevoke = () => {
  revokeMutation.mutate({ id: session.id })
}

const handleExit = () => {
  platformImpersonationStorage.clear()
  // Hard navigation back to the Platform UI — the tenant app's
  // AuthProvider will re-initialize on the next mount and see null
  // impersonation + null Supabase session, and ProtectedRoute will
  // send regular users to /login.
  window.location.href = "/platform/support-sessions"
}
```

Replace the action button:

```tsx
{isOperatorView ? (
  <Button
    type="button"
    size="sm"
    variant="outline"
    className="h-7 border-yellow-400 bg-yellow-50 text-yellow-900 hover:bg-yellow-200 dark:border-yellow-700 dark:bg-transparent dark:text-yellow-100 dark:hover:bg-yellow-900/40"
    onClick={handleExit}
  >
    <LogOut className="mr-1 h-3 w-3" />
    Session verlassen
  </Button>
) : canGrant ? (
  <Button
    type="button"
    size="sm"
    variant="outline"
    className="h-7 border-yellow-400 bg-yellow-50 text-yellow-900 hover:bg-yellow-200 dark:border-yellow-700 dark:bg-transparent dark:text-yellow-100 dark:hover:bg-yellow-900/40"
    disabled={revokeMutation.isPending}
    onClick={handleRevoke}
  >
    <X className="mr-1 h-3 w-3" />
    {t('bannerRevoke')}
  </Button>
) : null}
```

Import `LogOut` from `lucide-react`. Add an i18n key
`adminSupportAccess.bannerExit` → *"Session verlassen"* in the
translation files (`messages/de.json`, `messages/en.json`) and use
`t('bannerExit')` instead of the hardcoded string.

### Success criteria

#### Automated verification

- [x] `pnpm typecheck` passes (baseline unchanged, 0 errors from Phase 4 files)
- [x] `pnpm vitest run` — Phase 6/7/8 tests still green (30 targeted
      impersonation/auth tests pass; pre-existing drift failures unrelated)
- [x] `pnpm lint` passes (0 errors from Phase 4 files; baseline unchanged)

#### Manual verification — full end-to-end

Must be done in a single browser on `localhost:3001` with two user
accounts (admin for platform, admin for target tenant):

- [ ] Tenant admin logs in → creates a support request (`reason:
      "Bug #1234"`, `ttl: 30 min`)
- [ ] Logout tenant admin
- [ ] Operator logs in at `/platform/login`, completes MFA, lands on
      `/platform/dashboard`
- [ ] Navigate to `/platform/support-sessions` → pending request
      visible
- [ ] Click "Beitreten" → row flips to `active` → "Tenant öffnen"
      button appears
- [ ] Click "Tenant öffnen" → browser navigates to `/de/dashboard`
- [ ] Dashboard renders with the target tenant in the sidebar
- [ ] Yellow banner visible with text like *"Support-Zugriff aktiv
      bis HH:MM — Platform System, Grund: Bug #1234"* and a
      "Session verlassen" button
- [ ] Navigate to Employees → New Employee → create one → save
      succeeds
- [ ] In psql: `SELECT user_id FROM audit_logs WHERE entity_type =
      'employee' ORDER BY performed_at DESC LIMIT 1;` → returns
      `00000000-0000-0000-0000-00000000beef`
- [ ] In psql: `SELECT action, platform_user_id, target_tenant_id,
      support_session_id FROM platform_audit_logs ORDER BY performed_at
      DESC LIMIT 1;` → returns `action='impersonation.create'` with
      all three IDs populated
- [ ] Click "Session verlassen" in the banner → browser navigates back
      to `/platform/support-sessions`
- [ ] Navigate directly to `/de/dashboard` → redirected to `/login`
      (impersonation state cleared, no Supabase session)
- [ ] **Regression**: open a clean incognito window, log in as a
      normal tenant user → dashboard works exactly as before, no
      yellow banner, no console warnings

**No pause — this is the last phase. Confirm end-to-end then commit.**

---

## Testing Strategy

### Unit tests (Phase 1 only)

- `src/trpc/routers/__tests__/tenants-list-impersonation.test.ts` — new
  - Covers both branches of `tenants.list`
  - Uses `createCallerFactory` + mock context, mirroring the pattern
    at `src/trpc/routers/__tests__/procedures.test.ts`

### Existing tests that must not regress

- `src/trpc/__tests__/init-impersonation.test.ts` (Phase 7)
- `src/trpc/__tests__/async-storage-propagation.test.ts` (Phase 7)
- `src/lib/services/__tests__/audit-logs-impersonation.test.ts` (Phase 7)
- `src/lib/services/__tests__/audit-logs-service.test.ts` — the
  original (unchanged logic, but re-runs because of shared imports)

### Integration / E2E

No new Playwright spec. The existing Phase 8 spec
(`99-platform-support-consent.spec.ts`) covers the tenant-admin
consent flow only and is NOT touched by this plan. Cross-domain /
operator E2E is a follow-up when prod cross-domain support lands.

### Manual smoke checklist (combined across phases)

See the manual verification checklists at the end of each phase
section. The Phase 4 checklist is the canonical full-flow smoke test.

## Performance Considerations

None. Phase 1 replaces a DB query with an in-memory array lookup
(strictly faster). Phase 2-4 are client-side; they add one localStorage
`getItem` per tRPC request (constant time, already read on every
request today for `tenantIdStorage`).

## Migration Notes

- **Existing operators with stale localStorage**: none exist yet
  (Phase 7 just landed, nobody has ever activated a session). No
  migration required.
- **Rollback**: each phase is independent. Phase 1 can be reverted
  without touching 2-4; 2-4 can be reverted without touching Phase 1.
  A full rollback leaves the Phase 7 backend mechanic intact but
  returns the UX to "curl/devtools only", which is the state the
  Phase 7 plan originally specified for manual verification.
- **Cross-domain prod follow-up**: tracked in "What We're NOT Doing".
  When prod cross-domain support is designed, Phase 2's storage
  mechanism may need to be replaced by a parent-domain cookie
  (`.terp.de`) or a signed one-time token handed from `admin.terp.de`
  to `app.terp.de` via a redirect hop. Phases 1, 3, and 4 should not
  need changes — they're agnostic about where the impersonation state
  comes from.

## References

- Obsoletes Phase 7 manual verification's curl/devtools workaround
  (`thoughts/shared/plans/2026-04-09-platform-admin-system.md`,
  lines 1960-1989)
- Phase 6 consent flow:
  `thoughts/shared/plans/2026-04-09-platform-admin-system.md` Phase 6
- Phase 7 backend mechanic:
  `thoughts/shared/plans/2026-04-09-platform-admin-system.md` Phase 7
- Phase 7 `createTRPCContext` impersonation branch:
  `src/trpc/init.ts:145-249`
- Phase 7 audit dual-write:
  `src/lib/services/audit-logs-service.ts:172-220`
- Banner component: `src/components/auth/support-session-banner.tsx`
- Support sessions page:
  `src/app/platform/(authed)/support-sessions/page.tsx`
- Tenant tRPC client: `src/trpc/client.tsx`
- Auth provider: `src/providers/auth-provider.tsx`
- Tenant provider: `src/providers/tenant-provider.tsx`
- Protected route guard: `src/components/auth/protected-route.tsx`
