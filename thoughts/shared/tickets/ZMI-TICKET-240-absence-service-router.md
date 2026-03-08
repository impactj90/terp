# ZMI-TICKET-240: Absence Service + Router (Create Range, Approve/Reject)

Status: Completed
Priority: P1
Owner: TBD

## Goal
tRPC-Router für das Abwesenheits-Management: Abwesenheiten erstellen (als Datumsbereich), genehmigen, ablehnen, stornieren. Die Abwesenheits-Erstellung erzeugt pro Tag einen AbsenceDay-Eintrag und berücksichtigt Feiertage und Wochenenden.

## Scope
- **In scope:**
  - tRPC `absences` Router (CRUD + Range Create + Approve/Reject/Cancel)
  - Datumsbereich-Erstellung (erzeugt mehrere AbsenceDays)
  - Genehmigungs-Workflow (Approve/Reject)
  - Urlaubs-Balance-Update nach Genehmigung
  - Frontend-Hooks Migration
- **Out of scope:**
  - Absence Types CRUD (TICKET-218)
  - Vacation Balance Berechnung (TICKET-241)

## Requirements

### tRPC Router: `absences`
- **Procedures:**
  - `absences.list` (query) — Paginated mit Filtern
    - Input: `{ page?, pageSize?, employee_id?, absence_type_id?, status?, from_date?, to_date? }`
    - Output: `{ items: AbsenceDay[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("absences.read")` + `applyDataScope()`
  - `absences.forEmployee` (query)
    - Input: `{ employeeId, from_date?, to_date?, status? }`
    - Output: `AbsenceDay[]`
    - Middleware: `requireEmployeePermission("absences.read_own", "absences.read")`
  - `absences.getById` (query)
    - Input: `{ id }`
    - Output: `AbsenceDay` (mit AbsenceType, Employee)
  - `absences.createRange` (mutation) — Abwesenheit für Datumsbereich erstellen
    - Input: `{ employee_id, absence_type_id, from_date, to_date, is_half_day?, notes? }`
    - Output: `AbsenceDay[]`
    - Logik:
      1. Datumsliste generieren (from_date → to_date)
      2. Wochenenden ausschließen (außer bei bestimmten AbsenceTypes)
      3. Feiertage ausschließen
      4. Pro gültigem Tag: AbsenceDay erstellen
      5. absence_range_id für Gruppierung setzen
    - Middleware: `requireEmployeePermission("absences.write_own", "absences.write")`
  - `absences.update` (mutation)
    - Input: `{ id, notes? }`
  - `absences.delete` (mutation)
    - Input: `{ id }`
    - Logik: Nur "pending" Absences löschbar
  - `absences.approve` (mutation)
    - Input: `{ id }`
    - Logik: Status → "approved", approved_at + approved_by, Recalc + VacationBalance Update
    - Middleware: `requirePermission("absences.approve")`
  - `absences.reject` (mutation)
    - Input: `{ id, reason? }`
    - Logik: Status → "rejected", rejected_at + rejected_by + reason

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-absences.ts` → `trpc.absences.*` (die Absence-spezifischen Hooks, nicht die AbsenceType-Hooks)

### Business Logic (aus Go portiert)
- `apps/api/internal/service/absence.go` (760 Zeilen) — Absence-Management:
  - Range-Erstellung mit Wochenend/Feiertags-Ausschluss
  - Genehmigungs-Workflow
  - Vacation-Balance-Update nach Genehmigung
  - Recalc-Trigger nach Approve/Reject

## Acceptance Criteria
- [ ] Range-Erstellung schließt Wochenenden und Feiertage aus
- [ ] Genehmigungs-Workflow (Pending → Approved / Rejected)
- [ ] Nur "pending" Absences können gelöscht werden
- [ ] Nach Genehmigung: VacationBalance wird aktualisiert (wenn affects_vacation)
- [ ] Nach Genehmigung: betroffene Tage werden neu berechnet
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Range-Erstellung mit Wochenend-Ausschluss
- Unit-Test: Range-Erstellung mit Feiertags-Ausschluss
- Unit-Test: Approve → VacationBalance Update
- Unit-Test: Reject mit Grund
- Unit-Test: Delete nur bei Status "pending"
- Integration-Test: Abwesenheit beantragen → Genehmigen → Balance prüfen
- E2E-Test: Abwesenheits-Antrag im Frontend

## Dependencies
- ZMI-TICKET-236 (Daily Values Router — für Recalc nach Approve)
- ZMI-TICKET-237 (Prisma Schema: absences, vacation_balances)
- ZMI-TICKET-218 (Absence Types)
- ZMI-TICKET-212 (Holidays — für Feiertags-Check bei Range-Erstellung)
- ZMI-TICKET-203 (Authorization Middleware — Data Scope)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/absence.go` (760 Zeilen — Absence-Teil)
- `apps/api/internal/handler/absence.go` (1079 Zeilen — Absence-Handler)
- `apps/api/internal/repository/absenceday.go` (224 Zeilen)
- `apps/api/internal/handler/vacation.go` (186 Zeilen — Vacation-Endpoints in Absence-Context)
- Teile von `apps/web/src/hooks/api/use-absences.ts` (Absence-Hooks, nicht AbsenceType)
