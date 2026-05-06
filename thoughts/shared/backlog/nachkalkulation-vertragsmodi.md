---
topic: Nachkalkulation Phase 2+ — Vertragsmodi (Werkvertrag-Pauschale, Stundenpool) und Service-spezifische KPIs
status: backlog
source_plan: thoughts/shared/plans/2026-04-29-nk-1-einzelauftrag-nachkalkulation.md
related_research: thoughts/shared/research/2026-04-29-nk-1-einzelauftrag-nachkalkulation.md
priority: medium (Differenzierung der Vertikale, kein Pre-Launch-Blocker)
estimated_size: groß (mehrere Sprints über mehrere Folge-Tickets verteilt)
created: 2026-04-29
created_by: Strategie-Diskussion vor Phase-1-Planung; Web-Recherche zu Konkurrenz-Patterns (Handwerk-ERP + CMMS + FSM)
---

# NK-Followups: Vertragsmodi + Service-spezifische KPIs (Phase 2+)

## Kontext für eine neue Session

NK-1 ("Einzelauftrag-Nachkalkulation") wird als Stack-B-Lückenschluss
geplant — Soll/Ist auf Auftragsebene mit DB-Stufen, Lohngruppen,
Mengen-vs-Preis-Trennung, Datenqualitäts-Indikatoren, Aggregation
über bestehende Auftrags-/OrderBooking-/WorkReport-/Lager-Datenflüsse.

Während der Strategie-Diskussion vor der NK-1-Plan-Phase wurde durch
Web-Recherche zu Konkurrenz-Patterns klar: NK-1 deckt nur die Basis
ab. Die echte Differenzierungs-Achse für die Vertikale "Service-
Dienstleister mit mobilem Personal" liegt in **Vertragsmodi** und
**Service-spezifischen Auswertungs-Dimensionen**, die weder klassische
Handwerks-ERPs noch CMMS-Tools noch FSM-Tools heute kombiniert
liefern.

Dieses Backlog-Doc hält die strategische Analyse fest, definiert die
einzelnen Folge-Tickets (NK-2 bis NK-6), und legt die Out-of-Scope-
Grenze von NK-1 sauber fest.

**Was eine neue Session zuerst tun sollte**:

1. NK-1-Plan + zugehöriges Research-Doc lesen (siehe Frontmatter)
2. Diesen Eintrag komplett lesen
3. Entscheiden, welches Folge-Ticket als nächstes kommt — Reihenfolge
   ist nicht fix, sollte aber an Marktvalidierung (Pro-Di-Gespräche,
   Vertriebs-Sondierungen mit Gebäudereiniger und Pro-Di-Netzwerk)
   ausgerichtet werden
4. Codebase-Research starten mit den unter "Files to investigate"
   gelisteten Anchors
5. Web-Research-Pass für das gewählte Ticket (siehe "Competitor
   patterns to validate")
6. Plan erstellen unter `thoughts/shared/plans/YYYY-MM-DD-nk-<n>-<topic>.md`

---

## Problem

NK-1 implementiert Soll/Ist-Nachkalkulation **nur auf der Ebene
Einzelauftrag**:

- Ein Auftrag → Soll-Felder (Stunden je Lohngruppe, Material, Reise)
- Ein Auftrag → Ist-Aggregation (OrderBooking, WorkReport, Lager,
  Eingangsrechnungs-Zuordnung)
- Ein Auftrag → DB-Stufen, Rohertrag/h, Soll/Ist-Ampel
- Aggregation pro Kunde, pro Anlage, pro Mitarbeiter, pro Auftragstyp

**Was NK-1 NICHT abdeckt** (bewusste Out-of-Scope-Liste):

1. **Werkvertrag-Pauschale**: Auftrag mit Pauschalpreis ist keine
   Standard-Nachkalkulation — das Soll ist der vereinbarte
   Pauschalpreis, das Ist ist der aggregierte tatsächliche Aufwand.
   Wartungsverträge mit jährlicher Pauschale fallen hier rein.
2. **Stundenpool-Verträge / Dienstvertrag**: Stundenkontingent über
   eine Periode (Monat/Quartal/Jahr) gegen tatsächlich abgerufene
   Stunden — das ist nicht Auftrags-bezogen, sondern Vertrags-bezogen
   über mehrere Aufträge hinweg, mit rollender Periode.
3. **SLA-Compliance als Profitabilitäts-Dimension**: Reaktionszeit-
   Garantien, Verfügbarkeits-Zusagen — bei Verfehlung Vertragsstrafe
   oder Customer Credit. Nachkalk muss SLA-Treffer/Verfehlung als
   Dimension haben, mit Strafzahlungen als negativer Erlöskomponente.
4. **First-Time-Fix Rate**: Wenn ein Einsatz 2× ausgeführt werden
   muss, kostet er doppelt Anfahrt + Rüstzeit. "Aufträge mit
   Zweitbesuch" als eigene Auswertung zeigt strukturelle Probleme
   (fehlende Ersatzteile, schlechte Diagnose, falsche Qualifikation).
5. **Technician Utilization Rate** als laufende KPI: Anteil
   verrechenbarer Stunden an Gesamt-Anwesenheit. Im Service der
   wichtigste operative Effizienz-KPI — im Handwerk eher
   unterthematisiert.
6. **Reactive vs. Preventive Hours Ratio pro Anlage**: Wieviel
   Prozent der Stunden sind Notfall vs. geplante Wartung pro
   Anlagentyp? Chronisch reaktive Anlagen → Wartungsplan zu locker.
7. **MTTR/MTBF pro Anlagentyp**: Mean Time to Repair, Mean Time
   Between Failures pro Maschinentyp/Hersteller — direkte
   Trainingsbasis für KI-Auftragszeitschätzung und Predictive
   Maintenance.
8. **Revenue Leakage** als KPI: Soll-Erlös laut Vertrag/Auftrag vs.
   Ist-Erlös laut Rechnung. Vergessene Stunden, nicht erfasste
   Anfahrt, vergessene Material-Position.
9. **Multi-Party-Pricing pro Vertrag**: Verschiedene Sätze je
   Schicht/Notfallart/Mitarbeiter-Qualifikation innerhalb desselben
   Vertrags. Der Pflicht-Standard im Industrieservice mit Mercedes-
   typischen Wartungsverträgen.

**Konsequenz, wenn diese Punkte fehlen**: Terp deckt zwar die
Basis-Mechanik ab (besser als ZMI orgAuftrag, vergleichbar mit
Handwerks-ERPs), bietet aber nicht die Vertikalen-spezifische
Differenzierung. In Mid-Market-Vertriebs-Gesprächen mit
Industrieservice-Anbietern (Pro-Di-Netzwerk, 30-40 Kontakte) wird
genau nach diesen Punkten gefragt werden.

---

## Hintergrund: Marktanalyse aus der Vorab-Recherche

Die Strategie-Diskussion stützte sich auf zwei Recherche-Pässe:
zunächst Handwerks-ERP-Welt (pds, Moser, Streit, HERO, ToolTime,
Kieselstein, smarthandwerk), dann CMMS/FSM/Industrieservice
(osapiens, remberg, Maintastic, QRmaint, eMaint, ServiceTitan,
Workiz, FieldEdge, Optsy, FieldEquip, Vario MRO, OpenZ).

**Strukturelle Erkenntnis: der Markt ist gespalten**, und genau das
ist die Lücke der Vertikale "Service-Dienstleister mit mobilem
Personal":

| Tool-Klasse                           | Stärke                                                     | Lücke für die Vertikale                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Handwerks-ERPs (pds, HERO, ToolTime)  | 20 Jahre Reife in Soll/Ist-Mechanik, DACH/DATEV/GoBD       | Trade-fokussiert, keine Asset-Tiefe, keine Stundenpool-Verträge, keine SLAs                                             |
| CMMS (osapiens, remberg, Maintastic)  | Asset-zentrisch, MTTR/MTBF, Wartungspläne, mobile Apps     | **Inhouse-Fokus** — denkt aus Sicht des Werks, nicht aus Sicht des externen Dienstleisters; keine Profitabilitäts-Sicht |
| FSM (ServiceTitan, Workiz, FieldEdge) | SLA-Compliance, Utilization Rate, FTFR, Contract-zentrisch | US-zentriert, kein DATEV/GoBD/XRechnung, Trade-fokussiert (HVAC/Plumbing)                                               |
| Enterprise-ERPs (SAP PM, proAlpha)    | Funktionstiefe, ERP-Integration                            | Bedienung schlecht, Setup-Aufwand hoch, Mid-Market-untauglich                                                           |

**Die Lücke**: Niemand kombiniert deutsches ERP-Niveau (DATEV, GoBD,
XRechnung) + Asset-zentrische Wartung (CMMS-DNA) + FSM-Mobile +
Vertrags-Profitabilität für externe Dienstleister.

Das ist der USP-Hypothese-Raum. Validierung kommt nicht aus
Recherche, sondern aus Vertriebs-Gesprächen mit Pro-Di-Netzwerk +
Gebäudereiniger + weiteren Mid-Market-Industrieservice-Anbietern.

### Wichtigste Konzepte aus der CMMS/FSM-Welt, die in Handwerks-Tools fehlen

**Stundenpool als eigenständige Vertragsform**. Beispiel-Ausgestaltung
aus IT-Service-Wartungsverträgen: "Stundenpool von X Stunden, in
15-Minuten-Einheiten gegen den Pool verrechnet — bei Pool-Erschöpfung
automatisches Folgeangebot, nicht aufgebrauchte Stunden verfallen am
Vertragsende." Das ist das Brot-und-Butter-Modell für Industrieservice-
Wartungsverträge mit Großkunden. Im Handwerks-ERP nicht abgebildet.

**Werkvertrag vs. Dienstvertrag — rechtlich, mit Konsequenz für die
Nachkalk-Logik**. Werkvertrag = Erfolg geschuldet, Pauschalpreis,
Risiko beim Dienstleister. Dienstvertrag = Stunden geschuldet,
Stundenpool, Risiko geteilt. Drei Modi parallel im Datenmodell
(Einzelauftrag + Werkvertrag-Pauschale + Stundenpool-Dienstvertrag),
weil ein Kunde meist alle drei nebeneinander hat.

**SLA-Compliance Rate als eigene Dimension**. SLA Compliance =
Anzahl Reparaturen die SLA erfüllt / Gesamtanzahl. Bei Unterschreitung
Vertragsstrafen oder Customer Credits. Im Handwerk gibt es keine
SLAs; im Industrie-Service sind sie Standard.

**Technician Utilization Rate**. Prozentsatz der Technician-Zeit für
billable Arbeit vs. non-billable Zeit (Travel, Admin). Im FSM die
zentrale operative Effizienz-Zahl — _die_ Zahl, die Geschäftsführer
täglich sehen wollen.

**First-Time-Fix Rate**. Best-in-Class FSM-Nutzer erreichen 96% vs.
78% Industriestandard. Direkter Hebel für Margenverbesserung im
Service: jeder Zweitbesuch kostet Anfahrt + Rüstzeit doppelt.

**MTTR/MTBF pro Anlagentyp**. Mean Time to Repair, Mean Time Between
Failures pro Maschinentyp. Aus CMMS-Welt. Brücke zu Tolgas geplanter
KI-Auftragszeitschätzung und Predictive Maintenance — diese KI
braucht historische Soll/Ist-Daten als Trainingsbasis, exakt das was
NK-1 generiert.

**Reactive vs. Preventive Hours Ratio**. Wieviel Prozent der Stunden
sind Notfall vs. geplante Wartung pro Anlagentyp? Aus CMMS-Welt.
Chronisch reaktive Anlagen zeigen, dass der Wartungsplan zu locker
oder die Anlage am Lebensende ist.

**Revenue Leakage**. Actual Revenue − Expected Revenue. Im
Service-Geschäft riesig: vergessene Stunden, nicht erfasste Anfahrt,
vergessene Material-Position. Wird in FSM-Welt explizit als KPI
geführt; im Handwerk nicht.

**Multi-Party-Pricing pro Vertrag**. Aus Optsy/FieldEquip-Doku:
verschiedene Sätze pro Vertrag je nach Schicht, Notfallart oder
Mitarbeiter-Qualifikation. Im Industrieservice mit Schichtbetrieb
(Pro-Di-Setup) Pflicht, nicht Komfort.

---

## Stufenweiser Roadmap

| Ticket   | Scope                                                                                                                                                       | Aufwand                   | Business-Value                                                                                                          | Voraussetzung                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **NK-1** | Einzelauftrag-Nachkalk: Soll-Felder am Auftrag, Ist-Aggregation, DB-Stufen, Datenqualitäts-Indikatoren                                                      | Groß (1-2 Sprints)        | **Höchster** — schließt Stack-B-Lücke, deckt 100% der Aufträge ab, liefert Daten-Fundament für alle weiteren Tickets    | —                                                                          |
| **NK-2** | `Contract`-Entität + Werkvertrag-Pauschale-Modus: Auftrags-Zuordnung zu Vertrag, Pauschalpreis als Soll-Erlös, Aggregation untergeordneter Aufträge als Ist | Mittel-Groß (1-2 Sprints) | Hoch — Pflicht für Wartungsverträge mit Pauschalpreis, der häufigste Vertragstyp im Industrieservice nach Einzelauftrag | NK-1 fertig; `Contract`-Datenmodell                                        |
| **NK-3** | Stundenpool-Dienstverträge: rollende Periode (Monat/Quartal/Jahr), Pool-Verbrauch über mehrere Aufträge, automatische Verbrauchsanzeige                     | Mittel (1 Sprint)         | Mittel-Hoch — typisches IT-/Industrieservice-Modell, klare Differenzierung                                              | NK-2 (Contract-Entität existiert)                                          |
| **NK-4** | Service-spezifische KPIs als Dashboard: SLA-Compliance, Technician Utilization Rate, First-Time-Fix Rate, Revenue Leakage                                   | Mittel (1 Sprint)         | Mittel — operatives Dashboard, hohe Sichtbarkeit beim Geschäftsführer, kein Pflicht-Feature                             | NK-1 + NK-2; SLA-Felder am Vertrag                                         |
| **NK-5** | Asset-zentrische Auswertung: MTTR, MTBF, Reactive/Preventive Hours Ratio pro Anlagentyp, Hersteller, Standort                                               | Mittel (1 Sprint)         | Mittel — Brücke zu KI-Auftragszeitschätzung + Predictive Maintenance                                                    | NK-1 (T-1/T-2/T-3 Datenmodell ist da, Aggregation ergänzen)                |
| **NK-6** | Multi-Party-Pricing: Sätze je Schicht/Qualifikation/Notfallart innerhalb eines Vertrags                                                                     | Klein-Mittel              | Mittel — wichtig im Schichtbetrieb-Geschäft, kein Differenzierungs-Hauptargument                                        | NK-2 (Contract-Entität); DATEV-Payroll-Zuschläge sind schon da als Vorbild |

**Priorisierung**: NK-2 zuerst nach NK-1, weil:

1. Häufigste Vertragsform im Industrieservice nach Einzelauftrag —
   ohne Pauschalvertrag-Nachkalk fehlt der Rentabilitäts-Blick auf
   Wartungsverträge, die das Brot-und-Butter-Geschäft sind
2. Liefert die `Contract`-Entität, auf der NK-3, NK-4 und NK-6 aufbauen
3. Architektur-Entscheidung: NK-1-Datenmodell muss `Order.contractId`
   als optionalen FK schon vorbereiten, sonst wird NK-2 ein
   Migrations-Schmerz (siehe "Architektur-Vorbereitungen für NK-1")

NK-3, NK-4, NK-5, NK-6 können nach NK-2 in beliebiger Reihenfolge
kommen, abhängig von Vertriebs-Feedback. Wenn Pro-Di und 5+
Pro-Di-Netzwerk-Kunden alle Stundenpool nutzen → NK-3 nach vorn.
Wenn ein Industrieservice-Anbieter SLAs als Pflicht-Feature in einem
Sales-Cycle nennt → NK-4 nach vorn.

---

## NK-2 Skizze: Werkvertrag-Pauschale-Modus

### Schema-Erweiterung

```prisma
enum ContractMode {
  WORK_CONTRACT      // Werkvertrag, Pauschalpreis, Aufträge sind Sub-Einheiten
  HOURS_POOL         // Dienstvertrag, Stundenkontingent (NK-3)
  // Einzelauftrag braucht keinen Contract — Order.contractId bleibt NULL
}

model Contract {
  id           String       @id @default(uuid()) @db.Uuid
  tenantId     String       @db.Uuid
  customerId   String       @db.Uuid  // FK auf CrmAddress (Customer)
  mode         ContractMode
  title        String
  startDate    DateTime
  endDate      DateTime?

  // WORK_CONTRACT spezifisch
  fixedPrice          Decimal?  @db.Decimal(10, 2)
  fixedPriceVatRate   Decimal?  @db.Decimal(5, 2)

  // HOURS_POOL spezifisch (NK-3, hier nur als Vorbereitung)
  poolHours           Decimal?  @db.Decimal(10, 2)
  poolPeriodMonths    Int?      // 1=Monatlich, 3=Quartalsweise, 12=Jährlich
  poolHourlyRate      Decimal?  @db.Decimal(10, 2)
  poolCarryOverHours  Boolean   @default(false)  // Übertrag oder Verfall

  // SLA-Felder als Vorbereitung für NK-4
  slaResponseTimeMinutes  Int?
  slaPenaltyPerBreach     Decimal? @db.Decimal(10, 2)

  // Standardfelder
  internalNotes  String?
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  orders   Order[]
  // Multi-Party-Pricing (NK-6) später als separate Tabelle
}

model Order {
  // ...existierende Felder
  contractId  String?  @db.Uuid  // ← schon in NK-1 vorbereiten!
  contract    Contract? @relation(fields: [contractId], references: [id])
}
```

### Nachkalk-Logik bei Werkvertrag

```ts
function calculateContractMargin(contract: Contract): ContractMarginReport {
  if (contract.mode !== "WORK_CONTRACT") {
    throw new Error("Wrong mode");
  }

  // Soll-Erlös = vereinbarter Pauschalpreis
  const sollErloes = contract.fixedPrice;

  // Ist-Aufwand = Aggregation aller untergeordneten Aufträge
  // (re-uses NK-1 Ist-Aggregations-Service!)
  const orders = await orderService.findByContract(contract.id);
  const istAufwand = orders.reduce(
    (sum, order) => sum + nkAggregationService.calculateIstAufwand(order.id),
    0,
  );

  return {
    sollErloes,
    istAufwand,
    deckungsbeitrag: sollErloes - istAufwand,
    margePercent: ((sollErloes - istAufwand) / sollErloes) * 100,
    // Plus: Stunden je Lohngruppe summiert über alle Aufträge,
    // Material summiert, Reisezeit summiert (re-use NK-1 DB-Stufen)
  };
}
```

**Schlüssel-Architektur-Punkt**: NK-2 ist keine neue Aggregations-
Engine. Es ist ein Wrapper um NK-1, der mehrere Aufträge zu einem
Vertrag zusammenrollt und das Soll vom Vertrag (Pauschalpreis)
nimmt statt vom Auftrag.

### UI-Skizze

- Neue Route `/contracts` mit CRUD-UI
- Auftrags-Form bekommt Dropdown "Vertrag": Auswahl optional, leer =
  Einzelauftrag (NK-1-Pfad)
- Vertrags-Detail-Seite zeigt Soll/Ist-Tabelle mit allen zugeordneten
  Aufträgen, plus Roll-Up auf Vertragsebene
- Vertrags-Liste zeigt pro Vertrag aktuelle Marge in EUR und %, mit
  Ampel (grün >15%, gelb 0-15%, rot <0%)

### Tests

- Integration-Test: Vertrag mit 3 Aufträgen, Pauschalpreis 10.000€,
  Ist-Aufwand 7.500€ → Marge 2.500€ / 25%
- Integration-Test: Vertrag-Marge bleibt korrekt, wenn neue Aufträge
  zum Vertrag hinzukommen
- Unit-Test: `WORK_CONTRACT` ohne `fixedPrice` → BAD_REQUEST
- Tenant-Isolation: Vertrag von Tenant A nicht sichtbar für Tenant B

---

## NK-3 Skizze: Stundenpool-Dienstverträge

Aufbauend auf NK-2 (Contract-Entität existiert).

**Kern-Logik**: Pool-Verbrauchs-Service, der über eine rollende
Periode (z.B. "01.01.2026 - 31.03.2026 für ein Quartal") alle
Stunden-Buchungen auf Aufträgen mit `contractId = X` summiert und
gegen `contract.poolHours` vergleicht.

**Anzeige**:

- Pool-Status-Widget pro Vertrag: "Q1 2026: 18,5h von 20h verbraucht
  (92,5%) — Verfall in 12 Tagen"
- Warnung bei Pool-Erschöpfung; automatische Generierung eines
  Folgeangebots für weiteren Pool (Pendant zum IT-Service-Mustervertrag)
- Profitabilitäts-Sicht: nicht-aufgebrauchte Stunden = pure Marge bei
  `poolCarryOverHours=false`

**Wichtige Subtilität**: Wenn ein Auftrag auf einem Stundenpool-Vertrag
mehr Stunden braucht als vereinbart, gibt es zwei Pfade:

- "Über-Stunden gegen Pool" (wenn Pool noch hat) → reduziert Pool
- "Über-Stunden außerhalb Pool" (wenn Pool aufgebraucht) → separate
  Abrechnung zu erhöhtem Stundensatz

Das muss UI-seitig sichtbar sein — der Disponent muss bei Buchung
sehen "Diese Stunde geht in Pool X (verbleibend 1,5h)" oder "Diese
Stunde ist Out-of-Pool, wird zu 95€/h abgerechnet".

---

## NK-4 Skizze: Service-spezifische KPIs

Vier KPIs als laufendes Dashboard und in Vertragsauswertungen:

### SLA-Compliance Rate

- Pro Auftrag: Zeitstempel "Auftrag eingegangen" → "Auftrag begonnen"
  vs. `contract.slaResponseTimeMinutes`
- Treffer/Verfehlung als Boolean am Auftrag
- Bei Verfehlung: optionale Strafzahlungs-Position (`contract.slaPenaltyPerBreach`)
- Aggregation: SLA-Compliance Rate pro Vertrag, pro Kunde, pro
  Zeitraum
- Strafzahlungen fließen als negative Erlöskomponente in die
  Vertrags-Marge

### First-Time-Fix Rate

- Pro Auftrag: Boolean `wasReturnVisit` (Folgeauftrag wegen
  unvollständiger Erstreparatur)
- Linked-Order-FK: `previousAttemptOrderId` für Aufträge, die ein
  früheres Problem nochmal anpacken
- KPI: Anzahl Aufträge ohne `previousAttemptOrderId` / Gesamt =
  First-Time-Fix Rate
- Dashboard zeigt FTFR pro Anlagentyp, pro Mitarbeiter, pro Auftragsart

### Technician Utilization Rate

- Bestehende Stempelung (`OrderBooking.timeMinutes` für verrechenbar)
  vs. Anwesenheits-Stempelung (Datafox-Terminal-Daten oder Web-UI)
- Aggregation: Verrechenbare Stunden / Anwesende Stunden pro
  Mitarbeiter, pro Team, pro Tenant über Zeit
- Dashboard zeigt Trend (täglich, wöchentlich, monatlich)
- Branchenrichtwert: 65-75% ist gut, <55% ist Red Flag

### Revenue Leakage

- Soll-Erlös = Stunden × Stundensatz laut Vertrag/Auftrag
- Ist-Erlös = Summe aller `BillingDocument`-Positionen die diesem
  Auftrag zugeordnet sind
- Differenz = Revenue Leakage (sollte 0 oder positiv sein; negativ =
  Underbilling)
- Dashboard zeigt Aufträge mit größtem Revenue Leakage als Top-N-Liste

---

## NK-5 Skizze: Asset-zentrische Auswertung

Nutzt `ServiceObject` (T-1/T-2/T-3 ist schon da) als Aggregations-
Anker.

- **MTTR pro Anlagentyp**: Summe Reparatur-Stunden / Anzahl Ausfälle
  pro Anlagentyp/Hersteller/Modell. Zeigt: dauert Wartungstyp X bei
  Maschinentyp Y systematisch länger als kalkuliert?
- **MTBF pro Anlage**: Zeit zwischen Ausfällen pro einzelner Anlage.
  Zeigt Kandidaten für Ersatz/Generalüberholung.
- **Reactive vs. Preventive Hours Ratio**: Pro Anlagentyp Anteil
  Notfall-Stunden vs. geplante Wartungs-Stunden. Anlagen mit hohem
  Reactive-Anteil → Wartungsplan zu locker oder Anlage am Lebensende.

**Brücke zu KI**: Diese aggregierten Daten sind exakt die
Trainingsbasis für die geplante Auftragszeitschätzung und Predictive
Maintenance. NK-5 generiert die Daten; die KI-Tickets nutzen sie.

---

## NK-6 Skizze: Multi-Party-Pricing pro Vertrag

```prisma
model ContractPricing {
  id          String   @id @default(uuid()) @db.Uuid
  contractId  String   @db.Uuid
  // Bedingungs-Felder:
  shift       Shift?   // FRUEH/SPAET/NACHT (Vorbild: DATEV-Payroll Zuschläge)
  qualification String?  // "Meister", "Monteur", "Geselle"
  isEmergency Boolean? // Notfall-Auftrag?
  isWeekend   Boolean?
  // Preis:
  hourlyRate  Decimal  @db.Decimal(10, 2)
}
```

Bei Buchung wird der passende `ContractPricing`-Datensatz gesucht
(spezifischste Übereinstimmung gewinnt) und der Stundensatz für die
Buchung wird daraus genommen.

**Vorbild im Codebase**: Die DATEV-Payroll-Zuschlags-Logik
(Schicht-Zuschläge) macht etwas Ähnliches und kann als Pattern
übernommen werden.

---

## Architektur-Vorbereitungen für NK-1

Damit NK-2 bis NK-6 ohne große Migrations-Schmerzen andocken können,
sollten folgende Vorbereitungen schon in NK-1 mitgenommen werden
(minimal-invasiv, ohne Funktionalität):

### NK-1 muss enthalten

- `Order.contractId` als nullable FK auf `Contract` (Tabelle existiert
  noch nicht) — Spalte als `String?` Decimal-Spalte vorbereiten,
  damit der FK später mit weniger Migrations-Aufwand draufgepfropft
  werden kann
- Soll-Felder am Auftrag (`Order.targetHours`, `Order.targetMaterial`,
  `Order.targetTravelTime`) sind explizit nullable, weil bei
  Werkvertrag-Pauschale (NK-2) das Soll vom Vertrag kommt, nicht
  vom Auftrag
- Aggregations-Service für Ist-Werte als saubere, parametrisierbare
  Funktion: `calculateIstAufwand(orderId): IstAufwandReport` —
  NK-2 ruft diesen Service in einer Schleife auf, um Vertrags-
  Aggregation zu bauen
- Datenqualitäts-Indikatoren am Report-Output (siehe NK-1-Plan):
  diese Indikatoren werden in NK-2 auf Vertragsebene aggregiert
  ("3 untergeordnete Aufträge ohne Stundensatz")

### NK-1 darf NICHT

- Eine `Contract`-Tabelle anlegen (gehört zu NK-2)
- Werkvertrag-Pauschale oder Stundenpool-Logik im Aggregations-
  Service implementieren (gehört zu NK-2/NK-3)
- SLA-/FTFR-/Utilization-Felder am Auftrag oder am Mitarbeiter
  hinzufügen (gehört zu NK-4)
- MTTR/MTBF-Aggregation auf Anlagenebene (gehört zu NK-5)
- Multi-Party-Pricing (gehört zu NK-6)

---

## Out of Scope für die NK-Followup-Roadmap

Bewusst NICHT in diese Roadmap aufgenommen, weil eigene Themen:

- **Vorkalkulation als eigenständige Engine**: NK-1 hat Soll-Felder
  am Auftrag, das ist die "Mini-Vorkalkulation". Eine echte
  Vorkalkulation mit eigener Domain (Angebots-Kalkulation, Varianten,
  Versionierung, Übergabe ins Angebot) ist ein eigenes Mega-Ticket
  und gehört nicht hierher.
- **GAEB-Import**: Aufmaß-/LV-Import aus dem Bauwesen — nicht
  relevant für die Service-Vertikale.
- **Predictive Maintenance / KI-Auftragszeitschätzung**: Eigene
  KI-Tickets, die auf den Daten von NK-5 aufbauen, aber nicht
  Bestandteil dieser Nachkalk-Roadmap sind.
- **Kundenportal mit Soll/Ist-Sicht für den Endkunden**: Stack-C-
  Differenzierung, eigenes Themengebiet.
- **Forecasting auf Basis historischer Soll/Ist-Daten**: Wenn die
  Datenbasis durch NK-1+NK-2 da ist, könnte man Forecasting bauen —
  aber das ist eigenes Ticket.
- **DB-IV (Deckungsbeitrag inkl. Gemeinkosten-Umlage)**: NK-1 sollte
  DB-I, DB-II, DB-III liefern (Material / + Lohn / + Reisezeit). Eine
  echte Voll-Kostenrechnung mit Gemeinkosten-Umlage und kalkulatorischen
  Zinsen ist Buchhaltungs-Software-Territorium, nicht Service-ERP.

---

## Files to investigate (Codebase-Research-Anchors)

Eine zukünftige Session, die NK-2 oder folgende Tickets angeht,
sollte mit diesen Stellen anfangen:

| Anchor                                                                | Was zu prüfen ist                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma` `Order` model                                  | Existieren `targetHours`, `targetMaterial`, `targetTravelTime`, `contractId` schon nach NK-1? Welche FKs sind da?                                       |
| `src/lib/services/<nk-1-aggregation-service>.ts` (nach NK-1 angelegt) | Ist `calculateIstAufwand(orderId)` als parametrisierbare Funktion verfügbar? Lässt sich diese Funktion in einer Schleife für mehrere Aufträge aufrufen? |
| `prisma/schema.prisma` `OrderBooking`-Model                           | Zeitstempel-Felder (für SLA-Compliance), Schicht-Zuordnung (für Multi-Party-Pricing)                                                                    |
| `prisma/schema.prisma` `ServiceObject`-Model (T-1)                    | Asset-Stammdaten als Aggregations-Anker für NK-5                                                                                                        |
| `prisma/schema.prisma` `WorkReport`-Model (M-1)                       | Reisezeit-Tracking (für SLA-Reaktionszeit-Berechnung)                                                                                                   |
| DATEV-Payroll Zuschlags-Logik (Schicht/Feiertag/Sonntag)              | Pattern-Vorbild für `ContractPricing` (NK-6): bedingte Sätze nach Bedingungen                                                                           |
| `src/lib/services/billing-recurring-invoice-service.ts`               | Vorbild für rollende Perioden (Pendant zum Stundenpool-Verbrauch über Quartal)                                                                          |
| Platform-Subscription-Billing Phase 10a                               | Vorbild für "Recurring etwas mit Verfall am Periodenende"                                                                                               |

---

## Competitor patterns to validate (Web-Research-Plan)

Vor jedem Folge-Ticket lohnt sich ein gezielter Web-Research-Pass:

### Für NK-2 (Werkvertrag-Pauschale)

1. **Moser Software Service-Modul** — Wie wird Pauschalvertrag-
   Nachkalk dort konkret abgebildet? Doku/Screenshots prüfen
2. **pds Service- und Wartungsmanagement** — Welche Vertragsfelder
   gibt es? Pauschalpreis am Vertrag oder am Auftrag?
3. **Vario MRO** — Field Service Management mit Wartungsverträgen,
   wie ist die Periodische-Abrechnung-Logik?
4. **Kieselstein ERP Auftragsnachkalkulation** — Open-Source-Doku
   ist sehr ausführlich, gutes Architektur-Vorbild für
   Aggregations-Service

### Für NK-3 (Stundenpool)

1. **ConnectWise Manage / Halo PSA** — IT-PSA-Tools haben
   Stundenpool-Verträge als Standard
2. **ETRON Care** Mustervertrag — konkrete Klausel-Beispiele für
   Pool-Logik
3. **Atera (MSP)** — Wie wird Pool-Verbrauch dem Endkunden
   visualisiert?
4. Suche nach "managed services contract hours bucket" für US-Markt-
   Inspiration

### Für NK-4 (Service-KPIs)

1. **ServiceTitan** — Dashboard-Screenshots, KPI-Definitionen
2. **NetSuite Field Service KPIs** — Branchenrichtwerte,
   Berechnungs-Formeln
3. **Wello Solutions** — DACH-FSM mit Mid-Market-Fokus
4. **Optsy** — Service Agreement Reporting
5. Suche nach "field service utilization rate benchmark" für
   Branchenrichtwerte

### Für NK-5 (Asset-KPIs)

1. **osapiens HUB for Maintenance** — DACH-CMMS mit MTTR/MTBF-Doku
2. **remberg** — KI-Copilot für Wartung, was wird auf Asset-Ebene
   ausgewertet?
3. **Maintastic** — Anlagen-Lifecycle-KPIs
4. **SAP PM Plant Maintenance** — Standard-Definitionen für
   Instandhaltungs-KPIs

### Für NK-6 (Multi-Party-Pricing)

1. **Optsy Service Level Agreement Software** — Multi-Party-Pricing-
   Doku
2. **FieldEquip Service Contract Management** — Entitlement-Logik
3. **DATEV-Payroll-Zuschlags-Pattern** — interne Inspirationsquelle

**Tool-Tipp**: Pro Folge-Ticket einen `web-search-researcher`-Subagent
einsetzen mit klarer Aufgabe: "Recherchiere Werkvertrag-Pauschal-
Nachkalkulation in DACH-Service-ERPs, Fokus auf Datenmodell und UI-
Patterns".

---

## Open Questions für die Folge-Ticket-Plan-Phasen

### NK-2 (Werkvertrag-Pauschale)

1. **Aggregations-Periode bei langlaufenden Werkverträgen**: Bei
   Mehrjahres-Wartungsverträgen — soll die Marge "lifetime" gerechnet
   werden oder pro Geschäftsjahr? Konsequenz für UI und Buchhaltung
   (Rückstellungen).
2. **Anteilige Marge in Echtzeit**: Bei einem 12-Monate-Pauschalvertrag
   — soll nach 6 Monaten die Hälfte des Pauschalpreises als
   "Soll-Erlös bis dato" gelten, oder erst am Vertragsende?
3. **Sub-Contracts**: Können Werkverträge weitere Werkverträge
   untergeordnet haben (Hierarchie), oder ist das flach?
4. **Zuordnung Aufträge zu Vertrag**: Manuell vom Disponenten oder
   automatisch (z.B. wenn Kunde + Anlage im Vertrag → automatische
   Zuordnung)?

### NK-3 (Stundenpool)

1. **Pool-Erschöpfungs-Verhalten**: Hartes Stop, Soft-Warning, oder
   automatischer Übertrag in Out-of-Pool-Stunden?
2. **Granularität**: 15-Minuten-Einheiten als Default (IT-Service-
   Standard) oder 6-Minuten (Anwalts-Standard) oder konfigurierbar?
3. **Multi-Pool**: Kann ein Vertrag mehrere Pools parallel haben
   (z.B. "20h Wartung + 10h Notfall")?

### NK-4 (Service-KPIs)

1. **SLA-Definition**: Wer definiert wann ein SLA verletzt ist?
   Disponent manuell oder System-Berechnung aus Zeitstempeln?
2. **FTFR**: Wer markiert "war ein Folgeauftrag"? Disponent bei
   Auftragsanlage oder System-Erkennung?
3. **Utilization-Rate-Datenbasis**: Datafox-Terminal-Daten als
   Wahrheit oder Web-UI-Stempelung als Wahrheit, wenn beide vorhanden?
4. **Revenue-Leakage-Bezugsperiode**: Pro Auftrag, pro Vertrag, pro
   Monat?

### NK-5 (Asset-KPIs)

1. **Datenmenge**: Bei 200+ Mitarbeitern und mehreren tausend Anlagen
   — wieviel historische Daten braucht es, bis MTTR/MTBF
   aussagekräftig sind?
2. **Aggregations-Granularität**: Pro Anlagentyp/Hersteller/Modell —
   was ist die richtige Achse für sinnvolle Cluster?

### NK-6 (Multi-Party-Pricing)

1. **Konflikt-Auflösung**: Wenn mehrere `ContractPricing`-Datensätze
   passen — spezifischste gewinnt? Oder explizite Priorität?
2. **Override am Auftrag**: Soll ein Auftrag den Vertragspreis
   übersteuern können, oder ist Vertrag immer maßgeblich?

---

## Referenzen

- **NK-1 Plan** (Vorgänger, noch zu erstellen):
  `thoughts/shared/plans/<TBD>-nk-1-einzelauftrag-nachkalkulation.md`
- **NK-1 Research** (noch zu erstellen):
  `thoughts/shared/research/<TBD>-nk-1-nachkalkulation-codebase.md`
- **Strategische Vor-Recherche** (in dieser Konversation
  durchgeführt):
  - Pass 1: Handwerks-ERP-Welt (pds, Moser, Streit, HERO, ToolTime,
    Kieselstein, smarthandwerk, Vario, eGECKO, IFW)
  - Pass 2: CMMS/FSM/Industrieservice (osapiens, remberg, Maintastic,
    QRmaint, eMaint, ServiceTitan, Workiz, FieldEdge, Optsy,
    FieldEquip, Vario MRO, OpenZ, Plasser/proAlpha)
  - Quellen einer zukünftigen Session zur Validierung verfügbar
    machen via `web-search-researcher` Subagent
- **Verwandte Tickets im Backlog**:
  - R-2 (Billing Modes): `thoughts/shared/tickets/backlog/r2-billing-modes-flat-rate-followup.md`
    — R-2 implementiert `Order.billingMode` für Rechnungs-Übernahme.
    Synergie: `Order.billingMode` und `Order.contractId` müssen
    konsistent zusammenarbeiten (Werkvertrag-Pauschale impliziert
    `FLAT_RATE` Rechnung).

---

## Diskussions-Kontext (für historische Nachvollziehbarkeit)

Diese Roadmap entstand am 2026-04-29 in einer Strategie-Diskussion
vor der NK-1-Plan-Phase. Der Ablauf war:

1. **Ausgangspunkt**: PO fragte "was fehlt noch für TERP nach Stand
   29.04.26?" — Antwort: Stack-B-Reste (Soll/Ist-Nachkalkulation,
   Reisezeit-Strukturierung, Material-Übernahme), Stack-A-Reste
   (Mobile/Offline, Checklisten, Qualifikations-Matching), Stack-C
   (Kundenportal, KI, Revierpläne).
2. **Vertiefung Soll/Ist-Nachkalkulation**: PO bat um Erklärung und
   strategische Einordnung. Antwort: mittel-hoch wichtig, technisch
   in Core, kommerziell aber Business-/Enterprise-Tier-Feature, nicht
   Pre-Launch-Blocker.
3. **Modulgating-Entscheidung**: Sub-Feature im Auftrags-Bereich
   gated über `TenantModule`-Flag (analog KI-Features), nicht eigenes
   "Controlling"-Modul.
4. **Web-Recherche Pass 1**: Handwerks-ERP-Welt — Erkenntnisse zu
   Soll/Ist-Mechanik, DB-Stufen, Mengen-vs-Preis-Trennung,
   Lohngruppen, mitlaufender Nachkalkulation, Datenqualitäts-Falle.
5. **PO-Einwand**: "Sehe viel Handwerk in der Recherche, wir sind
   doch ERP für Service-Dienstleister?" — Antwort: Handwerk hat die
   Mechanik-Reife, Service-Vertikale braucht zusätzliche Dimensionen
   (Wartungsverträge, Reisezeit als eigene Kostendimension, Asset-
   zentrische Nachkalk, SLA, Schichtbetrieb).
6. **Web-Recherche Pass 2**: CMMS/FSM/Industrieservice — neue
   Erkenntnisse zu Stundenpool-Verträgen, Werkvertrag-vs-Dienstvertrag-
   Logik, SLA-Compliance, Utilization Rate, FTFR, MTTR/MTBF, Revenue
   Leakage, Multi-Party-Pricing.
7. **PO-Reaktion**: "Klingt nach echtem USP." — Antwort: Hypothese,
   nicht Befund. Validierung kommt aus Vertriebs-Gesprächen, nicht
   Recherche. Implementierung über mehrere Sprints, nicht ein Sprint.
8. **PO-Klarstellung**: "Wir bauen für die Vertikale, nicht für
   Pro-Di." — Korrekt. Datenmodell muss alle drei Vertragsmodi
   (Einzelauftrag, Werkvertrag-Pauschale, Stundenpool) tragen, weil
   ein typischer Kunde alle parallel hat. NK-1 macht den Einzelauftrag-
   Pfad und bereitet die Architektur für NK-2/NK-3 vor.
9. **Entscheidung**: NK-1 als Stack-B-Lückenschluss bauen, mit
   Architektur-Vorbereitungen für NK-2+. Folge-Tickets in diesem
   Backlog-Doc dokumentieren.

Dieses Backlog-Doc ist der "Pausen-Punkt": die strategische
Diskussion ist festgehalten, eine zukünftige Session kann nahtlos
einsteigen, sobald NK-1 fertig ist und Vertriebs-Feedback aus den
Sondierungs-Gesprächen vorliegt.
