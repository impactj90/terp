# ZMI-TICKET-020: Reporting Module (Berichte)

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 8 Reports in ZMI Time

## Goal
Provide report generation endpoints for master data, monthly values, variable time reports, team reports, and order reports.

## Scope
- In scope: Report definitions, filters, export outputs (PDF/Excel), OpenAPI coverage.
- Out of scope: UI report designer (ReportBuilder) unless required by current system.

## Requirements
### Business rules
- Reports categories:
  - Master data reports (personnel lists, vacation lists, birthdays, phone lists, day/weekly plans)
  - Monthly reports (monthly summary, error reports, absence statistics)
  - Variable time reports (absence stats, vacation slip)
  - Team reports (team-grouped monthly data)
  - Order-related reports (if Auftrag module enabled)
- Filters include date range, department, cost center, employee, team.
- Outputs:
  - Printable
  - Exportable to PDF
  - Exportable to Excel

### API / OpenAPI
- Endpoints:
  - List available reports
  - Generate report with filters and output format
- OpenAPI must document report IDs, filters, and output formats.

## Acceptance criteria
- Reports generate data consistent with evaluation and stored values.
- PDF/Excel outputs are generated and returned/downloadable.
- Report filters respect user permissions and data scope.

## Tests
### Unit tests
- Filter logic for report queries (department, date range, employee).
- Output format selection routes to correct generator.

### API tests
- Generate master data report and verify file response.
- Generate monthly report for a date range and verify totals.

### Integration tests
- Reports reflect updates after recalculation and absence changes.


## Test Case Pack
1) Monthly report totals
   - Input: month with known overtime totals
   - Expected: report totals match monthly values
2) Export format
   - Input: export PDF vs Excel
   - Expected: file generated with correct format


## Dependencies
- Evaluation module (ZMI-TICKET-019).
- User permissions (ZMI-TICKET-003).
- Auftrag module (ZMI-TICKET-017) for order reports if enabled.
