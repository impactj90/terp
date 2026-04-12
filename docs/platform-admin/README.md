# Platform Admin System

Operator-facing control plane for the TERP SaaS. A fully separate auth
domain that sits alongside the regular tenant app on its own subdomain
(`admin.terp.de`), shares the same Prisma/Postgres, but never touches
`supabase.auth.users`, `user_tenants`, or the tenant JWT.

## Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  app.terp.de (tenants)   │        │ admin.terp.de (platform) │
│                          │        │                          │
│  Supabase Auth           │        │  PlatformUser table      │
│  JWT in sb-* cookies     │        │  JWT in terp_platform_*  │
│  tenantProcedure         │        │  platformAuthedProcedure │
│  /api/trpc               │        │  /api/trpc-platform      │
│  x-tenant-id header      │        │  (no tenant header)      │
└────────────┬─────────────┘        └────────────┬─────────────┘
             │                                   │
             └──────────────┬────────────────────┘
                            ▼
                    ┌───────────────┐
                    │   Postgres    │
                    │   (Prisma)    │
                    └───────────────┘
```

Key properties:

- **Separate user table.** `platform_users` is independent of
  `supabase.auth.users` and `users`. Platform operators are not tenant
  users.
- **Separate JWT + cookie.** Signed with `PLATFORM_JWT_SECRET`, stored
  under `terp_platform_session` on the admin subdomain only.
- **Mandatory MFA (TOTP)** enrolled on first login. Recovery codes are
  single-use (10 × 11 chars).
- **Rate-limited login** via `platform_login_attempts`. 5 fails/email/
  15 min, 20 fails/IP/15 min.
- **No userTenants bypass.** The platform world and the tenant world
  cannot cross over except through a consent-bound
  [Support Session](#support-session-state-machine).

### Files

| Area                  | Path                                                   |
| --------------------- | ------------------------------------------------------ |
| Prisma models         | `prisma/schema.prisma` (PlatformUser, SupportSession,  |
|                       | PlatformAuditLog, PlatformLoginAttempt)                |
| Core libs             | `src/lib/platform/` (jwt, totp, password, rate-limit,  |
|                       | cookie, login-service, audit-service,                  |
|                       | impersonation-context)                                 |
| tRPC init             | `src/trpc/platform/init.ts`, `context.ts`, `_app.ts`   |
| Routers               | `src/trpc/platform/routers/` (auth, supportSessions,   |
|                       | tenants, platformUsers, auditLogs)                     |
| API handler           | `src/app/api/trpc-platform/[trpc]/route.ts`            |
| UI                    | `src/app/platform/` (login + `(authed)/*`)             |
| Bootstrap             | `scripts/bootstrap-platform-user.ts`                   |
| Cleanup cron          | `src/app/api/cron/platform-cleanup/route.ts`           |

## Operator onboarding

Platform users are not self-registrable. Creation is a two-step process:

1. **First operator** is bootstrapped from a trusted dev machine:

   ```bash
   pnpm tsx scripts/bootstrap-platform-user.ts operator@terp.de "Display Name"
   ```

   Prints a randomly-generated password that must be shared out-of-band
   and rotated on first login.

2. **Additional operators** are created from within the Platform UI at
   `/platform/platform-users` by an already-authenticated operator.
   Writes a `platform_user.created` audit entry.

First login for any operator:

1. Enter email + password → redirected to MFA enrollment (QR code).
2. Scan with an authenticator (1Password, Authy, Google Authenticator).
3. Enter a 6-digit TOTP → shown 10 one-time recovery codes (save these!).
4. Subsequent logins only require password + TOTP (or a recovery code).

## Support-Session state machine

A support session is the only bridge between a platform operator and a
tenant. It is always initiated by a tenant admin and must be explicitly
accepted by an operator.

```
      (tenant admin requests)           (operator opens the tenant)
   ┌───────────────────────────┐     ┌────────────────────────────┐
   │                           │     │                            │
   ▼                           │     ▼                            │
┌─────────┐   tenant revokes   │   ┌─────────┐  operator revokes  │
│ pending │───────────────────►│──►│  active │───────────────────►│
└────┬────┘                    │   └────┬────┘                    │
     │ cron: createdAt         │        │ cron: expiresAt         │
     │ < now - 30min           ▼        │ <= now                  ▼
     └─────────────►┌─────────┐◄────────┘           ┌─────────┐
                    │ expired │                     │ revoked │
                    └─────────┘                     └─────────┘
```

States:

- **pending** — Tenant admin submitted a reason + TTL. No operator yet.
  Auto-expires after 30 minutes if nobody picks it up.
- **active** — An operator has opened the tenant and is now
  impersonating. `platformUserId` is set; `activatedAt` is stamped.
  `expiresAt` bounds the session window.
- **expired** — The cron (`/api/cron/platform-cleanup`) has flipped a
  stale pending or overdue active session. Writes
  `support_session.expired` to `platform_audit_logs`.
- **revoked** — Either the tenant (from
  `/admin/settings/support-access`) or the operator (from the Platform
  UI) cancelled the session.

Terminal states (`expired`, `revoked`) are immutable. Re-activation
requires a fresh request.

Cron cadence: `*/5 * * * *` (see `vercel.json`). The handler is
idempotent and safe to re-run.

## Audit log layout

There are **two** audit tables, and a support session produces rows in
both:

| Table                 | Owner                    | Purpose                          |
| --------------------- | ------------------------ | -------------------------------- |
| `audit_logs`          | Tenant (scoped by `tenantId`) | Tenant-visible timeline: who asked for support, who revoked. |
| `platform_audit_logs` | Platform (no `tenantId` column — uses `targetTenantId`) | Operator-visible timeline: who logged in, who activated what, who expired what. |

Actions written to `platform_audit_logs`:

- `login.success`, `login.failure`
- `mfa.enrolled`
- `platform_user.created`, `platform_user.deleted`, `platform_user.mfa_reset`
- `support_session.requested` (dual-written when tenant requests)
- `support_session.activated` (operator opens the tenant)
- `support_session.revoked` (dual-written on revoke, regardless of side)
- `support_session.expired` (cron flip)
- `impersonation.mutation` (every write performed during an active
  session — see `src/lib/platform/impersonation-context.ts`)

All platform audit writes are **fire-and-forget** via
`src/lib/platform/audit-service.ts#log`. They never block the business
operation — failures are logged to `console.error` but do not throw.

## Troubleshooting

### "I lost my MFA device / recovery codes"

Another operator must reset it from the Platform UI:

1. Log in as a separate operator.
2. Go to `/platform/platform-users`.
3. Open the user → "MFA zurücksetzen".
4. Target user re-enrolls on next login.

If no other operator exists, run:

```bash
pnpm tsx scripts/bootstrap-platform-user.ts operator@terp.de --reset-mfa
```

### "I am locked out by rate limiting"

Default limits: 5 failures/email/15 min, 20 failures/IP/15 min.
Unlocking options:

- Wait 15 minutes — the window is rolling.
- Or, from psql:
  ```sql
  DELETE FROM platform_login_attempts
  WHERE email = 'operator@terp.de' OR ip_address = '…';
  ```

### "Cookies don't stick on admin subdomain"

Check:

- `PLATFORM_COOKIE_DOMAIN` is set to `admin.terp.de` (not `.terp.de`).
- The platform UI is served **only** from `admin.terp.de`, never from
  `app.terp.de` (middleware should redirect).
- Browser is not blocking third-party cookies (the admin subdomain is
  first-party, but some strict configs still flag it).

### "`support_session.expired` never fires"

- Check Vercel cron status for `/api/cron/platform-cleanup`.
- Manually invoke:
  ```bash
  curl -i -H "Authorization: Bearer $CRON_SECRET" \
    https://admin.terp.de/api/cron/platform-cleanup
  ```
- Expect `{ "ok": true, "expired": N, "deleted": M, ... }`.

## JWT-secret rotation runbook

`PLATFORM_JWT_SECRET` signs every platform session cookie. Rotating it
invalidates all active sessions — every operator must re-login.

1. Generate a new secret:
   ```bash
   openssl rand -base64 32
   ```
2. Update Vercel (Production + Preview):
   `Settings → Environment Variables → PLATFORM_JWT_SECRET`.
3. Redeploy the platform UI.
4. Announce in #oncall: "Platform admin sessions invalidated; please
   re-login at admin.terp.de." Existing sessions will see
   `reason=invalid_signature` on the login page.
5. Monitor `platform_audit_logs` for a spike of `login.success` rows
   within ~15 minutes.

**Do not** rotate this secret during active support sessions unless
there is a security incident — revoke specific sessions instead.

## Related docs

- [Deployment](../deployment/platform-admin.md)
- Plan: `thoughts/shared/plans/2026-04-09-platform-admin-system.md`
- Research: `thoughts/shared/research/2026-04-09-platform-admin-system.md`
