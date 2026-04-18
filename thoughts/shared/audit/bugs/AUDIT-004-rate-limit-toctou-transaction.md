# AUDIT-004 — Rate-Limit-TOCTOU-Race in Platform-Login schließen

| Field               | Value                                             |
| ------------------- | ------------------------------------------------- |
| **Priority**        | P2                                                |
| **Category**        | 3. Auth + Session                                  |
| **Severity**        | MEDIUM                                            |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-004)                |
| **Estimated Scope** | 1 Util-File + 1 Service-File + Test               |

---

## Problem

Das DB-Counter-Rate-Limit für Platform-Login prüft `count()` und schreibt `recordAttempt` in getrennten, nicht-atomaren Schritten. Unter gleichzeitigen Requests aus derselben IP sehen alle Checks noch den alten Zählerstand und passieren die Schwelle, bevor auch nur ein `recordAttempt`-Row persistiert ist. Damit bekommt ein Angreifer einen Brute-Force-Multiplikator gegen das MAX_PER_IP=20 / MAX_PER_EMAIL=5-Limit. Kein Full-Bypass, aber eine messbare Amplifikation, die die Wirksamkeit des Limits auf ~50% reduziert.

## Root Cause

Klassisches Check-then-Act ohne Transaktion:

```ts
// ❌ src/lib/platform/rate-limit.ts:32-55
export async function checkLoginRateLimit(
  prisma: PrismaClient,
  email: string,
  ipAddress: string
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS)

  const [emailFails, ipFails] = await Promise.all([
    prisma.platformLoginAttempt.count({ where: { email, success: false, attemptedAt: { gte: since } } }),
    prisma.platformLoginAttempt.count({ where: { ipAddress, success: false, attemptedAt: { gte: since } } }),
  ])

  if (emailFails >= MAX_PER_EMAIL) return { allowed: false, reason: "email_locked", ... }
  if (ipFails >= MAX_PER_IP)       return { allowed: false, reason: "ip_locked", ... }
  return { allowed: true }
}
```

`recordAttempt` (L64-76) läuft separat — zwischen `count()` und `create()` liegt das gesamte Password-Hashing + optionale TOTP-Validierung.

## Required Fix

Zwei Optionen zur Wahl; Entwickler wählt die, die in die bestehende Codebase am besten passt:

**Option A — Atomic increment mit Check per `$transaction`:**

```ts
// ✅ Pseudo
await prisma.$transaction(async (tx) => {
  const since = new Date(Date.now() - WINDOW_MS)
  const [emailFails, ipFails] = await Promise.all([
    tx.platformLoginAttempt.count({ where: { email, success: false, attemptedAt: { gte: since } } }),
    tx.platformLoginAttempt.count({ where: { ipAddress, success: false, attemptedAt: { gte: since } } }),
  ])
  if (emailFails >= MAX_PER_EMAIL) throw new RateLimitedError(WINDOW_MS, "email_locked")
  if (ipFails >= MAX_PER_IP) throw new RateLimitedError(WINDOW_MS, "ip_locked")
  // ✅ Sofort einen "pending"-Attempt-Row anlegen, damit parallele Requests im gleichen Fenster inkrementieren
  return tx.platformLoginAttempt.create({ data: { email, ipAddress, success: false, failReason: "pending" } })
}, { isolationLevel: "Serializable" })
```

Dann am Ende: `pending` → `success`/`failReason` updaten, statt einen zweiten Row zu schreiben.

**Option B — Advisory-Lock per Postgres:**

```ts
// ✅ $queryRaw mit pg_advisory_xact_lock pro (email, ip_hash)
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${email}), hashtext(${ipAddress}))`
// ... count + check + write innerhalb derselben Transaktion
```

## Affected Files

| File                                                 | Line(s) | Specific Issue                                     |
| ---------------------------------------------------- | ------- | -------------------------------------------------- |
| `src/lib/platform/rate-limit.ts`                     | 32-76   | Check + record in zwei nicht-atomaren Operationen  |
| `src/lib/platform/login-service.ts`                  | 132-141 | `enforceRateLimit` ruft die unsichere API          |
| `src/lib/platform/login-service.ts`                  | 114-130 | `recordFailureAndThrow` — passt auf neues API an   |
| `src/lib/platform/__tests__/rate-limit.test.ts`      | —       | Test-File existiert evtl. nicht; ggf. neu anlegen  |

## Verification

### Automated

- [ ] Neuer Test: 25 parallele `passwordStep`-Calls mit falschem Passwort von derselben IP → max. 20 Failures als `bad_password`, Rest als `RateLimitedError` geworfen
- [ ] Neuer Test: 10 parallele Calls mit derselben Email → max. 5 Failures als `bad_password`, Rest als `RateLimitedError`
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Aus einer Burp/curl-Loop 30 parallele Login-Versuche mit falschem Passwort absetzen → Serverlog zeigt nach spätestens 20 echten Attempts nur noch `TOO_MANY_REQUESTS`
- [ ] `platform_login_attempts`-Tabelle nach Test: höchstens 20 Rows mit `fail_reason = 'bad_password'` innerhalb des Fensters (nicht 30)

## What NOT to Change

- Rate-Limit-Konstanten (`MAX_PER_EMAIL = 5`, `MAX_PER_IP = 20`, `WINDOW_MS = 15min`) — nur die Atomarität wird gefixt
- Audit-Log-Side-Effects in `finishSuccessfulLogin` (L172-182) — laufen außerhalb des Rate-Limit-Scopes
- Der Cleanup-Cron für `platform_login_attempts`-Rows älter als 30 Tage — separater Zuständigkeitsbereich

## Notes for Implementation Agent

- Die Test-Suite für `rate-limit.ts` prüft vermutlich nur sequentielle Aufrufe. Parallelitäts-Test mit echter DB und `Promise.all` bauen — gleiches Muster wie AUDIT-001.
- Serializable-Isolation in Postgres kann unter Last zu `40001 serialization_failure` führen. Retry-Wrapper (max 3 Versuche mit kleinem Backoff) sinnvoll — existiert evtl. bereits im Repo, vor Neu-Implementierung grep nach `prisma.$transaction.*Serializable` oder `retryOnConflict`.
- Bei der "pending"-Row-Variante muss der neue `failReason`-Wert in die bestehenden Statistik-Queries (falls vorhanden) einfließen — grep nach `platformLoginAttempt.groupBy` und prüfen.
- Alternative Implementation ohne Transaktion: ein `recentFailures`-COUNT direkt im `recordAttempt` + Check-in-place per `upsert`. Die einfachere Variante bevorzugen, solange Tests grün werden.
- Bei Option B (Advisory-Lock) `pg_advisory_xact_lock` mit zwei `bigint`-Args nutzen (`hashtext` liefert `int4`, muss kombiniert werden). Ggf. auf `pg_advisory_xact_lock(bigint)` mit `hashtextextended` zurückfallen.
