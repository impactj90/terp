# Konfigurierbare Überstunden-Auszahlung

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. Pro-Di braucht eine klare Regelung, welche Überstunden wann ausbezahlt vs. ins Gleitzeitkonto gebucht werden.

**Vertikal-relevant**: Jeder Betrieb mit Überstunden braucht konfigurierbare Auszahlungsregeln. Die Schwellenwerte, Prozentsätze und Auszahlungszeitpunkte variieren stark (pro Vertrag, pro Tarifvertrag, pro betrieblicher Vereinbarung).

## Problem / Pain Point

**Ist-Zustand im Code**:
- `MonthlyValue.totalOvertime` existiert (aggregiert aus `DailyValue.overtime`)
- `DailyValue.overtime = max(0, netTime - targetTime)` wird korrekt berechnet
- Es gibt KEINE Auszahlungslogik, keinen Schwellenwert, keine Differenzierung zwischen "Konto" und "Auszahlung"
- HR muss manuell in Excel die Auszahlungsbeträge berechnen und dem Steuerberater mitteilen
- Keine Konfiguration pro Mitarbeiter/Vertrag

## Akzeptanzkriterien

1. **OvertimePayoutRule-Modell**: Pro Tenant konfigurierbare Auszahlungsregel mit: `thresholdMinutes` (ab welchem Überstundensaldo), `payoutMode` (ALL_ABOVE_THRESHOLD / PERCENTAGE / FIXED_AMOUNT), `payoutPercentage`, `payoutCycle` (MONTHLY / QUARTERLY / ON_DEMAND), `datevWageTypeCode` (für DATEV-Export)
2. **Employee-Override**: Optional pro Employee oder pro Vertrag ein Override der Tenant-Default-Regel (z.B. Führungskräfte: keine Auszahlung, nur Konto)
3. **Monatsabschluss-Integration**: Beim Schließen eines Monats (`MonthlyValue.isClosed = true`) wird die Auszahlungsberechnung ausgeführt: Saldo prüfen → Schwellenwert prüfen → Auszahlungsbetrag berechnen → als `OvertimePayout`-Record persistieren
4. **DATEV-Export**: Auszahlungsbeträge erscheinen im DATEV-Export als separate Lohnart mit konfiguriertem Lohnart-Code
5. **Gleitzeitkonto-Verrechnung**: Ausbezahlte Stunden werden vom Gleitzeitkonto abgezogen (Account-Buchung)
6. **Dashboard-Übersicht**: HR sieht pro MA den aktuellen Überstundensaldo, den zur Auszahlung anstehenden Betrag, und historische Auszahlungen
7. **Audit-Trail**: Jede Auszahlung wird protokolliert (wer hat wann welchen Betrag zur Auszahlung freigegeben)

## Test-Anforderungen

### Unit-Tests (Vitest)

Services/Functions unter Test:
- Neue Pure Function `calculateOvertimePayout(currentBalance, rule)` → `{ payoutMinutes, remainingBalance }`
- `OvertimePayoutService.processMonthlyPayout(tenantId, employeeId, year, month)`

Konkrete Test-Cases:
- **Happy Path**: Saldo 20h, Schwelle 10h, Mode ALL_ABOVE_THRESHOLD → Auszahlung 10h
- **PERCENTAGE Mode**: Saldo 20h, Schwelle 10h, Percentage 50% → Auszahlung 5h (50% von 10h über Schwelle)
- **Unter Schwelle**: Saldo 8h, Schwelle 10h → keine Auszahlung
- **Exakt Schwelle**: Saldo 10h, Schwelle 10h → keine Auszahlung (Schwelle ist exklusiv)
- **Null-Saldo**: Saldo 0h → keine Auszahlung
- **Negativer Saldo (Minderstunden)**: Saldo -5h → keine Auszahlung, keine Fehler
- **Employee-Override**: Tenant-Regel sagt Auszahlung, Employee-Override sagt KEINE → keine Auszahlung
- **Kein Override, Tenant-Default greift**: Employee ohne Override → Tenant-Regel wird angewendet
- **FIXED_AMOUNT Mode**: Saldo 30h, Fixed 10h → Auszahlung exakt 10h
- **Monatsübergang**: Saldo aus Vormonat korrekt übernommen
- **Dezimalwerte**: Saldo 10h 30min, Schwelle 10h → Auszahlung 30min

### Integration-Tests (Vitest, describe.sequential, echte DB)

- **Monatsabschluss → Auszahlung**: MA mit Überstunden → Monat schließen → OvertimePayout-Record prüfen → Account-Buchung prüfen (Gleitzeitkonto reduziert)
- **DATEV-Export mit Auszahlung**: Auszahlung vorhanden → Export generieren → Lohnart-Zeile mit korrektem Code und Betrag prüfen
- **Multi-Tenant-Isolation**: Tenant A und B haben unterschiedliche Auszahlungsregeln → korrekte Berechnung pro Tenant
- **Employee-Override-Flow**: Employee mit Override anlegen → Monatsabschluss → Override-Regel wird angewendet

### Browser-E2E-Tests (Playwright)

- **Admin konfiguriert Auszahlungsregel**: Login als Admin → Einstellungen → Überstunden-Auszahlung → Schwellenwert + Modus konfigurieren → Speichern
- **HR sieht Auszahlungsübersicht**: Dashboard → Überstunden-Widget → MAs mit anstehender Auszahlung sichtbar
- **Employee-Override setzen**: Mitarbeiter-Detailseite → Überstundenregel → Override konfigurieren

## Offene Fragen für Pro-Di

1. **Schwellenwert**: Ab wie vielen Überstunden wird ausbezahlt? Pro Monat oder kumuliert?
2. **Auszahlungsmodus**: Alles über Schwelle? Prozentual? Fester Betrag?
3. **Auszahlungszyklus**: Monatlich, quartalsweise, oder nur auf Antrag?
4. **DATEV-Lohnart**: Welche Lohnart-Nummer verwendet der Steuerberater für Überstunden-Auszahlung?
5. **Führungskräfte**: Gibt es Mitarbeitergruppen, die KEINE Überstunden-Auszahlung erhalten (nur Gleitzeitkonto)?
6. **Monatsabschluss-Prozess**: Wer schließt den Monat? HR? Automatisch nach X Tagen?
7. **Gleitzeitkonto-Obergrenze**: Gibt es eine maximale Anzahl Überstunden, die aufs Konto gehen dürfen?

## Technische Skizze

### Betroffene Komponenten

| Komponente | Änderung |
|---|---|
| `prisma/schema.prisma` | Neue Modelle: `OvertimePayoutRule` (tenant-level), `EmployeeOvertimePayoutOverride`, `OvertimePayout` (Einzelbuchung) |
| `supabase/migrations/` | Migration für neue Tabellen |
| `src/lib/services/overtime-payout-service.ts` | Neuer Service: Regel-CRUD, Berechnung, Monatsabschluss-Integration |
| `src/lib/services/payroll-export-service.ts` | `generateDatevLodas()`: Auszahlungs-Lohnart-Zeile hinzufügen |
| `src/lib/services/export-context-builder.ts` | Auszahlungsdaten im Template-Kontext |
| `src/trpc/routers/` | Neuer Router `overtimePayoutRules.ts` |
| `src/app/[locale]/(dashboard)/admin/` | UI für Regelkonfiguration + Dashboard-Widget |

### Interaktion mit Account-System

`OvertimePayout` wird als `DailyAccountValue` mit `source="overtime_payout"` gebucht — negativer Wert auf das Gleitzeitkonto (`Account`). Das stellt sicher, dass der Saldo korrekt sinkt und im nächsten Monat der reduzierte Saldo für die Schwellenwert-Prüfung herangezogen wird.

## Risiko / Komplexität

**T-Shirt-Größe: M**

- Neues Modell + Service, aber klare Berechnung ohne viele Edge Cases
- Hauptrisiko: Interaktion mit Account-System (Gleitzeitkonto-Buchung) muss sauber sein
- DATEV-Export-Anpassung ist unkritisch (eine zusätzliche Lohnart-Zeile)
- **Test-Aufwand: ~30% der Implementierungszeit**

## Abhängigkeiten

- **Ticket 2 (DATEV-Zuschläge)**: Falls Überstunden-Zuschlag als eigene Lohnart exportiert wird, sollte das SurchargeRule-Modell aus Ticket 2 existieren. Alternativ: Auszahlung unabhängig von Zuschlag implementieren.
- **Ticket 5 (Überstundenantrag)**: Referenziert die hier konfigurierte Verwertungsregel als Default für die "Verwertung" (Konto vs. Auszahlung)

## Out of Scope

- Automatische Auszahlungs-Genehmigung (Phase 2 — erstmal manuelle Freigabe durch HR)
- Stündliche Abrechnungsgrundlage (Stundenlohn × Überstunden = EUR-Betrag) — das macht der Steuerberater
- Gleitzeitkonto-Visualisierung (existiert evtl. bereits über Account-Auswertung)
