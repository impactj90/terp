# ZMI-TICKET-227: Monthly Eval Templates, Correction Messages

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Monthly Evaluation Templates (Monatsauswertungs-Vorlagen) und den Correction Assistant (Korrektur-Assistent mit Nachrichten). Templates definieren, welche Konten/Werte in der Monatsauswertung angezeigt werden.

## Scope
- **In scope:**
  - tRPC `monthlyEvalTemplates` Router (CRUD + Default)
  - tRPC `correctionAssistant` Router (Items + Messages)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Monatliche Berechnung (TICKET-238)
  - Monatsauswertungs-Anzeige (TICKET-239)

## Requirements

### tRPC Router: `monthlyEvalTemplates`
- **Procedures:**
  - `monthlyEvalTemplates.list` (query)
    - Output: `MonthlyEvalTemplate[]`
    - Middleware: `tenantProcedure` + `requirePermission("monthly_eval_templates.read")`
  - `monthlyEvalTemplates.getById` (query)
    - Input: `{ id }`
    - Output: `MonthlyEvalTemplate` (mit Konto-Konfiguration)
  - `monthlyEvalTemplates.default` (query) — Standard-Template laden
    - Output: `MonthlyEvalTemplate`
  - `monthlyEvalTemplates.create` (mutation)
    - Input: `{ name, config, is_default? }`
    - Middleware: `requirePermission("monthly_eval_templates.write")`
  - `monthlyEvalTemplates.update` (mutation)
  - `monthlyEvalTemplates.delete` (mutation)
  - `monthlyEvalTemplates.setDefault` (mutation)
    - Input: `{ id }`

### tRPC Router: `correctionAssistant`
- **Procedures:**
  - `correctionAssistant.items` (query) — Korrektur-Vorschläge
    - Input: `{ employee_id?, from_date?, to_date?, type?, page?, pageSize? }`
    - Output: `{ items: CorrectionAssistantItem[], total: number }`
    - Middleware: `tenantProcedure` + `requirePermission("corrections.read")`
  - `correctionAssistant.messages` (query) — Korrektur-Nachrichten
    - Input: `{ employee_id?, status?, page?, pageSize? }`
    - Output: `{ items: CorrectionMessage[], total: number }`
  - `correctionAssistant.message` (query)
    - Input: `{ id }`
    - Output: `CorrectionMessage`
  - `correctionAssistant.updateMessage` (mutation)
    - Input: `{ id, status?, response? }`
    - Middleware: `requirePermission("corrections.write")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-monthly-evaluations.ts` → `trpc.monthlyEvalTemplates.*`
- `apps/web/src/hooks/api/use-correction-assistant.ts` → `trpc.correctionAssistant.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/monthly_evaluation_template.go` (214 Zeilen)
- `apps/api/internal/service/correction_assistant.go` (357 Zeilen)

## Acceptance Criteria
- [ ] MonthlyEvalTemplate CRUD mit Default-Verwaltung
- [ ] Correction Assistant Items-Query mit Filtern
- [ ] Correction Messages CRUD mit Status-Updates
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Template Default-Verwaltung
- Unit-Test: Correction Assistant Items-Filterung
- Unit-Test: Correction Message Status-Update
- Integration-Test: CRUD-Flow für beide Entitäten

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-213 (Accounts — für Template Konto-Konfiguration)
- ZMI-TICKET-214 (Employees — für Correction Assistant Employee-Filter)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/monthly_evaluation_template.go` (214 Zeilen)
- `apps/api/internal/handler/monthly_evaluation_template.go` (302 Zeilen)
- `apps/api/internal/repository/monthly_evaluation_template.go` (97 Zeilen)
- `apps/api/internal/service/correction_assistant.go` (357 Zeilen)
- `apps/api/internal/handler/correction_assistant.go` (301 Zeilen)
- `apps/api/internal/repository/correction_message.go` (116 Zeilen)
- `apps/web/src/hooks/api/use-monthly-evaluations.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-correction-assistant.ts` (Frontend-Hook)
