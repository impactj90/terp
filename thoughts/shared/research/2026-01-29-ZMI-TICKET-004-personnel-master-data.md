# Research: ZMI-TICKET-004 - Personnel Master Data Coverage

**Date**: 2026-01-29
**Ticket**: ZMI-TICKET-004
**Scope**: Document existing employee/personnel master data implementation in the codebase

---

## 1. Employee Domain Model

### 1.1 Core Employee Struct

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employee.go`

The `Employee` struct has the following fields:

```go
type Employee struct {
    ID                  uuid.UUID       // PK, auto-generated
    TenantID            uuid.UUID       // FK to tenants, not null
    PersonnelNumber     string          // varchar(50), not null
    PIN                 string          // varchar(20), not null, hidden in JSON (json:"-")
    FirstName           string          // varchar(100), not null
    LastName            string          // varchar(100), not null
    Email               string          // varchar(255), optional
    Phone               string          // varchar(50), optional
    EntryDate           time.Time       // date, not null
    ExitDate            *time.Time      // date, optional
    DepartmentID        *uuid.UUID      // FK to departments, optional
    CostCenterID        *uuid.UUID      // FK to cost_centers, optional
    EmploymentTypeID    *uuid.UUID      // FK to employment_types, optional
    TariffID            *uuid.UUID      // FK to tariffs, optional (added in migration 000031)
    WeeklyHours         decimal.Decimal // decimal(5,2), default 40.00
    VacationDaysPerYear decimal.Decimal // decimal(5,2), default 30.00
    IsActive            bool            // default true
    CreatedAt           time.Time
    UpdatedAt           time.Time
    DeletedAt           gorm.DeletedAt  // soft delete support
}
```

**Relations defined on the struct**:
- `Tenant *Tenant` via `TenantID`
- `Department *Department` via `DepartmentID`
- `CostCenter *CostCenter` via `CostCenterID`
- `EmploymentType *EmploymentType` via `EmploymentTypeID`
- `Tariff *Tariff` via `TariffID`
- `Contacts []EmployeeContact` via `EmployeeID` FK on contacts
- `Cards []EmployeeCard` via `EmployeeID` FK on cards
- `User *User` via `EmployeeID` FK on users

**Helper methods**:
- `FullName()` - returns "FirstName LastName"
- `IsEmployed()` - returns true if no exit date or exit date is in the future

### 1.2 EmployeeContact Struct

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employee.go` (same file)

```go
type EmployeeContact struct {
    ID          uuid.UUID // PK
    EmployeeID  uuid.UUID // FK to employees, not null
    ContactType string    // varchar(50), not null (email/phone/mobile/emergency)
    Value       string    // varchar(255), not null
    Label       string    // varchar(100), optional (e.g. "Work", "Personal")
    IsPrimary   bool      // default false
    CreatedAt   time.Time
    UpdatedAt   time.Time
}
```

Table name: `employee_contacts`

### 1.3 EmployeeCard Struct

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employee.go` (same file)

```go
type EmployeeCard struct {
    ID                 uuid.UUID  // PK
    TenantID           uuid.UUID  // FK to tenants, not null
    EmployeeID         uuid.UUID  // FK to employees, not null
    CardNumber         string     // varchar(100), not null
    CardType           string     // varchar(50), default 'rfid' (rfid/barcode/pin)
    ValidFrom          time.Time  // date, not null
    ValidTo            *time.Time // date, optional
    IsActive           bool       // default true
    DeactivatedAt      *time.Time // optional
    DeactivationReason string     // varchar(255), optional
    CreatedAt          time.Time
    UpdatedAt          time.Time
}
```

Table name: `employee_cards`

**Helper method**: `IsValid()` - checks is_active, valid_from, and valid_to

### 1.4 EmployeeDayPlan Struct

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go`

```go
type EmployeeDayPlan struct {
    ID         uuid.UUID
    TenantID   uuid.UUID
    EmployeeID uuid.UUID
    PlanDate   time.Time
    DayPlanID  *uuid.UUID
    Source     EmployeeDayPlanSource // "tariff", "manual", "holiday"
    Notes      string
    CreatedAt  time.Time
    UpdatedAt  time.Time
}
```

This model links employees to day plans on specific dates, with tracking of where the assignment came from (tariff sync, manual override, or holiday).

---

## 2. User Model and Employee Link

**File**: `/home/tolga/projects/terp/apps/api/internal/model/user.go`

The `User` struct has an optional `EmployeeID *uuid.UUID` field that links a user account to an employee record. Additional relevant fields:

```go
type User struct {
    ID          uuid.UUID
    TenantID    *uuid.UUID     // optional - not all users belong to a tenant
    UserGroupID *uuid.UUID
    EmployeeID  *uuid.UUID     // FK to employees, optional
    Email       string
    Username    *string
    DisplayName string
    AvatarURL   *string
    Role        UserRole       // "user" or "admin"
    IsActive    bool
    PasswordHash *string
    SSOID        *string
    IsLocked     bool
    DataScopeType          DataScopeType  // "all", "tenant", "department", "employee"
    DataScopeTenantIDs     pq.StringArray // uuid[]
    DataScopeDepartmentIDs pq.StringArray // uuid[]
    DataScopeEmployeeIDs   pq.StringArray // uuid[]
    // ... timestamps, soft delete
    Employee  *Employee  // relation via EmployeeID
}
```

The User-Employee relationship is optional in both directions: a user may or may not have an associated employee, and an employee may or may not have a user account.

---

## 3. Database Migrations

### 3.1 Migration 000011: Create Employees Table

**File**: `/home/tolga/projects/terp/db/migrations/000011_create_employees.up.sql`

```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    personnel_number VARCHAR(50) NOT NULL,
    pin VARCHAR(20) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    entry_date DATE NOT NULL,
    exit_date DATE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL,
    employment_type_id UUID REFERENCES employment_types(id) ON DELETE SET NULL,
    weekly_hours DECIMAL(5,2) DEFAULT 40.00,
    vacation_days_per_year DECIMAL(5,2) DEFAULT 30.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(tenant_id, personnel_number),
    UNIQUE(tenant_id, pin)
);
```

**Indexes**: `idx_employees_tenant`, `idx_employees_department`, `idx_employees_active`, `idx_employees_deleted_at`, `idx_employees_name`

### 3.2 Migration 000012: Create Employee Contacts

**File**: `/home/tolga/projects/terp/db/migrations/000012_create_employee_contacts.up.sql`

Creates `employee_contacts` table with FK to `employees(id) ON DELETE CASCADE`. Indexes on `employee_id` and `(employee_id, contact_type)`.

### 3.3 Migration 000013: Create Employee Cards

**File**: `/home/tolga/projects/terp/db/migrations/000013_create_employee_cards.up.sql`

Creates `employee_cards` table with FK to both `tenants(id)` and `employees(id)`, both with `ON DELETE CASCADE`. Unique constraint on `(tenant_id, card_number)`.

### 3.4 Migration 000014: Link Users to Employees

**File**: `/home/tolga/projects/terp/db/migrations/000014_link_users_employees.up.sql`

Adds FK constraints:
- `users.employee_id` -> `employees(id) ON DELETE SET NULL`
- `departments.manager_employee_id` -> `employees(id) ON DELETE SET NULL`
- `teams.leader_employee_id` -> `employees(id) ON DELETE SET NULL`
- `team_members.employee_id` -> `employees(id) ON DELETE CASCADE`

### 3.5 Migration 000031: Add Tariff ID to Employees

**File**: `/home/tolga/projects/terp/db/migrations/000031_add_tariff_rhythm_fields.up.sql`

Adds `tariff_id UUID REFERENCES tariffs(id) ON DELETE SET NULL` to the `employees` table with index `idx_employees_tariff`.

---

## 4. OpenAPI Schema

### 4.1 Employee Schema

**File**: `/home/tolga/projects/terp/api/schemas/employees.yaml`

Defines the following schemas:
- **Employee** - Full response model with all fields plus expanded relations (department, cost_center, employment_type, tariff as TariffSummary, contacts, cards)
- **EmployeeSummary** - Lightweight model with id, personnel_number, first_name, last_name, department_id, tariff_id, is_active
- **EmployeeContact** - Contact with id, employee_id, contact_type (enum: email/phone/mobile/emergency), value, label, is_primary
- **EmployeeCard** - Card with id, tenant_id, employee_id, card_number, card_type (enum: rfid/barcode/pin), valid_from/to, is_active, deactivation fields
- **CreateEmployeeRequest** - Required: personnel_number, pin, first_name, last_name, entry_date. Optional: email, phone, department_id, cost_center_id, employment_type_id, tariff_id, weekly_hours, vacation_days_per_year
- **UpdateEmployeeRequest** - All fields optional (partial update)
- **CreateEmployeeContactRequest** - Required: contact_type, value. Optional: label, is_primary
- **CreateEmployeeCardRequest** - Required: card_number, valid_from. Optional: card_type, valid_to
- **EmployeeList** - Paginated response with data array, total, page, limit
- **BulkTariffAssignmentFilter** - Filter by q, department_id, is_active
- **BulkTariffAssignmentRequest** - employee_ids or filter, plus tariff_id (nullable)
- **BulkTariffAssignmentResponse** - updated and skipped counts

### 4.2 Employee Paths

**File**: `/home/tolga/projects/terp/api/paths/employees.yaml`

Defines API endpoints (registered in routes.go):
- `GET /employees` - List with filters (q, limit, offset, is_active, department_id)
- `POST /employees` - Create
- `GET /employees/search?q=` - Quick search
- `PATCH /employees/bulk-tariff` - Bulk assign/clear tariff
- `GET /employees/{id}` - Get details
- `PUT /employees/{id}` - Update
- `DELETE /employees/{id}` - Deactivate (soft)
- `GET /employees/{id}/contacts` - List contacts
- `POST /employees/{id}/contacts` - Add contact
- `DELETE /employees/{id}/contacts/{contactId}` - Remove contact
- `GET /employees/{id}/cards` - List cards
- `POST /employees/{id}/cards` - Add card
- `DELETE /employees/{id}/cards/{cardId}` - Deactivate card

---

## 5. Generated Models

**Directory**: `/home/tolga/projects/terp/apps/api/gen/models/`

Generated via `make generate` (go-swagger). Key generated files:
- `employee.go` - Employee response model with validation
- `create_employee_request.go` - CreateEmployeeRequest with required field validation (personnel_number, pin, first_name, last_name, entry_date) and length constraints
- `update_employee_request.go` - UpdateEmployeeRequest (all optional)
- `bulk_tariff_assignment_request.go` - BulkTariffAssignmentRequest

The generated models include `Validate()` methods that enforce required fields, format validation (uuid, email, date), and length constraints.

---

## 6. Handler Layer

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/employee.go`

The `EmployeeHandler` struct wraps `*service.EmployeeService` and implements the following HTTP handlers:

| Method | Handler | Description |
|--------|---------|-------------|
| `GET /employees` | `List` | Parses q, limit, offset, is_active, department_id from query params |
| `GET /employees/search` | `Search` | Quick search by query string |
| `GET /employees/{id}` | `Get` | Get employee with full details |
| `POST /employees` | `Create` | Decodes CreateEmployeeRequest, maps to CreateEmployeeInput |
| `PUT /employees/{id}` | `Update` | Decodes UpdateEmployeeRequest, handles tariff_id null clearing via raw JSON |
| `PATCH /employees/bulk-tariff` | `BulkAssignTariff` | Bulk tariff assignment by IDs or filter |
| `DELETE /employees/{id}` | `Delete` | Calls Deactivate (not hard delete) |
| `GET /employees/{id}/contacts` | `ListContacts` | List employee contacts |
| `POST /employees/{id}/contacts` | `AddContact` | Add contact |
| `DELETE /employees/{id}/contacts/{contactId}` | `RemoveContact` | Remove contact |
| `GET /employees/{id}/cards` | `ListCards` | List employee cards |
| `POST /employees/{id}/cards` | `AddCard` | Add card |
| `DELETE /employees/{id}/cards/{cardId}` | `DeactivateCard` | Deactivate card with optional reason |

**Response structs** defined in handler:
- `EmployeeList{Data []model.Employee, Total int64}`
- `EmployeeContactList{Data []model.EmployeeContact}`
- `EmployeeCardList{Data []model.EmployeeCard}`

**Pattern**: The handler uses `models.CreateEmployeeRequest` and `models.UpdateEmployeeRequest` (generated models) for request decoding and validation. The Update handler uses raw JSON unmarshaling to detect explicit `null` for `tariff_id` clearing.

---

## 7. Service Layer

**File**: `/home/tolga/projects/terp/apps/api/internal/service/employee.go`

### 7.1 EmployeeService Structure

```go
type EmployeeService struct {
    employeeRepo        employeeRepository
    tariffRepo          employeeTariffRepository
    employeeDayPlanRepo employeeTariffDayPlanRepository
}
```

Constructor: `NewEmployeeService(employeeRepo, tariffRepo, employeeDayPlanRepo)`

### 7.2 Service Interfaces

The service defines repository interfaces (dependency inversion):

```go
type employeeRepository interface {
    Create, GetByID, GetByPersonnelNumber, GetByPIN, Update, Delete,
    List, GetWithDetails, Search,
    CreateContact, GetContactByID, DeleteContact, ListContacts,
    CreateCard, GetCardByID, GetCardByNumber, UpdateCard, ListCards,
    Upsert
}

type employeeTariffRepository interface {
    GetWithDetails(ctx, id) (*model.Tariff, error)
}

type employeeTariffDayPlanRepository interface {
    GetForEmployeeDateRange(ctx, employeeID, from, to)
    BulkCreate(ctx, plans)
    DeleteRangeBySource(ctx, employeeID, from, to, source)
}
```

### 7.3 Input/Output Types

- **CreateEmployeeInput**: TenantID, PersonnelNumber, PIN, FirstName, LastName, Email, Phone, EntryDate, DepartmentID, CostCenterID, EmploymentTypeID, TariffID, WeeklyHours, VacationDaysPerYear
- **UpdateEmployeeInput**: Pointer fields for partial updates plus ClearDepartmentID, ClearCostCenterID, ClearEmploymentType, ClearTariffID boolean flags
- **BulkAssignTariffInput**: TenantID, EmployeeIDs, Filter, TariffID, ClearTariff
- **CreateContactInput**: EmployeeID, ContactType, Value, Label, IsPrimary
- **CreateCardInput**: TenantID, EmployeeID, CardNumber, CardType, ValidFrom, ValidTo

### 7.4 Error Sentinels

```go
var (
    ErrEmployeeNotFound
    ErrPersonnelNumberRequired
    ErrPINRequired
    ErrFirstNameRequired
    ErrLastNameRequired
    ErrPersonnelNumberExists     // uniqueness check
    ErrPINExists                 // uniqueness check
    ErrCardNumberExists          // uniqueness check
    ErrInvalidEntryDate          // not more than 6 months in future
    ErrExitBeforeEntry           // exit date validation
    ErrContactNotFound
    ErrCardNotFound
    ErrContactTypeRequired
    ErrContactValueRequired
    ErrCardNumberRequired
    ErrEmployeeHasActiveBookings
    ErrTariffSyncUnavailable
)
```

### 7.5 Business Logic

**Create**:
1. Validates required fields (personnel_number, PIN, first_name, last_name)
2. Validates entry date not more than 6 months in future
3. Checks personnel number uniqueness within tenant
4. Checks PIN uniqueness within tenant
5. Sets defaults (weekly_hours, vacation_days_per_year from input if > 0)
6. Creates employee record
7. If tariff assigned, syncs employee day plans from tariff

**Update**:
1. Loads existing employee
2. Applies only provided fields (pointer-based partial update)
3. Validates exit_date >= entry_date
4. Handles clearing of FK fields (department, cost center, employment type, tariff)
5. On tariff change: clears old tariff day plans, syncs new tariff day plans

**BulkAssignTariff**:
1. Resolves employees either by explicit IDs or by filter
2. Iterates and calls Update for each employee
3. Returns updated/skipped counts

**Tariff Day Plan Sync** (`syncEmployeeDayPlansForTariff`):
1. Loads tariff with details
2. Computes sync window: max(today, entry_date, tariff.valid_from) to min(today+1year, exit_date, tariff.valid_to)
3. Gets existing plans, builds skip list for non-tariff sourced plans
4. Deletes existing tariff-sourced plans in range
5. Generates new plans from tariff's GetDayPlanIDForDate for each date in window
6. Bulk creates new plans

**Deactivate**: Sets is_active=false, sets exit_date to now if not already set.

**Delete**: Soft-delete via GORM DeletedAt.

---

## 8. Repository Layer

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/employee.go`

### 8.1 EmployeeFilter

```go
type EmployeeFilter struct {
    TenantID     uuid.UUID
    DepartmentID *uuid.UUID
    IsActive     *bool
    SearchQuery  string
    Offset       int
    Limit        int
}
```

### 8.2 Repository Methods

| Method | Description |
|--------|-------------|
| `Create` | `db.GORM.Create(emp)` |
| `GetByID` | Simple `First` by ID |
| `GetByPersonnelNumber` | Where tenant_id + personnel_number |
| `GetByPIN` | Where tenant_id + pin |
| `GetByCardNumber` | JOIN employee_cards, where card_number + is_active=true |
| `Update` | `db.GORM.Save(emp)` |
| `Delete` | Soft delete with RowsAffected check |
| `List` | Filtered query with tenant, department, is_active, search (LIKE on first_name, last_name, personnel_number, email). Preloads Tariff. Orders by last_name, first_name. Pagination via Limit/Offset. Returns total count. |
| `GetWithDetails` | Preloads Tariff, Department, CostCenter, EmploymentType, Contacts, Cards (active only) |
| `Search` | Active employees only, LIKE search on first_name, last_name, personnel_number. Limit parameter. |
| `CreateContact` | Simple create |
| `GetContactByID` | Simple first by ID |
| `DeleteContact` | Hard delete with RowsAffected check |
| `ListContacts` | Where employee_id, ordered by is_primary DESC, contact_type ASC |
| `CreateCard` | Simple create |
| `GetCardByID` | Simple first by ID |
| `GetCardByNumber` | Where tenant_id + card_number |
| `UpdateCard` | `db.GORM.Save(card)` |
| `ListCards` | Where employee_id, ordered by is_active DESC, valid_from DESC |
| `Upsert` | `db.GORM.Save(emp)` (used for dev seeding) |

---

## 9. Route Registration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/routes.go`

```go
func RegisterEmployeeRoutes(r chi.Router, h *EmployeeHandler, authz *middleware.AuthorizationMiddleware) {
    permView := permissions.ID("employees.view").String()
    permCreate := permissions.ID("employees.create").String()
    permEdit := permissions.ID("employees.edit").String()
    permDelete := permissions.ID("employees.delete").String()

    r.Route("/employees", func(r chi.Router) {
        // Without authz (dev mode): direct handler mapping
        // With authz: permission-gated routes
        GET  /              -> List     (employees.view)
        POST /              -> Create   (employees.create)
        GET  /search        -> Search   (employees.view)
        PATCH /bulk-tariff  -> BulkAssignTariff (employees.edit)
        GET  /{id}          -> Get      (employees.view)
        PUT  /{id}          -> Update   (employees.edit)
        DELETE /{id}        -> Delete   (employees.delete)
        GET  /{id}/contacts       -> ListContacts  (employees.view)
        POST /{id}/contacts       -> AddContact    (employees.edit)
        DELETE /{id}/contacts/{contactId} -> RemoveContact (employees.edit)
        GET  /{id}/cards          -> ListCards     (employees.view)
        POST /{id}/cards          -> AddCard       (employees.edit)
        DELETE /{id}/cards/{cardId} -> DeactivateCard (employees.edit)
    })
}
```

### 9.1 Permissions

**File**: `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go`

Employee-related permissions registered:
- `employees.view` - View employee records
- `employees.create` - Create employee records
- `employees.edit` - Edit employee records
- `employees.delete` - Delete employee records

Permission IDs are deterministic UUIDs generated via SHA1 namespace hashing.

---

## 10. Server Wiring

**File**: `/home/tolga/projects/terp/apps/api/cmd/server/main.go`

Wiring sequence:
```go
employeeRepo := repository.NewEmployeeRepository(db)
empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
// ...
employeeService := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo)
// ...
employeeHandler := handler.NewEmployeeHandler(employeeService)
// ...
handler.RegisterEmployeeRoutes(apiRouter, employeeHandler, authzMiddleware)
```

---

## 11. Multi-Tenancy Pattern

**File**: `/home/tolga/projects/terp/apps/api/internal/middleware/tenant.go`

Tenancy is enforced via:
1. `X-Tenant-ID` HTTP header (or JWT claims when implemented)
2. `TenantMiddleware.RequireTenant` extracts and validates tenant, injects into context
3. `TenantFromContext(ctx)` extracts `uuid.UUID` from context
4. Handlers call `TenantFromContext` at the start and pass tenant ID to services/repos
5. Repository queries always filter by `tenant_id`

The `Employee.TenantID` is a required field. The `employees` table has unique constraints scoped to tenant: `UNIQUE(tenant_id, personnel_number)` and `UNIQUE(tenant_id, pin)`.

---

## 12. Tenant (Mandant) Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tenant.go`

The Tenant model represents the mandant (organization):

```go
type Tenant struct {
    ID                    uuid.UUID
    Name                  string
    Slug                  string         // unique
    AddressStreet         *string
    AddressZip            *string
    AddressCity           *string
    AddressCountry        *string
    Phone                 *string
    Email                 *string
    PayrollExportBasePath *string
    Notes                 *string
    VacationBasis         VacationBasis  // "calendar_year" default
    Settings              datatypes.JSON // jsonb
    IsActive              bool
    CreatedAt             time.Time
    UpdatedAt             time.Time
}
```

The Employee belongs to a Tenant via `TenantID`, which cascades on delete.

---

## 13. Related Organization Models

### 13.1 Department

**File**: `/home/tolga/projects/terp/apps/api/internal/model/department.go`

Departments support tree structure via `ParentID *uuid.UUID` self-reference. They have a `ManagerEmployeeID *uuid.UUID` FK to employees.

### 13.2 CostCenter

**File**: `/home/tolga/projects/terp/apps/api/internal/model/costcenter.go`

Simple lookup entity with `TenantID`, `Code`, `Name`, `Description`, `IsActive`.

### 13.3 EmploymentType

**File**: `/home/tolga/projects/terp/apps/api/internal/model/employmenttype.go`

Lookup entity with `TenantID`, `Code`, `Name`, `Description`, `IsActive`.

### 13.4 Tariff

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tariff.go`

Tariff defines time plan assignment configuration. It has rhythm settings (weekly or x-days), week plan assignments (up to 4 rotating), and validity dates. The tariff determines which day plan an employee gets on each date via `GetDayPlanIDForDate(date)`.

---

## 14. How Employee Data is Referenced by Other Services

### 14.1 Daily Calculation Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/daily_calc.go`

The `DailyCalcService.CalculateDay` method takes `employeeID uuid.UUID` and `date time.Time`. It:
- Loads the employee's day plan for the date via `empDayPlanRepo.GetForEmployeeDate`
- Loads bookings for the employee on that date
- Performs calculation based on the day plan's target hours, breaks, etc.

The employee's exit date behavior is relevant here: the ticket states "exit date blocks bookings after exit date", and the `Employee.IsEmployed()` method checks this.

### 14.2 Absence Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/absence.go`

References employees by ID for creating and listing absence days. Employee absences are nested under `/employees/{id}/absences`.

### 14.3 Vacation Service

**File**: `/home/tolga/projects/terp/apps/api/internal/service/vacation.go`

Uses `VacationDaysPerYear` from the employee record as the annual vacation entitlement. The vacation balance endpoint is at `/employees/{id}/vacation-balance`.

---

## 15. Holiday Entity as Pattern Reference

**File**: `/home/tolga/projects/terp/apps/api/internal/model/holiday.go`

The Holiday entity follows the same structural pattern as Employee but is simpler:

```go
type Holiday struct {
    ID           uuid.UUID  // PK
    TenantID     uuid.UUID  // FK, not null
    HolidayDate  time.Time  // date, not null
    Name         string     // varchar(255), not null
    Category     int        // int, default 1
    AppliesToAll bool
    DepartmentID *uuid.UUID // optional
    CreatedAt    time.Time
    UpdatedAt    time.Time
}
```

**Pattern observed across Holiday handler/service/repository**:
- Handler: `NewHolidayHandler(service)` -> methods for CRUD + specialized endpoints (generate, copy)
- Service: Interface-based repository injection, sentinel errors, input structs for create/update
- Repository: `NewHolidayRepository(db)` -> GORM queries with tenant filtering
- Routes: `RegisterHolidayRoutes(r, h, authz)` with permission gating

---

## 16. Existing Tests

### 16.1 Employee Service Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/employee_test.go`

Tests exist for the employee service (content not fully enumerated here but the file exists).

### 16.2 Employee Tariff Sync Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/service/employee_tariff_test.go`

Integration tests that create tenants, day plans, week plans, and tariffs to test the employee tariff sync workflow end-to-end.

### 16.3 Employee Repository Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/repository/employee_test.go`

Repository-level tests exist.

### 16.4 Employee Handler Tests

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/employee_test.go`

Handler-level tests exist.

---

## 17. Ticket Gap Analysis (Fields Comparison)

The ticket (ZMI-TICKET-004) requires the following fields. This section compares what exists vs. what is required.

### Currently Implemented Employee Fields:
- Personnel number (personnel_number)
- PIN (pin)
- First name (first_name)
- Last name (last_name)
- Entry date (entry_date)
- Exit date (exit_date)
- Email (email)
- Phone (phone)
- Department (department_id FK)
- Cost center (cost_center_id FK)
- Employment type (employment_type_id FK)
- Tariff (tariff_id FK)
- Weekly hours (weekly_hours)
- Vacation days per year (vacation_days_per_year)
- Is active (is_active)
- Soft delete (deleted_at)

### Fields Required by Ticket but NOT Currently Implemented:
- **Identity**: exit_reason, notes
- **Address**: street, zip, city, country (standard address fields)
- **Additional fields**: birth_date, gender, nationality, religion, marital_status, birth_place, birth_country, room_number
- **Organization**: tree structure for access rights (department tree exists but employee-level access tree assignment is not explicit)
- **Groups**: employee_group, workflow_group, activity_group
- **Defaults**: default_order, default_activity (ZMI Auftrag module)
- **Tariff-related overrides**: part_time_percent, disability_flag, daily_target_hours, weekly_target_hours (different from weekly_hours), monthly_target_hours, annual_target_hours, monthly_evaluation_assignment, work_days_per_week
- **Macro assignments**: weekly/monthly macro assignments with execution day
- **Calculation start date**: calculation_start_date (system-managed)
- **Photo metadata**: photo_url or photo storage reference

### Partially Implemented:
- **Contact data**: Dynamic contacts exist (EmployeeContact model) but validation against contact type definitions (from Contact Management configuration) is not implemented
- **PIN auto-assignment**: PIN is required on create; auto-assignment if not provided is not implemented
- **Exit date blocking**: The `IsEmployed()` method exists but there is no explicit enforcement in booking creation that prevents bookings after exit date

---

## 18. File Index

| Layer | File | Purpose |
|-------|------|---------|
| Model | `/home/tolga/projects/terp/apps/api/internal/model/employee.go` | Employee, EmployeeContact, EmployeeCard structs |
| Model | `/home/tolga/projects/terp/apps/api/internal/model/employeedayplan.go` | EmployeeDayPlan struct |
| Model | `/home/tolga/projects/terp/apps/api/internal/model/user.go` | User struct with EmployeeID FK |
| Model | `/home/tolga/projects/terp/apps/api/internal/model/tenant.go` | Tenant (mandant) struct |
| Handler | `/home/tolga/projects/terp/apps/api/internal/handler/employee.go` | HTTP handlers for employee CRUD |
| Service | `/home/tolga/projects/terp/apps/api/internal/service/employee.go` | Business logic, validation, tariff sync |
| Repository | `/home/tolga/projects/terp/apps/api/internal/repository/employee.go` | GORM data access, filtering, pagination |
| Routes | `/home/tolga/projects/terp/apps/api/internal/handler/routes.go` | Route registration with permission gating |
| Permissions | `/home/tolga/projects/terp/apps/api/internal/permissions/permissions.go` | Permission definitions |
| Middleware | `/home/tolga/projects/terp/apps/api/internal/middleware/tenant.go` | Tenant context injection |
| Wiring | `/home/tolga/projects/terp/apps/api/cmd/server/main.go` | Service/handler construction and registration |
| OpenAPI | `/home/tolga/projects/terp/api/schemas/employees.yaml` | Schema definitions |
| OpenAPI | `/home/tolga/projects/terp/api/paths/employees.yaml` | Path definitions |
| Gen Models | `/home/tolga/projects/terp/apps/api/gen/models/employee.go` | Generated Employee model |
| Gen Models | `/home/tolga/projects/terp/apps/api/gen/models/create_employee_request.go` | Generated CreateEmployeeRequest |
| Migration | `/home/tolga/projects/terp/db/migrations/000011_create_employees.up.sql` | Employees table |
| Migration | `/home/tolga/projects/terp/db/migrations/000012_create_employee_contacts.up.sql` | Employee contacts table |
| Migration | `/home/tolga/projects/terp/db/migrations/000013_create_employee_cards.up.sql` | Employee cards table |
| Migration | `/home/tolga/projects/terp/db/migrations/000014_link_users_employees.up.sql` | FK constraints linking users/departments/teams to employees |
| Migration | `/home/tolga/projects/terp/db/migrations/000031_add_tariff_rhythm_fields.up.sql` | Adds tariff_id column to employees |
| Tests | `/home/tolga/projects/terp/apps/api/internal/handler/employee_test.go` | Handler tests |
| Tests | `/home/tolga/projects/terp/apps/api/internal/service/employee_test.go` | Service tests |
| Tests | `/home/tolga/projects/terp/apps/api/internal/service/employee_tariff_test.go` | Tariff sync tests |
| Tests | `/home/tolga/projects/terp/apps/api/internal/repository/employee_test.go` | Repository tests |
