# ZMI-TICKET-231: Prisma Schema: bookings, daily_values, daily_account_values

Status: Proposed
Priority: P1
Owner: TBD

## Goal
Prisma-Schema um die Kern-Tabellen des Buchungssystems erweitern: bookings (Zeitbuchungen), daily_values (Tageswerte) und daily_account_values (Kontowerte pro Tag). Diese Tabellen sind das Herzstück der Zeiterfassung.

## Scope
- **In scope:**
  - Prisma-Modelle: Booking, DailyValue, DailyAccountValue
  - Relationen zu Employee, BookingType, BookingReason, Account
  - Indizes für performante Queries (employee_id + date)
  - `prisma generate` für aktualisierte TypeScript-Typen
- **Out of scope:**
  - Booking CRUD Router (TICKET-232)
  - Tagesberechnung (TICKET-234)
  - Daily Values Router (TICKET-236)

## Requirements

### Prisma Schema
```prisma
model Booking {
  id              String    @id @default(uuid())
  tenant_id       String    @db.Uuid
  employee_id     String    @db.Uuid
  booking_type_id String    @db.Uuid
  booking_reason_id String? @db.Uuid
  date            DateTime  @db.Date
  time            String?
  end_time        String?
  duration_minutes Int?
  is_pair_start   Boolean   @default(false)
  is_pair_end     Boolean   @default(false)
  pair_id         String?   @db.Uuid
  source          String?   // "manual", "terminal", "import"
  terminal_id     String?
  notes           String?
  is_deleted      Boolean   @default(false)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  deleted_at      DateTime?

  employee        Employee    @relation(fields: [employee_id], references: [id])
  booking_type    BookingType @relation(fields: [booking_type_id], references: [id])
  booking_reason  BookingReason? @relation(fields: [booking_reason_id], references: [id])

  @@index([employee_id, date])
  @@index([tenant_id, date])
  @@map("bookings")
}

model DailyValue {
  id                String    @id @default(uuid())
  tenant_id         String    @db.Uuid
  employee_id       String    @db.Uuid
  date              DateTime  @db.Date
  status            String    @default("calculated") // calculated, approved, locked
  is_work_day       Boolean   @default(true)
  is_holiday        Boolean   @default(false)
  holiday_name      String?
  planned_hours     Decimal?  @db.Decimal(10,2)
  actual_hours      Decimal?  @db.Decimal(10,2)
  overtime_hours    Decimal?  @db.Decimal(10,2)
  break_minutes     Int?
  first_booking     String?
  last_booking      String?
  absence_type_id   String?   @db.Uuid
  absence_hours     Decimal?  @db.Decimal(10,2)
  calculation_log   Json?
  approved_at       DateTime?
  approved_by       String?   @db.Uuid
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt

  employee          Employee  @relation(fields: [employee_id], references: [id])
  account_values    DailyAccountValue[]

  @@unique([employee_id, date])
  @@index([tenant_id, date])
  @@index([tenant_id, status])
  @@map("daily_values")
}

model DailyAccountValue {
  id             String   @id @default(uuid())
  daily_value_id String   @db.Uuid
  account_id     String   @db.Uuid
  value          Decimal  @db.Decimal(10,2)
  unit           String?
  created_at     DateTime @default(now())
  updated_at     DateTime @updatedAt

  daily_value    DailyValue @relation(fields: [daily_value_id], references: [id])
  account        Account    @relation(fields: [account_id], references: [id])

  @@unique([daily_value_id, account_id])
  @@map("daily_account_values")
}
```

## Acceptance Criteria
- [ ] Booking Modell mit allen Feldern und Relationen
- [ ] DailyValue Modell mit Status-Management und Account-Values
- [ ] DailyAccountValue Modell mit Unique-Constraint
- [ ] Performante Indizes auf [employee_id, date] und [tenant_id, date]
- [ ] `prisma generate` erfolgreich
- [ ] Bestehende DB-Daten werden korrekt gelesen

## Tests
- Unit-Test: Booking mit Relationen laden
- Unit-Test: DailyValue mit AccountValues laden
- Unit-Test: Indizes sind korrekt definiert

## Dependencies
- ZMI-TICKET-205 (Prisma Schema: Employee)
- ZMI-TICKET-228 (Prisma Schema: employee_day_plans — für Tagesplan-Referenz)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/booking.go` (101 Zeilen)
- `apps/api/internal/model/dailyvalue.go` (112 Zeilen)
- `apps/api/internal/model/daily_account_value.go` (implizit in dailyvalue)
