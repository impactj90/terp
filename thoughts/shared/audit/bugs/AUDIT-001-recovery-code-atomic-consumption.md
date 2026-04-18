# AUDIT-001 — Recovery-Code-Consumption atomisch machen

| Field               | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| **Priority**        | P1                                                           |
| **Category**        | 3. Auth + Session                                            |
| **Severity**        | HIGH                                                         |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-001)                          |
| **Estimated Scope** | 1 Service-File + 1 Test-File                                 |

---

## Problem

`mfaVerifyStep` im Platform-Login verbraucht Recovery-Codes in zwei getrennten DB-Operationen: erst Read der bestehenden Code-Liste, dann Write der gekürzten Liste. Dazwischen liegt keine Transaktion und kein Row-Lock. Damit kann ein Angreifer, der EINEN gültigen Recovery-Code besitzt (z.B. aus dem One-Time-Display-Screen abgefangen), durch N parallele Login-Requests N gültige Platform-Admin-Sessions erzeugen — der Code wird effektiv mehrfach verwertet, bevor er aus der Liste entfernt ist. Da Platform-Admin-Zugang Impersonation in alle Tenants ermöglicht, ist das Blast-Radius maximal.

## Root Cause

Read-then-Write-Pattern ohne Transaktion:

```ts
// ❌ src/lib/platform/login-service.ts:359-379
const storedHashes = (user.recoveryCodes as unknown as string[] | null) ?? []
const consume = await consumeRecoveryCode(storedHashes, input.recoveryCode!)
if (!consume.matched) {
  await recordFailureAndThrow(prisma, claims.email, ipAddress, "bad_recovery_code")
}

return finishSuccessfulLogin(
  prisma,
  { id: user.id, email: user.email, displayName: user.displayName },
  ipAddress,
  userAgent,
  {
    // ⚠️ Write wird via finishSuccessfulLogin → prisma.platformUser.update (L164)
    //     ausgeführt, ohne SELECT FOR UPDATE oder Row-Version-Check.
    recoveryCodes: consume.remaining as unknown as Prisma.InputJsonValue,
  },
)
```

Der `prisma.platformUser.update` in `finishSuccessfulLogin` (`login-service.ts:164-171`) ist ein reiner Overwrite, keine conditional-update.

## Required Fix

Den kompletten Recovery-Code-Pfad in eine Transaktion mit pessimistischem Lock kapseln (`SELECT ... FOR UPDATE` via raw SQL oder Prisma's `$transaction` mit Serializable-Isolation). Alternativ: `updateMany({ where: { id, recoveryCodes: { path: [], equals: storedHashes } }, data: { recoveryCodes: remaining } })` — Version-Check über die bestehende Code-Liste selbst (der Write schlägt fehl, wenn ein paralleler Request bereits gekürzt hat).

```ts
// ✅ Beispiel mit optimistic-lock-by-value
const consume = await consumeRecoveryCode(storedHashes, input.recoveryCode!)
if (!consume.matched) {
  await recordFailureAndThrow(prisma, claims.email, ipAddress, "bad_recovery_code")
}

// Atomarer Swap: nur erfolgreich, wenn die Spalte noch exakt unseren Read-Snapshot hält.
const { count } = await prisma.platformUser.updateMany({
  where: {
    id: user.id,
    recoveryCodes: { equals: storedHashes as unknown as Prisma.InputJsonValue },
  },
  data: { recoveryCodes: consume.remaining as unknown as Prisma.InputJsonValue },
})

if (count === 0) {
  // Paralleler Request war schneller — Code wurde bereits verbraucht.
  await recordFailureAndThrow(prisma, claims.email, ipAddress, "bad_recovery_code")
}

return finishSuccessfulLogin(
  prisma,
  { id: user.id, email: user.email, displayName: user.displayName },
  ipAddress,
  userAgent,
  // recoveryCodes NICHT nochmals schreiben — bereits via updateMany oben persistiert.
)
```

Alternative: `prisma.$transaction(async (tx) => { ... }, { isolationLevel: "Serializable" })`.

## Affected Files

| File                                              | Line(s) | Specific Issue                                         |
| ------------------------------------------------- | ------- | ------------------------------------------------------ |
| `src/lib/platform/login-service.ts`               | 312-380 | `mfaVerifyStep` — Recovery-Code-Pfad nicht atomar      |
| `src/lib/platform/login-service.ts`               | 157-191 | `finishSuccessfulLogin` — Overwrite ohne Version-Check |
| `src/lib/platform/__tests__/login-service.test.ts`| —       | Test für parallelen Recovery-Code-Konsum fehlt         |

## Verification

### Automated

- [ ] `pnpm vitest run src/lib/platform/__tests__/login-service.test.ts` — bestehende Tests grün
- [ ] Neuer Test: 20 parallele `mfaVerifyStep`-Calls mit demselben Recovery-Code → genau 1 Success, 19 `InvalidMfaTokenError`
- [ ] `pnpm typecheck` — keine Type-Fehler
- [ ] `pnpm lint` — keine Lint-Fehler

### Manual

- [ ] Platform-Admin mit enrolled MFA: Login mit gültigem Recovery-Code → 1 Session aktiv
- [ ] Prüfen, dass `platform_users.recovery_codes` nach Konsum eine Stelle kürzer ist
- [ ] Zweiter Login-Versuch mit demselben Recovery-Code → `InvalidMfaTokenError` (uniform)
- [ ] `platform_login_attempts` enthält für jeden fehlgeschlagenen parallelen Versuch einen `bad_recovery_code`-Row

## What NOT to Change

- Recovery-Code-Generierung (`generateRecoveryCodes`) und Hashing (`hashRecoveryCodes`) — nur der Consumption-Pfad wird gefixt
- Die TOTP-Token-Pfad in `mfaVerifyStep` (L346-357) — dort gibt es kein Shared-State-Race, weil TOTP-Codes pro 30s-Window zeitbasiert sind
- `mfaEnrollStep` — separate Kontrolle (siehe AUDIT-003)
- Rate-Limit-Logik — separates Ticket (siehe AUDIT-004)

## Notes for Implementation Agent

- Das Vor-Pattern `updateMany({ where: { ...equals-value } })` ist Prisma's Standard-Mechanismus für optimistic-lock-by-value ohne explizites `@version`-Feld. Prüfen, ob `recoveryCodes` als `Json`-Feld so vergleichbar ist — notfalls auf eine String-Serialisierung mit `JSON.stringify` zurückfallen und dediziertes `version`-Feld ergänzen.
- Bei der Wahl zwischen `$transaction`/Serializable und `updateMany`/optimistic: in Postgres ist `updateMany` mit `equals` auf ein `Json`-Feld simpler und liefert die gleiche Atomarität. Entwickler sollte beide Optionen prüfen und die einfachere mit dem Pattern abgleichen, das anderswo in `src/lib/services/billing-document-service.ts:395-410` (`updateMany where status=DRAFT`) bereits erfolgreich verwendet wird.
- Die Test-Suite für `login-service` prüft sequentielles Verhalten — neuer Parallelitäts-Test muss `Promise.all` + echte DB (kein Mock) verwenden. Siehe `src/lib/platform/__tests__/` für vorhandene DB-basierte Test-Setup-Helfer.
- Beim Schlag auf `count === 0` muss `recordFailureAndThrow` mit `bad_recovery_code` verwendet werden, damit Rate-Limit-Counter korrekt erhöht wird (verhindert Race-Amplifikation bei Brute-Force-Versuchen).
