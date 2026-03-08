# ZMI-TICKET-233: Calculation Engine: Pure Math Library (TypeScript)

Status: Completed
Priority: P1
Owner: TBD

## Goal
Die reine Berechnungslogik der Tagesberechnung als standalone TypeScript-Library implementieren. Diese Library enthält KEINE Datenbankzugriffe — nur Pure Functions für Zeitberechnungen, Pausen-Berechnung, Überstunden, Zuschläge und Kontowert-Aggregation.

## Scope
- **In scope:**
  - Time-Arithmetic Funktionen (Zeitdifferenzen, Rundung, Überlappung)
  - Pausen-Berechnung (automatisch, manuell, Tarif-Pausen)
  - Überstunden-Berechnung
  - Zuschlagsberechnung (Nacht, Wochenende, Feiertag)
  - Kontowert-Aggregation (Summen pro Account)
  - Alle Funktionen als Pure Functions (Input → Output, keine Side Effects)
  - Comprehensive Unit Tests
- **Out of scope:**
  - DB-Zugriffe (TICKET-234 integriert die Library)
  - Monatliche Aggregation (TICKET-238)
  - API-Endpoints (TICKET-235)

## Requirements

### Library-Struktur
```
apps/web/src/lib/calculation/
├── index.ts              # Public API
├── types.ts              # Input/Output Typen
├── time.ts               # Zeitberechnungen
├── breaks.ts             # Pausenberechnung
├── overtime.ts           # Überstundenberechnung
├── surcharges.ts         # Zuschläge
├── accounts.ts           # Kontowert-Berechnung
└── __tests__/
    ├── time.test.ts
    ├── breaks.test.ts
    ├── overtime.test.ts
    ├── surcharges.test.ts
    └── accounts.test.ts
```

### Kern-Funktionen

#### Time Calculations (`time.ts`)
```typescript
// Zeitdifferenz in Minuten
function timeDiffMinutes(start: string, end: string): number
// Überlappung zweier Zeitbereiche
function timeOverlapMinutes(range1: TimeRange, range2: TimeRange): number
// Runden auf Intervall (z.B. 5-Minuten)
function roundToInterval(minutes: number, interval: number): number
// Nachtarbeit erkennen (über Mitternacht)
function splitAtMidnight(start: string, end: string): TimeRange[]
```

#### Break Calculation (`breaks.ts`)
```typescript
// Automatische Pausenberechnung nach Arbeitszeit
function calculateAutoBreaks(workMinutes: number, breakRules: BreakRule[]): number
// Tarif-Pausen abziehen
function applyTariffBreaks(timeRanges: TimeRange[], breaks: TariffBreak[]): TimeRange[]
// Manuelle Pausen verrechnen
function applyManualBreaks(workMinutes: number, breakMinutes: number): number
```

#### Overtime Calculation (`overtime.ts`)
```typescript
// Überstunden berechnen
function calculateOvertime(actualMinutes: number, plannedMinutes: number): OvertimeResult
// Flexible Arbeitszeit (Gleitzeitkonto)
function calculateFlextime(actualMinutes: number, plannedMinutes: number, config: FlextimeConfig): FlextimeResult
```

#### Surcharge Calculation (`surcharges.ts`)
```typescript
// Zuschläge berechnen (Nacht, Wochenende, Feiertag)
function calculateSurcharges(
  workRanges: TimeRange[],
  surchargeRules: SurchargeRule[],
  isHoliday: boolean,
  dayOfWeek: number
): SurchargeResult[]
```

#### Account Aggregation (`accounts.ts`)
```typescript
// Kontowerte berechnen
function calculateAccountValues(
  dailyResult: DailyCalculationResult,
  accountMappings: AccountMapping[]
): AccountValue[]
```

### Business Logic (aus Go portiert)
- `apps/api/internal/service/daily_calc.go` (1.250 Zeilen) — Pure Calculation-Funktionen extrahiert:
  - Zeilen ~100-300: Zeitberechnungen und Pair-Matching
  - Zeilen ~300-500: Pausenberechnung (Auto/Manual/Tariff)
  - Zeilen ~500-700: Überstunden und Gleitzeitberechnung
  - Zeilen ~700-900: Zuschläge (Nacht/Wochenende/Feiertag)
  - Zeilen ~900-1100: Kontowert-Aggregation
  - Zeilen ~1100-1250: Hilfs-Funktionen (Rounding, Date-Helpers)

## Acceptance Criteria
- [ ] Alle Pure Functions implementiert und getestet
- [ ] Keine DB-Abhängigkeiten in der Library
- [ ] Zeitberechnung über Mitternacht funktioniert
- [ ] Automatische Pausenberechnung nach deutschem Arbeitszeitgesetz
- [ ] Zuschlagsberechnung für alle Typen (Nacht, Wochenende, Feiertag)
- [ ] Edge Cases abgedeckt (0 Minuten, negative Überstunden, Feiertag am Wochenende)
- [ ] 100% Test-Coverage für alle Berechnungsfunktionen

## Tests
- Unit-Test: `timeDiffMinutes` mit verschiedenen Zeitformaten
- Unit-Test: `timeOverlapMinutes` mit Überlappung/keine Überlappung
- Unit-Test: `splitAtMidnight` für Nachtarbeit
- Unit-Test: `calculateAutoBreaks` nach ArbZG-Regeln
- Unit-Test: `applyTariffBreaks` mit verschiedenen Pause-Konfigurationen
- Unit-Test: `calculateOvertime` positiv/negativ
- Unit-Test: `calculateSurcharges` Nacht/Wochenende/Feiertag-Kombinationen
- Unit-Test: `calculateAccountValues` Aggregation
- Snapshot-Tests: Bekannte Go-Berechnungsergebnisse als Snapshots

## Dependencies
- Keine (standalone Library)

## Go-Dateien die ersetzt werden
- Teile von `apps/api/internal/service/daily_calc.go` (Pure-Function-Anteil, ~600 von 1.250 Zeilen)
- `apps/api/internal/service/date_helpers.go` (8 Zeilen)
