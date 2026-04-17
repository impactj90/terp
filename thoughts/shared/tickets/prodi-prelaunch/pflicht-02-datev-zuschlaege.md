# Konfigurierbare Zuschläge im DATEV-Lohnexport

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. Zuschläge (Nacht, Sonntag, Feiertag, Überstunden) sind essenziell für die korrekte Lohnabrechnung. Der Steuerberater braucht die Zuschläge als separate DATEV-Lohnarten.

**Vertikal-relevant**: Jeder Tenant mit Schichtarbeit oder Wochenendarbeit braucht konfigurierbare Zuschläge. Die Zuschlagshöhen, Zeitfenster und steuerfreien Anteile unterscheiden sich stark zwischen Betrieben und Tarifverträgen. Reinigungsfirmen haben z.B. andere Nacht-Zeitfenster als Industriedienstleister.

## Problem / Pain Point

**Ist-Zustand im Code**:
- Zuschlagsberechnung existiert: `DayPlanBonus`-Einträge → `calculateSurcharges()` in `src/lib/calculation/surcharges.ts` → `DailyAccountValue` mit `source="surcharge"`
- `Account.payrollCode` mappt auf DATEV-Lohnart
- DATEV-LODAS-Export in `payroll-export-service.ts:generateDatevLodas()` gibt Account-basierte Werte aus

**Was fehlt**:
1. **Keine Tenant-Level-Konfiguration**: Zuschläge sind pro `DayPlan` definiert (via `DayPlanBonus`), nicht pro Tenant. Wenn der Steuerberater eine Zuschlagshöhe ändert, muss jeder DayPlan einzeln angepasst werden.
2. **Keine steuerfreien Anteile**: §3b EStG erlaubt steuerfreie Zuschläge bis zu bestimmten Grenzen (Nacht 25/40%, Sonntag 50%, Feiertag 125/150%). Diese sind weder modelliert noch exportiert.
3. **Keine explizite DATEV-Lohnart-Zuordnung pro Zuschlagstyp**: Die Lohnart kommt aus `Account.payrollCode` — es gibt keinen dedizierten Zuschlagstyp-zu-Lohnart-Mapping.
4. **Keine Kombinierbarkeit-Regeln**: Sonntag + Nacht gleichzeitig — kumulieren oder höchster gilt? Nicht konfigurierbar.
5. **Kein Gültigkeitszeitraum**: Zuschlagsregeln ändern sich bei Tarifverhandlungen — validFrom/validTo fehlt.

## Akzeptanzkriterien

1. **SurchargeRule-Tabelle**: Neues Prisma-Modell `SurchargeRule` auf Tenant-Ebene mit Feldern: `type` (NIGHT/SUNDAY/HOLIDAY/OVERTIME/CUSTOM), `name`, `percentage`, `timeWindowStart`/`timeWindowEnd` (Minuten ab Mitternacht), `taxFreePercentage` (§3b EStG), `datevWageTypeCode`, `isActive`, `validFrom`/`validTo`, `priority` (für Kombinierbarkeit), `stackingMode` (CUMULATIVE/HIGHEST_WINS)
2. **Tenant-Default-Konfiguration**: Bei Tenant-Erstellung werden Default-Zuschlagsregeln erstellt (konfigurierbar, nicht hardcoded). Pro-Di-Defaults als Seed.
3. **Berechnung verwendet SurchargeRules**: `calculateSurcharges()` liest die aktiven `SurchargeRule`-Einträge des Tenants statt der `DayPlanBonus`-Einträge (oder: `DayPlanBonus` referenziert `SurchargeRule` als Override-Möglichkeit)
4. **DATEV-Export mit Zuschlägen**: Jeder Zuschlagstyp wird als separate Lohnart mit dem konfigurierten `datevWageTypeCode` exportiert. Steuerfreier und steuerpflichtiger Anteil werden getrennt ausgewiesen.
5. **Steuerberater-UI**: Zuschlagsregeln sind im Admin-Bereich konfigurierbar (CRUD + Vorschau)
6. **Kombinierbarkeit**: Wenn zwei Zuschläge gleichzeitig greifen (z.B. Sonntag-Nacht), wird gemäß `stackingMode` kumuliert oder der höchste Zuschlag gewählt
7. **Gültigkeitszeitraum**: Zuschlagsregeln mit `validFrom`/`validTo` → historisch korrekte Berechnung bei rückwirkenden Abrechnungen
8. **Liquid-Template-Engine-Kompatibilität**: `export-context-builder.ts` stellt Zuschlagsdaten im Template-Kontext bereit
9. **Rückwärtskompatibel**: Bestehende `DayPlanBonus`-Konfigurationen funktionieren weiter. Migration erstellt `SurchargeRule`-Einträge aus bestehenden `DayPlanBonus`-Daten.

## Test-Anforderungen

### Unit-Tests (Vitest)

Services/Functions unter Test:
- `calculateSurcharges()` mit neuen `SurchargeRule`-basierten Configs
- Neue Funktion `matchSurchargeRules(workPeriod, rules, date)` → gematchte Regeln mit berechneten Werten
- Neue Funktion `splitTaxFreeAmount(totalSurcharge, taxFreePercentage, baseWage)` → steuerfrei/steuerpflichtig

Konkrete Test-Cases:
- **Nacht-Zuschlag Happy Path**: Arbeit 22:00-06:00, Nacht-Regel 22:00-06:00 25% → korrekte Zuschlagsstunden
- **Sonntag-Zuschlag**: Arbeit So ganzer Tag, Sonntag-Regel 0:00-24:00 50% → korrekte Berechnung
- **Feiertag-Zuschlag**: Arbeit an gesetzlichem Feiertag → Feiertag-Regel greift
- **Kombinierung CUMULATIVE**: Sonntag-Nacht (So 22:00-Mo 06:00) → Sonntag 50% + Nacht 25% = 75%
- **Kombinierung HIGHEST_WINS**: Selbes Szenario → max(50%, 25%) = 50%
- **Zeitfenster-Überlappung**: Arbeit 20:00-02:00, Nacht-Regel ab 22:00 → nur 22:00-02:00 zuschlagsfähig
- **Overnight-Split**: Nacht-Zuschlag 22:00-06:00, Mitternachts-Split → korrekte Aufteilung auf zwei Kalendertage
- **§3b EStG steuerfreier Anteil**: Nacht-Zuschlag 25%, Grundlohn 20EUR/h → steuerfrei bis 25% von 50 EUR Grenze
- **Gültigkeitszeitraum**: Regel A gültig bis 31.03, Regel B ab 01.04 → Berechnung für 31.03 nutzt A, für 01.04 nutzt B
- **Keine aktive Regel**: Kein Zuschlag konfiguriert → 0 Zuschlag, kein Fehler
- **Sommerzeitumstellung**: Nachtschicht über Zeitumstellung → korrekte Stundenberechnung (23h/25h Nacht)
- **Monatswechsel**: Zuschlag über Monatsende → korrekte Zuordnung zum richtigen Abrechnungsmonat

### Integration-Tests (Vitest, describe.sequential, echte DB)

- **SurchargeRule CRUD + Berechnung**: Tenant anlegen → Default-Regeln prüfen → Regel ändern → DailyCalc triggern → DailyAccountValue mit korrektem Zuschlag prüfen
- **DATEV-Export mit Zuschlägen**: Zuschlagsregeln konfigurieren → Monat berechnen → MonthlyValue schließen → DATEV-Export → Lohnarten-Zeilen mit korrekten Beträgen und Codes prüfen
- **Multi-Tenant-Isolation**: Tenant A hat 25% Nacht, Tenant B hat 30% Nacht → Export zeigt jeweilige Werte, keine Cross-Contamination
- **Migration von DayPlanBonus**: Bestehende DayPlanBonus-Einträge → Migration → SurchargeRule-Einträge vorhanden → Berechnung liefert identische Ergebnisse
- **Gültigkeitszeitraum-Wechsel**: Regel mit validTo=31.03 und neue Regel validFrom=01.04 → Berechnung für März und April korrekt

### Browser-E2E-Tests (Playwright)

- **Admin konfiguriert Zuschlagsregeln**: Login als Admin → Einstellungen → Zuschläge → CRUD einer Nacht-Zuschlagsregel → Speichern → Regel in Liste sichtbar
- **Steuerberater-Ansicht**: Zuschlagsregeln → Lohnart-Zuordnung → Vorschau der DATEV-Ausgabe
- **Export-Flow mit Zuschlägen**: Zuschlag konfiguriert → MA-Zeiten mit Nachtarbeit vorhanden → Export generieren → Download → CSV-Inhalt stichprobenartig prüfen (via Download-Validierung)

## Offene Fragen für Pro-Di

1. **Zuschlagsliste**: Welche Zuschläge nutzt Pro-Di konkret? Bitte als Tabelle:
   | Zuschlagstyp | Prozentsatz | Zeitfenster | DATEV-Lohnart-Nr. |
   |---|---|---|---|
   | Nacht | ?% | 22:00-06:00? | ? |
   | Sonntag | ?% | ganzer Tag? | ? |
   | Feiertag | ?% | ganzer Tag? | ? |
   | Überstunden | ?% | ab wann? | ? |

2. **Steuerberater kontaktieren**: Welche DATEV-Lohnarten-Nummern verwendet der Steuerberater für Zuschläge? Brauchen wir steuerfrei/steuerpflichtig getrennt?

3. **Kombinierbarkeit**: Sonntag-Nacht — kumulieren oder höchster gilt? Feiertag-Nacht?

4. **Überstunden-Zuschlag**: Ab welcher Stundenzahl? Prozentsatz? Gibt es gestaffelte Zuschläge (z.B. erste 2h 25%, danach 50%)?

5. **Tarifvertrag**: Unterliegt Pro-Di einem Tarifvertrag, der die Zuschlagshöhen festlegt? Falls ja: welcher?

## Technische Skizze

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `prisma/schema.prisma` | Neues Modell `SurchargeRule` (tenant-scoped) |
| `supabase/migrations/` | Migration für `surcharge_rules`-Tabelle + Seed-Logik |
| `src/lib/services/surcharge-rule-service.ts` | Neuer Service: CRUD + Tenant-Default-Initialisierung |
| `src/lib/calculation/surcharges.ts` | `calculateSurcharges()` erweitern: SurchargeRule-Input statt DayPlanBonus-Input |
| `src/lib/services/daily-calc.ts` | `postSurchargeValues()` erweitern: SurchargeRules laden und übergeben |
| `src/lib/services/payroll-export-service.ts` | `generateDatevLodas()` erweitern: Zuschlagslohnarten aus SurchargeRule.datevWageTypeCode |
| `src/lib/services/export-context-builder.ts` | Zuschlagsdaten im Template-Kontext bereitstellen |
| `src/trpc/routers/` | Neuer Router `surchargeRules.ts` |
| `src/app/[locale]/(dashboard)/admin/` | Neue UI-Seite für Zuschlagskonfiguration |

### Design-Entscheidung: SurchargeRule vs. DayPlanBonus

Zwei Optionen:
- **Option A**: `SurchargeRule` als Tenant-Level-Override, `DayPlanBonus` bleibt als DayPlan-spezifischer Override
- **Option B**: `SurchargeRule` ersetzt `DayPlanBonus` komplett, Migration konvertiert bestehende Daten

Empfehlung: Option A (schrittweise, rückwärtskompatibel). `calculateSurcharges()` prüft erst DayPlanBonus (wenn vorhanden), dann SurchargeRule als Fallback.

## Risiko / Komplexität

**T-Shirt-Größe: L**

- Neues Datenmodell + Service + UI + Berechnungslogik-Anpassung
- §3b EStG steuerfreie Berechnung erfordert korrekte Mathematik
- Migration bestehender DayPlanBonus-Daten birgt Risiko bei inkonsistenten Konfigurationen
- DATEV-Export-Änderung ist sensibel (Steuerberater verlässt sich darauf)
- **Test-Aufwand: ~35-40% der Implementierungszeit**

## Abhängigkeiten

- **Keine harten Abhängigkeiten** zu anderen Tickets
- Ticket 1 (Nachtschicht-Bewertung) beeinflusst, welchem Kalendertag ein Zuschlag zugeordnet wird — beide Tickets sollten dieselbe Tageszuordnungslogik verwenden
- Ticket 3 (Überstunden-Auszahlung) kann auf Überstunden-Zuschlagsberechnung hier aufbauen

## Out of Scope

- Tarifvertrags-spezifische Regelvorlagen (Post-Launch, wenn erster Tarifkunde da ist)
- Automatische §3b-EStG-Grenzwertprüfung (Phase 2 — erstmal korrekte Berechnung, Validierung durch Steuerberater)
- Änderung der DayPlanBonus-UI (bestehende UI bleibt, neue SurchargeRule-UI kommt dazu)
