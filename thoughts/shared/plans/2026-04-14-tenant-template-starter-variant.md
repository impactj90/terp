---
date: 2026-04-14
author: tolga (planning session, Claude Opus 4.6)
git_commit: 08859e45
branch: staging
repository: terp
topic: "Tenant-Templates: Starter-Variante für Non-Demo-Tenants + Onboarding-Wizard"
tags: [plan, tenant-templates, platform-admin, onboarding, starter, refactor]
status: draft
research:
  - thoughts/shared/research/2026-04-14-demo-template-starter-variant.md
  - thoughts/shared/research/2026-04-14-tenant-template-starter-prerequisites.md
---

# Tenant-Templates: Starter-Variante für Non-Demo-Tenants — Implementation Plan

## Overview

Heute existiert genau ein Template (`industriedienstleister_150`), das ausschließlich
über den Demo-Pfad (`isDemo=true`, Showcase mit 150 Fake-Mitarbeitern) ausgeliefert
wird. Dieser Plan führt eine **zweite Template-Variante pro Branche** ein:

- **Showcase** (heute, unverändert): Sales-Demo, läuft auf einem Demo-Tenant.
- **Starter** (neu): produktiver Auslieferungs-Zustand für einen Neukunden-Tenant
  (`isDemo=false`), enthält die branchen-typische Stammdaten-Konfiguration aber
  **keine** Fake-Mitarbeiter, -Buchungen oder -Belege.

Für Starter-Tenants kommen zusätzlich vier per-instance Pflicht-Felder hinzu, die
kein Template seeden kann (Firmen-Stammdaten, Default-Location, Bundesland für
Feiertage, später SMTP). Diese werden im erweiterten Platform-Admin-Create-Form
(unter `/platform/tenants/new`) abgefragt und nach erfolgreichem Tenant-Create
materialisiert.

Die Rede ist über zwei Research-Dokumente abgesichert:
- `thoughts/shared/research/2026-04-14-demo-template-starter-variant.md`
- `thoughts/shared/research/2026-04-14-tenant-template-starter-prerequisites.md`

Beide Research-Docs sind Source-of-Truth für Architektur-Annahmen (verlinkt mit
`K1`–`K9`-Konsequenzen) und für Zeilenreferenzen.

## Bonus findings during planning

Während der Plan-Verifikation (parallele Subagent-Runs gegen den Codebase) sind
fünf Vereinfachungen aufgetaucht, die den Plan deutlich straffer machen, als die
Research-Doks vermuten ließen:

1. **Path B hat schon eine UI** — `src/app/platform/(authed)/tenants/new/page.tsx`
   ist ein vollwertiges Create-Form, das `tenantManagement.create` aufruft (Mutation
   an `new/page.tsx:75-91`). Phase 7 baut **keine neue UI**, sondern erweitert
   dieses Form additiv. Resolved Open Question 1.1 aus dem Research.

2. **`email-template-service.ts:159` exportiert bereits `seedDefaults(prisma, tenantId)`**
   — das die 8 Default-Templates aus `src/lib/email/default-templates.ts` als DB-Rows
   einpflegt. Phase 4 muss **keine neue Methode schreiben**, nur aggregieren.

3. **`holiday-service.ts:277` exportiert `generate(prisma, tenantId, { year, state })`**
   und **`holiday-calendar.ts:78` exportiert die pure `generateHolidays(year, state)`**
   — beides direkt nutzbar. Holiday-Parametrisierung wird trivial (FLAG 2 entfällt).

4. **IBAN-Validator existiert bereits**: `src/lib/sepa/iban-validator.ts:9` exportiert
   `normalizeIban(raw)` und `:14` `isValidIban(raw)` (delegiert an die `iban` npm-Package
   für MOD-97). Wir wiederverwenden — keine neue Validierungslogik.

5. **`reminder-template-service.ts:176` exportiert `seedDefaultsForTenant`** als
   idempotente Funktion (skipped beim zweiten Aufruf, wenn schon Templates
   existieren). Genau das, was wir brauchen.

Zusätzlich beim Lesen des bestehenden Forms aufgefallen: **`reminder-settings-service.ts`
hat keinen `upsert`, sondern `getSettings` (lazy-create) + `updateSettings`** (validiert
`gracePeriodDays.length === maxLevel`). `seedUniversalDefaults` muss daher
`updateSettings({ enabled: true, maxLevel: 3, gracePeriodDays: [7,14,21], interestRatePercent: 9 })`
aufrufen — Service erzeugt die Row implizit zuerst.

## Current State Analysis

### Heutiger Demo-Pfad (Path A)

- **Registry**: `src/lib/demo/` mit Interface (`types.ts`), Registry (`registry.ts`)
  und einem einzigen Template (`templates/industriedienstleister_150.ts`).
- **Interface**: `DemoTemplate` hat 4 Felder: `key`, `label`, `description`, `apply(ctx)`.
  Kein `industry`, kein `kind`, kein `applyConfig`/`applySeedData` Split.
- **Apply-Methode**: 13 Seed-Helper linear in einer vom Aufrufer geöffneten Tx
  (`industriedienstleister_150.ts:135-159`). Mischt KONFIGURATION + Showcase-Daten.
- **Caller**: `demo-tenant-service.ts:142-261` `createDemo` mit 120s-Tx, ruft
  `template.apply()` an Zeile 223-227.
- **Tests**: `industriedienstleister_150.integration.test.ts` mit `toBe(N)`-Assertions
  pro Entität (lines 105-117) + Timing-Assertion `< 90_000ms` (line 100). Kein
  Aggregat-Range, sondern exakte Einzelwerte.

### Heutiger Path B — Platform-Admin "Neuer Tenant"

- **Procedure**: `src/trpc/platform/routers/tenantManagement.ts:135-262`,
  `tx.tenant.create` an `:174`, `tx.userGroup.create` (ADMIN) an `:191`,
  `createUserService` an `:204`, `platformAudit.log` post-tx an `:231`.
- **UI**: `src/app/platform/(authed)/tenants/new/page.tsx` — vollständiges
  Card-basiertes Form mit 4 Cards (Firmenname/Slug/Contact, Adresse, Initialer
  Admin, Abrechnung). Slug wird aus Name auto-generiert (slugify-Helper). Ein
  Invite-Link-Dialog fängt SMTP-Failure ab.
- **Imports**: keinerlei Berührungspunkt mit `src/lib/demo/`.

### Bestätigte Service-Inventur (Phase-relevant)

| Service | Datei:Zeile | Verwendung im Plan |
|---|---|---|
| `usersService.create` | `users-service.ts:120` | Wird über `createUserService`-Alias eingebunden, unverändert |
| `reminderTemplateService.seedDefaultsForTenant(prisma, tenantId)` | `reminder-template-service.ts:176` | Phase 4 — idempotent, ein Aufruf pro Tenant |
| `emailTemplateService.seedDefaults(prisma, tenantId)` | `email-template-service.ts:159` | Phase 4 — seedet 8 Default-EmailTemplates als DB-Rows |
| `reminderSettingsService.updateSettings(prisma, tenantId, input)` | `reminder-settings-service.ts:44` | Phase 4 — `getSettings` wird intern als lazy-create aufgerufen, dann `update` |
| `holidayService.generate(prisma, tenantId, { year, state })` | `holiday-service.ts:277` | Phase 5 (Showcase-applySeedData) und Phase 6 (Starter-Router-Body) |
| `holiday-calendar.GERMAN_STATES` | `holiday-calendar.ts:30` | Phase 7 — Bundesland-Dropdown |
| `billingTenantConfigService.upsert(prisma, tenantId, input)` | `billing-tenant-config-service.ts:24` | Phase 6 — pflegt Firmen-Stammdaten (Feldname `companyName`, nicht `legalName`) |
| `locationService.create(prisma, tenantId, input)` | `location-service.ts:61` | Phase 6 — pflegt Default-Location |
| `isValidIban(raw)` | `sepa/iban-validator.ts:14` | Phase 7 — IBAN-Feld-Validierung (Frontend + Zod-Refinement im Backend) |

### Constraint-Befunde

- **`Tenant.isDemo`** Default `false` (`schema.prisma:122`). Path B braucht keine
  Spezialbehandlung — der Default greift automatisch.
- **`subscriptionService.createSubscription` ist `isDemo`-agnostisch** (Research
  Demo-Doc, Abschnitt 5). Ein Starter-Tenant mit `billingExempt=false` würde beim
  ersten `enableModule`-Call eine Subscription erzeugen — das ist gewollt und
  erfordert keinen Plan-Eingriff.
- **TerpHandbuch §22.17** Zeile 10830-10837 nennt explizit die Reminder-Defaults
  (`maxLevel=3`, `gracePeriodDays=[7,14,21]`, `interestRatePercent=9`) als BGB §288
  Abs. 2 B2B Standard. Phase 4 hält das ein.
- **Showcase-Integration-Test verlangt exakte Counts**:
  `c.holidays toBe 20` (`industriedienstleister_150.integration.test.ts:109`).
  Phase 3 darf das Holiday-Verhalten der Showcase-Variante nicht verändern. → Holidays
  bleiben in Phase 3 gar nicht in der Shared-Config; Showcase ruft sie selbst auf
  (Bonus-Finding 3).

## Desired End State

Nach allen 9 Phasen muss gelten:

1. Ein Platform-Operator kann unter `/platform/tenants/new` einen neuen Tenant anlegen
   und optional per Toggle "Mit Branchen-Template starten" eine Starter-Variante
   wählen (heute: nur Industriedienstleister).
2. Der erzeugte Starter-Tenant hat:
   - `isDemo=false`, kein Demo-Banner, kein Expiration-Gate.
   - 4 Departments, 12 Tariffs, 3 Day/WeekPlans, 8 BookingTypes, 6 AbsenceTypes,
     2 WhArticleGroups, ~13–26 Holidays (vom gewählten Bundesland abhängig),
     1 AccountGroup + 10 Accounts.
   - 0 Employees, 0 EmployeeDayPlans, 0 BillingDocuments, 0 WhArticles, 0 CrmAddresses.
   - 1 BillingTenantConfig-Row (Firmen-Stammdaten), 1 Location (Default), ≥3
     ReminderTemplates, ≥8 EmailTemplates, ReminderSettings mit `enabled=true`.
3. Der Showcase-Pfad (`/platform/tenants/demo`) ist byte-kompatibel zum heutigen
   Verhalten. Der bestehende Integration-Test
   `industriedienstleister_150.integration.test.ts` läuft unverändert grün —
   weder Test- noch Assertion-Änderungen erlaubt.
4. Ein Tenant-User mit Admin-Rechten sieht in einem Tenant ohne `TenantSmtpConfig`
   einen Hinweis-Banner ("SMTP-Konfiguration fehlt …") und alle Send-Buttons sind
   bereits deaktiviert (der `canSend`-Check existiert bereits).

### Verifikation des Endzustands

```bash
# Showcase nach wie vor grün:
pnpm vitest run src/lib/tenant-templates/__tests__/industriedienstleister_150.integration.test.ts

# Starter integration test grün:
pnpm vitest run src/lib/tenant-templates/__tests__/industriedienstleister_starter.integration.test.ts

# tRPC procedure integration test:
pnpm vitest run src/trpc/platform/routers/__tests__/tenantManagement-createFromTemplate.integration.test.ts

# Typecheck und Lint sauber:
pnpm typecheck
pnpm lint
```

Manuell:
- Im Browser `/platform/tenants/new` öffnen, Toggle einschalten, Form
  ausfüllen, submit → Redirect auf Tenant-Detail, neue Tenant ist sichtbar in
  `/platform/tenants` und enthält die seedete Stammdaten-Ebene.
- Tenant-User-Login (Welcome-Email-Link) → Dashboard zeigt SMTP-Warning-Banner.
- `/platform/tenants/demo` mit Industriedienstleister-Showcase erzeugen → Verhalten
  identisch zu heute.

## What We're NOT Doing

Bewusste Scope-Cuts, die in Folge-Backlog-Items leben:

- **VacationBalance-Lücke im Showcase fixen** (Research K5). Das heutige Template
  legt für die 150 Employees keine `VacationBalance`-Rows an, was zu
  `NOT_FOUND`-Fehlern in der Urlaubs-UI führt. Bug existiert seit Phase 10b. Im
  Folge-Backlog (siehe Phase 9).
- **Multi-Step First-Login-Wizard** (Tenant-seitig). Phase 8 implementiert nur
  einen Banner + Send-Button-Deaktivierung als minimales Hilfsnetz. Ein
  vollwertiger Wizard (Willkommen → SMTP → Templates prüfen → Fertig) ist
  separater Plan.
- **Weitere Branchen-Templates** (Gebäudereinigung, Büro, Handwerk). Nur
  Industriedienstleister wird in diesem Plan auf das neue Schema migriert. Die
  Architektur (Industry-Gruppierung im Dropdown) wird aber so vorbereitet, dass
  eine zweite Branche additiv hinzukommen kann.
- **Subscription-Autocreate nach `createFromTemplate`**. Der neue Tenant hat
  `billingExempt=false` als Default — die erste Subscription entsteht beim ersten
  `enableModule`-Call (bestehender Mechanismus). Kein automatisches Modul-Enable
  im Create-Flow.
- **`seedAccounts`-Duplikat-Cleanup** (FLAG 1). FLEX/OT/VAC werden weiterhin
  tenant-scoped dupliziert, obwohl die Migration sie als `tenant_id=NULL` führt.
  Bewusste Beibehaltung der heutigen Semantik.
- **Heuristische PLZ → Bundesland-Vorbefüllung** (FLAG 8) entfällt als
  Implementierungs-Aufgabe. Begründung: Grenzregionen (z.B. Berlin/Brandenburg)
  sind inkonsistent abbildbar; falsches Default ist schlechter als kein Default.
  Operator wählt das Bundesland aus dem Dropdown (16 Einträge).
- **`createFromTemplate` für Showcase-Templates akzeptieren**. Showcase-Templates
  (`kind: "showcase"`) bleiben **ausschließlich** auf dem Demo-Pfad; ein
  Starter-Aufruf mit `kind: "showcase"` wirft `BAD_REQUEST` (FLAG 3).

## Implementation Approach

Neun Phasen, jede einzeln deploybar und reviewbar. Reihenfolge:

```
Phase 1 (Refactor: Rename)
   ↓
Phase 2 (Refactor: Interface Split) ── Phase 3 (Refactor: Industry Shared-Config)
                                              ↓
                                       Phase 4 (Helper: seedUniversalDefaults)
                                              ↓
                                       Phase 5 (Starter Template)
                                              ↓
                                       Phase 6 (Procedure: createFromTemplate)
                                              ↓
                                       Phase 7 (UI: Form-Erweiterung)
                                              ↓
                                       Phase 8 (UI: SMTP-Banner)
                                              ↓
                                       Phase 9 (Docs + Backlog)
```

Phasen 1–3 sind Refactors ohne Verhaltensänderung — der bestehende Showcase-Test
ist der Beweis. Phasen 4–6 sind additiv (neue Files, neue Procedure). Phasen 7–8
sind UI-only. Phase 9 ist Markdown.

---

## Phase 1: Registry-Umbenennung `src/lib/demo/` → `src/lib/tenant-templates/`

### Overview

Reiner Refactor. Verzeichnis und Symbole werden umbenannt, alle Import-Sites
aktualisiert. Verhalten unverändert. Die tRPC-Procedure
`demoTenantManagement.templates` behält ihren Namen (sie ist Teil der
Demo-Router-API), ruft aber intern die umbenannte Funktion auf.

Begründung: Im Plan landet eine zweite Template-Variante (Starter) mit
fundamental anderem Charakter als "Demo". Der Verzeichnisname `src/lib/demo/`
wäre irreführend. Resolved Open Question 1.3.

### Implementation Steps

1. `git mv src/lib/demo/ src/lib/tenant-templates/` — sauber, damit Git die
   History trackt.
2. In `src/lib/tenant-templates/types.ts`:
   - `interface DemoTemplate` → `interface TenantTemplate`
   - `interface DemoTemplateContext` → `interface TenantTemplateContext`
   - `type DemoTx` → `type TenantTemplateTx` (Re-Export von
     `Prisma.TransactionClient`)
3. In `src/lib/tenant-templates/registry.ts`:
   - `getDemoTemplate` → `getTenantTemplate`
   - `listDemoTemplates` → `listTenantTemplates`
   - `DEFAULT_DEMO_TEMPLATE` → `DEFAULT_TENANT_TEMPLATE`
   - Error-Message `"Unknown demo template: ${key}"` →
     `"Unknown tenant template: ${key}"`
4. Suchen-und-ersetzen in allen Import-Sites. Bekannte Stellen:
   - `src/lib/services/demo-tenant-service.ts:149` — `getDemoTemplate(...)`
   - `src/trpc/platform/routers/demoTenantManagement.ts:25-28` — Import
     `DEFAULT_DEMO_TEMPLATE` und `listDemoTemplates`
   - `src/trpc/platform/routers/demoTenantManagement.ts:69` — `templates`-Query
     ruft `listDemoTemplates()` (jetzt `listTenantTemplates()`)
   - Bestehende Test-Files in `__tests__/`
5. Tests umbenennen: `src/lib/demo/__tests__/` → `src/lib/tenant-templates/__tests__/`.
   Innere Imports aktualisieren. Test-Bezeichner (`describe(...)`) bleiben
   unverändert ("demo template registry", "industriedienstleister_150 template")
   damit keine Test-Ausgabe-Diffs entstehen.
6. **Die tRPC-Procedure `demoTenantManagement.templates` selbst bleibt namentlich
   bestehen** (und der Demo-Router heißt weiterhin `demoTenantManagement`). Sie
   ist Teil der externen API; ihre Umbenennung würde den Demo-UI-Flow brechen.
   Der Plan bestätigt dies explizit.

### Files to Change

- `git mv` — komplettes Verzeichnis
- `src/lib/services/demo-tenant-service.ts` — Import `getTenantTemplate` aus dem
  neuen Pfad
- `src/trpc/platform/routers/demoTenantManagement.ts` — Imports + interner
  Funktionsaufruf

### Files to Create

(keine)

### Automated Verification

- [x] `pnpm typecheck` läuft sauber durch (kein Import-Error)
- [x] `pnpm vitest run src/lib/tenant-templates/__tests__/registry.test.ts` grün
- [x] `pnpm vitest run src/lib/tenant-templates/__tests__/industriedienstleister_150.integration.test.ts`
      grün **mit identischen Counts**
- [x] `pnpm lint` läuft sauber
- [x] `git log --follow src/lib/tenant-templates/types.ts` zeigt die alte Demo-History

### Manual Verification

- [x] Demo-Tenant unter `/platform/tenants/demo` erzeugen — Dropdown zeigt
      Industriedienstleister, Submit erfolgreich, alle Counts wie vor dem Refactor.
- [x] Tenant-Auswahl im UI-Dropdown unverändert (Label und Anzahl gleich).

**Implementation Note**: Nach Phase 1 PAUSE für manuelle Verifikation. Diese Phase
hat das höchste Refactor-Risiko (40+ Import-Sites möglich) und das niedrigste
funktionale Risiko — ein guter Punkt für ein dediziertes Code-Review.

### Rollback Plan

`git revert` des Phase-1-Commits stellt die alte Verzeichnisstruktur 1:1 wieder
her. Da keine Migration involviert ist und die DB unberührt bleibt, ist Rollback
trivial.

---

## Phase 2: Interface-Erweiterung und Apply-Split

### Overview

Das `TenantTemplate`-Interface bekommt zwei neue Pflichtfelder (`industry`, `kind`)
und die `apply()`-Methode wird in `applyConfig()` + optionalen `applySeedData()`
zerlegt. Der Aufrufer (`demoService.createDemo`) wird umgestellt; das alte
`apply()`-Feld entfällt vollständig.

### Implementation Steps

1. **`src/lib/tenant-templates/types.ts`** komplett neu:

```ts
import type { Prisma } from "@/generated/prisma/client"

export type TenantTemplateTx = Prisma.TransactionClient

export interface TenantTemplateContext {
  tenantId: string
  adminUserId: string
  tx: TenantTemplateTx
}

/**
 * IDs of seeded configuration entities, returned by `applyConfig` so that
 * `applySeedData` (showcase-only) can reference them when creating
 * employees, day-plans, billing documents, etc.
 *
 * Only the fields actually consumed by today's seedEmployees /
 * seedEmployeeDayPlans / seedBillingDocuments are listed. Adding more
 * fields is additive and non-breaking.
 */
export interface TenantTemplateConfigResult {
  departments: Array<{ id: string; code: string }>
  tariffs: Array<{ id: string; code: string }>
  dayPlans: Array<{ id: string; shiftKey: string }>
  weekPlans: Array<{ id: string; shiftKey: string }>
  accountGroups: Array<{ id: string }>
  accounts: Array<{ id: string; code: string }>
  bookingTypes: Array<{ id: string; code: string }>
  absenceTypes: Array<{ id: string; code: string }>
  whArticleGroups: Array<{ id: string; code: string }>
}

export interface TenantTemplate {
  key: string
  label: string
  description: string

  /** Gruppierungs-Key für UI-Dropdown (z.B. "industriedienstleister"). */
  industry: string

  /** "showcase" → Demo-Pfad, "starter" → createFromTemplate-Pfad. */
  kind: "showcase" | "starter"

  /**
   * Seedet Stammdaten (Departments, Tariffs, …). Wird sowohl von Showcase
   * als auch von Starter aufgerufen. Gibt die erzeugten IDs zurück, damit
   * `applySeedData` darauf aufbauen kann.
   */
  applyConfig: (
    ctx: TenantTemplateContext
  ) => Promise<TenantTemplateConfigResult>

  /**
   * Showcase-only: seedet Employees, EmployeeDayPlans, CrmAddresses,
   * BillingDocuments, WhArticles. Nicht gesetzt bei Starter-Templates.
   */
  applySeedData?: (
    ctx: TenantTemplateContext,
    config: TenantTemplateConfigResult
  ) => Promise<void>
}
```

2. **`src/lib/services/demo-tenant-service.ts:223-227`** umstellen:

```ts
// Vor:
await template.apply({ tx, tenantId: tenant.id, adminUserId: adminUser.id })

// Nach:
const ctx = { tx, tenantId: tenant.id, adminUserId: adminUser.id }
const config = await template.applyConfig(ctx)
if (template.kind === "showcase" && template.applySeedData) {
  await template.applySeedData(ctx, config)
}
```

3. **Bestehendes Industriedienstleister-Template temporär kompatibel halten**:
   `industriedienstleister_150.ts` exportiert in dieser Phase noch das alte
   `apply`-Field NICHT mehr — stattdessen wird (vorübergehend) ein
   `applyConfig`-Wrapper definiert, der **alle 13 Helper** (also Config + Seed)
   ausführt und einen `TenantTemplateConfigResult` mit den seit jeher
   intern vorhandenen IDs zurückgibt. `applySeedData` ist `undefined` in dieser
   Phase. Phase 3 zerlegt diesen Wrapper dann sauber.

   Begründung für die "Big-Bang-Wrapper"-Zwischenstufe: Wenn wir Phase 2 und
   Phase 3 mischen, sind die Verhaltens-Garantien schwerer zu beweisen. Mit dem
   Wrapper läuft der Showcase-Test in Phase 2 grün, weil **dieselbe** Sequenz
   von Helpern in **derselben** Reihenfolge in der **selben** Tx läuft — nur
   eingehängt unter einem anderen Methodennamen.

4. Test-File `industriedienstleister_150.integration.test.ts` braucht einen
   minimalen Anpassung: statt `await industriedienstleister150.apply(ctx)` →
   `await industriedienstleister150.applyConfig(ctx)`. Keine Assertion-Änderung.

### Files to Change

- `src/lib/tenant-templates/types.ts` (komplett neu schreiben)
- `src/lib/tenant-templates/templates/industriedienstleister_150.ts` —
  Export-Block am Ende: `apply` → `applyConfig` (Wrapper, der alle 13 Helper
  unverändert ruft), neue `industry: "industriedienstleister"`,
  `kind: "showcase"`, kein `applySeedData`
- `src/lib/services/demo-tenant-service.ts:223-227` — neue Aufruf-Sequenz
- `src/lib/tenant-templates/__tests__/industriedienstleister_150.integration.test.ts` —
  Aufruf von `apply` → `applyConfig`

### Files to Create

(keine)

### Automated Verification

- [x] `pnpm typecheck` — neue Interface-Felder werden überall erkannt
- [x] `pnpm vitest run src/lib/tenant-templates/__tests__/industriedienstleister_150.integration.test.ts`
      grün, **identische Counts**
- [x] `pnpm vitest run src/lib/services/__tests__/demo-tenant-service.integration.test.ts`
      grün
- [x] `pnpm lint`

### Manual Verification

- [x] Demo-Tenant erstellen — funktional unverändert.

**Implementation Note**: PAUSE nach Phase 2 für Code-Review. Die Wrapper-Strategie
für `applyConfig` ist die kritischste Stelle dieser Phase: ein versehentlich
geänderter Helper-Aufruf brächte eine Regression im Showcase-Test.

### Rollback Plan

`git revert` des Phase-2-Commits. Phase 1 muss erhalten bleiben; das ist
problemlos möglich, weil Phase 2 nur Code-Files anfasst.

---

## Phase 3: Shared-Config-Extraktion für Industriedienstleister

### Overview

Der bisherige `industriedienstleister_150.ts`-Wrapper wird in drei Files
zerlegt:

```
src/lib/tenant-templates/templates/industriedienstleister/
  shared-config.ts   — applyIndustriedienstleisterConfig(ctx)
  showcase.ts        — TenantTemplate (kind: "showcase")
  starter.ts         — (kommt in Phase 5, hier nur Platzhalter erwähnt)
```

`shared-config.ts` enthält 11 von 13 Helpern (alle ohne Personen-FK), gibt einen
`TenantTemplateConfigResult` mit den erzeugten IDs zurück.

`showcase.ts` enthält die 4 Personen-/Bewegungsdaten-Helper (`seedEmployees`,
`seedEmployeeDayPlans`, `seedCrmAddresses`, `seedBillingDocuments`) als Teil
seines `applySeedData`-Hooks.

**Bonus-Finding 3**: `seedHolidays` wird **NICHT** Teil der Shared-Config. Es
wandert in `showcase.ts` als erster Schritt von `applySeedData` (damit Holidays
vor Employees existieren, falls eine spätere Konsumlogik das verlangt — und damit
die Holiday-Strategie semantisch dort lebt, wo sie spezifiziert wird). Die
Starter-Variante seedet Holidays nicht aus dem Template, sondern aus dem
Router-Body von `createFromTemplate` (Phase 6) mit dem operator-gewählten Bundesland.

### Implementation Steps

1. **Neues Verzeichnis anlegen**:
   `src/lib/tenant-templates/templates/industriedienstleister/`.

2. **`shared-config.ts`** erstellen. Inhalt: die 11 Helper aus dem alten
   `industriedienstleister_150.ts`, die KEIN `Employee`/`CrmAddress`/`BillingDocument`/
   `WhArticle` erzeugen und KEINEN Holiday seeden:
   - `seedDepartments` (von `industriedienstleister_150.ts:177-187`)
   - `seedAccounts` (`:189-216`)
   - `seedDayPlans` (`:218-237`)
   - `seedWeekPlans` (`:239-262`)
   - `seedTariffs` (`:264-303`)
   - `seedBookingTypes` (`:305-317`)
   - `seedAbsenceTypes` (`:319-333`)
   - `seedWhArticleGroups` (Auszug aus `seedWarehouse` `:582-588` — nur die zwei
     `WhArticleGroup`-Rows, ohne die 30 `WhArticle`)

   Die Helper bleiben **byte-identisch** zum heutigen Code (selbe Konstanten,
   selbe `randomUUID`/`createMany`-Aufrufe). Sie werden nur räumlich verschoben
   und exportiert.

3. **`applyIndustriedienstleisterConfig(ctx)`** als orchestrierende Funktion:

```ts
import type {
  TenantTemplateContext,
  TenantTemplateConfigResult,
} from "../../types"
// … helper imports

export async function applyIndustriedienstleisterConfig(
  ctx: TenantTemplateContext
): Promise<TenantTemplateConfigResult> {
  const { tx, tenantId } = ctx
  const departments = await seedDepartments(tx, tenantId)
  const accountsResult = await seedAccounts(tx, tenantId)
  const dayPlans = await seedDayPlans(tx, tenantId)
  const weekPlans = await seedWeekPlans(tx, tenantId, dayPlans)
  const tariffs = await seedTariffs(tx, tenantId, weekPlans)
  const bookingTypes = await seedBookingTypes(tx, tenantId)
  const absenceTypes = await seedAbsenceTypes(tx, tenantId)
  const whArticleGroups = await seedWhArticleGroups(tx, tenantId)
  return {
    departments,
    tariffs,
    dayPlans,
    weekPlans,
    accountGroups: accountsResult.groups,
    accounts: accountsResult.accounts,
    bookingTypes,
    absenceTypes,
    whArticleGroups,
  }
}
```

4. **`showcase.ts`** erstellen. Inhalt: die 4 Personen-Helper plus
   `seedHolidays` (das hardcoded `HOLIDAYS_BAYERN`-Array bleibt **bytegleich**
   inkl. der 20 Datumswerte für 2026/2027), plus die `seedWhArticles`-Funktion
   (30 Artikel-Helper aus dem alten `seedWarehouse` `:590-625`). Diese 6 Helper
   werden im `applySeedData` orchestriert:

```ts
import type {
  TenantTemplate,
  TenantTemplateContext,
  TenantTemplateConfigResult,
} from "../../types"
import { applyIndustriedienstleisterConfig } from "./shared-config"
// … helper imports inkl. seedHolidaysBayern, seedEmployees, seedEmployeeDayPlans,
//     seedCrmAddresses, seedBillingDocuments, seedWhArticles

export const industriedienstleisterShowcase: TenantTemplate = {
  key: "industriedienstleister_150",
  label: "Industriedienstleister (150 MA)",
  description:
    "150 Mitarbeiter, 4 Abteilungen, Schichtmodell FS/SS/NS, Demo-Rechnungen, Warehouse-Bestand. Nah am Pro-Di-Profil.",
  industry: "industriedienstleister",
  kind: "showcase",

  applyConfig: applyIndustriedienstleisterConfig,

  applySeedData: async (ctx, config) => {
    const { tx, tenantId } = ctx
    // Step 1: Holidays Bayern 2026/2027 (hardcoded für Showcase-Byte-Kompat)
    await seedHolidaysBayern(tx, tenantId)
    // Step 2: Personen + Bewegungsdaten
    const employees = await seedEmployees(tx, tenantId, config.departments, config.tariffs)
    await seedEmployeeDayPlans(tx, tenantId, employees, config.dayPlans)
    const customers = await seedCrmAddresses(tx, tenantId)
    await seedBillingDocuments(tx, tenantId, customers)
    await seedWhArticles(tx, tenantId, config.whArticleGroups)
  },
}
```

   **Wichtig — Key bleibt `"industriedienstleister_150"`**. Damit ist die
   tRPC-Query `demoTenantManagement.templates` byte-kompatibel und der Demo-UI-
   Dropdown braucht keine Änderung.

5. **Registry-Update** (`src/lib/tenant-templates/registry.ts`):

```ts
import { industriedienstleisterShowcase } from "./templates/industriedienstleister/showcase"

const REGISTRY: Record<string, TenantTemplate> = {
  [industriedienstleisterShowcase.key]: industriedienstleisterShowcase,
  // (Phase 5 fügt industriedienstleisterStarter hinzu)
}
```

6. **Alte Datei löschen**:
   `git rm src/lib/tenant-templates/templates/industriedienstleister_150.ts`.
   Alle Helper sind in Schritte 2 + 4 ausgewandert.

7. **Showcase-Integration-Test-Update**: keine Assertion-Änderungen, nur Imports
   anpassen — `industriedienstleister150` heißt jetzt
   `industriedienstleisterShowcase`. Der Test ruft beide Hooks nacheinander auf:

```ts
const config = await industriedienstleisterShowcase.applyConfig(ctx)
await industriedienstleisterShowcase.applySeedData!(ctx, config)
```

   Counts müssen exakt gleich bleiben.

### Files to Change

- `src/lib/tenant-templates/registry.ts` — Re-Export aktualisieren
- `src/lib/tenant-templates/__tests__/industriedienstleister_150.integration.test.ts` —
  Imports + Aufruf-Sequenz; **keine Assertion-Änderungen**

### Files to Create

- `src/lib/tenant-templates/templates/industriedienstleister/shared-config.ts`
- `src/lib/tenant-templates/templates/industriedienstleister/showcase.ts`

### Files to Delete

- `src/lib/tenant-templates/templates/industriedienstleister_150.ts`

### Automated Verification

- [x] `pnpm typecheck`
- [x] `pnpm vitest run src/lib/tenant-templates/__tests__/industriedienstleister_150.integration.test.ts`
      grün **mit byte-identischen Row-Counts** (`c.holidays toBe 20`,
      `c.employees toBe 150`, etc.)
- [x] Showcase Elapsed-Time bleibt unter 90.000 ms
- [x] `pnpm lint`

### Manual Verification

- [x] Demo-Tenant unter `/platform/tenants/demo` erzeugen, alle Stammdaten und
      Demo-Mitarbeiter sichtbar wie vor dem Refactor.

**Implementation Note**: PAUSE nach Phase 3. Diese Phase ist die kritischste
Refactor-Phase weil sie 13 Helper umverteilt. Code-Review muss bestätigen, dass
die Helper byte-identisch sind und dass `seedHolidaysBayern` exakt die selben 20
Datumswerte liefert.

### Rollback Plan

`git revert` stellt das monolithische `industriedienstleister_150.ts` wieder
her. Die Phasen 1 und 2 bleiben intakt.

---

## Phase 4: `seedUniversalDefaults` Helper

### Overview

`seedUniversalDefaults` ist ein schlanker Wrapper, der für einen frisch
angelegten Starter-Tenant drei Default-Ebenen innerhalb derselben Tx seedet:

| Ebene | Datenquelle | Aufruf | Idempotenz |
|---|---|---|---|
| ReminderTemplates (3 Stufen) | `reminderTemplateService.seedDefaultsForTenant(prisma, tenantId)` (`reminder-template-service.ts:176`) | Service-Aggregat | `count > 0` → `{ seeded: 0 }` |
| EmailTemplates (8 DocTypes) | `getAllDocumentTypes()` + `getDefaultTemplate()` aus `src/lib/email/default-templates.ts` | **Inline** über `tx.emailTemplate.findFirst` + `tx.emailTemplate.create` (siehe Trade-off unten) | `findFirst` vor jedem `create` → doppelter Aufruf ist No-Op |
| ReminderSettings (BGB §288 Abs. 2) | `reminderSettingsService.updateSettings(prisma, tenantId, {...})` (`reminder-settings-service.ts:44`) | Service-Aggregat | `getSettings` lazy-create + `update` |

Die Settings erhalten die B2B-Standardwerte `{ enabled: true, maxLevel: 3,
gracePeriodDays: [7,14,21], interestRatePercent: 9 }` (TerpHandbuch §22.17).

### Trade-off: Warum EmailTemplates inline geseedet werden

Die ursprüngliche Plan-Annahme war, dass `seedUniversalDefaults` ein reiner
Service-Aggregator bleibt und keinen neuen Seed-Code enthält. Diese Annahme ist
bei der Implementierung an einem konkreten Terp-Constraint gebrochen:

- `emailTemplateService.seedDefaults` (`email-template-service.ts:159`) ruft für
  jeden DocumentType `emailTemplateRepository.create(prisma, tenantId, { …,
  isDefault: true })`.
- `emailTemplateRepository.create` (`email-template-repository.ts:50`) öffnet
  beim Pfad `isDefault=true` intern eine neue `prisma.$transaction(...)`. Und
  `seedDefaults` ruft den Pfad **immer** mit `isDefault: true` auf
  (`email-template-service.ts:181`).
- Prismas `Prisma.TransactionClient` hat zur Laufzeit **kein** `$transaction` —
  das Aufrufen aus dem Starter-Flow (innerhalb der Tenant-Create-Tx) wirft
  `TypeError: prisma.$transaction is not a function`.

Da der Plan-Constraint "Terp-Services bleiben unverändert" Vorrang hat, inline
`seedUniversalDefaults` das Email-Template-Seeding direkt auf `ctx.tx`:
iteriert `getAllDocumentTypes()`, skipt pro DocType via `findFirst`, und ruft
`tx.emailTemplate.create(...)` mit Subject/Body/Name aus derselben
`default-templates.ts`-Quelle. **Keine Content-Duplikation** — nur der
Persistenz-Pfad ist inline. Die beiden anderen Services
(`reminder-template-service`, `reminder-settings-service`) bleiben reine
Aggregat-Aufrufe.

Dieser Workaround ist als FLAG 11 getrackt und hat einen eigenen
Folge-Backlog-Eintrag in Phase 9
(`emailtemplateservice-tx-safe.md`), damit `seedUniversalDefaults` langfristig
wieder ein reiner Service-Aggregator werden kann.

### Implementation Steps

1. **`src/lib/tenant-templates/seed-universal-defaults.ts`** erstellen:

```ts
import type { Prisma, PrismaClient } from "@/generated/prisma/client"

import * as reminderTemplateService from "@/lib/services/reminder-template-service"
import * as reminderSettingsService from "@/lib/services/reminder-settings-service"
import {
  getAllDocumentTypes,
  getDefaultTemplate,
} from "@/lib/email/default-templates"

export async function seedUniversalDefaults(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const client = tx as unknown as PrismaClient

  await reminderTemplateService.seedDefaultsForTenant(client, tenantId)

  // Inline email-template seed — see trade-off in the Phase 4 Overview
  // and FLAG 11. `emailTemplateService.seedDefaults` cannot be called on
  // a TransactionClient because its repo opens a nested $transaction.
  for (const docType of getAllDocumentTypes()) {
    const existing = await tx.emailTemplate.findFirst({
      where: { tenantId, documentType: docType },
      select: { id: true },
    })
    if (existing) continue
    const fallback = getDefaultTemplate(docType)
    if (!fallback) continue
    await tx.emailTemplate.create({
      data: {
        tenant: { connect: { id: tenantId } },
        documentType: fallback.documentType,
        name: fallback.name,
        subject: fallback.subject,
        bodyHtml: fallback.bodyHtml,
        isDefault: true,
      },
    })
  }

  await reminderSettingsService.updateSettings(client, tenantId, {
    enabled: true,
    maxLevel: 3,
    gracePeriodDays: [7, 14, 21],
    interestRatePercent: 9,
  })
}
```

2. **Idempotenz-Klärung** im File-Header-Kommentar dokumentieren. Ein
   zweiter Aufruf gegen denselben Tenant (z.B. Retry nach partial failure) darf
   nichts crashen und keine Duplikate erzeugen:
   - `seedDefaultsForTenant`: prüft `count > 0` und kehrt mit `{ seeded: 0 }` zurück
   - Inline Email-Seed: `findFirst` vor jedem `create` — DocTypes mit einem
     vorhandenen Row werden übersprungen
   - `updateSettings`: idempotent per Definition (UPDATE überschreibt mit gleichen
     Werten)

3. **Wichtig — `seedUniversalDefaults` wird in Phase 5 nur vom Starter-Template
   aufgerufen, NICHT vom Showcase**. Begründung: das Showcase-Integration-Test
   asserts exakte Row-Counts; wenn das Showcase-Template plötzlich 8
   EmailTemplates und 3 ReminderTemplates zusätzlich seedete, müssten die Tests
   angepasst werden — was wir vermeiden wollen (FLAG 9 entfällt). Showcase bleibt
   unverändert.

### Files to Change

(keine)

### Files to Create

- `src/lib/tenant-templates/seed-universal-defaults.ts`
- `src/lib/tenant-templates/__tests__/seed-universal-defaults.test.ts` — Unit-Test
  mit `vi.mock` für `reminder-template-service` + `reminder-settings-service`
  und einem In-Memory-Fake für `tx.emailTemplate.findFirst`/`create`. Prüft:
  - Die drei Seeder laufen in der dokumentierten Reihenfolge
    (reminder-templates → inline email → reminder-settings), verifiziert via
    `invocationCallOrder`
  - Inline-Seed erzeugt **eine** Row pro `documentType` auf einem frischen
    Tenant und skipt alle vorhandenen DocTypes beim zweiten Aufruf
  - `updateSettings` wird mit den exakten BGB-Default-Werten aufgerufen
  - Doppel-Aufruf ist ein No-Op (keine Duplikat-Rows, keine Exceptions)

### Automated Verification

- [x] `pnpm typecheck`
- [x] `pnpm vitest run src/lib/tenant-templates/__tests__/seed-universal-defaults.test.ts`
      grün
- [x] Showcase-Integration-Test bleibt grün (kein Aufruf von
      `seedUniversalDefaults` im Showcase-Pfad)
- [x] `pnpm lint`

### Manual Verification

(Phase 4 hat noch kein UI-sichtbares Verhalten. Manuelle Verifikation kommt in
Phase 5 zusammen mit dem Starter-Template.)

### Rollback Plan

`git revert` löscht die neue Datei und den neuen Test. Keine Konsumenten in
Phase 1–3, also kein Side-Effect.

---

## Phase 5: Starter-Template `industriedienstleister_starter`

### Overview

Drittes File im Industriedienstleister-Verzeichnis: `starter.ts`. Definiert das
neue Starter-Template, das `applyIndustriedienstleisterConfig` aufruft und
zusätzlich `seedUniversalDefaults` (aus Phase 4). Kein `applySeedData`. Kein
Holiday-Seed im Template selbst — Holidays kommen aus Phase 6
(`createFromTemplate`-Router-Body) mit dem operator-gewählten Bundesland.

### Implementation Steps

1. **`src/lib/tenant-templates/templates/industriedienstleister/starter.ts`** erstellen:

```ts
import type { TenantTemplate } from "../../types"
import { applyIndustriedienstleisterConfig } from "./shared-config"
import { seedUniversalDefaults } from "../../seed-universal-defaults"

export const industriedienstleisterStarter: TenantTemplate = {
  key: "industriedienstleister_starter",
  label: "Industriedienstleister — Starter (leer)",
  description:
    "Branchen-typische Stammdaten ohne Mitarbeiter und Buchungen. Bereit für Kunden-Go-Live nach Vertragsabschluss.",
  industry: "industriedienstleister",
  kind: "starter",

  applyConfig: async (ctx) => {
    const config = await applyIndustriedienstleisterConfig(ctx)
    await seedUniversalDefaults(ctx.tx, ctx.tenantId)
    return config
  },

  // kein applySeedData — Starter-Templates seeden keine Personen-Daten
}
```

2. **Registry-Eintrag**:

```ts
// src/lib/tenant-templates/registry.ts
import { industriedienstleisterShowcase } from "./templates/industriedienstleister/showcase"
import { industriedienstleisterStarter } from "./templates/industriedienstleister/starter"

const REGISTRY: Record<string, TenantTemplate> = {
  [industriedienstleisterShowcase.key]: industriedienstleisterShowcase,
  [industriedienstleisterStarter.key]: industriedienstleisterStarter,
}
```

3. **Neuer Integration-Test**
   `src/lib/tenant-templates/__tests__/industriedienstleister_starter.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { industriedienstleisterStarter } from "@/lib/tenant-templates/templates/industriedienstleister/starter"
// ... helper imports for tx-rollback fixture

const HAS_DB = process.env.DATABASE_URL?.includes("localhost")

describe.skipIf(!HAS_DB)("industriedienstleister_starter template", () => {
  it("seeds config without personnel/movement data", async () => {
    const started = Date.now()
    await prisma.$transaction(
      async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: "Test Starter", slug: `test-starter-${Date.now()}` },
        })
        const adminUser = await tx.user.create({
          data: { tenantId: tenant.id, email: "test@test.local", displayName: "T" },
        })

        await industriedienstleisterStarter.applyConfig({
          tx,
          tenantId: tenant.id,
          adminUserId: adminUser.id,
        })

        const c = {
          departments: await tx.department.count({ where: { tenantId: tenant.id } }),
          employees: await tx.employee.count({ where: { tenantId: tenant.id } }),
          employeeDayPlans: await tx.employeeDayPlan.count({ where: { tenantId: tenant.id } }),
          billingDocs: await tx.billingDocument.count({ where: { tenantId: tenant.id } }),
          articles: await tx.whArticle.count({ where: { tenantId: tenant.id } }),
          crmAddresses: await tx.crmAddress.count({ where: { tenantId: tenant.id } }),
          tariffs: await tx.tariff.count({ where: { tenantId: tenant.id } }),
          dayPlans: await tx.dayPlan.count({ where: { tenantId: tenant.id } }),
          weekPlans: await tx.weekPlan.count({ where: { tenantId: tenant.id } }),
          bookingTypes: await tx.bookingType.count({ where: { tenantId: tenant.id } }),
          absenceTypes: await tx.absenceType.count({ where: { tenantId: tenant.id } }),
          whArticleGroups: await tx.whArticleGroup.count({ where: { tenantId: tenant.id } }),
          accounts: await tx.account.count({ where: { tenantId: tenant.id } }),
          accountGroups: await tx.accountGroup.count({ where: { tenantId: tenant.id } }),
          // Phase 4 Universal-Defaults
          reminderTemplates: await tx.reminderTemplate.count({ where: { tenantId: tenant.id } }),
          emailTemplates: await tx.emailTemplate.count({ where: { tenantId: tenant.id } }),
          reminderSettings: await tx.reminderSettings.findUnique({ where: { tenantId: tenant.id } }),
          // Holidays NICHT aus dem Template — aus Router-Body, daher hier 0
          holidays: await tx.holiday.count({ where: { tenantId: tenant.id } }),
        }

        // KONFIG-Counts
        expect(c.departments).toBe(4)
        expect(c.tariffs).toBe(12)
        expect(c.dayPlans).toBe(3)
        expect(c.weekPlans).toBe(3)
        expect(c.bookingTypes).toBe(8)
        expect(c.absenceTypes).toBe(6)
        expect(c.whArticleGroups).toBe(2)
        expect(c.accountGroups).toBe(1)
        expect(c.accounts).toBe(10)

        // Personen/Bewegung NICHT geseedet
        expect(c.employees).toBe(0)
        expect(c.employeeDayPlans).toBe(0)
        expect(c.billingDocs).toBe(0)
        expect(c.articles).toBe(0)
        expect(c.crmAddresses).toBe(0)

        // Holidays NICHT aus Template (kommt aus Router-Body)
        expect(c.holidays).toBe(0)

        // Universal-Defaults
        expect(c.reminderTemplates).toBeGreaterThanOrEqual(3)
        expect(c.emailTemplates).toBeGreaterThanOrEqual(8)
        expect(c.reminderSettings?.enabled).toBe(true)
        expect(c.reminderSettings?.maxLevel).toBe(3)

        throw new Error("rollback") // tx-rollback fixture
      },
      { timeout: 30_000 }
    ).catch((e) => {
      if (e.message !== "rollback") throw e
    })

    const elapsedMs = Date.now() - started
    expect(elapsedMs).toBeLessThan(10_000) // Generous; realistic <2s
  }, 30_000)
})
```

4. **Registry-Test ergänzen**: in `src/lib/tenant-templates/__tests__/registry.test.ts`
   einen Test hinzufügen, der prüft, dass `industriedienstleister_starter` mit
   `kind: "starter"` und `industry: "industriedienstleister"` registriert ist.

### Files to Change

- `src/lib/tenant-templates/registry.ts` — Starter registrieren
- `src/lib/tenant-templates/__tests__/registry.test.ts` — neuer Test-Fall

### Files to Create

- `src/lib/tenant-templates/templates/industriedienstleister/starter.ts`
- `src/lib/tenant-templates/__tests__/industriedienstleister_starter.integration.test.ts`

### Automated Verification

- [x] `pnpm typecheck`
- [x] `pnpm vitest run src/lib/tenant-templates/__tests__/industriedienstleister_starter.integration.test.ts`
      grün
- [x] Showcase-Test bleibt grün (Sanity)
- [x] `pnpm lint`

### Manual Verification

(noch keine UI in dieser Phase. Verifikation des Starter-Tenants kommt in Phase 6.)

### Rollback Plan

`git revert` entfernt das neue File, den neuen Test und den Registry-Eintrag.
Showcase bleibt funktional.

---

## Phase 6: Platform-Procedure `createFromTemplate`

### Overview

Neue tRPC-Procedure `tenantManagement.createFromTemplate` parallel zu
`tenantManagement.create`. Akzeptiert nur Templates mit `kind: "starter"`. Innerhalb
einer 120s-`$transaction` werden in dieser Reihenfolge ausgeführt:

1. `createPlatformTenantCore(tx, input, ctx)` — gemeinsamer Helper, der die
   Kernlogik der bestehenden `create`-Procedure kapselt (Tenant + ADMIN-UserGroup +
   User + Welcome-Email)
2. `template.applyConfig(ctx)` — seedet die branchen-typische Stammdaten-Ebene
3. `holidayService.generate(tx, tenantId, { year: 2026, state: holidayState })`
   und `{ year: 2027, state: holidayState }` — Bundesland-spezifische Feiertage,
   im Router-Body, **nicht** im Template
4. `billingTenantConfigService.upsert(tx, tenantId, billingConfig)` — Firmen-Stammdaten
5. `locationService.create(tx, tenantId, defaultLocation)` — Default-Standort
6. Post-tx: `platformAudit.log` mit `action: "tenant.created_from_template"`

`createPlatformTenantCore` wird durch Extraktion aus der bestehenden
`create`-Procedure gewonnen. Die alte Procedure ruft danach denselben Helper —
Byte-Kompatibilität ist Pflicht.

### Implementation Steps

#### Schritt 6a — Core-Helper-Extraktion

1. **In `src/trpc/platform/routers/tenantManagement.ts`** einen privaten Helper
   einführen:

```ts
type CreatePlatformTenantCoreInput = {
  name: string
  slug: string
  contactEmail: string
  initialAdminEmail: string
  initialAdminDisplayName: string
  addressStreet: string
  addressZip: string
  addressCity: string
  addressCountry: string
  billingExempt: boolean
}

type CreatePlatformTenantCoreResult = {
  tenant: { id: string; slug: string; name: string }
  adminUser: { id: string }
  welcomeEmail: { sent: boolean; fallbackLink: string | null }
}

async function createPlatformTenantCore(
  tx: Prisma.TransactionClient,
  input: CreatePlatformTenantCoreInput,
  audit: { ipAddress: string | null; userAgent: string | null }
): Promise<CreatePlatformTenantCoreResult> {
  // 1. Slug uniqueness (heute Zeilen 164-172)
  // 2. tx.tenant.create (heute Zeile 174)
  // 3. tx.userGroup.create ADMIN (heute Zeile 191)
  // 4. createUserService(tx, ...) (heute Zeile 204)
  // ... return { tenant, adminUser, welcomeEmail }
}
```

   Wichtig: der Inhalt des Helpers ist **zeilengetreu** der heutige Code aus
   `tenantManagement.ts:164-223`, nur in eine Funktion gewickelt. Keine
   Refactoring-Schleichänderung, keine andere Reihenfolge.

2. **Bestehende `create`-Procedure** umstellen, sodass sie diesen Helper aufruft:

```ts
create: platformAuthedProcedure
  .input(createInputSchema)
  .mutation(async ({ ctx, input }) => {
    let createdAuthUserId: string | null = null
    try {
      const result = await ctx.prisma.$transaction(
        async (tx) => {
          const core = await createPlatformTenantCore(tx, input, {
            ipAddress: ctx.ipAddress ?? null,
            userAgent: ctx.userAgent ?? null,
          })
          createdAuthUserId = core.adminUser.id
          return core
        },
        { timeout: 60_000 }
      )

      await platformAudit.log({
        action: "tenant.created",
        actorPlatformUserId: ctx.platformUser.id,
        tenantId: result.tenant.id,
        metadata: {
          slug: result.tenant.slug,
          initialAdminEmail: input.initialAdminEmail,
          welcomeEmailSent: result.welcomeEmail.sent,
          billingExempt: input.billingExempt,
        },
      })

      return {
        tenant: result.tenant,
        inviteLink: result.welcomeEmail.fallbackLink,
      }
    } catch (e) {
      // Bestehende Auth-Kompensations-Logik unverändert
      throw e
    }
  }),
```

   **FLAG 6**: Byte-Kompatibilität ist Pflicht. Vor und nach dem Refactor müssen
   das `tenant`-Row, die ADMIN-`UserGroup`-Row, die `User`-Row, der
   Welcome-Email-Versand und der `PlatformAuditLog`-Row exakt dieselben Felder
   enthalten. Verifikation: Phase-6-PR muss als Test-Add einen
   "regression-byte-equality"-Test einführen, der einen `tenantManagement.create`-
   Call vor und nach dem Refactor in zwei separaten Tx ausführt und alle
   relevanten Spalten vergleicht. Falls dieser Test in CI nicht praktikabel ist
   (Auth-Side-Effects), wird die Verifikation manuell via Vergleich der
   Audit-Logs eines Test-Tenants durchgeführt.

#### Schritt 6b — Neue Procedure `createFromTemplate`

3. **Input-Schema**:

```ts
import { isValidIban } from "@/lib/sepa/iban-validator"
import { GERMAN_STATES } from "@/lib/services/holiday-calendar"

const createFromTemplateInputSchema = z.object({
  // Core fields (identisch zu createInputSchema)
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
  contactEmail: z.string().email(),
  initialAdminEmail: z.string().email(),
  initialAdminDisplayName: z.string().min(2).max(255),
  addressStreet: z.string().min(1),
  addressZip: z.string().min(1),
  addressCity: z.string().min(1),
  addressCountry: z.string().min(1),
  billingExempt: z.boolean().default(false),

  // Template
  templateKey: z.string().min(1),

  // BillingTenantConfig (per-instance Pflicht)
  billingConfig: z.object({
    legalName: z.string().min(1).max(255),
    iban: z
      .string()
      .min(15)
      .max(34)
      .refine(isValidIban, { message: "Ungültige IBAN" }),
    bic: z.string().min(8).max(11).optional(),
    taxId: z.string().min(1),
    leitwegId: z.string().optional(),
  }),

  // Holiday (per-instance Pflicht)
  holidayState: z
    .string()
    .refine((s) => GERMAN_STATES.some((st) => st.code === s), {
      message: "Ungültiger Bundesland-Code",
    }),

  // Default Location (per-instance Pflicht)
  defaultLocation: z.object({
    name: z.string().min(1).default("Hauptsitz"),
    street: z.string().min(1),
    zip: z.string().min(1),
    city: z.string().min(1),
    country: z.string().min(1),
  }),
})
```

4. **Procedure-Body**:

```ts
createFromTemplate: platformAuthedProcedure
  .input(createFromTemplateInputSchema)
  .mutation(async ({ ctx, input }) => {
    // Template-Validation außerhalb der Tx
    const template = getTenantTemplate(input.templateKey)
    if (template.kind !== "starter") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "createFromTemplate akzeptiert nur Templates mit kind=starter",
      })
    }

    let createdAuthUserId: string | null = null
    try {
      const result = await ctx.prisma.$transaction(
        async (tx) => {
          // Step 1: Tenant + ADMIN-Group + User + Welcome-Email
          const core = await createPlatformTenantCore(tx, input, {
            ipAddress: ctx.ipAddress ?? null,
            userAgent: ctx.userAgent ?? null,
          })
          createdAuthUserId = core.adminUser.id

          const templateCtx = {
            tx,
            tenantId: core.tenant.id,
            adminUserId: core.adminUser.id,
          }

          // Step 2: Branch-Stammdaten + Universal-Defaults
          await template.applyConfig(templateCtx)

          // Step 3: Holidays für gewähltes Bundesland (2026 + 2027)
          await holidayService.generate(tx, core.tenant.id, {
            year: 2026,
            state: input.holidayState,
          })
          await holidayService.generate(tx, core.tenant.id, {
            year: 2027,
            state: input.holidayState,
          })

          // Step 4: BillingTenantConfig
          await billingTenantConfigService.upsert(tx, core.tenant.id, {
            companyName: input.billingConfig.legalName,
            iban: input.billingConfig.iban,
            bic: input.billingConfig.bic,
            taxId: input.billingConfig.taxId,
            leitwegId: input.billingConfig.leitwegId,
          })

          // Step 5: Default Location
          await locationService.create(tx, core.tenant.id, {
            code: "HQ",
            name: input.defaultLocation.name,
            // Adresse: konkrete Field-Map zur Implementation-Zeit gegen
            // das Location-Model verifizieren (Schema kennt einen
            // address-String; street+zip werden als "${street}, ${zip}"
            // aggregiert, falls keine separaten Felder vorhanden sind)
            address: `${input.defaultLocation.street}, ${input.defaultLocation.zip}`,
            city: input.defaultLocation.city,
            country: input.defaultLocation.country,
          })

          return core
        },
        { timeout: 120_000 } // FLAG 4: 120s analog Demo-Flow
      )

      await platformAudit.log({
        action: "tenant.created_from_template",
        actorPlatformUserId: ctx.platformUser.id,
        tenantId: result.tenant.id,
        metadata: {
          slug: result.tenant.slug,
          templateKey: input.templateKey,
          industry: template.industry,
          kind: template.kind,
          welcomeEmailSent: result.welcomeEmail.sent,
          billingExempt: input.billingExempt,
          holidayState: input.holidayState,
        },
      })

      return {
        tenant: result.tenant,
        inviteLink: result.welcomeEmail.fallbackLink,
      }
    } catch (e) {
      if (createdAuthUserId) {
        // Auth-Kompensation analog zum Demo-Flow:
        // demo-tenant-service.ts:244-259
        try {
          const adminClient = createAdminClient()
          await adminClient.auth.admin.deleteUser(createdAuthUserId)
        } catch (rbErr) {
          console.error("Auth user rollback failed", rbErr)
        }
      }
      throw e
    }
  }),
```

5. **Imports** in `tenantManagement.ts` ergänzen:

```ts
import { getTenantTemplate } from "@/lib/tenant-templates/registry"
import * as holidayService from "@/lib/services/holiday-service"
import * as billingTenantConfigService from "@/lib/services/billing-tenant-config-service"
import * as locationService from "@/lib/services/location-service"
```

   **Wichtig**: `tenantManagement.ts` darf jetzt aus `@/lib/tenant-templates/`
   importieren, weil das Routing schon Terp-seitig ist. Es bleibt die Regel
   eingehalten, dass keine Terp-Service-Methoden modifiziert werden.

### Files to Change

- `src/trpc/platform/routers/tenantManagement.ts` — Helper extrahieren, neue
  Procedure ergänzen, Imports aktualisieren

### Files to Create

- `src/trpc/platform/routers/__tests__/tenantManagement-createFromTemplate.integration.test.ts`
  — End-to-End-Test:
  - Input: gültiges Schema mit `templateKey: "industriedienstleister_starter"`,
    `holidayState: "BY"`
  - Erwartung: Tenant existiert mit `isDemo=false`, ADMIN-UserGroup existiert,
    User existiert, BillingTenantConfig.companyName matched, Location "HQ"
    existiert, Holidays > 10, ReminderTemplates ≥ 3, ReminderSettings.enabled=true,
    PlatformAuditLog mit `action: "tenant.created_from_template"` existiert
  - Negativ-Test: Aufruf mit `templateKey: "industriedienstleister_150"`
    (Showcase) wirft `BAD_REQUEST`
  - Negativ-Test: Aufruf mit ungültiger IBAN wirft Zod-Validierungsfehler
  - Negativ-Test: Aufruf mit ungültigem `holidayState` wirft Zod-Validierungsfehler

### Automated Verification

- [x] `pnpm typecheck`
- [x] `pnpm vitest run src/trpc/platform/routers/__tests__/tenantManagement-createFromTemplate.integration.test.ts`
      grün
- [x] Bestehender `tenantManagement.create`-Test (falls vorhanden) bleibt grün
      — beweist Byte-Kompatibilität
- [x] `pnpm lint`

### Manual Verification

- [x] Mit `curl` oder dem tRPC-Playground einen `createFromTemplate`-Call
      absetzen, verifizieren dass der neue Tenant alle erwarteten Rows enthält
      (über Prisma Studio)
- [x] Bestehendes `/platform/tenants/new` Form abschicken (ohne Template-Toggle) —
      Verhalten unverändert (Byte-Kompatibilität von `create`)

**Implementation Note**: PAUSE nach Phase 6. Die Helper-Extraktion ist die
heikelste Stelle des gesamten Plans. Code-Review muss bestätigen, dass das
Verhalten der bestehenden `create`-Procedure unverändert ist.

### Rollback Plan

Drei Schritte:
1. `git revert` der Phase-6-Commits
2. Falls die neue Procedure schon im Frontend benutzt wurde (Phase 7 ist später),
   muss Phase 7 ebenfalls revertet werden
3. DB-Cleanup nicht nötig — die neue Procedure schreibt ausschließlich in Tabellen,
   die durch Tenant-Cascade gelöscht werden können

---

## Phase 7: UI-Erweiterung des bestehenden `/platform/tenants/new` Forms

### Overview

Das bestehende Form `src/app/platform/(authed)/tenants/new/page.tsx` wird
**additiv** erweitert. Default-Verhalten (ohne Template) bleibt 1:1 erhalten —
gleiche Felder, gleicher Submit-Pfad (`tenantManagement.create`). Eine neue
Card "Branchen-Template" am unteren Ende des Forms enthält einen Toggle. Wenn
aktiviert, klappen vier zusätzliche Sections per Conditional-Rendering ein:

1. Template-Auswahl (Industry-gruppiertes Dropdown, gefiltert auf `kind: "starter"`)
2. Firmen-Stammdaten (`BillingTenantConfig`)
3. Standort & Feiertage
4. Hinweis-Card SMTP

Submit verzweigt auf Basis des Toggle-State: Toggle aus →
`tenantManagement.create.mutationOptions()` (heutiger Pfad). Toggle an →
`tenantManagement.createFromTemplate.mutationOptions()` (neuer Pfad).

**Conditional-Rendering-Strategie**: **State-Variable**
(`const [useTemplate, setUseTemplate] = useState(false)`) und einfaches
JSX-Conditional `{useTemplate && (<>…</>)}`. Begründung: Tabs würden eine
unnötige Trennung erzwingen ("Sie haben Daten oben eingegeben, jetzt müssen Sie
in einen anderen Tab"); Accordion ist visuell zu klobig für eine bool'sche
Verzweigung. Eine flache State-Variable mit aufklappenden Cards passt zum
bestehenden Card-Layout des Forms.

### Implementation Steps

1. **Neue State-Variablen** im `PlatformNewTenantPage` Component (zusätzlich
   zu den bestehenden):

```ts
const [useTemplate, setUseTemplate] = useState(false)
const [templateKey, setTemplateKey] = useState<string>("")
// Billing
const [legalName, setLegalName] = useState("")
const [iban, setIban] = useState("")
const [bic, setBic] = useState("")
const [taxId, setTaxId] = useState("")
const [leitwegId, setLeitwegId] = useState("")
// Holiday + Location
const [holidayState, setHolidayState] = useState<string>("")
const [defaultLocationName, setDefaultLocationName] = useState("Hauptsitz")
```

2. **Templates-Query**: Eine neue tRPC-Query
   `tenantManagement.starterTemplates` einführen, die `listTenantTemplates()`
   filter auf `kind: "starter"` zurückgibt. Das vermeidet, dass das Frontend
   das Filtering selbst macht und schützt vor versehentlichem Auswählen eines
   Showcase-Keys im Starter-Pfad.

```ts
// In src/trpc/platform/routers/tenantManagement.ts (Ergänzung):
starterTemplates: platformAuthedProcedure.query(() => {
  return listTenantTemplates().filter((t) => t.kind === "starter")
}),
```

   `listTenantTemplates()` muss in Phase 1 so umgebaut werden, dass es zusätzlich
   `industry` und `kind` zurückgibt (sonst kann das Filter nicht greifen). Das
   ist eine Erweiterung des Return-Types, kein Rename — additiv und ohne Risiko
   für die bestehende `demoTenantManagement.templates`-Query.

3. **`useEffect` zur Auto-Prefill**:

```ts
useEffect(() => {
  if (useTemplate && !legalName) setLegalName(name)
  if (useTemplate && !defaultLocationName) setDefaultLocationName("Hauptsitz")
}, [useTemplate, name, legalName, defaultLocationName])
```

4. **Neue Cards** unterhalb der bestehenden "Abrechnung"-Card, conditional auf
   `useTemplate`:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Branchen-Template (optional)</CardTitle>
    <CardDescription>
      Aktivieren, um den neuen Tenant mit einer vorkonfigurierten
      Stammdaten-Ebene zu starten (Tarife, Schichtmodelle, Feiertage,
      Mahn-Templates).
    </CardDescription>
  </CardHeader>
  <CardContent>
    <label className="flex items-start gap-3">
      <Checkbox
        id="useTemplate"
        checked={useTemplate}
        onCheckedChange={(v) => setUseTemplate(Boolean(v))}
      />
      <div>
        <div className="font-medium">Mit Branchen-Template starten</div>
        <p className="text-sm text-muted-foreground">
          Wenn deaktiviert, wird ein leerer Tenant angelegt — ohne Tarife,
          Abteilungen oder Mahn-Templates.
        </p>
      </div>
    </label>
  </CardContent>
</Card>

{useTemplate && (
  <>
    <Card>
      <CardHeader>
        <CardTitle>Branche & Variante</CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={templateKey} onValueChange={setTemplateKey}>
          {/* Gruppiert per industry */}
          {Object.entries(groupBy(starterTemplates, "industry")).map(
            ([industry, templates]) => (
              <SelectGroup key={industry} label={INDUSTRY_LABELS[industry]}>
                {templates.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            )
          )}
        </Select>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Firmen-Stammdaten</CardTitle>
        <CardDescription>
          Werden in den Briefkopf von Rechnungen und in das XRechnung-Format
          geschrieben.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Input id="legalName" value={legalName} onChange={...} required />
        <Input id="taxId" value={taxId} onChange={...} required />
        <Input id="iban" value={iban} onChange={...} required />
        <Input id="bic" value={bic} onChange={...} />
        <Input id="leitwegId" value={leitwegId} onChange={...} />
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Standort & Feiertage</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Input
          id="defaultLocationName"
          value={defaultLocationName}
          onChange={...}
          required
        />
        <Select
          value={holidayState}
          onValueChange={setHolidayState}
        >
          {GERMAN_STATES.map((s) => (
            <SelectItem key={s.code} value={s.code}>
              {s.name}
            </SelectItem>
          ))}
        </Select>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Hinweis: SMTP-Konfiguration</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          SMTP-Zugangsdaten pflegt der Kunden-Admin nach dem ersten Login im
          Bereich Administration → E-Mail-Versand. Ohne SMTP-Konfiguration
          kann der Tenant keine E-Mails versenden.
        </p>
      </CardContent>
    </Card>
  </>
)}
```

   Address-Felder für die Default-Location werden **nicht zusätzlich abgefragt** —
   sie werden aus den bestehenden `addressStreet/Zip/City/Country`-Feldern aus
   der "Adresse"-Card oben übernommen (Default-Location ist die Tenant-Adresse).

5. **Submit-Verzweigung**:

```ts
const createFromTemplateMutation = useMutation({
  ...trpc.tenantManagement.createFromTemplate.mutationOptions(),
  onSuccess: (data) => { /* identisch zu createMutation */ },
  onError: (err) => toast.error(err.message ?? "Anlegen fehlgeschlagen"),
})

function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  const baseInput = {
    name: name.trim(),
    slug: slug.trim(),
    contactEmail: contactEmail.trim(),
    initialAdminEmail: initialAdminEmail.trim(),
    initialAdminDisplayName: initialAdminDisplayName.trim(),
    addressStreet: addressStreet.trim(),
    addressZip: addressZip.trim(),
    addressCity: addressCity.trim(),
    addressCountry: addressCountry.trim(),
    billingExempt,
  }

  if (!useTemplate) {
    createMutation.mutate(baseInput)
    return
  }

  createFromTemplateMutation.mutate({
    ...baseInput,
    templateKey,
    billingConfig: {
      legalName: legalName.trim(),
      iban: iban.trim(),
      bic: bic.trim() || undefined,
      taxId: taxId.trim(),
      leitwegId: leitwegId.trim() || undefined,
    },
    holidayState,
    defaultLocation: {
      name: defaultLocationName.trim(),
      street: addressStreet.trim(),
      zip: addressZip.trim(),
      city: addressCity.trim(),
      country: addressCountry.trim(),
    },
  })
}

const isSubmitting = createMutation.isPending || createFromTemplateMutation.isPending
```

6. **IBAN-Frontend-Validierung**: Live, beim Blur aus dem IBAN-Feld
   `isValidIban(iban)` aus `@/lib/sepa/iban-validator` aufrufen und einen
   Hinweis-Text rendern, wenn ungültig. Backend-Validierung bleibt die
   Source-of-Truth (Zod-Refinement im Schema, siehe Phase 6).

   **FLAG 8**: Keine PLZ → Bundesland-Heuristik. Operator wählt explizit aus
   dem Dropdown.

### Files to Change

- `src/app/platform/(authed)/tenants/new/page.tsx` — additive Erweiterung um
  Template-State, Cards, Submit-Verzweigung
- `src/trpc/platform/routers/tenantManagement.ts` — neue
  `starterTemplates`-Query (additiv)
- `src/lib/tenant-templates/registry.ts` — `listTenantTemplates()` muss
  `industry` und `kind` mit zurückgeben (additive Erweiterung des Return-Types)

### Files to Create

(keine — alles additive Erweiterung)

### Automated Verification

- [x] `pnpm typecheck` (pre-existing TS2589 in scanner-terminal.tsx is unrelated)
- [x] `pnpm lint` (pre-existing warnings in warehouse + 1 error in test-helpers unrelated)
- [x] Bestehende `demoTenantManagement.templates`-Query unverändert (manueller
      grep, dass das Filter `kind === "starter"` NICHT auf den Demo-Pfad angewandt
      wird)

### Manual Verification

- [ ] `pnpm dev`, `/platform/tenants/new` öffnen
- [ ] Form ausfüllen ohne Template-Toggle, submitten → Verhalten unverändert
      (Tenant wird leer angelegt, Welcome-Email versandt)
- [ ] Form mit Template-Toggle ausfüllen:
  - [ ] Template-Dropdown zeigt nur Starter-Varianten
  - [ ] Industry-Gruppierung im Dropdown sichtbar
  - [ ] IBAN-Live-Validation funktioniert
  - [ ] Bundesland-Dropdown enthält 16 Einträge
  - [ ] Submit erfolgreich
  - [ ] Redirect auf `/platform/tenants/<id>`
  - [ ] Im neuen Tenant einloggen (über Welcome-Email-Link), prüfen ob die
        Stammdaten-Ebene sichtbar ist
- [ ] E2E-Test in `src/e2e-browser/` schreiben für den neuen Wizard-Pfad,
      analog zur bestehenden Demo-E2E

### Rollback Plan

`git revert` des Phase-7-Commits stellt die alte Form-Version her. Phase 6
(Backend) bleibt deployed — sie ist additive und stört keinen anderen
Konsumenten.

---

## Phase 8: SMTP-First-Login-Gate (Tenant-seitig, minimal)

### Overview

Wenn ein Tenant-User sich zum ersten Mal in einem Tenant ohne `TenantSmtpConfig`
einloggt, sieht er einen persistenten Hinweis-Banner ("SMTP-Konfiguration fehlt
…"). Send-Buttons in Mahn- und Rechnungsversand-UIs sind bereits heute via
`canSend`-Check (`email-send-service.ts:277`) deaktiviert — wir müssen den
Tooltip-Text präzisieren und auf den Settings-Pfad verlinken.

Scope-Cut: kein Multi-Step-Wizard. Nur Banner + Tooltip-Text.

### Implementation Steps

1. **Neue Banner-Komponente**:
   `src/components/layout/smtp-config-warning-banner.tsx`. Pattern aus
   `support-session-banner.tsx` adaptieren — gleiches Layout, gelber
   `bg-yellow-50` Hintergrund, `Settings`-Icon, Link auf
   `/administration/email-versand`.

   Banner wird nur gerendert wenn:
   - Aktueller User ist Admin (`isAdmin === true`)
   - `tenantSmtpConfig === null` (aus einer neuen Hook
     `useSmtpConfigStatus()`)

2. **Neue Hook** `src/hooks/useSmtpConfigStatus.ts`:

```ts
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"

export function useSmtpConfigStatus() {
  const trpc = useTRPC()
  const { data, isLoading } = useQuery(
    trpc.email.getSmtpConfigStatus.queryOptions()
  )
  return {
    isConfigured: data?.isConfigured ?? null,
    isLoading,
  }
}
```

3. **Neue tRPC-Query** `email.getSmtpConfigStatus`:

   In `src/trpc/routers/email.ts` (oder die equivalente vorhandene Datei) eine
   neue Query ergänzen, die `smtpConfigService.get(prisma, tenantId)` aufruft
   und `{ isConfigured: !!config }` zurückgibt. Bewusst kein Leak von
   Credentials.

4. **Banner in Layout einhängen**: Im Tenant-Layout
   (`src/app/(tenant)/layout.tsx` oder das Pendant) den Banner direkt unter
   dem `<DemoBanner>` rendern. Beide Banner sind hidden, wenn die Bedingung
   nicht zutrifft.

5. **Tooltip-Text** für Send-Buttons: An den Stellen, wo der `canSend`-Check
   einen disabled Button erzeugt, den Tooltip ergänzen mit dem Hinweis
   "SMTP-Konfiguration fehlt — Administration → E-Mail-Versand → SMTP-Server
   einrichten". Konkrete Datei-Stellen werden zur Implementation-Zeit per
   grep nach `canSend` ermittelt.

### Files to Change

- `src/app/(tenant)/layout.tsx` (oder Pendant) — Banner einhängen
- `src/trpc/routers/email.ts` — neue Query
- diverse Send-Button-Stellen (Tooltip-Text)

### Files to Create

- `src/components/layout/smtp-config-warning-banner.tsx`
- `src/hooks/useSmtpConfigStatus.ts`

### Automated Verification

- [x] `pnpm typecheck` (pre-existing TS2589 in scanner-terminal.tsx unrelated)
- [ ] `pnpm vitest run src/components/layout/__tests__/smtp-config-warning-banner.test.tsx`
      grün — Unit-Test der Display-Logik (Admin + missing config → render;
      non-admin → no render; admin + present config → no render)
      — **Skipped**: codebase has no existing React component test infra;
      adding one would require jsdom + react-testing-library setup. The
      banner logic is trivial (early returns on isLoading/!isAdmin/
      isConfigured !== false) and low-risk. Follow-up backlog item can add
      the infrastructure.
- [x] `pnpm lint` (only pre-existing unrelated warnings/errors)

### Manual Verification

- [ ] In einem Test-Tenant ohne SMTP-Config einloggen → Banner sichtbar
- [ ] SMTP konfigurieren → Banner verschwindet nach Reload
- [ ] Als nicht-Admin-User einloggen → Banner nicht sichtbar
- [ ] Einen Send-Button (z.B. Rechnung versenden) hovern → Tooltip mit dem
      neuen Hinweis-Text

### Rollback Plan

`git revert` entfernt die neue Banner-Komponente und die Hook. Die Tooltip-
Text-Änderungen werden auch rückgängig gemacht. Keine DB-Migration involviert.

---

## Phase 9: Dokumentation und Folge-Backlog

### Overview

Dokumentation der neuen Architektur in der README.md (Abschnitt
"Tenant Templates") und Anlegen von Backlog-Items für die Scope-Cuts.

### Implementation Steps

1. **README.md** ergänzen unterhalb des bestehenden "Demo-Tenant-System" /
   "Phase 10b"-Abschnitts:

```markdown
## Tenant Templates (Showcase & Starter)

Tenant-Templates leben unter `src/lib/tenant-templates/`. Jedes Template hat
ein `kind`:

- `kind: "showcase"` — wird im Demo-Pfad
  (`/platform/tenants/demo`) verwendet, läuft auf einem Demo-Tenant
  (`isDemo=true`) und seedet Stammdaten + Fake-Mitarbeiter + Beispiel-Belege.
- `kind: "starter"` — wird im Tenant-Create-Pfad
  (`/platform/tenants/new` mit aktiviertem Template-Toggle) verwendet, läuft
  auf einem produktiven Tenant (`isDemo=false`) und seedet ausschließlich die
  branchen-typische Stammdaten-Ebene ohne Personen- oder Bewegungsdaten.

Eine neue Branche hinzufügen:

1. Neuen Ordner `src/lib/tenant-templates/templates/<branche>/` anlegen
2. `shared-config.ts` mit `apply<Branche>Config(ctx)` schreiben — diese Funktion
   seedet Departments, Tariffs, etc. und gibt ein `TenantTemplateConfigResult`
   zurück
3. `showcase.ts` mit dem `kind: "showcase"`-Template schreiben, das sowohl
   `applyConfig` als auch `applySeedData` (Personen + Belege) implementiert
4. `starter.ts` mit dem `kind: "starter"`-Template schreiben, das nur
   `applyConfig` ruft + `seedUniversalDefaults`
5. Beide Templates in `registry.ts` registrieren

Wann welchen Pfad nutzen:

- **Sales-Demo**: Showcase über `/platform/tenants/demo`
- **Kunden-Go-Live**: Starter über `/platform/tenants/new` (Template-Toggle an)
```

2. **Folge-Backlog-Tickets** in `thoughts/shared/backlog/` erstellen:

   - **`vacation-balance-showcase-fix.md`** — VacationBalance-Lücke im
     Showcase-Template fixen (K5)
   - **`seedaccounts-system-duplicate-cleanup.md`** — FLEX/OT/VAC tenant-scoped
     Duplikate im Showcase-Template entfernen (Open Question 4.1, FLAG 1)
   - **`vacation-balance-lazy-create.md`** — `employees-service.create` soll
     `VacationBalance` automatisch erzeugen
   - **`smtp-multi-step-onboarding-wizard.md`** — Vollwertiger
     First-Login-Wizard für Starter-Tenants
   - **`weitere-branchen-templates.md`** — Gebäudereinigung, Büro, Handwerk
     als zusätzliche Industries
   - **`vacation-balance-ui-empirical-test.md`** — Open Question 2.1: tatsächliches
     UI-Verhalten bei `VacationBalanceNotFoundError`
   - **`emailtemplateservice-tx-safe.md`** — `emailTemplateService.seedDefaults`
     / `emailTemplateRepository.create` tx-safe machen (nested
     `prisma.$transaction` entfernen, wenn `isDefault: true`); danach das
     Inline-Seeding in `seed-universal-defaults.ts` auf einen reinen
     `emailTemplateService.seedDefaults(tx, tenantId)`-Aufruf zurückbauen.
     Referenzen: `email-template-repository.ts:50`, `email-template-service.ts:181`,
     FLAG 11.

### Files to Change

- `README.md`

### Files to Create

- 6 Files in `thoughts/shared/backlog/`

### Automated Verification

- [x] `pnpm lint` (keine neuen Warnings/Errors aus Doku-Änderungen)
- [x] `git status` zeigt Doku-Files + die kleinen Code-Änderungen aus
      Phasen 7+8 (Phase 9 selbst berührt nur README + backlog/)

### Manual Verification

- [ ] README.md im Browser/Editor lesen, Section ist verständlich
- [ ] Backlog-Files referenzieren auf den Phase-Plan

### Rollback Plan

`git revert` — pure Doku-Phase, kein Risiko.

---

## Testing Strategy

### Phase 1
- Bestehende Tests grün; reine Refactor-Verifikation.

### Phase 2
- Bestehende Tests grün; minimaler Test-Patch (Aufruf von `apply` →
  `applyConfig`).

### Phase 3
- Bestehender Showcase-Integration-Test grün **mit identischen Counts**.
  Dieser Test ist der kritische Beweis, dass die Refactor-Schritte 1–3 keine
  Verhaltensänderung hatten.

### Phase 4
- Unit-Test für `seedUniversalDefaults` (Mock-Services).
- Idempotenz-Test: Doppel-Aufruf gegen denselben Tenant.

### Phase 5
- Neuer Integration-Test gegen reale Dev-DB (`HAS_DB`-Skip-Pattern wie
  Showcase). Asserts auf KONFIG-Counts (exakt) + Personen-Counts (= 0) +
  Universal-Defaults (≥).

### Phase 6
- Neuer Integration-Test für `createFromTemplate` (End-to-End).
- Negativ-Tests: Showcase-Key wirft BAD_REQUEST, ungültige IBAN, ungültiges
  Bundesland.
- Byte-Kompatibilitäts-Verifikation für die bestehende `create`-Procedure.

### Phase 7
- E2E-Browser-Test in `src/e2e-browser/` für den Wizard-Flow.

### Phase 8
- Unit-Test für die Banner-Display-Logik.

### Manual Testing Steps (End-to-End)

1. `/platform/tenants/new` öffnen, ohne Template-Toggle Form ausfüllen, submit.
2. Verifizieren: neuer Tenant existiert, ist leer (keine Departments etc.).
3. Erneut `/platform/tenants/new`, diesmal mit Template-Toggle.
4. Industry-Dropdown öffnen → "Industriedienstleister" gruppiert sichtbar.
5. Starter-Variante wählen, Firmen-Stammdaten ausfüllen, Bundesland Bayern wählen.
6. Submit → Redirect.
7. Im neuen Tenant einloggen (Welcome-Email-Link).
8. Verifizieren: SMTP-Banner sichtbar, Departments/Tariffs/etc. da, Mahn-
   Templates vorhanden, Email-Templates vorhanden, ReminderSettings.enabled=true.
9. Versuchen, eine Rechnung zu versenden → Send-Button disabled, Tooltip zeigt
   den neuen Hinweis-Text.
10. SMTP konfigurieren → Banner verschwindet, Send-Button aktiv.

## Performance Considerations

Aus Research-Doc 2 (Thema 3): Starter-Template addiert ~70 Rows in ~14
Round-trips (~500ms Prisma + ~1s GoTrue-HTTP). Der 120s-Tx-Timeout
(`createFromTemplate`) hat ~118s Headroom. Keine Optimierungen nötig.

## Migration Notes

Keine DB-Migration in diesem Plan. Alle Änderungen sind Code + Test +
Dokumentation. Bestehende Tenants bleiben unberührt; das `kind`-Feld lebt im
TypeScript-Interface, nicht im Schema.

## Flag Tracker

Sechs Flags (zwei aus dem ursprünglichen 10er-Set entfallen oder gemerged,
ein neues während der Implementierung aufgetaucht):

| # | Flag | Entscheidung | Begründung |
|---|---|---|---|
| **1** | `seedAccounts` Duplikation von system-seeded Core-Accounts (FLEX/OT/VAC) | Bleibt erhalten | Verhalten byte-kompatibel; Cleanup separates Backlog-Item |
| ~~2~~ | ~~Holiday-Parametrisierung via `applyConfig`-Options~~ | **ENTFÄLLT** | Bonus-Finding 3: Showcase ruft `seedHolidaysBayern` selbst aus `applySeedData`; Starter ruft `holidayService.generate` aus dem Router-Body. Keine Template-Parametrisierung nötig. |
| **3** | `createFromTemplate` akzeptiert nur `kind: "starter"` | Showcase-Templates werfen `BAD_REQUEST` | Saubere Trennung der UI-Pfade |
| **4** | Tx-Timeout 120s für `createFromTemplate` | Wert: 120000 | Analog zum Demo-Flow; ~118s Headroom |
| **5** | `seedUniversalDefaults` idempotent | Garantiert durch die internen Service-Implementierungen (alle drei sind upsert/lazy/skip-if-exists) | Plan dokumentiert die Garantie pro Service explizit |
| **6** | Core-Helper `createPlatformTenantCore` extrahiert aus `create` | Byte-Kompatibilität ist Pflicht | Manual + Test-Verifikation; Phase-6-PR muss Regressions-Test enthalten |
| **7** | SMTP-First-Login-Gate ist minimal (Banner + Tooltip) | Kein Multi-Step-Wizard | Scope-Limit; Folge-Backlog-Item in Phase 9 |
| **8** | `createFromTemplate` prefilled `holidayState` NICHT heuristisch aus PLZ | Operator wählt explizit | Grenzregionen sind nicht sauber abbildbar; falsches Default schlechter als kein Default |
| ~~9~~ | ~~Showcase-Integration-Test Row-Count Range angepasst~~ | **ENTFÄLLT** | `seedUniversalDefaults` wird im Showcase **NICHT** aufgerufen (Phase 4 dokumentiert das); Test bleibt unverändert grün |
| **10** | VacationBalance-Bug im Showcase wird NICHT in diesem Plan gefixt | Backlog-Item | Bewusster Scope-Cut; Bug existiert seit Phase 10b und ist unabhängig vom Starter-Thema |
| **11** | `seedUniversalDefaults` seedet EmailTemplates inline statt über `emailTemplateService.seedDefaults` | Inline in `seed-universal-defaults.ts` auf `tx.emailTemplate.create` | `emailTemplateService.seedDefaults` → `emailTemplateRepository.create` öffnet nested `prisma.$transaction` (`email-template-repository.ts:50`), immer mit `isDefault: true` (`email-template-service.ts:181`). Nicht aufrufbar aus `Prisma.TransactionClient`. Content kommt weiterhin ungändert aus `src/lib/email/default-templates.ts` — keine Duplikation. Backlog-Item in Phase 9 (`emailtemplateservice-tx-safe.md`) |

**Resultat: 9 aktive Flags, 2 entfallen (FLAG 2 und FLAG 9)**.

## Execution Order

```
Phase 1 (Rename) → Phase 2 (Interface Split) → Phase 3 (Industry Shared-Config)
   → Phase 4 (seedUniversalDefaults Helper) → Phase 5 (Starter Template)
   → Phase 6 (createFromTemplate Procedure) → Phase 7 (UI Form Extension)
   → Phase 8 (SMTP Banner) → Phase 9 (Docs + Backlog)
```

**Abhängigkeiten**:
- Phase 2 erfordert Phase 1 (umbenannte Dateien)
- Phase 3 erfordert Phase 2 (neues Interface)
- Phase 4 ist unabhängig von Phase 3 (kein Code-Conflict), kann theoretisch
  parallel zu Phase 3 laufen — aber sequentielle Ausführung ist sicherer für
  Code-Review
- Phase 5 erfordert Phase 3 (Shared-Config) und Phase 4 (`seedUniversalDefaults`)
- Phase 6 erfordert Phase 5 (Starter-Template existiert in Registry)
- Phase 7 erfordert Phase 6 (Procedure existiert)
- Phase 8 ist vollständig unabhängig — kann theoretisch vor oder nach Phase 7
  laufen. Im Plan nach Phase 7, weil das Frontend-Review von Phase 7 ohnehin
  nötig ist.
- Phase 9 ist Markdown, läuft am Ende.

**Jede Phase ist als eigener PR mergeable**. Die Phasen 1–6 können in
Production live gehen, ohne dass Phase 7 deployed ist — die neue Procedure ist
dann via API erreichbar, hat aber keine UI. Phase 8 kann unabhängig
released werden.

## Rollback Plan (zusammenfassung pro Phase)

| Phase | Rollback-Strategie | Risiko |
|---|---|---|
| 1 | `git revert` | Niedrig — viele Imports, alle deterministisch |
| 2 | `git revert` | Mittel — Interface-Änderung, Konsumenten-Update nötig |
| 3 | `git revert` | Mittel — 13 Helper umverteilt; Showcase-Test ist der Beweis |
| 4 | `git revert` | Niedrig — neue isolierte Datei |
| 5 | `git revert` | Niedrig — neues Template, kein bestehender Konsument |
| 6 | `git revert` (+ ggf. Phase 7 Revert) | **Hoch** — Helper-Extraktion betrifft die bestehende `create`-Procedure. Manuelles Verifikation der Byte-Kompatibilität ist Pflicht |
| 7 | `git revert` | Niedrig — UI-only, Backend bleibt nutzbar |
| 8 | `git revert` | Niedrig — neue Komponente, nicht-blockierend |
| 9 | `git revert` | Trivial — pure Doku |

Nach Phase 6 ist eine **Hot-Fix-Window**-Periode angeraten: 24 Stunden
Beobachtung der `tenantManagement.create`-Calls in Production, bevor Phase 7
deployed wird. Falls innerhalb dieser Periode ein Byte-Kompatibilitäts-Problem
auftaucht, ist die Reparatur isoliert auf Phase 6 möglich, ohne Phase 7
zurückrollen zu müssen.

## References

- Original Research (Architektur-Survey): `thoughts/shared/research/2026-04-14-demo-template-starter-variant.md`
- Original Research (Voraussetzungen): `thoughts/shared/research/2026-04-14-tenant-template-starter-prerequisites.md`
- Bestehender Demo-Plan: `thoughts/shared/plans/2026-04-09-demo-tenant-system.md`
- Demo Phase 10b Migration: `thoughts/shared/plans/2026-04-11-demo-tenant-platform-migration.md`
- Phase 10a Subscription Bridge: `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md`
- TerpHandbuch §22.17 (Reminder-Defaults), §4.3 (Locations), §4.11 (Holidays),
  §21b.1 (TenantSmtpConfig)

### Konkrete Code-Anker

**Demo-Pfad heute (für Phase 1–3 als Vorlage):**
- `src/lib/demo/types.ts:14-26` — DemoTemplate-Interface
- `src/lib/demo/registry.ts:4-26` — Registry + DEFAULT_DEMO_TEMPLATE
- `src/lib/demo/templates/industriedienstleister_150.ts:135-159` — apply()-Body
- `src/lib/demo/templates/industriedienstleister_150.ts:632-638` — Export
- `src/lib/demo/__tests__/industriedienstleister_150.integration.test.ts:100,105-117`
  — Counts + Timing
- `src/lib/services/demo-tenant-service.ts:142-261` — createDemo()
- `src/lib/services/demo-tenant-service.ts:223-227` — template.apply() Aufruf
- `src/lib/services/demo-tenant-service.ts:244-260` — Auth-Kompensation
- `src/trpc/platform/routers/demoTenantManagement.ts:25-28,69` — templates-Query

**Path B heute (für Phase 6 Helper-Extraktion):**
- `src/trpc/platform/routers/tenantManagement.ts:135-262` — create-Procedure
- `src/trpc/platform/routers/tenantManagement.ts:174` — tx.tenant.create
- `src/trpc/platform/routers/tenantManagement.ts:191` — tx.userGroup.create ADMIN
- `src/trpc/platform/routers/tenantManagement.ts:204` — createUserService
- `src/trpc/platform/routers/tenantManagement.ts:231` — platformAudit.log

**Bestehende UI (für Phase 7 Erweiterung):**
- `src/app/platform/(authed)/tenants/new/page.tsx:55-65` — heutige State-Variablen
- `src/app/platform/(authed)/tenants/new/page.tsx:75-91` — heutige Mutation
- `src/app/platform/(authed)/tenants/new/page.tsx:93-107` — heutiger Submit-Handler
- `src/app/platform/(authed)/tenants/new/page.tsx:122-303` — heutiges Card-Layout

**Wiederverwendete Services (Phase 4 + Phase 6):**
- `src/lib/services/reminder-template-service.ts:176` — seedDefaultsForTenant
- `src/lib/services/email-template-service.ts:159` — seedDefaults
- `src/lib/services/reminder-settings-service.ts:44` — updateSettings
- `src/lib/services/holiday-service.ts:277` — generate({ year, state })
- `src/lib/services/holiday-calendar.ts:30` — GERMAN_STATES
- `src/lib/services/holiday-calendar.ts:78` — generateHolidays(year, state) (pure)
- `src/lib/services/billing-tenant-config-service.ts:24` — upsert (Feldname `companyName`)
- `src/lib/services/location-service.ts:61` — create
- `src/lib/sepa/iban-validator.ts:9,14` — normalizeIban / isValidIban
- `src/lib/services/email-smtp-config-service.ts:47` — smtpConfigService.get
