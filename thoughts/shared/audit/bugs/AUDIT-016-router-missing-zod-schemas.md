# AUDIT-016 — Zod-Schemas für schema-lose tRPC-Mutationen ergänzen

| Field               | Value                                    |
| ------------------- | ---------------------------------------- |
| **Priority**        | P3                                       |
| **Category**        | 6. Input-Validation                       |
| **Severity**        | LOW                                      |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-016)       |
| **Estimated Scope** | 5 Router-Files                            |

---

## Problem

Mehrere tRPC-Mutationen sind ohne `.input(z.*)` deklariert. In den meisten Fällen ist das harmlos — die Mutation erwartet kein Payload (`logout`, `clearAll`). Kritisch ist aber `users.updateMyProfile`: ohne Schema wird jedes Input-Objekt akzeptiert, und der Service ist nur so sicher wie sein interner Whitelist-Check. Wenn dort jemand `{ ...input }`-Spread einbaut, kann ein User-Rechte-Escalate (`role`, `isAdmin`, `userGroupId`) möglich werden. Für die reinen No-Arg-Mutationen ist ein explizites `z.undefined()`-Schema sinnvoll, um zukünftige Regressions auszuschließen.

## Root Cause

Fehlende `.input(...)`-Deklaration:

```ts
// ❌ src/trpc/routers/users.ts:417
updateMyProfile: protectedProcedure
  .mutation(async ({ ctx, input }) => {
    // ⚠️ input ist `unknown`; Service muss selbst filtern
    return updateProfile(ctx.prisma, ctx.user!.id, input)
  }),
```

```ts
// ❌ src/trpc/routers/notifications.ts:228 (ähnlich in auth, payrollWages)
clearAll: tenantProcedure.mutation(async ({ ctx }) => { ... })
```

## Required Fix

Für `updateMyProfile`: explizites Allow-List-Schema mit allen erlaubten Feldern.

```ts
// ✅ src/trpc/routers/users.ts:417
updateMyProfile: protectedProcedure
  .input(z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().max(50).optional(),
    locale: z.enum(["de", "en"]).optional(),
    // KEINE: role, isAdmin, userGroupId, tenantId, permissions
  }))
  .mutation(async ({ ctx, input }) => {
    return updateProfile(ctx.prisma, ctx.user!.id, input)
  }),
```

Für die No-Arg-Mutationen: `z.undefined()` oder `z.void()`, damit ungültiger Payload rejected wird.

```ts
// ✅
clearAll: tenantProcedure
  .input(z.void())
  .mutation(async ({ ctx }) => { ... }),
```

## Affected Files

| File                                    | Line(s) | Specific Issue                                       |
| --------------------------------------- | ------- | ---------------------------------------------------- |
| `src/trpc/routers/users.ts`             | 417     | `updateMyProfile` — kritisch, Allow-List erforderlich |
| `src/trpc/routers/auth.ts`              | 95      | `logout` — No-Arg, `z.void()` einziehen              |
| `src/trpc/routers/notifications.ts`     | 228     | `clearAll` — No-Arg                                  |
| `src/trpc/routers/payrollWages.ts`      | 40      | `recalculateAll` — No-Arg? Ggf. Cursor/Scope-Arg nötig |
| `src/trpc/routers/payrollWages.ts`      | 81      | `export` — Export-Parameter (Zeitraum, Format) fehlen? |
| `src/trpc/platform/routers/auth.ts`     | 151     | `logout` — No-Arg, `z.void()`                        |

## Verification

### Automated

- [ ] Unit-Test: `users.updateMyProfile({ role: "admin" })` → `TRPCError BAD_REQUEST` (Feld nicht im Schema)
- [ ] Unit-Test: `users.updateMyProfile({ firstName: "Test" })` → Happy Path
- [ ] Unit-Test: `auth.logout(undefined)` → OK; `auth.logout({ anything: true })` → `TRPCError BAD_REQUEST`
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] UI "Profil bearbeiten" speichert Daten wie bisher
- [ ] Burp-Repeater schickt zusätzliches `role`-Feld → 400
- [ ] Logout-Button funktioniert; Response identisch zu vorher
- [ ] `payrollWages.recalculateAll` / `export`: mit dem Frontend-Flow testen — prüfen, ob dort wirklich kein Input gebraucht wird oder ob ein Zeitraum übergeben werden sollte

## What NOT to Change

- Der Service-Layer von `updateProfile` — der sollte weiterhin defensive Feld-Whitelist haben (Belt-and-Suspenders)
- Andere Mutations mit bereits existierenden Zod-Schemas
- Query-Endpunkte (nicht Teil dieses Tickets — Queries dürfen ohne Input laufen)

## Notes for Implementation Agent

- Für `updateMyProfile` unbedingt die existierende Implementierung (`updateProfile` in `src/lib/services/users-service.ts`) lesen, bevor das Allow-List-Schema festgelegt wird — um Existenz-Felder nicht zu verpassen, aber auch keine neuen Felder fälschlich zuzulassen.
- Fallback-Pattern: wenn eine Mutation intern Felder hat, die normale User nicht setzen dürfen, Admin-Variante als separaten Endpunkt (`updateUserProfileAsAdmin`) mit eigenem Schema anlegen — NICHT im selben Endpunkt über Permission-Checks verzweigen.
- `payrollWages.recalculateAll` und `payrollWages.export` sind potenziell expensive. Falls sie tatsächlich ohne Argumente alle Mitarbeiter prozessieren, kommentieren, dass der Scope explizit "alles" ist; ggf. per Permission stärker einschränken.
- `z.void()` vs. `z.undefined()` — in tRPC v10+ ist `z.undefined()` kompatibler; Client serialisiert `undefined` als leeren Body. `z.void()` kann in manchen Adaptern Probleme machen.
