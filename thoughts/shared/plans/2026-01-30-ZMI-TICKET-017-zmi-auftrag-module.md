# ZMI-TICKET-017: ZMI Auftrag Module (Order/Project Tracking) Implementation Plan

## Overview

Implement the ZMI Auftrag (Order/Project) module for order-based time tracking. This includes the core data model for orders, activities, employee-to-order assignments, order bookings, and the integration with the existing daily calculation service for the `target_with_order` no-booking behavior.

## Current State Analysis

### What Exists

1. **Day Plan model** (`apps/api/internal/model/dayplan.go:37`): The `NoBookingTargetWithOrder` enum value `"target_with_order"` is already defined.

2. **Daily Calc Service** (`apps/api/internal/service/daily_calc.go:412-424`): A TODO stub exists for the `target_with_order` case that credits target time but does NOT create an order booking:
   ```go
   case model.NoBookingTargetWithOrder:
       // TODO: Create order booking entry when order module is available
       return &model.DailyValue{...Warnings: pq.StringArray{"NO_BOOKINGS_CREDITED", "ORDER_BOOKING_NOT_IMPLEMENTED"}}
   ```

3. **Employee model** (`apps/api/internal/model/employee.go`): Has group FKs (employee_group_id, workflow_group_id, activity_group_id) and cost_center_id but NO `default_order_id` or `default_activity_id` fields.

4. **Booking model** (`apps/api/internal/model/booking.go`): Standard time bookings (clock in/out) with NO order/activity FK fields.

5. **Dependencies are complete**: Employee master (ZMI-TICKET-004), Booking ingest (ZMI-TICKET-011), Day plan advanced rules (ZMI-TICKET-006) are all implemented.

6. **Current latest migration**: `000052_create_employee_capping_exceptions`.

### Key Discoveries

- The `handleNoBookings` function in `daily_calc.go:355` receives `ctx`, `employeeID`, `date`, and `empDayPlan` -- it has access to the employee ID needed to look up the default order.
- The `DailyCalcService` struct already has `employeeRepo` (for looking up default order from employee) and `bookingRepo`.
- Route registration follows the pattern in `apps/api/internal/handler/routes.go` with authz middleware.
- Wiring in `apps/api/cmd/server/main.go` follows: repo -> service -> handler -> route registration.
- Tests use `testutil.SetupTestDB(t)` with real DB integration tests using `testify/assert` and `testify/require`.

## Desired End State

After implementation:
1. Orders (Auftraege) can be created, updated, listed, and deleted via API.
2. Activities (Taetigkeiten) can be created and managed for use in order bookings.
3. Employees can be assigned to orders with roles (worker, leader, sales).
4. Order bookings can be created, linking time to specific orders and activities.
5. Employees can have a default order (Stammauftrag) and default activity (Stammtaetigkeit) set in their personnel master.
6. When `no_booking_behavior = target_with_order` is active and an employee has a default order, the daily calculation automatically creates an order booking for the target time.
7. Order bookings can be listed by date range for evaluation/reporting.

### Verification
- `make test` passes with all new tests
- `make lint` passes
- `make swagger-bundle && make generate` succeeds
- API endpoints respond correctly for CRUD operations on orders, activities, assignments, and order bookings
- Daily calculation integration creates order bookings for target_with_order behavior

## What We Are NOT Doing

- Full UI workflows (ticket explicitly marks this out of scope)
- Order-based reporting/analytics beyond listing order bookings by date range (the evaluation reports endpoint is a placeholder)
- Billing rate calculations (rates are stored on orders but no billing logic is implemented)
- Data exchange/export integration for orders
- Complex order status workflow (just simple status field with validation)

## Implementation Approach

Follow the established codebase pattern: migration -> model -> repository -> service -> handler -> OpenAPI -> route registration -> wiring -> tests. Each entity (Activity, Order, OrderAssignment, OrderBooking) follows the CostCenter pattern as a reference implementation. The DailyCalcService integration modifies an existing function.

---

## Phase 1: Database Migrations

### Overview
Create the database tables for the order module and extend the employees table with default order/activity FKs.

### Changes Required

#### 1. Migration: Create activities table
**File**: `db/migrations/000053_create_activities.up.sql`

```sql
-- =============================================================
-- Create activities table
-- ZMI Auftrag module: Taetigkeiten (Activities/work types for orders)
-- =============================================================
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_activities_tenant ON activities(tenant_id);
CREATE INDEX idx_activities_tenant_active ON activities(tenant_id, is_active);

CREATE TRIGGER update_activities_updated_at
    BEFORE UPDATE ON activities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE activities IS 'Activity/work types (Taetigkeiten) for order-based time tracking.';
```

**File**: `db/migrations/000053_create_activities.down.sql`
```sql
DROP TABLE IF EXISTS activities;
```

#### 2. Migration: Create orders table
**File**: `db/migrations/000054_create_orders.up.sql`

```sql
-- =============================================================
-- Create orders table
-- ZMI Auftrag module: Orders/projects for time tracking
-- =============================================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    customer VARCHAR(255),
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    billing_rate_per_hour DECIMAL(10,2),
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_tenant_active ON orders(tenant_id, is_active);
CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_cost_center ON orders(cost_center_id);

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE orders IS 'Orders/projects (Auftraege) for order-based time tracking.';
COMMENT ON COLUMN orders.status IS 'Order status: planned, active, completed, cancelled.';
COMMENT ON COLUMN orders.billing_rate_per_hour IS 'Billing rate per hour for this order (for reporting).';
```

**File**: `db/migrations/000054_create_orders.down.sql`
```sql
DROP TABLE IF EXISTS orders;
```

#### 3. Migration: Create order_assignments table
**File**: `db/migrations/000055_create_order_assignments.up.sql`

```sql
-- =============================================================
-- Create order_assignments table
-- ZMI Auftrag module: Employee-to-order assignments with roles
-- =============================================================
CREATE TABLE order_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'worker' CHECK (role IN ('worker', 'leader', 'sales')),
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(order_id, employee_id, role)
);

CREATE INDEX idx_order_assignments_tenant ON order_assignments(tenant_id);
CREATE INDEX idx_order_assignments_order ON order_assignments(order_id);
CREATE INDEX idx_order_assignments_employee ON order_assignments(employee_id);
CREATE INDEX idx_order_assignments_employee_active ON order_assignments(employee_id, is_active);

CREATE TRIGGER update_order_assignments_updated_at
    BEFORE UPDATE ON order_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE order_assignments IS 'Employee-to-order assignments with roles (worker, leader, sales).';
COMMENT ON COLUMN order_assignments.role IS 'Assignment role: worker (default), leader, or sales.';
```

**File**: `db/migrations/000055_create_order_assignments.down.sql`
```sql
DROP TABLE IF EXISTS order_assignments;
```

#### 4. Migration: Create order_bookings table
**File**: `db/migrations/000056_create_order_bookings.up.sql`

```sql
-- =============================================================
-- Create order_bookings table
-- ZMI Auftrag module: Time bookings against orders
-- =============================================================
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

COMMENT ON TABLE order_bookings IS 'Time bookings against orders (Auftragszeit) for order-based time tracking.';
COMMENT ON COLUMN order_bookings.time_minutes IS 'Duration of work in minutes booked to this order.';
COMMENT ON COLUMN order_bookings.source IS 'Source of the booking: manual, auto (daily calc), import.';
```

**File**: `db/migrations/000056_create_order_bookings.down.sql`
```sql
DROP TABLE IF EXISTS order_bookings;
```

#### 5. Migration: Add default order/activity FKs to employees
**File**: `db/migrations/000057_add_employee_default_order.up.sql`

```sql
-- =============================================================
-- Add default order and default activity to employees
-- ZMI personnel master: Stammauftrag and Stammtaetigkeit
-- Used by target_with_order no-booking behavior
-- =============================================================
ALTER TABLE employees
    ADD COLUMN default_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    ADD COLUMN default_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_default_order ON employees(default_order_id);
CREATE INDEX idx_employees_default_activity ON employees(default_activity_id);

COMMENT ON COLUMN employees.default_order_id IS 'Stammauftrag: Default order for automatic order booking when no bookings exist.';
COMMENT ON COLUMN employees.default_activity_id IS 'Stammtaetigkeit: Default activity for automatic order booking.';
```

**File**: `db/migrations/000057_add_employee_default_order.down.sql`
```sql
ALTER TABLE employees DROP COLUMN IF EXISTS default_activity_id;
ALTER TABLE employees DROP COLUMN IF EXISTS default_order_id;
```

### Success Criteria

#### Automated Verification
- [ ] All migrations apply cleanly: `make migrate-up`
- [ ] Migrations roll back cleanly: `make migrate-down` (5 times for the 5 new migrations)
- [ ] Re-apply succeeds: `make migrate-up`

---

## Phase 2: Domain Models

### Overview
Create Go GORM model structs for Activity, Order, OrderAssignment, OrderBooking and extend the Employee model with the new FK fields.

### Changes Required

#### 1. Activity model
**File**: `apps/api/internal/model/activity.go` (NEW)

Follow the CostCenter model pattern exactly:
```go
package model

import (
    "time"
    "github.com/google/uuid"
)

type Activity struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(50);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    IsActive    bool      `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (Activity) TableName() string {
    return "activities"
}
```

#### 2. Order model
**File**: `apps/api/internal/model/order.go` (NEW)

```go
package model

import (
    "time"
    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

type OrderStatus string

const (
    OrderStatusPlanned   OrderStatus = "planned"
    OrderStatusActive    OrderStatus = "active"
    OrderStatusCompleted OrderStatus = "completed"
    OrderStatusCancelled OrderStatus = "cancelled"
)

type Order struct {
    ID                 uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID           uuid.UUID        `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code               string           `gorm:"type:varchar(50);not null" json:"code"`
    Name               string           `gorm:"type:varchar(255);not null" json:"name"`
    Description        string           `gorm:"type:text" json:"description,omitempty"`
    Status             OrderStatus      `gorm:"type:varchar(20);not null;default:'active'" json:"status"`
    Customer           string           `gorm:"type:varchar(255)" json:"customer,omitempty"`
    CostCenterID       *uuid.UUID       `gorm:"type:uuid" json:"cost_center_id,omitempty"`
    BillingRatePerHour *decimal.Decimal `gorm:"type:decimal(10,2)" json:"billing_rate_per_hour,omitempty"`
    ValidFrom          *time.Time       `gorm:"type:date" json:"valid_from,omitempty"`
    ValidTo            *time.Time       `gorm:"type:date" json:"valid_to,omitempty"`
    IsActive           bool             `gorm:"default:true" json:"is_active"`
    CreatedAt          time.Time        `gorm:"default:now()" json:"created_at"`
    UpdatedAt          time.Time        `gorm:"default:now()" json:"updated_at"`

    // Relations
    CostCenter  *CostCenter       `gorm:"foreignKey:CostCenterID" json:"cost_center,omitempty"`
    Assignments []OrderAssignment  `gorm:"foreignKey:OrderID" json:"assignments,omitempty"`
}

func (Order) TableName() string {
    return "orders"
}
```

#### 3. OrderAssignment model
**File**: `apps/api/internal/model/order_assignment.go` (NEW)

```go
package model

import (
    "time"
    "github.com/google/uuid"
)

type OrderAssignmentRole string

const (
    OrderAssignmentRoleWorker OrderAssignmentRole = "worker"
    OrderAssignmentRoleLeader OrderAssignmentRole = "leader"
    OrderAssignmentRoleSales  OrderAssignmentRole = "sales"
)

type OrderAssignment struct {
    ID         uuid.UUID           `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID           `gorm:"type:uuid;not null;index" json:"tenant_id"`
    OrderID    uuid.UUID           `gorm:"type:uuid;not null;index" json:"order_id"`
    EmployeeID uuid.UUID           `gorm:"type:uuid;not null;index" json:"employee_id"`
    Role       OrderAssignmentRole `gorm:"type:varchar(20);not null;default:'worker'" json:"role"`
    ValidFrom  *time.Time          `gorm:"type:date" json:"valid_from,omitempty"`
    ValidTo    *time.Time          `gorm:"type:date" json:"valid_to,omitempty"`
    IsActive   bool                `gorm:"default:true" json:"is_active"`
    CreatedAt  time.Time           `gorm:"default:now()" json:"created_at"`
    UpdatedAt  time.Time           `gorm:"default:now()" json:"updated_at"`

    // Relations
    Order    *Order    `gorm:"foreignKey:OrderID" json:"order,omitempty"`
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (OrderAssignment) TableName() string {
    return "order_assignments"
}
```

#### 4. OrderBooking model
**File**: `apps/api/internal/model/order_booking.go` (NEW)

```go
package model

import (
    "time"
    "github.com/google/uuid"
)

type OrderBookingSource string

const (
    OrderBookingSourceManual OrderBookingSource = "manual"
    OrderBookingSourceAuto   OrderBookingSource = "auto"
    OrderBookingSourceImport OrderBookingSource = "import"
)

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
    Employee *Employee  `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
    Order    *Order     `gorm:"foreignKey:OrderID" json:"order,omitempty"`
    Activity *Activity  `gorm:"foreignKey:ActivityID" json:"activity,omitempty"`
}

func (OrderBooking) TableName() string {
    return "order_bookings"
}
```

#### 5. Extend Employee model
**File**: `apps/api/internal/model/employee.go` (MODIFY)

Add two new FK fields after the `ActivityGroupID` field (around line 50):
```go
    // Order-related FKs (ZMI Auftrag: Stammauftrag, Stammtaetigkeit)
    DefaultOrderID    *uuid.UUID `gorm:"type:uuid;index" json:"default_order_id,omitempty"`
    DefaultActivityID *uuid.UUID `gorm:"type:uuid;index" json:"default_activity_id,omitempty"`
```

Add two new relation fields in the Relations section (after ActivityGroup relation, around line 76):
```go
    DefaultOrder    *Order       `gorm:"foreignKey:DefaultOrderID" json:"default_order,omitempty"`
    DefaultActivity *Activity    `gorm:"foreignKey:DefaultActivityID" json:"default_activity,omitempty"`
```

### Success Criteria

#### Automated Verification
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `make lint`

---

## Phase 3: OpenAPI Spec

### Overview
Define OpenAPI schemas and path files for the order module entities, then bundle and generate Go models.

### Changes Required

#### 1. Activities schema
**File**: `api/schemas/activities.yaml` (NEW)

Define schemas: `Activity`, `CreateActivityRequest`, `UpdateActivityRequest`, `ActivityList` -- following the `cost-centers.yaml` pattern exactly.

Fields for Activity: id, tenant_id, code, name, description (x-nullable), is_active, created_at, updated_at.
CreateActivityRequest required fields: name, code.
UpdateActivityRequest: name, code, description, is_active (all optional).

#### 2. Activities paths
**File**: `api/paths/activities.yaml` (NEW)

Define paths: `/activities` (GET list, POST create), `/activities/{id}` (GET, PATCH, DELETE) -- following the `cost-centers.yaml` path pattern exactly with tag "Activities".

#### 3. Orders schema
**File**: `api/schemas/orders.yaml` (NEW)

Define schemas:
- `Order`: id, tenant_id, code, name, description (x-nullable), status (enum: planned/active/completed/cancelled), customer (x-nullable), cost_center_id (x-nullable, format: uuid), billing_rate_per_hour (x-nullable, type: number), valid_from (x-nullable, format: date), valid_to (x-nullable, format: date), is_active, created_at, updated_at.
- `CreateOrderRequest`: required [name, code]. Optional: description, status, customer, cost_center_id, billing_rate_per_hour, valid_from, valid_to.
- `UpdateOrderRequest`: all fields optional (name, code, description, status, customer, cost_center_id, billing_rate_per_hour, valid_from, valid_to, is_active).
- `OrderList`: data array of Order.

#### 4. Orders paths
**File**: `api/paths/orders.yaml` (NEW)

Paths: `/orders` (GET, POST), `/orders/{id}` (GET, PATCH, DELETE). Tag: "Orders".

#### 5. Order assignments schema
**File**: `api/schemas/order-assignments.yaml` (NEW)

Define schemas:
- `OrderAssignment`: id, tenant_id, order_id (format: uuid), employee_id (format: uuid), role (enum: worker/leader/sales), valid_from (x-nullable), valid_to (x-nullable), is_active, created_at, updated_at.
- `CreateOrderAssignmentRequest`: required [order_id, employee_id]. Optional: role, valid_from, valid_to.
- `UpdateOrderAssignmentRequest`: optional role, valid_from, valid_to, is_active.
- `OrderAssignmentList`: data array of OrderAssignment.

#### 6. Order assignments paths
**File**: `api/paths/order-assignments.yaml` (NEW)

Paths: `/order-assignments` (GET, POST), `/order-assignments/{id}` (GET, PATCH, DELETE).
Also: `/orders/{id}/assignments` (GET -- list assignments for an order).
Tag: "Order Assignments".

#### 7. Order bookings schema
**File**: `api/schemas/order-bookings.yaml` (NEW)

Define schemas:
- `OrderBooking`: id, tenant_id, employee_id (format: uuid), order_id (format: uuid), activity_id (x-nullable, format: uuid), booking_date (format: date), time_minutes (type: integer), description (x-nullable), source (enum: manual/auto/import), created_at, updated_at, created_by (x-nullable), updated_by (x-nullable).
- `CreateOrderBookingRequest`: required [employee_id, order_id, booking_date, time_minutes]. Optional: activity_id, description.
- `UpdateOrderBookingRequest`: optional order_id, activity_id, booking_date, time_minutes, description.
- `OrderBookingList`: data array of OrderBooking.

#### 8. Order bookings paths
**File**: `api/paths/order-bookings.yaml` (NEW)

Paths: `/order-bookings` (GET with query params: employee_id, order_id, date_from, date_to; POST), `/order-bookings/{id}` (GET, PATCH, DELETE).
Tag: "Order Bookings".

#### 9. Register in openapi.yaml
**File**: `api/openapi.yaml` (MODIFY)

Add new tag entries:
```yaml
  - name: Activities
    description: Activity/work type management for orders
  - name: Orders
    description: Order/project management for time tracking
  - name: Order Assignments
    description: Employee-to-order assignments
  - name: Order Bookings
    description: Order-based time bookings
```

Add path references (after Employee Capping Exceptions section):
```yaml
  # Activities
  /activities:
    $ref: 'paths/activities.yaml#/~1activities'
  /activities/{id}:
    $ref: 'paths/activities.yaml#/~1activities~1{id}'

  # Orders
  /orders:
    $ref: 'paths/orders.yaml#/~1orders'
  /orders/{id}:
    $ref: 'paths/orders.yaml#/~1orders~1{id}'

  # Order Assignments
  /order-assignments:
    $ref: 'paths/order-assignments.yaml#/~1order-assignments'
  /order-assignments/{id}:
    $ref: 'paths/order-assignments.yaml#/~1order-assignments~1{id}'
  /orders/{id}/assignments:
    $ref: 'paths/order-assignments.yaml#/~1orders~1{id}~1assignments'

  # Order Bookings
  /order-bookings:
    $ref: 'paths/order-bookings.yaml#/~1order-bookings'
  /order-bookings/{id}:
    $ref: 'paths/order-bookings.yaml#/~1order-bookings~1{id}'
```

Add definition references:
```yaml
  # Activities
  Activity:
    $ref: 'schemas/activities.yaml#/Activity'
  CreateActivityRequest:
    $ref: 'schemas/activities.yaml#/CreateActivityRequest'
  UpdateActivityRequest:
    $ref: 'schemas/activities.yaml#/UpdateActivityRequest'
  ActivityList:
    $ref: 'schemas/activities.yaml#/ActivityList'

  # Orders
  Order:
    $ref: 'schemas/orders.yaml#/Order'
  CreateOrderRequest:
    $ref: 'schemas/orders.yaml#/CreateOrderRequest'
  UpdateOrderRequest:
    $ref: 'schemas/orders.yaml#/UpdateOrderRequest'
  OrderList:
    $ref: 'schemas/orders.yaml#/OrderList'

  # Order Assignments
  OrderAssignment:
    $ref: 'schemas/order-assignments.yaml#/OrderAssignment'
  CreateOrderAssignmentRequest:
    $ref: 'schemas/order-assignments.yaml#/CreateOrderAssignmentRequest'
  UpdateOrderAssignmentRequest:
    $ref: 'schemas/order-assignments.yaml#/UpdateOrderAssignmentRequest'
  OrderAssignmentList:
    $ref: 'schemas/order-assignments.yaml#/OrderAssignmentList'

  # Order Bookings
  OrderBooking:
    $ref: 'schemas/order-bookings.yaml#/OrderBooking'
  CreateOrderBookingRequest:
    $ref: 'schemas/order-bookings.yaml#/CreateOrderBookingRequest'
  UpdateOrderBookingRequest:
    $ref: 'schemas/order-bookings.yaml#/UpdateOrderBookingRequest'
  OrderBookingList:
    $ref: 'schemas/order-bookings.yaml#/OrderBookingList'
```

#### 10. Update Employee schema
**File**: `api/schemas/employees.yaml` (MODIFY)

Add `default_order_id` and `default_activity_id` fields to the Employee schema, CreateEmployeeRequest, and UpdateEmployeeRequest.

#### 11. Bundle and generate
Run:
```bash
make swagger-bundle
make generate
```

### Success Criteria

#### Automated Verification
- [ ] Bundle succeeds: `make swagger-bundle`
- [ ] Generate succeeds: `make generate`
- [ ] Generated models exist in `apps/api/gen/models/` for all new schemas
- [ ] Code compiles: `cd apps/api && go build ./...`

---

## Phase 4: Repositories

### Overview
Create repository files for Activity, Order, OrderAssignment, and OrderBooking following the CostCenter repository pattern.

### Changes Required

#### 1. Activity repository
**File**: `apps/api/internal/repository/activity.go` (NEW)

Follow CostCenterRepository pattern exactly:
- `ActivityRepository` struct with `db *DB`
- `NewActivityRepository(db *DB) *ActivityRepository`
- Methods: `Create`, `GetByID`, `GetByCode`, `Update`, `Delete`, `List`, `ListActive`
- Error sentinel: `ErrActivityNotFound`

#### 2. Order repository
**File**: `apps/api/internal/repository/order.go` (NEW)

Follow CostCenterRepository pattern with additions:
- `OrderRepository` struct with `db *DB`
- `NewOrderRepository(db *DB) *OrderRepository`
- Methods: `Create`, `GetByID`, `GetByCode`, `Update`, `Delete`, `List`, `ListActive`, `ListByStatus`
- Error sentinel: `ErrOrderNotFound`
- `List` should Preload("CostCenter") for the relation.

#### 3. OrderAssignment repository
**File**: `apps/api/internal/repository/order_assignment.go` (NEW)

- `OrderAssignmentRepository` struct with `db *DB`
- `NewOrderAssignmentRepository(db *DB) *OrderAssignmentRepository`
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `ListByOrder`, `ListByEmployee`, `List` (all for tenant)
- `ListByOrder` and `ListByEmployee` should Preload("Employee") and Preload("Order") respectively.
- Error sentinel: `ErrOrderAssignmentNotFound`

#### 4. OrderBooking repository
**File**: `apps/api/internal/repository/order_booking.go` (NEW)

- `OrderBookingRepository` struct with `db *DB`
- `NewOrderBookingRepository(db *DB) *OrderBookingRepository`
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `List` (with filters), `GetByEmployeeDateRange`, `GetByOrderDateRange`, `DeleteByEmployeeAndDate`
- `List` accepts a filter struct: `OrderBookingListOptions` with optional EmployeeID, OrderID, DateFrom, DateTo
- Error sentinel: `ErrOrderBookingNotFound`

### Success Criteria

#### Automated Verification
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `make lint`

---

## Phase 5: Services

### Overview
Create service files for Activity, Order, OrderAssignment, and OrderBooking following the CostCenter service pattern.

### Changes Required

#### 1. Activity service
**File**: `apps/api/internal/service/activity.go` (NEW)

Follow CostCenterService pattern exactly:
- Define `activityRepository` interface (dependency inversion)
- `ActivityService` struct
- `NewActivityService(repo activityRepository) *ActivityService`
- `CreateActivityInput` and `UpdateActivityInput` structs
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `List`, `ListActive`
- Sentinel errors: `ErrActivityNotFound`, `ErrActivityCodeRequired`, `ErrActivityNameRequired`, `ErrActivityCodeExists`
- Create validates code/name, checks for duplicate code
- Update supports partial updates with pointer fields

#### 2. Order service
**File**: `apps/api/internal/service/order.go` (NEW)

Follow CostCenterService pattern with additions:
- Define `orderRepository` interface
- `OrderService` struct
- `NewOrderService(repo orderRepository) *OrderService`
- `CreateOrderInput`: TenantID, Code, Name, Description, Status, Customer, CostCenterID, BillingRatePerHour, ValidFrom, ValidTo
- `UpdateOrderInput`: pointer fields for all updateable fields
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `List`, `ListActive`
- Sentinel errors: `ErrOrderNotFound`, `ErrOrderCodeRequired`, `ErrOrderNameRequired`, `ErrOrderCodeExists`, `ErrOrderInvalidStatus`
- Create validates code/name, checks for duplicate code, validates status enum

#### 3. OrderAssignment service
**File**: `apps/api/internal/service/order_assignment.go` (NEW)

- Define `orderAssignmentRepository` interface and `orderLookup` interface (for validating order exists)
- `OrderAssignmentService` struct
- `NewOrderAssignmentService(repo, orderRepo, employeeRepo)`
- `CreateOrderAssignmentInput`: TenantID, OrderID, EmployeeID, Role, ValidFrom, ValidTo
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `ListByOrder`, `ListByEmployee`, `List`
- Sentinel errors: `ErrOrderAssignmentNotFound`, `ErrOrderAssignmentExists`
- Create validates that the order and employee exist

#### 4. OrderBooking service
**File**: `apps/api/internal/service/order_booking.go` (NEW)

- Define `orderBookingRepository` interface
- `OrderBookingService` struct
- `NewOrderBookingService(repo, orderRepo, employeeRepo)`
- `CreateOrderBookingInput`: TenantID, EmployeeID, OrderID, ActivityID, BookingDate, TimeMinutes, Description, Source, CreatedBy
- `UpdateOrderBookingInput`: pointer fields
- `OrderBookingListOptions`: same as repository filter struct
- Methods: `Create`, `GetByID`, `Update`, `Delete`, `List`
- Sentinel errors: `ErrOrderBookingNotFound`, `ErrOrderBookingOrderRequired`, `ErrOrderBookingEmployeeRequired`, `ErrOrderBookingTimeRequired`
- Create validates order exists, employee exists, time_minutes > 0
- Also add `CreateAutoBooking` method (used by DailyCalcService) that sets source = "auto"

### Success Criteria

#### Automated Verification
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `make lint`

---

## Phase 6: Handlers

### Overview
Create handler files for Activity, Order, OrderAssignment, and OrderBooking following the CostCenter handler pattern, and update the Employee handler/service for the new FK fields.

### Changes Required

#### 1. Activity handler
**File**: `apps/api/internal/handler/activity.go` (NEW)

Follow CostCenterHandler pattern exactly:
- `ActivityHandler` struct with `activityService *service.ActivityService`
- `NewActivityHandler(svc *service.ActivityService) *ActivityHandler`
- Methods: `List`, `Get`, `Create`, `Update`, `Delete`
- Uses generated models from `gen/models` for request/response
- Uses `middleware.TenantFromContext`, `chi.URLParam`, `respondJSON`, `respondError`

#### 2. Order handler
**File**: `apps/api/internal/handler/order.go` (NEW)

Same pattern as CostCenterHandler, extended:
- `OrderHandler` struct
- `NewOrderHandler(svc *service.OrderService) *OrderHandler`
- Methods: `List`, `Get`, `Create`, `Update`, `Delete`

#### 3. OrderAssignment handler
**File**: `apps/api/internal/handler/order_assignment.go` (NEW)

- `OrderAssignmentHandler` struct
- `NewOrderAssignmentHandler(svc *service.OrderAssignmentService) *OrderAssignmentHandler`
- Methods: `List`, `Get`, `Create`, `Update`, `Delete`, `ListByOrder`
- `ListByOrder` gets order ID from `chi.URLParam(r, "id")`

#### 4. OrderBooking handler
**File**: `apps/api/internal/handler/order_booking.go` (NEW)

- `OrderBookingHandler` struct
- `NewOrderBookingHandler(svc *service.OrderBookingService) *OrderBookingHandler`
- Methods: `List` (with query param filters: employee_id, order_id, date_from, date_to), `Get`, `Create`, `Update`, `Delete`

#### 5. Update Employee handler and service for default order/activity
**File**: `apps/api/internal/service/employee.go` (MODIFY)

Add `default_order_id` and `default_activity_id` to the `CreateEmployeeInput` and `UpdateEmployeeInput` structs as `*uuid.UUID` pointer fields.

Update the `Create` and `Update` methods to handle these new fields.

**File**: `apps/api/internal/handler/employee.go` (MODIFY)

Update the `Create` and `Update` handler methods to read `default_order_id` and `default_activity_id` from the generated request models and pass them to the service input.

### Success Criteria

#### Automated Verification
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `make lint`

---

## Phase 7: Route Registration, Permissions, and Wiring

### Overview
Register routes, add permissions, and wire everything together in main.go.

### Changes Required

#### 1. Add permissions
**File**: `apps/api/internal/permissions/permissions.go` (MODIFY)

Add to the `allPermissions` slice:
```go
{ID: permissionID("orders.manage"), Resource: "orders", Action: "manage", Description: "Manage orders, assignments, and order bookings"},
```

#### 2. Register routes
**File**: `apps/api/internal/handler/routes.go` (MODIFY)

Add four new route registration functions following the established pattern:

```go
// RegisterActivityRoutes registers activity routes.
func RegisterActivityRoutes(r chi.Router, h *ActivityHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("orders.manage").String()
    r.Route("/activities", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
    })
}

// RegisterOrderRoutes registers order routes.
func RegisterOrderRoutes(r chi.Router, h *OrderHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("orders.manage").String()
    r.Route("/orders", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
    })
}

// RegisterOrderAssignmentRoutes registers order assignment routes.
func RegisterOrderAssignmentRoutes(r chi.Router, h *OrderAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("orders.manage").String()
    r.Route("/order-assignments", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
    })
    // Nested under orders
    if authz == nil {
        r.Get("/orders/{id}/assignments", h.ListByOrder)
    } else {
        r.With(authz.RequirePermission(permManage)).Get("/orders/{id}/assignments", h.ListByOrder)
    }
}

// RegisterOrderBookingRoutes registers order booking routes.
func RegisterOrderBookingRoutes(r chi.Router, h *OrderBookingHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("orders.manage").String()
    r.Route("/order-bookings", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.Get)
            r.Patch("/{id}", h.Update)
            r.Delete("/{id}", h.Delete)
            return
        }
        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
        r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
        r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
    })
}
```

#### 3. Wire in main.go
**File**: `apps/api/cmd/server/main.go` (MODIFY)

Add after existing repository initializations (around line 89):
```go
activityRepo := repository.NewActivityRepository(db)
orderRepo := repository.NewOrderRepository(db)
orderAssignmentRepo := repository.NewOrderAssignmentRepository(db)
orderBookingRepo := repository.NewOrderBookingRepository(db)
```

Add after existing service initializations (around line 108):
```go
activityService := service.NewActivityService(activityRepo)
orderService := service.NewOrderService(orderRepo)
orderAssignmentService := service.NewOrderAssignmentService(orderAssignmentRepo, orderRepo, employeeRepo)
orderBookingService := service.NewOrderBookingService(orderBookingRepo, orderRepo, employeeRepo)
```

Add after existing handler initializations (around line 238):
```go
activityHandler := handler.NewActivityHandler(activityService)
orderHandler := handler.NewOrderHandler(orderService)
orderAssignmentHandler := handler.NewOrderAssignmentHandler(orderAssignmentService)
orderBookingHandler := handler.NewOrderBookingHandler(orderBookingService)
```

Add route registrations inside the tenant-scoped group (around line 361):
```go
handler.RegisterActivityRoutes(r, activityHandler, authzMiddleware)
handler.RegisterOrderRoutes(r, orderHandler, authzMiddleware)
handler.RegisterOrderAssignmentRoutes(r, orderAssignmentHandler, authzMiddleware)
handler.RegisterOrderBookingRoutes(r, orderBookingHandler, authzMiddleware)
```

### Success Criteria

#### Automated Verification
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `make lint`
- [ ] Server starts without errors: `make dev` (manual check)

---

## Phase 8: DailyCalcService Integration

### Overview
Update the `handleNoBookings` method in DailyCalcService to create an order booking when the `target_with_order` behavior is active and the employee has a default order.

### Changes Required

#### 1. Add order booking repository interface to DailyCalcService
**File**: `apps/api/internal/service/daily_calc.go` (MODIFY)

Add a new interface at the top of the file (after the existing interface definitions, around line 58):
```go
// orderBookingCreator creates order bookings during daily calculation.
type orderBookingCreator interface {
    Create(ctx context.Context, ob *model.OrderBooking) error
    DeleteByEmployeeAndDate(ctx context.Context, employeeID uuid.UUID, date time.Time, source model.OrderBookingSource) error
}
```

Add the field to the `DailyCalcService` struct (around line 61):
```go
orderBookingRepo orderBookingCreator
```

Add a setter method:
```go
// SetOrderBookingRepository sets the order booking repository for target_with_order integration.
func (s *DailyCalcService) SetOrderBookingRepository(repo orderBookingCreator) {
    s.orderBookingRepo = repo
}
```

#### 2. Update the target_with_order case
**File**: `apps/api/internal/service/daily_calc.go` (MODIFY)

Replace the `NoBookingTargetWithOrder` case (lines 412-424) with:
```go
case model.NoBookingTargetWithOrder:
    // ZMI: Sollzeit mit Auftrag -- credit target to default order
    warnings := pq.StringArray{"NO_BOOKINGS_CREDITED"}

    // Look up employee's default order
    employee, empErr := s.employeeRepo.GetByID(ctx, employeeID)
    if empErr == nil && employee.DefaultOrderID != nil && s.orderBookingRepo != nil {
        // Delete any existing auto-generated order bookings for this date
        _ = s.orderBookingRepo.DeleteByEmployeeAndDate(ctx, employeeID, date, model.OrderBookingSourceAuto)

        // Create order booking with target time
        ob := &model.OrderBooking{
            TenantID:    employee.TenantID,
            EmployeeID:  employeeID,
            OrderID:     *employee.DefaultOrderID,
            ActivityID:  employee.DefaultActivityID,
            BookingDate: date,
            TimeMinutes: targetTime,
            Description: "Auto: target hours with default order",
            Source:      model.OrderBookingSourceAuto,
        }
        if createErr := s.orderBookingRepo.Create(ctx, ob); createErr != nil {
            warnings = append(warnings, "ORDER_BOOKING_CREATE_FAILED")
        } else {
            warnings = append(warnings, "ORDER_BOOKING_CREATED")
        }
    } else if employee != nil && employee.DefaultOrderID == nil {
        warnings = append(warnings, "NO_DEFAULT_ORDER")
    } else if s.orderBookingRepo == nil {
        warnings = append(warnings, "ORDER_BOOKING_NOT_CONFIGURED")
    }

    return &model.DailyValue{
        EmployeeID:   employeeID,
        ValueDate:    date,
        Status:       model.DailyValueStatusCalculated,
        TargetTime:   targetTime,
        NetTime:      targetTime,
        GrossTime:    targetTime,
        Warnings:     warnings,
        CalculatedAt: &now,
    }, nil
```

#### 3. Wire the order booking repository in main.go
**File**: `apps/api/cmd/server/main.go` (MODIFY)

After `dailyCalcService` initialization (around line 122), add:
```go
dailyCalcService.SetOrderBookingRepository(orderBookingRepo)
```

Note: The `orderBookingRepo` must be initialized BEFORE this line. Move the repository initialization block from Phase 7 to be before the dailyCalcService initialization.

### Success Criteria

#### Automated Verification
- [ ] Code compiles: `cd apps/api && go build ./...`
- [ ] No lint errors: `make lint`

---

## Phase 9: Tests

### Overview
Write unit/integration tests for the new services following the CostCenter test pattern.

### Changes Required

#### 1. Activity service tests
**File**: `apps/api/internal/service/activity_test.go` (NEW)

Follow `costcenter_test.go` pattern:
- `TestActivityService_Create_Success`
- `TestActivityService_Create_EmptyCode`
- `TestActivityService_Create_EmptyName`
- `TestActivityService_Create_DuplicateCode`
- `TestActivityService_GetByID_Success`
- `TestActivityService_GetByID_NotFound`
- `TestActivityService_Update_Success`
- `TestActivityService_Update_NotFound`
- `TestActivityService_Delete_Success`
- `TestActivityService_Delete_NotFound`
- `TestActivityService_List`
- `TestActivityService_ListActive`

#### 2. Order service tests
**File**: `apps/api/internal/service/order_test.go` (NEW)

Same pattern as activity tests plus:
- `TestOrderService_Create_WithStatus`
- `TestOrderService_Create_InvalidStatus`
- `TestOrderService_Create_WithCostCenter`
- `TestOrderService_Create_WithBillingRate`
- `TestOrderService_Update_ChangeStatus`
- `TestOrderService_ListActive`

#### 3. OrderAssignment service tests
**File**: `apps/api/internal/service/order_assignment_test.go` (NEW)

- `TestOrderAssignmentService_Create_Success`
- `TestOrderAssignmentService_Create_InvalidOrder`
- `TestOrderAssignmentService_Create_InvalidEmployee`
- `TestOrderAssignmentService_ListByOrder`
- `TestOrderAssignmentService_ListByEmployee`
- `TestOrderAssignmentService_Delete_Success`

#### 4. OrderBooking service tests
**File**: `apps/api/internal/service/order_booking_test.go` (NEW)

- `TestOrderBookingService_Create_Success`
- `TestOrderBookingService_Create_MissingOrder`
- `TestOrderBookingService_Create_MissingEmployee`
- `TestOrderBookingService_Create_ZeroTime`
- `TestOrderBookingService_List_ByEmployee`
- `TestOrderBookingService_List_ByOrder`
- `TestOrderBookingService_List_ByDateRange`
- `TestOrderBookingService_Update_Success`
- `TestOrderBookingService_Delete_Success`

#### 5. DailyCalc integration tests
**File**: `apps/api/internal/service/daily_calc_test.go` (MODIFY)

Add test cases:
- `TestDailyCalc_TargetWithOrder_CreatesOrderBooking`: Set up employee with default order, day plan with target_with_order, verify order booking is created.
- `TestDailyCalc_TargetWithOrder_NoDefaultOrder`: Set up employee without default order, verify warning "NO_DEFAULT_ORDER" is emitted.
- `TestDailyCalc_TargetWithOrder_ReplacesExistingAutoBooking`: Run calculation twice, verify only one auto booking exists.

### Success Criteria

#### Automated Verification
- [ ] All tests pass: `cd apps/api && go test -v -race ./internal/service/...`
- [ ] No lint errors: `make lint`
- [ ] Full test suite: `make test`

---

## Phase 10: Final Verification

### Overview
End-to-end verification that everything works together.

### Success Criteria

#### Automated Verification
- [ ] All migrations apply cleanly: `make migrate-up`
- [ ] OpenAPI bundle succeeds: `make swagger-bundle`
- [ ] Model generation succeeds: `make generate`
- [ ] Full build succeeds: `cd apps/api && go build ./...`
- [ ] All tests pass: `make test`
- [ ] Lint passes: `make lint`

#### Manual Verification
- [ ] Server starts cleanly: `make dev`
- [ ] Swagger UI shows new endpoints at `/swagger/`
- [ ] Create activity via API: `POST /api/v1/activities`
- [ ] Create order via API: `POST /api/v1/orders`
- [ ] Assign employee to order: `POST /api/v1/order-assignments`
- [ ] Create order booking: `POST /api/v1/order-bookings`
- [ ] List order bookings by date range: `GET /api/v1/order-bookings?date_from=...&date_to=...`
- [ ] Set employee default order and verify target_with_order creates auto booking

---

## Testing Strategy

### Unit Tests
- Validate required fields (code, name) for activities and orders
- Validate order status enum transitions
- Validate order assignment uniqueness (order_id + employee_id + role)
- Validate order booking time_minutes > 0
- Test default order lookup in daily calculation

### Integration Tests
- Daily calculation writes order-linked time when target_with_order is configured
- Auto-generated order bookings are replaced on recalculation (idempotent)
- Order bookings can be filtered by date range, employee, and order

### Key Edge Cases
- Employee with no default order and target_with_order behavior: should produce warning, no error
- Order booking repository not configured (nil): graceful fallback with warning
- Deleting an order that has bookings: CASCADE should handle this
- Deactivating an employee's default order: SET NULL should handle this

## Performance Considerations

- All new tables have appropriate indexes for common query patterns (tenant_id, employee_id, order_id, date ranges)
- Order bookings have a composite index on (employee_id, booking_date) for the daily calculation lookup
- Order bookings have a composite index on (order_id, booking_date) for order-level reports

## Migration Notes

- The 5 new migrations (000053-000057) are additive only -- no existing tables are modified except for the employees ALTER TABLE in 000057
- The employee ALTER TABLE adds nullable columns with ON DELETE SET NULL, so it is safe to apply with existing data
- No data migration is needed -- all new tables start empty

## File Summary

### New Files (18)
- `db/migrations/000053_create_activities.up.sql`
- `db/migrations/000053_create_activities.down.sql`
- `db/migrations/000054_create_orders.up.sql`
- `db/migrations/000054_create_orders.down.sql`
- `db/migrations/000055_create_order_assignments.up.sql`
- `db/migrations/000055_create_order_assignments.down.sql`
- `db/migrations/000056_create_order_bookings.up.sql`
- `db/migrations/000056_create_order_bookings.down.sql`
- `db/migrations/000057_add_employee_default_order.up.sql`
- `db/migrations/000057_add_employee_default_order.down.sql`
- `apps/api/internal/model/activity.go`
- `apps/api/internal/model/order.go`
- `apps/api/internal/model/order_assignment.go`
- `apps/api/internal/model/order_booking.go`
- `apps/api/internal/repository/activity.go`
- `apps/api/internal/repository/order.go`
- `apps/api/internal/repository/order_assignment.go`
- `apps/api/internal/repository/order_booking.go`
- `apps/api/internal/service/activity.go`
- `apps/api/internal/service/order.go`
- `apps/api/internal/service/order_assignment.go`
- `apps/api/internal/service/order_booking.go`
- `apps/api/internal/handler/activity.go`
- `apps/api/internal/handler/order.go`
- `apps/api/internal/handler/order_assignment.go`
- `apps/api/internal/handler/order_booking.go`
- `api/schemas/activities.yaml`
- `api/schemas/orders.yaml`
- `api/schemas/order-assignments.yaml`
- `api/schemas/order-bookings.yaml`
- `api/paths/activities.yaml`
- `api/paths/orders.yaml`
- `api/paths/order-assignments.yaml`
- `api/paths/order-bookings.yaml`
- `apps/api/internal/service/activity_test.go`
- `apps/api/internal/service/order_test.go`
- `apps/api/internal/service/order_assignment_test.go`
- `apps/api/internal/service/order_booking_test.go`

### Modified Files (7)
- `apps/api/internal/model/employee.go` (add DefaultOrderID, DefaultActivityID fields + relations)
- `apps/api/internal/service/daily_calc.go` (add order booking interface + update target_with_order case)
- `apps/api/internal/service/daily_calc_test.go` (add integration tests)
- `apps/api/internal/service/employee.go` (add default order/activity to input structs)
- `apps/api/internal/handler/employee.go` (handle new fields in create/update)
- `apps/api/internal/handler/routes.go` (add 4 route registration functions)
- `apps/api/internal/permissions/permissions.go` (add orders.manage permission)
- `apps/api/cmd/server/main.go` (wire repos, services, handlers, routes)
- `api/openapi.yaml` (add tags, paths, definitions)
- `api/schemas/employees.yaml` (add default_order_id, default_activity_id)

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-017-zmi-auftrag-module.md`
- Research: `thoughts/shared/research/2026-01-30-ZMI-TICKET-017-zmi-auftrag-module.md`
- ZMI Manual Section 8.3: Sollstunden mit Stammauftrag (target hours with default order)
- ZMI Manual Section 17: Booking types
- Pattern reference: CostCenter implementation (model, repository, service, handler, schema, paths)
