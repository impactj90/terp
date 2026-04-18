# AUDIT-017 — ESLint-Regel gegen `$queryRawUnsafe`/`$executeRawUnsafe`

| Field               | Value                                |
| ------------------- | ------------------------------------ |
| **Priority**        | P3                                   |
| **Category**        | 1. Tenant-Isolation (Regression-Prävention) |
| **Severity**        | INFORMATIVE                          |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-017)   |
| **Estimated Scope** | 1 ESLint-Config-File                  |

---

## Problem

Der Audit hat bestätigt: Terp verwendet aktuell **nirgends** `$queryRawUnsafe` oder `$executeRawUnsafe` — alle Raw-SQL-Queries laufen sicher über Prisma's Tagged-Template-Syntax oder `Prisma.sql`. Es fehlt aber die automatische Regression-Prävention: ein Dev, der beim Refactoring aus Bequemlichkeit zu einer Unsafe-Variante greift, würde das erst im Code-Review (oder nie) bemerken. Eine Lint-Regel kippt das Risiko auf Null.

## Root Cause

Kein `no-restricted-syntax` (oder `no-restricted-imports`/`no-restricted-properties`) gegen die problematischen Prisma-Methoden:

```jsonc
// ❌ eslint.config.mjs / .eslintrc — keine Regel gegen $queryRawUnsafe
```

## Required Fix

Neue `no-restricted-syntax`-Regel hinzufügen:

```js
// ✅ eslint.config.mjs
{
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "MemberExpression[property.name='$queryRawUnsafe']",
        message: "Use prisma.$queryRaw with tagged-template literals (parameterized) or Prisma.sql for composition. $queryRawUnsafe bypasses parametrization and is a SQL-injection risk.",
      },
      {
        selector: "MemberExpression[property.name='$executeRawUnsafe']",
        message: "Use prisma.$executeRaw with tagged-template literals instead of $executeRawUnsafe.",
      },
    ],
  },
}
```

## Affected Files

| File                         | Line(s) | Specific Issue                     |
| ---------------------------- | ------- | ---------------------------------- |
| `eslint.config.mjs` (oder `.eslintrc.json`, je nach Terp-Setup) | — | Regel gegen Unsafe-Raw-Queries fehlt |

## Verification

### Automated

- [ ] Temporär eine Test-Datei mit `prisma.$queryRawUnsafe(...)` anlegen → `pnpm lint` schlägt mit der neuen Message fehl
- [ ] Test-Datei wieder entfernen
- [ ] `pnpm lint` auf der gesamten Codebase — nach dem Commit grün (bestehender Code nutzt Unsafe-Varianten NICHT)
- [ ] `pnpm test`, `pnpm typecheck`

### Manual

- [ ] CI-Pipeline (Next.js Lint-Step) zeigt bei fiktivem PR mit `$queryRawUnsafe` die Regel-Message
- [ ] Lint-Regel gilt sowohl in `src/lib/services/**` als auch in `src/trpc/**` und `src/app/api/**`

## What NOT to Change

- Bestehende Raw-Queries — die sind bereits safe (Audit bestätigt)
- `Prisma.sql`-Wrapper — weiterhin erlaubt
- Andere Lint-Regeln oder globale Konfiguration

## Notes for Implementation Agent

- Terp verwendet vermutlich die neue Flat-Config (`eslint.config.mjs`). Vor dem Edit `cat eslint.config.mjs` prüfen, welcher Stil vorliegt. Bei Legacy-`.eslintrc`-Datei analoge Regel.
- `no-restricted-syntax` ist präziser als `no-restricted-properties`, weil es AST-basiert arbeitet und auch `someNamespace.prisma.$queryRawUnsafe(...)` matcht.
- Alternativ: `no-restricted-imports` greift nicht, weil Prisma-Methoden Instanz-Methoden sind und nicht über Named-Import kommen.
- Bei Bedarf eine Ausnahme für Test-Dateien einrichten (`overrides` mit `files: ["**/*.test.ts"]` und `"no-restricted-syntax": "off"`) — aber nur, wenn wirklich Tests das Unsafe-API brauchen. Audit hat bestätigt: keine Treffer.
- Alternativ zum `no-restricted-syntax`: Grep-Pattern im CI (`! grep -r "\\$queryRawUnsafe" src/`) als zweite Sicherung. Optional, nicht Teil des MUST.
