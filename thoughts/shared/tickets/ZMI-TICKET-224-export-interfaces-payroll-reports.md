# ZMI-TICKET-224: Export Interfaces, Payroll Exports, Reports

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Export-Interfaces (Lohnexport-Schnittstellen), Payroll Exports (Lohnabrechnungs-Exporte mit Generierung und Download) und Reports (Berichts-Generierung mit Download). Diese Entitäten unterstützen asynchrone Generierung (HTTP 202).

## Scope
- **In scope:**
  - tRPC `exportInterfaces` Router (CRUD + Account-Zuordnung)
  - tRPC `payrollExports` Router (CRUD + Generate + Preview + Download)
  - tRPC `reports` Router (CRUD + Generate + Download)
  - Asynchrone Generierung mit Status-Polling
  - Frontend-Hooks Migration
- **Out of scope:**
  - DATEV-Export Format (Zukunft)
  - Eigentliche Lohnberechnung (TICKET-238)

## Requirements

### tRPC Router: `exportInterfaces`
- **Procedures:**
  - `exportInterfaces.list` (query)
    - Output: `ExportInterface[]`
    - Middleware: `tenantProcedure` + `requirePermission("export_interfaces.read")`
  - `exportInterfaces.getById` (query)
    - Output: `ExportInterface` (mit Accounts)
  - `exportInterfaces.create` (mutation)
    - Input: `{ name, type, config? }`
  - `exportInterfaces.update/delete`
  - `exportInterfaces.accounts` (query) — Zugeordnete Accounts
    - Input: `{ id }`
  - `exportInterfaces.setAccounts` (mutation) — Accounts zuordnen
    - Input: `{ id, account_ids }`

### tRPC Router: `payrollExports`
- **Procedures:**
  - `payrollExports.list` (query) — Mit Status-Filter
    - Input: `{ page?, pageSize?, status? }`
    - Output: `{ items: PayrollExport[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("payroll_exports.read")`
  - `payrollExports.getById` (query) — Mit Polling für Status-Updates
    - Input: `{ id }`
    - Output: `PayrollExport`
  - `payrollExports.preview` (query) — Vorschau der Export-Daten
    - Input: `{ id }`
    - Output: `PayrollExportPreview`
  - `payrollExports.generate` (mutation) — Asynchrone Generierung
    - Input: `{ export_interface_id, year, month, employee_ids? }`
    - Output: `PayrollExport` (Status: "pending")
    - Middleware: `requirePermission("payroll_exports.write")`
  - `payrollExports.delete` (mutation)
  - `payrollExports.download` (query) — Datei-Download
    - Input: `{ id }`
    - Output: Binary Blob (via tRPC File Response)

### tRPC Router: `reports`
- **Procedures:**
  - `reports.list` (query) — Mit Status-Filter
    - Input: `{ page?, pageSize?, status? }`
    - Output: `{ items: Report[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("reports.read")`
  - `reports.getById` (query) — Mit Polling
  - `reports.generate` (mutation) — Asynchrone Generierung
    - Input: `{ type, parameters }`
    - Output: `Report` (Status: "pending")
    - Middleware: `requirePermission("reports.write")`
  - `reports.delete` (mutation)
  - `reports.download` (query) — Datei-Download

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-export-interfaces.ts` → `trpc.exportInterfaces.*`
- `apps/web/src/hooks/api/use-payroll-exports.ts` → `trpc.payrollExports.*`
- `apps/web/src/hooks/api/use-reports.ts` → `trpc.reports.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/exportinterface.go` (209 Zeilen)
- `apps/api/internal/service/payrollexport.go` (516 Zeilen) — Generate + Preview + Download
- `apps/api/internal/service/report.go` (938 Zeilen) — Generate + Download

## Acceptance Criteria
- [ ] Export Interface CRUD mit Account-Zuordnung
- [ ] Payroll Export asynchrone Generierung mit Status-Tracking
- [ ] Payroll Export Preview und Download
- [ ] Report asynchrone Generierung mit Download
- [ ] Polling-Mechanismus für Status-Updates im Frontend
- [ ] Alle Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Export Interface Account-Zuordnung
- Unit-Test: Payroll Export Generierung (Status-Transitions)
- Unit-Test: Report Generierung
- Integration-Test: Payroll Export Generate → Poll → Download Flow
- Integration-Test: Report Generate → Poll → Download Flow

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-213 (Accounts — für ExportInterface Account-Zuordnung)
- ZMI-TICKET-214 (Employees — für Payroll Export Employee-Filter)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/exportinterface.go` (209 Zeilen)
- `apps/api/internal/handler/exportinterface.go` (351 Zeilen)
- `apps/api/internal/repository/exportinterface.go` (193 Zeilen)
- `apps/api/internal/service/payrollexport.go` (516 Zeilen)
- `apps/api/internal/handler/payrollexport.go` (355 Zeilen)
- `apps/api/internal/repository/payrollexport.go` (121 Zeilen)
- `apps/api/internal/service/report.go` (938 Zeilen)
- `apps/api/internal/handler/report.go` (294 Zeilen)
- `apps/api/internal/repository/report.go` (104 Zeilen)
- `apps/web/src/hooks/api/use-export-interfaces.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-payroll-exports.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-reports.ts` (Frontend-Hook)
