# ZMI-TICKET-249: Prisma Schema: corrections, order_bookings

Status: Completed
Priority: P2
Owner: TBD

## Goal
Prisma-Schema um Corrections (manuelle Korrekturen an Tageswerten) und Order Bookings (Auftrags-bezogene Buchungen) erweitern.

## Scope
- **In scope:**
  - Prisma-Modelle: Correction, OrderBooking
  - Relationen zu Employee, DailyValue, Order, Booking
- **Out of scope:**
  - Router für Corrections und Order Bookings (TICKET-250)

## Requirements

### Prisma Schema
```prisma
model Correction {
  id             String    @id @default(uuid())
  tenant_id      String    @db.Uuid
  employee_id    String    @db.Uuid
  date           DateTime  @db.Date
  account_id     String?   @db.Uuid
  original_value Decimal?  @db.Decimal(10,2)
  corrected_value Decimal? @db.Decimal(10,2)
  reason         String?
  type           String?   // "time", "account", "absence"
  status         String    @default("pending") // pending, applied, reverted
  applied_at     DateTime?
  applied_by     String?   @db.Uuid
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt

  employee       Employee  @relation(fields: [employee_id], references: [id])
  account        Account?  @relation(fields: [account_id], references: [id])

  @@index([employee_id, date])
  @@map("corrections")
}

model OrderBooking {
  id          String   @id @default(uuid())
  tenant_id   String   @db.Uuid
  employee_id String   @db.Uuid
  order_id    String   @db.Uuid
  booking_id  String?  @db.Uuid
  date        DateTime @db.Date
  hours       Decimal  @db.Decimal(10,2)
  description String?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?

  employee    Employee @relation(fields: [employee_id], references: [id])
  order       Order    @relation(fields: [order_id], references: [id])
  booking     Booking? @relation(fields: [booking_id], references: [id])

  @@index([employee_id, date])
  @@index([order_id, date])
  @@map("order_bookings")
}
```

## Acceptance Criteria
- [ ] Correction und OrderBooking Modelle definiert
- [ ] Relationen korrekt
- [ ] Indizes für performante Queries
- [ ] `prisma generate` erfolgreich

## Tests
- Unit-Test: Correction mit Relationen laden
- Unit-Test: OrderBooking mit Order-Relation

## Dependencies
- ZMI-TICKET-231 (Prisma Schema: bookings — Booking-Relation)
- ZMI-TICKET-205 (Prisma Schema: Employee)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/correction.go` (30 Zeilen)
- `apps/api/internal/model/order_booking.go` (40 Zeilen)
