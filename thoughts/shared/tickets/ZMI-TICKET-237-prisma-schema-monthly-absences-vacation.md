# ZMI-TICKET-237: Prisma Schema: monthly_values, absences, vacation_balances

Status: Completed
Priority: P1
Owner: TBD

## Goal
Prisma-Schema um monatliche Werte, Abwesenheiten und Urlaubssalden erweitern. Diese Tabellen bilden die Grundlage für Monatsauswertung, Abwesenheits-Management und Urlaubsverwaltung.

## Scope
- **In scope:**
  - Prisma-Modelle: MonthlyValue, AbsenceDay, VacationBalance
  - Relationen zu Employee, AbsenceType, Account
  - Indizes für performante Queries
- **Out of scope:**
  - MonthlyCalcService (TICKET-238)
  - Absence Router (TICKET-240)
  - Vacation Balance Router (TICKET-242)

## Requirements

### Prisma Schema
```prisma
model MonthlyValue {
  id            String    @id @default(uuid())
  tenant_id     String    @db.Uuid
  employee_id   String    @db.Uuid
  year          Int
  month         Int
  status        String    @default("open") // open, closed, locked
  work_days     Int?
  planned_hours Decimal?  @db.Decimal(10,2)
  actual_hours  Decimal?  @db.Decimal(10,2)
  overtime_hours Decimal? @db.Decimal(10,2)
  absence_days  Decimal?  @db.Decimal(10,2)
  vacation_days Decimal?  @db.Decimal(10,2)
  sick_days     Decimal?  @db.Decimal(10,2)
  account_values Json?
  closed_at     DateTime?
  closed_by     String?   @db.Uuid
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  employee      Employee  @relation(fields: [employee_id], references: [id])

  @@unique([employee_id, year, month])
  @@index([tenant_id, year, month])
  @@map("monthly_values")
}

model AbsenceDay {
  id              String   @id @default(uuid())
  tenant_id       String   @db.Uuid
  employee_id     String   @db.Uuid
  absence_type_id String   @db.Uuid
  date            DateTime @db.Date
  hours           Decimal? @db.Decimal(10,2)
  is_half_day     Boolean  @default(false)
  status          String   @default("pending") // pending, approved, rejected, cancelled
  notes           String?
  approved_at     DateTime?
  approved_by     String?  @db.Uuid
  rejected_at     DateTime?
  rejected_by     String?  @db.Uuid
  rejection_reason String?
  absence_range_id String? @db.Uuid  // Groups days of same request
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  deleted_at      DateTime?

  employee        Employee    @relation(fields: [employee_id], references: [id])
  absence_type    AbsenceType @relation(fields: [absence_type_id], references: [id])

  @@unique([employee_id, date, absence_type_id])
  @@index([tenant_id, date])
  @@index([employee_id, date])
  @@map("absence_days")
}

model VacationBalance {
  id                String   @id @default(uuid())
  tenant_id         String   @db.Uuid
  employee_id       String   @db.Uuid
  year              Int
  entitlement       Decimal  @db.Decimal(10,2)
  carried_over      Decimal  @db.Decimal(10,2) @default(0)
  used              Decimal  @db.Decimal(10,2) @default(0)
  planned           Decimal  @db.Decimal(10,2) @default(0)
  remaining         Decimal  @db.Decimal(10,2) @default(0)
  expires_at        DateTime? @db.Date
  notes             String?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  employee          Employee @relation(fields: [employee_id], references: [id])

  @@unique([employee_id, year])
  @@map("vacation_balances")
}
```

## Acceptance Criteria
- [ ] MonthlyValue mit Unique-Constraint [employee_id, year, month]
- [ ] AbsenceDay mit Status-Workflow
- [ ] VacationBalance mit Jahres-Unique-Constraint
- [ ] Alle Relationen korrekt definiert
- [ ] `prisma generate` erfolgreich
- [ ] Bestehende DB-Daten werden korrekt gelesen

## Tests
- Unit-Test: MonthlyValue laden mit Account-Values
- Unit-Test: AbsenceDay Status-Transitions
- Unit-Test: VacationBalance Berechnung

## Dependencies
- ZMI-TICKET-205 (Prisma Schema: Employee)
- ZMI-TICKET-218 (Absence Types)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/monthlyvalue.go` (74 Zeilen)
- `apps/api/internal/model/absenceday.go` (110 Zeilen)
- `apps/api/internal/model/vacationbalance.go` (39 Zeilen)
