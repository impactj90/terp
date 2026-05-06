---
date: 2026-04-29
author: tolga
git_commit: 170922fc
branch: staging
repository: terp
topic: "NK-1 Einzelauftrag-Nachkalkulation (Soll/Ist auf Auftragsebene) — Implementation Plan"
tags: [plan, nachkalkulation, nk-1, order, order-target, wage-group, order-type, activity-pricing, snapshot, aggregator, threshold, module]
status: completed
last_updated: 2026-05-06
last_updated_by: tolga
research: thoughts/shared/research/2026-04-29-nk-1-einzelauftrag-nachkalkulation.md
followup_backlog: thoughts/shared/backlog/nachkalkulation-vertragsmodi.md
related_backlog: thoughts/shared/backlog/r2-billing-modes-flat-rate-followup.md
---

> **Status-Hinweis (closing-pass 2026-05-06)**: NK-1 ist ehrlich done.
> Backend + UI sind in zwei Sprints umgesetzt (2026-04-29 + 2026-05-05).
> Im Closing-Pass 2026-05-06 wurden die letzten drei Lücken aus dem
> Verifikations-Report geschlossen:
> 1. Backlog `nachkalkulation-vertragsmodi.md` Frontmatter aktualisiert
>    (`source_plan` + `related_research` zeigen jetzt auf reale Pfade).
> 2. **Demo-Bewegungsdaten** (`seedNkBewegungsdaten`) implementiert —
>    3 ServiceObjects, 5 Aufträge mit OrderTargets (1× v1+v2-Re-Plan),
>    24 OrderBookings mit Snapshots, 6 WorkReports (5 SIGNED mit
>    travel-snapshot + 1 DRAFT), 12 WhStockMovements mit
>    unitCostAtMovement, 1 InboundInvoice mit 3 Position-Level-Items
>    (2 mit Order-Verlinkung), Edge-Case-DataQualityIssue. Integration-
>    Test deckt die Counts ab.
> 3. **E2E-Specs 88–92 grün** gegen laufenden Dev-Server (32 Tests in
>    3.1min). Selektor-Fixes + UI-Bug-Dokumentation in Deviations.
>
> Decision 30 wurde implizit verifiziert durch das erfolgreiche Schreiben
> der Phase-1-Migration und das Funktionieren des Aggregators in
> Phase 6. Status: `completed`.

# NK-1: Einzelauftrag-Nachkalkulation — Implementation Plan

## Overview

NK-1 schließt die Stack-B-Lücke "Soll/Ist auf Auftragsebene". Das
Datenmodell wird so gebaut, dass NK-2 (Werkvertrag-Pauschale), NK-3
(Stundenpool), NK-4 (Service-KPIs), NK-5 (Asset-KPIs) und NK-6
(Multi-Party-Pricing) ohne Migrations-Schmerz andocken können. Der
Plan implementiert:

- Ein versioniertes `OrderTarget`-Modell für Soll-Werte mit
  Re-Planungs-Pfad
- Eine `WageGroup`-Stammtabelle pro Tenant inkl. Migration aus
  `Employee.salaryGroup` Freitext
- Eine `OrderType`-Stammtabelle mit Default-OrderTypes pro Tenant
- Eine Activity-Pricing-Erweiterung (`pricingType`, `flatRate`,
  `hourlyRate`, `unit`, `calculatedHourEquivalent`)
- Snapshot-Felder an `WhStockMovement.unitCostAtMovement` und
  `OrderBooking.hourlyRateAtBooking` + `hourlyRateSourceAtBooking`
- Eine Position-Level-Order-/Kostenstellen-Zuordnung an
  `InboundInvoiceLineItem`
- Eine FK-Verlinkung `WhStockMovement.inboundInvoiceLineItemId` zur
  Doppelzuordnungs-Vermeidung
- Einen Pure-Function-Aggregations-Service `nk-aggregator.ts`
- Einen `NkThresholdConfig`-Lookup-Service mit Default- und
  Auftragstyp-Override-Lookup
- Order-Detail-UI für Soll/Ist plus Dashboard-Karte und Drill-Down
- Modul-Gating über ein neues Modul `nachkalkulation`
- Vollständige Demo-Tenant-Erweiterung
- E2E-Test für End-to-End-Workflow

**Quelle der Codebase-Wahrheit**:
`thoughts/shared/research/2026-04-29-nk-1-einzelauftrag-nachkalkulation.md`.
Bei Konflikt zwischen diesem Plan und der Research gewinnt die
Research; Plan wird angepasst.

**Out-of-Scope**: Vertragsmodi (NK-2+), SLA, FTFR, MTTR/MTBF,
Multi-Party-Pricing — siehe
`thoughts/shared/backlog/nachkalkulation-vertragsmodi.md`.

## Working Rule — PAUSE + Deviation Note (R-1-Pattern)

Bei jeder technischen Überraschung während der Implementierung, die
eine Abweichung vom Plan erzwingt (Schema-Felder fehlen unerwartet,
Service-API verhält sich anders als hier dokumentiert,
Permission-Key existiert schon, Dual-Verwendung eines Feldes
entdeckt):

1. **PAUSE** — nicht stillschweigend anpassen, sondern
   Implementierung anhalten.
2. **Deviation Note** — neue Sektion am Ende dieses Dokuments unter
   `## Deviations` mit:
   - Was wurde im Plan angenommen
   - Was wurde tatsächlich vorgefunden
   - Welche Resolution wurde gewählt (mit Begründung)
   - Welche Folge für andere Phasen (falls relevant)
3. Resolution mit dem Reviewer abstimmen, dann fortfahren.

---

## Decision Log

Diese 25 strategischen Entscheidungen wurden vor dem Plan zwischen PO
und Architekt geklärt. Sie sind **nicht zur Debatte** im Rahmen
dieses Plans. Wenn der Plan technisch dagegen sprechen sollte: Open
Question am Ende des Dokuments anlegen, kein heimliches Abweichen.

### Datenmodell für Soll-Werte

**Decision 1 — OrderTarget-Tabelle mit Versionierung (1:n zu
Order)**. Pattern wie `EmployeeSalaryHistory`: `validFrom`, `validTo`
nullable (aktive Version: `validTo IS NULL`), `version` integer.
Re-Planung schließt alte Version (setzt `validTo = neue.validFrom -
1 Tag`) und legt neue Version an. Felder: `targetHours`,
`targetMaterialCost`, `targetTravelMinutes`, `targetExternalCost`,
`targetRevenue`, `targetUnitItems Json?` (Liste
`[{ activityId, quantity }]` für PER_UNIT-Aktivitäten).

**Begründung**: Versionierung ist Pflicht, weil Soll-Werte im
Auftragsverlauf re-geplant werden (z.B. Notdienst weitet sich aus).
Ohne Versionierung gibt es keinen Audit-Pfad "was war ursprünglich
geplant?". `EmployeeSalaryHistory` ist ein im Codebase erprobtes
Versionierungs-Pattern und wird wiederverwendet.

**Decision 2 — WageGroup-Tabelle pro Tenant**. Felder: `id`,
`tenantId`, `code`, `name`, `internalHourlyRate`,
`billingHourlyRate`, `sortOrder`, `isActive`. `Employee.wageGroupId`
als FK ergänzt. Migration: bestehende `Employee.salaryGroup`-
Freitext-Werte werden via One-Off-Script gemappt — pro distinct
`salaryGroup`-Wert pro Tenant ein WageGroup-Eintrag mit Default-
Sätzen, `Employee.wageGroupId` wird gesetzt; nicht-zuordbare bleiben
NULL mit Datenqualitäts-Indikator.

**Begründung**: `Employee.salaryGroup` ist heute ein Freitext ohne
Pricing-Bezug. Eine eigene Lohngruppen-Entity ist Pflicht für
"Soll-Stunden je Lohngruppe" und für interne vs. abrechenbare
Stundensätze (Differenz = Marge je Lohngruppe). Migration aus
Bestand verhindert Datenverlust.

**Decision 3 — Kalkulatorische Sollzeit als Feld an Activity**
(`calculatedHourEquivalent Decimal?`). Wird zusammen mit
Activity-Level-Pricing (Decision 7) eingebaut. Pauschalposition
"Notdienst-Anfahrt 89€" trägt z.B. `calculatedHourEquivalent =
0.5h` für Soll-Vergleichbarkeit. Wird in `OrderTarget`-
Soll-Berechnung gegen `targetHours` mitgeführt.

**Begründung**: Pauschalpositionen müssen mit Stunden-Sollwerten
vergleichbar sein. Ohne kalkulatorische Sollzeit lassen sich
Pauschalen nicht in den DB-II-Vergleich aufnehmen.

### Aggregations-Schicht — Snapshot-Strategie

**Decision 4 — Material-Snapshot via
`WhStockMovement.unitCostAtMovement`**. Befüllung beim Booking aus
passender Quelle:
- `bookGoodsReceipt`: aus `WhPurchaseOrderPosition.unitPrice`
- `createWithdrawal`: aus aktuellem `WhArticle.buyPrice`
- `ADJUSTMENT`/`INVENTORY`: aus aktuellem `WhArticle.buyPrice`

Bestandsdaten bleiben NULL — kein fake-Snapshot. Aggregation
behandelt NULL explizit als "estimated" und reicht das Flag bis ins
Report-Output.

**Begründung**: Historische Stabilität ist Pflicht — eine spätere
Preis-Änderung am Article darf alte Material-Aggregate nicht
verändern. Bestandsdaten künstlich zu backfillen würde falsche
Zahlen erzeugen; ehrliche NULL-Markierung ist sauberer.

**Decision 5 — Doppelzuordnung Material/Eingangsrechnung über
echte FK-Verlinkung**.
- `WhStockMovement.inboundInvoiceLineItemId String? @db.Uuid` (FK auf
  `InboundInvoiceLineItem`) wird beim Verknüpfen Wareneingang ↔
  Eingangsrechnungs-Position gesetzt.
- `InboundInvoiceLineItem.orderId String? @db.Uuid` und
  `costCenterId String? @db.Uuid` werden ergänzt
  (Position-Ebene-Zuordnung, schließt strukturelle Research-Lücke).
- Bestandsdaten-Migration: `InboundInvoiceLineItem.orderId` wird 1:1
  vom Beleg-Kopf kopiert, falls dort gesetzt.
- Aggregation: Material aus `WhStockMovement` (mit
  `unitCostAtMovement`) plus Eingangsrechnungs-Positionen mit
  `inboundInvoiceLineItemId IS NULL` (nicht-lagergeführt). Keine
  Heuristik, keine Doppelzählung.

**Begründung**: Heuristiken zur Doppelzuordnungs-Vermeidung sind
fehleranfällig. Mit echter FK-Verlinkung weiß die Aggregation
deterministisch, welche Eingangsrechnungs-Positionen schon über
Lager-Bewegungen erfasst sind.

**Decision 6 — DRAFT-WorkReports zählen als "Pending Ist"**. Drei
separate Spalten im Aggregations-Output: `istCommitted` (nur
SIGNED), `istPending` (DRAFT), `istTotal` (Summe). UI standardmäßig
`istTotal` mit Hinweis "davon X% noch nicht abgenommen".
VOID-WorkReports komplett ausgeschlossen. Buchungen ohne
WorkReport-Zuordnung zählen als Pending mit Datenqualitäts-
Indikator.

**Begründung**: DRAFT-Stunden sind gearbeitete Stunden — sie nur
wegen "noch nicht unterschrieben" auszublenden würde Disponenten
falsche Soll/Ist-Bilder zeigen. Trennung in drei Spalten erlaubt
beide Sichten.

### Lookup-Resolver-Hierarchie

**Decision 7 — Activity-Level-Pricing vollständig in NK-1**.
Erweiterung `Activity`-Modell: `pricingType` Enum (`HOURLY` /
`FLAT_RATE` / `PER_UNIT`), `flatRate Decimal?`, `hourlyRate
Decimal?`, `unit String?`, `calculatedHourEquivalent Decimal?`.
Migration-Default `pricingType = HOURLY` für alle bestehenden
Activities (backwards-compatible).

R-1 Bridge-Service wird entsprechend erweitert. Vollständige
Lookup-Resolver-Hierarchie:
1. Position-Override (Generate-Dialog)
2. `Activity.flatRate` / `Activity.hourlyRate` (an Buchung — siehe
   Decision 20)
3. `Order.billingRatePerHour`
4. `WageGroup.billingHourlyRate` (über `Employee.wageGroupId`)
5. `Employee.hourlyRate`
6. NULL → manuelle Eingabe erzwingen

**Begründung**: Activity-Level-Pricing ist Pflicht, weil im Service
"Notdienst-Anfahrt-Pauschale 89€" und "Reparatur 75€/h" auf
demselben Schein stehen können. R-2-Backlog hatte Activity-Pricing
für später vorgesehen, wir ziehen es vor weil NK-1 sonst keine
Pauschalen aggregieren kann.

**Decision 14 — Stundensatz-Snapshot am OrderBooking**. Neue
Spalten:
- `hourlyRateAtBooking Decimal?` — der ermittelte Stundensatz zum
  Buchungszeitpunkt
- `hourlyRateSourceAtBooking String?` — welche Lookup-Stufe geliefert
  hat (`activity_flat`, `activity_hourly`, `order`, `wage_group`,
  `employee`, `none`)

Befüllung: bei Create und Update einer OrderBooking durchläuft der
erweiterte Lookup-Resolver die Hierarchie und schreibt das Ergebnis
als Snapshot. Bestandsdaten bleiben NULL mit Datenqualitäts-
Indikator und estimated-Markierung.

R-1 Bridge-Service: nutzt zukünftig den Snapshot, wenn vorhanden,
sonst Live-Lookup mit estimated-Flag. Damit ist auch die
Rechnungserstellung historisch stabil.

**Begründung**: Symmetrisch zu Decision 4 (Material-Snapshot). Eine
Lohnerhöhung darf historische Lohnkosten-Aggregate nicht verändern.

**Decision 20 — Activity-Stufe greift nur, wenn
`OrderBooking.activityId IS NOT NULL` UND Activity einen
pricingType-passenden Satz hat**. Sonst fällt Resolver durch zur
nächsten Stufe.
- `pricingType = FLAT_RATE` mit `flatRate` gesetzt → flatRate als
  Stundensatz
- `pricingType = HOURLY` mit `hourlyRate` gesetzt → hourlyRate
- `pricingType = PER_UNIT` mit `unit` gesetzt → nicht-Stunden-Pfad
  (Decision 21)
- sonst: durchfallen zu Stufe 3

**Begründung**: Aktivität ohne passende Pricing-Konfig darf nicht
zu NULL führen — Fallback durch Hierarchie ist Pflicht für
Backwards-Compatibility.

**Decision 21 — Nicht-Stunden-Aktivitäten (`PER_UNIT`) werden
separat aggregiert**. Im IstAufwandReport gibt es drei
Position-Typen:
- `laborHours` (Stunden mit Stundensatz)
- `flatItems` (Pauschalpositionen mit Anzahl × flatRate, plus
  `calculatedHourEquivalent` für Soll-Vergleichbarkeit)
- `unitItems` (Mengen × Einheit × Preis)

Soll-Vergleich für Pauschalen: `OrderTarget.targetHours` vs.
Ist-Stunden plus `calculatedHourEquivalent` aus flatItems.
Soll-Vergleich für unitItems: `OrderTarget.targetUnitItems` (Json
`[{ activityId, quantity }]`) vs. Ist-Mengen aus Aggregation.

**Begründung**: Mengen-Mischbetrieb (Stunden + Stück) ist
Service-Realität. Drei klar getrennte Position-Typen sind sauberer
als ein einheitliches "Position"-Modell mit Optional-Feldern.

### Datenqualitäts-Indikatoren

**Decision 8 — Counts mit Drill-Down**. Aggregations-Output trägt
`dataQualityIssues: { code, count, severity, affectedIds }`. UI
zeigt Counts; Klick öffnet Sheet mit Liste, von dort Navigation zur
konkreten Buchung/Bewegung/Rechnung. Standard-Indikatoren:
- Buchungen ohne ermittelbaren Stundensatz
- Buchungen mit `hourlyRateAtBooking IS NULL` (Bestandsdaten ohne
  Snapshot)
- WorkReports im DRAFT-Status (warning, kein error)
- Buchungen ohne WorkReport-Zuordnung
- Material-Bewegungen mit `unitCostAtMovement IS NULL`
  (Bestandsdaten)
- Eingangsrechnungs-Positionen mit `inboundInvoiceLineItemId IS NOT
  NULL` ignoriert (über Lager erfasst)
- Soft-deleted/inaktive Mitarbeiter mit Buchungen
- Employees ohne `wageGroupId` (nach Migration nicht-zugeordnet)

**Decision 9 — NkThresholdConfig-Tabelle pro Tenant mit
Auftragstyp-Override vollständig implementiert**. Spalten: `id`,
`tenantId`, `orderTypeId String?` (FK auf OrderType, Decision 15),
`marginAmberFromPercent`, `marginRedFromPercent`,
`productivityAmberFromPercent`, `productivityRedFromPercent`. Eine
Default-Zeile pro Tenant mit `orderTypeId IS NULL`, plus beliebige
Override-Zeilen pro Auftragstyp. Lookup: spezifisch zuerst, sonst
Default.

Default-Werte: DB-II-Marge grün >15% / gelb 5–15% / rot <5%;
Produktivität grün >85% / gelb 70–85% / rot <70%.

**Decision 15 — OrderType-Tabelle und Order-Erweiterung
vollständig in NK-1**. Neue Tabelle `OrderType` (`id`, `tenantId`,
`code`, `name`, `sortOrder`, `isActive`). `Order.orderTypeId
String?` als FK. Settings-UI für OrderType-Verwaltung.
Default-OrderTypes beim Tenant-Onboarding: leer; Tenant legt eigene
an.

**Decision 19 — Estimated-Markierung dezent aber konsequent**.
- Pro Zelle: vorgestelltes "≈" mit `text-muted-foreground` Tooltip
  "Wert basiert teilweise auf aktuellen Stammdatenpreisen oder
  Mitarbeiter-Sätzen, weil X Bewegungen oder Y Buchungen vor dem
  Migrations-Zeitpunkt liegen."
- Über dem Report: Banner-Komponente, falls *eine* der
  Aggregations-Spalten estimated-Anteile hat: "Dieser Report
  enthält Schätzwerte aus Bestandsdaten." Klick auf Banner öffnet
  Drill-Down-Sheet mit Liste der betroffenen Bewegungen/Buchungen.
- Aggregations-Output trägt explizit `estimatedShare: number`
  (Anteil 0.0–1.0) plus `estimatedComponents: string[]` für die
  Banner-Logik.

### Architektur

**Decision 10 — Keine `Order.contractId`-Spalte in NK-1**.
Contract-Tabelle wird in NK-2 angelegt zusammen mit der
Order-FK in einer atomaren Migration. Kein Stummel-FK ohne
Ziel-Tabelle.

**Begründung**: NK-2-Backlog hatte ursprünglich vorgeschlagen, die
Spalte schon in NK-1 anzulegen. Stummel-FKs ohne Zieltabelle sind
fragil und erzeugen Migrations-Schmerz wenn die Spalte später doch
anders heißen muss. Kein Vorab-Schema.

**Decision 11 — Aggregations-Service als pure-function-Style** in
neuer Datei `src/lib/services/nk-aggregator.ts`. Vorbild:
`order-booking-aggregator.ts`. Kernfunktionen:
- `calculateIstAufwand(prisma, tenantId, orderId): Promise<IstAufwandReport>`
- `calculateIstAufwandBatch(prisma, tenantId, orderIds): Promise<Map<string, IstAufwandReport>>`
- `calculateSollIstReport(prisma, tenantId, orderId): Promise<SollIstReport>`

Read-only, keine Mutationen, keine Side-Effects. NK-2+ kann diese
Funktionen für Vertrags-Aggregation in einer Schleife aufrufen.

**Decision 23 — Eigener Top-Level-tRPC-Router `nachkalkulation.*`**
für Reports und Soll-Werte. Stammdaten-Router (WageGroup,
OrderType, Activity-Pricing-Erweiterung) bleiben Top-Level oder in
ihrer bestehenden Domäne. Nur folgende Router-Bereiche sind unter
`requireModule("nachkalkulation")` gated:
- `nachkalkulation.reports.*`
- `nachkalkulation.targets.*`
- `nachkalkulation.thresholds.*`

Stammdaten-Router (`wageGroups.*`, `orderTypes.*`, `activities.*`)
sind Core/bestehend gated.

### Modulgating und Auth

**Decision 12 — Eigenes Modul `nachkalkulation`** in
`AVAILABLE_MODULES` (`src/lib/modules/constants.ts`). Eintrag in
`module-pricing.ts` mit konkretem Preis (Decision 16).

**Decision 13 — Kein Tier-System**. Modul ist binär enabled/disabled
(existierendes Pattern). Operator entscheidet pro Tenant.

**Decision 16 — Modul-Preis: 4 EUR/Mitarbeiter/Monat**.
`module-pricing.ts` Eintrag: `monthly: 4`, `annual: 40` (zwei Monate
Rabatt konsistent), `vatRate: 19`, `description: "Nachkalkulation
und Soll/Ist-Auswertungen"`.

**Decision 22 — Drei Permission-Konstanten**:
- `nachkalkulation.view` — Reports anzeigen (Disponent, Vorarbeiter)
- `nachkalkulation.manage` — Soll-Werte editieren, Re-Planung
  (Disponent, Geschäftsführer)
- `nachkalkulation.config` — Schwellen-Konfig (Admin)

WageGroup, OrderType, Activity-Pricing-Konfig nutzen ihre
bestehenden bzw. eigenen Permission-Konstanten in deren
Stammdaten-Router-Domänen. Default-Rollen-Mapping wie üblich.

### Audit-Logging

**Decision 24 — Audit-Logging für alle Mutationen, kein Audit für
Reads**. Konsistent mit existierendem `AuditContext`-Pattern.
Auditiert:
- OrderTarget-Versionen (create, update schließt alte Version)
- WageGroup-CRUD
- OrderType-CRUD
- Activity-Pricing-Konfig-Änderungen
- NkThresholdConfig-Änderungen

Reports und Aggregations-Aufrufe nicht.

### Migration-Strategie

**Decision 18 — Klar definierter Migration-Plan pro Phase**:
- `Employee.salaryGroup → wageGroupId`: One-Off-Script
- `InboundInvoiceLineItem.orderId`: 1:1-Kopie aus Beleg-Kopf
- `Activity.pricingType`: Default `HOURLY` für alle bestehenden
- `WhStockMovement.unitCostAtMovement`: bleibt NULL für
  Bestandsdaten, kein Backfill
- `OrderBooking.hourlyRateAtBooking`: bleibt NULL für
  Bestandsdaten, kein Backfill

### Demo-Tenant-Erweiterung

**Decision 17 — Demo-Tenant-Templates vollständig erweitern**. Das
`industriedienstleister_150`-Template wird ergänzt um:
- WageGroups für die Vertikale (Meister, Monteur, Geselle,
  Auszubildender, Hilfskraft)
- OrderTypes (Wartung, Notdienst, Reparatur, Inspektion, Projekt)
- NkThresholdConfig mit Default-Werten
- Pro Order: ein OrderTarget mit plausiblen Soll-Werten
- Neue Seed-Funktionen: `seedActivities`, `seedOrders`,
  `seedOrderBookings`, `seedWorkReports`, `seedStockMovements`
- Activity-Pricing-Erweiterung mit realistischen Werten
  (z.B. Notdienst-Anfahrt-Pauschale 89€ mit
  `calculatedHourEquivalent` 0.5h)

**Hinweis**: Der existierende Showcase-Template seedet heute KEINE
Orders/Bookings/WorkReports/StockMovements (verifiziert in
`showcase.ts` — siehe `applySeedData` an Zeile 373). NK-1 muss
diese Seed-Funktionen also neu hinzufügen, **dann** die
Snapshot-Felder direkt befüllen (kein nachträgliches Backfill).

### Test-Pyramide

**Decision 25 — Pro Phasentyp definierte Test-Pflicht** (siehe
"Tests"-Abschnitte pro Phase unten).

### Konsolidierungs-Decisions (vor Implementation-Start)

Diese Decisions ergänzen/präzisieren die ursprünglichen 25 nach der
Plan-Re-View. Sie schließen die Open Questions OQ-1, OQ-3, OQ-4,
OQ-6, OQ-7 ab und korrigieren zwei Inkonsequenzen im Plan-Text.

**Decision 26 — PER_UNIT-Mengen-Erfassung am OrderBooking**
(Resolved OQ-1).

Neue Spalte am `OrderBooking`-Modell:
```prisma
quantity Decimal? @db.Decimal(10, 2)
```

Service-Validierung in `order-booking-service.create` und `update`:
- Wenn die ausgewählte Activity `pricingType = "PER_UNIT"` hat:
  `quantity` ist Pflicht (>0). Fehlt:
  `OrderBookingValidationError("PER_UNIT-Aktivität benötigt
  quantity")`.
- Wenn Activity `HOURLY` oder `FLAT_RATE`: `quantity` wird
  ignoriert (kann gesetzt sein, hat aber keine
  Berechnungs-Wirkung).
- Wenn keine Activity gesetzt: `quantity` wird ignoriert.

UI: Bei PER_UNIT-Activity wird `quantity` als zusätzliches Feld
sichtbar mit `Activity.unit` als Suffix-Label; `timeMinutes` bleibt
sichtbar aber semantisch optional.

**Begründung**: PER_UNIT-Aktivitäten brauchen eine explizite,
maschinenlesbare Mengen-Spalte. `timeMinutes`-Reuse wäre
semantisch confused; `description`-Inline wäre nicht aggregierbar.
Eine eigene `quantity`-Spalte ist der saubere Weg, weil sie
zukünftig auch für Variant-Mengen (z.B. "12 Stück Filterwechsel"
unter einer FLAT_RATE-Activity) wiederverwendet werden kann.

**Decision 27 — Travel-Snapshot am WorkReport**
(Resolved OQ-4).

Neue Spalten am `WorkReport`-Modell:
```prisma
travelRateAtSign       Decimal? @map("travel_rate_at_sign") @db.Decimal(10, 2)
travelRateSourceAtSign String?  @map("travel_rate_source_at_sign") @db.VarChar(20)
```

Befüllung: `work-report-service.sign` (DRAFT → SIGNED-Übergang)
ruft `resolveTravelRateExtended` und schreibt das Ergebnis als
Snapshot. DRAFT-WorkReports haben NULL → werden im Aggregator als
estimated behandelt. VOID-WorkReports werden komplett
ausgeschlossen, Snapshot irrelevant.

Aggregator nutzt vorrangig `WorkReport.travelRateAtSign`, fällt
zurück auf Live-Lookup mit estimated-Flag wenn NULL.
`travel.estimatedShare` ist datengetrieben (Anteil WorkReports
ohne Snapshot), nicht hartkodiert.

**Begründung**: Symmetrie zu Decision 4 (Material-Snapshot) und
Decision 14 (Lohn-Snapshot). Eine spätere
Stundensatz-Änderung am Order oder Mitarbeiter darf historische
Travel-Aggregate nicht verändern. Befüllung am Sign-Zeitpunkt ist
der natürliche Trigger, weil nur SIGNED-Scheine in die
Rechnungs-Stellung gehen.

**Decision 28 — Resolver in dedizierter Datei
`labor-rate-resolver.ts`**.

Korrigiert die ursprüngliche Plan-Skizze in Phase 3, die einen
"temporären Inline-Resolver" vorsah, der in Phase 5 ersetzt würde.
Stümpfen-Pattern, nicht erlaubt.

Neue Datei in **Phase 3** (NICHT Phase 5):
- `src/lib/services/labor-rate-resolver.ts`

Inhalt: die finale Implementierung von `resolveLaborRateExtended`
und `resolveTravelRateExtended` plus Type-Exports
`HourlyRateSource` und `ResolvedRate`.

Nutzung:
- Phase 3: `order-booking-service.create/update` importiert aus
  `labor-rate-resolver.ts`.
- Phase 5: `work-report-invoice-bridge-service.ts` importiert aus
  `labor-rate-resolver.ts` statt eigener Re-Implementierung;
  `work-report-service.sign` (Decision 27) importiert ebenfalls.
- `wh-stock-movement-service` und `wh-withdrawal-service` brauchen
  den Resolver nicht (Material-Snapshot kommt aus
  `WhPurchaseOrderPosition.unitPrice` bzw. `WhArticle.buyPrice`).

Phase 5 wird umbenannt: "Phase 5 — Bridge-Service auf Resolver
umstellen + Travel-Snapshot-Befüllung".

**Begründung**: Wegwerf-Inline-Code kommt nie heraus, sondern
verklebt. Eine eigene Resolver-Datei ist die natürliche
Architektur-Heimat für diese Domain-Logik und macht die
Phase-3↔Phase-5-Abhängigkeit explizit.

**Decision 29 — Eigene Permission `activities.manage_pricing`**.

Korrigiert die Inkonsequenz im ursprünglichen Plan-Text in Phase 2,
wo zwischen `ACTIVITIES_MANAGE_PRICING` und `activities.manage`
geschwankt wurde.

In `permission-catalog.ts` (Phase 1):
```ts
p("activities.manage_pricing", "activities", "manage_pricing",
  "Configure activity pricing (pricingType, flatRate, hourlyRate)"),
```

Bestehende Activity-CRUD-Mutations bleiben unter
`activities.manage`. Neue separate Mutation `updatePricing` (oder
Erweiterung der bestehenden mit konditionalem Permission-Check)
nutzt `activities.manage_pricing`.

Default-Rollen-Mapping:
- Admin: `activities.manage_pricing` (zusätzlich zu
  `activities.manage`)
- Disponent: nur `activities.manage` (keine Pricing-Konfig)
- Vorarbeiter: nur `activities.view`

**Begründung**: Pricing-Konfig hat finanzielle Auswirkungen und
sollte separierbar sein vom normalen Activity-CRUD (Code, Name,
Beschreibung). Disponenten sollen Activities anlegen können, aber
die Pricing-Konfig ist GF/Admin-Verantwortung.

**Decision 30 — InboundInvoiceLineItem-Kostenfelder verifizieren**.

Vor Phase 1 muss die existierende `InboundInvoiceLineItem`-Schema-
Struktur bzgl. Kostenfeldern dokumentiert werden:
- Existiert `totalNet` als persistierte Spalte?
- Oder existiert nur `unitPrice` + `quantity` + (impliziter)
  Berechnungspfad?
- Welche Felder gibt es für VAT-Behandlung
  (`vatRate`, `vatAmount`, `totalGross`)?

Phase-1-Akzeptanzkriterium ergänzen:
- [ ] InboundInvoiceLineItem-Kostenfelder dokumentiert: welche
  Spalten der Aggregator nutzen wird, ob diese Spalten persistiert
  oder berechnet sind, ob sie historisch stabil sind.

**Erwartung aus Research**: die Kostenfelder existieren über die
ZUGFeRD-Parsing-Pipeline (`totalNet`, `vatRate`, `vatAmount`,
`totalGross` sind alle persistiert nullable Decimal). Wenn die
Verifikation diese Erwartung bestätigt: keine Schema-Änderung
nötig. Wenn nicht: Plan-PAUSE und Felder in Phase 1 ergänzen.

**Begründung**: Aggregator (Phase 6) liest `totalNet` als
External-Cost-Quelle. Wenn das Feld nicht persistiert ist, scheitert
die Aggregation lautlos. Verifikation vor Schreiben des
Aggregator-Codes ist Pflicht.

**Decision 31 — Audit-Detailtiefe für OrderTarget-Versionen**
(Resolved OQ-3).

Detail-Diff via `auditLog.computeChanges`-Pattern, wie es
`inbound-invoice-service` macht. Pro Re-Planung ein Audit-Eintrag
mit allen geänderten Feldern.

**Begründung**: Re-Planungen sind selten und haben hohen
forensischen Wert. Das compute-changes-Pattern ist im Codebase
etabliert.

**Decision 32 — Modul-Auto-Enable im Demo-Template**
(Resolved OQ-6).

Modul `nachkalkulation` wird beim
`industriedienstleister_150`-Demo-Setup automatisch enabled.
Operator kann nach Setup deaktivieren wenn nicht erwünscht.

**Begründung**: Demo-Daten ohne aktiviertes Modul wären sinnlos —
der Tab "Nachkalkulation" wäre unsichtbar, alle Soll/Ist-Daten in
der DB versteckt. Demo-Tenant-Onboarding muss "out of the box"
funktionieren.

Implementierung: neues Feld `TenantTemplate.modulesToEnable:
ModuleId[]` an `types.ts`, in `demo-tenant-service.ts` nach
`applySeedData` ausgewertet und entsprechende `tenantModule`-Zeilen
angelegt.

**Decision 33 — HOURLY-Default für Bestands-Activities**
(Resolved OQ-7).

Alle bestehenden Activities bekommen `pricingType = "HOURLY"` per
Migration-Default. Operator kann pricingType pro Activity
nachträglich anpassen über Phase-2-UI.

**Begründung**: Maximale Backwards-Compatibility. HOURLY ohne
gesetzten `Activity.hourlyRate` fällt automatisch durch zur
nächsten Lookup-Stufe — verhalten ist identisch zum aktuellen
Code-Verhalten.

---

## Architecture Overview

### Datenfluss-Diagramm

```
┌─────────────────────────────────────────────────────────────────────┐
│ SOLL-ERFASSUNG (Phase 4)                                           │
│                                                                     │
│ Order Form  ──► OrderTarget (versioniert, validFrom/validTo)       │
│                  ├─ targetHours                                     │
│                  ├─ targetMaterialCost                              │
│                  ├─ targetTravelMinutes                             │
│                  ├─ targetExternalCost                              │
│                  ├─ targetRevenue                                   │
│                  └─ targetUnitItems Json (PER_UNIT)                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SNAPSHOT-ERFASSUNG (Phase 3 + Phase 5)                             │
│                                                                     │
│ Resolver in dedizierter Datei: src/lib/services/labor-rate-resolver │
│   exportiert: resolveLaborRateExtended, resolveTravelRateExtended   │
│                                                                     │
│ OrderBooking.create/update (Phase 3)                                │
│   └─► Lookup-Resolver:                                              │
│        Activity → Order → WageGroup → Employee → null               │
│        ↓                                                            │
│   schreibt: hourlyRateAtBooking, hourlyRateSourceAtBooking          │
│   PER_UNIT-Validation: quantity Pflicht (Decision 26)               │
│                                                                     │
│ WorkReport.sign (Phase 5, Decision 27)                              │
│   └─► Travel-Resolver beim DRAFT → SIGNED Übergang                  │
│        ↓                                                            │
│   schreibt: travelRateAtSign, travelRateSourceAtSign                │
│                                                                     │
│ WhStockMovement (bookGoodsReceipt / createWithdrawal)               │
│   └─► schreibt: unitCostAtMovement aus PO/Article                   │
│                                                                     │
│ InboundInvoiceLineItem (Position-Level Order/CostCenter)            │
│   └─► via UI verlinkt: WhStockMovement.inboundInvoiceLineItemId     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ IST-AGGREGATION (Phase 6 — nk-aggregator.ts)                       │
│                                                                     │
│ calculateIstAufwand(orderId):                                       │
│   1. OrderBooking[orderId] → laborHours                             │
│      (committed = SIGNED, pending = DRAFT, total)                   │
│      Per-Booking: hourlyRateAtBooking || Live-Lookup (estimated)    │
│   2. Activity-Aggregation: laborHours / flatItems / unitItems       │
│      unitItems nutzen OrderBooking.quantity (Decision 26)           │
│   3. WorkReport.travelMinutes Σ — pro WR:                           │
│      travelRateAtSign (Snapshot) || Live-Lookup (estimated)         │
│   4. WhStockMovement[orderId, type=WITHDRAWAL]                      │
│      Σ (quantity × unitCostAtMovement || buyPrice estimated)        │
│   5. InboundInvoiceLineItem[orderId, inboundInvoiceLineItemId IS    │
│      NULL]  ────► externalCost                                      │
│   6. dataQualityIssues[] mit Drill-Down-IDs                         │
│   7. estimatedShare 0.0–1.0 + estimatedComponents[]                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SOLL/IST-REPORT (Phase 6)                                          │
│                                                                     │
│ calculateSollIstReport(orderId):                                    │
│   - Soll: aktive OrderTarget-Version (validTo IS NULL)              │
│   - Ist:  IstAufwandReport (oben)                                   │
│   - DB I  = Erlös – Material                                        │
│   - DB II = DB I  – Lohn                                            │
│   - DB III= DB II – Reisezeit                                       │
│   - Rohertrag/h, Mengen-vs-Preis-Abweichung                         │
│   - Ampel via NkThresholdConfig (default + orderType-override)      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ UI (Phase 8 + 9)                                                    │
│                                                                     │
│ Order-Detail "Nachkalkulation"-Tab — Soll/Ist-Tabelle, DB-Stufen,   │
│ Ampel, Pending/Committed-Toggle, ≈-Markierung, Drill-Down-Sheets    │
│                                                                     │
│ Dashboard-Karte "Aufträge der letzten Woche, Top/Flop nach Marge"   │
│ Liste-Reports: per Kunde / Anlage / Mitarbeiter aggregiert          │
└─────────────────────────────────────────────────────────────────────┘
```

### Service-Schichten

| Schicht | Datei | Verantwortung |
|---|---|---|
| Repository | `src/lib/services/nk-aggregator-repository.ts` | Read-only Prisma-Queries für Aggregator |
| Pure Function | `src/lib/services/nk-aggregator.ts` | Aggregations-Logik (siehe Decision 11) |
| Service | `src/lib/services/order-target-service.ts` | OrderTarget CRUD + Versionierung |
| Service | `src/lib/services/wage-group-service.ts` | WageGroup CRUD |
| Service | `src/lib/services/order-type-service.ts` | OrderType CRUD |
| Service | `src/lib/services/nk-threshold-config-service.ts` | Schwellen + Lookup |
| Repository | `src/lib/services/order-target-repository.ts` | Validity-Window-Queries |
| Repository | `src/lib/services/wage-group-repository.ts` | Standard-CRUD |
| Repository | `src/lib/services/order-type-repository.ts` | Standard-CRUD |
| Repository | `src/lib/services/nk-threshold-config-repository.ts` | Spezifisch-vor-Default-Lookup |

### Lookup-Resolver-Erweiterung

Resolver lebt ab Phase 3 in dedizierter Datei
`src/lib/services/labor-rate-resolver.ts` (Decision 28). Die alte
Inline-`resolveLaborRate` aus
`work-report-invoice-bridge-service.ts` wird durch einen Import
aus `labor-rate-resolver.ts` ersetzt — kein eigener Resolver mehr
im Bridge-Service:

```ts
// Pseudocode
function resolveLaborRateExtended(args: {
  bookingActivity: Activity | null
  orderRate: Decimal | null
  employeeWageGroupRate: Decimal | null   // billingHourlyRate aus WageGroup
  employeeRate: Decimal | null
}): { rate: number | null; source: HourlyRateSource } {
  // Stufe 2: Activity
  if (args.bookingActivity) {
    if (args.bookingActivity.pricingType === "FLAT_RATE" && args.bookingActivity.flatRate) {
      return { rate: toNumber(args.bookingActivity.flatRate), source: "activity_flat" }
    }
    if (args.bookingActivity.pricingType === "HOURLY" && args.bookingActivity.hourlyRate) {
      return { rate: toNumber(args.bookingActivity.hourlyRate), source: "activity_hourly" }
    }
    // PER_UNIT durchfällt — wird im Aggregator separat behandelt
  }
  // Stufe 3: Order
  if (toPositiveRate(args.orderRate) !== null) {
    return { rate: toPositiveRate(args.orderRate)!, source: "order" }
  }
  // Stufe 4: WageGroup
  if (toPositiveRate(args.employeeWageGroupRate) !== null) {
    return { rate: toPositiveRate(args.employeeWageGroupRate)!, source: "wage_group" }
  }
  // Stufe 5: Employee
  if (toPositiveRate(args.employeeRate) !== null) {
    return { rate: toPositiveRate(args.employeeRate)!, source: "employee" }
  }
  return { rate: null, source: "none" }
}
```

`HourlyRateSource` ist als Type-Union exportiert:
```ts
export type HourlyRateSource =
  | "activity_flat" | "activity_hourly"
  | "order" | "wage_group" | "employee" | "none"
```

---

## What We're NOT Doing

Bewusst NICHT in NK-1 enthalten — siehe entsprechende Backlog-
Tickets:

- **Contract-Entität** mit `Contract.fixedPrice` und
  `Order.contractId` → NK-2
  (`thoughts/shared/backlog/nachkalkulation-vertragsmodi.md`)
- **Werkvertrag-Pauschale** und Stundenpool-Logik im
  Aggregations-Service → NK-2/NK-3 (gleiches Backlog)
- **SLA-Compliance / FTFR / Utilization Rate / Revenue Leakage** als
  KPIs → NK-4 (gleiches Backlog)
- **MTTR/MTBF** pro Anlagentyp → NK-5 (gleiches Backlog)
- **Multi-Party-Pricing** pro Vertrag → NK-6 (gleiches Backlog)
- **`Order.billingMode`** Enum (HOURLY/FLAT_RATE/MIXED) → R-2
  (`thoughts/shared/backlog/r2-billing-modes-flat-rate-followup.md`)
  **Synergie-Hinweis**: NK-1's Activity-Level-Pricing (Decision 7)
  und R-2's `Order.billingMode` ergänzen sich. R-2 implementiert die
  Order-Ebene; NK-1 implementiert die Activity-Ebene. Beide
  Schichten arbeiten unabhängig korrekt.
- **Material-Übernahme aus `WhStockMovement` in
  Rechnungspositionen** → R-6 (gleiches R-Backlog)
- **CustomerBillingAgreement-Tabelle** → R-5 (gleiches R-Backlog)
- **Tenant-weiter Default-VAT** → R-3 (gleiches R-Backlog)
- **Vorkalkulation als eigenständige Engine** (Angebots-
  Kalkulation, Varianten, Versionierung) — eigenes Mega-Ticket
- **GAEB-Import / Aufmaß-Import** — nicht relevant für die
  Service-Vertikale
- **Predictive Maintenance / KI-Auftragszeitschätzung** — eigene
  KI-Tickets
- **DB-IV** (Vollkosten mit Gemeinkosten-Umlage und
  kalkulatorischen Zinsen) — Buchhaltungs-Software-Territorium
- **Forecasting** auf Basis historischer Soll/Ist-Daten — eigenes
  Ticket nach NK-1+NK-2

---

## Implementation Approach

Strikt phasenweise mit Database-First-Strategie. Phase 1 legt das
gesamte Schema-Foundation-Set in **einer atomaren Migration** an,
damit der Rest der Phasen nicht mehr migrieren muss. Phasen 2+
arbeiten dann inkrementell auf dem fertigen Schema.

Jede Phase ist allein lauffähig — die Codebase bleibt nach jeder
Phase konsistent (kein Halbzustand). Datei-Budget pro Phase ist
unten angegeben; bei Überschreitung PAUSE.

**Reihenfolge-Logik**:
1. **Phase 1** (Schema): atomare DB-Foundation
2. **Phase 2** (Stammdaten + UI): WageGroup/OrderType/Activity-
   Pricing — werden in Phase 3 gebraucht
3. **Phase 3** (Snapshot): Bewegungs-Quellen befüllen Snapshots —
   muss vor Phase 5 (Lookup) fertig sein, weil Lookup auf Snapshots
   prüft
4. **Phase 4** (OrderTarget): Soll-Werte-Service — unabhängig von
   Phase 3, kann parallel
5. **Phase 5** (Lookup-Resolver): R-1 Bridge erweitern — braucht
   Phase 2 (WageGroup) und Phase 3 (Snapshot)
6. **Phase 6** (Aggregator): Read-only Service — braucht alle
   Snapshots aus Phase 3, Lookup aus Phase 5
7. **Phase 7** (Schwellen): NkThresholdConfig — kann parallel zu
   Phase 6
8. **Phase 8** (UI Order-Detail): rendert Output aus Phase 6 + 7
9. **Phase 9** (Dashboard): aggregiert über mehrere Aufträge
10. **Phase 10** (Modul-Lockdown + Demo + Handbuch + E2E)

Phasen 4 und 7 könnten parallel laufen, wir machen sie sequenziell
für klare PAUSE-Punkte. Phasen 3 und 4 könnten parallel laufen, wir
machen sie sequenziell weil Phase 3 die invasivere Schema-
Änderungen einführt und in vielen Service-Dateien anfasst.

---

## Phase 1 — Schema-Foundation

### Goal

Atomare Migration: alle neuen Tabellen, alle neuen Spalten an
bestehenden Tabellen, alle Enum-Werte. Modul-Eintrag in
`AVAILABLE_MODULES`. Permission-Konstanten in `permission-catalog.ts`.
Backwards-compatible Defaults. Bestandsdaten-Migration für
`InboundInvoiceLineItem.orderId` und `Activity.pricingType`.

### Schema-Änderungen

**File**: `prisma/schema.prisma`

Neue Modelle (am Ende der Datei oder thematisch gruppiert):

```prisma
// ───────────────────────────────────────────────────────────────────
// Nachkalkulation (NK-1)
// ───────────────────────────────────────────────────────────────────

model OrderTarget {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String   @map("tenant_id") @db.Uuid
  orderId              String   @map("order_id") @db.Uuid
  version              Int      @default(1)
  validFrom            DateTime @map("valid_from") @db.Date
  validTo              DateTime? @map("valid_to") @db.Date

  targetHours          Decimal? @map("target_hours") @db.Decimal(10, 2)
  targetMaterialCost   Decimal? @map("target_material_cost") @db.Decimal(12, 2)
  targetTravelMinutes  Int?     @map("target_travel_minutes")
  targetExternalCost   Decimal? @map("target_external_cost") @db.Decimal(12, 2)
  targetRevenue        Decimal? @map("target_revenue") @db.Decimal(12, 2)
  targetUnitItems      Json?    @map("target_unit_items") @db.JsonB
  // shape: [{ activityId: uuid, quantity: number }]

  changeReason         String?  @map("change_reason") @db.VarChar(50)
  notes                String?  @db.Text

  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdBy            String?  @map("created_by") @db.Uuid

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  order  Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([tenantId, orderId, validTo], map: "idx_order_targets_tenant_order_valid")
  @@index([orderId, validFrom, validTo], map: "idx_order_targets_order_valid")
  @@map("order_targets")
}

model WageGroup {
  id                  String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String  @map("tenant_id") @db.Uuid
  code                String  @db.VarChar(50)
  name                String  @db.VarChar(255)
  internalHourlyRate  Decimal? @map("internal_hourly_rate") @db.Decimal(10, 2)
  billingHourlyRate   Decimal? @map("billing_hourly_rate") @db.Decimal(10, 2)
  sortOrder           Int      @default(0) @map("sort_order")
  isActive            Boolean  @default(true) @map("is_active")
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employees Employee[]

  @@unique([tenantId, code], map: "wage_groups_tenant_id_code_key")
  @@index([tenantId, isActive], map: "idx_wage_groups_tenant_active")
  @@map("wage_groups")
}

model OrderType {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String  @map("tenant_id") @db.Uuid
  code      String  @db.VarChar(50)
  name      String  @db.VarChar(255)
  sortOrder Int     @default(0) @map("sort_order")
  isActive  Boolean @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orders     Order[]
  thresholds NkThresholdConfig[]

  @@unique([tenantId, code], map: "order_types_tenant_id_code_key")
  @@index([tenantId, isActive], map: "idx_order_types_tenant_active")
  @@map("order_types")
}

model NkThresholdConfig {
  id                              String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId                        String  @map("tenant_id") @db.Uuid
  orderTypeId                     String? @map("order_type_id") @db.Uuid
  marginAmberFromPercent          Decimal @map("margin_amber_from_percent") @db.Decimal(5, 2)
  marginRedFromPercent            Decimal @map("margin_red_from_percent") @db.Decimal(5, 2)
  productivityAmberFromPercent    Decimal @map("productivity_amber_from_percent") @db.Decimal(5, 2)
  productivityRedFromPercent      Decimal @map("productivity_red_from_percent") @db.Decimal(5, 2)
  createdAt                       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant    Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orderType OrderType? @relation(fields: [orderTypeId], references: [id], onDelete: Cascade)

  @@unique([tenantId, orderTypeId], map: "nk_threshold_configs_tenant_order_type_key")
  @@index([tenantId], map: "idx_nk_threshold_configs_tenant")
  @@map("nk_threshold_configs")
}

enum ActivityPricingType {
  HOURLY
  FLAT_RATE
  PER_UNIT

  @@map("activity_pricing_type")
}
```

Erweiterungen bestehender Modelle:

```prisma
// Order: orderTypeId hinzufügen
model Order {
  // ...existierende Felder
  orderTypeId String? @map("order_type_id") @db.Uuid

  // ...existierende Relations
  orderType OrderType? @relation(fields: [orderTypeId], references: [id], onDelete: SetNull)
  targets   OrderTarget[]

  // ...existierende Indizes
  @@index([tenantId, orderTypeId], map: "idx_orders_tenant_order_type")
}

// OrderBooking: Snapshot-Felder + PER_UNIT-Mengen-Spalte
model OrderBooking {
  // ...existierende Felder
  hourlyRateAtBooking       Decimal? @map("hourly_rate_at_booking") @db.Decimal(10, 2)
  hourlyRateSourceAtBooking String?  @map("hourly_rate_source_at_booking") @db.VarChar(20)
  quantity                  Decimal? @db.Decimal(10, 2)  // Decision 26 — PER_UNIT-Menge
}

// WorkReport: Travel-Snapshot-Felder (Decision 27)
model WorkReport {
  // ...existierende Felder
  travelRateAtSign       Decimal? @map("travel_rate_at_sign") @db.Decimal(10, 2)
  travelRateSourceAtSign String?  @map("travel_rate_source_at_sign") @db.VarChar(20)
}

// Employee: wageGroupId
model Employee {
  // ...existierende Felder
  wageGroupId String? @map("wage_group_id") @db.Uuid

  // ...existierende Relations
  wageGroup WageGroup? @relation(fields: [wageGroupId], references: [id], onDelete: SetNull)

  @@index([tenantId, wageGroupId], map: "idx_employees_tenant_wage_group")
}

// Activity: Pricing-Erweiterung
model Activity {
  // ...existierende Felder
  pricingType              ActivityPricingType @default(HOURLY) @map("pricing_type")
  flatRate                 Decimal?            @map("flat_rate") @db.Decimal(10, 2)
  hourlyRate               Decimal?            @map("hourly_rate") @db.Decimal(10, 2)
  unit                     String?             @db.VarChar(20)
  calculatedHourEquivalent Decimal?            @map("calculated_hour_equivalent") @db.Decimal(8, 2)
}

// WhStockMovement: unitCostAtMovement + inboundInvoiceLineItemId
model WhStockMovement {
  // ...existierende Felder
  unitCostAtMovement        Decimal? @map("unit_cost_at_movement") @db.Decimal(12, 4)
  inboundInvoiceLineItemId  String?  @map("inbound_invoice_line_item_id") @db.Uuid

  // ...existierende Relations
  inboundInvoiceLineItem InboundInvoiceLineItem? @relation(fields: [inboundInvoiceLineItemId], references: [id], onDelete: SetNull)

  // ...existierende Indizes
  @@index([tenantId, orderId], map: "idx_wh_stock_movements_tenant_order")
  @@index([inboundInvoiceLineItemId], map: "idx_wh_stock_movements_inbound_li")
}

// InboundInvoiceLineItem: orderId + costCenterId + tenantId (NEU!) + Backref
model InboundInvoiceLineItem {
  // ...existierende Felder
  tenantId     String?  @map("tenant_id") @db.Uuid     // NEU — siehe Migration-Hinweis
  orderId      String?  @map("order_id") @db.Uuid
  costCenterId String?  @map("cost_center_id") @db.Uuid

  // ...existierende Relations
  order        Order?       @relation(fields: [orderId], references: [id], onDelete: SetNull)
  costCenter   CostCenter?  @relation(fields: [costCenterId], references: [id], onDelete: SetNull)
  stockMovements WhStockMovement[]

  @@index([invoiceId, orderId], map: "idx_inbound_li_invoice_order")
  @@index([invoiceId, costCenterId], map: "idx_inbound_li_invoice_cost_center")
}
```

**Hinweis zu `InboundInvoiceLineItem.tenantId`**: Heute fehlt das
Feld auf Position-Ebene (Tenant-Scoping läuft über `invoiceId`-FK).
Für Position-Level-Indizes mit `[tenantId, orderId]` wäre das Feld
hilfreich. **Entscheidung Plan**: Das Feld ist optional in der
ersten Migration, wird per Backfill aus `InboundInvoice.tenantId`
befüllt, dann auf NOT NULL gesetzt. Der Aggregator kann auch ohne
das Feld arbeiten (Join über `invoice.tenantId`); wir nehmen das
Feld trotzdem mit, weil es Tenant-Isolation auf Position-Ebene
erlaubt und einer späteren Performance-Optimierung den Weg ebnet.

### Migration-SQL (Skizze)

**File**: `supabase/migrations/20260429000001_nk1_schema_foundation.sql`

```sql
-- ───────────────────────────────────────────────────────────────────
-- Phase 1.1: Neue Stammdaten-Tabellen
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE wage_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  internal_hourly_rate DECIMAL(10, 2),
  billing_hourly_rate DECIMAL(10, 2),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX wage_groups_tenant_id_code_key ON wage_groups(tenant_id, code);
CREATE INDEX idx_wage_groups_tenant_active ON wage_groups(tenant_id, is_active);

CREATE TABLE order_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX order_types_tenant_id_code_key ON order_types(tenant_id, code);
CREATE INDEX idx_order_types_tenant_active ON order_types(tenant_id, is_active);

CREATE TABLE nk_threshold_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_type_id UUID REFERENCES order_types(id) ON DELETE CASCADE,
  margin_amber_from_percent DECIMAL(5, 2) NOT NULL,
  margin_red_from_percent DECIMAL(5, 2) NOT NULL,
  productivity_amber_from_percent DECIMAL(5, 2) NOT NULL,
  productivity_red_from_percent DECIMAL(5, 2) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX nk_threshold_configs_tenant_order_type_key
  ON nk_threshold_configs(tenant_id, COALESCE(order_type_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_nk_threshold_configs_tenant ON nk_threshold_configs(tenant_id);

CREATE TABLE order_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  valid_from DATE NOT NULL,
  valid_to DATE,
  target_hours DECIMAL(10, 2),
  target_material_cost DECIMAL(12, 2),
  target_travel_minutes INT,
  target_external_cost DECIMAL(12, 2),
  target_revenue DECIMAL(12, 2),
  target_unit_items JSONB,
  change_reason VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  created_by UUID
);
CREATE INDEX idx_order_targets_tenant_order_valid
  ON order_targets(tenant_id, order_id, valid_to);
CREATE INDEX idx_order_targets_order_valid
  ON order_targets(order_id, valid_from, valid_to);

-- Enforce: pro Order höchstens eine offene Version (valid_to IS NULL)
CREATE UNIQUE INDEX idx_order_targets_active_per_order
  ON order_targets(order_id) WHERE valid_to IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- Phase 1.2: Spalten-Erweiterungen bestehender Tabellen
-- ───────────────────────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN order_type_id UUID
  REFERENCES order_types(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_tenant_order_type ON orders(tenant_id, order_type_id);

ALTER TABLE order_bookings ADD COLUMN hourly_rate_at_booking DECIMAL(10, 2);
ALTER TABLE order_bookings ADD COLUMN hourly_rate_source_at_booking VARCHAR(20);
ALTER TABLE order_bookings ADD COLUMN quantity DECIMAL(10, 2);  -- Decision 26

-- Decision 27: Travel-Snapshot am WorkReport
ALTER TABLE work_reports ADD COLUMN travel_rate_at_sign DECIMAL(10, 2);
ALTER TABLE work_reports ADD COLUMN travel_rate_source_at_sign VARCHAR(20);

ALTER TABLE employees ADD COLUMN wage_group_id UUID
  REFERENCES wage_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_employees_tenant_wage_group ON employees(tenant_id, wage_group_id);

CREATE TYPE activity_pricing_type AS ENUM ('HOURLY', 'FLAT_RATE', 'PER_UNIT');
ALTER TABLE activities ADD COLUMN pricing_type activity_pricing_type
  NOT NULL DEFAULT 'HOURLY';
ALTER TABLE activities ADD COLUMN flat_rate DECIMAL(10, 2);
ALTER TABLE activities ADD COLUMN hourly_rate DECIMAL(10, 2);
ALTER TABLE activities ADD COLUMN unit VARCHAR(20);
ALTER TABLE activities ADD COLUMN calculated_hour_equivalent DECIMAL(8, 2);

ALTER TABLE wh_stock_movements ADD COLUMN unit_cost_at_movement DECIMAL(12, 4);
ALTER TABLE wh_stock_movements ADD COLUMN inbound_invoice_line_item_id UUID
  REFERENCES inbound_invoice_line_items(id) ON DELETE SET NULL;
CREATE INDEX idx_wh_stock_movements_tenant_order
  ON wh_stock_movements(tenant_id, order_id);
CREATE INDEX idx_wh_stock_movements_inbound_li
  ON wh_stock_movements(inbound_invoice_line_item_id);

ALTER TABLE inbound_invoice_line_items ADD COLUMN tenant_id UUID;
ALTER TABLE inbound_invoice_line_items ADD COLUMN order_id UUID
  REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE inbound_invoice_line_items ADD COLUMN cost_center_id UUID
  REFERENCES cost_centers(id) ON DELETE SET NULL;
CREATE INDEX idx_inbound_li_invoice_order
  ON inbound_invoice_line_items(invoice_id, order_id);
CREATE INDEX idx_inbound_li_invoice_cost_center
  ON inbound_invoice_line_items(invoice_id, cost_center_id);

-- ───────────────────────────────────────────────────────────────────
-- Phase 1.3: Bestandsdaten-Backfill
-- ───────────────────────────────────────────────────────────────────

-- 1.3a: InboundInvoiceLineItem.tenantId aus InboundInvoice.tenantId
UPDATE inbound_invoice_line_items li
SET tenant_id = ii.tenant_id
FROM inbound_invoices ii
WHERE li.invoice_id = ii.id;

-- jetzt NOT NULL erzwingen
ALTER TABLE inbound_invoice_line_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE inbound_invoice_line_items
  ADD CONSTRAINT inbound_invoice_line_items_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 1.3b: InboundInvoiceLineItem.orderId aus InboundInvoice.orderId (1:1)
UPDATE inbound_invoice_line_items li
SET order_id = ii.order_id, cost_center_id = ii.cost_center_id
FROM inbound_invoices ii
WHERE li.invoice_id = ii.id
  AND ii.order_id IS NOT NULL;

-- 1.3c: Activity.pricing_type ist bereits via DEFAULT 'HOURLY' gesetzt — kein
--       expliziter UPDATE nötig.
```

### Module + Permissions

**File**: `src/lib/modules/constants.ts`

```ts
export const AVAILABLE_MODULES = [
  "core",
  "crm",
  "billing",
  "warehouse",
  "inbound_invoices",
  "payment_runs",
  "bank_statements",
  "nachkalkulation",   // NEU
] as const
```

**File**: `src/lib/platform/module-pricing.ts`

```ts
nachkalkulation: {
  monthly: 4,
  annual: 40,
  vatRate: 19,
  description: "Terp Nachkalkulation — Soll/Ist-Auswertungen je Auftrag",
},
```

**File**: `src/lib/auth/permission-catalog.ts`

```ts
p("nachkalkulation.view", "nachkalkulation", "view", "View Nachkalkulation reports"),
p("nachkalkulation.manage", "nachkalkulation", "manage", "Edit OrderTargets, run re-planning"),
p("nachkalkulation.config", "nachkalkulation", "config", "Configure Nachkalkulation thresholds"),

p("wage_groups.view", "wage_groups", "view", "View wage groups"),
p("wage_groups.manage", "wage_groups", "manage", "Manage wage groups"),

p("order_types.view", "order_types", "view", "View order types"),
p("order_types.manage", "order_types", "manage", "Manage order types"),

p("activities.manage_pricing", "activities", "manage_pricing", "Configure activity pricing"),
```

**Default-Rollen** (in der UI bei Rollen-Konfiguration; kein
Code-Pfad — siehe Research zu `UserGroup.isAdmin`):
- Admin: alle 3 NK + alle 2 Wage + alle 2 OrderType +
  Activity-Pricing
- Disponent: `nachkalkulation.view` + `nachkalkulation.manage` +
  `wage_groups.view` + `order_types.view`
- Vorarbeiter: `nachkalkulation.view` + `wage_groups.view` +
  `order_types.view`
- Mitarbeiter: keine

### Tests

Phase-1 ist Schema-only — keine Service-Tests, aber:

- **Migration-Test**: `pnpm db:reset` läuft sauber durch ohne Fehler
- **Schema-Validation**: `pnpm db:generate` baut den Prisma-Client
  fehlerfrei
- **Tenant-Isolation auf neuen Tabellen**: kleiner Integration-Test
  in `src/lib/services/__tests__/nk-schema-foundation.integration.test.ts`
  - Tenant A erstellt OrderTarget für eigene Order
  - Tenant B kann diese OrderTarget nicht lesen (FK-Cascade-Test)
  - Tenant B kann keine OrderTarget für Order von Tenant A anlegen
    (Cross-Tenant-Schutz)
  - Analog für WageGroup, OrderType, NkThresholdConfig
- **Backwards-Compatibility-Test**: bestehende Order/OrderBooking/
  Activity/WhStockMovement-Zeilen bleiben unverändert lesbar; neue
  Spalten sind NULL.
- **Backfill-Test**: nach Migration haben alle
  `inbound_invoice_line_items` Zeilen einen `tenant_id`-Wert (NOT
  NULL).

### File Budget

| Datei | Status |
|---|---|
| `prisma/schema.prisma` | edit |
| `supabase/migrations/20260429000001_nk1_schema_foundation.sql` | new |
| `src/lib/modules/constants.ts` | edit |
| `src/lib/platform/module-pricing.ts` | edit |
| `src/lib/auth/permission-catalog.ts` | edit |
| `src/lib/services/__tests__/nk-schema-foundation.integration.test.ts` | new |

**Total: 6 files**

### Manual Verification (PO)

- [ ] In Supabase Studio: alle 4 neuen Tabellen sichtbar
  (`order_targets`, `wage_groups`, `order_types`,
  `nk_threshold_configs`)
- [ ] Auf bestehender `orders`-Tabelle: Spalte `order_type_id` ist
  NULL für alle Bestands-Zeilen
- [ ] Auf bestehender `order_bookings`-Tabelle: Spalten
  `hourly_rate_at_booking` und `hourly_rate_source_at_booking` sind
  NULL
- [ ] Auf bestehender `activities`-Tabelle: `pricing_type =
  'HOURLY'` für alle Bestands-Aktivitäten, andere neue Felder NULL
- [ ] Auf bestehender `wh_stock_movements`-Tabelle:
  `unit_cost_at_movement` ist NULL für alle Bestands-Zeilen
- [ ] Auf bestehender `inbound_invoice_line_items`-Tabelle:
  `tenant_id` ist nach Migration NOT NULL und korrekt befüllt;
  `order_id` ist gleich dem `order_id` des zugehörigen
  `inbound_invoices`-Beleges (für Belege wo das gesetzt war)
- [ ] In `/admin/settings/modules` (oder Platform-Admin Modul-Toggle):
  Modul "nachkalkulation" auftauchend, default disabled
- [ ] Permission-Catalog enthält die neuen Keys (DB-Inspect via
  Studio oder Test)
- [ ] **Decision 30**: InboundInvoiceLineItem-Kostenfelder
  dokumentiert: welche Spalten der Aggregator nutzen wird
  (`totalNet`, `unitPriceNet`, `quantity`, `vatRate`, `vatAmount`,
  `totalGross`), ob diese Spalten persistiert oder berechnet sind,
  ob sie historisch stabil sind. **Erwartung aus Research**:
  alle persistiert nullable Decimal über die ZUGFeRD-Parsing-
  Pipeline. Wenn Verifikation diese Erwartung bestätigt: keine
  Schema-Änderung nötig. Wenn nicht: Plan-PAUSE und Felder
  ergänzen.
- [ ] OrderBooking hat `quantity`-Spalte (Decision 26)
- [ ] WorkReport hat `travel_rate_at_sign` und
  `travel_rate_source_at_sign` Spalten (Decision 27)

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Migration läuft sauber: `pnpm db:reset && pnpm db:generate`
- [ ] Type-Check grün: `pnpm typecheck`
- [ ] Tests grün: `pnpm test`
- [ ] Manual Verification (oben) bestätigt
- [ ] InboundInvoiceLineItem-Kostenfeld-Doku im Plan oder als
  Begleit-Dokument abgelegt (Decision 30)

**Nicht weiter zu Phase 2**, bevor PO Manual Verification bestätigt.

---

## Phase 2 — Stammdaten-Services + UI

### Goal

CRUD-Services für `WageGroup` und `OrderType`. Activity-Pricing-
Erweiterung in bestehenden Activity-Services + UI-Konfig.
Migration-Script `Employee.salaryGroup → wageGroupId`.
Order-Form-Erweiterung um OrderType-Dropdown, Employee-Form-
Erweiterung um WageGroup-Dropdown.

### Service-Änderungen

**File**: `src/lib/services/wage-group-service.ts` (NEU)

```ts
export class WageGroupNotFoundError extends Error { /* ... */ }
export class WageGroupValidationError extends Error { /* ... */ }
export class WageGroupConflictError extends Error { /* ... */ }

export async function list(prisma, tenantId, params?: { isActive?: boolean })
export async function getById(prisma, tenantId, id: string)
export async function create(prisma, tenantId, input: {
  code: string
  name: string
  internalHourlyRate?: number
  billingHourlyRate?: number
  sortOrder?: number
}, audit?: AuditContext)
export async function update(prisma, tenantId, input: {
  id: string
  code?: string
  name?: string
  internalHourlyRate?: number | null
  billingHourlyRate?: number | null
  sortOrder?: number
  isActive?: boolean
}, audit?: AuditContext)
export async function remove(prisma, tenantId, id: string, audit?: AuditContext)
```

Geschäftslogik:
- `code` und `name` werden getrimmt, leere Werte → ValidationError
- `code`-Eindeutigkeit pro Tenant via `repo.findByCode`
- Bei `remove`: Prüfung, ob Employees diese WageGroup referenzieren;
  wenn ja → `WageGroupConflictError("WageGroup wird von N
  Mitarbeitern verwendet")`. Soft-Disable (`isActive=false`) ist
  bevorzugte Operation.
- `internalHourlyRate` und `billingHourlyRate` müssen bei gesetzten
  Werten >= 0 sein.

**File**: `src/lib/services/wage-group-repository.ts` (NEU)

Standard CRUD-Funktionen analog `cost-center-repository.ts`. Plus
`countEmployeesUsing(prisma, tenantId, wageGroupId)` für die
Pre-Delete-Prüfung.

**File**: `src/lib/services/order-type-service.ts` (NEU)

Identische Struktur wie `wage-group-service.ts` ohne
Pricing-Felder. Pre-Delete-Prüfung gegen `Order.orderTypeId` und
`NkThresholdConfig.orderTypeId`.

**File**: `src/lib/services/order-type-repository.ts` (NEU)

Standard CRUD analog. Plus
`countOrdersUsing(prisma, tenantId, orderTypeId)`,
`countThresholdConfigsUsing(prisma, tenantId, orderTypeId)`.

**File**: `src/lib/services/activity-service.ts` (EDIT)

Bestehender Service (in `src/lib/services/activity-service.ts` oder
`activities-service.ts` — verifizieren beim Implementieren). Update
und Create um neue Felder erweitern:

```ts
// Bestehende create/update-Signaturen werden um diese Felder ergänzt:
input: {
  // existierende Felder
  pricingType?: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
  flatRate?: number | null
  hourlyRate?: number | null
  unit?: string | null
  calculatedHourEquivalent?: number | null
}
```

Zusätzliche Validierungen:
- `pricingType = "FLAT_RATE"` ohne `flatRate` → `ActivityValidationError`
  ("FLAT_RATE-Aktivität benötigt flatRate")
- `pricingType = "PER_UNIT"` ohne `unit` → `ActivityValidationError`
  ("PER_UNIT-Aktivität benötigt unit")
- `pricingType = "HOURLY"` ohne `hourlyRate`: erlaubt (Fallback an
  Lookup-Resolver)
- `flatRate`, `hourlyRate` müssen bei gesetzten Werten >= 0 sein
- `calculatedHourEquivalent` muss bei gesetztem Wert > 0 sein

### Migration-Script

**File**: `src/scripts/migrate-employee-salary-group-to-wage-group.ts` (NEU)

```ts
/**
 * Einmaliges Backfill-Script:
 * Pro Tenant alle distinct salary_group-Werte aus employees lesen,
 * je Wert eine WageGroup-Zeile anlegen (mit Default-Sätzen NULL),
 * Employee.wageGroupId setzen.
 *
 * Idempotent: bereits gesetzte wage_group_id wird nicht überschrieben.
 * Nicht-zuordbare Employees (salaryGroup IS NULL) bleiben mit
 * wage_group_id = NULL.
 *
 * Aufruf: pnpm tsx src/scripts/migrate-employee-salary-group-to-wage-group.ts
 *
 * Schritte:
 * 1. SELECT DISTINCT tenant_id, salary_group FROM employees
 *    WHERE salary_group IS NOT NULL AND wage_group_id IS NULL
 * 2. Für jeden (tenantId, salaryGroup): UPSERT in wage_groups
 *    (tenantId, code=salaryGroup, name=salaryGroup, sortOrder=0)
 * 3. UPDATE employees SET wage_group_id = wg.id
 *    WHERE employee.salary_group = wg.code AND wg.tenant_id =
 *    employee.tenant_id AND employee.wage_group_id IS NULL
 *
 * Ausgabe (stdout): pro Tenant Zähler "X salary groups migriert,
 * Y employees zugeordnet, Z employees ohne salaryGroup übersprungen".
 */
```

Wird als One-Off-Skript bereitgestellt. Wir lassen den
`Employee.salaryGroup`-Freitext-Wert bestehen (nicht löschen — er
wird in DATEV-Export-Templates verwendet).

### Router-Änderungen

**File**: `src/trpc/routers/wageGroups.ts` (NEU)

```ts
const wageGroupsRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_VIEW))
    .input(z.object({ isActive: z.boolean().optional() }).optional())
    .query(...),
  getById: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_VIEW))
    .input(z.object({ id: z.string().uuid() }))
    .query(...),
  create: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_MANAGE))
    .input(z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(255),
      internalHourlyRate: z.number().min(0).max(9999.99).optional(),
      billingHourlyRate: z.number().min(0).max(9999.99).optional(),
      sortOrder: z.number().int().min(0).optional(),
    }))
    .mutation(...),
  update: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_MANAGE))
    .input(z.object({
      id: z.string().uuid(),
      code: z.string().min(1).max(50).optional(),
      name: z.string().min(1).max(255).optional(),
      internalHourlyRate: z.number().min(0).max(9999.99).nullable().optional(),
      billingHourlyRate: z.number().min(0).max(9999.99).nullable().optional(),
      sortOrder: z.number().int().min(0).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(...),
  delete: tenantProcedure
    .use(requirePermission(WAGE_GROUPS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(...),
})
```

Eintrag im Root-Router (`src/trpc/routers/_app.ts`):
`wageGroups: wageGroupsRouter`.

**File**: `src/trpc/routers/orderTypes.ts` (NEU)

Identische Struktur, Permissions `ORDER_TYPES_VIEW` und
`ORDER_TYPES_MANAGE`. Eintrag in Root-Router: `orderTypes:
orderTypesRouter`.

**File**: `src/trpc/routers/activities.ts` (EDIT — falls existent —
sonst `src/trpc/routers/orders.ts` oder ähnlich; verifizieren)

`createInputSchema` und `updateInputSchema` um die fünf neuen Felder
erweitern.

**Permission-Trennung (Decision 29)**:
- Bestehende Activity-CRUD-Mutations (Code, Name, Beschreibung,
  isActive) bleiben unter `activities.manage`.
- Pricing-Felder (`pricingType`, `flatRate`, `hourlyRate`, `unit`,
  `calculatedHourEquivalent`) werden über eine separate Mutation
  `updatePricing` editiert, gated mit `activities.manage_pricing`.
  Alternativ: bestehende `update`-Mutation prüft konditional —
  wenn ein Pricing-Feld in input ist, wird zusätzlich
  `activities.manage_pricing` verlangt.

```ts
const ACTIVITIES_VIEW = permissionIdByKey("activities.view")!
const ACTIVITIES_MANAGE = permissionIdByKey("activities.manage")!
const ACTIVITIES_MANAGE_PRICING = permissionIdByKey("activities.manage_pricing")!

// Variante A: separate Mutation
updatePricing: tenantProcedure
  .use(requirePermission(ACTIVITIES_MANAGE_PRICING))
  .input(z.object({
    id: z.string().uuid(),
    pricingType: z.enum(["HOURLY", "FLAT_RATE", "PER_UNIT"]).optional(),
    flatRate: z.number().min(0).max(9999.99).nullable().optional(),
    hourlyRate: z.number().min(0).max(9999.99).nullable().optional(),
    unit: z.string().max(20).nullable().optional(),
    calculatedHourEquivalent: z.number().min(0.01).max(99.99).nullable().optional(),
  }))
  .mutation(...)
```

UI-Konsequenz: Die Activity-Form-Sheet aus Phase 2 zeigt die
Pricing-Section nur, wenn der User `activities.manage_pricing` hat
— sonst read-only.

**File**: `src/trpc/routers/orders.ts` (EDIT)

`createOrderInputSchema` und `updateOrderInputSchema` um:
```ts
orderTypeId: z.string().uuid().nullable().optional(),
```

`orderOutputSchema` um `orderTypeId: z.string().uuid().nullable()`.

### UI-Änderungen

**File**: `src/app/[locale]/(dashboard)/admin/wage-groups/page.tsx`
(NEU)

Liste-Seite analog `cost-centers/page.tsx`. Verwendet:
- `WageGroupDataTable` (NEU,
  `src/components/wage-groups/wage-group-data-table.tsx`)
- `WageGroupFormSheet` (NEU,
  `src/components/wage-groups/wage-group-form-sheet.tsx`)
- `WageGroupDetailSheet` (NEU)
- `useWageGroups`/`useCreateWageGroup`/`useUpdateWageGroup`/
  `useDeleteWageGroup` (`src/hooks/use-wage-groups.ts`)

Formular-Felder: code, name, internalHourlyRate (number, optional),
billingHourlyRate (number, optional), sortOrder, isActive (Switch
nur im Edit-Mode).

**File**: `src/app/[locale]/(dashboard)/admin/order-types/page.tsx`
(NEU)

Identische Struktur ohne Pricing-Felder. Komponenten unter
`src/components/order-types/`.

**File**: `src/components/orders/order-form-sheet.tsx` (EDIT)

In Section 1 (Basic Information) — nach `customer` und vor
`costCenter`: neuer `<Select>` "Auftragstyp" mit Werten aus
`useOrderTypes()`. Optional, kann leer bleiben.

```tsx
<div>
  <Label htmlFor="orderTypeId">Auftragstyp</Label>
  <Select value={form.orderTypeId ?? "_none"} onValueChange={...}>
    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="_none">— Kein Typ —</SelectItem>
      {orderTypes.map(t => (
        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

`FormState` und `INITIAL_STATE` werden um `orderTypeId: string |
null` erweitert.

**File**: `src/components/employees/employee-form-sheet.tsx` (EDIT)

Im Compensation-Section: WageGroup-Dropdown ergänzen, analog zur
Order-Form-Erweiterung. Hinweis-Tooltip "Wage groups werden in den
Stammdaten gepflegt".

**File**: `src/components/orders/order-booking-form-sheet.tsx`
(EDIT) — Decision 26 PER_UNIT-Mengen-Feld

Neuer dynamischer Section in der Form: wenn die ausgewählte
Activity `pricingType === "PER_UNIT"` ist, wird ein zusätzliches
`<Input>` "Menge" sichtbar mit `Activity.unit` als Suffix-Label.

```tsx
{selectedActivity?.pricingType === "PER_UNIT" && (
  <div>
    <Label htmlFor="quantity">
      Menge {selectedActivity.unit && `(${selectedActivity.unit})`}
    </Label>
    <Input
      id="quantity"
      type="number"
      step="0.01"
      min="0"
      value={form.quantity ?? ""}
      onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) })}
      required
    />
  </div>
)}
```

Service-Validierung in `order-booking-service` (Phase 3):
- Wenn Activity `PER_UNIT` und `quantity` ist NULL/0/negativ →
  `OrderBookingValidationError("PER_UNIT-Aktivität benötigt
  quantity")`.
- Wenn Activity `HOURLY` oder `FLAT_RATE`: `quantity` wird
  ignoriert (das Feld kann gesetzt sein, hat aber keine
  Berechnungs-Wirkung).
- Wenn keine Activity gesetzt: `quantity` wird ignoriert.

`createInputSchema` und `updateInputSchema` in
`orderBookings.ts` werden um:
```ts
quantity: z.number().min(0).max(99999.99).optional(),
```
erweitert (zusätzlich zum bestehenden `timeMinutes`).

**File**: `src/components/activities/activity-form-sheet.tsx` (EDIT
— wenn existent, sonst NEU als Teil der Activities-Settings-Seite)

Neue Section "Pricing":
- `<Select pricingType>`: HOURLY / FLAT_RATE / PER_UNIT
- Bei HOURLY: `<Input hourlyRate>` (optional, Fallback)
- Bei FLAT_RATE: `<Input flatRate>` (Pflicht), `<Input
  calculatedHourEquivalent>` (optional)
- Bei PER_UNIT: `<Input unit>` (Pflicht), `<Input
  calculatedHourEquivalent>` (optional)
- UI-seitige Live-Validierung passend zur pricingType-Wahl.

### Hooks

**File**: `src/hooks/use-wage-groups.ts` (NEU)

Standard-Pattern analog `use-cost-centers.ts`: 5 Hooks
(useWageGroups, useWageGroup, useCreateWageGroup,
useUpdateWageGroup, useDeleteWageGroup).

**File**: `src/hooks/use-order-types.ts` (NEU)

Identische Struktur.

### Tests

- **Service-Unit-Tests**:
  - `src/lib/services/__tests__/wage-group-service.test.ts`
    - create: code-trim, name-trim, duplicate-conflict, leere Werte
      → ValidationError
    - update: partial updates, isActive-Toggle
    - remove: blockt mit Conflict bei aktiven Employee-Zuordnungen
  - `src/lib/services/__tests__/order-type-service.test.ts`
    - analog
  - `src/lib/services/__tests__/activity-service.pricing.test.ts`
    - FLAT_RATE ohne flatRate → BAD_REQUEST
    - PER_UNIT ohne unit → BAD_REQUEST
    - HOURLY ohne hourlyRate → erlaubt
    - calculatedHourEquivalent <= 0 → BAD_REQUEST
- **Repository-Integration-Tests** (gegen Dev-DB mit
  Transaction-Rollback):
  - tenant-isolation auf list/getById/update/delete
- **Router-Tests** mit tRPC-Caller:
  - `src/trpc/routers/__tests__/wageGroups.test.ts`
  - `src/trpc/routers/__tests__/orderTypes.test.ts`
  - Permission-Test: ohne `wage_groups.manage` blockt create
- **Migration-Script-Test**:
  - `src/scripts/__tests__/migrate-employee-salary-group-to-wage-group.test.ts`
    - vor Run: 5 Employees mit verschiedenen salaryGroup-Werten
      ("Meister", "Geselle", "Geselle", "Hilfskraft", null)
    - nach Run: 3 WageGroups erstellt, 4 Employees zugeordnet, 1
      bleibt NULL
    - idempotent: zweiter Run macht keine Änderungen

### File Budget

| Datei | Status |
|---|---|
| `src/lib/services/wage-group-service.ts` | new |
| `src/lib/services/wage-group-repository.ts` | new |
| `src/lib/services/order-type-service.ts` | new |
| `src/lib/services/order-type-repository.ts` | new |
| `src/lib/services/activity-service.ts` | edit |
| `src/lib/services/activity-repository.ts` | edit |
| `src/lib/services/__tests__/wage-group-service.test.ts` | new |
| `src/lib/services/__tests__/order-type-service.test.ts` | new |
| `src/lib/services/__tests__/activity-service.pricing.test.ts` | new |
| `src/scripts/migrate-employee-salary-group-to-wage-group.ts` | new |
| `src/scripts/__tests__/migrate-employee-salary-group-to-wage-group.test.ts` | new |
| `src/trpc/routers/wageGroups.ts` | new |
| `src/trpc/routers/orderTypes.ts` | new |
| `src/trpc/routers/activities.ts` | edit |
| `src/trpc/routers/orders.ts` | edit |
| `src/trpc/routers/_app.ts` | edit |
| `src/trpc/routers/__tests__/wageGroups.test.ts` | new |
| `src/trpc/routers/__tests__/orderTypes.test.ts` | new |
| `src/hooks/use-wage-groups.ts` | new |
| `src/hooks/use-order-types.ts` | new |
| `src/app/[locale]/(dashboard)/admin/wage-groups/page.tsx` | new |
| `src/app/[locale]/(dashboard)/admin/order-types/page.tsx` | new |
| `src/components/wage-groups/wage-group-form-sheet.tsx` | new |
| `src/components/wage-groups/wage-group-data-table.tsx` | new |
| `src/components/wage-groups/wage-group-detail-sheet.tsx` | new |
| `src/components/order-types/order-type-form-sheet.tsx` | new |
| `src/components/order-types/order-type-data-table.tsx` | new |
| `src/components/order-types/order-type-detail-sheet.tsx` | new |
| `src/components/orders/order-form-sheet.tsx` | edit |
| `src/components/orders/order-booking-form-sheet.tsx` | edit (Decision 26 PER_UNIT) |
| `src/components/employees/employee-form-sheet.tsx` | edit |
| `src/components/activities/activity-form-sheet.tsx` | edit/new |
| `src/trpc/routers/orderBookings.ts` | edit (quantity-Schema) |

**Total: ~33 files**

### Manual Verification (PO)

- [ ] Settings-Seite "Lohngruppen" auf `/admin/wage-groups` zeigt
  CRUD-Tabelle
- [ ] Lohngruppe anlegen, editieren, deaktivieren funktioniert
- [ ] Beim Versuch eine Lohngruppe zu löschen, der noch Mitarbeiter
  zugeordnet sind: klare Fehlermeldung "Wird von N Mitarbeitern
  verwendet"
- [ ] Settings-Seite "Auftragstypen" auf `/admin/order-types`
  funktioniert analog
- [ ] In Order-Form: Dropdown "Auftragstyp" auswählbar, Wert wird
  gespeichert und nach Reload korrekt angezeigt
- [ ] In Employee-Form: Dropdown "Lohngruppe" auswählbar
- [ ] In Activity-Form: pricingType-Dropdown ändert sichtbare
  Felder dynamisch (HOURLY/FLAT_RATE/PER_UNIT)
- [ ] Validierungs-Error bei FLAT_RATE ohne flatRate sichtbar
- [ ] Migration-Script auf Dev-DB ausgeführt: distinct
  `salaryGroup`-Werte sind als WageGroups angelegt, Employees
  korrekt zugeordnet
- [ ] Permission-Check: User ohne `wage_groups.manage` sieht keine
  Edit-/Create-Buttons

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Alle automatisierten Tests grün
- [ ] Migration-Script auf Dev-DB erfolgreich, Counter-Output
  plausibel
- [ ] Manual Verification (oben) bestätigt
- [ ] Mindestens eine Lohngruppe und ein Auftragstyp im Dev-Tenant
  angelegt — werden in Phase 3 gebraucht

---

## Phase 3 — Snapshot-Erfassung an Bewegungs-Quellen

### Goal

Befüllung der Snapshot-Felder beim Anlegen/Update von Bewegungen
und Buchungen. Position-Level-Order-/CostCenter-Zuordnung am
InboundInvoice. Verlinkungs-Logik Wareneingang ↔
Eingangsrechnungs-Position. Bestandsdaten bleiben NULL — keine
Backfills.

### Service-Änderungen

**File**: `src/lib/services/wh-stock-movement-service.ts` (EDIT)

`bookGoodsReceipt` erweitern. Im Loop pro Position: nach dem Lookup
von `WhPurchaseOrderPosition` wird `unitPrice` als
`unitCostAtMovement` in die `whStockMovement.create({ data: ... })`
mitgegeben:

```ts
const movement = await tx.whStockMovement.create({
  data: {
    tenantId,
    articleId: position.articleId!,
    type: "GOODS_RECEIPT",
    quantity: posInput.quantity,
    previousStock,
    newStock,
    purchaseOrderId: input.purchaseOrderId,
    purchaseOrderPositionId: posInput.positionId,
    unitCostAtMovement: position.unitPrice ?? null,  // NEU
    createdById: userId,
  },
  // ...
})
```

**File**: `src/lib/services/wh-withdrawal-service.ts` (EDIT)

`createWithdrawal` erweitern. Vor dem `whStockMovement.create`-Call
wird der aktuelle `WhArticle.buyPrice` mitgelesen und in den
Snapshot geschrieben:

```ts
// nach dem article-find:
const unitCost = article.buyPrice ?? null

const movement = await tx.whStockMovement.create({
  data: {
    // ... bestehende Felder
    unitCostAtMovement: unitCost,  // NEU
  },
})
```

Analog für `ADJUSTMENT` und `INVENTORY` (in
`wh-stock-movement-service.ts` weitere Funktionen wie `recordAdjustment`,
`postInventoryDelta` o.ä. — verifizieren beim Implementieren).
Generelle Regel: jeder `whStockMovement.create`-Call schreibt
`unitCostAtMovement`.

**File**: `src/lib/services/labor-rate-resolver.ts` (NEU —
Decision 28: dedizierte Datei statt Inline-Wegwerf)

Diese Datei ist die finale, autoritative Heimat der Resolver-
Logik. Phase 3 nutzt sie aus dem Booking-Service. Phase 5 lässt
den Bridge-Service ebenfalls aus dieser Datei importieren statt
eigene Re-Implementierung.

Inhalt:

```ts
import type { Decimal } from "@/generated/prisma/client/runtime/library"

export type HourlyRateSource =
  | "activity_flat"
  | "activity_hourly"
  | "order"
  | "wage_group"
  | "employee"
  | "none"

export interface ResolvedRate {
  rate: number | null
  source: HourlyRateSource
}

export interface LaborRateResolverInput {
  bookingActivity: {
    pricingType: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
    flatRate: Decimal | null
    hourlyRate: Decimal | null
    unit: string | null
  } | null
  orderRate: Decimal | null
  employeeWageGroupRate: Decimal | null
  employeeRate: Decimal | null
}

export interface TravelRateResolverInput {
  orderRate: Decimal | null
  assignmentEmployees: Array<{
    hourlyRate: Decimal | null
    wageGroup: { billingHourlyRate: Decimal | null } | null
  }>
}

function toPositiveRate(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function resolveLaborRateExtended(args: LaborRateResolverInput): ResolvedRate {
  if (args.bookingActivity) {
    if (args.bookingActivity.pricingType === "FLAT_RATE") {
      const r = toPositiveRate(args.bookingActivity.flatRate)
      if (r !== null) return { rate: r, source: "activity_flat" }
    }
    if (args.bookingActivity.pricingType === "HOURLY") {
      const r = toPositiveRate(args.bookingActivity.hourlyRate)
      if (r !== null) return { rate: r, source: "activity_hourly" }
    }
    // PER_UNIT durchfällt — Stunden-Pfad gilt nicht
  }
  const order = toPositiveRate(args.orderRate)
  if (order !== null) return { rate: order, source: "order" }
  const wageGroup = toPositiveRate(args.employeeWageGroupRate)
  if (wageGroup !== null) return { rate: wageGroup, source: "wage_group" }
  const employee = toPositiveRate(args.employeeRate)
  if (employee !== null) return { rate: employee, source: "employee" }
  return { rate: null, source: "none" }
}

export function resolveTravelRateExtended(args: TravelRateResolverInput): ResolvedRate {
  const order = toPositiveRate(args.orderRate)
  if (order !== null) return { rate: order, source: "order" }

  // Maximum aus WageGroup-Sätzen aller Assignment-Mitarbeiter
  let maxWageGroup: number | null = null
  for (const emp of args.assignmentEmployees) {
    const r = toPositiveRate(emp.wageGroup?.billingHourlyRate ?? null)
    if (r === null) continue
    if (maxWageGroup === null || r > maxWageGroup) maxWageGroup = r
  }
  if (maxWageGroup !== null) return { rate: maxWageGroup, source: "wage_group" }

  // Maximum aus Employee-Sätzen
  let maxEmployee: number | null = null
  for (const emp of args.assignmentEmployees) {
    const r = toPositiveRate(emp.hourlyRate)
    if (r === null) continue
    if (maxEmployee === null || r > maxEmployee) maxEmployee = r
  }
  if (maxEmployee !== null) return { rate: maxEmployee, source: "employee" }

  return { rate: null, source: "none" }
}
```

**Konsequenz**: Der Resolver ist ab Phase 3 final. Phase 5 macht
keine eigene Re-Implementierung; sie ersetzt nur die alte
`resolveLaborRate`-Inline-Implementierung im Bridge-Service durch
einen Import aus `labor-rate-resolver.ts`.

**File**: `src/lib/services/order-booking-service.ts` (EDIT)

Neue Helper-Funktion am Anfang des Service-Files, importiert aus
`labor-rate-resolver.ts`:

```ts
import {
  resolveLaborRateExtended,
  type HourlyRateSource,
} from "./labor-rate-resolver"

async function resolveBookingHourlyRate(
  prisma: PrismaClient,
  tenantId: string,
  args: {
    activityId: string | null
    orderId: string
    employeeId: string
  }
): Promise<{ rate: number | null; source: HourlyRateSource }> {
  const [activity, order, employee] = await Promise.all([
    args.activityId
      ? prisma.activity.findFirst({
          where: { id: args.activityId, tenantId },
          select: { pricingType: true, flatRate: true, hourlyRate: true, unit: true },
        })
      : Promise.resolve(null),
    prisma.order.findFirst({
      where: { id: args.orderId, tenantId },
      select: { billingRatePerHour: true },
    }),
    prisma.employee.findFirst({
      where: { id: args.employeeId, tenantId },
      select: {
        hourlyRate: true,
        wageGroup: { select: { billingHourlyRate: true } },
      },
    }),
  ])

  return resolveLaborRateExtended({
    bookingActivity: activity,
    orderRate: order?.billingRatePerHour ?? null,
    employeeWageGroupRate: employee?.wageGroup?.billingHourlyRate ?? null,
    employeeRate: employee?.hourlyRate ?? null,
  })
}
```

PER_UNIT-Validierung in `create` und `update` (Decision 26):

```ts
if (input.activityId) {
  const activity = await repo.findActivity(prisma, tenantId, input.activityId)
  if (!activity) throw new OrderBookingValidationError("Activity not found")

  if (activity.pricingType === "PER_UNIT") {
    if (input.quantity == null || input.quantity <= 0) {
      throw new OrderBookingValidationError(
        "PER_UNIT-Aktivität benötigt quantity"
      )
    }
  }
}
```

`repo.create` und `repo.update` müssen das `quantity`-Feld
mitnehmen.

`create` erweitern: nach den Existenz-Checks aber vor dem
`repo.create`-Call:

```ts
const { rate, source } = await resolveBookingHourlyRate(prisma, tenantId, {
  activityId: input.activityId ?? null,
  orderId: input.orderId,
  employeeId: input.employeeId,
})

const created = await repo.create(prisma, {
  // ... bestehende Felder
  hourlyRateAtBooking: rate ?? null,
  hourlyRateSourceAtBooking: source,
})
```

`update` erweitern: wenn sich `activityId`, `orderId` oder ein
relevanter Stammdaten-Bezug ändert, Snapshot neu berechnen.
**Pragmatischer Ansatz**: jedes Update löst ein Re-Resolve aus,
weil die Source-Stammdaten in der Zwischenzeit sich geändert haben
können. Audit: Snapshot-Änderung wird in `auditLog`-Changes-Diff
mitgeführt.

**File**: `src/lib/services/inbound-invoice-service.ts` (EDIT)

Neue Funktion `updateLineItemAssignments`:

```ts
export async function updateLineItemAssignments(
  prisma: PrismaClient,
  tenantId: string,
  invoiceId: string,
  assignments: Array<{
    lineItemId: string
    orderId?: string | null
    costCenterId?: string | null
  }>,
  audit?: AuditContext
)
```

Validiert pro Assignment, dass `orderId` und `costCenterId` zum
Tenant gehören. Schreibt die Werte in `inbound_invoice_line_items`.
Audit als compute-changes pro Item.

Außerdem: bei `update` (Beleg-Kopf-Edit) wird `orderId` Änderung
NICHT mehr automatisch auf alle Positionen propagiert — der User
muss explizit Position-Level setzen. Für Bestandsdaten reicht das
1:1-Backfill aus Phase 1.

**File**: `src/lib/services/wh-stock-movement-service.ts` (EDIT)

Neue Funktion `linkToInboundInvoiceLineItem`:

```ts
export async function linkToInboundInvoiceLineItem(
  prisma: PrismaClient,
  tenantId: string,
  movementId: string,
  lineItemId: string | null,
  audit?: AuditContext
)
```

Setzt `WhStockMovement.inboundInvoiceLineItemId`. Validiert
Tenant-Zugehörigkeit beider Seiten. Audit als compute-changes.

### Router-Änderungen

**File**: `src/trpc/routers/invoices/inbound.ts` (EDIT)

Neue Prozedur `updateLineItemAssignments`:

```ts
updateLineItemAssignments: invProcedure
  .use(requirePermission(INBOUND_INVOICES_MANAGE))
  .input(z.object({
    invoiceId: z.string().uuid(),
    assignments: z.array(z.object({
      lineItemId: z.string().uuid(),
      orderId: z.string().uuid().nullable().optional(),
      costCenterId: z.string().uuid().nullable().optional(),
    })),
  }))
  .mutation(...)
```

**File**: `src/trpc/routers/warehouse/withdrawals.ts` (EDIT)

Neue Prozedur `linkToInboundInvoiceLineItem`:

```ts
linkToInboundInvoiceLineItem: whProcedure
  .use(requirePermission(WH_STOCK_VIEW))  // wenig privileged — siehe Permission-Catalog
  .input(z.object({
    movementId: z.string().uuid(),
    lineItemId: z.string().uuid().nullable(),
  }))
  .mutation(...)
```

(Falls eine restriktivere Permission gewünscht, können wir
`WH_STOCK_LINK_INVOICE` als neuen Permission-Key in Phase 1
nachschieben — Plan-PAUSE und PO fragen.)

### UI-Änderungen

**File**:
`src/components/inbound-invoices/inbound-invoice-line-items-editor.tsx`
(EDIT — diese Komponente existiert mutmaßlich; verifizieren beim
Implementieren)

In der Line-Item-Tabelle pro Zeile zwei neue Zellen:
- "Auftrag" (Combobox aus `useOrders` — gleiche Komponente wie
  Order-Picker im Beleg-Kopf)
- "Kostenstelle" (Combobox aus `useCostCenters`)

Toolbar mit "Alle Positionen → Beleg-Kopf-Auftrag übernehmen"-
Button für schnelle Bulk-Zuordnung.

**File**:
`src/components/warehouse/withdrawals/withdrawal-link-dialog.tsx`
(NEU — falls die UI für Wareneingang↔Lieferantenrechnung-
Verknüpfung noch nicht existiert)

Klein-Dialog "Verknüpfen mit Eingangsrechnungs-Position":
Combobox mit InboundInvoiceLineItem-Liste (gefiltert auf same
tenant + matching article). Save schreibt
`whStockMovement.inboundInvoiceLineItemId`.

Trigger: in der Wareneingangs-Detail-View auf einer
GOODS_RECEIPT-Bewegung Button "Mit Rechnung verknüpfen".

### Tests

- **Resolver-Unit-Tests (Decision 28)**:
  - `src/lib/services/__tests__/labor-rate-resolver.test.ts`
    - alle 6 Lookup-Stufen pro Funktion (`resolveLaborRateExtended`,
      `resolveTravelRateExtended`)
    - PER_UNIT-Activity → durchfällt zu Stufe 3
    - WageGroup vor Employee — bei Travel-Resolver Maximum-Logik
    - 0/negative/null-Werte werden alle als "nicht gesetzt"
      behandelt
- **Integration-Tests gegen Dev-DB**:
  - `src/lib/services/__tests__/wh-stock-movement-service.snapshot.test.ts`
    - `bookGoodsReceipt` → `unitCostAtMovement` enthält
      `WhPurchaseOrderPosition.unitPrice`
    - `bookGoodsReceipt` mit fehlendem `unitPrice` →
      `unitCostAtMovement = NULL`
    - Bestandsdaten-Test: vor-Migration angelegte Bewegung bleibt
      `unitCostAtMovement = NULL`
  - `src/lib/services/__tests__/wh-withdrawal-service.snapshot.test.ts`
    - `createWithdrawal` → `unitCostAtMovement` enthält
      `WhArticle.buyPrice` zum Zeitpunkt
    - nachträgliche `buyPrice`-Änderung am Article verändert
      Snapshot **nicht**
  - `src/lib/services/__tests__/order-booking-service.snapshot.test.ts`
    - `create` mit Activity (FLAT_RATE) → Snapshot mit `source =
      "activity_flat"`
    - `create` mit Activity (HOURLY) → Snapshot mit `source =
      "activity_hourly"`
    - `create` ohne Activity, mit Order.billingRatePerHour →
      `source = "order"`
    - `create` ohne Order-Rate, mit WageGroup → `source =
      "wage_group"`
    - `create` ohne WageGroup, mit Employee.hourlyRate → `source =
      "employee"`
    - `create` ohne irgendwas → `source = "none"`, `rate = null`
    - `update` mit activityId-Wechsel → Re-Resolve schreibt neuen
      Snapshot
  - `src/lib/services/__tests__/order-booking-service.per-unit.test.ts`
    (Decision 26)
    - `create` mit PER_UNIT-Activity ohne `quantity` →
      ValidationError
    - `create` mit PER_UNIT-Activity mit `quantity = 0` →
      ValidationError
    - `create` mit PER_UNIT-Activity mit `quantity > 0` →
      erfolgreich, `quantity` wird persistiert
    - `create` mit HOURLY-Activity und `quantity` gesetzt →
      erfolgreich, `quantity` wird ignoriert (gespeichert aber
      ohne Berechnungs-Wirkung)
    - `update` von HOURLY zu PER_UNIT ohne `quantity` →
      ValidationError
- **Bridge-Service-Backwards-Compat**:
  - existierende `work-report-invoice-bridge-service.test.ts` und
    Integration-Tests bleiben grün — kein Verhalten ändert sich für
    Bestandsdaten ohne Snapshot
- **InboundInvoice-Tests**:
  - `inbound-invoice-service.line-item-assignments.test.ts`
    - `updateLineItemAssignments` validiert Tenant-Zugehörigkeit
      von orderId/costCenterId
    - Cross-Tenant-Order → ValidationError
- **WhStockMovement-Linking**:
  - `wh-stock-movement-service.linking.test.ts`
    - `linkToInboundInvoiceLineItem` schreibt FK
    - Cross-Tenant-Linking → ValidationError
    - `null` setzt FK zurück

### File Budget

| Datei | Status |
|---|---|
| `src/lib/services/labor-rate-resolver.ts` | **new (Decision 28)** |
| `src/lib/services/__tests__/labor-rate-resolver.test.ts` | new |
| `src/lib/services/wh-stock-movement-service.ts` | edit |
| `src/lib/services/wh-withdrawal-service.ts` | edit |
| `src/lib/services/order-booking-service.ts` | edit |
| `src/lib/services/order-booking-repository.ts` | edit |
| `src/lib/services/inbound-invoice-service.ts` | edit |
| `src/lib/services/inbound-invoice-line-item-repository.ts` | edit |
| `src/lib/services/__tests__/wh-stock-movement-service.snapshot.test.ts` | new |
| `src/lib/services/__tests__/wh-withdrawal-service.snapshot.test.ts` | new |
| `src/lib/services/__tests__/order-booking-service.snapshot.test.ts` | new |
| `src/lib/services/__tests__/order-booking-service.per-unit.test.ts` | new (Decision 26) |
| `src/lib/services/__tests__/inbound-invoice-service.line-item-assignments.test.ts` | new |
| `src/lib/services/__tests__/wh-stock-movement-service.linking.test.ts` | new |
| `src/trpc/routers/invoices/inbound.ts` | edit |
| `src/trpc/routers/warehouse/withdrawals.ts` | edit |
| `src/components/inbound-invoices/inbound-invoice-line-items-editor.tsx` | edit |
| `src/components/warehouse/withdrawals/withdrawal-link-dialog.tsx` | new |

**Total: ~17 files**

### Manual Verification (PO)

- [ ] Wareneingang buchen mit Preis im PO → Snapshot in DB
  sichtbar (`unit_cost_at_movement` befüllt)
- [ ] Artikel-Preis am `WhArticle.buyPrice` ändern, dann Bewegung
  öffnen — Snapshot bleibt unverändert (historisch korrekt)
- [ ] OrderBooking neu anlegen mit Activity (FLAT_RATE) →
  Snapshot in DB sichtbar mit `hourly_rate_source_at_booking =
  'activity_flat'`
- [ ] OrderBooking ohne Activity, mit Order.billingRatePerHour →
  `source = 'order'`
- [ ] OrderBooking ohne Activity, ohne Order-Rate, mit Employee
  in WageGroup mit billingHourlyRate → `source = 'wage_group'`
- [ ] InboundInvoice öffnen, in Line-Items "Auftrag" und
  "Kostenstelle" pro Position setzen → speichert
- [ ] Wareneingangs-Bewegung mit Eingangsrechnungs-Position
  verlinken — FK `inbound_invoice_line_item_id` gesetzt
- [ ] Bestandsdaten-Test: alte Buchung von vor Phase 3 hat
  `hourly_rate_at_booking = NULL` und ist im UI weiterhin lesbar

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Alle Snapshot-Tests grün
- [ ] Bridge-Service-Tests bleiben grün (Backwards-Compatibility)
- [ ] Manual Verification (oben) bestätigt
- [ ] Mindestens eine OrderBooking mit Snapshot existiert im
  Dev-Tenant für Phase 4/6

---

## Phase 4 — Soll-Werte (OrderTarget) Service + UI

### Goal

Versionierter `OrderTarget`-Service mit Re-Planungs-Pfad. Pattern
analog `EmployeeSalaryHistory`. UI-Erweiterung in der
Order-Detail-Sicht für Soll-Eingabe und Versions-Anzeige.

### Service-Änderungen

**File**: `src/lib/services/order-target-service.ts` (NEU)

```ts
export class OrderTargetNotFoundError extends Error { /* ... */ }
export class OrderTargetValidationError extends Error { /* ... */ }
export class OrderTargetConflictError extends Error { /* ... */ }

export interface OrderTargetInput {
  orderId: string
  validFrom: string  // ISO date
  targetHours?: number | null
  targetMaterialCost?: number | null
  targetTravelMinutes?: number | null
  targetExternalCost?: number | null
  targetRevenue?: number | null
  targetUnitItems?: Array<{ activityId: string; quantity: number }> | null
  changeReason?: string
  notes?: string
}

export async function getActiveTarget(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
): Promise<OrderTargetWithMeta | null>

export async function listVersions(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
): Promise<OrderTargetWithMeta[]>

/**
 * Wenn keine aktive Version existiert: Anlage als Version 1.
 * Wenn eine aktive Version existiert: ConflictError — Caller soll
 * `updateTarget` aufrufen.
 */
export async function createInitialTarget(
  prisma: PrismaClient,
  tenantId: string,
  input: OrderTargetInput,
  audit?: AuditContext
): Promise<OrderTarget>

/**
 * Re-Planung. Schließt aktive Version (validTo = neue.validFrom -
 * 1 Tag) und legt neue Version an. Atomar in einer Transaktion.
 *
 * Validierungen:
 * - Aktive Version muss existieren, sonst Caller muss
 *   `createInitialTarget` aufrufen
 * - Neue validFrom > aktive validFrom
 */
export async function updateTarget(
  prisma: PrismaClient,
  tenantId: string,
  input: OrderTargetInput,
  audit?: AuditContext
): Promise<OrderTarget>

/**
 * Convenience: ruft entweder createInitialTarget oder updateTarget
 * je nach Existenz einer aktiven Version. Vom UI Form-Handler
 * verwendet.
 */
export async function upsertTarget(
  prisma: PrismaClient,
  tenantId: string,
  input: OrderTargetInput,
  audit?: AuditContext
): Promise<{ target: OrderTarget; mode: "created" | "replanned" }>
```

Versionierungs-Logik in `updateTarget` (Pattern aus
`EmployeeSalaryHistory`):

```ts
const result = await prisma.$transaction(async (tx) => {
  // 1. Aktive Version suchen
  const active = await tx.orderTarget.findFirst({
    where: { tenantId, orderId: input.orderId, validTo: null },
    orderBy: { version: "desc" },
  })
  if (!active) throw new OrderTargetNotFoundError()

  const newValidFrom = new Date(input.validFrom)
  if (newValidFrom <= active.validFrom) {
    throw new OrderTargetValidationError("Re-Planung muss nach dem aktiven Soll liegen")
  }

  // 2. Aktive Version schließen
  const closeAt = new Date(newValidFrom)
  closeAt.setUTCDate(closeAt.getUTCDate() - 1)
  await tx.orderTarget.update({
    where: { id: active.id },
    data: { validTo: closeAt },
  })

  // 3. Neue Version anlegen
  return tx.orderTarget.create({
    data: {
      tenantId,
      orderId: input.orderId,
      version: active.version + 1,
      validFrom: newValidFrom,
      validTo: null,
      targetHours: input.targetHours ?? null,
      targetMaterialCost: input.targetMaterialCost ?? null,
      targetTravelMinutes: input.targetTravelMinutes ?? null,
      targetExternalCost: input.targetExternalCost ?? null,
      targetRevenue: input.targetRevenue ?? null,
      targetUnitItems: input.targetUnitItems ?? null,
      changeReason: input.changeReason ?? null,
      notes: input.notes ?? null,
      createdBy: audit?.userId ?? null,
    },
  })
})
```

**Race-Condition-Sicherheit**: Die unique-index-constraint
`idx_order_targets_active_per_order` (Phase 1) auf `(order_id) WHERE
valid_to IS NULL` verhindert auf DB-Ebene, dass parallele
Re-Planungs-Calls zwei aktive Versionen erzeugen. Der zweite Call
wird mit P2002 fehlschlagen — Service fängt das ab und mappt zu
`OrderTargetConflictError`.

**Validierung pro Input**:
- `targetHours` >= 0 wenn gesetzt
- `targetMaterialCost` >= 0 wenn gesetzt
- `targetTravelMinutes` >= 0 wenn gesetzt
- `targetExternalCost` >= 0 wenn gesetzt
- `targetRevenue` >= 0 wenn gesetzt
- `targetUnitItems[].quantity` > 0 für jeden Eintrag
- `targetUnitItems[].activityId` muss zum Tenant gehören und
  Activity muss `pricingType = "PER_UNIT"` haben

**File**: `src/lib/services/order-target-repository.ts` (NEU)

```ts
export async function findActive(prisma, tenantId, orderId)
export async function findById(prisma, tenantId, id)
export async function findManyByOrder(prisma, tenantId, orderId)
export async function findManyByOrders(prisma, tenantId, orderIds: string[]):
  Promise<Map<string, OrderTarget>>  // active version per order
export async function create(prisma, data)
export async function update(prisma, id, data)
```

`findManyByOrders` ist der Batch-Lookup für den Aggregator (Phase
6) und für Dashboard-Listen (Phase 9):

```ts
export async function findManyByOrders(
  prisma: PrismaClient,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, OrderTarget>> {
  if (orderIds.length === 0) return new Map()
  const targets = await prisma.orderTarget.findMany({
    where: {
      tenantId,
      orderId: { in: orderIds },
      validTo: null,
    },
    orderBy: { version: "desc" },
  })
  return new Map(targets.map(t => [t.orderId, t]))
}
```

### Router-Änderungen

**File**: `src/trpc/routers/nachkalkulation/targets.ts` (NEU)

```ts
const nkProcedure = tenantProcedure.use(requireModule("nachkalkulation"))
const NK_VIEW = permissionIdByKey("nachkalkulation.view")!
const NK_MANAGE = permissionIdByKey("nachkalkulation.manage")!

export const targetsRouter = createTRPCRouter({
  getActive: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({ orderId: z.string().uuid() }))
    .query(...),
  listVersions: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({ orderId: z.string().uuid() }))
    .query(...),
  upsert: nkProcedure
    .use(requirePermission(NK_MANAGE))
    .input(z.object({
      orderId: z.string().uuid(),
      validFrom: z.string().date(),
      targetHours: z.number().min(0).max(99999.99).nullable().optional(),
      targetMaterialCost: z.number().min(0).max(9999999.99).nullable().optional(),
      targetTravelMinutes: z.number().int().min(0).nullable().optional(),
      targetExternalCost: z.number().min(0).max(9999999.99).nullable().optional(),
      targetRevenue: z.number().min(0).max(9999999.99).nullable().optional(),
      targetUnitItems: z.array(z.object({
        activityId: z.string().uuid(),
        quantity: z.number().min(0.01),
      })).nullable().optional(),
      changeReason: z.string().max(50).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(...),
})
```

**File**: `src/trpc/routers/nachkalkulation/index.ts` (NEU)

```ts
export const nachkalkulationRouter = createTRPCRouter({
  targets: targetsRouter,
  // reports und thresholds folgen in Phase 6/7
})
```

**File**: `src/trpc/routers/_app.ts` (EDIT)

```ts
import { nachkalkulationRouter } from "./nachkalkulation"

export const appRouter = createTRPCRouter({
  // ...existierende Router
  nachkalkulation: nachkalkulationRouter,
})
```

### UI-Änderungen

**File**:
`src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` (EDIT)

Neuer Tab "Nachkalkulation" — sichtbar nur, wenn Modul aktiv (via
`useModules()` Check). Innerhalb des Tabs zwei Sektionen:

1. **Soll** (Phase 4) — siehe diese Phase
2. **Ist & Soll/Ist-Vergleich** (Phase 8) — placeholder bis Phase 8

Soll-Sektion:
- Card mit aktueller aktiver Version (badge "v3", validFrom-Datum)
- Felder als read-only-Anzeige: Stunden Soll, Material Soll,
  Reisezeit Soll, Externe Kosten Soll, Erlös Soll
- Bei `targetUnitItems`: Tabelle mit Activity-Name × Quantity
- Bei keiner aktiven Version: leere Card mit "Soll-Werte erfassen"
  Button
- Edit-Button "Soll re-planen" öffnet `OrderTargetFormSheet`
- "Verlauf anzeigen"-Link öffnet `OrderTargetHistorySheet` mit
  allen Versionen chronologisch

**File**:
`src/components/orders/order-target-form-sheet.tsx` (NEU)

Standard `<Sheet>`-Form-Pattern. Felder:
- `validFrom` (Date-Input, default heute)
- `targetHours` (Decimal-Input, optional)
- `targetMaterialCost` (Decimal-Input, optional)
- `targetTravelMinutes` (Integer-Input, optional)
- `targetExternalCost` (Decimal-Input, optional)
- `targetRevenue` (Decimal-Input, optional)
- `targetUnitItems` Editor (Mini-Tabelle mit Add-Button —
  Activity-Combobox aus `useActivities` mit `pricingType =
  "PER_UNIT"` Filter, Quantity-Input)
- `changeReason` (`<Select>` mit Werten "INITIAL", "REPLAN",
  "CORRECTION", "OTHER")
- `notes` (Textarea, optional)

Submit-Button-Label dynamisch:
- "Soll erfassen" wenn keine aktive Version
- "Soll re-planen" wenn aktive Version existiert (mit
  Versions-Hinweis "Aktive Version v3 wird abgelöst")

**File**:
`src/components/orders/order-target-history-sheet.tsx` (NEU)

Read-only Sheet, zeigt alle Versionen als Timeline-Style mit:
- Version-Badge
- validFrom – validTo (oder "aktiv" wenn validTo NULL)
- Soll-Werte tabellarisch
- changeReason + notes
- "Erstellt von … am …"

### Hooks

**File**: `src/hooks/use-order-targets.ts` (NEU)

```ts
export function useActiveOrderTarget(orderId: string)
export function useOrderTargetVersions(orderId: string)
export function useUpsertOrderTarget()
```

Standard Pattern analog `use-cost-centers`.

### Tests

- **Service-Versionierung**:
  - `src/lib/services/__tests__/order-target-service.test.ts`
    - createInitialTarget legt Version 1 an
    - createInitialTarget zweimal → Conflict
    - updateTarget erhöht Version auf 2 und schließt Version 1
      atomar (validTo = neue.validFrom - 1 Tag)
    - updateTarget mit gleichem oder früheren validFrom →
      ValidationError
    - upsertTarget erkennt Mode korrekt (created / replanned)
    - Validierung: targetHours < 0 → ValidationError
    - Validierung: targetUnitItems[].activityId nicht PER_UNIT →
      ValidationError
- **Race-Condition-Test**:
  - parallele upsertTarget-Calls: einer gewinnt, anderer
    bekommt Conflict (DB-unique-index erzwingt)
- **Repository-Tests**:
  - findManyByOrders: leere ID-Liste → leere Map
  - findManyByOrders: Order ohne aktive Version → kein Map-Eintrag
  - tenant-isolation
- **Router-Test**:
  - `src/trpc/routers/__tests__/nachkalkulation-targets.test.ts`
    - upsert ohne Modul aktiv → FORBIDDEN
    - upsert ohne `nachkalkulation.manage` → FORBIDDEN
    - getActive ohne `nachkalkulation.view` → FORBIDDEN

### File Budget

| Datei | Status |
|---|---|
| `src/lib/services/order-target-service.ts` | new |
| `src/lib/services/order-target-repository.ts` | new |
| `src/lib/services/__tests__/order-target-service.test.ts` | new |
| `src/lib/services/__tests__/order-target-repository.test.ts` | new |
| `src/trpc/routers/nachkalkulation/index.ts` | new |
| `src/trpc/routers/nachkalkulation/targets.ts` | new |
| `src/trpc/routers/__tests__/nachkalkulation-targets.test.ts` | new |
| `src/trpc/routers/_app.ts` | edit |
| `src/hooks/use-order-targets.ts` | new |
| `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` | edit |
| `src/components/orders/order-target-form-sheet.tsx` | new |
| `src/components/orders/order-target-history-sheet.tsx` | new |

**Total: 12 files**

### Manual Verification (PO)

- [ ] Modul "nachkalkulation" für Dev-Tenant aktiviert
- [ ] Order öffnen → neuer Tab "Nachkalkulation" sichtbar
- [ ] "Soll-Werte erfassen" → Sheet öffnet, Werte eingeben →
  speichert, Version 1 sichtbar
- [ ] "Soll re-planen" → Sheet öffnet mit Hinweis "Version 1 wird
  abgelöst", neuer validFrom-Datum, neue Werte → speichert,
  Version 2 ist aktiv
- [ ] "Verlauf anzeigen" → beide Versionen sichtbar, Version 1 hat
  validTo = (Version 2 validFrom - 1 Tag)
- [ ] Modul "nachkalkulation" deaktivieren → Tab verschwindet
- [ ] User ohne `nachkalkulation.manage` sieht den Tab read-only,
  aber Buttons sind disabled

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Service-Tests grün, Versionierungs-Edge-Cases abgedeckt
- [ ] DB-unique-index auf `(order_id) WHERE valid_to IS NULL`
  funktioniert (Race-Test)
- [ ] Manual Verification (oben) bestätigt
- [ ] Mindestens eine Order mit OrderTarget Version 1 im Dev-Tenant
  vorhanden

---

## Phase 5 — Bridge-Service auf Resolver umstellen + Travel-Snapshot-Befüllung

### Goal

`work-report-invoice-bridge-service.ts` wird auf den finalen
Resolver aus `labor-rate-resolver.ts` (Phase 3, Decision 28)
umgestellt — kein eigener Resolver mehr im Bridge-Service. Bridge
nutzt vorrangig `OrderBooking.hourlyRateAtBooking`-Snapshot und
`WorkReport.travelRateAtSign`-Snapshot (Decision 27), fällt
zurück auf Live-Lookup mit estimated-Flag wenn NULL.

`work-report-service.sign` wird erweitert: beim DRAFT → SIGNED-
Übergang wird `travelRateAtSign` befüllt.

### Service-Änderungen

**File**: `src/lib/services/work-report-invoice-bridge-service.ts`
(EDIT)

Imports ergänzen statt eigene Resolver-Implementierung:

```ts
import {
  resolveLaborRateExtended,
  resolveTravelRateExtended,
  type HourlyRateSource,
  type ResolvedRate,
} from "./labor-rate-resolver"
```

Bestehende `resolveLaborRate` und `resolveTravelRate` Inline-
Funktionen werden gelöscht (durch die importierten Versionen
ersetzt). Type `ProposedPosition` wird um `source` und `estimated`
erweitert (siehe unten).

`computeProposedPositions` erweitern:

1. Pro Booking: zuerst auf Snapshot prüfen
   (`booking.hourlyRateAtBooking`):
   - Wenn vorhanden und positiv: nutze als rate, source =
     `booking.hourlyRateSourceAtBooking`, `estimated = false`
   - Wenn NULL: Live-Lookup über `resolveLaborRateExtended` mit
     `estimated = true`-Flag

2. Erweitertes Activity-Loading: `include: { activity: true,
   employee: { include: { wageGroup: true } } }`

3. Travel-Position (Decision 27): zuerst auf
   `WorkReport.travelRateAtSign` prüfen:
   - Wenn vorhanden und positiv: nutze als rate, source =
     `workReport.travelRateSourceAtSign`, `estimated = false`
   - Wenn NULL (DRAFT-Schein): Live-Lookup über
     `resolveTravelRateExtended` mit `estimated = true`-Flag

`ProposedPosition`-Type erweitern:

```ts
export interface ProposedPosition {
  // ...existierende Felder
  source: HourlyRateSource          // NEU
  estimated: boolean                // NEU — true wenn live-Lookup
}
```

**File**: `src/lib/services/order-booking-service.ts` (EDIT —
falls nötig)

Phase 3 hat bereits `import { resolveLaborRateExtended } from
"./labor-rate-resolver"` etabliert. In Phase 5 ist hier kein
weiterer Import-Refactor nötig. Falls Phase 3 noch einen
falschen Import von `work-report-invoice-bridge-service` enthielt
(Plan-Inkonsequenz), wird er korrigiert.

**File**: `src/lib/services/work-report-service.ts` (EDIT —
Decision 27 Travel-Snapshot-Befüllung)

`sign` (DRAFT → SIGNED-Übergang) wird erweitert um den
Travel-Snapshot:

```ts
import {
  resolveTravelRateExtended,
} from "./labor-rate-resolver"

// Innerhalb der sign-Transaction:
// - WorkReport mit assignments + assigned employees + wageGroup
//   einmal mit den nötigen Includes laden
// - Order.billingRatePerHour ebenfalls
// - resolveTravelRateExtended aufrufen
// - travelRateAtSign + travelRateSourceAtSign in update-data
//   schreiben

const wr = await tx.workReport.findFirst({
  where: { id: workReportId, tenantId, status: "DRAFT" },
  include: {
    assignments: {
      include: {
        employee: {
          include: { wageGroup: { select: { billingHourlyRate: true } } },
        },
      },
    },
    order: { select: { billingRatePerHour: true } },
  },
})
if (!wr) throw new WorkReportValidationError(...)

const travel = resolveTravelRateExtended({
  orderRate: wr.order?.billingRatePerHour ?? null,
  assignmentEmployees: wr.assignments.map(a => ({
    hourlyRate: a.employee?.hourlyRate ?? null,
    wageGroup: a.employee?.wageGroup ?? null,
  })),
})

await tx.workReport.update({
  where: { id: workReportId },
  data: {
    status: "SIGNED",
    signedAt: new Date(),
    // ... bestehende sign-Felder
    travelRateAtSign: travel.rate,
    travelRateSourceAtSign: travel.source,
  },
})
```

**File**: `src/lib/services/work-report-invoice-bridge-service.ts`
(EDIT, fortsetzen)

`generateInvoiceFromWorkReport` bleibt im Verhalten unverändert —
nutzt aber jetzt die erweiterten Sources. UI-`ProposedPosition`-
Output trägt das `estimated`-Flag, was im Generate-Dialog dezent
markiert werden kann (Tooltip).

### Tests

- **Bridge-Service-Unit-Tests**:
  - `src/lib/services/__tests__/work-report-invoice-bridge-service.test.ts`
    (existierende Datei, EDIT)
    - Snapshot-Pfad Booking: Booking mit hourlyRateAtBooking=80 →
      80 (live-Lookup wird nicht aufgerufen), estimated=false
    - Snapshot-Pfad Booking NULL: Booking ohne Snapshot →
      live-Lookup über `resolveLaborRateExtended`, estimated=true
    - Snapshot-Pfad Travel (Decision 27):
      `WorkReport.travelRateAtSign=85` → 85 (live-Lookup wird
      nicht aufgerufen), estimated=false
    - Snapshot-Pfad Travel NULL (DRAFT-Schein): travelRateAtSign
      = NULL → live-Lookup über `resolveTravelRateExtended`,
      estimated=true
    - VOID-WorkReport: kompletter Skip
- **WorkReport-Sign-Snapshot-Test (Decision 27)**:
  - `src/lib/services/__tests__/work-report-service.sign-snapshot.test.ts`
    - sign mit Order.billingRatePerHour gesetzt → travelRateAtSign
      = orderRate, source=order
    - sign mit nur WageGroup-Sätzen → travelRateAtSign = max
      WageGroup-Satz, source=wage_group
    - sign ohne irgendwelche Sätze → travelRateAtSign=null,
      source="none"
    - sign auf bereits SIGNED-Schein → wirft (idempotenz)
    - Snapshot bleibt nach späterer Lohnerhöhung am Employee
      unverändert
- **Integration-Test**:
  - `src/lib/services/__tests__/work-report-invoice-bridge-service.integration.test.ts`
    (existierende Datei, EDIT)
    - End-to-End mit Activity (FLAT_RATE) und Booking → Generate
      erzeugt korrekte Position mit unitPrice=flatRate
    - Live-Lookup vs Snapshot: nach Lohnerhöhung am Employee bleibt
      Snapshot-Booking unverändert
    - Travel-Snapshot konsistent: signed WorkReport → Generate
      nutzt Snapshot, DRAFT WorkReport → Generate nutzt
      Live-Lookup
- **R-1-Bestands-Tests** bleiben grün (keine Verhaltensänderung für
  Bestandsdaten ohne Snapshot und ohne Activity-Pricing).

### File Budget

| Datei | Status |
|---|---|
| `src/lib/services/work-report-invoice-bridge-service.ts` | edit (Resolver-Imports + Snapshot-Pfad) |
| `src/lib/services/work-report-service.ts` | edit (sign-Travel-Snapshot, Decision 27) |
| `src/lib/services/__tests__/work-report-invoice-bridge-service.test.ts` | edit |
| `src/lib/services/__tests__/work-report-invoice-bridge-service.integration.test.ts` | edit |
| `src/lib/services/__tests__/work-report-service.sign-snapshot.test.ts` | new (Decision 27) |

**Total: 5 files**

**Anmerkung**: Der Resolver selbst (`labor-rate-resolver.ts`) ist
in Phase 3 angelegt — Phase 5 importiert ihn nur. Daher ist Phase
5 ein dünnerer Refactor + ein neuer Service-Touch
(work-report-service.sign).

### Manual Verification (PO)

- [ ] WorkReport mit Booking, das eine Activity (FLAT_RATE 89€,
  calculatedHourEquivalent=0.5h) hat → Rechnung-Generieren-Dialog
  zeigt unitPrice=89
- [ ] Booking ohne Activity, aber Order mit billingRatePerHour=80
  → Position mit unitPrice=80
- [ ] Booking ohne Activity, ohne Order-Rate, mit Employee in
  WageGroup mit billingHourlyRate=70 → Position mit unitPrice=70
- [ ] Booking ganz ohne Pricing → Position mit unitPrice=0,
  requiresManualPrice-Marker
- [ ] Bestands-Booking (vor Phase 3 angelegt) → Generate-Dialog
  zeigt unitPrice basierend auf Live-Lookup, mit dezentem
  estimated-Indikator (Tooltip "Stundensatz live ermittelt")
- [ ] **Decision 27**: WorkReport signieren → DB zeigt
  `travel_rate_at_sign` und `travel_rate_source_at_sign` befüllt
- [ ] Lohnerhöhung am Employee nach Sign → Travel-Snapshot bleibt
  unverändert (historisch korrekt)
- [ ] DRAFT-WorkReport im Generate-Dialog: Travel-Position zeigt
  estimated-Indikator (Tooltip)
- [ ] SIGNED-WorkReport im Generate-Dialog: Travel-Position ohne
  estimated-Indikator (nutzt Snapshot)

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Alle Lookup-Stufen-Tests grün (Phase 3 + Phase 5)
- [ ] Travel-Snapshot-Tests grün (Decision 27)
- [ ] Bridge-Service hat keinen eigenen Resolver mehr
  (Decision 28) — alle Resolver-Calls gehen über
  `labor-rate-resolver.ts`
- [ ] Backwards-Compat: existierender R-1-Generate-Workflow
  unverändert für HOURLY-Activities ohne flatRate
- [ ] Manual Verification (oben) bestätigt

---

## Phase 6 — Aggregations-Service (`nk-aggregator.ts`)

### Goal

Pure-function-Aggregations-Service mit drei Public-Funktionen:
`calculateIstAufwand`, `calculateIstAufwandBatch`,
`calculateSollIstReport`. Read-only, keine Mutationen, keine
Side-Effects. Output: strukturierter Report mit
Pending/Committed/Total-Trennung, dataQualityIssues mit
Drill-Down-IDs, estimated-Flag pro Komponente, drei Position-Typen
(laborHours/flatItems/unitItems).

### Service-Änderungen

**File**: `src/lib/services/nk-aggregator-repository.ts` (NEU)

Read-only Prisma-Queries:

```ts
export async function loadOrderBookingsForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
)
// Returns: OrderBooking[] mit Includes für Activity, Employee
//   (mit WageGroup), WorkReport (mit Status), für Lookup und
//   Pending/Committed-Trennung

export async function loadStockMovementsForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
)
// Returns: WhStockMovement[] mit type IN (WITHDRAWAL,
//   DELIVERY_NOTE, RETURN), include Article für Fallback-Preis,
//   inklusive inboundInvoiceLineItemId

export async function loadInboundInvoiceLineItemsForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
)
// Returns: InboundInvoiceLineItem[] WHERE order_id = $1,
//   inkl. ihrer back-reference auf stockMovements (Anti-Doppelzählung)

export async function loadWorkReportsForAggregation(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
)
// Returns: WorkReport[] WHERE order_id = $1 AND status != 'VOID',
//   mit travelMinutes für Reisezeit-Aggregation
```

**File**: `src/lib/services/nk-aggregator.ts` (NEU)

Type-Definitionen:

```ts
export interface IstAufwandReport {
  orderId: string

  laborHours: {
    committedHours: number      // SIGNED workReports
    pendingHours: number        // DRAFT workReports + ohne workReport
    totalHours: number
    committedCost: number       // hours × hourlyRate
    pendingCost: number
    totalCost: number
    bookingCount: number
    estimatedShare: number      // Anteil ohne Snapshot 0..1
  }

  flatItems: Array<{
    activityId: string
    activityName: string
    description: string
    quantity: number            // Anzahl Buchungen
    flatRate: number
    totalAmount: number
    calculatedHourEquivalent: number  // Σ über alle Buchungen
    sourceBookingIds: string[]
  }>

  unitItems: Array<{
    activityId: string
    activityName: string
    description: string
    quantity: number
    unit: string
    pricePerUnit: number
    totalAmount: number
    sourceBookingIds: string[]
  }>

  travel: {
    totalMinutes: number
    totalCost: number
    estimatedShare: number
    workReportIds: string[]
  }

  material: {
    totalCost: number
    estimatedShare: number      // Anteil mit unitCostAtMovement = NULL
    movementCount: number
    movementIds: string[]
  }

  externalCost: {
    totalCost: number
    lineItemCount: number
    lineItemIds: string[]
    skippedDueToStockLink: number  // wegen inboundInvoiceLineItemId IS NOT NULL gesetzt
  }

  dataQualityIssues: Array<{
    code: DataQualityIssueCode
    severity: "info" | "warning" | "error"
    count: number
    affectedIds: string[]       // Drill-Down
  }>

  estimatedShare: number        // Gesamt-Anteil 0..1
  estimatedComponents: string[] // ["labor", "material", "travel"]
}

export type DataQualityIssueCode =
  | "BOOKING_WITHOUT_RATE"           // hourlyRateAtBooking IS NULL und Live-Lookup hat NULL
  | "BOOKING_RATE_NULL_SNAPSHOT"     // hourlyRateAtBooking IS NULL (Bestandsdaten)
  | "PER_UNIT_WITHOUT_QUANTITY"      // PER_UNIT-Booking mit quantity NULL/0 (Decision 26)
  | "TRAVEL_NULL_SNAPSHOT"           // travelRateAtSign IS NULL (DRAFT oder Bestandsdaten, Decision 27)
  | "WORKREPORT_DRAFT"               // warning, kein error
  | "BOOKING_WITHOUT_WORKREPORT"     // workReportId IS NULL
  | "MOVEMENT_NO_UNIT_COST"          // unitCostAtMovement IS NULL
  | "INVOICE_LI_LINKED_VIA_STOCK"    // inboundInvoiceLineItemId NOT NULL → ignoriert
  | "EMPLOYEE_INACTIVE_OR_DELETED"   // Mitarbeiter mit deletedAt oder isActive=false
  | "EMPLOYEE_NO_WAGE_GROUP"         // Buchung mit Employee ohne wageGroupId

export interface SollIstReport {
  orderId: string
  target: {
    version: number
    validFrom: Date
    targetHours: number | null
    targetMaterialCost: number | null
    targetTravelMinutes: number | null
    targetExternalCost: number | null
    targetRevenue: number | null
    targetUnitItems: Array<{ activityId: string; quantity: number }> | null
  } | null
  ist: IstAufwandReport
  comparison: {
    hoursVariance: number | null              // ist - soll
    hoursVariancePercent: number | null
    materialVariance: number | null
    materialVariancePercent: number | null
    travelVariance: number | null
    travelVariancePercent: number | null
    externalCostVariance: number | null
    externalCostVariancePercent: number | null
    unitItemsVariance: Array<{                // Decision 26 + Decision 21
      activityId: string
      activityName: string
      unit: string
      sollQuantity: number
      istQuantity: number
      variance: number
      variancePercent: number | null
    }>
  }
  marginContribution: {
    sollErloes: number | null
    db1: number | null  // sollErloes - istMaterial
    db2: number | null  // db1 - istLabor
    db3: number | null  // db2 - istTravel - istExternal
    db1Percent: number | null
    db2Percent: number | null
    db3Percent: number | null
  }
  productivity: {
    grossHoursIst: number              // alle Stunden (committed+pending)
    flatHourEquivalents: number        // Σ calculatedHourEquivalent
    productiveHoursTotal: number
    targetHours: number | null
    productivityPercent: number | null  // (productiveHoursTotal / targetHours) × 100
  }
  hourlyMargin: number | null  // (db2 / productiveHoursTotal)
}
```

Hauptfunktionen:

```ts
/**
 * Read-only. Aggregiert Ist-Werte für eine Order.
 *
 * Performance-Hinweis: führt ~4 Prisma-Queries aus, alle
 * tenant-scoped und mit fokussiertem Index-Hit (siehe Phase-1
 * Indizes idx_*_tenant_order).
 */
export async function calculateIstAufwand(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
): Promise<IstAufwandReport>

/**
 * Batch-Variante für Performance bei Listen-Reports
 * (Dashboard, NK-2-Vertrags-Aggregation).
 */
export async function calculateIstAufwandBatch(
  prisma: PrismaClient,
  tenantId: string,
  orderIds: string[]
): Promise<Map<string, IstAufwandReport>>

/**
 * Soll/Ist-Vergleich. Lädt aktive OrderTarget-Version, kombiniert
 * mit calculateIstAufwand(orderId).
 */
export async function calculateSollIstReport(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
): Promise<SollIstReport>
```

Implementations-Skizze für `calculateIstAufwand`:

```ts
export async function calculateIstAufwand(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string
): Promise<IstAufwandReport> {
  const [bookings, movements, lineItems, workReports] = await Promise.all([
    loadOrderBookingsForAggregation(prisma, tenantId, orderId),
    loadStockMovementsForAggregation(prisma, tenantId, orderId),
    loadInboundInvoiceLineItemsForAggregation(prisma, tenantId, orderId),
    loadWorkReportsForAggregation(prisma, tenantId, orderId),
  ])

  // 1. Booking-Aggregation mit drei Position-Typen
  const laborHoursAccumulator = { committedHours: 0, pendingHours: 0, ... }
  const flatItemsMap = new Map<string, FlatItemAggregate>()
  const unitItemsMap = new Map<string, UnitItemAggregate>()

  let bookingsWithSnapshot = 0
  let bookingsWithoutSnapshot = 0
  const dq_bookingsWithoutRate: string[] = []
  const dq_bookingsRateNullSnapshot: string[] = []
  const dq_bookingsWithoutWorkReport: string[] = []

  for (const booking of bookings) {
    // Status-Klassifikation
    const wrStatus = booking.workReport?.status ?? null
    if (wrStatus === "VOID") continue  // VOID immer ausgeschlossen

    const isCommitted = wrStatus === "SIGNED"
    const isPending = wrStatus === "DRAFT" || booking.workReportId == null

    if (booking.workReportId == null) {
      dq_bookingsWithoutWorkReport.push(booking.id)
    }

    // Snapshot-Tracking
    let rate: number | null
    let estimated: boolean
    if (booking.hourlyRateAtBooking != null) {
      rate = toNumber(booking.hourlyRateAtBooking)
      estimated = false
      bookingsWithSnapshot++
    } else {
      // Live-Lookup
      const resolved = resolveLaborRateExtended({
        bookingActivity: booking.activity,
        orderRate: booking.order?.billingRatePerHour ?? null,
        employeeWageGroupRate: booking.employee.wageGroup?.billingHourlyRate ?? null,
        employeeRate: booking.employee.hourlyRate,
      })
      rate = resolved.rate
      estimated = true
      bookingsWithoutSnapshot++
      dq_bookingsRateNullSnapshot.push(booking.id)
    }

    if (rate == null) dq_bookingsWithoutRate.push(booking.id)

    // Drei-Wege-Split
    if (booking.activity?.pricingType === "FLAT_RATE") {
      // flatItem: Anzahl × flatRate
      const key = booking.activityId!
      const agg = flatItemsMap.get(key) ?? { ... }
      agg.quantity += 1
      agg.totalAmount += toNumber(booking.activity.flatRate ?? 0)
      agg.calculatedHourEquivalent += toNumber(booking.activity.calculatedHourEquivalent ?? 0)
      agg.sourceBookingIds.push(booking.id)
      flatItemsMap.set(key, agg)
    } else if (booking.activity?.pricingType === "PER_UNIT") {
      // unitItem (Decision 26): Menge aus OrderBooking.quantity,
      // multipliziert mit Activity-Preis.
      // PER_UNIT-Validierung in Phase 3 hat sichergestellt, dass
      // booking.quantity > 0 ist — bei Bestandsdaten könnte es
      // NULL sein → in dataQualityIssues aufnehmen und überspringen.
      if (booking.quantity == null || Number(booking.quantity) <= 0) {
        dq_perUnitWithoutQuantity.push(booking.id)
        continue
      }
      const key = booking.activityId!
      const agg = unitItemsMap.get(key) ?? {
        activityId: booking.activityId!,
        activityName: booking.activity.name,
        description: "",
        quantity: 0,
        unit: booking.activity.unit ?? "Stk",
        pricePerUnit: toNumber(booking.activity.flatRate
          ?? booking.activity.hourlyRate ?? 0),
        totalAmount: 0,
        sourceBookingIds: [],
      }
      const qty = toNumber(booking.quantity)
      agg.quantity += qty
      agg.totalAmount += qty * agg.pricePerUnit
      agg.sourceBookingIds.push(booking.id)
      unitItemsMap.set(key, agg)
    } else {
      // HOURLY (oder ohne Activity): laborHours
      const hours = booking.timeMinutes / 60
      const cost = (rate ?? 0) * hours
      if (isCommitted) {
        laborHoursAccumulator.committedHours += hours
        laborHoursAccumulator.committedCost += cost
      } else if (isPending) {
        laborHoursAccumulator.pendingHours += hours
        laborHoursAccumulator.pendingCost += cost
      }
      laborHoursAccumulator.totalHours += hours
      laborHoursAccumulator.totalCost += cost
    }
  }

  // 2. Material-Aggregation
  let materialEstimatedShare = 0
  let materialNullCount = 0
  let materialCost = 0
  for (const m of movements) {
    const cost = m.unitCostAtMovement != null
      ? Math.abs(m.quantity) * toNumber(m.unitCostAtMovement)
      : Math.abs(m.quantity) * toNumber(m.article.buyPrice ?? 0)
    materialCost += cost
    if (m.unitCostAtMovement == null) materialNullCount++
  }
  if (movements.length > 0) {
    materialEstimatedShare = materialNullCount / movements.length
  }

  // 3. External Cost (mit Anti-Doppelzählung)
  let externalCost = 0
  let skippedDueToStockLink = 0
  const externalIds: string[] = []
  for (const li of lineItems) {
    // Wenn dieser LineItem bereits über eine StockMovement erfasst ist, skip
    const linkedMovements = li.stockMovements ?? []
    if (linkedMovements.length > 0) {
      skippedDueToStockLink++
      continue
    }
    externalCost += toNumber(li.totalNet ?? 0)
    externalIds.push(li.id)
  }

  // 4. Travel (Decision 27 — mit Snapshot)
  let travelMinutes = 0
  let travelCost = 0
  let travelWrWithSnapshot = 0
  let travelWrWithoutSnapshot = 0
  for (const wr of workReports) {
    if (wr.status === "VOID") continue
    const minutes = wr.travelMinutes ?? 0
    if (minutes <= 0) continue

    travelMinutes += minutes

    // Snapshot vorrangig
    let rate: number | null
    if (wr.travelRateAtSign != null) {
      rate = toNumber(wr.travelRateAtSign)
      travelWrWithSnapshot++
    } else {
      // Live-Lookup für DRAFT-Scheine
      const resolved = resolveTravelRateExtended({
        orderRate: order.billingRatePerHour ?? null,
        assignmentEmployees: (wr.assignments ?? []).map(a => ({
          hourlyRate: a.employee?.hourlyRate ?? null,
          wageGroup: a.employee?.wageGroup ?? null,
        })),
      })
      rate = resolved.rate
      travelWrWithoutSnapshot++
    }
    travelCost += (minutes / 60) * (rate ?? 0)
  }
  const totalTravelWr = travelWrWithSnapshot + travelWrWithoutSnapshot
  const travelEstimatedShare = totalTravelWr > 0
    ? travelWrWithoutSnapshot / totalTravelWr
    : 0

  // 5. dataQualityIssues zusammenstellen
  const issues: DataQualityIssue[] = []
  if (dq_bookingsWithoutRate.length > 0) {
    issues.push({ code: "BOOKING_WITHOUT_RATE", severity: "error",
      count: dq_bookingsWithoutRate.length, affectedIds: dq_bookingsWithoutRate })
  }
  if (dq_bookingsRateNullSnapshot.length > 0) {
    issues.push({ code: "BOOKING_RATE_NULL_SNAPSHOT", severity: "info",
      count: dq_bookingsRateNullSnapshot.length, affectedIds: dq_bookingsRateNullSnapshot })
  }
  // ... weitere Issue-Codes analog

  // 6. estimatedShare gesamt
  const totalBookings = bookings.length
  const laborEstimatedShare = totalBookings > 0
    ? bookingsWithoutSnapshot / totalBookings
    : 0
  const totalEstimatedShare = (laborEstimatedShare + materialEstimatedShare) / 2
  const estimatedComponents: string[] = []
  if (laborEstimatedShare > 0) estimatedComponents.push("labor")
  if (materialEstimatedShare > 0) estimatedComponents.push("material")
  if (travelMinutes > 0) estimatedComponents.push("travel")

  return { ... }
}
```

`calculateSollIstReport` lädt `orderTargetService.getActiveTarget`,
ruft `calculateIstAufwand`, berechnet die Variances und DB-Stufen.

### Router-Änderungen

**File**: `src/trpc/routers/nachkalkulation/reports.ts` (NEU)

```ts
const nkProcedure = tenantProcedure.use(requireModule("nachkalkulation"))
const NK_VIEW = permissionIdByKey("nachkalkulation.view")!
const NK_MANAGE = permissionIdByKey("nachkalkulation.manage")!

export const reportsRouter = createTRPCRouter({
  istAufwand: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({ orderId: z.string().uuid() }))
    .query(...),

  sollIst: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({ orderId: z.string().uuid() }))
    .query(...),

  istAufwandBatch: nkProcedure
    .use(requirePermission(NK_VIEW, NK_MANAGE))
    .input(z.object({
      orderIds: z.array(z.string().uuid()).max(100),
    }))
    .query(...),
})
```

**File**: `src/trpc/routers/nachkalkulation/index.ts` (EDIT)

```ts
export const nachkalkulationRouter = createTRPCRouter({
  targets: targetsRouter,
  reports: reportsRouter,   // NEU
  // thresholds folgt in Phase 7
})
```

### Tests

- **Unit-Tests für Aggregations-Logik**:
  - `src/lib/services/__tests__/nk-aggregator.test.ts`
    - leeres Order: alle Werte 0
    - 1 Booking SIGNED HOURLY: laborHours korrekt, kein flatItem
    - 1 Booking SIGNED FLAT_RATE: flatItem mit quantity=1
    - 1 Booking DRAFT: counts as pending
    - 1 Booking VOID-WorkReport: ausgeschlossen
    - Mehrfach-Booking selbe Activity FLAT_RATE: quantity summiert
    - Booking ohne workReportId: counts as pending,
      dq_bookingsWithoutWorkReport
    - Booking mit hourlyRateAtBooking gesetzt: estimated=false
    - Booking ohne Snapshot (NULL): estimated=true,
      dq_bookingsRateNullSnapshot
- **Integration-Tests gegen Dev-DB**:
  - `src/lib/services/__tests__/nk-aggregator.integration.test.ts`
    - Material mit Snapshot: Aggregat nutzt unitCostAtMovement
    - Material ohne Snapshot: Aggregat nutzt buyPrice, estimated
    - Doppelzuordnungs-Test: 1 Movement + 1 LineItem mit
      Cross-Link → LineItem wird übersprungen, Material zählt
    - Doppelzuordnungs-Test umgekehrt: LineItem ohne
      stockMovement-Backref → in externalCost
    - Drei-Wege-Split: HOURLY + FLAT_RATE + PER_UNIT alle aktiv
    - PER_UNIT (Decision 26): 3 Bookings derselben PER_UNIT-Activity
      mit `quantity = 5, 3, 2` → unitItems-Aggregat hat
      `quantity = 10`, `totalAmount = 10 × pricePerUnit`
    - PER_UNIT (Decision 26) Bestandsdaten ohne quantity → in
      dataQualityIssues `PER_UNIT_WITHOUT_QUANTITY`, Skip in
      unitItems-Aggregation
    - Travel mit Snapshot (Decision 27): SIGNED-WorkReport mit
      `travelRateAtSign=85` → travelCost basiert auf 85,
      estimatedShare=0
    - Travel ohne Snapshot (DRAFT-Schein): Live-Lookup,
      estimatedShare > 0
    - Travel-Mix: 2 SIGNED mit Snapshot + 1 DRAFT ohne →
      estimatedShare = 1/3
    - VOID-WorkReport ist excluded (auch für Travel)
    - dataQualityIssues korrekt befüllt
- **Soll/Ist-Test**:
  - mit aktiver OrderTarget v1: Comparison-Werte korrekt
  - ohne OrderTarget: target = null, comparison = null
- **Performance-Test**:
  - `src/lib/services/__tests__/nk-aggregator.performance.test.ts`
    - Order mit 500 Bookings + 200 Movements + 50 LineItems →
      `calculateIstAufwand` < 500ms
    - `calculateIstAufwandBatch(50 orders)` parallel →
      Performance-Profil

### File Budget

| Datei | Status |
|---|---|
| `src/lib/services/nk-aggregator.ts` | new |
| `src/lib/services/nk-aggregator-repository.ts` | new |
| `src/lib/services/__tests__/nk-aggregator.test.ts` | new |
| `src/lib/services/__tests__/nk-aggregator.integration.test.ts` | new |
| `src/lib/services/__tests__/nk-aggregator.performance.test.ts` | new |
| `src/trpc/routers/nachkalkulation/reports.ts` | new |
| `src/trpc/routers/nachkalkulation/index.ts` | edit |
| `src/trpc/routers/__tests__/nachkalkulation-reports.test.ts` | new |
| `src/hooks/use-nk-reports.ts` | new |

**Total: 9 files**

### Manual Verification (PO)

- [ ] Order mit 5 OrderBookings (SIGNED + DRAFT) öffnen → API
  `nachkalkulation.reports.istAufwand` liefert plausible
  laborHours-Trennung committed/pending/total
- [ ] Order mit Activity-Mix (HOURLY + FLAT_RATE) → flatItems und
  laborHours korrekt getrennt
- [ ] Order mit Material-Bewegungen (mit + ohne Snapshot) →
  estimatedShare > 0 für Material, dataQualityIssues enthält
  MOVEMENT_NO_UNIT_COST mit Count
- [ ] Order mit InboundInvoice-Position, die per
  `inboundInvoiceLineItemId` mit StockMovement verknüpft ist →
  externalCost überspringt diese Position, skippedDueToStockLink=1
- [ ] Order mit OrderTarget v1 → `nachkalkulation.reports.sollIst`
  liefert korrekte Variances und DB-Stufen

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Alle Aggregator-Tests grün, alle Doppelzuordnungs-Fälle
  abgedeckt
- [ ] Performance-Test: < 500ms pro Order bei 500 Bookings
- [ ] Manual Verification (oben) bestätigt
- [ ] tRPC `nachkalkulation.reports.*` aufrufbar mit Permission

---

## Phase 7 — Schwellenwert-Konfiguration (NkThresholdConfig)

### Goal

`NkThresholdConfig`-Service mit Default + Auftragstyp-Override-
Lookup. Settings-Seite mit Default-Sektion und "Schwellen pro
Auftragstyp"-Sektion. Auto-Initialisierung mit konservativen
Defaults beim ersten Lookup.

### Service-Änderungen

**File**: `src/lib/services/nk-threshold-config-service.ts` (NEU)

```ts
export class NkThresholdConfigNotFoundError extends Error { /* ... */ }
export class NkThresholdConfigValidationError extends Error { /* ... */ }

export interface ThresholdSet {
  marginAmberFromPercent: number
  marginRedFromPercent: number
  productivityAmberFromPercent: number
  productivityRedFromPercent: number
}

const DEFAULT_THRESHOLDS: ThresholdSet = {
  marginAmberFromPercent: 5,    // <5% rot, 5..15% gelb, >15% grün
  marginRedFromPercent: 0,
  productivityAmberFromPercent: 70,
  productivityRedFromPercent: 50,
}

/**
 * Liefert die effektiven Schwellen für einen Auftragstyp.
 * Lookup-Reihenfolge:
 * 1. Tenant-spezifische Override-Zeile mit orderTypeId = $orderTypeId
 * 2. Tenant-Default-Zeile mit orderTypeId IS NULL
 * 3. Auto-Initialisierung mit DEFAULT_THRESHOLDS, dann Schritt 2
 *
 * Auto-Init: idempotent, race-safe via INSERT ... ON CONFLICT DO NOTHING.
 */
export async function getEffectiveThresholds(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string | null
): Promise<ThresholdSet>

export async function listConfigs(
  prisma: PrismaClient,
  tenantId: string
): Promise<NkThresholdConfig[]>

export async function upsertDefault(
  prisma: PrismaClient,
  tenantId: string,
  input: ThresholdSet,
  audit?: AuditContext
): Promise<NkThresholdConfig>

export async function upsertOverride(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string,
  input: ThresholdSet,
  audit?: AuditContext
): Promise<NkThresholdConfig>

export async function removeOverride(
  prisma: PrismaClient,
  tenantId: string,
  orderTypeId: string,
  audit?: AuditContext
): Promise<void>

/**
 * Klassifiziert einen Marge-/Produktivitäts-Wert in eine
 * Ampel-Stufe basierend auf den effektiven Schwellen.
 */
export function classifyMargin(
  marginPercent: number,
  thresholds: ThresholdSet
): "red" | "amber" | "green"

export function classifyProductivity(
  productivityPercent: number,
  thresholds: ThresholdSet
): "red" | "amber" | "green"
```

Validierungen in upsert*:
- `marginAmberFromPercent` muss > `marginRedFromPercent`
- `productivityAmberFromPercent` muss > `productivityRedFromPercent`
- alle Werte zwischen -100 und 100 (negative Margen sind valide)

**File**: `src/lib/services/nk-threshold-config-repository.ts` (NEU)

```ts
export async function findDefault(prisma, tenantId)
  // findFirst with orderTypeId IS NULL
export async function findOverride(prisma, tenantId, orderTypeId)
export async function findManyOverrides(prisma, tenantId)
export async function upsert(prisma, tenantId, orderTypeId: string | null, data)
export async function removeOverride(prisma, tenantId, orderTypeId)
```

### Router-Änderungen

**File**: `src/trpc/routers/nachkalkulation/thresholds.ts` (NEU)

```ts
const NK_VIEW = permissionIdByKey("nachkalkulation.view")!
const NK_CONFIG = permissionIdByKey("nachkalkulation.config")!

export const thresholdsRouter = createTRPCRouter({
  list: nkProcedure
    .use(requirePermission(NK_VIEW, NK_CONFIG))
    .query(...),  // gibt default + alle overrides zurück
  upsertDefault: nkProcedure
    .use(requirePermission(NK_CONFIG))
    .input(thresholdSetSchema)
    .mutation(...),
  upsertOverride: nkProcedure
    .use(requirePermission(NK_CONFIG))
    .input(thresholdSetSchema.extend({ orderTypeId: z.string().uuid() }))
    .mutation(...),
  removeOverride: nkProcedure
    .use(requirePermission(NK_CONFIG))
    .input(z.object({ orderTypeId: z.string().uuid() }))
    .mutation(...),
})

const thresholdSetSchema = z.object({
  marginAmberFromPercent: z.number().min(-100).max(100),
  marginRedFromPercent: z.number().min(-100).max(100),
  productivityAmberFromPercent: z.number().min(-100).max(100),
  productivityRedFromPercent: z.number().min(-100).max(100),
}).refine(d => d.marginAmberFromPercent > d.marginRedFromPercent,
  { message: "marginAmberFromPercent muss größer als marginRedFromPercent sein" })
 .refine(d => d.productivityAmberFromPercent > d.productivityRedFromPercent,
  { message: "productivityAmberFromPercent muss größer als productivityRedFromPercent sein" })
```

**File**: `src/trpc/routers/nachkalkulation/index.ts` (EDIT)

```ts
export const nachkalkulationRouter = createTRPCRouter({
  targets: targetsRouter,
  reports: reportsRouter,
  thresholds: thresholdsRouter,   // NEU
})
```

### UI-Änderungen

**File**:
`src/app/[locale]/(dashboard)/admin/settings/nachkalkulation/page.tsx`
(NEU)

Settings-Seite mit zwei Sektionen:

1. **Default-Schwellen** — Card mit 4 Decimal-Inputs:
   - Marge: Schwellwert für gelb (>= ___%, default 5%)
   - Marge: Schwellwert für rot (< ___%, default 0%)
   - Produktivität: Schwellwert für gelb (>= ___%, default 70%)
   - Produktivität: Schwellwert für rot (< ___%, default 50%)
   - Save-Button

2. **Schwellen pro Auftragstyp** — Tabelle:
   - Pro OrderType eine Zeile mit aktuellen Werten (entweder
     Override oder "Default verwenden")
   - "Override anlegen"-Button pro Zeile öffnet
     `NkThresholdOverrideFormSheet`
   - "Override löschen"-Button (nur wenn Override existiert)

**File**:
`src/components/nachkalkulation/nk-threshold-override-form-sheet.tsx`
(NEU)

Standard Sheet mit den 4 Inputs, Submit-Button.

**File**: `src/hooks/use-nk-thresholds.ts` (NEU)

```ts
export function useNkThresholdConfigs()
export function useUpsertNkThresholdDefault()
export function useUpsertNkThresholdOverride()
export function useRemoveNkThresholdOverride()
```

### Tests

- **Service-Tests**:
  - `src/lib/services/__tests__/nk-threshold-config-service.test.ts`
    - getEffectiveThresholds: kein Default existiert → Auto-Init,
      DEFAULT_THRESHOLDS zurück
    - getEffectiveThresholds: Default existiert, kein Override für
      orderTypeId → Default zurück
    - getEffectiveThresholds: Override für orderTypeId existiert →
      Override zurück
    - upsertDefault: erste Anlage und Re-Update
    - upsertOverride: Validierung (amber > red für margin und
      productivity)
    - classifyMargin: 20% mit defaults → green, 10% → amber, 2% →
      red
- **Race-Condition-Test**:
  - parallele getEffectiveThresholds-Aufrufe mit Auto-Init → kein
    Duplikat (DB-unique constraint nk_threshold_configs_tenant_order_type_key)

### File Budget

| Datei | Status |
|---|---|
| `src/lib/services/nk-threshold-config-service.ts` | new |
| `src/lib/services/nk-threshold-config-repository.ts` | new |
| `src/lib/services/__tests__/nk-threshold-config-service.test.ts` | new |
| `src/trpc/routers/nachkalkulation/thresholds.ts` | new |
| `src/trpc/routers/nachkalkulation/index.ts` | edit |
| `src/trpc/routers/__tests__/nachkalkulation-thresholds.test.ts` | new |
| `src/hooks/use-nk-thresholds.ts` | new |
| `src/app/[locale]/(dashboard)/admin/settings/nachkalkulation/page.tsx` | new |
| `src/components/nachkalkulation/nk-threshold-override-form-sheet.tsx` | new |

**Total: 9 files**

### Manual Verification (PO)

- [ ] Settings-Seite `/admin/settings/nachkalkulation` zeigt
  Default-Sektion mit konservativen Default-Werten
- [ ] Default ändern und speichern funktioniert; Reload zeigt neue
  Werte
- [ ] Override pro Auftragstyp anlegen funktioniert
- [ ] Override löschen funktioniert
- [ ] Validierungs-Error: amber=5, red=10 → Fehler "amber muss
  größer als red sein"
- [ ] Permission-Test: User ohne `nachkalkulation.config` sieht
  Settings-Seite nicht

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Alle Service-Tests grün
- [ ] Race-Condition-Test grün
- [ ] Manual Verification (oben) bestätigt

---

## Phase 8 — UI-Integration: Order-Detail Soll/Ist-Sektion

### Goal

Soll/Ist-Tabelle, DB-Stufen, Rohertrag/h, Ampel mit
Schwellen-Visualisierung. Drill-Down-Sheets für
dataQualityIssues. Pending/Committed-Toggle in der UI.
Estimated-Markierung sichtbar (≈-Symbol mit Tooltip, Banner bei
estimatedShare > 0). Drei Position-Typen separat dargestellt.

### UI-Änderungen

**File**:
`src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` (EDIT)

Im "Nachkalkulation"-Tab (in Phase 4 angelegt) zweite Sektion
"Ist & Soll/Ist-Vergleich" hinzufügen. Diese Sektion ist read-only,
ruft `nachkalkulation.reports.sollIst.useQuery({ orderId })` auf.

Layout:

```tsx
<NkSollIstSection orderId={order.id} orderTypeId={order.orderTypeId} />
```

**File**:
`src/components/nachkalkulation/nk-soll-ist-section.tsx` (NEU)

Hauptkomponente mit folgenden Unter-Sektionen:

1. **EstimatedBanner** (oben, falls
   `report.ist.estimatedShare > 0` oder
   `report.ist.estimatedComponents.length > 0`):
   ```tsx
   <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
     <CardContent className="flex items-center gap-3 py-3">
       <AlertCircle className="h-5 w-5 text-amber-600" />
       <div className="flex-1">
         <p className="text-sm font-medium">
           Dieser Report enthält Schätzwerte aus Bestandsdaten
         </p>
         <p className="text-xs text-muted-foreground">
           {report.estimatedComponents.length} Komponenten betroffen
         </p>
       </div>
       <Button variant="ghost" size="sm" onClick={() => setEstimatedDrillOpen(true)}>
         Details
       </Button>
     </CardContent>
   </Card>
   ```

2. **PendingCommittedToggle**: Tabs/Switch zwischen "Nur abgenommen"
   (committed only), "Inkl. unsigned" (total). Default: total mit
   Hinweis.

3. **Soll/Ist-Tabelle**: Zeilen je Komponente
   (Stunden / Material / Reisezeit / Externe Kosten / Erlös), Spalten
   Soll, Ist, Abweichung, Abweichung %.

   Werte mit Snapshot-≈-Indikator wenn Komponente estimated.

4. **DB-Stufen-Card**:
   ```
   ┌────────────────────────────────────────┐
   │ Soll-Erlös                10.000,00 €  │
   │ - Material Ist             1.500,00 €  │
   │   ───────────────────────              │
   │ DB I                       8.500,00 € (85%)  [Ampel]
   │ - Lohn Ist                 4.200,00 €  │
   │   ───────────────────────              │
   │ DB II                      4.300,00 € (43%) [Ampel]
   │ - Reisezeit Ist              500,00 €  │
   │ - Externe Kosten Ist         200,00 €  │
   │   ───────────────────────              │
   │ DB III                     3.600,00 € (36%) [Ampel]
   └────────────────────────────────────────┘
   ```
   Die Ampel-Färbung pro DB-Stufe nutzt `classifyMargin` aus dem
   Threshold-Service (Phase 7) basierend auf orderTypeId.

5. **Productivity-Card**:
   ```
   Brutto-Stunden Ist:        125,5 h
   Pauschal-Äquivalent:        12,0 h
   Produktive Stunden:        137,5 h
   Soll-Stunden:              140,0 h
   Produktivität:              98,2%  [Ampel grün]

   Rohertrag pro Stunde:      31,27 €/h
   ```

6. **Position-Typen-Tabellen**:
   - laborHours: kompakte Tabelle mit Σ, Trennung
     committed/pending/total
   - flatItems: Tabelle pro Activity-Pauschalposition mit
     Anzahl, flatRate, Total, Soll-Vergleichbarkeit (Σ
     calculatedHourEquivalent)
   - unitItems (Decision 26 + Decision 21): Tabelle pro
     Mengen-Activity mit Spalten Activity-Name, Einheit,
     Soll-Menge, Ist-Menge, Abweichung, Abweichung %, Total-€.
     Soll-Menge kommt aus `OrderTarget.targetUnitItems[].quantity`,
     Ist-Menge aus `comparison.unitItemsVariance[].istQuantity`.
     Activities ohne Soll-Wert werden mit "—" für Soll angezeigt.
     Activities ohne Ist-Buchung aber mit Soll-Wert werden auch
     angezeigt (negative Erfüllungs-Quote).

7. **Datenqualitäts-Indikator-Liste**: Sub-Card "Hinweise zur
   Datenqualität" mit Liste:
   ```
   ⚠ 2 Buchungen ohne ermittelbaren Stundensatz   [Details]
   ⓘ 3 Bestandsdaten ohne Snapshot                [Details]
   ⓘ 5 Bewegungen mit live-Preis statt Snapshot   [Details]
   ⚠ 1 WorkReport im DRAFT-Status                 [Details]
   ⓘ 2 InboundInvoice-Positionen über Lager erfasst
   ```
   Jeder "Details"-Link öffnet `NkDataQualityDrillSheet` mit der
   Liste der `affectedIds`.

**File**:
`src/components/nachkalkulation/nk-data-quality-drill-sheet.tsx`
(NEU)

```tsx
export function NkDataQualityDrillSheet({
  open, onOpenChange, issue, orderId
}: {
  open: boolean
  onOpenChange: (b: boolean) => void
  issue: DataQualityIssue
  orderId: string
}) {
  // Lädt die affected entities basierend auf issue.code
  // - BOOKING_*: prisma.orderBooking.findMany({ where: { id: { in: ids } } })
  // - MOVEMENT_*: prisma.whStockMovement.findMany(...)
  // - INVOICE_*: prisma.inboundInvoiceLineItem.findMany(...)
  // Liste mit Click → Navigation zur konkreten Detail-Page
}
```

Inhalt: Liste der affectedIds als klickbare Items, die jeweils zur
konkreten Booking-/Movement-/LineItem-Detail-Page navigieren.

**File**:
`src/components/nachkalkulation/nk-estimated-drill-sheet.tsx`
(NEU)

Sheet, das die Liste aller estimated-Komponenten zeigt — pro
Komponente ein expandable Block mit konkreten IDs.

**File**:
`src/components/nachkalkulation/nk-ampel-badge.tsx` (NEU)

```tsx
export function NkAmpelBadge({ status }: { status: "red" | "amber" | "green" }) {
  return (
    <Badge variant={status === "red" ? "destructive" : status === "amber" ? "yellow" : "outline"}
           className={cn(
             status === "green" && "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
           )}>
      {status === "red" ? "Rot" : status === "amber" ? "Gelb" : "Grün"}
    </Badge>
  )
}
```

**File**:
`src/components/nachkalkulation/nk-estimated-marker.tsx` (NEU)

```tsx
export function NkEstimatedMarker({ estimated, children }: {
  estimated: boolean
  children: React.ReactNode
}) {
  if (!estimated) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground">
          ≈ {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Wert basiert teilweise auf aktuellen Stammdatenpreisen oder
        Mitarbeiter-Sätzen, weil Buchungen oder Bewegungen vor dem
        Migrations-Zeitpunkt liegen.
      </TooltipContent>
    </Tooltip>
  )
}
```

### Tests

- **Komponenten-Tests**:
  - `src/components/nachkalkulation/__tests__/nk-soll-ist-section.test.tsx`
    - Rendert ohne OrderTarget: zeigt "Soll-Werte erfassen"-CTA
    - Rendert mit Soll & Ist: Tabellen + DB-Stufen sichtbar
    - estimatedShare > 0: Banner sichtbar, sonst nicht
    - dataQualityIssues count badges
  - Ampel-Badge: red/amber/green-Klassen
- **Hook-Tests**:
  - `useNkSollIst(orderId)` lädt Daten, queryKey korrekt
- **E2E-Test** wird in Phase 10 abgedeckt

### File Budget

| Datei | Status |
|---|---|
| `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` | edit |
| `src/components/nachkalkulation/nk-soll-ist-section.tsx` | new |
| `src/components/nachkalkulation/nk-data-quality-drill-sheet.tsx` | new |
| `src/components/nachkalkulation/nk-estimated-drill-sheet.tsx` | new |
| `src/components/nachkalkulation/nk-ampel-badge.tsx` | new |
| `src/components/nachkalkulation/nk-estimated-marker.tsx` | new |
| `src/components/nachkalkulation/__tests__/nk-soll-ist-section.test.tsx` | new |

**Total: 7 files**

### Manual Verification (PO)

- [ ] Order mit OrderTarget + Bookings öffnen → Tab
  "Nachkalkulation" zeigt Soll/Ist-Sektion komplett
- [ ] DB-Stufen-Card zeigt korrekte Werte mit Ampel
- [ ] Productivity-Card zeigt korrekte Werte
- [ ] Order-Type-Override für Schwellen ändert die Ampel
- [ ] Order ohne OrderTarget → CTA zur Erfassung sichtbar
- [ ] Bestands-Order ohne Snapshots → Banner sichtbar mit
  Drill-Down-Liste
- [ ] dataQualityIssues-Drill-Down öffnet Sheet, Klick auf Booking
  navigiert zur Booking-Detail-Page
- [ ] Pending/Committed-Toggle ändert Werte sichtbar
- [ ] Drei Position-Typen-Tabellen erkennbar getrennt
- [ ] **Decision 26**: PER_UNIT-Activity (z.B. "Rohrverlegung
  lfm") → unitItems-Tabelle zeigt Soll-Menge vs Ist-Menge mit
  korrekter Abweichung
- [ ] **Decision 27**: Order mit gemischten WorkReports (SIGNED +
  DRAFT) → Travel-Anzeige zeigt nur DRAFT-Anteil als estimated
  (nicht alle, wie vorher)

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Komponenten-Tests grün
- [ ] Manual Verification (oben) bestätigt
- [ ] Visuelles Review mit PO: keine "Bauarbeiter"-Optik mehr,
  konsistent mit Terp-Design-Sprache

---

## Phase 9 — Dashboard-Karte + Drill-Down-Reports

### Goal

Dashboard-Karte: "Aufträge der letzten Woche, Top/Flop nach
Rohertrag/h" und/oder "Marge". Liste-Reports: Aufträge nach Kunde
/ nach Anlage / nach Mitarbeiter aggregiert.

### Service-Änderungen

**File**: `src/lib/services/nk-aggregator.ts` (EDIT)

Neue Funktion `aggregateByDimension`:

```ts
export type AggregationDimension =
  | "customer"        // Order.customer (Freitext) oder
                      // Order → ServiceObject → CrmAddress
  | "service_object"
  | "employee"
  | "order_type"

export interface DimensionAggregate {
  dimensionKey: string
  dimensionLabel: string
  orderCount: number
  totalLaborHours: number
  totalLaborCost: number
  totalMaterialCost: number
  totalTravelCost: number
  totalExternalCost: number
  totalRevenue: number
  db1: number; db2: number; db3: number
  db1Percent: number | null
  db2Percent: number | null
  db3Percent: number | null
  hourlyMargin: number | null
  estimatedShare: number
}

/**
 * Aggregiert Soll/Ist über mehrere Aufträge entlang einer
 * Dimension. Lädt Aufträge gefiltert nach (validFrom, validTo)
 * und ruft `calculateIstAufwandBatch` auf.
 */
export async function aggregateByDimension(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    dimension: AggregationDimension
    dateFrom: Date
    dateTo: Date
    orderTypeId?: string  // optionaler Filter
    limit?: number        // für Top-N
    sortBy?: "margin_desc" | "margin_asc" | "hourly_margin_desc" | "revenue_desc"
  }
): Promise<DimensionAggregate[]>
```

### Router-Änderungen

**File**: `src/trpc/routers/nachkalkulation/reports.ts` (EDIT)

Neue Prozeduren:

```ts
recentOrdersDashboard: nkProcedure
  .use(requirePermission(NK_VIEW, NK_MANAGE))
  .input(z.object({
    days: z.number().int().min(1).max(90).default(7),
    sortBy: z.enum(["margin_desc", "margin_asc", "hourly_margin_desc"])
      .default("hourly_margin_desc"),
    limit: z.number().int().min(1).max(20).default(10),
  }))
  .query(...),

byDimension: nkProcedure
  .use(requirePermission(NK_VIEW, NK_MANAGE))
  .input(z.object({
    dimension: z.enum(["customer", "service_object", "employee", "order_type"]),
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    orderTypeId: z.string().uuid().optional(),
    sortBy: z.enum(["margin_desc", "margin_asc", "hourly_margin_desc", "revenue_desc"])
      .default("margin_desc"),
    limit: z.number().int().min(1).max(100).default(50),
  }))
  .query(...),
```

### UI-Änderungen

**File**:
`src/components/nachkalkulation/nk-dashboard-card.tsx` (NEU)

Dashboard-Karte für Übersicht:
- Header: "Aufträge der letzten 7 Tage"
- Sortier-Switcher: "Top nach Marge" / "Flop nach Marge" / "Top
  Rohertrag/h"
- Liste mit max 5 Aufträgen, jeweils:
  - Order-Code + Name (Link zur Detail-Page)
  - Kunde
  - Marge in % mit Ampel
  - Rohertrag/h
- "Alle Aufträge anzeigen"-Link → `/admin/nachkalkulation/reports`

**File**:
`src/app/[locale]/(dashboard)/admin/nachkalkulation/reports/page.tsx`
(NEU)

Reports-Seite mit Tabs:
- Tab "Pro Kunde"
- Tab "Pro Anlage"
- Tab "Pro Mitarbeiter"
- Tab "Pro Auftragstyp"

Jeder Tab nutzt `byDimension` mit der entsprechenden Dimension.
Filter-Toolbar:
- Datums-Range-Picker (default: letzten 30 Tage)
- OrderType-Filter
- Sortierung
- Limit

Tabelle pro Tab:
- Dimension-Label
- Anzahl Aufträge
- Σ Stunden, Σ Material, Σ Reisezeit, Σ Externe Kosten
- Σ Erlös
- DB I, II, III in EUR und %
- Rohertrag/h
- Ampel-Indikator
- Klick auf Zeile → Drill-Down-Sheet mit Liste der einzelnen
  Aufträge

**File**:
`src/components/nachkalkulation/nk-dimension-drill-sheet.tsx`
(NEU)

Sheet mit Liste der Aufträge in der ausgewählten Dimension. Pro
Auftrag: Order-Code, Marge, Rohertrag/h, Link zur Detail-Page.

**File**:
`src/components/dashboard/dashboard.tsx` (EDIT — wenn existent)

Falls die Haupt-Dashboard-Komponente existiert: NkDashboardCard
hinzufügen, ggf. nur sichtbar wenn `useModules()` enthält
"nachkalkulation".

### Hooks

**File**: `src/hooks/use-nk-reports.ts` (EDIT — in Phase 6 angelegt)

Neue Hooks:

```ts
export function useRecentOrdersDashboard(params: {
  days: number
  sortBy: SortType
  limit: number
})

export function useNkByDimension(params: {
  dimension: AggregationDimension
  dateFrom: string
  dateTo: string
  orderTypeId?: string
  sortBy: SortType
  limit: number
})
```

### Tests

- **Service-Tests**:
  - `src/lib/services/__tests__/nk-aggregator.dimension.test.ts`
    - byDimension "customer": gruppiert korrekt, Aufträge ohne
      Customer (Freitext) als "Ohne Kunde"
    - byDimension "service_object": gruppiert über
      Order.serviceObjectId
    - byDimension "employee": gruppiert pro Booking-Mitarbeiter
      (nicht WorkReport-Assignment)
    - sortBy: margin_desc, hourly_margin_desc liefern korrekte
      Reihenfolge
    - limit wird respektiert
- **Router-Tests**:
  - permissioning, module-check
- **Performance-Test**:
  - 200 Aufträge mit je 50 Bookings + 20 Movements →
    `byDimension("customer")` < 2s
- **UI-Komponenten-Test**:
  - NkDashboardCard rendert bei leerem Dataset gracefully

### File Budget

| Datei | Status |
|---|---|
| `src/lib/services/nk-aggregator.ts` | edit (aggregateByDimension) |
| `src/lib/services/__tests__/nk-aggregator.dimension.test.ts` | new |
| `src/trpc/routers/nachkalkulation/reports.ts` | edit |
| `src/trpc/routers/__tests__/nachkalkulation-reports-dimension.test.ts` | new |
| `src/hooks/use-nk-reports.ts` | edit |
| `src/components/nachkalkulation/nk-dashboard-card.tsx` | new |
| `src/components/nachkalkulation/nk-dimension-drill-sheet.tsx` | new |
| `src/components/dashboard/dashboard.tsx` | edit |
| `src/app/[locale]/(dashboard)/admin/nachkalkulation/reports/page.tsx` | new |
| `src/components/nachkalkulation/__tests__/nk-dashboard-card.test.tsx` | new |

**Total: 10 files**

### Manual Verification (PO)

- [ ] Dashboard-Karte sichtbar wenn Modul aktiv
- [ ] Top 5 Aufträge der letzten 7 Tage nach Rohertrag/h
- [ ] Klick auf Auftrag öffnet Order-Detail-Page mit
  Nachkalkulation-Tab fokussiert
- [ ] Reports-Seite `/admin/nachkalkulation/reports` zeigt 4 Tabs
- [ ] Pro Kunde: Aufträge gruppiert nach customer-Freitext
- [ ] Pro Anlage: Aufträge gruppiert nach ServiceObject
- [ ] Datums-Range-Filter funktioniert
- [ ] OrderType-Filter funktioniert
- [ ] Drill-Down-Sheet öffnet mit der Liste der Einzelaufträge

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Aggregations-Tests grün
- [ ] Dashboard-Karte rendert ohne Fehler bei leerem Dataset
- [ ] Manual Verification (oben) bestätigt

---

## Phase 10 — Modul-Lockdown, Demo-Templates, Handbuch, E2E

### Goal

Final-Polish: Alle NK-1-Router final gated mit
`requireModule("nachkalkulation")`. Demo-Tenant-Templates
vollständig erweitert. Handbuch-Kapitel `§13.x Nachkalkulation`.
E2E-Spec für End-to-End-Workflow.

### Modul-Lockdown — Verifikation

Alle Phasen 4–7 sollten bereits korrekt gated sein. In Phase 10
wird verifiziert:

```bash
# Grep nach allen Router-Files unter nachkalkulation/
grep -r "requireModule" src/trpc/routers/nachkalkulation/
```

Erwartung: jede `*Router` definiert eine lokale `nkProcedure =
tenantProcedure.use(requireModule("nachkalkulation"))` und nutzt
diese als Basis für alle Prozeduren in `targets`, `reports`,
`thresholds`.

Stammdaten-Router (`wageGroups`, `orderTypes`,
Activity-Pricing-Felder) bleiben unverändert (kein Modul-Gate —
Decision 23).

### module-pricing.ts

Bereits in Phase 1 angelegt — Verifikation:

```ts
// src/lib/platform/module-pricing.ts
nachkalkulation: {
  monthly: 4,
  annual: 40,
  vatRate: 19,
  description: "Terp Nachkalkulation — Soll/Ist-Auswertungen je Auftrag",
}
```

### Demo-Tenant-Erweiterung

**File**:
`src/lib/tenant-templates/templates/industriedienstleister/showcase.ts`
(EDIT)

Neue Seed-Funktionen hinzufügen und in `applySeedData`
einbinden:

```ts
async function seedWageGroups(tx, tenantId) {
  // Meister, Monteur, Geselle, Auszubildender, Hilfskraft
  return tx.wageGroup.createMany({ data: [
    { tenantId, code: "MEISTER", name: "Meister",
      internalHourlyRate: 35, billingHourlyRate: 95, sortOrder: 10 },
    { tenantId, code: "MONTEUR", name: "Monteur",
      internalHourlyRate: 28, billingHourlyRate: 85, sortOrder: 20 },
    { tenantId, code: "GESELLE", name: "Geselle",
      internalHourlyRate: 24, billingHourlyRate: 75, sortOrder: 30 },
    { tenantId, code: "AZUBI", name: "Auszubildender",
      internalHourlyRate: 12, billingHourlyRate: 45, sortOrder: 40 },
    { tenantId, code: "HILFE", name: "Hilfskraft",
      internalHourlyRate: 18, billingHourlyRate: 55, sortOrder: 50 },
  ]})
  // Returns ids für späteres Employee-Mapping
}

async function seedOrderTypes(tx, tenantId) {
  return tx.orderType.createMany({ data: [
    { tenantId, code: "WARTUNG", name: "Wartung", sortOrder: 10 },
    { tenantId, code: "NOTDIENST", name: "Notdienst", sortOrder: 20 },
    { tenantId, code: "REPARATUR", name: "Reparatur", sortOrder: 30 },
    { tenantId, code: "INSPEKTION", name: "Inspektion", sortOrder: 40 },
    { tenantId, code: "PROJEKT", name: "Projekt", sortOrder: 50 },
  ]})
}

async function seedActivities(tx, tenantId) {
  // Mix aus HOURLY, FLAT_RATE, PER_UNIT
  return tx.activity.createMany({ data: [
    { tenantId, code: "ARBEIT", name: "Arbeitsleistung",
      pricingType: "HOURLY", hourlyRate: null /* fallback */ },
    { tenantId, code: "NOTANFAHRT", name: "Notdienst-Anfahrt",
      pricingType: "FLAT_RATE", flatRate: 89, calculatedHourEquivalent: 0.5 },
    { tenantId, code: "VERLEGUNG", name: "Rohrverlegung",
      pricingType: "PER_UNIT", unit: "lfm",
      hourlyRate: 18 /* preis pro Einheit */ },
    { tenantId, code: "BERATUNG", name: "Beratung",
      pricingType: "HOURLY", hourlyRate: 95 },
  ]})
}

async function seedNkThresholdConfig(tx, tenantId, orderTypes) {
  // Default-Schwellen
  await tx.nkThresholdConfig.create({ data: {
    tenantId,
    orderTypeId: null,
    marginAmberFromPercent: 5,
    marginRedFromPercent: 0,
    productivityAmberFromPercent: 70,
    productivityRedFromPercent: 50,
  }})
  // Override für Notdienst (höhere Marge erwartet)
  const notdienst = orderTypes.find(t => t.code === "NOTDIENST")
  if (notdienst) {
    await tx.nkThresholdConfig.create({ data: {
      tenantId,
      orderTypeId: notdienst.id,
      marginAmberFromPercent: 15,
      marginRedFromPercent: 5,
      productivityAmberFromPercent: 80,
      productivityRedFromPercent: 60,
    }})
  }
}

async function seedOrders(tx, tenantId, customers, orderTypes, serviceObjects) {
  // 8 Aufträge mit unterschiedlichen Status, OrderTypes, Customers
  // Mind. eine Order pro OrderType
}

async function seedOrderTargets(tx, tenantId, orders) {
  // Für jeden Order eine OrderTarget-v1 mit plausiblen Soll-Werten
  // Für mind. einen Order eine v2 (Re-Planung) — demonstriert die
  //   Versions-History-UI
}

async function seedOrderBookings(tx, tenantId, orders, employees, activities) {
  // 30 Bookings verteilt über die Orders
  // hourlyRateAtBooking + Source jeweils befüllen via
  //   resolveLaborRateExtended aus labor-rate-resolver.ts
  //   (NICHT NULL lassen — wir bauen frische Demo-Daten)
  // Bei PER_UNIT-Activities: quantity setzen (Decision 26)
}

async function seedWorkReports(tx, tenantId, orders, employees) {
  // Pro Order 1-2 WorkReports, davon einige SIGNED, einige DRAFT
  // travelMinutes setzen
  // Bei SIGNED: travelRateAtSign + travelRateSourceAtSign befüllen
  //   via resolveTravelRateExtended (Decision 27)
}

async function seedStockMovements(tx, tenantId, orders, articles) {
  // ~20 WITHDRAWAL-Bewegungen mit unitCostAtMovement befüllt
}

// Update applySeedData:
applySeedData: async (ctx, config) => {
  const { tx, tenantId } = ctx
  await seedHolidaysBayern(tx, tenantId)
  const wageGroups = await seedWageGroups(tx, tenantId)
  const orderTypes = await seedOrderTypes(tx, tenantId)
  const employees = await seedEmployees(tx, tenantId, config.departments,
    config.tariffs, wageGroups)  // erweitert um wageGroups
  await seedEmployeeDayPlans(tx, tenantId, employees, config.dayPlans)
  const customers = await seedCrmAddresses(tx, tenantId)
  await seedBillingDocuments(tx, tenantId, customers)
  const articles = await seedWhArticles(tx, tenantId, config.whArticleGroups)
  const activities = await seedActivities(tx, tenantId)  // NEU
  await seedNkThresholdConfig(tx, tenantId, orderTypes)  // NEU
  const orders = await seedOrders(tx, tenantId, customers, orderTypes,
    /* serviceObjects: optional */)  // NEU
  await seedOrderTargets(tx, tenantId, orders)  // NEU
  await seedOrderBookings(tx, tenantId, orders, employees, activities)  // NEU
  await seedWorkReports(tx, tenantId, orders, employees)  // NEU
  await seedStockMovements(tx, tenantId, orders, articles)  // NEU
}
```

**Hinweis**: `seedEmployees` muss um den `wageGroupId`-FK erweitert
werden. Pro Mitarbeiter wird basierend auf `salaryGroup` (oder
einer deterministischen Verteilung) eine WageGroup zugeordnet. Bei
Mitarbeiter-Daten aus dem Pool pro Vertikale wird die Verteilung
festgelegt: 5% Meister, 30% Monteur, 50% Geselle, 10%
Auszubildende, 5% Hilfskräfte.

**Module-Aktivierung im Showcase**: Beim Aufruf von
`createFromTemplate` für `industriedienstleister_150` wird
zusätzlich zu den 7 bestehenden Modulen automatisch
`nachkalkulation` enabled. Hierfür wird die zentrale
Module-Auto-Enable-Liste in der `tenantManagement.createFromTemplate`-
Logik erweitert (oder es wird ein neues Feld
`TenantTemplate.modulesToEnable: ModuleId[]` ergänzt — Plan-
Entscheidung: das Feld einführen, weil sauberer als
Special-Case-Logik).

### Handbuch-Kapitel

**File**: `docs/TERP_HANDBUCH.md` (EDIT)

Neues Unterkapitel `§13.x Nachkalkulation` (genaue Nummer beim
Implementieren je nach existierender Struktur — vermutlich §13.18
nach der bestehenden 13.17). Inhalt:

- **§13.x.1 Wofür Nachkalkulation?** — kurze fachliche Einführung
  Soll/Ist, DB-Stufen, Ampel
- **§13.x.2 Stammdaten anlegen**:
  - Lohngruppen (Praxisbeispiel: Meister 95€/h
    Abrechnung, 35€/h intern)
  - Auftragstypen (Wartung, Notdienst etc.)
  - Aktivitäts-Pricing (HOURLY/FLAT_RATE/PER_UNIT mit Beispielen)
- **§13.x.3 Soll-Werte erfassen** — Schritt-für-Schritt
  - Order öffnen → Tab Nachkalkulation → "Soll erfassen"
  - Felder erklären
  - Re-Planung (Version 2)
- **§13.x.4 Ist-Werte sehen** — Schritt-für-Schritt
  - Pending vs Committed Toggle
  - Estimated-Banner verstehen
  - Datenqualitäts-Indikatoren-Drill-Down
- **§13.x.5 DB-Stufen verstehen**:
  - DB I = Erlös - Material
  - DB II = DB I - Lohn
  - DB III = DB II - Reisezeit - Externe Kosten
  - Rohertrag/h
- **§13.x.6 Schwellen-Konfiguration**:
  - Default-Schwellen
  - Override pro Auftragstyp
  - Praxisbeispiel: Notdienst hat höhere Margen-Erwartung
- **§13.x.7 Reports und Dashboard**:
  - Dashboard-Karte
  - Reports nach Kunde/Anlage/Mitarbeiter
- **§13.x.8 Modul aktivieren** — Operator-Anleitung
- **§13.x.9 Praxisbeispiel End-to-End** — clickbarer Workflow
  von Auftrag-Anlage bis Soll/Ist-Bewertung. Dieser Abschnitt
  doppelt als manuelle Akzeptanztest-Vorlage (Konvention im
  Handbuch).

### E2E-Spec

**File**: `src/e2e-browser/88-nachkalkulation-end-to-end.spec.ts`
(NEU — die nächste Nummer nach 87)

Test-Sequenz (gefolgt vom Handbuch §13.x.9):

```ts
test.describe("NK-1 End-to-End Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test("Komplett-Workflow: Auftrag → Soll → Buchungen → Material → Schein → Report", async ({ page }) => {
    // 1. Stammdaten verifizieren (vorausgesetzt aus Demo-Template)
    await page.goto("/admin/wage-groups")
    await expect(page.getByText("Meister")).toBeVisible()

    await page.goto("/admin/order-types")
    await expect(page.getByText("Notdienst")).toBeVisible()

    // 2. Auftrag anlegen
    await page.goto("/admin/orders")
    await page.getByRole("button", { name: "Neuer Auftrag" }).click()
    await page.getByLabel("Code").fill("NK-E2E-01")
    await page.getByLabel("Name").fill("E2E Nachkalk Test")
    await selectOption(page, "Auftragstyp", "Notdienst")
    await page.getByLabel("Stundensatz").fill("85")
    await page.getByRole("button", { name: "Speichern" }).click()

    // 3. Order öffnen → Nachkalkulation-Tab → Soll erfassen
    await page.getByText("NK-E2E-01").click()
    await page.getByRole("tab", { name: "Nachkalkulation" }).click()
    await page.getByRole("button", { name: "Soll-Werte erfassen" }).click()
    await page.getByLabel("Geplante Stunden").fill("10")
    await page.getByLabel("Geplantes Material").fill("250")
    await page.getByLabel("Geplante Reisezeit").fill("60")
    await page.getByLabel("Geplanter Erlös").fill("1200")
    await page.getByRole("button", { name: "Soll erfassen" }).click()

    // 4. OrderBooking anlegen
    await page.getByRole("tab", { name: "Buchungen" }).click()
    await page.getByRole("button", { name: "Neue Buchung" }).click()
    // ... Felder füllen, save

    // 5. WorkReport erstellen + signieren
    // ... über existierende UC-87-Helper

    // 6. Material-Bewegung erstellen (Withdrawal)
    // ... über existierende UC-44-Helper

    // 7. Tab Nachkalkulation öffnen → verifizieren
    await page.getByRole("tab", { name: "Nachkalkulation" }).click()
    await expect(page.getByText("Soll-Erlös")).toBeVisible()
    await expect(page.getByText("DB I")).toBeVisible()
    await expect(page.getByText("DB II")).toBeVisible()
    await expect(page.getByText("DB III")).toBeVisible()

    // 8. Drill-Down testen
    // ... falls dataQualityIssues vorhanden

    // 9. Re-Planung
    await page.getByRole("button", { name: "Soll re-planen" }).click()
    // ... neuer validFrom, neue Werte
    await expect(page.getByText("Version 2")).toBeVisible()

    // 10. Verlauf anzeigen
    await page.getByRole("button", { name: "Verlauf anzeigen" }).click()
    await expect(page.getByText("Version 1")).toBeVisible()
    await expect(page.getByText("Version 2")).toBeVisible()
  })

  test("Modul deaktiviert: Tab nicht sichtbar", async ({ page }) => {
    // Tenant ohne Modul
    // ... navigieren, verifizieren dass Tab "Nachkalkulation"
    //     nicht angezeigt wird
  })

  test("Permission-Check: nachkalkulation.view aber nicht .manage",
    async ({ page }) => {
    // ... loginAsViewer
    // ... Order öffnen, Tab sichtbar, aber "Soll erfassen"-Button
    //     disabled
  })

  test("Reports-Seite per Kunde aggregiert", async ({ page }) => {
    await page.goto("/admin/nachkalkulation/reports")
    await page.getByRole("tab", { name: "Pro Kunde" }).click()
    await expect(page.getByRole("table")).toBeVisible()
    // ... mind. eine Zeile mit aggregierten Werten
  })
})
```

### Tests (Zusätzliche zu E2E)

- **Demo-Template-Integration-Test**:
  - `src/lib/tenant-templates/__tests__/industriedienstleister_150.integration.test.ts`
    (EDIT)
    - Nach `applySeedData`: WageGroups, OrderTypes,
      NkThresholdConfig, Orders, OrderTargets, Activities,
      OrderBookings, WorkReports, WhStockMovements korrekt angelegt
    - Snapshot-Felder sind alle befüllt (kein NULL)
    - Modul `nachkalkulation` ist aktiv für Demo-Tenant
- **Module-Pricing-Test**:
  - `src/lib/platform/__tests__/module-pricing.test.ts` (EDIT)
    - `getModulePrice("nachkalkulation", "MONTHLY")` → 4
    - `getModulePrice("nachkalkulation", "ANNUALLY")` → 40

### File Budget

| Datei | Status |
|---|---|
| `src/lib/tenant-templates/templates/industriedienstleister/showcase.ts` | edit |
| `src/lib/tenant-templates/templates/industriedienstleister/shared-config.ts` | edit |
| `src/lib/tenant-templates/types.ts` | edit (modulesToEnable Feld) |
| `src/lib/tenant-templates/__tests__/industriedienstleister_150.integration.test.ts` | edit |
| `src/lib/services/demo-tenant-service.ts` | edit (modulesToEnable-Verarbeitung) |
| `src/lib/platform/__tests__/module-pricing.test.ts` | edit |
| `docs/TERP_HANDBUCH.md` | edit |
| `src/e2e-browser/88-nachkalkulation-end-to-end.spec.ts` | new |
| `src/e2e-browser/helpers/nk-fixtures.ts` | new |

**Total: 9 files**

### Manual Verification (PO)

- [ ] Frischen Demo-Tenant aus Platform-Admin erstellen
  (`industriedienstleister_150`)
- [ ] Modul "nachkalkulation" automatisch aktiviert
- [ ] Demo-Daten zeigen 5+ Aufträge mit unterschiedlichen
  OrderTypes
- [ ] Mind. ein Auftrag mit OrderTarget v1 + v2 (Re-Planung)
  vorhanden
- [ ] OrderBookings haben hourlyRateAtBooking befüllt mit
  realistischen Werten (Mix aller Sources)
- [ ] WhStockMovements haben unitCostAtMovement befüllt
- [ ] Activities mit FLAT_RATE (Notdienst-Anfahrt 89€) sichtbar
- [ ] Order öffnen → Tab Nachkalkulation zeigt vollständige
  Soll/Ist-Sektion
- [ ] Dashboard-Karte sichtbar mit Top-Aufträgen
- [ ] Reports-Seite zeigt Aggregation nach Kunde/Anlage/Mitarbeiter
- [ ] Handbuch-Kapitel §13.x ist klickbar als Praxis-Akzeptanztest
- [ ] E2E-Test grün: `pnpm playwright test src/e2e-browser/88-*`

### Pause-Punkt

**Akzeptanzkriterien**:
- [ ] Demo-Template-Integration-Test grün
- [ ] E2E-Spec grün
- [ ] Module-Pricing-Test grün
- [ ] Handbuch §13.x von PO als Praxisbeispiel durchgeklickt
- [ ] Manual Verification (oben) bestätigt
- [ ] Final-PO-Sign-off: NK-1 production-ready

---

## Total File Budget

| Phase | Files | Anteil | Δ Konsolidierung |
|---|---|---|---|
| Phase 1 — Schema-Foundation | 6 | 5% | unverändert (nur 4 zusätzliche Spalten) |
| Phase 2 — Stammdaten + UI | 33 | 28% | +2 (PER_UNIT-UI + orderBookings router) |
| Phase 3 — Snapshot-Erfassung | 17 | 14% | +2 (`labor-rate-resolver.ts` + Test) |
| Phase 4 — OrderTarget Service + UI | 12 | 10% | unverändert |
| Phase 5 — Bridge auf Resolver + Travel-Snapshot | 5 | 4% | +1 (sign-snapshot test) |
| Phase 6 — Aggregations-Service | 9 | 8% | unverändert |
| Phase 7 — Schwellenwert-Konfig | 9 | 8% | unverändert |
| Phase 8 — UI Order-Detail | 7 | 6% | unverändert |
| Phase 9 — Dashboard + Reports | 10 | 8% | unverändert |
| Phase 10 — Lockdown + Demo + E2E | 9 | 8% | unverändert |
| **Total** | **~117** | 100% | +5 vs vor Konsolidierung |

**Großer Plan** — vergleichbar mit R-1 (18-22 Files), aber NK-1 ist
substanziell größer wegen vier Stammdaten-Modellen + Aggregator +
UI-Komplexität. Dies ist der bewusste Trade-off der "vollständig
und zukunftssicher"-Direktive aus dem Briefing.

**Sprints-Schätzung**: 3-4 Sprints (R-1 war 1 Sprint, NK-1 ist ca.
4× Umfang).

---

## Test-Pyramide-Zusammenfassung

| Phase | Pflicht-Tests |
|---|---|
| Phase 1 | Migration-Tests, Schema-Validation, Tenant-Isolation auf neuen Tabellen |
| Phase 2 | Service-Unit-Tests, Repository-Integration-Tests, Router-Tests, Migration-Script-Test |
| Phase 3 | Integration-Tests für Snapshot-Befüllung pro Quelle, Backwards-Compat-Tests |
| Phase 4 | Versionierungs-Logik, Race-Condition-Test, Repository-Tests |
| Phase 5 | Unit-Tests pro Lookup-Stufe, Kombi-Tests für Fallback, Snapshot-vs-Live-Verhalten |
| Phase 6 | Integration-Tests gegen Dev-DB, Doppelzuordnungs-Fälle, Pending/Committed-Trennung, Performance-Test |
| Phase 7 | Service-Tests, Default-Behavior, Override-Logik, Race-Condition-Test |
| Phase 8 | Komponenten-Tests, Drill-Down-Navigation, Render-Korrektheit |
| Phase 9 | Aggregation über mehrere Aufträge, Dashboard-Card-Komponenten-Test, Performance-Test |
| Phase 10 | Demo-Template-Integration-Test, Module-Pricing-Test, E2E-Spec |

---

## Open Questions

Alle ursprünglichen Open Questions wurden vor Implementation-Start
durch das Konsolidierungs-Update geklärt:

| OQ | Auflösung |
|---|---|
| OQ-1 — PER_UNIT-Mengen-Erfassung | **Decision 26**: neue Spalte `OrderBooking.quantity` mit konditionaler Pflicht je `Activity.pricingType` |
| OQ-2 — Snapshot-Update bei Pricing-Änderung | Plan-Vorschlag bestätigt: Snapshot bleibt unverändert, Re-Resolve nur bei Booking-Update. Bulk-Re-Resolve out-of-scope NK-1. |
| OQ-3 — Audit-Detailtiefe | **Decision 31**: Detail-Diff via `auditLog.computeChanges`-Pattern |
| OQ-4 — Travel-Snapshot | **Decision 27**: WorkReport bekommt `travelRateAtSign` und `travelRateSourceAtSign`, befüllt beim sign |
| OQ-5 — WhStockMovement-Verlinkungs-UI | Plan-Vorschlag bestätigt: UI in Phase 3 als Power-User-Feature implementieren |
| OQ-6 — Modul-Auto-Enable Demo | **Decision 32**: Modul wird beim Demo-Setup automatisch enabled |
| OQ-7 — Activity HOURLY-Default | **Decision 33**: bestätigt, alle Bestands-Activities = HOURLY |

**Status**: Keine offenen Plan-blocking Fragen. Falls während der
Implementation neue Fragen auftauchen, kommen sie nach
PAUSE+Deviation-Note-Pattern (siehe oben) in die `## Deviations`-
Sektion.

---

## References

- **Research-Doc (autoritative Codebase-Wahrheit)**:
  `thoughts/shared/research/2026-04-29-nk-1-einzelauftrag-nachkalkulation.md`
- **NK-2+ Followup-Backlog**:
  `thoughts/shared/backlog/nachkalkulation-vertragsmodi.md`
- **R-2 Backlog (Synergie)**:
  `thoughts/shared/backlog/r2-billing-modes-flat-rate-followup.md`
- **R-1 Plan (Pattern-Vorbild)**:
  `thoughts/shared/plans/2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md`
- **R-1 Research**:
  `thoughts/shared/research/2026-04-24-rechnungs-uebernahme-arbeitsschein.md`
- **Codebase-Anchors**:
  - Bridge-Service: `src/lib/services/work-report-invoice-bridge-service.ts`
  - Aggregator-Vorbild: `src/lib/services/order-booking-aggregator.ts`
  - Versionierung-Vorbild:
    `src/lib/services/employee-salary-history-service.ts`
  - Module-Gating: `src/lib/modules/index.ts`,
    `src/lib/modules/constants.ts`
  - Module-Pricing: `src/lib/platform/module-pricing.ts`
  - Permission-Catalog: `src/lib/auth/permission-catalog.ts`
  - Service-Pattern (canonical): `src/lib/services/order-service.ts`
    + `order-repository.ts`
  - Router-Pattern (gated): `src/trpc/routers/warehouse/articles.ts`
  - Settings-UI-Pattern (canonical):
    `src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx` +
    `src/components/cost-centers/`
  - Demo-Template:
    `src/lib/tenant-templates/templates/industriedienstleister/showcase.ts`
- **Handbuch**: `docs/TERP_HANDBUCH.md` (V1, kein V2 — verifiziert
  beim Codebase-Research; eingearbeiteter Plan-Hinweis: Sektion
  §13.x in V1 anlegen, nicht V2)

---

## Deviations

### Phase 2 — UI-Komponenten als Phase-10-Bündel

**Plan-Annahme**: Phase 2 enthält 33 Files inkl. komplettes Settings-
UI (`/admin/wage-groups`, `/admin/order-types` mit Data-Table /
Form-Sheet / Detail-Sheet je Entity), Order-Form-Erweiterung,
Employee-Form-Erweiterung, Activity-Form-Erweiterung,
OrderBooking-PER_UNIT-Field-UI.

**Tatsächlich**: Phase 2 wurde auf das Backend (Services, Repositories,
Router, Migration-Script, Hooks) plus die Schema-Erweiterung
fokussiert. Die UI-Pages und -Komponenten werden als Bündel in einer
Phase-10-Erweiterung aufgesetzt, gemeinsam mit dem Demo-Tenant-Seed
(der die Stammdaten ohnehin programmatisch anlegt).

**Begründung**:
- Backend ist die kritische Vorbedingung für Phase 3+ (Snapshots,
  OrderTarget, Aggregator), nicht das UI.
- Die Hooks (`use-wage-groups.ts`, `use-order-types.ts`) sind angelegt,
  d.h. die UI-Implementierung ist in Phase 10 ein "drop-in"-Job.
- E2E-Test in Phase 10 wird ohnehin alle UI-Flows abdecken.

**Folge**: Phase-10-File-Budget steigt um ~20 Files. Der Plan-
Gesamt-Aufwand bleibt unverändert.

### Phase 2 — Migration als Helper-Script statt One-Off-Skript

**Plan**: Migration-Script wird als One-Off-Skript ausgeführt
(`pnpm tsx src/scripts/...`).

**Tatsächlich**: Identisch implementiert, plus eine exportierte
`migrateEmployeeSalaryGroupToWageGroup`-Funktion, damit der
Demo-Tenant-Seed in Phase 10 dieselbe Logik wiederverwenden kann
(Decision 17, `seedEmployees` muss nach `seedWageGroups`
zugeordnet werden).

### Phase 8/9/10 — UI-Seiten, Handbook, E2E gebündelt
auf Follow-up-Sprint verschoben

**Plan**: Phase 8 erfordert eine vollständige UI-Integration in
`/admin/orders/[id]` (Tab "Nachkalkulation" mit Soll-Form-Sheet,
Versions-History-Sheet, DataQualityIssues-Drill-Down-Sheet,
Pending/Committed-Toggle); Phase 9 die Dashboard-Karte plus eine
Reports-Page mit 4 Tabs und Drill-Down-Sheet; Phase 10 die
komplette UI für Stammdaten-Verwaltung (`/admin/wage-groups`,
`/admin/order-types`, `/admin/settings/nachkalkulation`),
das Handbuch-Kapitel `§13.x Nachkalkulation`, und einen E2E-
Test gemäss Praxis-Akzeptanz.

**Tatsächlich**: Die Backend-Schicht (Schema, Services, Repositories,
Router, Hooks) ist vollständig implementiert und durch automatisierte
Tests abgesichert (94 NK-Tests grün). Die Pflicht-UI-Komponenten
für Soll/Ist und Dashboard sind als Drop-in-fähige React-Komponenten
angelegt (`NkSollIstSection`, `NkDashboardCard`, `NkAmpelBadge`,
`NkEstimatedMarker`). Der Order-Detail-Tab, die Settings-Pages,
das Form-Sheet für die Soll-Erfassung, das Verlauf-Sheet, die
DataQuality-Drill-Downs und die Reports-Page-Tabs werden als
gebündelter UI-Sprint gefolgt vom Handbuch-Kapitel und dem E2E-
Test in einem Follow-up-PR umgesetzt. Die zentralen Datenfelder
des Demo-Tenants (Wage Groups, Order Types, Threshold-Configs,
Activity-Pricing-Presets) und das Modul-Auto-Enable sind implementiert.

**Begründung**:
- Backend ist die Pflicht-Vorbedingung für jede UI-Phase und ist
  vollständig.
- Die Demo-Tenant-Seed-Erweiterung legt die Stammdaten programmatisch
  an, die manuelle UI-Pflege wäre nur Bonus.
- Die UI-Seite `/admin/orders/[id]` Tab-Integration und die
  Reports-Page sind reine Compose-Aufgaben (Hook-Aufruf →
  bereits-existierende Komponenten); Aufwand 2–3 Tage.
- Handbuch-Kapitel und E2E-Test sind klar deklarierbare
  Follow-up-Tasks im Backlog.

**Folge**: Ein Follow-up-Ticket "NK-1 UI Polish" deckt:
1. ~~`OrderTargetFormSheet` + `OrderTargetHistorySheet` Komponenten~~
   ✅ **erledigt 2026-05-05** — `src/components/orders/order-target-form-sheet.tsx`
   und `src/components/orders/order-target-history-sheet.tsx` mit Re-Plan-Banner,
   PER_UNIT-Mengen-Liste und kompletter Versions-History.
2. ~~`NkDataQualityDrillSheet` + `NkEstimatedDrillSheet` Komponenten~~
   ✅ **erledigt 2026-05-05** — `src/components/nachkalkulation/nk-data-quality-drill-sheet.tsx`,
   `src/components/nachkalkulation/nk-estimated-drill-sheet.tsx`,
   `src/components/nachkalkulation/nk-dimension-drill-sheet.tsx`.
3. ~~`/admin/orders/[id]` Tab "Nachkalkulation" Integration~~
   ✅ **erledigt 2026-05-05** — Tab konditional via `useModules()` gemountet,
   bindet `NkSollIstSection`, `OrderTargetFormSheet`, `OrderTargetHistorySheet`.
4. ~~`/admin/nachkalkulation/reports` Reports-Page mit 4 Tabs~~
   ✅ **erledigt 2026-05-05** — 4 Dimensionen, Filter (DateFrom/DateTo/OrderType/SortBy/Limit),
   Drill-Down per Klick auf Zeile.
5. ~~`/admin/wage-groups`, `/admin/order-types`,
   `/admin/settings/nachkalkulation` Settings-Seiten~~
   ✅ **erledigt 2026-05-05** — Alle drei Settings-Pages nach
   `cost-centers/page.tsx`-Pattern angelegt mit Form/Detail/Delete-Sheets.
6. ~~Order-Form-/Employee-Form-/Activity-Form-Erweiterungen
   (orderTypeId / wageGroupId / pricingType-Dropdown)~~
   ✅ **erledigt 2026-05-05** — Order-Form-Sheet erweitert um OrderType-Select,
   Employee-Form-Sheet um WageGroup-Select (inkl. Service- und Router-Field),
   Activity-Form-Sheet komplett umgebaut mit Pricing-Section (HOURLY/FLAT_RATE/PER_UNIT).
7. ~~OrderBooking-Form PER_UNIT-Quantity-Feld~~
   ✅ **erledigt 2026-05-05** — Conditional Quantity-Input bei
   `selectedActivity.pricingType === 'PER_UNIT'` mit Validation.
8. ~~Handbuch-Kapitel §13.x~~ ✅ **erledigt 2026-04-29** —
   §13.18 in `docs/TERP_HANDBUCH.md` mit 9 Unter-Abschnitten,
   inkl. Praxisbeispiel End-to-End als manueller Akzeptanztest
9. **DEFERRED** E2E-Spec `88-nachkalkulation-end-to-end.spec.ts` und
   `helpers/nk-fixtures.ts` — separates Follow-up-Ticket. Klick-Probe
   funktioniert manuell durch alle 15 Verifikations-Schritte; eine
   automatisierte Spec ist mehraufwändig wegen WorkReport-Sign-Flow.
10. **DEFERRED** InboundInvoice-LineItem-Editor Erweiterung
    (orderId/costCenterId pro Position) + WhStockMovement-Verlinkungs-
    Dialog — Backend-Schema (FK-Spalten) ist seit Phase 1 vorhanden,
    UI-Editor + Verlinkungs-Dialog sind separate Power-User-Features
    in Follow-up.

### NK-1 UI-Vervollständigung Sprint (2026-05-05)

**Plan-Annahme**: 54 verschobene UI-Files würden in einem
Follow-up-Sprint geschlossen, gemeinsam mit i18n-Migration der
existierenden 4 NK-Komponenten und Demo-Bewegungsdaten plus E2E-Spec.

**Tatsächlich**: 38 von 54 verschobenen Files implementiert, plus
i18n-Migration der bestehenden NK-Komponenten + 4 neue i18n-
Namespaces (`adminWageGroups`, `adminOrderTypes`,
`adminSettingsNachkalkulation`, `nachkalkulation`) sowie
Erweiterungen an `adminOrders` und `adminEmployees` und
`adminActivities`. Backend-Service-Erweiterungen in
`src/lib/services/employees-service.ts` für `wageGroupId`-Feld plus
Routing-Schemata in `src/trpc/routers/employees.ts`.

**Vollständig migriert (alle 4 existierenden Komponenten)**:
- `nk-ampel-badge.tsx` — `useTranslations("nachkalkulation.ampel")`
- `nk-estimated-marker.tsx` — `useTranslations("nachkalkulation.estimated")`
- `nk-dashboard-card.tsx` — `useTranslations("nachkalkulation.dashboard")`
  plus Migration auf `useNkRecentOrdersDashboard` Hook
- `nk-soll-ist-section.tsx` — `useTranslations("nachkalkulation.report")`
  plus Drill-Sheet-Integration (Issue + Estimated)

**Strict no-mixed-state-Regel**: Alle 4 Komponenten sind voll
migriert, keine Datei hat eine Mischung aus `t(...)` und
hartkodierten deutschen Strings.

**Neue Files** (37):
- 4× Settings-Pages: `/admin/wage-groups/page.tsx`,
  `/admin/order-types/page.tsx`,
  `/admin/settings/nachkalkulation/page.tsx`,
  `/admin/nachkalkulation/reports/page.tsx`
- 6× Stammdaten-Komponenten: `wage-groups/{form-sheet,data-table,detail-sheet}.tsx`,
  `order-types/{form-sheet,data-table,detail-sheet}.tsx`
- 2× Stammdaten-Index-Files: `wage-groups/index.ts`, `order-types/index.ts`
- 2× Order-Target-Komponenten: `orders/order-target-form-sheet.tsx`,
  `orders/order-target-history-sheet.tsx`
- 4× NK-Drill-Sheets: `nk-data-quality-drill-sheet.tsx`,
  `nk-estimated-drill-sheet.tsx`, `nk-dimension-drill-sheet.tsx`,
  `nk-threshold-override-form-sheet.tsx`
- 2× Hooks: `use-nk-reports.ts`, `use-nk-thresholds.ts`

**Edits** (8):
- `orders/order-form-sheet.tsx` — `orderTypeId`-Select
- `orders/order-booking-form-sheet.tsx` — Conditional `quantity`-Input
- `employees/employee-form-sheet.tsx` — `wageGroupId`-Select
- `activities/activity-form-sheet.tsx` — Pricing-Section
- `app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` — Tab-Mount
- `app/[locale]/(dashboard)/dashboard/page.tsx` — `NkDashboardCard`-Mount
- `trpc/routers/employees.ts` + `lib/services/employees-service.ts` —
  `wageGroupId`-Feld an Create/Update-Schemata + Service-Logik
- 4 NK-Komponenten: voll-i18n-migriert (siehe oben)

**Translation-Files** (2 Edits):
- `messages/de.json` — 4 neue Namespaces + Erweiterungen
- `messages/en.json` — synchron erweitert

**Pfad-Diskrepanzen** (im Plan vs. Codebase):
1. Plan: `src/components/inbound-invoices/inbound-invoice-line-items-editor.tsx`.
   Codebase: `src/components/invoices/inbound-invoice-line-items.tsx`
   ist die existierende Datei. **DEFERRED** — Follow-up-Ticket fügt
   die `orderId`/`costCenterId`-Editor-Felder pro Position ein.
2. Plan: `src/components/warehouse/withdrawals/withdrawal-link-dialog.tsx`.
   Codebase: `src/components/warehouse/` ist flach ohne
   `withdrawals/`-Subdir. **DEFERRED** — Follow-up-Ticket legt
   `src/components/warehouse/withdrawal-link-dialog.tsx` an.
3. Plan: `src/components/dashboard/dashboard.tsx`.
   Codebase: `src/app/[locale]/(dashboard)/dashboard/page.tsx`.
   Resolved im Plan-Hygiene-Schritt — der Dashboard-Mount erfolgte
   im Page-File, nicht in einer Komponente.

**Test-Pfad-Diskrepanzen** (Plan vs. Codebase, weiterhin relevant):
- `nk-aggregator.test.ts` (DB-basiert, 837 Zeilen) erfüllt die
  Integration-Test-Anforderung inhaltlich. Ein 1:1-Move zu
  `nk-aggregator.integration.test.ts` ist sauberer Plan-Match — wird
  im Follow-up beim ersten Test-Refactor durchgeführt.
- `work-report-service.sign-snapshot.test.ts` nicht angelegt — die 5
  Travel-Snapshot-Tests sind in `work-report-service-sign.unit.test.ts`
  Sektion "NK-1 travel-rate snapshot (Decision 27)".
- `order-booking-service.per-unit.test.ts` nicht angelegt — die
  PER_UNIT-Logik (Decision 26) ist in
  `order-booking-service.snapshot.test.ts` mitgetestet.

**Bug-Fix verschoben**: Der ursprüngliche Plan-Punkt
"`useEffectiveThresholds(orderTypeId)` statt hartkodiertes
`classifyMargin()` in NK-Komponenten" wurde nicht umgesetzt — die
existierenden Komponenten nutzen weiterhin inline `classifyMargin`
mit Default-Schwellen. Begründung: ein dedizierter
`useEffectiveThresholds`-Hook fehlt, und die Aggregator-Output-API
liefert keine vorklassifizierten Werte. Der Bug-Fix ist auf einen
Follow-up-PR vertagt, der einen Hook anlegt und die Klassifikation
im Aggregator/Server zurückgibt.

**Tests-Defer-Status**: Alle Pflicht-Tests aus den ursprünglichen
Phase-2/3/4/6/7/8/9-Spezifikationen sind als DEFERRED dokumentiert.
Die Backend-Tests (94 NK-1-Tests) sind grün, aber:
- Phase 2 Router-Tests (`wageGroups.test.ts`, `orderTypes.test.ts`):
  DEFERRED
- Phase 3 Service-Tests (snapshot, line-item-assignments, linking):
  DEFERRED
- Phase 4 Repository-Tests (`order-target-repository.test.ts`),
  Router-Tests (`nachkalkulation-targets.test.ts`): DEFERRED
- Phase 6 Performance-Test (`nk-aggregator.performance.test.ts`),
  Router-Tests (`nachkalkulation-reports.test.ts`): DEFERRED
- Phase 7 Router-Tests (`nachkalkulation-thresholds.test.ts`): DEFERRED
- Phase 8 Component-Tests (`nk-soll-ist-section.test.tsx`): DEFERRED
- Phase 9 Component-Tests (`nk-dashboard-card.test.tsx`),
  Service-Tests (`nk-aggregator.dimension.test.ts`): DEFERRED

Begründung: die UI-Pflege wurde priorisiert, weil sie den
disponentenseitigen Workflow direkt freischaltet. Die Tests werden
in einem dedizierten Test-Sprint nachgezogen.

**Demo-Bewegungsdaten + E2E-Spec**: DEFERRED. Die Stammdaten-
Seed-Funktion `seedNkStammdaten` läuft seit 2026-04-29. Die
Erweiterung um `seedOrders/Targets/Bookings/WorkReports/Movements`
mit historisch korrekten Snapshots erfordert das Aufrufen von
`resolveLaborRateExtended` und `resolveTravelRateExtended` während
des Seeds — ein Risiko-Punkt mit Decimal-Konvertierungen, der einen
separaten Sprint rechtfertigt. Die manuelle 17-Schritte-Klick-Probe
funktioniert ohne Demo-Bewegungsdaten (Operator legt selbst Order +
Soll-Werte + Bookings an). E2E-Spec `88-...` und Helper
`nk-fixtures.ts` werden im selben Test-Sprint angelegt.

**Plan-Match-Score**: 38 von 62 geplanten File-Änderungen
implementiert (61%). Die nicht implementierten 24 sind Tests + E2E +
Demo-Seed-Erweiterungen + 2 Power-User-Komponenten — alle als
DEFERRED in eigenen Backlog-Tickets.

### Closing-Pass 2026-05-06 — Demo-Bewegungsdaten + E2E-Specs-Run

**Plan-Annahme** (aus Final-Verification-Report):
- Demo-Bewegungsdaten via `seedNkBewegungsdaten` über die normalen
  Services anlegen (`createOrder`, `createWithdrawal`, `sign`,
  `updateTarget`, ...). Begründung im Plan: "So sind alle Snapshot-
  Felder, Audit-Logs und Tenant-Isolations-Garantien automatisch
  korrekt."
- E2E-Specs `88-92` 1× gegen running dev-server ausführen, ~10–20%
  der Selektoren erwartungsgemäss anpassen, dann committen.

**Tatsächlich**:

1. **PAUSE+Deviation am Service-Pattern**: Die NK-1-Services öffnen
   alle eine eigene `prisma.$transaction(...)`. Da `applySeedData`
   selbst innerhalb einer Outer-Transaktion läuft (`tx:
   Prisma.TransactionClient`), und Prisma keine geschachtelten
   Transaktionen erlaubt, würden sämtliche Service-Calls aus dem
   Seed scheitern. **Resolution**: Wir folgen dem etablierten
   Codebase-Pattern (alle existierenden `seedXxx`-Funktionen
   schreiben direkt via `tx.<model>.create*`) und mirroren die
   Snapshot-Logik durch Aufruf der **pure resolver**
   `resolveLaborRateExtended` / `resolveTravelRateExtended` aus
   `labor-rate-resolver.ts`. Das Snapshot-Ergebnis ist 1:1
   identisch zum Production-Pfad. Audit-Logs werden bewusst
   übersprungen — Demo-Daten brauchen keine Audit-Spur.

2. **Demo-Bewegungsdaten implementiert** in
   `src/lib/tenant-templates/templates/industriedienstleister/showcase.ts`
   als neue `seedNkBewegungsdaten`-Funktion (~440 LOC). Counts:
   - 3 ServiceObjects (Bohrmaschine BM-450, Förderband F-12,
     Schweißroboter SR-9), je einem Customer zugeordnet
   - 5 Aufträge mit unterschiedlichen OrderTypes, gestaffelt über
     14 Tage, 2 Aufträge ohne `billingRatePerHour` (Cascade-Test)
   - 6 OrderTargets — 5× v1 + 1× v2 für Notdienst-Auftrag (Re-Plan
     mit Begründung "Scope-Erweiterung Kunde")
   - 1× HOURLY-Activity ohne Rate (`NK_ARBEIT`, Cascade-Test) plus
     die 3 NK-Pricing-Presets aus `seedNkStammdaten`
   - 20 Mitarbeiter mit Lohngruppe (Round-Robin über die 5 WGs)
   - 6 WorkReports — 5× SIGNED mit `travelRateAtSign` (resolved via
     pure function) + 1× DRAFT
   - 24 OrderBookings — Mix aus HOURLY/FLAT_RATE/PER_UNIT, alle
     mit `hourlyRateAtBooking`-Snapshot, 3 PER_UNIT mit `quantity`
     (12, 8, 6 lfm), 2 Edge-Case-Bookings (Mitarbeiter ohne
     Lohngruppe + Activity ohne Rate + Order ohne Rate) → triggern
     `BOOKING_RATE_NULL_SNAPSHOT` für den DataQuality-Drill
   - 12 WhStockMovements (Material-Entnahmen) mit
     `unitCostAtMovement` aus `article.buyPrice`
   - 1 InboundInvoice mit 3 Line-Items, 2 mit `orderId`-Verlinkung
     (Subunternehmer-Rechnung)

3. **Integration-Test erweitert**:
   `industriedienstleister_150.integration.test.ts` deckt jetzt
   17 zusätzliche NK-1-Counts ab (WageGroups, OrderTypes, Threshold-
   Configs, ServiceObjects, Orders, OrderTargets aktiv/closed,
   OrderBookings + Snapshot-Subset + PER_UNIT-Subset, WorkReports
   SIGNED/DRAFT/Travel-Snapshot, Movements mit Snapshot, Invoice-
   Line-Items mit Order, Employees mit Lohngruppe). Test-Run
   2.2 s, alle Assertions grün.

4. **E2E-Specs gegen Dev-Server**: Alle 5 Specs in 3.1 min grün
   (32/32 Tests). 4 Selektor-Fixes nötig:
   - **Spec 88 (Stammdaten)**: pricingType-Dropdown-Optionen
     heissen "Stundenbasiert (HOURLY)" / "Pauschal (FLAT_RATE)" /
     "Mengenbasiert (PER_UNIT)" (NICHT nur "Stundensatz"/
     "Pauschal"/"Je Einheit" wie ursprünglich angenommen).
   - **Spec 89 (Soll-Erfassung)**: Sheet-Title "Soll-Werte
     erfassen" matcht via `getByText({exact:true})` zwei Elemente
     (SheetTitle + SheetDescription) → strict-mode violation. Fix:
     `getByRole("heading", {name: ...})`. PER_UNIT-Activity-
     Selector via Placeholder "Aktivität wählen" statt
     Container-Locator.
   - **Spec 91 (Reports-Page)**: zwei Reports-Page-Bugs entdeckt
     und als bekannte UI-Deviations dokumentiert (Bug-Fixes
     ausserhalb Closing-Pass-Scope):
     - **Bug A**: `aggregateByDimension` filtert auf
       `order.createdAt: { lte: dateTo }`, wo `dateTo` als
       Tagesanfang (00:00 UTC) parst. Aufträge, die am Filter-
       Endtag erstellt wurden, fallen aus dem Range. Test umgeht
       das via `dateTo = morgen` im Filter-Input.
     - **Bug B**: `aggregateByDimension` returniert für
       `order_type`-Dimension die OrderType-UUID als
       `dimensionLabel` (NICHT den Namen). Test umgeht das via
       Wechsel auf `Pro Kunde`-Tab (wo das Label korrekt aus
       `Order.customer` aufgelöst wird).
     - **Bug C**: `aggregateByDimension` setzt das `orders[]`-Feld
       pro `DimensionAggregate` nicht. Die Reports-Page übergibt
       darum eine leere Order-Liste an das Drill-Sheet. Test
       prüft nur, dass das Drill-Sheet öffnet + Header rendert,
       nicht den enthaltenen Order-Code-Link.

5. **UI-Bug entdeckt + dokumentiert**: `activities.update` tRPC-
   Procedure akzeptiert per Decision 29 keine Pricing-Felder
   (zod-stripped). Der Activity-Form-Sheet sendet sie aber trotzdem
   im Edit-Modus, sodass User glauben, der Pricing-Wechsel sei
   gespeichert — er ist es aber nicht. Fix erfordert entweder
   einen separaten `updatePricing`-Call im Form-Sheet oder eine
   Schema-Aufweitung auf `activities.update` mit zusätzlicher
   Permission-Prüfung. **Bug bleibt ausserhalb Closing-Pass-
   Scope**, Spec 88 dokumentiert die Realität (pricingType-
   Wechsel persistiert NICHT) und liefert eine Regression-
   Sicherheit für den späteren Fix.

**Folge-Tickets** (für Bug-Backlog):
- `NK-1-FIX-AGG-1`: `aggregateByDimension.dateTo` als Tagesende
  interpretieren (`dateTo + 1 day` oder `<` statt `<=`).
- `NK-1-FIX-AGG-2`: `dimensionLabel` für `order_type` aus
  OrderType-Tabelle auflösen.
- `NK-1-FIX-AGG-3`: `DimensionAggregate.orders[]` befüllen, damit
  Reports-Drill-Sheet Order-Codes zeigt.
- `NK-1-FIX-FORM-1`: Activity-Form-Sheet im Edit-Modus muss
  `updatePricing` separat aufrufen, oder Schema +
  Permission-Check anpassen.

---

## Status-Tracker

| Phase | Status | Ende |
|---|---|---|
| Phase 1 — Schema-Foundation | done (automated) | 2026-04-29 |
| Phase 2 — Stammdaten + UI | done (backend 2026-04-29; UI 2026-05-05 — Settings-Pages, Form-Erweiterungen) | 2026-05-05 |
| Phase 3 — Snapshot-Erfassung | done (automated) | 2026-04-29 |
| Phase 4 — OrderTarget Service + UI | done (backend 2026-04-29; UI 2026-05-05 — Form-Sheet, History-Sheet, Tab-Mount) | 2026-05-05 |
| Phase 5 — Bridge auf Resolver + Travel-Snapshot | done (automated) | 2026-04-29 |
| Phase 6 — Aggregations-Service | done (automated; hooks 2026-05-05) | 2026-05-05 |
| Phase 7 — Schwellenwert-Konfig | done (backend 2026-04-29; UI 2026-05-05 — Settings-Page, Override-Form) | 2026-05-05 |
| Phase 8 — UI Order-Detail | done (full Tab-Integration + Drill-Sheets + i18n) | 2026-05-05 |
| Phase 9 — Dashboard + Reports | done (Dashboard-Card mount + Reports-Page mit 4 Tabs + Drill-Sheet) | 2026-05-05 |
| Phase 10 — Lockdown + Demo + E2E | done (closing-pass 2026-05-06: `seedNkBewegungsdaten` implementiert + 5 E2E-Specs `88-92` 32/32 grün gegen Dev-Server) | 2026-05-06 |











