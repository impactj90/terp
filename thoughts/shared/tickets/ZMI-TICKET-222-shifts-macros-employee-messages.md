# ZMI-TICKET-222: Shifts, Macros Config, Employee Messages

Status: Completed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Shifts (Schichten), Macros (Konfiguration + Assignments + Execution) und Employee Messages implementieren. Macros sind konfigurierbare Automatisierungen mit Zuweisungen und Ausführungs-History.

## Scope
- **In scope:**
  - tRPC `shifts` Router (CRUD)
  - tRPC `macros` Router (CRUD + Assignments + Execute + Executions)
  - tRPC `employeeMessages` Router (CRUD + Send)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Macro-Ausführung durch Scheduler (TICKET-246)
  - Employee Day Plan Shift-Zuordnung (TICKET-229)

## Requirements

### tRPC Router: `shifts`
- **Procedures:**
  - `shifts.list` (query)
    - Output: `Shift[]`
    - Middleware: `tenantProcedure` + `requirePermission("shifts.read")`
  - `shifts.getById/create/update/delete`
  - Middleware: `requirePermission("shifts.write")` für Mutationen

### tRPC Router: `macros`
- **Procedures:**
  - `macros.list` (query)
    - Output: `Macro[]`
    - Middleware: `tenantProcedure` + `requirePermission("macros.read")`
  - `macros.getById` (query)
    - Output: `Macro` (mit Assignments)
  - `macros.create` (mutation)
    - Input: `{ name, description?, type, config }`
  - `macros.update/delete`
  - `macros.assignments` (query) — Assignments eines Macros
    - Input: `{ macroId }`
    - Output: `MacroAssignment[]`
  - `macros.createAssignment` (mutation)
    - Input: `{ macroId, employee_id?, group_id?, scope_type }`
  - `macros.updateAssignment` (mutation)
  - `macros.deleteAssignment` (mutation)
  - `macros.execute` (mutation) — Macro manuell ausführen
    - Input: `{ macroId }`
    - Output: `MacroExecution`
    - Middleware: `requirePermission("macros.execute")`
  - `macros.executions` (query) — Ausführungs-History
    - Input: `{ macroId }`
    - Output: `MacroExecution[]`
  - `macros.execution` (query) — Einzelne Ausführung
    - Input: `{ executionId }`
    - Output: `MacroExecution` (mit Details)

### tRPC Router: `employeeMessages`
- **Procedures:**
  - `employeeMessages.list` (query) — Paginated
    - Input: `{ page?, pageSize?, status? }`
    - Output: `{ items: EmployeeMessage[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("employee_messages.read")`
  - `employeeMessages.getById` (query)
  - `employeeMessages.forEmployee` (query) — Nachrichten eines Mitarbeiters
    - Input: `{ employeeId }`
    - Output: `EmployeeMessage[]`
  - `employeeMessages.create` (mutation)
    - Input: `{ subject, body, recipient_ids, type? }`
    - Middleware: `requirePermission("employee_messages.write")`
  - `employeeMessages.send` (mutation) — Nachricht absenden
    - Input: `{ id }`
    - Middleware: `requirePermission("employee_messages.write")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-shift-planning.ts` → `trpc.shifts.*`
- `apps/web/src/hooks/api/use-macros.ts` → `trpc.macros.*`
- `apps/web/src/hooks/api/use-employee-messages.ts` → `trpc.employeeMessages.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/shift.go` (175 Zeilen)
- `apps/api/internal/service/macro.go` (562 Zeilen) — CRUD + Assignments + Execute
- `apps/api/internal/service/employee_message.go` (233 Zeilen)

## Acceptance Criteria
- [ ] Shift CRUD funktioniert
- [ ] Macro CRUD mit Assignments und Execution
- [ ] Macro-Ausführung erstellt Execution-Eintrag mit Ergebnis
- [ ] Employee Messages mit Send-Workflow
- [ ] Alle Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Macro mit Assignments erstellen
- Unit-Test: Macro-Ausführung mit Ergebnis
- Unit-Test: Employee Message Send-Workflow
- Integration-Test: Kompletter Macro-Flow (Create → Assign → Execute)
- Integration-Test: Employee Message Create → Send

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-210 (Tenants — tenantProcedure)
- ZMI-TICKET-214 (Employees — für Message-Empfänger, Macro-Assignments)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/shift.go` (175 Zeilen)
- `apps/api/internal/handler/shift.go` (217 Zeilen)
- `apps/api/internal/repository/shift.go` (97 Zeilen)
- `apps/api/internal/service/macro.go` (562 Zeilen)
- `apps/api/internal/handler/macro.go` (428 Zeilen)
- `apps/api/internal/repository/macro.go` (278 Zeilen)
- `apps/api/internal/service/employee_message.go` (233 Zeilen)
- `apps/api/internal/handler/employee_message.go` (292 Zeilen)
- `apps/api/internal/repository/employee_message.go` (180 Zeilen)
- `apps/web/src/hooks/api/use-shift-planning.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-macros.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-employee-messages.ts` (Frontend-Hook)
