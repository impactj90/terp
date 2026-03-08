# ZMI-TICKET-234: DailyCalcService Port (1.250 Zeilen Go → TS)

Status: Completed
Priority: P1
Owner: TBD
Completed: 2026-03-08

## Goal
Den vollständigen DailyCalcService von Go nach TypeScript portieren. Dies ist das **komplexeste Ticket** der gesamten Migration — der Service orchestriert die Tagesberechnung: Buchungen laden, EmployeeDayPlan laden, Pure-Calculation-Library aufrufen, DailyValues + DailyAccountValues speichern. Nutzt die in TICKET-233 erstellte Calculation Engine.

## Scope
- **In scope:**
  - `DailyCalcService` als tRPC-kompatible Service-Klasse
  - Orchestrierung: DB-Lesen → Berechnen → DB-Schreiben
  - Booking-Pair-Matching (Kommen/Gehen Paare bilden)
  - Holiday-Erkennung für einen Tag
  - EmployeeDayPlan-Loading (Soll-Arbeitszeit)
  - DailyValue + DailyAccountValue Upsert
  - Calculation Log (JSON-Protokoll der Berechnung)
- **Out of scope:**
  - Pure-Calculation-Funktionen (TICKET-233)
  - Calculate-Day API-Endpoint (TICKET-235)
  - Recalculation-Cascade (TICKET-243)

## Requirements

### Service-Struktur
```typescript
class DailyCalcService {
  constructor(private prisma: PrismaClient) {}

  // Hauptmethode: Berechnet einen Tag für einen Mitarbeiter
  async calculateDay(
    tenantId: string,
    employeeId: string,
    date: Date
  ): Promise<DailyValue>

  // Bulk: Berechnet einen Datumsbereich
  async calculateDateRange(
    tenantId: string,
    employeeId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<DailyValue[]>

  // Interne Methoden:
  private async loadBookings(tenantId, employeeId, date): Promise<Booking[]>
  private async loadEmployeeDayPlan(tenantId, employeeId, date): Promise<EmployeeDayPlan | null>
  private async loadTariffConfig(tenantId, employeeId, date): Promise<TariffConfig | null>
  private async isHoliday(tenantId, date): Promise<Holiday | null>
  private matchBookingPairs(bookings: Booking[]): BookingPair[]
  private buildCalculationInput(pairs, dayPlan, tariff, holiday): CalculationInput
  private async saveDailyValue(tenantId, employeeId, date, result): Promise<DailyValue>
}
```

### Berechnungs-Ablauf (1:1 Port von Go)
1. **Buchungen laden** — Alle Buchungen des Tages für den Mitarbeiter
2. **Pair-Matching** — Kommen/Gehen-Buchungen zu Paaren zusammenführen
3. **EmployeeDayPlan laden** — Soll-Arbeitszeit des Tages
4. **Tarif-Konfiguration laden** — Aktiver Tarif mit Pausen/Zuschlägen
5. **Feiertags-Check** — Ist der Tag ein Feiertag?
6. **Pure Calculation aufrufen** — Calculation Engine aus TICKET-233
   - Ist-Arbeitszeit berechnen
   - Pausen berechnen/abziehen
   - Überstunden berechnen
   - Zuschläge berechnen
   - Kontowerte berechnen
7. **DailyValue speichern** — Upsert in daily_values
8. **DailyAccountValues speichern** — Upsert in daily_account_values
9. **Calculation Log speichern** — JSON mit Berechnungsschritten

### Business Logic (aus Go portiert)
- `apps/api/internal/service/daily_calc.go` (1.250 Zeilen) — Vollständiger Port:
  - `Calculate()` → `calculateDay()`
  - `RecalcDateRange()` → `calculateDateRange()`
  - Booking-Loading + Pair-Matching
  - Holiday-Check
  - EmployeeDayPlan + Tariff Loading
  - DailyValue/DailyAccountValue Upsert
  - Calculation Log

### Kritische Edge Cases (aus Go-Code)
- Buchungen über Mitternacht (Nachtarbeit)
- Tag ohne Buchungen (Soll-Arbeitszeit trotzdem berechnen)
- Mehrere Kommen/Gehen-Paare an einem Tag
- Unbezahlte Pausen vs. bezahlte Pausen
- Feiertag an einem Wochentag vs. Wochenende
- Employee ohne aktiven Tarif

## Acceptance Criteria
- [ ] `calculateDay()` produziert identische Ergebnisse wie Go-Implementation
- [ ] `calculateDateRange()` berechnet mehrere Tage effizient
- [ ] Booking-Pair-Matching funktioniert für alle Kombinationen
- [ ] Nachtarbeit (über Mitternacht) wird korrekt berechnet
- [ ] Calculation Log enthält nachvollziehbare Berechnungsschritte
- [ ] DailyValue + DailyAccountValues werden per Upsert gespeichert
- [ ] Alle Edge Cases aus dem Go-Code abgedeckt
- [ ] Performance: < 100ms pro Tag-Berechnung

## Tests
- Unit-Test: Booking-Pair-Matching (einfach, mehrfach, ungepaart)
- Unit-Test: calculateDay mit Standard-Arbeitstag
- Unit-Test: calculateDay mit Nachtarbeit
- Unit-Test: calculateDay an Feiertag
- Unit-Test: calculateDay ohne Buchungen
- Unit-Test: calculateDay ohne aktiven Tarif
- Integration-Test: calculateDateRange für eine Woche
- Regression-Test: Go-Berechnungsergebnisse als Expected Values
- Performance-Test: 100 Tage in < 10s

## Dependencies
- ZMI-TICKET-231 (Prisma Schema: bookings, daily_values)
- ZMI-TICKET-232 (Bookings CRUD — Buchungen müssen existieren)
- ZMI-TICKET-233 (Calculation Engine — Pure Math Functions)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/daily_calc.go` (1.250 Zeilen — vollständiger Port)
- `apps/api/internal/repository/dailyvalue.go` (299 Zeilen — Upsert-Logik)
- `apps/api/internal/repository/daily_account_value.go` (149 Zeilen)
