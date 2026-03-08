# Research: ZMI-TICKET-249 — Prisma Schema: corrections, order_bookings

## 1. Existing Go Models Being Replaced

### `apps/api/internal/model/correction.go` (30 lines)

```go
type Correction struct {
    ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID       uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
    CorrectionDate time.Time  `gorm:"type:date;not null" json:"correction_date"`
    CorrectionType string     `gorm:"type:varchar(50);not null" json:"correction_type"`
    AccountID      *uuid.UUID `gorm:"type:uuid" json:"account_id"`
    ValueMinutes   int        `gorm:"not null" json:"value_minutes"`
    Reason         string     `gorm:"type:text;not null;default:''" json:"reason"`
    Status         string     `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    ApprovedBy     *uuid.UUID `gorm:"type:uuid" json:"approved_by"`
    ApprovedAt     *time.Time `json:"approved_at"`
    CreatedBy      *uuid.UUID `gorm:"type:uuid" json:"created_by"`
    CreatedAt      time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt      time.Time  `gorm:"default:now()" json:"updated_at"`
}
// TableName: "corrections"
```

Key observations:
- No GORM relations defined
- `AccountID` is nullable (optional relation to Account)
- `ApprovedBy` and `CreatedBy` are nullable UUIDs referencing users
- `ValueMinutes` is an integer (not decimal)
- `CorrectionType` is varchar(50)
- `Status` is varchar(20) with default 'pending'

### `apps/api/internal/model/order_booking.go` (40 lines)

```go
type OrderBooking struct {
    ID          uuid.UUID          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID          `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID  uuid.UUID          `gorm:"type:uuid;not null;index" json:"employee_id"`
    OrderID     uuid.UUID          `gorm:"type:uuid;not null;index" json:"order_id"`
    ActivityID  *uuid.UUID         `gorm:"type:uuid;index" json:"activity_id,omitempty"`
    BookingDate time.Time          `gorm:"type:date;not null" json:"booking_date"`
    TimeMinutes int                `gorm:"type:int;not null" json:"time_minutes"`
    Description string             `gorm:"type:text" json:"description,omitempty"`
    Source      OrderBookingSource `gorm:"type:varchar(20);not null;default:'manual'" json:"source"`
    CreatedAt   time.Time          `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time          `gorm:"default:now()" json:"updated_at"`
    CreatedBy   *uuid.UUID         `gorm:"type:uuid" json:"created_by,omitempty"`
    UpdatedBy   *uuid.UUID         `gorm:"type:uuid" json:"updated_by,omitempty"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
    Order    *Order    `gorm:"foreignKey:OrderID" json:"order,omitempty"`
    Activity *Activity `gorm:"foreignKey:ActivityID" json:"activity,omitempty"`
}
// TableName: "order_bookings"
// Source enum: 'manual', 'auto', 'import'
```

Key observations:
- Has GORM relations to Employee, Order, Activity
- `ActivityID` is nullable (optional relation to Activity)
- `Source` is an enum-like varchar(20): 'manual', 'auto', 'import'
- `TimeMinutes` is an integer (not decimal)
- No `deleted_at` column (despite ticket spec suggesting one)
- `CreatedBy` and `UpdatedBy` are bare UUIDs (no FK relations)

## 2. Database Migrations (Source of Truth)

### `db/migrations/000080_create_corrections.up.sql`

```sql
CREATE TABLE IF NOT EXISTS corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    correction_date DATE NOT NULL,
    correction_type VARCHAR(50) NOT NULL CHECK (correction_type IN ('time_adjustment', 'balance_adjustment', 'vacation_adjustment', 'account_adjustment')),
    account_id UUID REFERENCES accounts(id),
    value_minutes INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_corrections_tenant_id ON corrections(tenant_id);
CREATE INDEX idx_corrections_employee_id ON corrections(employee_id);
CREATE INDEX idx_corrections_date ON corrections(correction_date);
CREATE INDEX idx_corrections_status ON corrections(status);
```

Key notes:
- FK to `tenants(id)` — no ON DELETE clause (defaults to NO ACTION)
- FK to `employees(id)` — no ON DELETE clause (defaults to NO ACTION)
- FK to `accounts(id)` — nullable, no ON DELETE clause
- FK to `users(id)` for `approved_by` and `created_by` — no ON DELETE clause
- CHECK constraint on `correction_type`: 'time_adjustment', 'balance_adjustment', 'vacation_adjustment', 'account_adjustment'
- CHECK constraint on `status`: 'pending', 'approved', 'rejected'
- No update trigger defined
- 4 indexes: tenant_id, employee_id, correction_date, status

### `db/migrations/000057_create_order_bookings.up.sql`

```sql
CREATE TABLE order_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    booking_date DATE NOT NULL,
    time_minutes INT NOT NULL,
    description TEXT,
    source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'import')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

CREATE INDEX idx_order_bookings_tenant ON order_bookings(tenant_id);
CREATE INDEX idx_order_bookings_employee ON order_bookings(employee_id);
CREATE INDEX idx_order_bookings_order ON order_bookings(order_id);
CREATE INDEX idx_order_bookings_activity ON order_bookings(activity_id);
CREATE INDEX idx_order_bookings_employee_date ON order_bookings(employee_id, booking_date);
CREATE INDEX idx_order_bookings_order_date ON order_bookings(order_id, booking_date);

CREATE TRIGGER update_order_bookings_updated_at
    BEFORE UPDATE ON order_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

Key notes:
- FK to `tenants(id)` ON DELETE CASCADE
- FK to `employees(id)` ON DELETE CASCADE
- FK to `orders(id)` ON DELETE CASCADE
- FK to `activities(id)` ON DELETE SET NULL (nullable)
- CHECK constraint on `source`: 'manual', 'auto', 'import'
- `created_by` and `updated_by` are bare UUIDs — no FK references
- Has update trigger for `updated_at`
- 6 indexes including two composite indexes

## 3. Prisma Schema Location and Conventions

**File:** `/home/tolga/projects/terp/apps/web/prisma/schema.prisma` (3119 lines)

### Schema header

```prisma
// Prisma Schema for Terp — Core Foundation (ZMI-TICKET-200, ZMI-TICKET-204, ZMI-TICKET-205)
// This schema is READ-ONLY against the existing PostgreSQL database.
// DO NOT run `prisma db push` or `prisma migrate dev`.
// Schema changes are managed via SQL migrations in db/migrations/.
```

### Generator and datasource

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

### Naming conventions

- **Model names:** PascalCase (e.g., `DailyValue`, `OrderAssignment`, `BookingType`)
- **Field names:** camelCase (e.g., `tenantId`, `employeeId`, `bookingDate`)
- **`@map()`:** Maps camelCase fields to snake_case DB columns (e.g., `tenantId @map("tenant_id")`)
- **`@@map()`:** Maps model name to snake_case table name (e.g., `@@map("corrections")`)
- **ID pattern:** `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- **UUID fields:** `String @db.Uuid` (nullable: `String? @db.Uuid`)
- **Timestamps:**
  - `createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)`
  - `updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)` (when trigger exists)
  - `updatedAt DateTime @default(now()) @map("updated_at") @db.Timestamptz(6)` (when no `@updatedAt` — e.g., Booking model)
- **Date fields:** `DateTime @db.Date`
- **Integer fields:** `Int @db.Integer`
- **Text fields:** `String @db.Text` or `String? @db.Text`
- **VarChar fields:** `String @db.VarChar(N)`
- **Boolean fields:** `Boolean @default(false)`

### Section comment pattern

Each model is preceded by a section comment block:

```prisma
// -----------------------------------------------------------------------------
// ModelName
// -----------------------------------------------------------------------------
// Migration: 000NNN
//
// Description of the table.
// CHECK constraints (enforced at DB level only):
//   - constraint_name IN ('value1', 'value2')
//
// Trigger: trigger_name auto-sets updated_at on UPDATE
```

### Relation patterns

- **Required FK with Cascade:** `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)`
- **Optional FK with SetNull:** `account Account? @relation(fields: [accountId], references: [id], onDelete: SetNull)`
- **FK with NO ACTION (default):** `bookingType BookingType @relation(fields: [bookingTypeId], references: [id])` — no `onDelete` clause
- **Bare audit UUIDs:** `createdBy String? @map("created_by") @db.Uuid` — no Prisma relation, just the UUID field (see AbsenceDay model, Booking model)
- **Named relations for ambiguous references:** e.g., `@relation("EmployeeDefaultOrder")`

### Index patterns

- **Single column:** `@@index([tenantId], map: "idx_tablename_tenant")`
- **Composite:** `@@index([employeeId, bookingDate], map: "idx_tablename_employee_date")`
- **Map names match DB index names exactly**

## 4. Related Models Already in Prisma

### Employee (line 536)

Relevant reverse relations already defined:
- `bookings Booking[]` (line 625)
- `dailyValues DailyValue[]` (line 626)
- `dailyAccountValues DailyAccountValue[]` (line 627)

**Missing reverse relations needed:**
- `corrections Correction[]`
- `orderBookings OrderBooking[]`

### Account (line 395)

Relevant reverse relations already defined:
- `dailyAccountValues DailyAccountValue[]` (line 424)

**Missing reverse relation needed:**
- `corrections Correction[]`

### Order (line 850)

Relevant reverse relations already defined:
- `assignments OrderAssignment[]` (line 869)
- `defaultForEmployees Employee[] @relation("EmployeeDefaultOrder")` (line 870)

**Missing reverse relation needed:**
- `orderBookings OrderBooking[]`

### Activity (line 821)

Relevant reverse relations already defined:
- `defaultForEmployees Employee[] @relation("EmployeeDefaultActivity")` (line 833)

**Missing reverse relation needed:**
- `orderBookings OrderBooking[]`

### Booking (line 2763)

No reverse relations needed — the ticket's ticket spec mentions a `booking_id` FK but the actual DB migration does NOT have a `booking_id` column. The DB migration is the source of truth.

### DailyValue (line 2825)

No reverse relations needed — neither `corrections` nor `order_bookings` has a FK to `daily_values`.

### Tenant (line 84)

Reverse relation arrays are listed alphabetically by convention at lines 102-170. Missing:
- `corrections Correction[]`
- `orderBookings OrderBooking[]`

## 5. Ticket Spec vs Database Migration Discrepancies

The ticket spec at `thoughts/shared/tickets/ZMI-TICKET-249-prisma-schema-corrections-order-bookings.md` proposes field schemas that differ significantly from the actual DB tables. **The DB migration is the source of truth.**

### Correction discrepancies (ticket spec vs DB)

| Ticket field | DB column | Notes |
|---|---|---|
| `original_value Decimal?` | not in DB | Ticket adds a field not in migration |
| `corrected_value Decimal?` | not in DB | Ticket adds a field not in migration |
| `type String?` | `correction_type VARCHAR(50) NOT NULL` | Different name, different nullability |
| `status @default("pending")` | `status DEFAULT 'pending'` | Same default, but ticket has values "pending, applied, reverted" vs DB CHECK "pending, approved, rejected" |
| `applied_at DateTime?` | `approved_at TIMESTAMPTZ` | Different column name |
| `applied_by String?` | `approved_by UUID REFERENCES users(id)` | Different column name |
| missing | `value_minutes INTEGER NOT NULL` | Ticket omits this field |
| missing | `reason TEXT NOT NULL DEFAULT ''` | Ticket omits this field |
| missing | `created_by UUID REFERENCES users(id)` | Ticket omits this field |
| `date DateTime` | `correction_date DATE` | Different column name |

### OrderBooking discrepancies (ticket spec vs DB)

| Ticket field | DB column | Notes |
|---|---|---|
| `booking_id String?` | not in DB | Ticket adds FK not in migration |
| `hours Decimal` | `time_minutes INT` | Different column name and type |
| `deleted_at DateTime?` | not in DB | Ticket adds column not in migration |
| missing | `source VARCHAR(20)` | Ticket omits this field |
| missing | `activity_id UUID` | Ticket omits this field |
| missing | `created_by UUID` | Ticket omits this field |
| missing | `updated_by UUID` | Ticket omits this field |
| `date DateTime` | `booking_date DATE` | Different column name |

## 6. Prisma Schema Validation

- **Command:** `pnpm db:generate` (runs `prisma generate`) in `/home/tolga/projects/terp/apps/web`
- No dedicated Prisma schema test files exist
- `postinstall` also runs `prisma generate`

## 7. Where to Add New Models

Models are appended to the end of the schema file. Current last model is `ScheduleTaskExecution` at line 3100-3119. New models should be added after line 3119.

## 8. Comparable Models for Reference

### AbsenceDay (line 2933) — most similar to Correction

Both have:
- tenant/employee FKs
- A date field
- A status field with approval workflow
- `approvedBy` / `createdBy` as bare UUID fields (no Prisma relation)
- `@updatedAt` on `updatedAt` (because it has a DB trigger)

### DailyAccountValue (line 2886) — has Account relation

Shows the pattern for relating to Account:
```prisma
account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
```

### OrderAssignment (line 889) — has Order/Employee/Tenant relations

Shows the pattern for Order + Employee + Tenant relations all with `onDelete: Cascade`.

## 9. Summary of Reverse Relations to Add

When adding the two new models, the following existing models need reverse relation arrays added:

**Tenant model (line 84):**
- `corrections Correction[]`
- `orderBookings OrderBooking[]`

**Employee model (line 536):**
- `corrections Correction[]`
- `orderBookings OrderBooking[]`

**Account model (line 395):**
- `corrections Correction[]`

**Order model (line 850):**
- `orderBookings OrderBooking[]`

**Activity model (line 821):**
- `orderBookings OrderBooking[]`
