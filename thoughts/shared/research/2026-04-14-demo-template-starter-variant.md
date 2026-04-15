---
date: 2026-04-14T09:50:00+02:00
researcher: tolga
git_commit: 129a9a8c6b0731d076d7a9c690126e8d49cafb8c
branch: staging
repository: terp
topic: "Demo-Template: Showcase- vs. Starter-Variante pro Branche"
tags: [research, codebase, demo-tenants, templates, platform-subscription, seed-data]
status: complete
last_updated: 2026-04-14
last_updated_by: tolga
---

# Research: Demo-Template Showcase- vs. Starter-Variante pro Branche

**Date**: 2026-04-14T09:50:00+02:00
**Researcher**: tolga
**Git Commit**: 129a9a8c6b0731d076d7a9c690126e8d49cafb8c
**Branch**: staging
**Repository**: terp

## Research Question

Evaluiere, ob pro Branche zwei Template-Varianten sinnvoll sind:
- **Showcase** (mit Fake-Daten für Sales-Demos)
- **Starter** (ohne Personen/Buchungen als vorkonfigurierter Auslieferungszustand nach Vertragsabschluss)

Der Fokus liegt auf sechs Themenbereichen: Template-Architektur, Entitäten-Klassifizierung, FK-Dependencies, UI-Implikationen, Interaktion mit Phase 10a Platform Subscription Billing, und ein vorgeschlagener Refactor-Pfad.

## Summary

Das heutige Demo-Template-System (`src/lib/demo/`) besteht aus genau einem Template
(`industriedienstleister_150`), das über ein winziges Registry-Pattern
(`registry.ts` mit einem `Record<string, DemoTemplate>`) registriert wird. Das
`DemoTemplate`-Interface trägt nur `key`, `label`, `description` und `apply()` —
keine Variant-, Category- oder Kind-Metadaten.

Die `apply()`-Funktion führt 13 Seed-Helper linear nacheinander aus, alle innerhalb
derselben Prisma-Transaktion, die bereits vom Aufrufer (`demoService.createDemo`)
geöffnet wird. Die Helper lassen sich sauber in drei Gruppen einteilen:

- **KONFIGURATION** (Departments, Accounts, DayPlans, WeekPlans, Tariffs, BookingTypes, AbsenceTypes, Holidays, CrmAddresses, WhArticleGroups, WhArticles) — kein FK auf `Employee` erforderlich
- **PERSONEN** (`Employee` × 150) — benötigt Department + Tariff
- **BEWEGUNGSDATEN** (`EmployeeDayPlan` × ~3000, `BillingDocument` × 5 + `BillingDocumentPosition` × 15) — alle hängen an einem `Employee` oder `CrmAddress`

`prisma/schema.prisma` bestätigt: weder `Tariff` noch `WeekPlan` noch `DayPlan`
haben einen Pflicht-FK auf `Employee`. Ein "Stammdaten ohne Personen"-Template ist
am Datenmodell vertretbar. Die einzige Ausnahme ist `VacationBalance` (Pflicht-FK
`employeeId → Employee`), das aber das bestehende Template aktuell gar nicht
anlegt — die Lücke existiert also schon in der Showcase-Variante.

Der `convert`-Flow (`src/trpc/platform/routers/demoTenantManagement.ts:209-364`)
strippt `is_demo`, `demo_expires_at`, `demo_template` atomar im Service und
erstellt danach pro Modul eine Subscription per Router-Orchestrierung.
`subscriptionService.createSubscription` liest `tenant.isDemo` zu keinem
Zeitpunkt — die einzige Tenant-seitige Schutzprüfung ist `billingExempt`. Ein
Starter-Tenant, der direkt über `platformTenantManagement.create` (Path B) mit
`isDemo=false` erzeugt und via `enableModule` bestückt wird, löst sofort eine
Subscription aus. Beide Pfade (Demo + manueller Convert **oder** direkter
Non-Demo-Create) sind heute funktionsfähig.

Die Admin-UI (`src/app/platform/(authed)/tenants/demo/page.tsx`) rendert Templates
über einen `<Select>`-Dropdown, der nur `tpl.label` anzeigt und `tpl.description`
weder im Dropdown noch sonst im Create-Sheet verwendet. Der Demo-Banner
(`demo-banner.tsx`) und die Expiration-Gate (`demo-expiration-gate.tsx`) lesen
ausschließlich `isDemo` und `demoExpiresAt` — keine Template-spezifischen Felder.

## Detailed Findings

### 1. Template-Architektur heute

#### Registry & Interface

Der gesamte Template-Mechanismus sitzt in `src/lib/demo/` und umfasst nur vier
Dateien:

- `src/lib/demo/types.ts` — definiert `DemoTemplateContext` (`{ tenantId, adminUserId, tx }`) und `DemoTemplate` Interface mit **vier Feldern**: `key`, `label`, `description`, `apply`. Keine Variant-, Kind-, Category- oder Branch-Metadaten.
- `src/lib/demo/registry.ts` — ein `Record<string, DemoTemplate>` mit aktuell einem einzigen Eintrag (`industriedienstleister150`). Exports: `getDemoTemplate(key)`, `listDemoTemplates()` (gibt nur `{key, label, description}` zurück, nie die `apply`-Funktion), und `DEFAULT_DEMO_TEMPLATE` (derzeit `"industriedienstleister_150"`).
- `src/lib/demo/templates/industriedienstleister_150.ts` — das einzige Template.
- `src/lib/demo/__tests__/` — Registry-Test + Integration-Test für die Apply-Funktion.

Ein neues Template wird registriert, indem:
1. Eine neue Datei unter `src/lib/demo/templates/<key>.ts` angelegt wird, die ein `DemoTemplate`-Objekt exportiert
2. Dieses Objekt in `registry.ts` in den `REGISTRY`-Record eingefügt wird (`[tpl.key]: tpl`)
3. Dem Namespace `demoTenantManagement.templates`-Query (`src/trpc/platform/routers/demoTenantManagement.ts:69`) ruft `listDemoTemplates()` auf — es braucht keine weitere Anpassung, das neue Template taucht automatisch im Dropdown auf.

Die `DemoTemplate.apply`-Signatur: `(ctx: DemoTemplateContext) => Promise<void>`. `ctx.tx` ist `Prisma.TransactionClient` — also wird die Transaktion vom Aufrufer geöffnet, das Template schreibt nur via `ctx.tx`.

#### apply()-Flow für industriedienstleister_150

Die Reihenfolge der Seed-Helper in
[`industriedienstleister_150.ts:135-159`](src/lib/demo/templates/industriedienstleister_150.ts):

```
faker.seed(42)                                          // line 138
seedDepartments(tx, tenantId)                           // line 142
seedAccounts(tx, tenantId)                              // line 143
seedDayPlans(tx, tenantId)                              // line 144
seedWeekPlans(tx, tenantId, dayPlans)                   // line 145  ← FK: weekPlan.*DayPlanId?
seedTariffs(tx, tenantId, weekPlans)                    // line 146  ← FK: tariff.weekPlanId?
seedBookingTypes(tx, tenantId)                          // line 147
seedAbsenceTypes(tx, tenantId)                          // line 148
seedHolidays(tx, tenantId)                              // line 149
seedEmployees(tx, tenantId, departments, tariffs)       // line 150  ← FK: employee.departmentId + employee.tariffId
seedEmployeeDayPlans(tx, tenantId, employees, dayPlans) // line 151  ← FK: employeeDayPlan.employeeId + employeeDayPlan.dayPlanId
seedCrmAddresses(tx, tenantId)                          // line 152
seedBillingDocuments(tx, tenantId, customers)           // line 153  ← FK: billingDocument.addressId → CrmAddress
seedWarehouse(tx, tenantId)                             // line 154
```

Die Helper sind im File **nicht** logisch gruppiert — sie sind linear, aber der
Übergang `seedEmployees` → `seedEmployeeDayPlans` markiert implizit den Schnitt
zwischen KONFIGURATION und BEWEGUNGSDATEN. `seedCrmAddresses` + `seedWarehouse`
stehen **nach** `seedEmployeeDayPlans` im Code, obwohl sie keine FK zu `Employee`
haben.

#### Metadaten-Eignung für Varianten

Das `DemoTemplate`-Interface hat heute nur vier Felder (`key`, `label`,
`description`, `apply`). Um zwei Varianten pro Branche zuzulassen, würde die
UI-Seite mit `tpl.label` alleine nicht mehr auskommen — aktuell wird nur
`tpl.label` im `<Select>` gerendert (`demo/page.tsx:660-670`), die `description`
wird gar nicht angezeigt. Das Interface bietet heute keinen eingebauten Weg,
zwei Templates als "gleiche Branche" zu gruppieren.

### 2. Was genau erzeugt das aktuelle Template?

Klassifizierung aller erzeugten Entitäten, bestätigt gegen
`prisma/schema.prisma`:

#### KONFIGURATION (soll in BEIDEN Varianten drin sein)

| Seed-Helper | Prisma-Modell | Zeile schema.prisma | Anzahl | Code-Stelle |
|---|---|---|---|---|
| `seedDepartments` | `Department` | 1680 | 4 | `templates/industriedienstleister_150.ts:177-187` |
| `seedAccounts` (Gruppe) | `AccountGroup` | 1601 | 1 | `templates/industriedienstleister_150.ts:192-201` |
| `seedAccounts` (Konten) | `Account` | 1634 | 10 | `templates/industriedienstleister_150.ts:203-214` |
| `seedDayPlans` | `DayPlan` | 2562 | 3 | `templates/industriedienstleister_150.ts:218-237` |
| `seedWeekPlans` | `WeekPlan` | 2738 | 3 | `templates/industriedienstleister_150.ts:239-262` |
| `seedTariffs` | `Tariff` | 2788 | 12 | `templates/industriedienstleister_150.ts:264-303` |
| `seedBookingTypes` | `BookingType` | 2327 | 8 | `templates/industriedienstleister_150.ts:305-317` |
| `seedAbsenceTypes` | `AbsenceType` | 2513 | 6 | `templates/industriedienstleister_150.ts:319-333` |
| `seedHolidays` | `Holiday` | 1572 | 20 | `templates/industriedienstleister_150.ts:335-344` |
| `seedCrmAddresses` | `CrmAddress` | 454 | 3 | `templates/industriedienstleister_150.ts:443-487` |
| `seedWarehouse` (Gruppen) | `WhArticleGroup` | 4881 | 2 | `templates/industriedienstleister_150.ts:582-588` |
| `seedWarehouse` (Artikel) | `WhArticle` | 4899 | 30 | `templates/industriedienstleister_150.ts:625` |

**Randnotiz zu `CrmAddress`**: Im engeren Sinne sind 3 konkrete Kunden-Stammsätze
(Bayrische Maschinenbau, Nordwerke, Rheinland Logistik) **Showcase-Daten**, keine
echte Konfiguration. Das Modell selbst ist aber KONFIGURATION — Stammdaten, keine
Transaktion. Eine Starter-Variante würde ggf. **keine** `CrmAddress`-Rows anlegen,
aber das Modell bleibt verfügbar.

#### PERSONEN (nur Showcase)

| Seed-Helper | Prisma-Modell | Zeile schema.prisma | Anzahl | Code-Stelle |
|---|---|---|---|---|
| `seedEmployees` | `Employee` | 1776 | 150 | `templates/industriedienstleister_150.ts:346-394` |

**Wichtig**: Das Template erzeugt **keinen einzigen `User`-Datensatz und keine
`UserTenant`-Zuweisung** und auch kein `UserGroup`-Mapping. Der Demo-Admin-User
wird vollständig **außerhalb** des Templates in
`src/lib/services/demo-tenant-service.ts:204-219` via `createUser(...)` erzeugt,
also vor `template.apply(...)`. Diese Fremdkopplung ist wichtig für die
Starter-Variante: der Admin-User existiert auch ohne jeglichen `Employee`-Seed.

#### BEWEGUNGSDATEN (nur Showcase)

| Seed-Helper | Prisma-Modell | Zeile schema.prisma | Anzahl | Code-Stelle |
|---|---|---|---|---|
| `seedEmployeeDayPlans` | `EmployeeDayPlan` | 3360 | ~3000 (150 × 20 Werktage) | `templates/industriedienstleister_150.ts:396-441` |
| `seedBillingDocuments` | `BillingDocument` | 848 | 5 | `templates/industriedienstleister_150.ts:489-577` |
| `seedBillingDocuments` | `BillingDocumentPosition` | 942 | 15 (5 × 3) | `templates/industriedienstleister_150.ts:561-572` |

Hinweis: Die Template-Dokumentation im Header (Zeilen 18-22) spricht von
"≈4500 EmployeeDayPlan rows", der Code skippt aber Wochenenden — tatsächlich sind
es ~3000 Rows (20 Werktage × 150 MA).

### 3. Dependencies zwischen den Kategorien

#### Pflicht-FKs auf `Employee` innerhalb der KONFIGURATION?

Ergebnis aus Analyse von `prisma/schema.prisma`:

- **`Tariff` (line 2788)**: KEINE Pflicht-FK auf `Employee`. Enthält `tenantId`, optionale `weekPlanId?`, optionale `vacationCappingRuleGroupId?`. Die `employees Employee[]`-Deklaration an Zeile 2836 ist ein Prisma-Rückwärts-Relation, kein FK-Feld auf `Tariff` selbst.
- **`WeekPlan` (line 2738)**: KEINE Pflicht-FK auf `Employee`. Nur `tenantId` + 7 optionale `*DayPlanId?`-Felder.
- **`DayPlan` (line 2562)**: KEINE Pflicht-FK auf `Employee`. Nur `tenantId` + optionale Account-Referenzen.
- **`AbsenceType`, `BookingType`, `Holiday`, `Department`, `Account`, `AccountGroup`**: alle ohne FK auf `Employee`.

**Konsequenz**: Tarife, Wochenpläne, Tagespläne, Zuschlagsregeln, Urlaubsarten,
Feiertage, Abteilungen können alle 1:1 so wie heute gesät werden, auch wenn
überhaupt kein Employee existiert. Das Datenmodell hindert einen Starter-Schnitt
an dieser Stelle nicht.

#### "Per-Employee"-Stammdaten, die das Template heute nicht anlegt

Die wichtigste gefundene Ausnahme (via Pattern-Suche nach
`Balance|VacationAccount|AbsenceBalance|AccountBalance|EmployeeAccount`):

- **`VacationBalance` (line 3126)**: Pflicht-FK `employeeId` → `Employee`
  (`onDelete: Cascade`). `@@unique([employeeId, year])`. Feldspeicher für
  `entitlement`, `carryover`, `adjustments`, `taken`, `carryoverExpiresAt`.

Das bestehende Template legt **keine** `VacationBalance`-Rows an — weder für den
Seeded-Admin noch für die 150 Employees. Diese Lücke existiert also bereits in
der heutigen Showcase-Variante und ist **nicht** vom Starter/Showcase-Split
betroffen.

Weitere Modelle mit Pflicht-FK auf `Employee`: `EmployeeDayPlan` (BEWEGUNGSDATEN),
`MonthlyValue` (BEWEGUNGSDATEN), `AbsenceDay` (BEWEGUNGSDATEN),
`EmployeeCappingException` (per-employee Spezialfall), `EmployeeTariffAssignment`
(per-employee Zuweisung). Keines davon wird vom Template aktuell gesät.

#### FK-Kette zwischen den Kategorien

Saubere Schnitte:

```
KONFIGURATION (kein FK zu PERSONEN)
  Department, AccountGroup, Account, DayPlan, WeekPlan, Tariff,
  BookingType, AbsenceType, Holiday, CrmAddress,
  WhArticleGroup, WhArticle
        ↓
PERSONEN (FK zu KONFIGURATION)
  Employee {
    departmentId?  → Department     (nullable)
    tariffId?      → Tariff         (nullable)
    costCenterId?  → CostCenter     (nullable, vom Template nicht gesät)
    locationId?    → Location       (nullable, vom Template nicht gesät)
  }
        ↓
BEWEGUNGSDATEN (FK zu PERSONEN + KONFIGURATION)
  EmployeeDayPlan {
    employeeId     → Employee       (REQUIRED, cascade)
    dayPlanId?     → DayPlan        (nullable)
  }
  BillingDocument {
    addressId      → CrmAddress     (REQUIRED, NO ACTION)
  }
  BillingDocumentPosition {
    documentId     → BillingDocument (REQUIRED, cascade)
  }
```

Hässliche Stellen — wo ein sauberer Schnitt zusätzliche Überlegung braucht:

- **`Department.managerEmployeeId?`** (`schema.prisma:1680`, Relation
  `"DepartmentManager"`, `onDelete: SetNull`). Nullable — unproblematisch, wird
  vom Template heute auch nicht gesetzt.
- **`CrmAddress.createdById?`** — bare UUID-Spalte ohne Prisma-Relation,
  nullable. Unproblematisch.
- **`BillingDocument.addressId`** (`schema.prisma:914`): **required, NO ACTION**
  (keine `onDelete`-Klausel). Das ist der einzige harte FK zwischen einer
  Bewegungsdaten-Tabelle und dem KONFIGURATION-Teil via `CrmAddress`. Für den
  Starter-Cut ist das irrelevant: eine Starter-Variante erzeugt weder
  `BillingDocument` noch `CrmAddress`-Demokunden, oder sie erzeugt beides nicht.

#### Plattform-/System-User, die technisch notwendig sind

Der Admin-User wird **nicht im Template**, sondern im Service
(`demo-tenant-service.ts:204-219`) angelegt. Er landet in der `UserGroup`
"Demo-Admin" (UUID `dd000000-0000-0000-0000-000000000001`,
`demo-tenant-repository.ts:15`), die per Migration
`20260420100002` (laut `demo-tenant-repository.ts:189` und Handbuch-Kontext)
seedet wird. Dieser Ablauf ist Template-agnostisch — er läuft genauso für ein
Starter-Template ohne Fake-Mitarbeiter. Damit muss die Starter-Variante weder
`UserGroup` noch `User` noch `UserTenant` anlegen; diese kommen aus dem
vorgelagerten Service-Code, nicht aus `apply()`.

### 4. UI-Implikationen

#### Template-Auswahl im Admin-Flow

Einzige Stelle, die das Template zur Auswahl präsentiert:
`src/app/platform/(authed)/tenants/demo/page.tsx`. Der Flow:

1. `templates`-Query: `trpc.demoTenantManagement.templates.queryOptions()` an
   `demo/page.tsx:140` — ruft intern `listDemoTemplates()` aus der Registry auf
   (`demoTenantManagement.ts:69`).
2. Die Query-Daten werden als `templates: DemoTemplateOption[]` an
   `CreateDemoSheet` übergeben (`demo/page.tsx:280`). Der Typ ist lokal definiert
   als `{ key: string; label: string; description: string }`
   (`demo/page.tsx:111-115`) — `apply` wird nicht mitgeliefert.
3. Im Sheet wird `demoTemplate` State beim ersten Laden auf den `key` des ersten
   Templates initialisiert (`demo/page.tsx:491-495`).
4. Der Dropdown ist ein `<Select>` bei `demo/page.tsx:660-670`: jedes
   `<SelectItem>` zeigt **nur `tpl.label`** an. `tpl.description` wird nicht
   gerendert — weder im Dropdown noch sonstwo im Sheet.
5. Die Tabelle listet Demos in Zeilen mit einer Template-Spalte, die den **rohen
   Key in Monospace** rendert (`demo/page.tsx:367`).

#### UI-Änderungen für zwei Varianten pro Branche

Aktuell sichtbar: Nur `tpl.label` im Dropdown. Wenn man zwei Templates pro
Branche einführt (z.B. `industriedienstleister_150_showcase` und
`industriedienstleister_150_starter`), würden sie im Flachliste-Dropdown
nebeneinander als Labels erscheinen. Eine echte Gruppierung (z.B.
`<SelectGroup>` mit Label "Industriedienstleister" und zwei Items) erfordert:

- Entweder eine zusätzliche Metadaten-Spalte im `DemoTemplate`-Interface (z.B.
  `industry: string`, `variant: "showcase" | "starter"`) oder eine Gruppierung
  nach Namenskonvention im Key.
- Das Rendering im `<Select>` bei `demo/page.tsx:660-670` müsste auf
  `<SelectGroup>` umgebaut werden.
- Die `DemoTemplateOption`-Type bei `demo/page.tsx:111-115` müsste um die neuen
  Felder erweitert werden.
- Der `templates`-Query-Return in `demoTenantManagement.ts:69` müsste zusätzliche
  Felder liefern (heute gibt `listDemoTemplates()` nur `{key, label,
  description}` zurück).
- Optional: die Tabellen-Spalte (`demo/page.tsx:367`) könnte `tpl.label` statt
  `tpl.key` rendern, um Showcase/Starter lesbar zu unterscheiden.

#### Demo-Banner / Expiration-Gate

- `src/components/layout/demo-banner.tsx`: liest ausschließlich
  `tenant.isDemo` und `tenant.demoExpiresAt` (Cast `TenantWithDemoFields` an
  Zeile 24). Rendert einen gelben Banner wenn `daysRemaining > 0`. **Keine
  Template-spezifische Logik.**
- `src/components/layout/demo-expiration-gate.tsx`: liest ausschließlich
  `isDemo` und `demoExpiresAt` (Cast an Zeile 30). Wenn `isDemo === true` und
  `demoExpiresAt < now`, wird nach `/demo-expired` weitergeleitet. **Keine
  Template-spezifische Logik.**

Beide Komponenten würden sich für eine "Starter"-Variante **genauso** verhalten
wie für Showcase, solange `isDemo=true` gesetzt bleibt. Wenn Starter-Tenants mit
`isDemo=false` erzeugt werden, werden Banner und Gate automatisch gar nicht aktiv —
was der gewünschte Zustand für echte Neukunden-Tenants wäre.

### 5. Interaktion mit Phase 10a (Platform Subscription Billing)

#### `subscriptionService.createSubscription` und `isDemo`

In `src/lib/platform/subscription-service.ts:375-497` hat `createSubscription`
keinen einzigen Lesezugriff auf `tenant.isDemo`. Die einzige Tenant-seitige
Guard-Klausel prüft `billingExempt` (Zeilen 398-410) und wirft
`PlatformSubscriptionBillingExemptError`. Ein Aufruf auf einen Tenant mit
`isDemo=true, billingExempt=false` würde daher einen `platform_subscriptions`-Row
anlegen **und** eine `BillingRecurringInvoice` im Operator-Tenant erzeugen, ganz
ohne Exception.

**Praktische Konsequenz**: Die einzige Sicherung gegen "Subscription-Erzeugung
für Demo" liegt aktuell in der sequentiellen Reihenfolge des Convert-Routers —
`demoService.convertDemo(...)` strippt `isDemo` **vor** der
Subscription-Erzeugung. Das funktioniert, weil der Router nichts parallelisiert.

#### Convert-Flow im Detail

`src/trpc/platform/routers/demoTenantManagement.ts:209-364`:

1. **Step 1**: `demoService.convertDemo(ctx.prisma, tenantId, {discardData})`
   — in einer `$transaction`: snapshot der Module, optional
   `wipeTenantData(keepAuth=true)`, dann `convertDemoKeepData` →
   `tx.tenant.update({ data: { isDemo: false, demoExpiresAt: null,
   demoTemplate: null, demoCreatedBy: { disconnect: true },
   demoCreatedByPlatformUserId: null, demoNotes: null } })`
   (`demo-tenant-repository.ts:166-182`).
2. **Step 2**: Wenn `discardData=true`, Module werden per `tenantModule.upsert`
   neu eingetragen (Zeilen 235-259 im Router).
3. **Step 2b**: Wenn `billingExempt=true`, wird `tenant.billingExempt = true`
   gesetzt (Zeilen 264-270), **bevor** die Subscription-Schleife startet.
4. **Step 3**: Subscription-Bridge, umschlossen von
   `subscriptionService.isSubscriptionBillingEnabled() && !isHouseTenant &&
   !input.billingExempt` (Zeilen 279-283). Für jedes Modul aus dem Snapshot:
   - Check auf bereits aktive `platformSubscription` (idempotent für
     Retry-Szenarien)
   - `subscriptionService.createSubscription(...)` mit dem vom Operator
     gewählten `billingCycle`
   - Fehler landen in `failedModules[]`, Loop bricht nicht ab
5. **Step 4**: Ein `platform_audit_logs`-Row mit `action: "demo.converted"`.

#### Starter-Tenant-Alternativen: Demo-Pfad vs. direkter Non-Demo-Create

Es existieren drei Tenant-Erzeugungs-Pfade im Codebase:

- **Path A**: `demoTenantManagement.create` → `demoService.createDemo` →
  `repo.createDemoTenant`: setzt `isDemo=true`, `demoExpiresAt`, `demoTemplate`.
- **Path B**: `platformTenantManagement.create`
  (`src/trpc/platform/routers/tenantManagement.ts:135-262`): `tx.tenant.create`
  (Zeilen 174-186) **ohne** `isDemo`-Feld im Data-Objekt, d.h. der DB-Default
  `false` (`schema.prisma:122`) greift. Keine Subscription wird hier angelegt.
- **Path C**: Tenant-seitiger `tenantsRouter.create`
  (`src/trpc/routers/tenants.ts:288-405`): `tx.tenant.create` mit
  `requirePermission(TENANTS_MANAGE)`, ebenfalls `isDemo=false` per Default.
  Keine Subscription-Bridge.

**`enableModule` auf einem Non-Demo-Tenant (Path B)**:
`src/trpc/platform/routers/tenantManagement.ts:585-703`. Der Fetch an Zeile
595-601 selektiert `{ id, billingExempt }`, **kein `isDemo`-Read**. Die
`shouldBill`-Condition (Zeilen 640-644):

```typescript
const shouldBill =
  subscriptionService.isSubscriptionBillingEnabled()
  && !isHouseTenant
  && !tenant.billingExempt
```

Wenn `shouldBill=true`: `createSubscription` wird aufgerufen. Ein Starter-Tenant
mit `isDemo=false, billingExempt=false`, auf dem danach `enableModule` läuft,
generiert sofort eine `platform_subscriptions`-Row + eine `BillingRecurringInvoice`
im Operator-Tenant.

#### Vor-/Nachteile: Starter als Demo-Tenant vs. direkter Non-Demo-Tenant

**Pfad 1 — Starter als Demo-Tenant** (Template-Variant, `isDemo=true`, mit
Ablaufdatum, später per `convert` echt):

- *Vorteile*:
  - Gesamte Lebenszyklus-Infrastruktur (Banner, Gate, Extend, Convert, Audit,
    Delete) funktioniert unverändert
  - Der `convert`-Router macht die Subscription-Bridge bereits atomar
  - Der Operator kann vor der Subscription-Erzeugung noch den `billingCycle`
    (monatlich/jährlich) und optional `billingExempt` setzen
  - Kein neuer Tenant-Erzeugungs-Pfad im Platform-Admin nötig
- *Nachteile*:
  - Semantisch unsauber: ein Neukunde nach Vertragsabschluss ist fachlich kein
    "Demo"
  - Der Demo-Banner (gelb) würde solange angezeigt, bis der Operator
    `convert` fährt. Das ist für einen produktiven Neukunden-Tenant
    möglicherweise irritierend — auch wenn technisch lösbar, indem `convert`
    unmittelbar nach Template-Apply gefahren wird
  - Der Tenant-Eintrag erscheint in der Liste unter "Demos", was für
    Operator-Auge-Prozesse (z.B. Ablauf-Cron) ein Risiko sein könnte
  - Der `expire-demo-tenants`-Cron
    (`src/app/api/cron/expire-demo-tenants/route.ts`) deaktiviert Demo-Tenants
    beim Ablaufdatum — ein versehentlich nicht-konvertierter Starter-Tenant
    würde bei Vergessen des `convert`-Schritts deaktiviert
- *Offene Fragen*:
  - Ist die `demo_expires_at`-Spalte nullable? Laut schema.prisma:122 ist das
    Feld optional, aber `createDemo` setzt es immer (validiert 1-90 Tage,
    `demo-tenant-service.ts:148-156`). Für einen Starter müsste man einen
    sehr langen Default (z.B. 90 Tage) wählen oder die 90-Tage-Cap lockern

**Pfad 2 — Starter als direkter Non-Demo-Tenant** (neues "Tenant-Template"-Konzept
parallel zu den Demo-Templates, `isDemo=false` von Anfang an):

- *Vorteile*:
  - Semantisch sauber: neuer Kunde wird direkt als produktiver Tenant geboren
  - Kein Demo-Banner, kein `demo-expiration-gate`-Redirect
  - Kein `expire-demo-tenants`-Cron-Risiko
  - Der bestehende `enableModule`-Flow ist vollständig kompatibel (Path B) und
    generiert bei `billingExempt=false` sofort Subscriptions beim ersten
    Modul-Enable
- *Nachteile*:
  - Erfordert einen **neuen Erzeugungs-Pfad**, der Template + Non-Demo-Tenant
    kombiniert. `platformTenantManagement.create`
    (`tenantManagement.ts:135-262`) tut heute keine Template-Applikation —
    dieser Router müsste entweder erweitert oder eine neue Router-Procedure
    hinzugefügt werden
  - Die Registry (`src/lib/demo/registry.ts`) heißt explizit "Demo" — entweder
    umbenennen zu `tenant-template` oder eine zweite Registry anlegen, oder
    das Präfix `demo_` aus dem Template-Konzept entfernen
  - Subscriptions werden nicht beim Tenant-Create erzeugt, sondern erst beim
    ersten `enableModule`-Call. Das ist konsistent mit heute, aber der
    Operator muss dran denken, alle nötigen Module zu aktivieren
- *Offene Fragen*:
  - Wie wird der Admin-User eines Non-Demo-Tenants heute erzeugt? Der
    `platformTenantManagement.create` enthält (falls ja) den entsprechenden
    Code — das Template-System könnte sich darauf stützen
  - Soll das Template im `createDemoTenant` oder im
    `platformTenantManagement.create` angewendet werden? Beide Pfade kapseln
    eine eigene `$transaction`

### 6. Vorgeschlagener Refactor-Pfad

Anhand der Befunde lassen sich zwei Schnittlinien identifizieren, die das
aktuelle Template sauber zerteilen:

**Schnittlinie 1 — innerhalb `apply()`**: zwischen `seedTariffs` und
`seedEmployees`. Alle Helper davor sind KONFIGURATION, alle danach (außer
`seedCrmAddresses` und `seedWarehouse`, die positionell "danach" stehen aber
fachlich KONFIGURATION sind) sind PERSONEN/BEWEGUNGSDATEN.

**Schnittlinie 2 — im Template-Typ**: `apply()` in zwei separate Funktionen
aufteilen, z.B. `applyConfig()` und `applyDemoData()`. Die heutige
`apply()`-Funktion wäre dann `applyConfig()` + `applyDemoData()`.

#### Ziel-Struktur (nur als Skizze, keine Implementierung)

Datei-Layout:

```
src/lib/demo/
  types.ts
    interface DemoTemplate {
      key: string
      label: string
      description: string
      industry: string            // neu: Gruppierungs-Key für UI
      variant: "showcase" | "starter"  // neu
      applyConfig: (ctx) => Promise<ConfigResult>
      applyDemoData?: (ctx, configResult) => Promise<void>  // optional: nur Showcase
    }
  registry.ts
    // Registry bleibt strukturell unverändert
  templates/
    industriedienstleister/
      shared.ts
        // Die KONFIGURATION-Helper wandern hierher:
        // seedDepartments, seedAccounts, seedDayPlans, seedWeekPlans,
        // seedTariffs, seedBookingTypes, seedAbsenceTypes, seedHolidays,
        // seedWhArticleGroups, seedWhArticles
        // + optional: seedCrmAddressesMaster (ohne Demo-Kunden, nur falls nötig)
        export async function applyIndustriedienstleisterConfig(ctx)
      showcase.ts
        import { applyIndustriedienstleisterConfig } from "./shared"
        // Die PERSONEN/BEWEGUNGSDATEN-Helper wandern hierher:
        // seedEmployees, seedEmployeeDayPlans, seedCrmAddressesDemo,
        // seedBillingDocuments
        export const industriedienstleisterShowcase: DemoTemplate = {
          key: "industriedienstleister_showcase",
          label: "Industriedienstleister — Showcase (150 MA)",
          industry: "industriedienstleister",
          variant: "showcase",
          applyConfig: applyIndustriedienstleisterConfig,
          applyDemoData: async (ctx, config) => { ... }
        }
      starter.ts
        import { applyIndustriedienstleisterConfig } from "./shared"
        export const industriedienstleisterStarter: DemoTemplate = {
          key: "industriedienstleister_starter",
          label: "Industriedienstleister — Starter (leer)",
          industry: "industriedienstleister",
          variant: "starter",
          applyConfig: applyIndustriedienstleisterConfig,
          applyDemoData: undefined
        }
```

Der Aufrufer (`demoService.createDemo`) müsste dann in etwa so aussehen:

```typescript
// (nur Pseudocode zur Illustration, nicht zur Implementierung)
const configResult = await template.applyConfig(ctx)
if (template.applyDemoData) {
  await template.applyDemoData(ctx, configResult)
}
```

`configResult` würde die IDs der erzeugten Departments, Tariffs, etc.
zurückgeben, damit die Showcase-Schicht sie in ihren FK-Referenzen verwenden kann
— genau so, wie heute `seedDepartments` und `seedTariffs` ihre Records an
`seedEmployees` übergeben.

#### Stellen im aktuellen Template, die gegen diese Schnittlinie verstoßen

Aktuell verletzt der Code die Schnittlinie an diesen konkreten Stellen:

1. **`seedCrmAddresses` steht nach `seedEmployeeDayPlans`**
   (`industriedienstleister_150.ts:152`): Die Helper-Reihenfolge folgt heute
   nicht der Kategorisierung. Im Refactor würde `seedCrmAddresses` fachlich in
   die Config-Schicht wandern — aber nur wenn es leere Master-Kunden sät (heute
   erzeugt es 3 fiktive Kunden, die Showcase-Charakter haben).
2. **`seedWarehouse` steht am Ende** (`industriedienstleister_150.ts:154`):
   Analog — die Modelle `WhArticleGroup` und `WhArticle` sind KONFIGURATION,
   aber die heute erzeugten 30 Artikel-Rows mit Faker-generierten Namen sind
   Showcase-Daten. Starter würde nur die leere Gruppen-Struktur säen.
3. **`seedBillingDocuments` benötigt `customers` aus `seedCrmAddresses`**
   (`industriedienstleister_150.ts:492`): Ein Pflicht-Parameter. Wenn
   `seedCrmAddresses` in die Showcase-Schicht zieht, muss `seedBillingDocuments`
   mit dort hin.
4. **`seedEmployeeDayPlans` benötigt `employees` und `dayPlans`**
   (`industriedienstleister_150.ts:399-400`): `dayPlans` ist Konfiguration,
   `employees` sind Showcase-Daten. Die Showcase-Schicht muss die `dayPlans`-IDs
   aus dem Config-Result lesen können.
5. **`seedTariffs` benötigt `weekPlans`** (`industriedienstleister_150.ts:267`):
   Beide sind Config — unproblematisch.
6. **Fehlende `VacationBalance`-Erzeugung**: Wenn die Showcase-Schicht
   `Employee`-Rows erzeugt, wäre hier der natürliche Ort, auch
   `VacationBalance`-Rows anzulegen (heute fehlen sie komplett). Das ist nicht
   Teil des Starter/Showcase-Splits, aber ein offener Follow-up, der durch den
   Refactor leichter adressierbar würde.
7. **`seedAccounts` kommentiert `void accounts`**
   (`industriedienstleister_150.ts:158`): Die Account-IDs werden nicht weiter
   verwendet. Im Config-Result müssten sie trotzdem mitgegeben werden, falls
   die Showcase-Schicht später daraus per-Employee-Accounts (z.B. `FLEX`-
   Buckets) erzeugen soll.

Diese sieben Stellen sind die einzigen "Reparatur"-Punkte im aktuellen File, die
ein Config/Demo-Split erzwingen würde.

## Code References

### Demo-Template-Kern

- `src/lib/demo/types.ts:14-26` — `DemoTemplate` Interface mit 4 Feldern (`key`, `label`, `description`, `apply`)
- `src/lib/demo/registry.ts:4-6` — Registry als `Record<string, DemoTemplate>` mit heute genau einem Eintrag
- `src/lib/demo/registry.ts:8-24` — `getDemoTemplate(key)` + `listDemoTemplates()` (liefert nur key/label/description, kein `apply`)
- `src/lib/demo/registry.ts:26` — `DEFAULT_DEMO_TEMPLATE = "industriedienstleister_150"`
- `src/lib/demo/templates/industriedienstleister_150.ts:135-159` — `apply()`-Funktion mit linearer 13-Schritt-Reihenfolge
- `src/lib/demo/templates/industriedienstleister_150.ts:632-638` — Export des `DemoTemplate`-Objekts

### Seed-Helper im Template

- `industriedienstleister_150.ts:177-187` — `seedDepartments` (4 Rows)
- `industriedienstleister_150.ts:189-216` — `seedAccounts` (1 Group + 10 Accounts)
- `industriedienstleister_150.ts:218-237` — `seedDayPlans` (3 Rows)
- `industriedienstleister_150.ts:239-262` — `seedWeekPlans` (3 Rows)
- `industriedienstleister_150.ts:264-303` — `seedTariffs` (12 Rows, 4 Tiers × 3 Schichten)
- `industriedienstleister_150.ts:305-317` — `seedBookingTypes` (8 Rows)
- `industriedienstleister_150.ts:319-333` — `seedAbsenceTypes` (6 Rows)
- `industriedienstleister_150.ts:335-344` — `seedHolidays` (20 Rows Bayern 2026/2027)
- `industriedienstleister_150.ts:346-394` — `seedEmployees` (150 Rows, Faker-seed 42)
- `industriedienstleister_150.ts:396-441` — `seedEmployeeDayPlans` (~3000 Rows, 20 Werktage × 150)
- `industriedienstleister_150.ts:443-487` — `seedCrmAddresses` (3 fiktive Kunden)
- `industriedienstleister_150.ts:489-577` — `seedBillingDocuments` (5 Rechnungen × 3 Positionen)
- `industriedienstleister_150.ts:579-626` — `seedWarehouse` (2 Gruppen + 30 Artikel)

### Prisma-Modelle (Zeilen in `prisma/schema.prisma`)

- `Department` @ 1680, `AccountGroup` @ 1601, `Account` @ 1634, `DayPlan` @ 2562,
  `WeekPlan` @ 2738, `Tariff` @ 2788, `BookingType` @ 2327, `AbsenceType` @ 2513,
  `Holiday` @ 1572, `CrmAddress` @ 454, `WhArticleGroup` @ 4881, `WhArticle` @ 4899
- `Employee` @ 1776 (PERSONEN)
- `EmployeeDayPlan` @ 3360, `BillingDocument` @ 848, `BillingDocumentPosition` @ 942 (BEWEGUNGSDATEN)
- `VacationBalance` @ 3126 (fehlt im Template, per-Employee-Pflicht-FK)
- `Tenant.isDemo` @ 122 (Default `false`)

### Service + Router Lifecycle

- `src/lib/services/demo-tenant-service.ts:142-261` — `createDemo` mit `$transaction` (120s timeout)
- `src/lib/services/demo-tenant-service.ts:149` — `getDemoTemplate(templateKey)` Aufruf
- `src/lib/services/demo-tenant-service.ts:204-219` — `createUser(...)` erzeugt Admin **außerhalb** des Templates
- `src/lib/services/demo-tenant-service.ts:223` — einziger Aufruf von `template.apply({tx, tenantId, adminUserId})`
- `src/lib/services/demo-tenant-service.ts:369-409` — `convertDemo`: snapshot → optional wipe → `convertDemoKeepData`
- `src/lib/services/demo-tenant-repository.ts:36-59` — `createDemoTenant` setzt `isDemo=true, demoExpiresAt, demoTemplate`
- `src/lib/services/demo-tenant-repository.ts:166-182` — `convertDemoKeepData` cleart alle Demo-Felder
- `src/trpc/platform/routers/demoTenantManagement.ts:69` — `templates`-Query ruft `listDemoTemplates()`
- `src/trpc/platform/routers/demoTenantManagement.ts:85-126` — `create`-Procedure, Input-Schema Zeile 39-60
- `src/trpc/platform/routers/demoTenantManagement.ts:209-364` — `convert`-Procedure (Snapshot + Wipe + Re-Insert + Subscription Bridge + Audit)
- `src/trpc/platform/routers/demoTenantManagement.ts:272-333` — Subscription-Bridge-Loop mit `failedModules[]`

### Platform Subscription Service

- `src/lib/platform/subscription-service.ts:375-497` — `createSubscription`: liest NICHT `tenant.isDemo`, nur `billingExempt`
- `src/lib/platform/subscription-service.ts:398-410` — `billingExempt`-Guard → `PlatformSubscriptionBillingExemptError`
- `src/lib/platform/module-pricing.ts:51-88` — `MODULE_PRICES` (core €8, crm/billing/warehouse €4, inbound_invoices €3, payment_runs €2 je Monat)
- `src/trpc/platform/routers/tenantManagement.ts:585-703` — `enableModule`: liest nicht `isDemo`, nur `billingExempt`
- `src/trpc/platform/routers/tenantManagement.ts:640-644` — `shouldBill`-Kondition
- `src/trpc/platform/routers/tenantManagement.ts:135-262` — `platformTenantManagement.create` (Path B): erzeugt Tenant ohne `isDemo`-Feld → DB-Default `false`
- `src/trpc/routers/tenants.ts:288-405` — `tenantsRouter.create` (Path C): tenant-seitiger Create mit `TENANTS_MANAGE` Permission

### Admin-UI und Banner

- `src/app/platform/(authed)/tenants/demo/page.tsx:111-115` — `DemoTemplateOption` Typ (nur `key`, `label`, `description`)
- `src/app/platform/(authed)/tenants/demo/page.tsx:140` — `templates`-Query
- `src/app/platform/(authed)/tenants/demo/page.tsx:280` — Übergabe an `CreateDemoSheet`
- `src/app/platform/(authed)/tenants/demo/page.tsx:367` — Template-Spalte rendert raw `key` in `font-mono`
- `src/app/platform/(authed)/tenants/demo/page.tsx:491-495` — Default-State initialisiert auf ersten Template-Key
- `src/app/platform/(authed)/tenants/demo/page.tsx:660-670` — `<Select>`-Dropdown, zeigt nur `tpl.label`
- `src/components/layout/demo-banner.tsx:24` — liest `isDemo` + `demoExpiresAt`, keine Template-Logik
- `src/components/layout/demo-expiration-gate.tsx:30` — liest `isDemo` + `demoExpiresAt`, redirect nach `/demo-expired`

## Architecture Documentation

### Aktuelles Template-Pattern (Ist-Zustand)

- Ein Template ist ein Plain-Object vom Typ `DemoTemplate` mit einer
  `apply(ctx)`-Methode, die in einer vom Aufrufer geöffneten
  `Prisma.TransactionClient` alle Daten seedet.
- Der Aufrufer (`demoService.createDemo`) öffnet die Transaktion, legt den
  Tenant an, aktiviert `core/crm/billing/warehouse` per `tenantModule.upsert`,
  erzeugt den Admin-User via `createUser(...)`, und ruft **erst dann**
  `template.apply(...)` auf.
- Die Registry ist ein statischer Record, keine Plugin-Infrastruktur. Ein neues
  Template wird per Import + Record-Eintrag registriert.
- Die Admin-UI holt Templates über einen tRPC-Query, der nur die
  öffentlichen Felder (`key`, `label`, `description`) liefert — die
  `apply`-Funktion verlässt den Server nicht.

### Demo-Lebenszyklus (Ist-Zustand)

- `is_demo` + `demo_expires_at` + `demo_template` + `demo_created_by_platform_user_id`
  sind vier Spalten im `tenants`-Table (`schema.prisma:122` ff).
- Die Aktionen `extend`, `convert`, `expireNow`, `delete` operieren
  ausschließlich auf diesen Spalten (plus optional Wipe via `wipeTenantData`).
- Der `expire-demo-tenants`-Cron deaktiviert abgelaufene Demos per
  `isActive=false`.
- Der Demo-Banner / Expiration-Gate reagiert nur auf `isDemo` + `demoExpiresAt`,
  nicht auf den Template-Key.

### Subscription-Kopplung (Ist-Zustand)

- `subscriptionService.createSubscription` ist `isDemo`-agnostisch. Die Schutz-
  klauseln prüfen nur `billingExempt` und `isOperatorTenant`.
- Der Convert-Router ist die einzige Stelle, die Subscriptions im Kontext eines
  Tenant-Lifecycle-Wechsels erzeugt. `enableModule` erzeugt sie
  opportunistisch beim ersten Aktivieren eines Moduls.
- Beide Wege funktionieren auf einem Non-Demo-Tenant (Path B oder Path C)
  identisch — es gibt keinen Code, der Subscription-Erzeugung an
  "Demo-Abschluss" bindet.

## Historical Context (from thoughts/)

Die folgenden Dokumente bilden den historischen Kontext für das heutige
Demo-System und die Subscription-Bridge:

- `thoughts/shared/plans/2026-04-09-demo-tenant-system.md` — Ursprünglicher
  Implementierungsplan für das Demo-Tenant-System mit Template-Registry und
  `industriedienstleister_150` als Default
- `thoughts/shared/plans/2026-04-11-demo-tenant-platform-migration.md` —
  Implementierungsplan für Phase 10b (Migration der Demo-Verwaltung in die
  Platform-Admin-Welt), inkl. Convert-Orchestrierung mit Subscription-Kopplung
- `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` —
  Implementierungsplan für Phase 10a (Operator-Tenant-Billing, `BillingRecurringInvoice`,
  Autofinalize-Cron, House-Tenant-Regel)
- `thoughts/shared/plans/2026-04-13-platform-billing-exempt-tenants.md` — Plan
  für `billingExempt`-Flag jenseits der House-Tenant-Regel
- `thoughts/shared/plans/2026-03-15-seed-default-accounts-and-apply-calculation-rules.md`
  — Plan für Default-Account-Seeding in neuen Tenants
- `thoughts/shared/plans/2026-01-27-dev-mode-seed-missing-entities.md` — Plan
  zum Füllen der Dev-Mode-Seed-Lücken
- `thoughts/shared/research/2026-04-09-demo-tenant-system.md` — Research-Basis
  für den ursprünglichen Demo-Entwurf
- `thoughts/shared/research/2026-04-11-demo-tenant-platform-migration.md` —
  Detailliertes Inventar des implementierten Demo-Systems
- `thoughts/shared/research/2026-04-10-platform-subscription-billing.md` —
  Research zum Phase-10-Dogfood-Ansatz via Operator-Tenant
- `thoughts/shared/research/2026-04-13-mahnwesen-platform-subscription-filter.md`
  — Research zum Ausschluss von Platform-Subscription-Rechnungen aus dem
  Mahnwesen (berührt billing-exempt/Operator-Abgrenzung)
- `thoughts/shared/research/2026-01-27-dev-mode-seeding-investigation.md` —
  Untersuchung der Dev-Mode-Seed-Lücken
- `thoughts/shared/status/2026-04-13-stand.md` — Aktueller Stand offener Themen

Kein bestehendes Dokument diskutiert explizit die Aufteilung KONFIG vs.
PERSONEN vs. BEWEGUNGSDATEN in einem Template.

## Related Research

- Platform Subscription Billing Phase 10a → `thoughts/shared/research/2026-04-10-platform-subscription-billing.md`
- Demo-Tenant Phase 10b Migration → `thoughts/shared/research/2026-04-11-demo-tenant-platform-migration.md`
- Ursprüngliches Demo-System → `thoughts/shared/research/2026-04-09-demo-tenant-system.md`

## Open Questions

1. **Admin-User-Erzeugung im Non-Demo-Pfad**: Wie erzeugt
   `platformTenantManagement.create` (`tenantManagement.ts:135-262`) heute
   einen Admin-User? Falls gar nicht, müsste eine Starter-Variante im Path-B-
   Ansatz zusätzlich zum Template einen Admin-User anlegen. Diese Recherche
   hat den Path-B-`create` nicht im Detail analysiert.

2. **`demo_expires_at` als nullable?**: Laut `schema.prisma:122` ist die Spalte
   optional, aber der `createDemoInputSchema` erlaubt nur 1–90 Tage
   (`demoTenantManagement.ts:39-60`). Für einen "Starter-als-Demo"-Ansatz müsste
   entweder die Cap angehoben oder eine 0 / null zugelassen werden.

3. **`VacationBalance`-Lücke**: Das aktuelle Showcase-Template legt keine
   `VacationBalance`-Rows an, obwohl `VacationBalance.employeeId` Pflicht-FK ist.
   Das bedeutet, die Showcase-Demo ist im Urlaubsverwaltungs-Bereich heute nicht
   "vollständig". Nicht Teil des Starter/Showcase-Splits, aber ein Befund.

4. **Unberührte Stammdaten-Modelle**: Der Template-Scan hat 19 weitere Modelle
   identifiziert, die als "tenant-scoped Stammdaten" gelten könnten und vom
   Template nicht berührt werden (u.a. `CostCenter`, `Location`, `EmploymentType`,
   `NumberSequence`, `BillingTenantConfig`, `BillingPriceList`, `ReminderSettings`,
   `ReminderTemplate`, `SystemSetting`, `EmailTemplate`, `TenantSmtpConfig`,
   `EmployeeGroup`, `WorkflowGroup`, `ActivityGroup`, `VacationCappingRuleGroup`,
   `VacationCalculationGroup`, `AbsenceTypeGroup`). Eine Starter-Variante würde
   von diesen Modellen profitieren — unklar, welche davon für einen
   "auslieferungsreifen" Tenant Pflicht sind. Der Abgleich mit
   `docs/TERP_HANDBUCH.md` wurde in dieser Recherche nicht durchgeführt.

5. **Konsistenz mit `docs/TERP_HANDBUCH.md`**: Die Anweisung des Users, dass das
   Handbuch als autoritative Produktreferenz dient, wurde hier nicht voll
   ausgeschöpft — ein Abgleich der 19 ungenutzten Modelle mit
   `docs/TERP_HANDBUCH.md` würde zeigen, welche Entities ein produktiv nutzbarer
   Tenant fachlich braucht, und damit klären, wie vollständig das aktuelle
   KONFIGURATION-Set wirklich ist.
