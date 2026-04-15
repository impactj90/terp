---
topic: seedAccounts — Duplikation von system-seeded Core-Accounts entfernen
status: backlog
source_plan: thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md
flag: FLAG 1 (Plan), Open Question 4.1 (Research)
---

# seedAccounts Duplikat-Cleanup (FLEX / OT / VAC)

## Problem

Die `seedAccounts`-Funktion im Industriedienstleister-Template
(`src/lib/tenant-templates/templates/industriedienstleister/shared-config.ts`)
legt für jeden Tenant eine tenant-scoped Kopie der Accounts
`FLEX`, `OT`, `VAC` an — obwohl diese Accounts in der Migration
als **system-accounts** (`tenant_id = NULL`) geführt werden und
global verfügbar sind.

Ergebnis: jeder via Showcase oder Starter erzeugte Tenant hat
ein Paar Accounts `(tenant_id=NULL, code='FLEX')` + `(tenant_id=<id>,
code='FLEX')`. Das Bookings-System bevorzugt den tenant-scoped Eintrag
und läuft — es entsteht kein Bug, aber die Datenhaltung ist redundant.

Der Plan hat das Verhalten bewusst beibehalten, um Byte-Kompatibilität
zum heutigen Showcase-Test zu wahren (`expect(c.accounts).toBe(10)` im
Integration-Test).

## Lösung

1. `seedAccounts` so umbauen, dass nur die 7 non-system-Accounts tenant-
   scoped geseedet werden. FLEX/OT/VAC werden übersprungen.
2. Showcase-Integration-Test `expect(c.accounts).toBe(7)` anpassen.
3. Alle bestehenden Tenants per One-Off-SQL bereinigen:
   `DELETE FROM accounts WHERE tenant_id IS NOT NULL AND code IN
   ('FLEX','OT','VAC');`
4. Verifikation: `bookings-service`-Tests weiterhin grün (System-Account-
   Lookup greift).

## Akzeptanzkriterien

- [ ] `shared-config.ts` seedet nur 7 Accounts (non-system).
- [ ] Integration-Test angepasst auf 7 statt 10.
- [ ] One-Off-SQL-Cleanup dokumentiert und gelaufen auf Dev + Staging.
- [ ] Kein Bookings-Regression.

## Referenzen

- Plan: `thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md` (FLAG 1)
- Research: `thoughts/shared/research/2026-04-14-tenant-template-starter-prerequisites.md` (Open Question 4.1)
