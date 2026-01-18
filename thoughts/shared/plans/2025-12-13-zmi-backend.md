# ZMI Time Clone - Backend Implementation Plan

## Overview

Implement a full multi-tenant time tracking system backend based on the ZMI Time PRD. The system includes employee management, time plans, bookings, absence management, calculation engine, and reporting.

**Current State**: Go backend with User model, JWT auth, Chi router, GORM/PostgreSQL
**Target**: Full backend with ~30+ tables, complex calculation engine, REST API

**Reference Documents**:
- `impl_plan/zmi-prd-complete/zmi-prd/01-PRD-overview-user-stories.md`
- `impl_plan/zmi-prd-complete/zmi-prd/02-PRD-database-schema.md`
- `impl_plan/zmi-prd-complete/zmi-prd/03-PRD-business-logic.md`
- `impl_plan/zmi-prd-complete/zmi-prd/04-PRD-api-design.md`

## Architecture

```
apps/api/internal/
├── calculation/          # NEW: Pure calculation logic
├── handler/              # HTTP handlers (extend existing)
├── service/              # Business logic (extend existing)
├── repository/           # Data access (extend existing)
├── model/                # Domain models (extend existing)
├── middleware/           # HTTP middleware (extend existing)
└── auth/                 # JWT auth (existing)
```

---

## Phase 1: Foundation (Migrations 002-010)

### 1.1 Multi-Tenant Infrastructure

**Migration 002**: `db/migrations/000002_create_tenants.up.sql`
- Create `tenants` table
- Create `holidays` table (tenant-scoped)

**Migration 003**: `db/migrations/000003_create_reference_tables.up.sql`
- Create `cost_centers` table
- Create `employment_types` table

**Migration 004**: `db/migrations/000004_create_accounts.up.sql`
- Create `accounts` table (for bonus/tracking accounts)

**Migration 005**: `db/migrations/000005_create_monthly_evaluations.up.sql`
- Create `monthly_evaluations` table (flextime rules)

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/tenant.go` | Tenant model |
| `internal/repository/tenant.go` | Tenant data access |
| `internal/service/tenant.go` | Tenant business logic |
| `internal/handler/tenant.go` | Tenant API endpoints |
| `internal/middleware/tenant.go` | Tenant context extraction |

### 1.2 User Management Updates

**Migration 006**: `db/migrations/000006_create_user_groups.up.sql`
- Create `user_groups` table
- Create `permissions` table

**Migration 007**: `db/migrations/000007_alter_users_multitenancy.up.sql`
- Add `tenant_id`, `user_group_id`, `employee_id` to users
- Add `username`, `password_hash`, `is_active`, `deleted_at`
- Drop old constraints, add new ones

**Files to Modify**:
- `internal/model/user.go` - Add new fields
- `internal/repository/user.go` - Add tenant scoping
- `internal/service/user.go` - Update for multi-tenancy

### 1.3 Organization Structure

**Migration 008**: `db/migrations/000008_create_departments.up.sql`
- Create `departments` table (self-referential for hierarchy)

**Migration 009**: `db/migrations/000009_create_teams.up.sql`
- Create `teams` table
- Create `team_members` junction table

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/department.go` | Department model |
| `internal/model/team.go` | Team model |
| `internal/repository/department.go` | Department data access |
| `internal/service/department.go` | Department business logic |
| `internal/handler/department.go` | Department API |

---

## Phase 2: Employee Management (Migrations 010-012)

**Migration 010**: `db/migrations/000010_create_employees.up.sql`
```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    personnel_number VARCHAR(50) NOT NULL,
    pin VARCHAR(20) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    entry_date DATE NOT NULL,
    exit_date DATE,
    department_id UUID REFERENCES departments(id),
    -- ... additional fields per PRD
    UNIQUE(tenant_id, personnel_number),
    UNIQUE(tenant_id, pin)
);
```

**Migration 011**: `db/migrations/000011_create_employee_related.up.sql`
- Create `employee_contacts` table
- Create `employee_cards` table

**Migration 012**: `db/migrations/000012_link_users_employees.up.sql`
- Add FK constraint `users.employee_id -> employees.id`

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/employee.go` | Employee model with contacts, cards |
| `internal/repository/employee.go` | Employee CRUD with search/filter |
| `internal/service/employee.go` | Employee business logic |
| `internal/handler/employee.go` | Employee API endpoints |

**API Endpoints**:
- `GET /api/v1/employees` - List (paginated, searchable)
- `POST /api/v1/employees` - Create
- `GET /api/v1/employees/{id}` - Get details
- `PUT /api/v1/employees/{id}` - Update
- `DELETE /api/v1/employees/{id}` - Deactivate

---

## Phase 3: Time Plans (Migrations 013-016)

### 3.1 Day Plans

**Migration 013**: `db/migrations/000013_create_day_plans.up.sql`
```sql
CREATE TABLE day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    plan_type VARCHAR(20) NOT NULL, -- 'fixed', 'flextime'
    come_from INT, come_to INT, go_from INT, go_to INT, -- minutes from midnight
    regular_hours_1 INT NOT NULL DEFAULT 480,
    tolerance_come_plus INT, tolerance_come_minus INT,
    tolerance_go_plus INT, tolerance_go_minus INT,
    rounding_come_type VARCHAR(20), rounding_come_interval INT,
    rounding_go_type VARCHAR(20), rounding_go_interval INT,
    -- ... additional fields per PRD
    UNIQUE(tenant_id, code)
);
```

**Migration 014**: `db/migrations/000014_create_day_plan_related.up.sql`
- Create `day_plan_breaks` table
- Create `day_plan_bonuses` table
- Create `day_plan_alternatives` table

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/dayplan.go` | DayPlan with breaks, bonuses |
| `internal/repository/dayplan.go` | Day plan CRUD |
| `internal/service/dayplan.go` | Day plan logic + copy |
| `internal/handler/dayplan.go` | Day plan API |

### 3.2 Week Plans

**Migration 015**: `db/migrations/000015_create_week_plans.up.sql`
- Create `week_plans` table with 7 FK columns to day_plans

### 3.3 Tariffs

**Migration 016**: `db/migrations/000016_create_tariffs.up.sql`
- Create `tariffs` table (employee-specific work rules)
- Create `tariff_week_plans` table (rolling schedules)
- Create `tariff_day_plans` table (X-day rhythms)

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/weekplan.go` | Week plan model |
| `internal/model/tariff.go` | Tariff model |
| `internal/repository/tariff.go` | Tariff CRUD |
| `internal/service/tariff.go` | Tariff logic + apply plans |
| `internal/handler/tariff.go` | Tariff API |

**API Endpoints**:
- `GET/POST/PUT/DELETE /api/v1/day-plans`
- `GET/POST/PUT/DELETE /api/v1/week-plans`
- `GET/POST /api/v1/employees/{id}/tariffs`
- `POST /api/v1/employees/{id}/tariffs/{tariffId}/apply`

---

## Phase 4: Bookings & Daily Calculation (Migrations 017-020)

### 4.1 Booking Types & Bookings

**Migration 017**: `db/migrations/000017_create_booking_types.up.sql`
- Create `booking_types` table
- Seed system types: A1 (come), A2 (go), PA (break start), PE (break end)

**Migration 018**: `db/migrations/000018_create_bookings.up.sql`
```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    original_time INT NOT NULL, -- minutes from midnight, immutable
    edited_time INT NOT NULL,   -- can be modified
    calculated_time INT,        -- after rules applied
    pair_id UUID,               -- links come/go pairs
    source VARCHAR(20) DEFAULT 'web'
);
CREATE INDEX idx_bookings_employee_date ON bookings(employee_id, booking_date);
```

### 4.2 Daily Values & Employee Day Plans

**Migration 019**: `db/migrations/000019_create_employee_day_plans.up.sql`
- Create `employee_day_plans` table (assigned plan per employee/date)

**Migration 020**: `db/migrations/000020_create_daily_values.up.sql`
```sql
CREATE TABLE daily_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    value_date DATE NOT NULL,
    gross_time INT DEFAULT 0,
    net_time INT DEFAULT 0,
    target_time INT DEFAULT 0,
    overtime INT DEFAULT 0,
    undertime INT DEFAULT 0,
    break_time INT DEFAULT 0,
    has_error BOOLEAN DEFAULT false,
    error_codes TEXT[],
    calculated_at TIMESTAMPTZ,
    UNIQUE(employee_id, value_date)
);
```

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/booking.go` | Booking model |
| `internal/model/dailyvalue.go` | DailyValue model |
| `internal/repository/booking.go` | Booking CRUD |
| `internal/repository/dailyvalue.go` | Daily values CRUD |
| `internal/service/booking.go` | Booking logic + recalc trigger |
| `internal/handler/booking.go` | Booking API |

### 4.3 Calculation Engine

**Create new package**: `internal/calculation/`

| File | Purpose |
|------|---------|
| `calculation/types.go` | DailyCalcInput, DailyCalcOutput |
| `calculation/calculator.go` | Main Calculator struct |
| `calculation/booking.go` | Pairing, tolerance, rounding |
| `calculation/breaks.go` | Break deduction logic |
| `calculation/daily.go` | Full daily calculation flow |
| `calculation/errors.go` | Error detection |
| `calculation/shift.go` | Shift auto-detection |

**Calculation Service**:
| File | Purpose |
|------|---------|
| `internal/service/daily_calc.go` | Orchestrates daily calculation |
| `internal/service/recalc.go` | Recalculation triggers |

**Daily Calculation Flow**:
```
1. Get inputs (day plan, bookings, absence, holiday)
2. Check absence/holiday → credit hours if applicable
3. Pair bookings (A1↔A2, PA↔PE)
4. Apply tolerance rules
5. Apply rounding rules
6. Calculate gross time
7. Deduct breaks (fixed, variable, minimum)
8. Calculate net time
9. Apply caps (max_net_work_time)
10. Calculate overtime/undertime
11. Update accounts
12. Generate errors/warnings
```

**API Endpoints**:
- `GET /api/v1/bookings` - List (filtered by employee/date)
- `POST /api/v1/bookings` - Create booking (triggers recalc)
- `PUT /api/v1/bookings/{id}` - Update (triggers recalc)
- `DELETE /api/v1/bookings/{id}` - Delete (triggers recalc)
- `GET /api/v1/employees/{id}/bookings/{date}` - Day view with values
- `POST /api/v1/employees/{id}/bookings/{date}/calculate` - Manual recalc

---

## Phase 5: Absences & Vacation (Migrations 021-023)

**Migration 021**: `db/migrations/000021_create_absence_types.up.sql`
- Create `absence_types` table (U=vacation, K=illness, S=special)

**Migration 022**: `db/migrations/000022_create_absence_days.up.sql`
```sql
CREATE TABLE absence_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    absence_date DATE NOT NULL,
    absence_type_id UUID NOT NULL,
    status VARCHAR(20) DEFAULT 'approved',
    UNIQUE(employee_id, absence_date)
);
```

**Migration 023**: `db/migrations/000023_create_vacation_balances.up.sql`
- Vacation balance tracking per employee/year

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/absence.go` | AbsenceType, AbsenceDay models |
| `internal/repository/absence.go` | Absence CRUD |
| `internal/service/absence.go` | Absence logic + vacation calc |
| `internal/handler/absence.go` | Absence API |
| `calculation/vacation.go` | Vacation entitlement calculation |

**API Endpoints**:
- `GET/POST /api/v1/absence-types`
- `GET /api/v1/employees/{id}/absences`
- `POST /api/v1/employees/{id}/absences` - Create range
- `DELETE /api/v1/absences/{id}`
- `GET /api/v1/employees/{id}/vacation-balance`

---

## Phase 6: Monthly Calculation & Closing (Migrations 024-026)

**Migration 024**: `db/migrations/000024_create_monthly_values.up.sql`
```sql
CREATE TABLE monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    flextime_start INT DEFAULT 0,
    flextime_change INT DEFAULT 0,
    flextime_end INT DEFAULT 0,
    flextime_carryover INT DEFAULT 0,
    vacation_start DECIMAL(5,2), vacation_taken DECIMAL(5,2), vacation_end DECIMAL(5,2),
    sick_days INT DEFAULT 0,
    is_closed BOOLEAN DEFAULT false,
    UNIQUE(employee_id, year, month)
);
```

**Migration 025**: `db/migrations/000025_create_correction_items.up.sql`
- Error/correction tracking table

**Migration 026**: `db/migrations/000026_create_account_values.up.sql`
- Account values per employee/date

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/monthlyvalue.go` | MonthlyValue model |
| `internal/model/correction.go` | CorrectionItem model |
| `internal/repository/monthlyvalue.go` | Monthly values CRUD |
| `internal/repository/correction.go` | Corrections CRUD |
| `internal/service/monthly_calc.go` | Monthly calculation service |
| `internal/service/correction.go` | Correction resolution |
| `internal/handler/monthclosing.go` | Month closing API |
| `internal/handler/correction.go` | Corrections API |
| `calculation/monthly.go` | Monthly aggregation logic |

**Monthly Calculation Flow**:
```
1. Get all daily values for month
2. Get previous month's carryover
3. Aggregate totals (gross, net, overtime, breaks)
4. Count absences by type
5. Calculate flextime change
6. Apply monthly evaluation rules (caps, thresholds)
7. Calculate vacation balance
8. Persist monthly_values
```

**API Endpoints**:
- `GET /api/v1/employees/{id}/daily-values?from=&to=`
- `GET /api/v1/employees/{id}/monthly-values?year=&month=`
- `POST /api/v1/employees/{id}/calculate-month`
- `POST /api/v1/employees/close-months`
- `POST /api/v1/employees/reopen-months`
- `GET /api/v1/corrections`
- `PUT /api/v1/corrections/{id}/resolve`

---

## Phase 7: Reports & Audit (Migrations 027-028)

**Migration 027**: `db/migrations/000027_create_audit_log.up.sql`
- Audit log for all entity changes

**Migration 028**: `db/migrations/000028_create_payroll_exports.up.sql`
- Payroll interface and export tracking

**Files to Create**:
| File | Purpose |
|------|---------|
| `internal/model/auditlog.go` | AuditLog model |
| `internal/repository/auditlog.go` | Audit log CRUD |
| `internal/middleware/audit.go` | Audit logging middleware |
| `internal/report/generator.go` | Report generation base |
| `internal/report/monthly.go` | Monthly time report |
| `internal/report/absence.go` | Absence statistics |
| `internal/service/payroll.go` | Payroll export service |
| `internal/handler/report.go` | Report API |
| `internal/handler/auditlog.go` | Audit log API |

**API Endpoints**:
- `GET /api/v1/reports/monthly`
- `GET /api/v1/reports/absence-statistics`
- `GET /api/v1/reports/vacation-list`
- `POST /api/v1/payroll/export`
- `GET /api/v1/audit-log`

---

## Implementation Order

```
Week 1-2:   Phase 1 (Tenants, User Groups, Departments, Teams)
Week 3-4:   Phase 2 (Employees)
Week 5-6:   Phase 3 (Day Plans, Week Plans, Tariffs)
Week 7-8:   Phase 4.1 (Bookings, Daily Values)
Week 9-10:  Phase 4.3 (Calculation Engine)
Week 11-12: Phase 5 (Absences, Vacation)
Week 13-14: Phase 6 (Monthly Calculation, Corrections)
Week 15-16: Phase 7 (Reports, Audit)
```

---

## Critical Files Summary

**Existing files to modify**:
- `apps/api/internal/model/user.go` - Add tenant_id, user_group_id, employee_id
- `apps/api/internal/handler/routes.go` - Register all new routes
- `apps/api/internal/repository/user.go` - Add tenant scoping

**New packages**:
- `apps/api/internal/calculation/` - Pure calculation logic (7 files)

**New models** (15 total):
- tenant.go, department.go, team.go, employee.go, dayplan.go, weekplan.go
- tariff.go, booking.go, dailyvalue.go, absence.go, monthlyvalue.go
- correction.go, auditlog.go, account.go, holiday.go

**New handlers** (12 total):
- tenant.go, department.go, employee.go, dayplan.go, weekplan.go, tariff.go
- booking.go, absence.go, monthclosing.go, correction.go, report.go, auditlog.go

**Migrations** (27 total):
- 000002 through 000028

---

## Success Criteria

### Automated Verification
- [ ] All migrations apply: `make migrate-up`
- [ ] Tests pass: `make test`
- [ ] Linting passes: `make lint`
- [ ] API responds: `curl localhost:8080/health`

### Functional Verification
- [ ] Can create tenant, department, employee
- [ ] Can configure day plans with breaks and rounding
- [ ] Can create bookings and see calculated values
- [ ] Daily calculation produces correct gross/net/overtime
- [ ] Monthly aggregation works with flextime carryover
- [ ] Absences deduct vacation correctly
- [ ] Corrections are generated for booking errors
- [ ] Reports generate in JSON format

---

## Notes

- All times stored as **minutes from midnight** (avoids floating point issues)
- All tables include **tenant_id** for multi-tenant isolation
- Use **soft deletes** (deleted_at) for audit compliance
- Calculation package contains **pure functions** (no DB access)
- Service layer handles **transaction boundaries**
- Recalculation triggered **automatically** when bookings/absences change
