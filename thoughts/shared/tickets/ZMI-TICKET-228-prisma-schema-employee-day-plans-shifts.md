# ZMI-TICKET-228: Prisma Schema: employee_day_plans, shifts

Status: Proposed
Priority: P2
Owner: TBD

## Goal
Prisma-Schema um Employee Day Plans und Shift-Zuordnungen erweitern. Employee Day Plans sind die täglichen Arbeitszeitpläne pro Mitarbeiter und bilden die Grundlage für die Tagesberechnung.

## Scope
- **In scope:**
  - Prisma-Modelle: EmployeeDayPlan (mit Shift-Referenz, DayPlan-Referenz)
  - Verknüpfung Employee ↔ EmployeeDayPlan ↔ DayPlan ↔ Shift
  - `prisma generate` für aktualisierte TypeScript-Typen
- **Out of scope:**
  - Employee Day Plans Router (TICKET-229)
  - Daily Values (TICKET-231)

## Requirements

### Prisma Schema
```prisma
model EmployeeDayPlan {
  id          String    @id @default(uuid())
  tenant_id   String    @db.Uuid
  employee_id String    @db.Uuid
  date        DateTime  @db.Date
  day_plan_id String?   @db.Uuid
  shift_id    String?   @db.Uuid
  is_work_day Boolean   @default(true)
  start_time  String?
  end_time    String?
  planned_hours Decimal? @db.Decimal(10,2)
  break_minutes Int?
  notes       String?
  source      String?   // "manual", "tariff", "generated"
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  employee    Employee  @relation(fields: [employee_id], references: [id])
  day_plan    DayPlan?  @relation(fields: [day_plan_id], references: [id])
  shift       Shift?    @relation(fields: [shift_id], references: [id])

  @@unique([employee_id, date])
  @@map("employee_day_plans")
}
```

## Acceptance Criteria
- [ ] EmployeeDayPlan Modell mit allen Feldern definiert
- [ ] Relationen zu Employee, DayPlan, Shift korrekt
- [ ] Unique-Constraint auf `[employee_id, date]`
- [ ] `prisma generate` erfolgreich
- [ ] Bestehende DB-Daten werden korrekt gelesen

## Tests
- Unit-Test: EmployeeDayPlan mit Relationen laden
- Unit-Test: Unique-Constraint auf employee_id + date

## Dependencies
- ZMI-TICKET-205 (Prisma Schema: Employee)
- ZMI-TICKET-217 (Day Plans + Week Plans — DayPlan Modell)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/employeedayplan.go` (45 Zeilen)
- `apps/api/internal/model/shift.go` (27 Zeilen)
