# AUDIT-015 — `activityCodesKldb.search` — Input-Längen-Limit

| Field               | Value                                |
| ------------------- | ------------------------------------ |
| **Priority**        | P3                                   |
| **Category**        | 6. Input-Validation                   |
| **Severity**        | LOW                                  |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-015)   |
| **Estimated Scope** | 1 Router-File                         |

---

## Problem

Die `activityCodesKldb.search`-Query akzeptiert `input.query` ohne Längen-Begrenzung. Zwar wird der Wert sauber über das Prisma-Tagged-Template-Pattern parametrisiert (kein SQLi), aber (a) ein extrem langer String sorgt über den LIKE-Prefix-Pattern für unnötige Scanner-Last auf der Postgres-Seite, (b) Postgres' `plainto_tsquery('german', ...)` kann bei sehr großen Inputs Verarbeitungszeit in Sekunden-Ordnung verbringen. Kein Security-Breach, aber trivialer DoS-Vektor für jeden tenantProcedure-authorisierten User.

## Root Cause

Fehlendes `.min()` / `.max()` im Zod-Schema der Eingabe:

```ts
// ❌ src/trpc/routers/activityCodesKldb.ts (Input-Schema, ohne Längen-Cap)
.input(z.object({
  query: z.string(),        // ⚠️ keine Limits
  limit: z.number().optional(),
}))
```

## Required Fix

```ts
// ✅
.input(z.object({
  query: z.string().min(2).max(100),
  limit: z.number().int().min(1).max(100).optional(),
}))
```

## Affected Files

| File                                              | Line(s) | Specific Issue                          |
| ------------------------------------------------- | ------- | --------------------------------------- |
| `src/trpc/routers/activityCodesKldb.ts`           | 20-40 (Input-Schema) | Kein Längen-/Range-Cap auf `query` und `limit` |

## Verification

### Automated

- [ ] Unit-Test: `activityCodesKldb.search({ query: "" })` → `TRPCError BAD_REQUEST` (min 2)
- [ ] Unit-Test: `activityCodesKldb.search({ query: "a".repeat(500) })` → `TRPCError BAD_REQUEST` (max 100)
- [ ] Bestehender Happy-Path-Test bleibt grün (z.B. `query: "Softwareentwicklung"`)
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] UI-Seite mit Activity-Code-Suche (z.B. Onboarding-Wizard) funktioniert weiterhin normal
- [ ] Burp-Repeater-Versuch mit 10.000-Zeichen-Query → 400-Response

## What NOT to Change

- SQL-Pattern (plainto_tsquery + LIKE) — bleibt unverändert
- `activity_codes_kldb` ist öffentliche Referenzdaten — keine Tenant-Isolation nötig
- Andere Reference-Data-Routers (`healthInsuranceProviders` etc.) — separater Check, falls gewünscht

## Notes for Implementation Agent

- Die `min(2)`-Untergrenze entspricht der typischen UX für Autocomplete: erst ab 2 Zeichen suchen. Falls das Frontend bereits clientseitig so verfährt, ist die Untergrenze rein defensive Server-Side-Duplizierung.
- `limit` ist im Code mit `?? 20` defaulted (`activityCodesKldb.ts:42`). `.max(100)` verhindert zu teure Einzelanfragen; `.min(1)` fängt negative Werte ab.
- Falls andere Reference-Data-Routers denselben unbounded-Pattern zeigen (grep nach `.input(z.object({ query: z.string()`), separat auflisten — NICHT in diesem PR fixen (Scope-Creep).
