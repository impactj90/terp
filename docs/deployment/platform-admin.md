# Deploying the Platform Admin Subdomain

The Platform Admin UI (`admin.terp.de`) is served from the same Next.js
app as the tenant UI (`app.terp.de`). Middleware in `src/middleware.ts`
dispatches routes based on the `host` header, so deployment is mostly
about adding DNS + domain bindings, two env vars, and one bootstrap
invocation.

## Vercel setup

### 1. Add the subdomain

```
Vercel → Project → Settings → Domains
  Add Domain → admin.terp.de
```

Point it at the same deployment as `app.terp.de`. Vercel will show a
DNS instruction for `admin.terp.de` (CNAME to `cname.vercel-dns.com`).

### 2. DNS

At your DNS provider (Cloudflare / Route53 / etc.):

```
admin   CNAME   cname.vercel-dns.com.
```

TTL 3600 is fine. Verify with:

```bash
dig admin.terp.de +short
```

### 3. Environment variables

Set in **Production** and **Preview** scopes:

| Variable                 | Value                                            |
| ------------------------ | ------------------------------------------------ |
| `PLATFORM_JWT_SECRET`    | Output of `openssl rand -base64 32` — 32+ random bytes, base64-encoded. Must differ from any other JWT secret. |
| `PLATFORM_COOKIE_DOMAIN` | `admin.terp.de` (exact match; **not** `.terp.de`) |

Already set elsewhere in the project — required for platform features
too:

| Variable      | Why                                                        |
| ------------- | ---------------------------------------------------------- |
| `CRON_SECRET` | Gates `/api/cron/platform-cleanup`                         |
| `DATABASE_URL` (and `DIRECT_URL` / Supabase vars) | Prisma     |

Redeploy after setting these — Next.js env vars are baked in at build
time.

## Initial bootstrap

Platform users cannot self-register. After the first deploy, bootstrap
a single operator from a trusted dev machine:

```bash
pnpm tsx scripts/bootstrap-platform-user.ts tolga@terp.de "Tolga"
```

The script:

1. Checks the email is not already a `PlatformUser`.
2. Generates a random temporary password.
3. Hashes with Argon2id and writes to `platform_users`.
4. Prints the temporary password **once** — copy it and deliver
   out-of-band (Signal, 1Password sharing, etc.).

On first login, the operator will be forced to enroll MFA before
anything else (see `docs/platform-admin/README.md`).

Additional operators are created from the Platform UI at
`/platform/platform-users`, never via the CLI.

## Smoke checks

After the first deploy:

1. `curl -sSfI https://admin.terp.de/platform/login` → `200`.
2. Log in with the bootstrapped operator → complete MFA enrollment.
3. Manually fire the cleanup cron:
   ```bash
   curl -i -H "Authorization: Bearer $CRON_SECRET" \
     https://admin.terp.de/api/cron/platform-cleanup
   ```
   Expect `{ "ok": true, ... }`.
4. Create a test tenant, request a support session from the tenant side
   at `/admin/settings/support-access`, activate it from the platform
   side, revoke it. Verify `audit_logs` (tenant) and
   `platform_audit_logs` (platform) both received rows.

## Rolling back

Platform admin is additive — removing it is safe:

1. Remove `admin.terp.de` from Vercel domains.
2. Remove the `/api/cron/platform-cleanup` entry from `vercel.json`.
3. `PLATFORM_JWT_SECRET` and `PLATFORM_COOKIE_DOMAIN` can stay (unused).
4. The `platform_users`, `support_sessions`, `platform_audit_logs`,
   `platform_login_attempts` tables can stay — they are tenant-
   independent and do not affect the tenant app.

No migrations need to be reversed.

## Secret rotation

See [JWT-secret rotation runbook](../platform-admin/README.md#jwt-secret-rotation-runbook).
