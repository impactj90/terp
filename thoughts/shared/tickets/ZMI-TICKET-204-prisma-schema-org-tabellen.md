# ZMI-TICKET-204: Prisma Schema: Org-Tabellen

Status: Done
Priority: P1
Owner: TBD

## Goal
Prisma-Schema um die Organisations-Tabellen erweitern: departments, teams, cost_centers, locations, employment_types, holidays, accounts, account_groups. Diese Tabellen werden von vielen Domain-Services referenziert und müssen vor den CRUD-Migrationen definiert sein.

## Scope
- **In scope:**
  - Prisma-Modelle für: Department, Team, TeamMember, CostCenter, Location, EmploymentType, Holiday, Account, AccountGroup
  - Relationen zwischen den Modellen (z.B. Department → parent, Team → members)
  - `prisma generate` für aktualisierte TypeScript-Typen
- **Out of scope:**
  - Employee-Modell (TICKET-205)
  - tRPC-Router für diese Entitäten (TICKET-211, 212, 213)
  - Booking-bezogene Tabellen (spätere Phasen)

## Requirements

### Prisma Schema
```prisma
model Department {
  id          String       @id @default(uuid())
  tenant_id   String       @db.Uuid
  name        String
  code        String?
  parent_id   String?      @db.Uuid
  is_active   Boolean      @default(true)
  sort_order  Int          @default(0)
  created_at  DateTime     @default(now())
  updated_at  DateTime     @updatedAt
  deleted_at  DateTime?

  parent      Department?  @relation("DeptTree", fields: [parent_id], references: [id])
  children    Department[] @relation("DeptTree")
  employees   Employee[]

  @@map("departments")
}

model Team {
  id          String       @id @default(uuid())
  tenant_id   String       @db.Uuid
  name        String
  description String?
  is_active   Boolean      @default(true)
  created_at  DateTime     @default(now())
  updated_at  DateTime     @updatedAt
  deleted_at  DateTime?

  members     TeamMember[]

  @@map("teams")
}

model TeamMember {
  id          String   @id @default(uuid())
  team_id     String   @db.Uuid
  employee_id String   @db.Uuid
  role        String?
  joined_at   DateTime @default(now())

  team        Team     @relation(fields: [team_id], references: [id])
  employee    Employee @relation(fields: [employee_id], references: [id])

  @@unique([team_id, employee_id])
  @@map("team_members")
}

model CostCenter {
  id          String   @id @default(uuid())
  tenant_id   String   @db.Uuid
  name        String
  code        String
  is_active   Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?

  @@map("cost_centers")
}

model Location {
  id          String   @id @default(uuid())
  tenant_id   String   @db.Uuid
  name        String
  code        String?
  address     String?
  is_active   Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?

  @@map("locations")
}

model EmploymentType {
  id          String   @id @default(uuid())
  tenant_id   String   @db.Uuid
  name        String
  code        String?
  is_active   Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?

  @@map("employment_types")
}

model Holiday {
  id          String   @id @default(uuid())
  tenant_id   String   @db.Uuid
  name        String
  date        DateTime @db.Date
  half_day    Boolean  @default(false)
  state       String?
  year        Int
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?

  @@map("holidays")
}

model Account {
  id              String   @id @default(uuid())
  tenant_id       String   @db.Uuid
  name            String
  code            String
  description     String?
  account_type    String
  unit            String?
  is_system       Boolean  @default(false)
  is_active       Boolean  @default(true)
  account_group_id String? @db.Uuid
  created_at      DateTime @default(now())
  updated_at      DateTime @updatedAt
  deleted_at      DateTime?

  account_group   AccountGroup? @relation(fields: [account_group_id], references: [id])

  @@map("accounts")
}

model AccountGroup {
  id          String   @id @default(uuid())
  tenant_id   String   @db.Uuid
  name        String
  code        String?
  sort_order  Int      @default(0)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?

  accounts    Account[]

  @@map("account_groups")
}
```

## Acceptance Criteria
- [ ] Alle 9 Modelle in Prisma SDL definiert
- [ ] Self-Referenz für Department (parent/children) funktioniert
- [ ] Team ↔ TeamMember ↔ Employee Relationen korrekt
- [ ] Account ↔ AccountGroup Relation korrekt
- [ ] `prisma generate` erfolgreich
- [ ] Bestehende DB-Daten werden nicht verändert
- [ ] TypeScript-Typen für alle Modelle verfügbar

## Tests
- Unit-Test: Prisma Client liest bestehende Departments (mit Tree-Struktur)
- Unit-Test: Team mit Members laden
- Unit-Test: Account mit AccountGroup Relation

## Dependencies
- ZMI-TICKET-200 (Prisma Schema: Core Foundation)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/department.go` (41 Zeilen)
- `apps/api/internal/model/team.go` (52 Zeilen)
- `apps/api/internal/model/costcenter.go` (22 Zeilen)
- `apps/api/internal/model/location.go` (28 Zeilen)
- `apps/api/internal/model/employmenttype.go` (27 Zeilen)
- `apps/api/internal/model/holiday.go` (23 Zeilen)
- `apps/api/internal/model/account.go` (63 Zeilen)
- `apps/api/internal/model/accountgroup.go` (24 Zeilen)
