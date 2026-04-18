# AUDIT-014 — `supportSession.getById` auf Operator-Owner scopen

| Field               | Value                                |
| ------------------- | ------------------------------------ |
| **Priority**        | P3                                   |
| **Category**        | 2. Platform-Auth                      |
| **Severity**        | LOW (Info-Disclosure intern)          |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-014)   |
| **Estimated Scope** | 1 Router-File                         |

---

## Problem

`platformAuthedProcedure.query supportSession.getById` führt einen `findUnique({ where: { id: input.id } })` aus, ohne auf `platformUserId === ctx.platformUser.id` zu prüfen. Jeder authentifizierte Platform-Operator kann damit SupportSession-Metadaten eines anderen Operators einsehen, sofern er die Session-ID kennt. Session-IDs sind UUIDs (Enumeration unpraktisch), aber Leak-Pfade sind real: Audit-Log-Exports, E-Mail-Benachrichtigungen, Debug-Ausgaben. Der Schaden ist tenant-extern (kein Cross-Tenant-Data-Leak), aber innerhalb des Platform-Operator-Kollektivs verletzt es das Least-Privilege-Prinzip — Operator A sollte nicht stillschweigend beobachten können, wann Operator B welchen Kundentenant impersoniert.

## Root Cause

Query ohne Owner-Filter:

```ts
// ❌ src/trpc/platform/routers/supportSessions.ts:82-100
getById: platformAuthedProcedure
  .input(z.object({ id: uuid }))
  .query(async ({ ctx, input }) => {
    const session = await ctx.prisma.supportSession.findUnique({
      where: { id: input.id },   // ⚠️ keine Scope-Einschränkung
    })
    return session
  }),
```

## Required Fix

```ts
// ✅ src/trpc/platform/routers/supportSessions.ts:82-100
getById: platformAuthedProcedure
  .input(z.object({ id: uuid }))
  .query(async ({ ctx, input }) => {
    const session = await ctx.prisma.supportSession.findFirst({
      where: {
        id: input.id,
        platformUserId: ctx.platformUser.id,  // ⚠️ Only the operator who created it
      },
    })
    return session  // null, wenn Operator nicht Owner — einheitlich zum Not-Found-Fall
  }),
```

Falls ein expliziter Admin-Modus gewünscht ist (z.B. Platform-Superadmin sieht alle Sessions), als separate Permission (`platform_support_sessions.view_all`) einziehen — Defaults bleiben restriktiv.

## Affected Files

| File                                              | Line(s) | Specific Issue                                    |
| ------------------------------------------------- | ------- | ------------------------------------------------- |
| `src/trpc/platform/routers/supportSessions.ts`    | 82-100  | `getById` ohne Owner-Filter                       |
| `src/trpc/platform/routers/__tests__/supportSessions.test.ts` (falls vorhanden) | — | Negativ-Test für Cross-Operator-Zugriff |

## Verification

### Automated

- [ ] Neuer Unit-Test: Zwei Platform-Operators, Operator A erzeugt Session S, Operator B ruft `getById({ id: S })` → `null` oder `TRPCError NOT_FOUND`
- [ ] Bestehender Test: Operator A ruft `getById` für eigene Session → erhält Session-Daten
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Staging: Operator A startet SupportSession → Operator B versucht über URL mit kopierter Session-ID die `getById`-Query → erhält kein Ergebnis
- [ ] `platform_audit_logs` bleibt unverändert (kein neuer Event-Typ)

## What NOT to Change

- Andere SupportSession-Endpunkte (`list`, `activate`, `deactivate`) — in `activate` gibt es bereits Operator-Scope
- Impersonation-Mechanismus in `src/trpc/init.ts` — unverändert
- Audit-Log-Events beim Session-Start/-Ende
- Permission-Catalog — kein neues Permission in diesem Ticket

## Notes for Implementation Agent

- `findFirst` statt `findUnique`, weil das Unique-Constraint auf `id` allein existiert; mit dem zusätzlichen Filter wird aus `findUnique` syntaktisch ein `findFirst`. Rückgabe-Shape bleibt identisch.
- Beim Ausschluss: `null` zurückgeben ist UX-technisch äquivalent zum Not-Found und vermeidet Existenz-Enumeration (Operator B bekommt dieselbe Antwort, ob die ID existiert oder nicht). Im Test das explizit prüfen.
- Falls später ein "Superadmin sieht alle Sessions"-Feature gewünscht ist: separate Permission `platform_support_sessions.view_all` einführen und via `ctx.platformUser.permissions.includes(...)` ergänzen. NICHT in diesem Ticket.
- Das `platform_audit_logs`-Log bekommt keinen neuen Eintrag — Access-Denial ist ein Non-Event, um die Log-Tabelle nicht mit Scanning-Noise zu fluten.
