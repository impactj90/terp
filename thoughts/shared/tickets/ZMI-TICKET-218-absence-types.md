# ZMI-TICKET-218: Absence Types

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Absence Types (Abwesenheitstypen) implementieren. Absence Types definieren die verschiedenen Abwesenheitsarten (Urlaub, Krankheit, etc.) mit zugehörigen Berechnungsregeln und sind die Grundlage für das Abwesenheits-Management.

## Scope
- **In scope:**
  - tRPC `absenceTypes` Router (CRUD)
  - Verknüpfung mit Calculation Rules (FK)
  - Frontend-Hooks Migration (Teil von `use-absences.ts`)
- **Out of scope:**
  - Absence CRUD (TICKET-240)
  - AbsenceTypeGroups (bereits in TICKET-216)

## Requirements

### tRPC Router: `absenceTypes`
- **Procedures:**
  - `absenceTypes.list` (query)
    - Input: `{ is_active? }`
    - Output: `AbsenceType[]` (mit CalculationRule-Details)
    - Middleware: `tenantProcedure` + `requirePermission("absence_types.read")`
  - `absenceTypes.getById` (query)
    - Input: `{ id }`
    - Output: `AbsenceType` (mit CalculationRule, AbsenceTypeGroup)
  - `absenceTypes.create` (mutation)
    - Input: `{ name, code, description?, color?, calculation_rule_id?, absence_type_group_id?, affects_vacation?, requires_approval?, is_active? }`
    - Output: `AbsenceType`
    - Middleware: `requirePermission("absence_types.write")`
  - `absenceTypes.update` (mutation)
    - Input: `{ id, ...partialFields }`
  - `absenceTypes.delete` (mutation)
    - Input: `{ id }`
    - Logik: Prüfe ob AbsenceType in Verwendung (Absences existieren)

### Prisma Schema (Erweiterung)
```prisma
model AbsenceType {
  id                    String   @id @default(uuid())
  tenant_id             String   @db.Uuid
  name                  String
  code                  String
  description           String?
  color                 String?
  calculation_rule_id   String?  @db.Uuid
  absence_type_group_id String?  @db.Uuid
  affects_vacation      Boolean  @default(false)
  requires_approval     Boolean  @default(true)
  is_half_day_allowed   Boolean  @default(false)
  is_active             Boolean  @default(true)
  created_at            DateTime @default(now())
  updated_at            DateTime @updatedAt
  deleted_at            DateTime?

  calculation_rule      CalculationRule?  @relation(fields: [calculation_rule_id], references: [id])
  absence_type_group    AbsenceTypeGroup? @relation(fields: [absence_type_group_id], references: [id])

  @@map("absence_types")
}
```

### Frontend Hook Migration
- `useAbsenceTypes`, `useAbsenceType`, `useCreateAbsenceType`, `useUpdateAbsenceType`, `useDeleteAbsenceType` aus `apps/web/src/hooks/api/use-absences.ts` → `trpc.absenceTypes.*`

### Business Logic (aus Go portiert)
- AbsenceType-spezifische Logik aus `apps/api/internal/service/absence.go` (die Type-bezogenen Teile)
- `apps/api/internal/repository/absencetype.go` (113 Zeilen)

## Acceptance Criteria
- [ ] AbsenceType CRUD mit Calculation Rule Verknüpfung
- [ ] Löschung verhindert wenn AbsenceType in Absences verwendet
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: AbsenceType mit CalculationRule erstellen
- Unit-Test: Löschung mit bestehenden Absences verhindert
- Integration-Test: CRUD-Flow

## Dependencies
- ZMI-TICKET-216 (Booking Types, Reasons, Groups — CalculationRule, AbsenceTypeGroup Modelle)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/absencetype.go` (116 Zeilen)
- `apps/api/internal/repository/absencetype.go` (113 Zeilen)
- Teile von `apps/api/internal/service/absence.go` (AbsenceType-CRUD-Methoden)
- Teile von `apps/api/internal/handler/absence.go` (AbsenceType-Handler)
- Teile von `apps/web/src/hooks/api/use-absences.ts` (AbsenceType-Hooks)
