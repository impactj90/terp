# ZMI-TICKET-248: Evaluation Queries Router

Status: Completed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Auswertungs-Queries: Tageswerte-Abfrage, Buchungs-Abfrage, Terminal-Buchungen-Abfrage, Änderungslogs und Workflow-History. Diese Read-Only-Endpoints bieten gefilterte Sichten auf verschiedene Datenquellen.

## Scope
- **In scope:**
  - tRPC `evaluations` Router (Query-Endpoints)
  - Tageswerte-Auswertung
  - Buchungs-Auswertung
  - Terminal-Buchungs-Auswertung
  - Änderungslogs
  - Workflow-History
  - Frontend-Hooks Migration
- **Out of scope:**
  - Datenänderungen (alles Read-Only)
  - Report-Generierung (TICKET-224)

## Requirements

### tRPC Router: `evaluations`
- **Procedures:**
  - `evaluations.dailyValues` (query) — Tageswerte-Abfrage
    - Input: `{ employee_id?, department_id?, from_date, to_date, account_ids? }`
    - Output: `DailyValue[]` (mit selektierten AccountValues)
    - Middleware: `tenantProcedure` + `requirePermission("evaluations.read")` + `applyDataScope()`
  - `evaluations.bookings` (query) — Buchungs-Abfrage
    - Input: `{ employee_id?, from_date, to_date, booking_type_id? }`
    - Output: `Booking[]`
  - `evaluations.terminalBookings` (query) — Terminal-Buchungs-Abfrage
    - Input: `{ employee_id?, from_date, to_date }`
    - Output: `TerminalBooking[]`
  - `evaluations.logs` (query) — Änderungslogs
    - Input: `{ employee_id?, entity_type?, from_date?, to_date? }`
    - Output: `AuditLog[]`
  - `evaluations.workflowHistory` (query) — Workflow-History
    - Input: `{ employee_id?, from_date?, to_date? }`
    - Output: `WorkflowEvent[]`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-evaluations.ts` → `trpc.evaluations.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/evaluation.go` (564 Zeilen, Evaluation-Queries)

## Acceptance Criteria
- [ ] Alle 5 Evaluation-Queries funktionieren mit Filtern
- [ ] Data-Scope-Enforcement auf allen Queries
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: DailyValues Query mit Account-Filter
- Unit-Test: Bookings Query mit Datumsbereich
- Unit-Test: Data-Scope-Filterung
- Integration-Test: Alle 5 Query-Typen

## Dependencies
- ZMI-TICKET-236 (Daily Values Router — DailyValues existieren)
- ZMI-TICKET-232 (Bookings — Bookings existieren)
- ZMI-TICKET-225 (Terminal Bookings)
- ZMI-TICKET-203 (Authorization Middleware — Data Scope)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/evaluation.go` (564 Zeilen — Query-Teile)
- `apps/api/internal/handler/evaluation.go` (331 Zeilen)
- `apps/web/src/hooks/api/use-evaluations.ts` (Frontend-Hook)
