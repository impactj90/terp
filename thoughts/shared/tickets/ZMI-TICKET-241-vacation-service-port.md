# ZMI-TICKET-241: VacationService Port (Entitlement Calc, 627 Zeilen)

Status: Proposed
Priority: P1
Owner: TBD

## Goal
Den VacationService von Go nach TypeScript portieren. Der Service berechnet den Urlaubsanspruch pro Mitarbeiter und Jahr basierend auf Tarif, Betriebszugehörigkeit, Special Calculations und Capping Rules. Mit 627 Zeilen ist dies eines der komplexesten Berechnungs-Tickets.

## Scope
- **In scope:**
  - `VacationService` Portierung (Go → TypeScript)
  - Urlaubsanspruch-Berechnung (Entitlement Calculation)
  - Special Calculations (Alter, Betriebszugehörigkeit, Schwerbehindert)
  - Capping Rules (Höchst-/Mindestanspruch)
  - Employee Capping Exceptions
  - Carryover-Berechnung (Resturlaub-Übertrag)
  - VacationBalance Upsert
- **Out of scope:**
  - Vacation Configuration CRUD (TICKET-220)
  - Vacation Balance Router (TICKET-242)

## Requirements

### Service-Struktur
```typescript
class VacationService {
  constructor(private prisma: PrismaClient) {}

  // Urlaubsanspruch berechnen
  async calculateEntitlement(
    tenantId: string,
    employeeId: string,
    year: number
  ): Promise<VacationEntitlement>

  // Resturlaub-Übertrag berechnen
  async calculateCarryover(
    tenantId: string,
    employeeId: string,
    year: number
  ): Promise<CarryoverResult>

  // VacationBalance aktualisieren
  async updateBalance(
    tenantId: string,
    employeeId: string,
    year: number
  ): Promise<VacationBalance>

  // Interne Methoden:
  private async loadTariffVacationDays(tenantId, employeeId, year): Promise<Decimal>
  private async loadSpecialCalcGroup(tenantId, employeeId): Promise<VacationCalcGroup | null>
  private applySpecialCalculations(baseDays, employee, specialCalcs): Decimal
  private async loadCappingRuleGroup(tenantId, employeeId): Promise<VacationCappingRuleGroup | null>
  private applyCappingRules(days, cappingRules, exceptions): Decimal
  private calculateProRata(days, entryDate, exitDate, year): Decimal
}
```

### Berechnungs-Logik (aus Go portiert)
1. **Basis-Anspruch** aus Tarif laden (vacation_days Feld)
2. **Special Calculations** anwenden:
   - Altersbedingt (z.B. ab 55 Jahre: +2 Tage)
   - Betriebszugehörigkeit (z.B. ab 10 Jahre: +3 Tage)
   - Schwerbehinderung (+5 Tage nach SGB)
   - Custom Regeln
3. **Capping Rules** anwenden:
   - Maximum-Cap (z.B. max 30 Tage)
   - Minimum-Cap (z.B. min 20 Tage)
   - Employee-spezifische Exceptions
4. **Pro-Rata-Berechnung** bei Eintritt/Austritt im laufenden Jahr
5. **Carryover** aus Vorjahr (Restanspruch mit Verfallsdatum)
6. **Balance-Update**: Verrechnung mit genutztem Urlaub

### Business Logic (aus Go portiert)
- `apps/api/internal/service/vacation.go` (627 Zeilen) — Vollständiger Port:
  - `GetBalance()` → `calculateEntitlement()` + `updateBalance()`
  - Special Calculation Logic
  - Capping Rule Logic
  - Pro-Rata Calculation
  - Carryover Logic
- `apps/api/internal/service/vacationbalance.go` (127 Zeilen) — Balance Management
- `apps/api/internal/service/vacationcarryover.go` (193 Zeilen) — Carryover Logic

## Acceptance Criteria
- [ ] Basis-Anspruch wird aus Tarif geladen
- [ ] Special Calculations werden korrekt angewendet
- [ ] Capping Rules begrenzen den Anspruch
- [ ] Employee-spezifische Exceptions überschreiben Capping
- [ ] Pro-Rata-Berechnung bei Mid-Year-Entry/Exit
- [ ] Carryover aus Vorjahr mit Verfallsdatum
- [ ] VacationBalance wird korrekt aktualisiert
- [ ] Identische Ergebnisse wie Go-Implementation

## Tests
- Unit-Test: Basis-Anspruch aus Tarif
- Unit-Test: Special Calc Altersbedingt
- Unit-Test: Special Calc Betriebszugehörigkeit
- Unit-Test: Capping Rule Maximum
- Unit-Test: Employee Exception Override
- Unit-Test: Pro-Rata bei Eintritt im Juni
- Unit-Test: Carryover mit Verfallsdatum
- Integration-Test: Vollständige Anspruchsberechnung
- Regression-Test: Go-Berechnungsergebnisse als Expected Values

## Dependencies
- ZMI-TICKET-237 (Prisma Schema: vacation_balances)
- ZMI-TICKET-240 (Absence Service — für genutzte Urlaubstage)
- ZMI-TICKET-220 (Vacation Configuration — SpecialCalcs, CappingRules)
- ZMI-TICKET-214 (Employees — Employee-Daten für Berechnung)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/vacation.go` (627 Zeilen)
- `apps/api/internal/service/vacationbalance.go` (127 Zeilen)
- `apps/api/internal/service/vacationcarryover.go` (193 Zeilen)
- `apps/api/internal/repository/vacationbalance.go` (150 Zeilen)
