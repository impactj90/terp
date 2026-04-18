# AUDIT-003 — TOTP-Enrollment-Secret aus JWT in verschlüsselte DB-Spalte verschieben

| Field               | Value                                                           |
| ------------------- | --------------------------------------------------------------- |
| **Priority**        | P1                                                              |
| **Category**        | 3. Auth + Session                                                |
| **Severity**        | HIGH                                                            |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-003)                              |
| **Estimated Scope** | 1 Migration + 3 Service-Files + Test-Erweiterung                |

---

## Problem

Nach erfolgreicher Passwort-Prüfung eines Platform-Admins ohne MFA-Enrollment gibt `passwordStep` ein signiertes, aber nicht verschlüsseltes JWT zurück, das `secretBase32` im Plaintext-Claim trägt. Der Token ist 5 Minuten gültig, ist weder IP- noch Session-gebunden und weder einmal-verwendbar markiert. Ein Angreifer, der Passwort + Enrollment-Token in diesem Fenster besitzt (z.B. per Phishing-Link oder MitM im Bootstrap-Deployment), kann vor dem legitimen User TOTP enrollen, das MFA-Secret dauerhaft persistieren und das Platform-Admin-Konto übernehmen. Blast-Radius: Impersonation in alle Tenants.

## Root Cause

Das Secret reist im JWT-Claim mit:

```ts
// ❌ src/lib/platform/jwt.ts:109-116
export interface MfaEnrollmentClaims {
  sub: string
  email: string
  displayName: string
  secretBase32: string  // ⚠️ im JWT-Body base64-lesbar
}
```

```ts
// ❌ src/lib/platform/login-service.ts:221-238
const secretBase32 = generateSecret()
const enrollmentToken = await signMfaEnrollmentToken({
  sub: user.id,
  email: user.email,
  displayName: user.displayName,
  secretBase32,  // ⚠️ zum Client gespiegelt, keine DB-Persistenz
})
return {
  status: "mfa_enrollment_required",
  enrollmentToken,
  secretBase32,
  otpauthUri: buildUri(user.email, secretBase32),
}
```

`mfaEnrollStep` (L251-308) verifiziert nur die JWT-Signatur und `user.mfaEnrolledAt == null` — kein Bezug auf den anfordernden Client.

## Required Fix

Das Secret server-seitig in einer verschlüsselten Spalte auf `platform_users` halten. Der Token transportiert nur noch eine Referenz (z.B. einen einmaligen `enrollmentTokenHash`).

```sql
-- ✅ supabase/migrations/<timestamp>_platform_user_pending_mfa.sql
ALTER TABLE platform_users
  ADD COLUMN pending_mfa_secret TEXT,              -- encrypted via field-encryption
  ADD COLUMN pending_mfa_token_hash TEXT,          -- SHA-256 of the raw token
  ADD COLUMN pending_mfa_expires_at TIMESTAMPTZ;
```

```ts
// ✅ src/lib/platform/login-service.ts (skizziert)
// passwordStep:
const secretBase32 = generateSecret()
const rawToken = crypto.randomBytes(32).toString("base64url")
await prisma.platformUser.update({
  where: { id: user.id },
  data: {
    pendingMfaSecret: encryptField(secretBase32),
    pendingMfaTokenHash: sha256(rawToken),
    pendingMfaExpiresAt: new Date(Date.now() + 5 * 60_000),
  },
})
return {
  status: "mfa_enrollment_required",
  enrollmentToken: rawToken,  // nur Token, kein Secret
  secretBase32,                // weiterhin im QR-Code zum einmaligen Scannen
  otpauthUri: buildUri(user.email, secretBase32),
}

// mfaEnrollStep:
const u = await prisma.platformUser.findUnique({ where: { id: ... } })
// Atomarer Consume: Token-Hash match, expires, und noch nicht enrolled
const { count } = await prisma.platformUser.updateMany({
  where: {
    id: u.id,
    pendingMfaTokenHash: sha256(enrollmentToken),
    pendingMfaExpiresAt: { gt: new Date() },
    mfaEnrolledAt: null,
  },
  data: {
    mfaSecret: u.pendingMfaSecret,   // dauerhaft übernehmen
    mfaEnrolledAt: new Date(),
    recoveryCodes: hashedRecoveryCodes,
    pendingMfaSecret: null,
    pendingMfaTokenHash: null,
    pendingMfaExpiresAt: null,
  },
})
if (count === 0) throw new InvalidCredentialsError()
```

## Affected Files

| File                                                | Line(s)   | Specific Issue                                      |
| --------------------------------------------------- | --------- | --------------------------------------------------- |
| `supabase/migrations/<new>.sql` (NEU)               | —         | Neue Spalten auf `platform_users`                   |
| `prisma/schema.prisma`                              | —         | `PlatformUser` um drei Felder erweitern             |
| `src/lib/platform/jwt.ts`                           | 109-151   | `MfaEnrollmentClaims` + `signMfaEnrollmentToken` entfernen oder auf Reference-Only ändern |
| `src/lib/platform/login-service.ts`                 | 221-247   | `passwordStep` schreibt pending-Zustand in DB       |
| `src/lib/platform/login-service.ts`                 | 251-308   | `mfaEnrollStep` konsumiert Token atomisch          |
| `src/lib/platform/__tests__/login-service.test.ts`  | —         | Test: Token ohne Secret, Token-Replay blockiert, Race zwischen zwei Enroll-Versuchen |

## Verification

### Automated

- [ ] Migration läuft idempotent: `pnpm db:reset` + `pnpm prisma migrate dev`
- [ ] `pnpm vitest run src/lib/platform/__tests__/login-service.test.ts` inkl. neuer Tests:
  - Token enthält kein `secretBase32` (decode JWT/raw-bytes)
  - Zweiter Enroll-Versuch mit bereits konsumiertem Token → `InvalidCredentialsError`
  - Abgelaufener Token (pending_mfa_expires_at < now) → `InvalidCredentialsError`
- [ ] `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Frischen Platform-User über `scripts/bootstrap-platform-user.ts` anlegen
- [ ] Login-Flow Schritt 1: `passwordStep` → Response-Body enthält Token, kein `secretBase32` im Token-Payload (Browser-Devtools: JWT/Raw decoden)
- [ ] QR-Code zeigt funktionierenden Secret; Authenticator-App enrollt
- [ ] Nachdem `mfaEnrollStep` erfolgreich war: `platform_users.pending_mfa_*`-Spalten sind `NULL`, `mfa_secret` und `mfa_enrolled_at` gesetzt
- [ ] Zweiter `mfaEnrollStep`-Call mit demselben Token → HTTP 401 / `InvalidCredentialsError`

## What NOT to Change

- `signMfaChallengeToken` / `verifyMfaChallengeToken` (L153-178) — nur der Enrollment-Pfad ist betroffen
- `mfaVerifyStep` (Recovery-Code-Pfad) — siehe AUDIT-001
- `FIELD_ENCRYPTION_KEY_V1`-Rotation — hier nur als User des vorhandenen Helpers
- Session-JWT-Laufzeit (4h absolut, 30min idle) — unverändert

## Notes for Implementation Agent

- Vorhandener Field-Encryption-Helper liegt in `src/lib/services/field-encryption.ts` (aus SEC-008-Kontext). Import-Pfad vor Verwendung verifizieren.
- SHA-256-Hashing des Tokens: Node-Builtin `crypto.createHash("sha256")` reicht — keine neue Dependency nötig. Auf Timing-Safe-Compare achten (`crypto.timingSafeEqual`), falls Token direkt verglichen wird; aber der `updateMany`-mit-Hash-Pattern erledigt das implizit über DB-Index.
- Bei der Migration `pending_mfa_*`-Spalten NULLABLE lassen — bestehende enrolled Users haben diese Felder nie befüllt.
- Der `buildUri(email, secret)`-Aufruf bleibt identisch — das OTP-URI-Secret ist weiterhin notwendig für den QR-Code. Es verlässt den Server einmal im Response-Body (für den Browser), wird aber NICHT mehr im Token persistiert.
- Test mit paralleler Enroll-Race aufbauen: zwei Threads, beide versuchen `mfaEnrollStep` mit demselben Token → exakt einer gewinnt, der andere bekommt `InvalidCredentialsError`. Muster wie in AUDIT-001.
- Weiterhin gilt: Login-Attempts (failed/successful) werden in `platform_login_attempts` erfasst; neue Spalten brauchen dort KEINE Erweiterung.
