# AUDIT-013 — `bootstrap-platform-user.ts` gegen Prod-DB absichern

| Field               | Value                                |
| ------------------- | ------------------------------------ |
| **Priority**        | P3                                   |
| **Category**        | 3. Auth + Session                     |
| **Severity**        | LOW                                  |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-013)   |
| **Estimated Scope** | 1 Script-File                         |

---

## Problem

`scripts/bootstrap-platform-user.ts` erzeugt Platform-Admin-User direkt in der DB. Das Script liest `DATABASE_URL` aus der Env, gibt zwar eine redacted Version zur Info aus (Zeilen 138-140), hat aber keinen Runtime-Guard gegen Produktionsumgebungen. Ein CI-Job oder DevOps-Terminal, das versehentlich eine Prod-`DATABASE_URL` im Scope hat, erzeugt ohne Rückfrage einen neuen Platform-User mit vollem Tenant-Impersonation-Recht. Insider-Risk, Bootstrap-Hijacking und Environment-Confusion sind die realistischen Threat-Vectors.

## Root Cause

Keine Abfrage des Env-Modes vor dem Write:

```ts
// ❌ scripts/bootstrap-platform-user.ts (Anfang des main-Pfads, ca. L138-140)
console.log(`Targeting DATABASE_URL=${redacted}`)
// ... erzeugt sofort User, keine Bestätigung, keine Prod-Blockade
```

## Required Fix

Explizite Opt-Out-Flag + Readline-Bestätigung + Env-Check:

```ts
// ✅ scripts/bootstrap-platform-user.ts (Anfang main)
const allowProd = process.argv.includes("--confirm-prod")
const isProd =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ENV === "production" ||
  dbUrl.includes("supabase.co")  // typischer Prod-Pattern

if (isProd && !allowProd) {
  console.error(`
REFUSING to run against production DATABASE_URL.
Target host looks like a production Supabase instance.

If this is intentional, re-run with --confirm-prod.
Otherwise, set DATABASE_URL to your local/staging env first.
`)
  process.exit(2)
}

if (isProd && allowProd) {
  // Zusätzliche interaktive Bestätigung
  const readline = await import("node:readline/promises")
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(
    `Really bootstrap a platform user against PROD (${redacted})? Type 'yes' to proceed: `
  )
  rl.close()
  if (answer !== "yes") {
    console.error("Aborted.")
    process.exit(3)
  }
}
```

## Affected Files

| File                                | Line(s) | Specific Issue                         |
| ----------------------------------- | ------- | -------------------------------------- |
| `scripts/bootstrap-platform-user.ts` | ~138-140 | Kein Prod-Guard, kein interaktives OK  |

## Verification

### Automated

- [ ] Unit-Test (falls Test-Infrastruktur für Scripts existiert): mit `NODE_ENV=production` ohne Flag → Exit-Code 2
- [ ] Unit-Test: mit `--confirm-prod` + interaktivem `"no"` → Exit-Code 3
- [ ] `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] `NODE_ENV=production pnpm tsx scripts/bootstrap-platform-user.ts foo@bar "Test"` → Abbruch mit Exit-Code 2
- [ ] `NODE_ENV=production pnpm tsx scripts/bootstrap-platform-user.ts foo@bar "Test" --confirm-prod` → Prompt erscheint; Enter/ctrl-C bricht ab
- [ ] Regulärer Dev-Run (`NODE_ENV=development` oder kein NODE_ENV) unverändert

## What NOT to Change

- Die eigentliche User-Creation-Logik inkl. Password-Reset-Link-Generierung — bleibt identisch
- `platform_audit_logs`-Writes — der Operator wird dort weiterhin korrekt attributiert
- Output-Format der Success-Message
- Env-Loading-Reihenfolge (`.env` → `.env.local`) — unverändert

## Notes for Implementation Agent

- Der Prod-Check basiert auf Heuristiken, weil in Terp kein zentrales `NODE_ENV`-Idiom durchgehalten wird. Mehrfach prüfen: `NODE_ENV`, `NEXT_PUBLIC_ENV`, URL-Pattern. Falsche-Positive (Staging wird als Prod erkannt) sind dem Falsch-Negativ (Prod wird als Staging erkannt) vorzuziehen.
- `readline/promises` ist seit Node 17 stable — Terp verwendet ohnehin Node 20+ (siehe `package.json`). Keine zusätzliche Dependency nötig.
- Beim `--confirm-prod`-Pfad: nach erfolgreicher Bootstrap zusätzlich `console.warn()` mit einem Hinweis auf den `platform_audit_logs`-Eintrag ausgeben, damit der Operator die Audit-Trail-Prüfung anschließt.
- Script-Parameter-Parsing: Es gibt vermutlich bereits eine minimale Argv-Konvention. Vor Einführung von `--confirm-prod` kurz `scripts/`-Verzeichnis auf Konventionen scannen und mit bestehenden Scripts konsistent bleiben.
