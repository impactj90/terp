# AUDIT-008 — `FIELD_ENCRYPTION_KEY_V1` in `.env.example` dokumentieren

| Field               | Value                                             |
| ------------------- | ------------------------------------------------- |
| **Priority**        | P2                                                |
| **Category**        | 5. Encryption + Secrets                            |
| **Severity**        | MEDIUM (operational)                               |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-008)                |
| **Estimated Scope** | 1 File (`.env.example`) + optional Preflight-Check |

---

## Problem

`FIELD_ENCRYPTION_KEY_V1` ist Pflicht-Env-Variable — ohne sie wirft jeder Write-Pfad, der Feldverschlüsselung nutzt (TOTP-Secret-Write beim Platform-Login-Enrollment, evtl. weitere Tenant-Daten) zur Laufzeit eine Exception. In `.env.example` fehlt die Variable aber. Ein Operator, der `.env.example` als Template nimmt (Standard-Prozedur), setzt sie nicht und deployed in Dev/Staging/Prod mit defektem Encryption-Pfad. Das Ergebnis ist entweder (a) ein Crash beim ersten Write (laut und sichtbar, aber blockiert Nutzer), oder (b) ein zur Entwicklung schlampig hardgecodeter Test-Key im Dockerfile, der dauerhaft in Dev/Staging den Verschlüsselungs-Boundary unterwandert.

## Root Cause

Fehlender Eintrag in `.env.example`:

```bash
# ❌ .env.example (heute)
PLATFORM_JWT_SECRET=
CRON_SECRET=
INTERNAL_API_KEY=
# ⚠️ FIELD_ENCRYPTION_KEY_V1 fehlt, obwohl serverEnv.validateEnv() sie erwartet
```

Code-seitige Validierung befindet sich in `src/lib/config.ts`, aber ohne Template-Eintrag merkt ein neuer Operator das erst beim ersten Runtime-Fehler.

## Required Fix

`.env.example` um den Key + eine kurze Generation-Anleitung erweitern:

```bash
# ✅ .env.example
# Field-level encryption key (AES-256-GCM).
# Generate with: openssl rand -base64 32
# WARNUNG: Verlust dieses Keys macht alle verschlüsselten Felder (TOTP-Secrets etc.) unlesbar.
FIELD_ENCRYPTION_KEY_V1=

# Optional: aktuelle Key-Version für neue Writes (Default: 1).
# Wird bei Key-Rotation auf 2 gesetzt, nachdem FIELD_ENCRYPTION_KEY_V2 gesetzt wurde.
FIELD_ENCRYPTION_KEY_CURRENT_VERSION=1
```

Optional zusätzlich (nicht Teil des MUST): Runtime-Preflight-Check — in `src/lib/config.ts` ein frühes `throw` ergänzen, wenn der Key fehlt, mit einer klaren Fehler-Message und einem Pointer auf `.env.example`.

## Affected Files

| File             | Line(s) | Specific Issue                                    |
| ---------------- | ------- | ------------------------------------------------- |
| `.env.example`   | —       | `FIELD_ENCRYPTION_KEY_V1` und `FIELD_ENCRYPTION_KEY_CURRENT_VERSION` fehlen |
| `src/lib/config.ts` (optional) | — | Env-Validierung um einen aussagekräftigen Error ergänzen |

## Verification

### Automated

- [ ] `pnpm lint` — keine Probleme
- [ ] Optional: Pre-Commit-/CI-Check, der sicherstellt, dass jede `serverEnv`-Variable in `.env.example` vorhanden ist

### Manual

- [ ] Frisches Checkout, `cp .env.example .env.local`, Key mit `openssl rand -base64 32` generieren, eintragen
- [ ] `pnpm dev` startet ohne Warnungen
- [ ] Platform-Login-Enrollment durchspielen (einen neuen Platform-User enrollen) → TOTP-Secret wird persistiert, kein `encryptField`-Crash

## What NOT to Change

- `src/lib/services/field-encryption.ts` (Implementation) — audit hat bestätigt: IV-Handling + Versionierung korrekt
- `FIELD_ENCRYPTION_KEY_V2...V10` — erst relevant bei echter Rotation (separates Runbook-Ticket)
- Prod-Keys in einem gemanagten Vault (`.env.*.vault`) — die liegen korrekt und dürfen nicht verändert werden

## Notes for Implementation Agent

- Keine echten Werte einfügen — `.env.example` bleibt leer-value-Template. Nur Variablen-Name + Kommentar.
- Die Key-Generierungs-Anweisung als ausführbarer Bash-One-Liner halten (`openssl rand -base64 32`), damit Operator ohne Rückfrage kopieren kann.
- Falls der Agent den Preflight-Check umsetzt: Fehler-Message soll den Pfad zu `.env.example` nennen und NICHT den erwarteten Key-Length-Typ leaken (`>= 32 chars` reicht, kein `aes-256-gcm-32b-hex`).
- `.env.example` ist Teil von Git; `.env.local` nicht — Änderungen in `.env.example` sind public, dort keine Prod-Hinweise oder interne URLs.
- Dokumentations-Ergänzung in `CLAUDE.md` nicht in diesem Ticket — separat in AUDIT-018.
