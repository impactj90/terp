---
date: 2026-04-14T11:00:00+02:00
researcher: tolga
git_commit: 129a9a8c6b0731d076d7a9c690126e8d49cafb8c
branch: staging
repository: terp
topic: "Voraussetzungen für Starter-Templates: Non-Demo-Creation, Pflicht-Stammdaten, Performance, Branche vs. Universal"
tags: [research, codebase, tenant-templates, starter, platform-admin, master-data, transactions]
status: complete
last_updated: 2026-04-14
last_updated_by: tolga
---

# Research: Voraussetzungen für Starter-Templates auf Non-Demo-Tenants

**Date**: 2026-04-14T11:00:00+02:00
**Researcher**: tolga
**Git Commit**: 129a9a8c6b0731d076d7a9c690126e8d49cafb8c
**Branch**: staging
**Repository**: terp

## Research Question

Folge-Recherche zu `thoughts/shared/research/2026-04-14-demo-template-starter-variant.md`.
Richtungsentscheidung aus dem ersten Research: **Starter-Templates laufen als Non-Demo-Tenants** (`isDemo=false`, kein Ablauf, kein Banner). Showcase-Templates bleiben im bestehenden Demo-Pfad.

Vor Planungsbeginn sind vier Themen vollständig zu beantworten:

1. Wie funktionieren die beiden Non-Demo-Erzeugungs-Pfade Path B und Path C heute im Detail? Welcher ist der richtige Einhängepunkt für ein Starter-Template?
2. Vollständiges Inventar aller tenant-scoped Modelle, kategorisiert nach Notwendigkeit (P0/P1/P2/NA) — inklusive Überprüfung der `Employee`-Pflicht-FKs und der `VacationBalance`-Lücke.
3. Transaktions-Scoping und Performance: welche Side-Effects laufen außerhalb der Tx, wo ist das Timeout-Limit, was bedeutet das für ein Starter-Template?
4. Welche Stammdaten sind branchenspezifisch, welche universell, welche per-Instanz?

## Summary

**Thema 1 — Non-Demo-Creation**: Path B (`platformTenantManagement.create`, `tenantManagement.ts:135-262`) ist der reife Pfad: 60s-Transaktion, erzeugt Tenant + On-the-fly-ADMIN-`UserGroup` (`code: "ADMIN"`, `isAdmin: true`) + Admin-User via `createUserService` (inkl. Supabase Auth Admin API + Welcome-Email-Flow mit Fallback-Link). Keine `TenantModule`-Defaults, keine Stammdaten, kein `NumberSequence`, kein `BillingTenantConfig`. Path C (`tenantsRouter.create`, `tenants.ts:288-405`) ist deutlich schlanker: nur Tenant-Row + `UserTenant`-Upsert mit `role: "owner"` für den Aufrufer. Kein Admin-User, keine UserGroup, keine Welcome-Email. Der richtige Einhängepunkt für ein Starter-Template ist **Path B**, entweder durch Erweiterung der bestehenden Procedure oder durch eine parallele `createFromTemplate`-Procedure (Trade-offs siehe Abschnitt 1).

**Thema 2 — Pflicht-Stammdaten**: Von 143 tenant-scoped Modellen im Schema sind nur zwei echte P0-Blocker auf den heutigen Code-Pfaden: **`TenantSmtpConfig`** (hart geworfener `SmtpNotConfiguredError` in `email-send-service.ts:85`) und **`VacationBalance`** (hart geworfener `VacationBalanceNotFoundError` in `vacation-service.ts:364-365`). Alle anderen "Pflicht-Kandidaten" sind entweder lazy-auto-create (`NumberSequence`, `ReminderSettings`, `SystemSetting`), system-seeded mit `tenant_id=NULL` (`EmploymentType`, Core-`AbsenceType`, Core-`BookingType`, Core-`Account`) oder per optional FK abgebildet. **Alle `Employee`-FKs außer `tenantId` sind nullable** — das heutige Showcase-Template umgeht die nicht gesäten Stammdaten nur deshalb ohne Fehler. Die `VacationBalance`-Lücke ist **ein echter Bug im heutigen Template**, der bei der ersten Navigation auf die Urlaubskonto-UI sichtbar wird.

**Thema 3 — Performance**: Das heutige Template erzeugt **~3.422 Rows in ~31 DB-Round-trips**. Die Prisma-Duration auf lokalem Supabase ist konservativ auf **~600–900ms** geschätzt, end-to-end inklusive Supabase-Auth-HTTP-Calls auf **1–4s lokal / 5–15s remote**. Der 120s-Timeout ist mit großer Headroom ausgestattet. **Zwei externe Side-Effects laufen innerhalb des Tx-Callbacks, aber außerhalb des Postgres-Transaktions-Scopes**: `auth.admin.createUser` / `auth.admin.generateLink` (HTTP zu Supabase GoTrue) und `sendUserWelcomeEmail` (SMTP). Bei Tx-Failure ist manuelle Kompensation nötig (`users-service.ts:216-226` + `demo-tenant-service.ts:244-259`). Ein Starter-Template würde **~69 Rows in ~14 Round-trips** erzeugen — Ratio **~50:1** auf Row-Anzahl, **~1.6:1** auf Round-Trips. Die Duration wäre dann fast vollständig von den GoTrue-HTTP-Calls dominiert.

**Thema 4 — Branche vs. Universal**: Sechs Model-Familien sind bereits **system-seeded** oder haben universelle DE-Defaults und brauchen keinen Template-Eingriff (`EmploymentType`, Core-`BookingType`, Core-`AbsenceType`, Core-`Account`, `ReminderSettings`/`ReminderTemplate`, `EmailTemplate`). Sieben sind **branchenspezifisch** (`Department`, `DayPlan`/`WeekPlan`/`Tariff`, `CostCenter`, `EmployeeGroup`/`WorkflowGroup`/`ActivityGroup`, `VacationCalculationGroup`/`VacationCappingRuleGroup`, Homeoffice-Booking-Types, Bonus-`Account`-Buckets, `AbsenceTypeGroup`). Vier sind **per-Instanz** (`BillingTenantConfig`, `Location`, `TenantSmtpConfig`, `Holiday`). Grobe Proportion: **~35% shared/universal, ~40% branch-spezifisch, ~25% per-instance**. Das heutige Template dupliziert teilweise Rows, die bereits per Migration als `tenant_id=NULL` existieren (z.B. FLEX/OT/VAC sowohl systemweit als auch tenant-scoped in `seedAccounts` — Faktum, kein Bewertungsurteil).

## Thema 1 — Non-Demo Tenant-Erzeugung heute

### Path B — `platformTenantManagement.create`

**Datei**: `src/trpc/platform/routers/tenantManagement.ts:135-262`
**Procedure-Typ**: `platformAuthedProcedure` (platform-operator gated)
**Permission**: Platform-Operator-Login (kein Tenant-seitiges Permission-Gate)

#### Input-Schema (Zeilen 136-155)

```
name, slug (lowercase, min 2, Regex /^[a-z0-9-]+$/),
contactEmail (email),
initialAdminEmail, initialAdminDisplayName,
addressStreet, addressZip, addressCity, addressCountry,
billingExempt (default false)
```

Kein `demoTemplate`-Feld — diese Procedure ist Template-agnostisch und weiß nichts vom `src/lib/demo/`-Registry.

#### Control Flow

`$transaction` mit Timeout `60_000` (Zeile 228) umschließt:

1. **Zeilen 164-172** — Slug-Uniqueness-Check via `tx.tenant.findUnique`. Wirft `CONFLICT`.
2. **Zeilen 174-186** — `tx.tenant.create` mit Feldern: `name`, `slug`, `email: input.contactEmail`, `addressStreet/Zip/City/Country`, `isActive: true`, `billingExempt: input.billingExempt`. **`isDemo` wird nicht gesetzt** → DB-Default `false` greift (`schema.prisma:122`).
3. **Zeilen 191-202** — `tx.userGroup.create` legt on-the-fly eine tenant-scoped `UserGroup` an:
   ```
   { tenantId, name: "Administratoren", code: "ADMIN",
     description: "Vollzugriff auf alle Module und Funktionen",
     permissions: [], isAdmin: true, isSystem: false, isActive: true }
   ```
   Der Kommentar an `tenantManagement.ts:188-190` nennt den Grund: "chicken-and-egg — without this, the first user cannot access the UI to manage permissions".
4. **Zeilen 204-223** — `createUserService(tx, tenant.id, { email, displayName, userGroupId: adminGroup.id, isActive: true, isLocked: false }, { userId: PLATFORM_SYSTEM_USER_ID, ipAddress, userAgent })`. Der vierte Parameter ist der Audit-Kontext — der Platform-Operator ist kein Tenant-User, also wird die Tenant-seitige `audit_logs`-Zeile dem `PLATFORM_SYSTEM_USER_ID`-Sentinel zugeschrieben. Die authoritative Operator-Spur kommt aus `platform_audit_logs`.
5. **Zeile 224** — `createdAuthUserId = adminUser.id` (für defensive Kompensation).
6. **Zeilen 231-245** — Nach Tx-Commit: `platformAudit.log` mit `action: "tenant.created"`, Metadaten `{ slug, initialAdminEmail, welcomeEmailSent, billingExempt }`.

#### Was innerhalb von `createUserService` passiert (laut sub-agent report)

- **Zeile 174 (`users-service.ts`)**: `adminClient.auth.admin.createUser(...)` — HTTP-Call zur Supabase Auth Admin API, läuft innerhalb des Tx-Callbacks aber außerhalb jedes Postgres-Locks. Wirft bei Rate-Limiting/Netzwerkproblemen.
- **Zeile 196 (`users-service.ts`)**: Prisma `users.create` via Tx-Client.
- **Zeile 215 (`users-service.ts`)**: `upsertUserTenant` (Join-Row User↔Tenant).
- **Zeile 239 (`users-service.ts`)**: `adminClient.auth.admin.generateLink(...)` — zweiter HTTP-Call zur GoTrue API für Recovery-/Invite-Link.
- **Zeile 268 (`users-service.ts`)**: `sendUserWelcomeEmail(prisma, tenantId, email, displayName, fallbackLink)` — SMTP-Versand. Bei SMTP-Failure: `fallbackLink` wird im Return zurückgegeben.
- **Zeile 290 (`users-service.ts`)**: `auditLog.log(...)` (Tenant-seitige Audit-Row, attribuiert an `PLATFORM_SYSTEM_USER_ID`).
- **Return**: `{ user, welcomeEmail: { sent: boolean, fallbackLink: string | null } }`.

#### Prisma-Writes in Path B (Gesamtliste)

| # | Zeile | Write | Modell | Rows |
|---|-------|-------|--------|------|
| 1 | `tenantManagement.ts:174` | `tx.tenant.create` | `Tenant` | 1 |
| 2 | `tenantManagement.ts:191` | `tx.userGroup.create` (ADMIN) | `UserGroup` | 1 |
| 3 | `users-service.ts:196` | `repo.create` | `User` | 1 |
| 4 | `users-service.ts:215` | `repo.upsertUserTenant` | `UserTenant` | 1 |
| 5 | `users-service.ts:290` | `auditLog.log` | `AuditLog` | 1 |
| 6 | Nach Tx-Commit, `tenantManagement.ts:231` | `platformAudit.log` | `PlatformAuditLog` | 1 |

**Gesamt: 6 Rows in 1 Transaktion**. Keine weiteren Prisma-Writes — insbesondere **kein `tenantModule.upsert`, kein `numberSequence`, kein `billingTenantConfig`, kein `systemSetting`, kein `crmAddress`**. Der frische Tenant startet vollständig leer bis auf Tenant-Row, ADMIN-UserGroup und den Initial-User.

#### Rollback / Kompensation

- Wenn Prisma-Insert scheitert **bevor** `createUserService` aufgerufen wird: Postgres rollt die Tenant-Row und ADMIN-UserGroup zurück. `createdAuthUserId` ist noch `null` — nichts zu kompensieren.
- Wenn Supabase Auth `createUser` scheitert (HTTP-Fehler): `users-service.create` fängt intern und wirft. Die Prisma-Tx rollt zurück. Kein Auth-User existiert. Kein Kompensationsbedarf.
- Wenn Prisma-Insert im Inneren von `users-service` (nach Supabase Auth success) scheitert: `users-service` fängt den Repo-Fehler intern und ruft `auth.admin.deleteUser(authUserId)` selbst auf (Kommentar `tenantManagement.ts:253-258`). Postgres-Tx rollt zurück.
- Die defensive Zuweisung `createdAuthUserId = adminUser.id` an Zeile 224 wird **nur dann noch genutzt**, wenn nach dem User-Service-Erfolg noch weitere Prisma-Writes im Tx-Callback scheitern (hier: keine). Der Kommentar beschreibt sie als "defensive; we do not double-rollback".

#### UI-Sichtbarkeit

Der sub-agent-Run, der Path B im Detail erneut verifizieren sollte, hat einen internen Tool-Error geliefert, bevor die UI-Grep-Aufgabe abgeschlossen wurde. **Unbestätigt**: ob `/platform/(authed)/tenants/page.tsx` oder eine andere UI-Seite diese `create`-Procedure direkt aufruft. Aus der ersten Research-Session ist bekannt, dass `/platform/(authed)/tenants/demo/page.tsx` ausschließlich den **Demo**-Pfad aufruft (`demoTenantManagement.create`), nicht Path B. **Offene Frage 1.1**.

### Path C — `tenantsRouter.create`

**Datei**: `src/trpc/routers/tenants.ts:288-405`
**Procedure-Typ**: `protectedProcedure` (tenant-side auth)
**Permission**: `.use(requirePermission(TENANTS_MANAGE))` — Tenant-User mit `tenants.manage`-Permission.

#### Input-Schema (extern definiert als `createTenantInputSchema`)

Aus dem Code sichtbar: `name`, `slug`, `addressStreet/Zip/City/Country`, `phone?`, `email?`, `payrollExportBasePath?`, `notes?`, `vacationBasis`. **Kein** `initialAdminEmail`, **kein** `initialAdminDisplayName` — der Aufrufer wird selbst zum Owner.

#### Control Flow

`$transaction` ohne expliziten Timeout (Zeile 331) — d.h. Prisma-Default von 5000ms.

1. **Zeilen 293-328** — Input-Normalisierung + manuelle Re-Validierung nach `.trim()` (slug min 3, name nicht leer, alle 4 Adressfelder nicht leer).
2. **Zeilen 333-341** — Slug-Uniqueness-Check via `tx.tenant.findUnique`. Wirft `CONFLICT`.
3. **Zeilen 352-367** — `tx.tenant.create` mit Feldern: `name`, `slug`, `addressStreet/Zip/City/Country`, `phone`, `email`, `payrollExportBasePath`, `notes`, `vacationBasis`, `isActive: true`. **Weder `isDemo` noch `billingExempt` gesetzt** → DB-Defaults greifen (`isDemo=false`, `billingExempt=false`).
4. **Zeilen 371-384** — `tx.userTenant.upsert` mit `userId: ctx.user!.id`, `role: "owner"`. Der aufrufende Benutzer wird Owner des neuen Tenants.
5. **Zeilen 389-399** — Fire-and-forget `auditLog.log` **außerhalb** der Transaktion (`.catch(err => console.error(...))`).

#### Prisma-Writes in Path C

| # | Zeile | Write | Modell | Rows |
|---|-------|-------|--------|------|
| 1 | `tenants.ts:352` | `tx.tenant.create` | `Tenant` | 1 |
| 2 | `tenants.ts:371` | `tx.userTenant.upsert` | `UserTenant` | 1 |
| 3 | `tenants.ts:389` (außerhalb Tx) | `auditLog.log` | `AuditLog` | 1 |

**Gesamt: 2 Rows in Tx + 1 Row post-Tx**. Path C macht **nichts** darüber hinaus — kein Admin-User, keine UserGroup, keine Module, keine Stammdaten, keine Welcome-Email, keine Supabase-Auth-Calls (der Aufrufer ist bereits eingeloggt und wird nur als Owner verknüpft).

#### UI-Sichtbarkeit

Die Existenz eines UI-Aufrufs von Path C wurde in dieser Recherche nicht durch Grep verifiziert. Der Kommentar an `tenants.ts:286` sagt "Replaces: POST /tenants (Go TenantHandler.Create + TenantService.Create)" — was suggeriert, dass es ein Legacy-API-Consumer gibt. Unklar, ob heute irgendeine UI-Stelle `trpc.tenants.create.useMutation` aufruft oder ob die Procedure nur von Tests/Migration-Skripten genutzt wird. **Offene Frage 1.2**.

### Vergleichsmatrix

| | **Path A — Demo** | **Path B — Platform Non-Demo** | **Path C — Tenant Non-Demo** |
|---|---|---|---|
| **Datei** | `demoTenantManagement.ts:85-126` + `demo-tenant-service.ts:142-261` | `tenantManagement.ts:135-262` | `tenants.ts:288-405` |
| **Procedure** | `platformAuthedProcedure` | `platformAuthedProcedure` | `protectedProcedure` + `requirePermission(TENANTS_MANAGE)` |
| **Tenant-Create** | Ja, `isDemo=true`, `demoExpiresAt`, `demoTemplate` | Ja, `isDemo=false` (Default), `billingExempt` explizit | Ja, `isDemo=false`, `vacationBasis` + Legacy-Felder |
| **Admin-User-Create** | Ja, via `createUser(tx, ...)` mit `PLATFORM_SYSTEM_USER_ID` als Audit-Actor | Ja, via `createUserService(tx, ...)` mit `PLATFORM_SYSTEM_USER_ID` als Audit-Actor | **Nein** — `ctx.user` (Aufrufer) wird Owner |
| **Welcome-Email / Fallback-Link** | Ja, via `createUser` Pfad (SMTP oder `fallbackLink`) | Ja, via `createUserService` (gleiche Mechanik) | **Nein** |
| **`tenantModule`-Defaults** | Ja, 4 Upserts (`core/crm/billing/warehouse`) in `demo-tenant-service.ts:185-195` | **Nein** | **Nein** |
| **`NumberSequence`** | Nein (lazy auf erste Nutzung) | Nein (lazy) | Nein (lazy) |
| **`BillingTenantConfig`** | Nein | Nein | Nein |
| **`UserGroup`-Zuweisung** | System "Demo-Admin"-Group (`dd000000-0000-0000-0000-000000000001`), seeded per Migration `20260420100002` | On-the-fly tenant-scoped "ADMIN"-Group (`code: "ADMIN"`, `isAdmin: true`), erzeugt pro Tenant-Create | **Keine** — Owner via `UserTenant.role="owner"`, keine Group-Mitgliedschaft |
| **`CrmAddress`** | Ja, 3 Rows im Template-Apply | Nein | Nein |
| **Template-Apply** | Ja, via `template.apply({tx, tenantId, adminUserId})` innerhalb der Tx | **Nein** (Path B weiß nichts vom Template-System) | **Nein** |
| **Transaktions-Scope** | `$transaction` mit Timeout `120_000` | `$transaction` mit Timeout `60_000` | `$transaction` ohne expliziten Timeout (= Prisma-Default 5000ms) |
| **Supabase Auth Admin API** | Ja, innerhalb Tx-Callback (HTTP außerhalb Postgres) | Ja, innerhalb Tx-Callback (HTTP außerhalb Postgres) | **Nein** |
| **Kompensation bei Fehler** | `users-service` interner Rollback + `demo-tenant-service.ts:244-259` als zweiter Safety-Net | `users-service` interner Rollback (defensiv `createdAuthUserId` Zuweisung ohne Folge-Logik) | Nicht nötig (keine externen Side-Effects) |
| **Audit** | `platform_audit_logs` (`demoTenantManagement.ts:95`) + intern `audit_logs` aus `users-service` | `platform_audit_logs` (`tenantManagement.ts:231-245`) + intern `audit_logs` aus `users-service` | Fire-and-forget `audit_logs` (`tenants.ts:389`, post-Tx) |

### Einhängepunkt für Starter-Template: Entscheidungsanalyse

Drei sinnvolle Optionen für den Einhängepunkt eines Starter-Templates, das einen Non-Demo-Tenant mit vorbefüllten Stammdaten erzeugt:

#### Option A — Path B erweitern (Template-Feld im Input)

Die bestehende `platformTenantManagement.create`-Procedure um ein optionales Feld `tenantTemplate?: string` erweitern. Wenn gesetzt: nach der User-Erstellung ein `getDemoTemplate(key).apply({tx, tenantId, adminUserId})` aufrufen.

- **Vorteile**:
  - Minimal-invasiv: eine neue optionale Input-Spalte + ein Block innerhalb der bestehenden Tx.
  - Eine einzige Procedure für "leer" und "mit Template" — UI muss nur das Feld ein-/ausblenden.
  - Atomic: Template-Apply rollt mit der bestehenden Tx zurück.
- **Nachteile**:
  - Der 60s-Timeout von Path B ist niedriger als der 120s des Demo-Pfads. Ein Starter-Template mit ~69 Rows ist mit großer Headroom machbar (siehe Thema 3), aber sobald das Pflicht-Stammdaten-Set wächst, könnte die Grenze relevant werden.
  - Die `src/lib/demo/`-Registry ist namentlich "Demo". Wenn Path B sie importiert, muss der Name/Ort des Registry-Systems passen oder das Registry wird umbenannt.
  - Vermischung von "Showcase-Demo-Template" und "Starter-Tenant-Template" im selben Registry. Thema 4 zeigt, dass beide Kategorien unterschiedliche Content-Strategien haben (Showcase: maximale Fake-Daten; Starter: nur branchen-Config ohne Personen).

#### Option B — Neue parallele Procedure `createFromTemplate`

Eine eigene `platformTenantManagement.createFromTemplate`-Procedure parallel zu `create`. Input: alle Felder von Path B plus Pflicht-`tenantTemplate: string`. Interne Logik dupliziert Path B und hängt `template.apply(...)` an.

- **Vorteile**:
  - Klare Trennung der Use-Cases im Router: "create leer" vs. "create aus Template".
  - Eigene Tx-Timeout-Konfiguration möglich (z.B. 120s wie Demo, falls größere Template-Sets nötig sind).
  - Kein Risiko, die bestehende Path-B-Semantik zu verändern.
  - UI kann im Dropdown klar zwischen "Leerer Tenant" und "Aus Branchen-Template" unterscheiden.
- **Nachteile**:
  - Code-Duplikation der Path-B-Kernlogik (Tenant-Create, ADMIN-UserGroup, User-Create, Audit) es sei denn, diese wird in einen gemeinsamen internen Helper extrahiert.
  - Zwei Procedures = zwei Audit-Actions (`tenant.created` und `tenant.created_from_template`) → konsistente Filterung in Audit-Views braucht Anpassung.

#### Option C — Zwei-Schritt-Composition (Path B intern aufrufen, dann Template apply)

Neue Procedure, die Path B intern als Service-Funktion aufruft und nach Commit eine **zweite Transaktion** für den Template-Apply öffnet.

- **Vorteile**:
  - Keine Änderung an Path B selbst.
  - Template-Apply läuft in eigener Tx mit eigenem Timeout (z.B. 120s).
  - Die User-Creation (inkl. Supabase Auth + Welcome-Email) ist bereits committed, bevor der Template-Apply startet — falls Template-Apply scheitert, existiert der Tenant trotzdem als nutzbarer (leerer) Non-Demo-Tenant.
- **Nachteile**:
  - **Nicht atomar**: Bei Template-Apply-Failure hat der Operator einen halb-fertigen Tenant. Manuelle Nacharbeit nötig (z.B. erneuter Template-Apply-Call, oder Tenant löschen und neu anlegen).
  - Zwei separate Audit-Einträge für einen semantisch einzelnen Vorgang ("create + template apply").
  - Die erste Tx hat bereits den Welcome-Email verschickt, d.h. der Admin-User hat einen Login-Link für einen leeren Tenant. Template-Apply-Failure nach diesem Punkt = inkonsistenter Zustand für den Nutzer.

#### Trade-off-Vergleich

| Kriterium | Option A (Path B erweitern) | Option B (eigene Procedure) | Option C (Zwei-Schritt) |
|---|---|---|---|
| Atomarität bei Template-Failure | Ja (Rollback inkl. Tenant) | Ja (Rollback inkl. Tenant) | **Nein** (Tenant bleibt leer) |
| Code-Duplikation | Gering | Mittel (ohne Helper-Extraktion) | Gering |
| Tx-Timeout-Flexibilität | Nein (60s gebunden) | Ja (eigener Wert) | Ja (eigener Wert für zweite Tx) |
| UI-Signal "Template vs. leer" | Schwach (Dropdown-Feld in bestehendem Form) | Stark (eigene Action) | Stark (eigene Action) |
| Registry-Kopplung Path B ↔ `src/lib/demo/` | Direkt | Direkt | Indirekt (nur über Helper) |
| Risiko für bestehende `create`-Nutzer | Mittel (neue Input-Spalte, Verhaltensänderung bei Set) | Null | Null |
| Naming-Konflikt "Demo"-Registry | Hoch | Hoch | Hoch |

**Offene Frage 1.3**: Ob die `src/lib/demo/`-Registry für Starter-Templates umbenannt / dupliziert / erweitert werden soll, ist eine separate Architektur-Entscheidung außerhalb dieser Recherche.

## Thema 2 — Pflicht-Stammdaten-Inventar

### Teil A — Vollständiger Scan

Der Prisma-Schema-Scan hat **143 tenant-scoped Modelle** identifiziert (jedes Modell mit einem `tenantId`-Feld, ob required oder nullable). Die vollständige Liste steht in der Sub-Agent-Ausgabe; hier sind die Highlights nach Bereichen sortiert.

**Zahlen nach Kategorie**:

- **Tenant-Hülle / Auth / Plattform**: 8 Modelle (`User`, `UserGroup`, `UserTenant`, `SupportSession`, `TenantModule`, `PlatformSubscription`, `DemoConvertRequest`, `Tenant` selbst)
- **CRM**: 7 Modelle (`CrmAddress`, `CrmContact`, `CrmBankAccount`, `CrmCorrespondence`, `CrmCorrespondenceAttachment`, `CrmInquiry`, `CrmTask`)
- **Billing / Mahnwesen**: 13 Modelle (`BillingDocument`, `BillingDocumentTemplate`, `BillingTenantConfig`, `BillingServiceCase`, `BillingPayment`, `BillingPriceList`, `BillingRecurringInvoice`, `ReminderSettings`, `ReminderTemplate`, `Reminder`, `ReminderItem`, `NumberSequence`, `BillingDocumentPosition`)
- **HR-Stammdaten**: ~20 Modelle (`CostCenter`, `Location`, `EmploymentType`, `Department`, `Team`, `Employee`, `ContactType`, `ContactKind`, `EmployeeCard`, `EmployeeTariffAssignment`, `EmployeeGroup`, `WorkflowGroup`, `ActivityGroup`, `Activity`, `Order`, `OrderAssignment`, `Holiday`, `AccountGroup`, `Account`)
- **Zeitwirtschaft / Schichtplanung**: ~15 Modelle (`DayPlan`, `WeekPlan`, `Tariff`, `BookingType`, `BookingReason`, `BookingTypeGroup`, `AbsenceType`, `AbsenceTypeGroup`, `CalculationRule`, `Shift`, `ShiftAssignment`, `EmployeeDayPlan`, `Macro`, `MacroAssignment`, `MacroExecution`)
- **Urlaubsverwaltung**: 7 Modelle (`VacationSpecialCalculation`, `VacationCalculationGroup`, `VacationCappingRule`, `VacationCappingRuleGroup`, `EmployeeCappingException`, `VacationBalance`, `CalculationRule`)
- **Bewegungsdaten (nie Template-Seed)**: ~20 Modelle (`Booking`, `DailyValue`, `DailyAccountValue`, `AbsenceDay`, `MonthlyValue`, `ImportBatch`, `RawTerminalBooking`, `Correction`, `CorrectionMessage`, `PayrollExport`, `Report`, `Notification`, `NotificationPreference`, `AuditLog`, `EmailSendLog`, `MacroExecution`, `ScheduleExecution`, `ScheduleTaskExecution`, `CronCheckpoint`, `OrderBooking`)
- **Warehouse**: 9 Modelle (`WhArticleGroup`, `WhArticle`, `WhPurchaseOrder`, `WhStockMovement`, `WhSupplierInvoice`, `WhSupplierPayment`, `WhCorrectionRun`, `WhStockReservation`, `WhStocktake`)
- **HR-Akten / DSGVO**: 5 Modelle (`HrPersonnelFileCategory`, `HrPersonnelFileEntry`, `HrPersonnelFileAttachment`, `DsgvoRetentionRule`, `DsgvoDeleteLog`)
- **Email / SMTP / Inbound-Invoice**: ~12 Modelle (`TenantSmtpConfig`, `EmailTemplate`, `EmailDefaultAttachment`, `EmailSendLog`, `TenantImapConfig`, `InboundEmailLog`, `InboundInvoice`, `InboundInvoiceLineItem`, `InboundInvoiceApprovalPolicy`, `InboundInvoiceApproval`, `TenantPayrollWage`, `ExportInterface`, `ExportTemplate`, `ExportTemplateSnapshot`, `ExportTemplateSchedule`)
- **Payroll / SEPA**: ~16 Modelle (`EmployeeSalaryHistory`, `EmployeeChild`, `EmployeeCompanyCar`, `EmployeeJobBike`, `EmployeeMealAllowance`, `EmployeeVoucher`, `EmployeeJobTicket`, `EmployeePension`, `EmployeeSavings`, `EmployeeGarnishment`, `EmployeeParentalLeave`, `EmployeeMaternityLeave`, `EmployeeForeignAssignment`, `EmployeeOtherEmployment`, `PaymentRun`, `PaymentRunItem`, `MonthlyEvaluationTemplate`)
- **Fleet / Travel**: 6 Modelle (`Vehicle`, `VehicleRoute`, `TripRecord`, `TravelAllowanceRuleSet`, `LocalTravelRule`, `ExtendedTravelRule`)
- **Scheduling / Macros**: 6 Modelle (`Schedule`, `ScheduleTask`, `ScheduleExecution`, `ScheduleTaskExecution`, `CronCheckpoint`, `SystemSetting`)
- **Zugangskontrolle**: 3 Modelle (`AccessZone`, `AccessProfile`, `EmployeeAccessAssignment`)

Der heutige Template-Apply (`industriedienstleister_150.ts`) berührt davon **14** (`Department`, `AccountGroup`, `Account`, `DayPlan`, `WeekPlan`, `Tariff`, `BookingType`, `AbsenceType`, `Holiday`, `Employee`, `EmployeeDayPlan`, `CrmAddress`, `BillingDocument`+Position, `WhArticleGroup`+`WhArticle`). **Rund 130 tenant-scoped Modelle bleiben ungesät.**

### Teil B — Code-gestützte Probe-Antworten (Pflicht-Blocker)

#### Probe 1: `BillingDocument` finalisieren ohne `NumberSequence`?

**Kein Blocker.** `src/lib/services/number-sequence-service.ts:65-77` ruft `prisma.numberSequence.upsert(...)` mit `create: { tenantId, key, prefix: <default>, nextValue: 2 }`. Die Sequence wird **lazy beim ersten Dokument** erzeugt, mit Default-Präfix. Kein Pre-Seeding erforderlich.

#### Probe 2: Mahnwesen ohne `ReminderSettings` / `ReminderTemplate`?

**Kein Blocker für Operation; Funktion standardmäßig inaktiv.** `src/lib/services/reminder-settings-service.ts:31-36` — `getSettings()` findet nichts → `prisma.reminderSettings.create({ data: { tenantId } })` mit Schema-Defaults (`enabled: false`). `src/lib/services/reminder-eligibility-service.ts:75-76` kurzschließt `if (!settings.enabled) return []`. Mahnwesen läuft still als "aus" an, bis manuell aktiviert. **`ReminderTemplate`** ist erst beim tatsächlichen Mahndokument-Rendern relevant — default-seeding via `seedDefaultsForTenant` (`reminder-template-service.ts:132-187`) ist vorhanden, wird aber **nicht automatisch** beim Tenant-Create aufgerufen.

#### Probe 3: Email-Versand ohne `TenantSmtpConfig` / `EmailTemplate`?

**`TenantSmtpConfig` ist ein harter Blocker.** `src/lib/services/email-send-service.ts:84-85` — `send()` ruft `smtpConfigService.get(prisma, tenantId)` und wirft `SmtpNotConfiguredError` wenn `null`. Ebenfalls Zeilen 318-319 für `sendReminderEmail()`. **Ohne SMTP-Config kann der Tenant keine einzige Email versenden** (weder Rechnung noch Mahnung noch Welcome).

**`EmailTemplate` ist kein Blocker.** `email-send-service.ts:239-252` — wenn kein Template gefunden, default auf leere Strings `""` für Subject/Body. Fallback ist im Code bei `src/lib/email/default-templates.ts` für 8 Dokumenttypen vordefiniert (wird bei Abwesenheit einer DB-Zeile automatisch gezogen).

Die UI-Preview `getDocumentEmailContext()` an `email-send-service.ts:277` gibt `canSend: !!smtpConfig && !!docData.pdfStoragePath` zurück — die UI degradiert elegant, aber der Send-Button bleibt inaktiv.

#### Probe 4: `Employee` anlegen ohne `EmploymentType`?

**Kein Blocker.** `prisma/schema.prisma:1791` — `employmentTypeId String? @map("employment_type_id") @db.Uuid` → **nullable**. `employees-service.ts:183` — `employmentTypeId?: string` im Create-Input → optional. Zudem: System-EmploymentTypes mit `tenant_id=NULL` existieren per Migration `20260101000089` (VZ/TZ/MINI/AZUBI/WERK/PRAKT) und sind für alle Tenants sichtbar.

#### Probe 5: Urlaubsantrag ohne `VacationCalculationGroup`/`VacationCappingRuleGroup`?

**Kein Blocker für die Genehmigung selbst.** `src/lib/services/vacation-service.ts:399-403` — `initializeYear()` resolvt `VacationCalculationGroup` und `Tariff` optional; fällt auf `Employee.vacationDaysPerYear` zurück, wenn nichts verlinkt ist. `VacationCappingRuleGroup` wird nur für Carry-Over-Caps konsultiert; ohne Gruppe = keine Capping, unbegrenzte Übertragung.

**Aber**: `vacation-service.ts:364-365` — `getBalance()` wirft `VacationBalanceNotFoundError`, wenn kein `VacationBalance`-Row existiert. Dieser Pfad wird bei jeder Urlaubs-Balance-Anzeige durchlaufen. Das ist der einzige harte Urlaubs-Blocker (siehe Teil D).

#### Probe 6: Login ohne UserGroup-Zuweisung jenseits ADMIN?

**Kein Blocker.** Path B erzeugt die ADMIN-Gruppe on-the-fly (`tenantManagement.ts:191-202`) mit `isAdmin: true`, was den Permission-Check komplett umgeht. Der Initial-User ist darin Mitglied. Zusätzliche Gruppen wären nur nötig, wenn der Tenant später limitierte Non-Admin-User anlegt — das ist aber ein Zweitschritt, kein Go-Live-Blocker.

### Teil C — Kategorisierung (P0 / P1 / P2 / N/A)

#### P0 — Pflicht für Go-Live

| Modell | Blocker-Beleg |
|---|---|
| **`TenantSmtpConfig`** | Harter Throw `SmtpNotConfiguredError` in `email-send-service.ts:85`. Ohne diese Config kann der Tenant keine Emails versenden — blockiert Rechnungsversand und Mahnwesen am Tag 1. |
| **`VacationBalance`** | Harter Throw `VacationBalanceNotFoundError` in `vacation-service.ts:364-365`. Blockiert die Urlaubskonto-Anzeige für jeden Employee. Wird heute in `seed.sql §19` für den Dev-Tenant gesät, aber **nicht vom Demo-Template**. Bug im Showcase (siehe Teil D). |

Das sind die einzigen zwei Modelle im gesamten Schema, die einen echten Code-Blocker auf häufig genutzten UI-Pfaden produzieren, sobald Standard-Tenant-Workflows ausgeführt werden.

#### P1 — Stark empfohlen (Onboarding-Friction)

| Modell | Begründung |
|---|---|
| **`BillingTenantConfig`** | Enthält Firmenname, IBAN, BIC, Steuer-ID, Leitweg-ID, Logo-URL, Footer-HTML. Ohne = Rechnungs-PDFs ohne Briefkopf. Nicht geworfen, aber für Kundenversand faktisch Pflicht. |
| **`ReminderSettings`** (mit `enabled=true`) | Lazy-erstellt mit `enabled: false`, also muss der Tenant manuell aktivieren. Für Mahnwesen-aktive Tenants Pflicht vor dem ersten Zahlungsziel. |
| **`ReminderTemplate`** (3 Default-Templates) | `seedDefaultsForTenant` existiert (`reminder-template-service.ts:132-187`), wird aber nicht automatisch ausgeführt. Für Mahnversand vor dem ersten Mahndokument nötig. |
| **`EmailTemplate`** | Fallback auf hardcoded Defaults in `src/lib/email/default-templates.ts` vorhanden; ohne DB-Zeilen läuft Send-Service mit leerem Subject/Body weiter. Für markierte Customer-Experience dringend, aber kein technischer Blocker. |
| **`CostCenter`** | `Employee.costCenterId` nullable; kein Throw, aber Reporting/Export fehlt der Kontext. Handbuch-Referenz §4.4 nennt es als Onboarding-Schritt. |
| **`Location`** | `Employee.locationId` nullable; kein Blocker, aber für multi-site Firmen unmittelbar benötigt. |
| **`EmployeeGroup`** | Nullable, aber jeder Reporting-Filter fehlt die Gruppierung. |
| **`WorkflowGroup`** | Nullable, aber Absence-Approval-Routing kann nicht konfiguriert werden. |
| **`ActivityGroup`** | Nullable, aber Activity-basiertes Order-Booking braucht die Gruppen-Taxonomie. |
| **`NumberSequence`** (Prefix-Setup) | Lazy-Auto-Create mit Default-Präfixen. P1 nur wenn kundenspezifische Präfixe (`RE-`, `AN-`) gewünscht sind — viele Firmen nehmen die Defaults an. |

#### P2 — Optional (Advanced Features)

| Modell | Grund |
|---|---|
| `SystemSetting` | Singleton-Tabelle mit allen Columns defaulted; auto-created on first access. |
| `AbsenceTypeGroup` | Gruppiert Absence-Types für UI; Funktion läuft ohne. |
| `BookingTypeGroup` | Gruppiert Booking-Types für Terminal/UI; Funktion läuft ohne. |
| `VacationSpecialCalculation` / `VacationCalculationGroup` | Fall-back auf `Employee.vacationDaysPerYear`. Nur für Alters-/Dienstalter-Boni relevant. |
| `VacationCappingRule` / `VacationCappingRuleGroup` / `EmployeeCappingException` | Ohne = keine Carry-Over-Caps (unbegrenzt). Nur relevant wenn Tarifvertrag Capping erzwingt. |
| `ContactType` / `ContactKind` | Custom Contact Fields für Employees. String-Spalte als Fallback. |
| `Shift` / `ShiftAssignment` | Advanced Schichtplanungs-Board. Employees arbeiten ohne Zuweisung. |
| `Macro` / `MacroAssignment` / `MacroExecution` | Automatisierte Account-Aktionen. Optional. |
| `AccessZone` / `AccessProfile` / `EmployeeAccessAssignment` | Physische Zugangskontrolle. Keine Kopplung an Kern-Zeitwirtschaft. |
| `ExportInterface` / `ExportTemplate` / `TenantPayrollWage` | DATEV/Lexware-Export. Nur bei aktivem Payroll-Modul Pflicht. |
| `Vehicle` / `VehicleRoute` / `TripRecord` / `TravelAllowanceRuleSet` / `LocalTravelRule` / `ExtendedTravelRule` | Fleet/Travel-Modul. Optional. |
| `HrPersonnelFileCategory` / `HrPersonnelFileEntry` / `HrPersonnelFileAttachment` | HR-Akte. Optional. |
| `DsgvoRetentionRule` / `DsgvoDeleteLog` | DSGVO-Cron. Cron überspringt wenn keine Rules. |
| `TenantImapConfig` / `InboundEmailLog` / `InboundInvoice*` | Inbound-Invoice-Modul. Advanced. |
| `PaymentRun` / `PaymentRunItem` | SEPA pain.001. Advanced. |
| `EmailDefaultAttachment` | Default-PDF-Anhänge in Emails. Optional. |
| `Schedule` / `ScheduleTask` etc. | Interner Scheduler. Optional. |
| `Team` | Employees ohne Team-Zuweisung möglich. |
| `Activity` / `Order` / `OrderAssignment` / `OrderBooking` | Orders-Modul. Optional. |
| `EmployeeCard` / `EmployeeTariffAssignment` | RFID + Tarif-Historie. Direct `Employee.tariffId` ist der aktuelle Tarif. |
| `MonthlyEvaluationTemplate` | Custom Report-Format. |
| `ImportBatch` / `RawTerminalBooking` | Terminal-Import. Nur bei Hardware-Terminals. |
| `BillingPriceList` / `BillingRecurringInvoice` / `BillingDocumentTemplate` / `BillingServiceCase` | Billing-Sub-Features. Optional. |
| `EmployeeSalaryHistory` / Payroll Sub-Tables | Nur bei Payroll-Export. |
| `CalculationRule` | Nullable auf Absence-Type. Credit-Berechnung default 0. |

#### N/A — Nicht im Template-Scope

| Modell | Grund |
|---|---|
| `TenantModule` | Wird vom Platform-Admin gesetzt, nicht vom Kunden-Template. |
| `PlatformSubscription` | Operator-Side Billing-Bridge. |
| `DemoConvertRequest` | Platform-Inbox-Row, vom Self-Service-Flow erzeugt. |
| `SupportSession` | Platform-Admin-Impersonation. |
| `UserTenant` | Automatisch bei User/Tenant-Create. |
| `AuditLog` | Von Services geschrieben. Nie manuell. |
| `Notification` / `NotificationPreference` | Runtime-erzeugt. |
| `EmailSendLog` | Vom Send-Service geschrieben. |
| `PayrollExport` / `Report` | Generierte Artefakte. |
| `MacroExecution` / `ScheduleExecution` / `ScheduleTaskExecution` | Runtime-Historie. |
| `Booking` / `DailyValue` / `DailyAccountValue` / `AbsenceDay` / `MonthlyValue` / `Correction` / `CorrectionMessage` | Transaktionsdaten. |
| `CronCheckpoint` | Cron-Idempotenz-State. |

### Teil D — `Employee` Pflicht-FK-Analyse

`Employee` ist deklariert an `prisma/schema.prisma:1776`. Jede Spalte im Modell plus Nullability:

| Feld | Schema-Zeile | Type | Nullability |
|---|---|---|---|
| `tenantId` | 1780 | `String` | **Required** (FK → `Tenant`, non-optional) |
| `departmentId` | 1789 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `costCenterId` | 1790 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `employmentTypeId` | 1791 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `tariffId` | 1800 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `employeeGroupId` | 1818 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `workflowGroupId` | 1819 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `activityGroupId` | 1820 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `defaultOrderId` | 1831 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `defaultActivityId` | 1832 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `locationId` | 1835 | `String?` | **Nullable** (`onDelete: SetNull`) |
| `healthInsuranceProviderId` | 1850 | `String?` | **Nullable** (`onDelete: SetNull`) |

**Ergebnis**: **Ausnahmslos jede FK auf `Employee` außer `tenantId` ist nullable.** Der `employees-service.ts:170-341` `create()` nimmt alle FK-Inputs als optional (`?: string`) und mapped fehlende Werte auf `null`.

**Das heutige Showcase-Template umgeht die ungesäten Stammdaten genau deshalb ohne Fehler**: Es setzt nur `departmentId` und `tariffId`, alle anderen Felder bleiben `null`. Es gibt heute keinen versteckten Fehler, der durch strikten Migration-Zustand brechen würde — die Nullability ist schema-seitig verankert.

**Konsequenz für Starter**: Ein Starter-Template, das `CostCenter`, `Location`, `EmployeeGroup` etc. nicht seedet, produziert keine FK-Verletzungen. Selbst wenn der Kunde danach manuell Employees anlegt, können diese zunächst ohne diese Felder existieren und später per Update ergänzt werden.

### Teil E — VacationBalance-Lücke im Showcase

Die Investigation hat eindeutig festgestellt:

1. **`vacation-service.ts:357-368`**: `getBalance()` ruft `repo.findBalanceWithEmployee()` und wirft bei `null` → `VacationBalanceNotFoundError`. Dieser Fehler wird in `src/trpc/routers/vacation.ts:205-212` via `handleServiceError` als `NOT_FOUND` propagiert. **Kein Lazy-Create**, **kein Default-Null-Return**.

2. **`employees-service.ts:170-341`** — `create()` hat **keinen** `vacationBalance.create`-Side-Effect. Grep bestätigt: null Treffer für `vacationBalance` in dieser Datei.

3. **Keine Cron / kein Trigger** backfillt `VacationBalance` automatisch. Der einzige Bulk-Create-Pfad ist `vacation-balances-service.ts:62-138` `initializeBalances()`, manuell aufrufbar via `vacationBalances.initializeBatch` Mutation (`vacationBalances.ts:138-170`). Diese wird vom Showcase-Template **nicht** aufgerufen.

4. **`supabase/seed.sql §19`** seedet für den Dev-Tenant explizit `vacation_balances` für 2025 und 2026. Das Showcase-Demo-Template tut das nicht — die Lücke existiert **nur im Demo-Template, nicht im Dev-Seed**.

**Konsequenz**: Sobald ein Demo-User in der UI auf "Urlaubskonto" für irgendeinen der 150 Employees navigiert, triggert der Balance-Query einen `NOT_FOUND`-Fehler. Die UI-Reaktion hängt davon ab, ob die Vacation-Balance-Komponente `NOT_FOUND` als "noch keine Bilanz initialisiert"-Zustand abfängt oder als Runtime-Error propagiert. **Offene Frage 2.1**: tatsächliches UI-Verhalten beim Demo.

**Relevanz für Starter**: Ein Starter-Template seedet keine Employees → keine Balances → keine Lücke. Die Frage ist nur für die bestehende Showcase-Variante ein Reparatur-Thema.

## Thema 3 — Transaktions- und Performance-Schranken

### Prisma-Writes im `createDemo + apply()`-Lauf

**Pre-Template (`demo-tenant-service.ts:163-219`)** — 8 Rows / 9 Round-trips:

| Call | Modell | Rows | Round-trips |
|---|---|---|---|
| `repo.createDemoTenant` (`demo-tenant-service.ts:169`) | `Tenant` | 1 | 1 |
| `tx.tenantModule.upsert` × 4 (`demo-tenant-service.ts:185-195`) | `TenantModule` | 4 | **4** (sequential loop) |
| `repo.findSystemDemoAdminGroup` (`demo-tenant-service.ts:198`) | `UserGroup` read | 0 | 1 |
| `repo.findUserGroupById` (`users-service.ts:146`) | `UserGroup` read | 0 | 1 |
| `repo.create` (`users-service.ts:196`) | `User` | 1 | 1 |
| `repo.upsertUserTenant` (`users-service.ts:215`) | `UserTenant` | 1 | 1 |
| `auditLog.log` (`users-service.ts:290`) | `AuditLog` | 1 | 1 |

**Template-Apply** — ~3.422 Rows / ~22 Round-trips:

| Helper | Zeile | Typ | Modell | Rows | Round-trips |
|---|---|---|---|---|---|
| `seedDepartments` | 185 | `createMany` | `Department` | 4 | 1 |
| `seedAccounts` (Gruppe) | 192 | `create` | `AccountGroup` | 1 | 1 |
| `seedAccounts` (Konten) | 214 | `createMany` | `Account` | 10 | 1 |
| `seedDayPlans` | 233 | `createMany` | `DayPlan` | 3 | 1 |
| `seedWeekPlans` | 258 | `createMany` | `WeekPlan` | 3 | 1 |
| `seedTariffs` | 299 | `createMany` | `Tariff` | 12 | 1 |
| `seedBookingTypes` | 315 | `createMany` | `BookingType` | 8 | 1 |
| `seedAbsenceTypes` | 326 | `createMany` | `AbsenceType` | 6 | 1 |
| `seedHolidays` | 342 | `createMany` | `Holiday` | 20 | 1 |
| `seedEmployees` | 392 | `createMany` | `Employee` | 150 | 1 |
| `seedEmployeeDayPlans` | 437-439 | `createMany × N batches` | `EmployeeDayPlan` | ~3.150 | **3–4** (BATCH=1000) |
| `seedCrmAddresses` | 485 | `createMany` | `CrmAddress` | 3 | 1 |
| `seedBillingDocuments` | 548, 561-572 | `create` with nested positions × 5 | `BillingDocument` + `Position` | 5 + 15 | **5** (sequential loop) |
| `seedWarehouse` (Gruppen) | 583 | `createMany` | `WhArticleGroup` | 2 | 1 |
| `seedWarehouse` (Artikel) | 625 | `createMany` | `WhArticle` | 30 | 1 |

**Gesamt (createDemo + apply)**: ~3.430 Rows in ~31 Round-trips. Dominant: `EmployeeDayPlan` (92% der Rows, 13% der Round-trips) und das billing-loop (14% der Round-trips für 5 Rows).

### Messbare Duration (tatsächliche Zahlen)

- `src/lib/demo/__tests__/industriedienstleister_150.integration.test.ts:98-100` setzt `elapsedMs = Date.now() - started` und **asserted** `toBeLessThan(90_000)`. Es **loggt** die Zahl aber **nicht**.
- `src/lib/services/__tests__/demo-tenant-service.integration.test.ts` hat keine Timing-Instrumentierung.
- **Kein Log-Output, keine Benchmark-Notiz** in `thoughts/`. Reale Wall-Clock-Zahlen nur durch Test-Laufzeit-Messung ermittelbar. **Offene Frage 3.1**.

### Schätzung basierend auf Operation-Kosten

| Komponente | Konservative Schätzung |
|---|---|
| 2 Reads (UserGroup × 2) | ~10 ms |
| 1 Tenant `create` | ~5 ms |
| 4 `TenantModule.upsert` sequentiell | ~20 ms |
| User + UserTenant + AuditLog | ~15 ms |
| 14 `createMany`-Calls (KONFIGURATION + Employees) | ~150 ms |
| 3–4 EmployeeDayPlan-Batches (1000 Rows/Batch) | ~300–600 ms |
| 5 BillingDocument-Creates sequentiell | ~100 ms |
| **Prisma-Zwischensumme** | **~600–900 ms** |
| Supabase Auth `createUser` (HTTP) | ~100–500 ms lokal / ~300–800 ms remote |
| Supabase Auth `generateLink` (HTTP) | ~100–500 ms lokal / ~300–800 ms remote |
| SMTP Welcome-Email | ~100–2000 ms oder Skip (Dev SMTP) |

**Lokale Schätzung end-to-end**: ~1–4 s.
**Remote (Staging/Prod) Schätzung**: ~5–15 s (zusätzlich 10–50ms pro Prisma-Round-Trip als Netzwerk-Overhead → ~310-1550ms).

**Timeout-Headroom**: 120.000 ms vs. ~4.000 ms lokal → ~116 s Headroom. vs. ~15 s remote → ~105 s Headroom.

### Side-Effects außerhalb der Postgres-Transaktion

Drei externe Operationen laufen **innerhalb des `$transaction`-Callbacks**, aber **außerhalb des Postgres-Transaktions-Scopes**:

1. **`auth.admin.createUser`** (`users-service.ts:174`) — HTTP-Call zur Supabase GoTrue Admin API. Muss vor dem Prisma-Insert erfolgen (Kommentar `users-service.ts:167-172`). Nicht rollbackable. Kompensation: `users-service.ts:216-226` fängt Prisma-Repo-Fehler intern und ruft `auth.admin.deleteUser(authUserId)` auf. Zweite Safety-Net-Kompensation in `demo-tenant-service.ts:244-259` für den umliegenden Demo-Flow.

2. **`auth.admin.generateLink`** (`users-service.ts:239`) — HTTP-Call zur GoTrue API für Recovery/Invite-Link. Nicht rollbackable. Non-destructive (nur Link-Generation).

3. **`sendUserWelcomeEmail`** (`users-service.ts:268`) — SMTP-Versand. Nicht rollbackable. Bei Tx-Rollback nach diesem Punkt ist der Welcome-Email bereits versandt — inkonsistenter Zustand.

**Konsequenz für Path B** (`tenantManagement.ts:135-262`): Exakt die gleiche Mechanik. `createUserService` läuft im selben Pattern — Supabase-Auth + SMTP im Inneren, Prisma-Writes davor/dabei/danach.

### Starter-Template Row-Count-Schätzung

Basierend auf der KONFIGURATION-Kategorisierung aus dem ersten Research-Dokument:

| Modell | Showcase | Starter |
|---|---|---|
| `Department` | 4 | 4 |
| `AccountGroup` | 1 | 1 |
| `Account` | 10 | 10 |
| `DayPlan` | 3 | 3 |
| `WeekPlan` | 3 | 3 |
| `Tariff` | 12 | 12 |
| `BookingType` | 8 | 8 |
| `AbsenceType` | 6 | 6 |
| `Holiday` | 20 | 20 |
| `CrmAddress` | 3 | 0 |
| `WhArticleGroup` | 2 | 2 |
| `WhArticle` | 30 | 0 |
| `Employee` | 150 | 0 |
| `EmployeeDayPlan` | ~3.150 | 0 |
| `BillingDocument` | 5 | 0 |
| `BillingDocumentPosition` | 15 | 0 |
| **Template-Summe** | **~3.422** | **~69** |

**Ratio**: 50:1 auf Row-Anzahl. Plus eventuelle Pflicht-Stammdaten-Additionen aus Thema 2 (P1-Set): `CostCenter` (~3-10 Rows), `Location` (~1-5), `EmployeeGroup` (~3-5), `WorkflowGroup` (~1-3), `ActivityGroup` (~1-3), `BillingTenantConfig` (1 Row), `ReminderSettings` (1 Row, lazy sowieso), `ReminderTemplate` (3 Rows per seedDefaults), `EmailTemplate` (8 Default-Rows wenn explizit seeded statt Fallback). Summe P1-Add: **~20-40 Rows**.

**Starter-Gesamtbudget**: ~90-110 Rows, ~18-22 Round-Trips.

**Round-Trip-Ratio**: 22 (Showcase) vs. 14-18 (Starter) = ~1.3:1. Die Zeit-Einsparung der Starter-Variante liegt primär in den eliminierten `EmployeeDayPlan`-Batches (~300-600ms) und den 5 sequenziellen Billing-Creates (~100ms). Die Prisma-Duration einer Starter-Seed sinkt auf ~150-250ms; end-to-end dominiert dann fast vollständig die GoTrue-HTTP-Latenz.

### Tx-Timeout-Bewertung für Path B + Template

Path B hat heute **60.000 ms** Timeout. Mit Template-Apply (~70-110 Rows, ~18 Round-trips, geschätzt ~200-400ms Prisma + GoTrue-HTTP) ist das **mehr als ausreichend**. Selbst mit wachsendem P1-Set bis ~200 Rows bleibt die Timeout-Headroom im Bereich von ~50 s.

## Thema 4 — Branche vs. Universal vs. Per-Instanz

Systematische Klassifizierung aller Stammdaten-Model-Familien, die für ein Template relevant sind.

### Klassifizierungs-Tabelle

| # | Modell | Klassifizierung | Begründung + Quelle |
|---|---|---|---|
| 1 | `NumberSequence` | **UNIVERSAL** | Key-Taxonomie (customer/supplier/inquiry/offer/invoice/delivery_note) ist fix in `number-sequence-service.ts:35-62` (DEFAULT_PREFIXES). Lazy-Auto-Create, keine Template-Aktion nötig. Handbuch §12.4. |
| 2 | `BillingTenantConfig` | **PER-INSTANCE** | Enthält Firmenname, IBAN, BIC, Steuer-ID, Leitweg-ID, Logo-URL, Footer-HTML. Schema `prisma/schema.prisma:1003-1031` alle nullable. Handbuch §"Briefpapier/Billing-Konfiguration". |
| 3 | `EmploymentType` | **SYSTEM-SEEDED** | Migration `20260101000089_employment_types_nullable_tenant_and_defaults.sql:15-27` seedet 6 Rows mit `tenant_id=NULL`: VZ/TZ/MINI/AZUBI/WERK/PRAKT. Decken BGB/SGB-IV komplett ab. |
| 4 | `VacationCalculationGroup` | **INDUSTRY** | `basis: calendar_year` vs. `entry_date` variiert. Handbuch Zeile 1256-1257 nennt beide Varianten mit "Standard in den meisten Unternehmen" für `calendar_year`. Tarif- und Branchen-abhängig. |
| 5 | `VacationCappingRuleGroup` | **INDUSTRY** | Resturlaub-Verfall-Regeln folgen Tarifverträgen (iGZ/BAP/BSRB/Haustarif). Handbuch §7 Praxisbeispiel Zeile 3028-3042 zeigt "KAPP-5T" als custom Rule. Schema `prisma/schema.prisma:3044-3062`. |
| 6 | `AbsenceTypeGroup` | **UNIVERSAL** | Reine Gruppierung für UI-Filterung. Handbuch §4.10 Zeile 1830-1847. Die underlying `AbsenceType`s sind system-seeded. |
| 7 | `EmployeeGroup` | **INDUSTRY** | Klassifikations-Taxonomie; Industrie: "Schicht A"/"Schicht B"/"Verwaltung"; Gebäudereinigung: "Objekt Nord"/"Objekt Süd"; Büro: 1 Group. Schema `prisma/schema.prisma:2144-2160`, keine System-Rows. |
| 8 | `WorkflowGroup` | **INDUSTRY** | Approval-Routing variiert. Schichtbetriebe brauchen spezifische Workflows. |
| 9 | `ActivityGroup` | **INDUSTRY** | Activity-Taxonomie ist direkt branchen-operativ (Entwicklung vs. Wartung vs. Objektbetreuung). |
| 10 | `CostCenter` | **INDUSTRY** | Spiegel der P&L-Struktur. Handbuch §4.4 Zeile 688-734 mit Handwerksbetrieb-Beispiel. Industrie: Produktion/Lager/Verwaltung; Facility Management: Objekt-Zentren; Büro: Funktions-Zentren. |
| 11 | `Location` | **PER-INSTANCE** | Physische Standorte mit echten Adressen. Handbuch §4.3 Zeile 658-686. |
| 12 | `ReminderSettings` | **UNIVERSAL** | Schema-Defaults sind DE-gesetzliche Universals: `maxLevel=3`, `gracePeriodDays=[7,14,21]`, `interestRatePercent=9` (BGB §288 Abs. 2 B2B). Handbuch §22.17 Zeile 10830-10837 nennt explizit "Standardwerte". |
| 13 | `ReminderTemplate` | **UNIVERSAL** | `reminder-template-service.ts:132-187` `seedDefaultsForTenant` seedet 3 identische formale DE-Templates. Handbuch §22.17. |
| 14 | `TenantSmtpConfig` | **PER-INSTANCE** | Echte SMTP-Credentials. Untempltable. Handbuch §21b.1. |
| 15 | `EmailTemplate` | **UNIVERSAL** | `src/lib/email/default-templates.ts` enthält Code-Fallback für 8 Dokumenttypen in industrie-neutralem formalem Deutsch. Handbuch §21b.2 Zeile 10052-10053. |
| 16 | `Department` | **INDUSTRY** | Bereits branchen-spezifisch im heutigen Template (`industriedienstleister_150.ts:36-41`). |
| 17 | `DayPlan` / `WeekPlan` / `Tariff` | **INDUSTRY** | Bereits branchen-spezifisch. |
| 18 | `BookingType` | **SYSTEM-SEEDED (core) + INDUSTRY (extras)** | Migration `20260101000087_seed_default_booking_types.sql:4-23` seedet 6 Core-Types mit `tenant_id=NULL` (Kommen/Gehen/Pause/Dienstgang). Demo-Template ergänzt 2 Homeoffice-Types (`industriedienstleister_150.ts:83-84`) — für Büro relevant, für Fertigung/Reinigung irrelevant. |
| 19 | `AbsenceType` | **SYSTEM-SEEDED** | Migration `20260101000086_seed_default_absence_types.sql:5-30` seedet 10 Types mit `tenant_id=NULL`. Deckt alle gesetzlichen DE-Kategorien. Demo-Template dupliziert teilweise mit eigenen tenant-scoped Rows. |
| 20 | `Holiday` | **PER-INSTANCE (Bundesland)** | Geographisch abhängig, nicht branchen-abhängig. Handbuch §4.11 Zeile 1872-1889 nennt UI-"Generieren"-Button für Bundesland-Wahl. |
| 21 | `Account` | **SYSTEM-SEEDED (core) + INDUSTRY (bonus)** | Migration `20260101000007_create_accounts.sql:18-21` seedet 3 Core-Accounts (FLEX/OT/VAC) + Migration `20260101000092_seed_net_cap_system_accounts.sql:2-6` seedet NET/CAP. Demo-Template dupliziert FLEX/OT/VAC tenant-scoped und ergänzt BON_NT/BON_SN/BON_FT/TRG/ACT/BRK/ILL — Bonus-Buckets branchenspezifisch (Schicht-/Sonntags-/Feiertagszuschlag relevant für Industrie/Reinigung, irrelevant für Büro). |

### Narrative Zusammenfassung

**Shared Config Layer** (kein Template-Eingriff nötig, ~35%):
- `EmploymentType`, Core-`BookingType`, Core-`AbsenceType`, Core-`Account` (FLEX/OT/VAC/NET/CAP): per Migration mit `tenant_id=NULL` system-seeded.
- `NumberSequence`: lazy auto-create mit universal DE-Defaults.
- `ReminderSettings`/`ReminderTemplate`: universal DE-Defaults (BGB §288 Abs. 2, formale DE-Texte).
- `EmailTemplate`: Code-Fallback in `default-templates.ts`.
- `AbsenceTypeGroup`: rein organisatorische Gruppierung.

**Branch Config Layer** (braucht Template pro Branche, ~40%):
- `Department`, `DayPlan`/`WeekPlan`/`Tariff` (bereits im heutigen Template)
- `CostCenter` (Kostenstellen-Taxonomie)
- `EmployeeGroup`/`WorkflowGroup`/`ActivityGroup` (Klassifikation + Approval + Tätigkeits-Taxonomie)
- `VacationCalculationGroup`/`VacationCappingRuleGroup` (Tarifvertrag-abhängig)
- Bonus-`Account`-Buckets (Schicht-/Wochenend-/Feiertagszuschläge)
- `BookingType`-Extras (Homeoffice-Pair für Büro, leer für Produktion)

**Per-Instance Layer** (untemplatable, jeder Kunde muss eigene Daten einpflegen, ~25%):
- `BillingTenantConfig`: Firmenidentität
- `Location`: physische Standorte
- `TenantSmtpConfig`: SMTP-Credentials
- `Holiday`: Bundesland-Wahl (geographisch, nicht branchen-spezifisch; trotzdem pro Tenant individuell)

**Konsequenz für Template-Architektur**: Eine saubere Schichtung wäre:
1. Migration-Layer (bereits vorhanden) deckt ~35% automatisch ab
2. Shared-Universal-Layer als optionaler Template-Seed-Helper (`seedUniversalDefaults(tx, tenantId)`) — z.B. `ReminderSettings.enabled=true` mit Standard-Cadence, `ReminderTemplate`-Defaults, `NumberSequence`-Custom-Präfixe
3. Branch-Layer als `src/lib/demo/templates/<branche>/shared.ts` mit den ~40% branchen-spezifischen Configs
4. Showcase-Overlay als `src/lib/demo/templates/<branche>/showcase.ts` mit Fake-Employees/Bookings
5. Starter-Overlay: leer (nimmt nur branch-shared)
6. Per-Instance: Kein Template, sondern Pflichtfelder in der Tenant-Create-UI (z.B. Bundesland-Wahl für Holiday-Generator)

## Code References

### Path B — Platform Non-Demo Create

- `src/trpc/platform/routers/tenantManagement.ts:135-262` — `platformTenantManagement.create` Procedure
- `src/trpc/platform/routers/tenantManagement.ts:162-229` — `$transaction` mit 60s Timeout
- `src/trpc/platform/routers/tenantManagement.ts:174-186` — `tx.tenant.create` ohne `isDemo`-Feld
- `src/trpc/platform/routers/tenantManagement.ts:191-202` — On-the-fly ADMIN `UserGroup.create`
- `src/trpc/platform/routers/tenantManagement.ts:204-223` — `createUserService` Aufruf mit `PLATFORM_SYSTEM_USER_ID` Audit-Actor
- `src/trpc/platform/routers/tenantManagement.ts:231-245` — `platformAudit.log` post-commit

### Path C — Tenant-Side Create

- `src/trpc/routers/tenants.ts:288-405` — `tenantsRouter.create` Procedure
- `src/trpc/routers/tenants.ts:289` — `requirePermission(TENANTS_MANAGE)`
- `src/trpc/routers/tenants.ts:331-387` — `$transaction` ohne expliziten Timeout (Default 5000ms)
- `src/trpc/routers/tenants.ts:352-367` — `tx.tenant.create` mit legacy-Feldern (`vacationBasis`, `phone`, `email`, `payrollExportBasePath`, `notes`)
- `src/trpc/routers/tenants.ts:371-384` — `tx.userTenant.upsert` mit `role: "owner"`
- `src/trpc/routers/tenants.ts:389-399` — Fire-and-forget `auditLog.log` post-Tx

### Probe-Blocker

- `src/lib/services/email-send-service.ts:84-85` — `SmtpNotConfiguredError` harter Throw
- `src/lib/services/email-send-service.ts:239-252` — `EmailTemplate` Fallback auf leere Strings
- `src/lib/services/email-send-service.ts:277` — `canSend` UI-Degradation
- `src/lib/services/vacation-service.ts:357-368` — `VacationBalanceNotFoundError` harter Throw
- `src/lib/services/number-sequence-service.ts:65-77` — `NumberSequence` lazy-upsert
- `src/lib/services/reminder-settings-service.ts:31-36` — `ReminderSettings` lazy-create
- `src/lib/services/reminder-eligibility-service.ts:75-76` — `enabled:false` Kurzschluss
- `src/lib/services/reminder-template-service.ts:132-187` — `seedDefaultsForTenant` (nicht auto-called)
- `src/lib/services/employees-service.ts:170-341` — `create()` ohne `vacationBalance`-Side-Effect
- `src/lib/services/vacation-balances-service.ts:62-138` — `initializeBalances` Bulk-Create, manuell

### Schema

- `prisma/schema.prisma:1776-1870` — `Employee` Modell + alle FK-Felder (alle außer `tenantId` nullable)
- `prisma/schema.prisma:122` — `Tenant.isDemo` Default `false`
- `prisma/schema.prisma:3126` — `VacationBalance` mit Pflicht-FK `employeeId`

### Transaction & Side-Effects

- `src/lib/services/demo-tenant-service.ts:162` — Demo-Flow `$transaction` Timeout `120_000`
- `src/lib/services/demo-tenant-service.ts:244-259` — Safety-Net Kompensation für Supabase-Auth-User
- `src/lib/services/users-service.ts:174` — `adminClient.auth.admin.createUser` HTTP-Call
- `src/lib/services/users-service.ts:216-226` — Interne Supabase-Auth Rollback-Kompensation
- `src/lib/services/users-service.ts:239` — `adminClient.auth.admin.generateLink` HTTP-Call
- `src/lib/services/users-service.ts:268` — `sendUserWelcomeEmail` SMTP-Versand

### System-Seeded Migrations

- `supabase/migrations/20260101000007_create_accounts.sql:18-21` — Core `Account` Rows (FLEX/OT/VAC)
- `supabase/migrations/20260101000086_seed_default_absence_types.sql:5-30` — 10 System `AbsenceType` Rows
- `supabase/migrations/20260101000087_seed_default_booking_types.sql:4-23` — 6 System `BookingType` Rows
- `supabase/migrations/20260101000089_employment_types_nullable_tenant_and_defaults.sql:15-27` — 6 `EmploymentType` Rows
- `supabase/migrations/20260101000092_seed_net_cap_system_accounts.sql:2-6` — NET/CAP Accounts
- `supabase/seed.sql §19` — `vacation_balances` Dev-Seed (nicht Teil des Demo-Templates)

### Handbuch

- `docs/TERP_HANDBUCH.md` §4.3 (Locations), §4.4 (CostCenter), §4.10 (AbsenceTypeGroup), §4.11 (Holiday), §7 (VacationCappingRule Praxisbeispiel), §12.4 (NumberSequence), §21b.1 (TenantSmtpConfig), §21b.2 (EmailTemplate), §22.17 (Reminder)

### Tests

- `src/lib/demo/__tests__/industriedienstleister_150.integration.test.ts:98-100` — `elapsedMs` Assertion `< 90_000`
- `src/lib/demo/__tests__/industriedienstleister_150.integration.test.ts:116-117` — Row-Count Assertion `> 2000 && < 5000`

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-04-14-demo-template-starter-variant.md` — Vorgänger-Research (Richtungsentscheidung: Starter = Non-Demo-Tenant)
- `thoughts/shared/plans/2026-04-09-demo-tenant-system.md` — Demo-System Implementation Plan
- `thoughts/shared/plans/2026-04-11-demo-tenant-platform-migration.md` — Phase 10b Migration
- `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` — Phase 10a Subscription-Bridge
- `thoughts/shared/plans/2026-04-13-platform-billing-exempt-tenants.md` — `billingExempt`-Plan
- `thoughts/shared/research/2026-04-11-demo-tenant-platform-migration.md` — Detail-Inventar des Demo-Systems

Keine Recherche hat bisher explizit Path B oder Path C im Detail analysiert. Dies ist die erste Dokumentation dieser beiden Pfade.

## Related Research

- `thoughts/shared/research/2026-04-14-demo-template-starter-variant.md` — Erste Research-Iteration (Architektur-Survey)

## Open Questions

### Thema 1 — Non-Demo-Creation

**1.1** UI-Sichtbarkeit von Path B: Welche Seite unter `/platform/(authed)/tenants/` ruft heute `platformTenantManagement.create` direkt auf? Der Demo-Pfad ist belegt (`/platform/(authed)/tenants/demo/page.tsx`), der Non-Demo-Pfad ist nicht verifiziert. Falls keine UI existiert, ist Path B heute reiner API-Pfad ohne Frontend — dann ist Option A (Erweiterung) vs. Option B (neue Procedure) nicht an einer bestehenden UI gekoppelt.

**1.2** UI-Sichtbarkeit von Path C: Wird `trpc.tenants.create` heute aus irgendeinem Admin-Hook oder Component-Flow genutzt, oder ist es nur API / Test-Code? Relevant für die Frage, ob Path C entfernt / dupliziert / ignoriert werden kann.

**1.3** Namensgebung des Template-Registries: Soll `src/lib/demo/` umbenannt werden, wenn Starter-Templates ebenfalls darin landen? Oder zwei parallele Registries (`src/lib/demo/templates/` + `src/lib/tenant-templates/`)? Architektur-Entscheidung außerhalb der Recherche.

### Thema 2 — Pflicht-Stammdaten

**2.1** Tatsächliches UI-Verhalten der Vacation-Balance-Komponente bei `VacationBalanceNotFoundError`: crasht sie (Error-Boundary), zeigt sie "Noch nicht initialisiert"-State, oder propagiert sie den Fehler zum Toast? Nicht im Code-Read identifiziert. Relevant für die Einschätzung, wie kaputt das heutige Showcase-Demo wirklich ist.

**2.2** Ob der Inbound-Invoice-Modul-Pfad (`src/trpc/routers/inbound-invoices.ts`) zusätzliche Pflicht-Stammdaten erfordert, die bei aktivem `inbound_invoices`-Modul fehlen würden. Der Sub-Agent-Scan hat diese als P2 klassifiziert, aber die Modul-Aktivierung als Trigger für Pflicht-Rows wurde nicht verifiziert.

**2.3** `AbsenceType.calculationRuleId` → `CalculationRule`-FK: Nullable. Aber: Wenn die heutigen System-`AbsenceType`-Rows per Migration mit `calculationRuleId=NULL` seeded sind, fallen Account-Credits bei Abwesenheiten auf `0` zurück. Ist das ein bekannter Zustand oder ein verstecker Produkt-Bug in bestehenden Tenants?

### Thema 3 — Performance

**3.1** Reale Wall-Clock-Duration der `createDemo + apply`-Sequenz: Test misst, aber loggt nicht. Empirische Zahl durch einmaligen Test-Run mit Timing-Patch wäre nötig, falls die Schätzung validiert werden soll.

**3.2** Verhalten bei sehr langsamem Remote-Postgres (z.B. Staging unter Load): der 60s-Timeout von Path B könnte theoretisch bei 31 Round-trips × 200ms Netzwerk = ~6s eng werden, falls GoTrue-HTTP zusätzlich ~3s dauert. Kein empirischer Messpunkt vorhanden.

### Thema 4 — Branche vs. Universal

**4.1** Duplizierung von system-seeded Rows im heutigen Demo-Template: `seedAccounts` legt 10 tenant-scoped Accounts an, davon sind 3 (FLEX/OT/VAC) per Migration bereits als `tenant_id=NULL` verfügbar. Ist das ein bewusstes Duplikat (Template-Autonomie) oder unintended? Für Starter-Template wäre klar, dass die Migration-Zeilen ausreichen.

**4.2** Ob die system-seeded Rows (`tenant_id=NULL`) wirklich in allen Tenant-Queries sichtbar sind, oder ob tenant-scoped WHERE-Clauses sie versehentlich ausfiltern. Grep nach `tenantId: { in: [tenantId, null] }` oder `tenantId: null` in den relevanten Services wäre die Verifikation.

## Konsequenzen für den Plan

### K1 — Einhängepunkt Path B mit Option B ist der niedrigste-Risiko-Pfad

Neue Procedure `platformTenantManagement.createFromTemplate` parallel zu `create` einführen, mit optionalem Helper-Extract der gemeinsamen Kernlogik (Tenant-Create + ADMIN-UserGroup + User-Create + Audit). Grund: Atomarität bleibt erhalten, Tx-Timeout frei konfigurierbar, UI kann "Leer" vs. "Aus Template" klar trennen, bestehende `create`-Nutzer sind unverändert. Option A (Erweiterung) ist technisch möglich, bindet aber alles an den 60s-Timeout und vermischt UI-Flows.

### K2 — Template-Apply ist unkritisch für Performance

Das Starter-Template mit ~70-110 Rows und ~14-18 Round-trips addiert **<500ms** zur Tx-Duration. Der 60s-Timeout ist damit auch mit großzügigem P1-Set kein Risiko. Keine speziellen Optimierungen (keine Batch-Tuning, keine Tx-Aufsplittung) nötig.

### K3 — Supabase-Auth + SMTP bleiben Kompensations-Risiko

Das Muster "HTTP-Call zur GoTrue API innerhalb des Tx-Callbacks" ist bereits etabliert und hat Kompensations-Logik. Path B erbt diese Mechanik durch den `createUserService`-Aufruf automatisch. **Konsequenz**: Der Template-Apply-Schritt sollte **nach** dem `createUserService` passieren, damit Template-Failure nicht den Welcome-Email bereits versandt hat (genauso wie der Demo-Flow es heute macht — Reihenfolge einhalten).

### K4 — Pflicht-Stammdaten-Set für Starter ist klein und klar abgrenzbar

**P0 für technischen Go-Live** (Throw-Blocker): keine, wenn der Tenant keine Mails verschicken und keine Urlaubskonten anzeigen will. **Realistisches P0-Minimum für Kunden-Usage**: `TenantSmtpConfig` (Email-Versand) + `VacationBalance`-Initialisierung für alle Employees bei erstem Anlegen. Beides ist **nicht in einem Starter-Template seedbar**: SMTP ist per-instance Credential, VacationBalance braucht Employees als Vorbedingung (Starter hat keine). Konsequenz: **Starter-Template seedet weder SMTP noch VacationBalance**; der Plan muss klarstellen, dass Starter-Tenants beim ersten Employee-Create zusätzlich `VacationBalance.create` triggern müssen (entweder als Onboarding-Schritt im Handbuch oder als Auto-Side-Effect im `employees-service.create`).

### K5 — VacationBalance-Lücke im Showcase ist ein existierender Bug

Das heutige `industriedienstleister_150`-Template legt keine `VacationBalance`-Rows an, obwohl es 150 Employees seedet. Die Urlaubs-UI wird bei Navigation auf Balance einen `NOT_FOUND` werfen. Dieser Bug ist **unabhängig** vom Starter-Thema und sollte separat adressiert werden (via `initializeBalances` in `apply()` nach `seedEmployees`). Der Starter-Plan kann ihn ignorieren, aber er gehört in den Folge-Backlog.

### K6 — System-seeded Rows sind die Shared-Universal-Schicht

35% des Stammdaten-Spektrums kommt bereits per Migration ohne Template-Aktion (`EmploymentType`, Core-`BookingType`, Core-`AbsenceType`, Core-`Account`, `NumberSequence`-Lazy, `ReminderSettings`-Lazy, `EmailTemplate`-Code-Fallback). Der Starter-Plan sollte **nicht** diese Zeilen nochmal tenant-scoped duplizieren, sondern nur das ergänzen, was die Migration nicht abdeckt — primär `ReminderTemplate`-Defaults (per `seedDefaultsForTenant`) und `BillingTenantConfig`-Placeholder (mit leeren Feldern, damit der Kunde sie überschreibt).

### K7 — Branch-spezifische Content-Schicht braucht pro Branche etwa 10-15 Rows Config

Pro Branche zu definieren: `Department`-Taxonomie, `DayPlan`/`WeekPlan`/`Tariff`-Set, `CostCenter`-Taxonomie, `EmployeeGroup`/`WorkflowGroup`/`ActivityGroup`-Grundstruktur, Bonus-`Account`-Buckets, `VacationCalculationGroup`-Basis-Wahl. Das ist ein überschaubarer Umfang pro Branche — realistisch ~50-80 Rows je Branche für Starter, plus 3.300 Rows Showcase-Overlay.

### K8 — Per-Instance-Schicht ist kein Template-Problem

`BillingTenantConfig`, `Location`, `TenantSmtpConfig`, `Holiday`-Bundesland gehören in die Tenant-Create-UI als Pflicht- oder Soft-Optional-Felder, nicht in ein Template. Der Plan sollte entweder einen Onboarding-Wizard oder ein erweitertes Create-Form mit diesen Feldern vorsehen — getrennt vom Template-Selector.

### K9 — Offene Frage 2.1 ist Entscheidungs-Blocker für "Showcase ist beschädigt?"-Frage

Bevor entschieden wird, ob der bestehende Showcase-Flow parallel zum Starter-Flow existiert oder gefixt werden muss, sollte die tatsächliche UI-Reaktion auf `VacationBalanceNotFoundError` getestet werden (manuell im Dev-Demo-Tenant). Ergebnis: entweder "UI degradiert graceful, Showcase bleibt" oder "UI crasht, Showcase muss gefixt werden bevor Starter-Plan startet".
