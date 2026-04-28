---
topic: Konfigurierbare Abrechnungsmodi (Stundenlohn / Pauschal / Mischbetrieb)
status: backlog
source_plan: thoughts/shared/plans/2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md
related_research: thoughts/shared/research/2026-04-24-rechnungs-uebernahme-arbeitsschein.md
priority: high
estimated_size: medium (1 sprint for R-2 minimum scope)
created: 2026-04-28
created_by: discussion during R-1 manual verification kickoff
---

# R-2: Konfigurierbare Abrechnungsmodi (Folge-Ticket zu R-1)

## Kontext für eine neue Session

R-1 ("Rechnungs-Übernahme aus Arbeitsschein") wurde am 2026-04-27
implementiert und am 2026-04-28 manuell verifiziert. Während der
Vorbereitung der Verifikation kam vom Product Owner die Frage:
**"Was wenn ein Unternehmen ohne Stundensätze arbeitet?"**

Diese Frage deckt eine bewusste Lücke auf, die R-1 als
"out of scope" markiert hat (siehe `## What We're NOT Doing` im
R-1-Plan). Dieses Backlog-Dokument hält die Diskussion fest und
liefert einer zukünftigen Session genug Kontext, um direkt in die
Research-/Plan-Phase einzusteigen, ohne die Diskussion neu zu führen.

**Was eine neue Session zuerst tun sollte**:
1. R-1-Plan + zugehöriges Research-Doc lesen (siehe Frontmatter)
2. Diesen Eintrag komplett lesen
3. Codebase-Research starten mit den unter "Files to investigate"
   gelisteten Anchors
4. Optional Web-Research für Konkurrenz-Patterns (siehe "Competitor
   patterns to validate")
5. Plan erstellen unter `thoughts/shared/plans/YYYY-MM-DD-r2-billing-modes.md`

---

## Problem

R-1 ist **stundensatz-zentriert** designed:

```ts
// Aus src/lib/services/work-report-invoice-bridge-service.ts
// (computeProposedPositions)
//
// Stundensatz-Chain:
// 1. order.billingRatePerHour (wenn gesetzt)
// 2. employee.hourlyRate (wenn gesetzt)
// 3. null → unitPrice = 0 + requiresManualPrice = true
//
// Quantity = timeMinutes / 60 (in Stunden)
// Unit = "h"
// Type = BillingPositionType.FREE
```

**Konsequenz**: Unternehmen, die **niemals** mit Stundensätzen
arbeiten, sondern mit:
- **Pauschalpreisen** ("Reparatur Heizung 250 EUR fest")
- **Aufmaß-Abrechnung** ("13,5 m² verlegt × 28 EUR/m²")
- **Tätigkeits-Pauschalen** ("Anfahrt Notdienst 89 EUR pauschal")
- **Stunden-Kontingenten / Service-Verträgen** ("4h/Monat im Vertrag inkl.")

können R-1 zwar nutzen, aber nur über **manuelles Editieren im
Generate-Dialog bei jedem Vorgang**:
- Alle Auto-Positionen entfernen
- Manuelle Position(en) anlegen
- Beschreibung + Menge + Einheit + Preis manuell eintragen

Das funktioniert technisch (R-1 lässt das zu), ist aber **kein
"1-Klick"-Workflow mehr** und widerspricht dem Spirit der R-1-User-Story.

---

## Hintergrund: Was Wettbewerber im DACH-Markt machen

Drei wiederkehrende Patterns aus der Marktbeobachtung
(Handwerker-/Service-ERPs, B2B-Field-Service-PSA-Tools).
**Diese Patterns sollten in der Research-Phase mit Web-Suche /
Doku-Studium konkret validiert werden** — die Beschreibungen hier
basieren auf typischen Industrie-Conventions, nicht auf
Feature-Audit jedes einzelnen Produkts.

### Pattern 1 — `Order.billingMode`-Enum (häufigster Pattern)

Auftrag bekommt ein Pflichtfeld:

```
Abrechnungsart: ⚪ Stundenlohn  ⚪ Pauschal  ⚪ Aufmaß  ⚪ Stundenlohn + Festpreisanteil
```

Diese Konfig steuert das Default-Verhalten beim Generate.

**Bei `Pauschal`**: Auto-Übernahme der Stunden-Buchungen wird
unterdrückt; stattdessen wird ein einzelner Festpreis-Posten aus
`Order.fixedPrice` vorgeschlagen. Buchungen bleiben für interne
Zeitkontrolle erhalten, fließen aber nicht in die Rechnung ein.

**Bei `Aufmaß`**: Generate-Dialog bietet ein "Aufmaß-Schritt"-Feld
(Menge × Einheit × Preis) statt Stunden.

**Bei `Hybrid` (Stundenlohn + Festpreisanteil)**: Beides — Stunden-
Buchungen werden vorgeschlagen, plus eine zusätzliche Festpreis-
Position aus `Order.fixedPriceComponent`.

**Vermutete Wettbewerber mit diesem Pattern** (zu validieren):
- HERO Software (Handwerker-ERP)
- mfr by Sander & Doll
- TopKontor Handwerk
- Lexware Handwerk

### Pattern 2 — Pricing pro Tätigkeit / Activity

`Activity` (Leistungsart) bekommt eigene Preisfelder:

```ts
model Activity {
  pricingType: HOURLY | FLAT_RATE | PER_UNIT
  flatRate:    Decimal?  // bei FLAT_RATE
  hourlyRate:  Decimal?  // override für Order/Employee
  unit:        String?   // bei PER_UNIT (z.B. "m²", "lfm", "Stk")
}
```

**Stärke**: Erlaubt Mischbetrieb auf demselben Schein —
"Notdienst-Anfahrt = 89 EUR pauschal" + "Reparatur = 75 EUR/h" auf
demselben WorkReport, automatisch korrekt vorgeschlagen.

**Schwäche**: Mehr Stammdaten-Pflege; jede neue Tätigkeit braucht
Preis-Setup.

**Vermutete Wettbewerber mit diesem Pattern** (zu validieren):
- Odoo (Service Products mit `Invoice Policy`)
- Salesforce Field Service (Work Type mit Preisfeldern)

### Pattern 3 — Customer-Master / Service-Vertrag

Pro Kunde (oder pro langlaufendem Vertrag) ein Preisprofil mit
Sonderkonditionen:

```ts
model CustomerBillingAgreement {
  customerId
  hourlyRate?         // Customer-spezifischer Stundensatz
  flatTravelFee?      // "Anfahrtspauschale 50 EUR"
  freeTravelMinutes?  // "erste 30 Min frei"
  weekendSurcharge?
  contractedHoursMonthly?  // Stunden-Kontingent
  ...
}
```

**Stärke**: B2B-Standard für PSA/MSP-Markt — jeder Kunde hat seinen
Vertrag, Sonderkonditionen werden automatisch angewandt.

**Schwäche**: Komplex; erst sinnvoll bei vielen Kunden mit
unterschiedlichen Konditionen.

**Vermutete Wettbewerber mit diesem Pattern** (zu validieren):
- ConnectWise Manage (PSA)
- Halo PSA
- Atera (MSP)

---

## Konfigurations-Hierarchie (Industrie-Standard)

Die meisten ERPs implementieren eine **mehrstufige Vererbung** beim
Pricing-Lookup. Stand der Industrie:

```
1. Position-Override (im Generate-Dialog)         ← höchste Priorität, einmalig
2. Activity.flatRate / Activity.hourlyRate        ← pro Tätigkeit
3. CustomerAgreement.hourlyRate                   ← pro Kunde
4. Order.billingRatePerHour / Order.fixedPrice    ← pro Auftrag
5. Employee.hourlyRate                            ← pro Mitarbeiter (Fallback)
6. Tenant.defaultHourlyRate                       ← Tenant-Default
7. → Manuelle Eingabe erzwingen                   ← letzter Notfall
```

**Stand R-1**: implementiert nur die Stufen **1, 4, 5, 7**.
**Fehlend**: 2 (Activity), 3 (Customer-Agreement), 6 (Tenant-Default).

---

## Empfehlung: Stufenweiser Roadmap

Nicht alles auf einmal. Stufenweise nach Business-Value:

| Ticket | Scope | Aufwand | Business-Value |
|---|---|---|---|
| **R-2** | `Order.billingMode` enum + `Order.fixedPrice` Decimal? + Generate-Dialog respektiert Mode | Klein (1 Sprint) | **Höchster** — deckt häufigste Pauschal-Anforderung |
| **R-3** | Tenant-weiter Default-VAT in `BillingTenantConfig` (siehe `IN-3` im R-1-Plan) | Trivial | Mittel — häufiger Wunsch |
| **R-4** | `Activity.pricingType` + `Activity.flatRate` (baut auf R-2 auf) | Mittel | Mittel — für Mischbetriebe |
| **R-5** | `CustomerBillingAgreement` Tabelle | Groß | Niedrig zunächst — erst sinnvoll bei 5+ Kunden mit Sonderkonditionen |
| **R-6** | Material-Übernahme aus `WhStockMovement` (im R-1-Plan erwähnt; FK existiert bereits) | Mittel | Hoch für Aufmaß-Aufträge |

**Priorisierung**: R-2 zuerst, weil:
1. Häufigste Konkurrenz-Feature-Lücke im DACH-Handwerker-Markt
2. Aufwand überschaubar (ein Schema-Add + Generate-Dialog erweitern)
3. Voraussetzung für R-4 (Activity-Pricing baut auf Order-Level-Mode auf)
4. Löst das konkrete Problem aus dem PO-Gespräch

---

## R-2 Minimum Scope (für eine erste Implementation)

### Schema-Erweiterung

```prisma
enum OrderBillingMode {
  HOURLY       // Stundenlohn (heutiger Default — BACKWARDS-COMPATIBLE)
  FLAT_RATE    // Pauschal (Order.fixedPrice MUSS gesetzt sein)
  MIXED        // Stundenlohn + Festpreisanteil (beide gesetzt)
}

model Order {
  // ...existierende Felder
  billingMode  OrderBillingMode  @default(HOURLY) @map("billing_mode")
  fixedPrice   Decimal?          @db.Decimal(10, 2) @map("fixed_price")
  // billingRatePerHour bleibt unverändert (für HOURLY + MIXED)
}
```

**Migration**: `ALTER TABLE orders ADD COLUMN billing_mode TEXT NOT
NULL DEFAULT 'HOURLY'` — alle bestehenden Orders bekommen automatisch
`HOURLY`, kein Verhaltens-Regress.

### Bridge-Service Erweiterung

`computeProposedPositions()` in
`src/lib/services/work-report-invoice-bridge-service.ts` muss den
`order.billingMode` lesen und entsprechend verzweigen:

```ts
switch (order.billingMode) {
  case "HOURLY":
    // Heutiger Pfad: pro Booking eine Labor-Position aus timeMinutes
    return [...laborPositions, ...travelPosition]

  case "FLAT_RATE":
    if (order.fixedPrice == null) {
      throw new OrderFixedPriceMissingPreconditionFailedError()
    }
    // EINE Festpreis-Position
    return [{
      kind: "fixed",
      description: `Pauschale: ${order.title}`,
      quantity: 1,
      unit: "Pauschale",
      unitPrice: Number(order.fixedPrice),
      vatRate: VAT_DEFAULT,
      requiresManualPrice: false,
    }]

  case "MIXED":
    // Festpreis-Anteil + Stunden für Mehrarbeit
    const fixedPart = { kind: "fixed", ..., unitPrice: order.fixedPrice }
    const hourlyParts = [...laborPositions]  // wie HOURLY
    return [fixedPart, ...hourlyParts, ...travelPosition]
}
```

`ProposedPosition`-Type um `kind: "fixed"` erweitern.

### tRPC-Schema

`positionOverrideSchema` in `src/trpc/routers/workReports.ts` um
`"fixed"` erweitern:

```ts
const positionOverrideSchema = z.object({
  kind: z.enum(["labor", "travel", "manual", "fixed"]),  // ← +"fixed"
  // ...
})
```

### UI

**Order-Form** (`src/components/orders/order-form-sheet.tsx` o.ä.):
- Dropdown "Abrechnungsart": Stundenlohn / Pauschal / Stundenlohn + Pauschalanteil
- Bei `FLAT_RATE` oder `MIXED`: zusätzliches Feld "Festpreis (EUR)"
- Validierung: `FLAT_RATE` ohne `fixedPrice` → BAD_REQUEST

**Generate-Dialog**
(`src/components/work-reports/work-report-generate-invoice-dialog.tsx`):
- Header zeigt aktiven Mode: "Abrechnung: Pauschal (250,00 EUR)"
- Bei `FLAT_RATE`: Vorschlags-Liste enthält 1 Festpreis-Position,
  Stunden-Buchungen werden NICHT vorgeschlagen
- Hinweis-Banner bei `FLAT_RATE`: "Stunden-Buchungen werden bei
  Pauschal-Abrechnung nicht in die Rechnung übernommen. Sie können
  bei Bedarf manuell ergänzen."

**OrderBooking-Form**: keine Änderung nötig — Buchungen bleiben für
interne Zeitkontrolle. UI sollte aber bei Pauschal-Auftrag
informativ darauf hinweisen, dass Buchungen nicht abgerechnet werden.

### Tests

- Unit-Tests für jeden `billingMode` in `bridge-service.test.ts`
- Integration-Test: Pauschal-Auftrag → Generate → 1 Position
- Integration-Test: Mixed → Generate → Festpreis + Stunden
- Router-Test: `Order.create` ohne `fixedPrice` bei `FLAT_RATE` → BAD_REQUEST
- E2E: Order mit `FLAT_RATE` anlegen → WorkReport → Generate → 1 Position

---

## File Budget Schätzung (R-2 minimum)

| # | Datei | Status | Bereich |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | edit | Schema |
| 2 | `supabase/migrations/<ts>_add_order_billing_mode.sql` | new | Schema |
| 3 | `src/lib/services/work-report-invoice-bridge-service.ts` | edit | Service |
| 4 | `src/lib/services/__tests__/work-report-invoice-bridge-service.test.ts` | edit | Test |
| 5 | `src/lib/services/__tests__/work-report-invoice-bridge-service.integration.test.ts` | edit | Test |
| 6 | `src/lib/services/order-service.ts` (oder `orders.ts`) | edit | Service |
| 7 | `src/trpc/routers/orders.ts` | edit | Router |
| 8 | `src/trpc/routers/workReports.ts` | edit | Router (positionOverrideSchema) |
| 9 | `src/components/orders/order-form-sheet.tsx` | edit | UI |
| 10 | `src/components/work-reports/work-report-generate-invoice-dialog.tsx` | edit | UI |
| 11 | `src/e2e-browser/specs/<n>-order-flat-rate-billing.spec.ts` | new | E2E |
| 12 | `docs/TERP_HANDBUCH.md` (oder `_V2`) | edit | Doku |

**Geschätzt: 12 Files, ~1 Sprint** (kleiner als R-1's 18 Files).

---

## Files to investigate (Codebase-Research-Anchors)

Eine zukünftige Session sollte mit diesen Stellen anfangen:

| Anchor | Was zu prüfen ist |
|---|---|
| `prisma/schema.prisma:2566-2605` (`Order` model) | Heutige Felder, ob `customerAddressId` doch existiert, ob es ein `notes`/`description`-Feld gibt für Festpreis-Beschreibung |
| `prisma/schema.prisma:2575` (`Order.billingRatePerHour`) | Prüfen ob das nullable bleibt oder ob es bei `FLAT_RATE` semantisch `null` werden soll |
| `src/lib/services/work-report-invoice-bridge-service.ts` (Zeile mit `computeProposedPositions`) | Aktueller Stundensatz-Chain-Code; muss um Mode-Switch erweitert werden |
| `src/components/orders/order-form-sheet.tsx` | Existierendes Order-Form für UI-Erweiterung |
| `src/lib/services/order-service.ts` oder `src/trpc/routers/orders.ts` | Wo Order-Validierung stattfindet (für `fixedPrice`-Pflichtfeld bei `FLAT_RATE`) |
| `prisma/schema.prisma` `Activity`-Model | Für R-4-Vorbereitung: aktuelle Felder dokumentieren, `pricingType` ist out-of-scope für R-2 |
| `prisma/schema.prisma` `BillingTenantConfig`-Model | Für R-3-Vorbereitung: aktuelle Felder dokumentieren |
| `src/lib/platform/module-pricing.ts` | Anschauen, ob es ein Vorbild für tenant-weite Konfig gibt |
| `thoughts/shared/research/2026-04-24-rechnungs-uebernahme-arbeitsschein.md` | Original-R-1-Research; enthält bereits Notizen zu fehlender VAT/Activity-Rate |

---

## Competitor patterns to validate (Web-Research-Plan)

Vor der Implementierung lohnt sich ein Web-Research-Pass mit
konkreten Suchen:

1. **HERO Software** — "HERO Software Abrechnungsart" / "HERO
   Software Pauschalauftrag" → Screenshots/Doku der Order-Maske
2. **mfr by Sander & Doll** — "mfr Festpreis-Auftrag" / "mfr
   Service-Modul Abrechnung"
3. **TopKontor Handwerk** — "TopKontor Pauschalrechnung" /
   "TopKontor Aufmaß"
4. **Odoo Service Module** — "Odoo Project Invoice Policy"
   (Doku ist offen zugänglich)
5. **Lexware Handwerk** — "Lexware Handwerk Abrechnungsart"

Ziel: Konkrete UI-Patterns + Field-Namen + Pflicht-Optional-Konventionen
übernehmen, statt aus dem Bauch heraus zu designen.

**Tool-Tipp für die nächste Session**: `web-search-researcher` Subagent
mit der Aufgabe "Recherchiere DACH-Handwerker-ERP-Pricing-Modelle
mit Fokus auf Order-Level Abrechnungsart-Toggle".

---

## Out of Scope für R-2

Bewusst NICHT in R-2 enthalten (Folge-Tickets):

- `Activity.pricingType` / `Activity.flatRate` → R-4
- `CustomerBillingAgreement` → R-5
- `Tenant.defaultHourlyRate` → R-3
- `Tenant.defaultVatRate` → R-3 (im R-1-Plan IN-3 als Awareness)
- Material-Übernahme aus `WhStockMovement` → R-6
- Aufmaß-spezifische UI (lfm/m²/Stk-Erfassung) → R-7 (separat)
- Stunden-Kontingent / Service-Vertrag-Verbrauch → eigenes Major-Ticket

---

## Open Questions für die R-2-Plan-Phase

Eine zukünftige Session muss folgende Fragen mit dem PO klären
(idealerweise vor Implementation-Start):

1. **Pauschal-Auftrag mit Anfahrt**: Soll bei `FLAT_RATE` die
   Anfahrt aus `WorkReport.travelMinutes` trotzdem als separate
   Position erscheinen, oder ist sie "in der Pauschale enthalten"?
   → Default-Vorschlag: konfigurierbares Flag `Order.travelIncludedInFixedPrice` (boolean, default false)
   → Alternativ einfacher: immer separate Travel-Position; der
     Disponent entfernt sie bei Bedarf manuell.

2. **Backwards-Compatibility**: Bestehende Orders ohne
   `billingMode` bekommen automatisch `HOURLY`. Stimmt das mit den
   Erwartungen im Live-Tenant überein, oder gibt es Tenants, die
   schon heute "manuell pauschal abrechnen" und deren Orders
   eigentlich `FLAT_RATE` sein sollten? → Falls ja: Migration-Heuristik
   nötig; falls nein: trivialer Default reicht.

3. **MIXED-Mode wirklich nötig?**: Praxis-Use-Case-Validation —
   wie häufig wird "Festpreis + Stundenlohn-Mehrarbeit" wirklich
   gebraucht? Falls selten: nur HOURLY + FLAT_RATE in R-2
   implementieren, MIXED in R-2.1 nachschieben.

4. **VAT-Default**: Soll R-2 bereits den tenant-weiten
   `defaultVatRate` einführen (heute hardcoded `19.0` als
   Modul-Konstante in bridge-service), oder bleibt das R-3?
   → Default-Vorschlag: bleibt R-3, weil R-2 sonst zu groß wird.

5. **Zeit-Buchungs-Tracking bei Pauschal**: Sollen Disponenten bei
   Pauschal-Aufträgen weiterhin Stunden buchen (für interne
   Auswertung wie Profitability-Reports), oder soll das UI
   "Buchungen anlegen" bei Pauschal-Aufträgen abblocken?
   → Default-Vorschlag: Buchungen weiter erlauben (interne
     Zeitkontrolle ist orthogonal zur Abrechnung), nur Hinweis-Text
     im UI ergänzen.

---

## Akzeptanzkriterien (Skizze für R-2)

- [ ] `Order.billingMode` enum (`HOURLY` / `FLAT_RATE` / `MIXED`)
      mit Default `HOURLY` per Migration
- [ ] `Order.fixedPrice` Decimal nullable Spalte
- [ ] Order-Form-UI mit Dropdown "Abrechnungsart" + bedingtem
      Festpreis-Feld
- [ ] Validierung: `FLAT_RATE` ohne `fixedPrice` → BAD_REQUEST
- [ ] `computeProposedPositions()` respektiert `billingMode`:
      bei `FLAT_RATE` → 1 Festpreis-Position; bei `MIXED` →
      Festpreis + Stunden; bei `HOURLY` → unverändert
- [ ] Generate-Dialog zeigt aktiven Mode im Header + Hinweis-Banner
      bei `FLAT_RATE`
- [ ] Bestehende `HOURLY`-Aufträge funktionieren unverändert
      (kein Regress)
- [ ] Unit-/Integration-/Router-/E2E-Tests grün
- [ ] Handbuch §13.x um Pauschal-Beispiel erweitert

---

## Referenzen

- **R-1 Plan** (Vorgänger):
  `thoughts/shared/plans/2026-04-27-rechnungs-uebernahme-arbeitsschein-r1.md`
- **R-1 Research**:
  `thoughts/shared/research/2026-04-24-rechnungs-uebernahme-arbeitsschein.md`
- R-1 Bridge-Service:
  `src/lib/services/work-report-invoice-bridge-service.ts`
- R-1 Generate-Dialog:
  `src/components/work-reports/work-report-generate-invoice-dialog.tsx`
- R-1 IN-3 ("Beobachtungen für zukünftige Tickets"):
  R-1-Plan Zeilen ~1420-1432

---

## Diskussions-Kontext (für historische Nachvollziehbarkeit)

Diese Frage kam am 2026-04-28 in der Vorbereitung der R-1-Manual-
Verifikations-Session auf. Der PO formulierte sie offen ("Was wenn
ein Unternehmen ohne Stundensätze arbeitet?"), nicht als konkrete
Anforderung. Die strategische Diskussion ergab:

1. R-1 funktioniert auch für Pauschal-Unternehmen, aber nur über
   manuelles Editieren im Generate-Dialog → kein "1-Klick" mehr.
2. Im DACH-Handwerker-ERP-Markt ist `Order.billingMode` Standard.
3. Stufenweise Roadmap (R-2 zuerst, dann R-3/R-4) ist
   pragmatischer als ein Mega-Ticket "Billing-Engine v2".
4. Der PO entschied: R-1 zuerst zu Ende verifizieren (Profil A
   = hourly), dann auf Basis dieser Erfahrung R-2 sauber planen.

Daher dieses Backlog-Doc als "Pausen-Punkt" — die Diskussion ist
festgehalten, eine zukünftige Session kann nahtlos einsteigen.
