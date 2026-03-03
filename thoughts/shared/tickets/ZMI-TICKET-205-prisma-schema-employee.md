# ZMI-TICKET-205: Prisma Schema: Employee

Status: Done
Priority: P1
Owner: TBD

## Goal
Prisma-Schema um das Employee-Modell und seine Unter-Entitäten erweitern: employees, employee_contacts, employee_cards, employee_tariff_assignments. Das Employee-Modell ist mit 40+ Feldern das komplexeste Modell und wird von fast allen Domain-Services referenziert.

## Scope
- **In scope:**
  - Prisma-Modelle: Employee (40+ Felder), EmployeeContact, EmployeeCard, EmployeeTariffAssignment
  - Relationen zu Department, Team, Location, CostCenter, EmploymentType
  - Relationen zu User (1:1 optional)
  - `prisma generate` für aktualisierte TypeScript-Typen
- **Out of scope:**
  - Employee CRUD Router (TICKET-214)
  - Employee Day Plans (TICKET-228)
  - Booking-bezogene Employee-Daten (spätere Phasen)

## Requirements

### Prisma Schema
```prisma
model Employee {
  id                    String    @id @default(uuid())
  tenant_id             String    @db.Uuid
  personnel_number      String
  first_name            String
  last_name             String
  title                 String?
  date_of_birth         DateTime? @db.Date
  gender                String?
  nationality           String?
  email                 String?
  phone                 String?
  mobile                String?
  street                String?
  zip_code              String?
  city                  String?
  country               String?
  entry_date            DateTime? @db.Date
  exit_date             DateTime? @db.Date
  department_id         String?   @db.Uuid
  cost_center_id        String?   @db.Uuid
  location_id           String?   @db.Uuid
  employment_type_id    String?   @db.Uuid
  is_active             Boolean   @default(true)
  weekly_hours          Decimal?  @db.Decimal(10,2)
  daily_hours           Decimal?  @db.Decimal(10,2)
  vacation_days         Decimal?  @db.Decimal(10,2)
  vacation_days_previous Decimal? @db.Decimal(10,2)
  notes                 String?
  photo_url             String?
  tax_id                String?
  social_security_number String?
  health_insurance      String?
  bank_name             String?
  iban                  String?
  bic                   String?
  salary_type           String?
  salary_amount         Decimal?  @db.Decimal(10,2)
  created_at            DateTime  @default(now())
  updated_at            DateTime  @updatedAt
  deleted_at            DateTime?

  department            Department?     @relation(fields: [department_id], references: [id])
  cost_center           CostCenter?     @relation(fields: [cost_center_id], references: [id])
  location              Location?       @relation(fields: [location_id], references: [id])
  employment_type       EmploymentType? @relation(fields: [employment_type_id], references: [id])
  user                  User?
  contacts              EmployeeContact[]
  cards                 EmployeeCard[]
  tariff_assignments    EmployeeTariffAssignment[]
  team_memberships      TeamMember[]

  @@unique([tenant_id, personnel_number])
  @@map("employees")
}

model EmployeeContact {
  id          String   @id @default(uuid())
  employee_id String   @db.Uuid
  type        String
  value       String
  label       String?
  is_primary  Boolean  @default(false)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  employee    Employee @relation(fields: [employee_id], references: [id])

  @@map("employee_contacts")
}

model EmployeeCard {
  id          String    @id @default(uuid())
  employee_id String    @db.Uuid
  card_number String
  card_type   String?
  is_active   Boolean   @default(true)
  valid_from  DateTime? @db.Date
  valid_until DateTime? @db.Date
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  employee    Employee  @relation(fields: [employee_id], references: [id])

  @@map("employee_cards")
}

model EmployeeTariffAssignment {
  id          String    @id @default(uuid())
  tenant_id   String    @db.Uuid
  employee_id String    @db.Uuid
  tariff_id   String    @db.Uuid
  valid_from  DateTime  @db.Date
  valid_until DateTime? @db.Date
  is_active   Boolean   @default(true)
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt

  employee    Employee  @relation(fields: [employee_id], references: [id])

  @@map("employee_tariff_assignments")
}
```

## Acceptance Criteria
- [ ] Employee-Modell mit allen 40+ Feldern definiert
- [ ] Relationen zu Department, CostCenter, Location, EmploymentType korrekt
- [ ] EmployeeContact, EmployeeCard, EmployeeTariffAssignment Modelle definiert
- [ ] Unique-Constraint auf `[tenant_id, personnel_number]`
- [ ] `prisma generate` erfolgreich
- [ ] Bestehende DB-Daten werden korrekt gelesen
- [ ] TypeScript-Typen für alle Employee-Modelle verfügbar

## Tests
- Unit-Test: Employee mit allen Relationen laden (Department, Contacts, Cards)
- Unit-Test: Employee mit TariffAssignments laden
- Unit-Test: Unique-Constraint auf personnel_number pro Tenant

## Dependencies
- ZMI-TICKET-200 (Prisma Schema: Core Foundation — User Relation)
- ZMI-TICKET-204 (Prisma Schema: Org-Tabellen — Department, CostCenter, etc.)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/employee.go` (156 Zeilen — Employee, EmployeeContact, EmployeeCard)
- `apps/api/internal/model/employeetariffassignment.go` (54 Zeilen)
