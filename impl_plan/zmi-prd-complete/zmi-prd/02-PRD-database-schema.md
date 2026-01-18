# ZMI Time Clone - PRD Part 2: Database Schema

## Database Design Principles

- **Multi-tenant:** All tables include `tenant_id` for data isolation
- **Soft delete:** Use `deleted_at` instead of hard deletes
- **Audit fields:** All tables have `created_at`, `updated_at`, `created_by`, `updated_by`
- **UUIDs:** Use UUIDs for primary keys (better for distributed systems)

---

# Entity Relationship Diagram (Conceptual)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Tenant    │────<│ Department  │     │  UserGroup  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Employee   │────<│    User     │>────│ Permission  │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Tariff    │────<│  WeekPlan   │────<│  DayPlan    │
└─────────────┘     └─────────────┘     └─────────────┘
       │
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Booking   │     │ AbsenceDay  │     │ DailyValue  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │MonthlyValue │
                    └─────────────┘
```

---

# Table Definitions

## Core Tables

### tenants
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    -- Address
    street VARCHAR(255),
    postal_code VARCHAR(20),
    city VARCHAR(100),
    country VARCHAR(100),
    phone VARCHAR(50),
    fax VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),
    
    -- Settings
    vacation_calc_type VARCHAR(20) DEFAULT 'calendar_year', -- 'calendar_year' | 'entry_date'
    payroll_export_path VARCHAR(500),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);
```

### holidays
```sql
CREATE TABLE holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category SMALLINT NOT NULL DEFAULT 1, -- 1=full, 2=half, 3=custom
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, date)
);
CREATE INDEX idx_holidays_tenant_date ON holidays(tenant_id, date);
```

### departments
```sql
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES departments(id),
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, code)
);
```

### teams
```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, code)
);

CREATE TABLE team_members (
    team_id UUID NOT NULL REFERENCES teams(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    PRIMARY KEY (team_id, employee_id)
);
```

---

## User Management

### user_groups
```sql
CREATE TABLE user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, name)
);
```

### permissions
```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_group_id UUID NOT NULL REFERENCES user_groups(id),
    
    module VARCHAR(100) NOT NULL,      -- e.g., 'employees', 'bookings', 'reports'
    sub_module VARCHAR(100),            -- e.g., 'tariff', 'absence'
    field VARCHAR(100),                 -- specific field, if applicable
    
    can_read BOOLEAN DEFAULT false,
    can_write BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    
    UNIQUE(user_group_id, module, sub_module, field)
);
```

### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    user_group_id UUID NOT NULL REFERENCES user_groups(id),
    employee_id UUID REFERENCES employees(id),
    
    -- SSO
    external_id VARCHAR(255),           -- Windows user / OAuth subject
    external_provider VARCHAR(50),      -- 'windows', 'oauth', 'saml'
    
    -- Data access restrictions
    data_access_type VARCHAR(20) DEFAULT 'all', -- 'all', 'departments', 'employees'
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP,
    failed_login_count INT DEFAULT 0,
    locked_until TIMESTAMP,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, username)
);

CREATE TABLE user_data_access (
    user_id UUID NOT NULL REFERENCES users(id),
    access_type VARCHAR(20) NOT NULL,   -- 'department', 'employee'
    reference_id UUID NOT NULL,          -- department_id or employee_id
    
    PRIMARY KEY (user_id, access_type, reference_id)
);
```

---

## Employee Management

### employees
```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- Identifiers
    personnel_number VARCHAR(50) NOT NULL,
    pin VARCHAR(20) NOT NULL,
    
    -- Name
    salutation VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    
    -- Employment
    entry_date DATE NOT NULL,
    exit_date DATE,
    exit_reason VARCHAR(255),
    
    -- Organization
    department_id UUID REFERENCES departments(id),
    cost_center_id UUID REFERENCES cost_centers(id),
    tree_path VARCHAR(500),             -- for hierarchical display
    
    -- Personal
    birth_date DATE,
    gender VARCHAR(20),
    nationality VARCHAR(100),
    birth_place VARCHAR(100),
    birth_country VARCHAR(100),
    marital_status VARCHAR(50),
    religion VARCHAR(100),
    
    -- Contact
    photo_url VARCHAR(500),
    room_number VARCHAR(50),
    
    -- Address
    street VARCHAR(255),
    postal_code VARCHAR(20),
    city VARCHAR(100),
    country VARCHAR(100),
    
    -- Status flags
    is_active BOOLEAN DEFAULT true,
    has_disability BOOLEAN DEFAULT false,
    
    -- Control checks
    requires_license_check BOOLEAN DEFAULT false,
    license_check_role_id UUID,
    requires_covid_check BOOLEAN DEFAULT false,
    covid_check_role_id UUID,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, personnel_number),
    UNIQUE(tenant_id, pin)
);

CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_active ON employees(tenant_id, is_active);
```

### employee_contacts
```sql
CREATE TABLE employee_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    contact_type VARCHAR(50) NOT NULL,  -- 'phone', 'email', 'mobile', etc.
    label VARCHAR(100),                  -- 'Work', 'Private', etc.
    value VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### employee_cards
```sql
CREATE TABLE employee_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    card_type VARCHAR(50) NOT NULL,
    card_number VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Time Plans

### day_plans
```sql
CREATE TABLE day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    plan_type VARCHAR(20) NOT NULL,     -- 'fixed', 'flextime'
    color VARCHAR(7),                    -- hex color
    
    -- Core times (stored as minutes from midnight)
    come_from INT,                       -- e.g., 420 = 07:00
    come_to INT,                         -- flextime only
    go_from INT,
    go_to INT,                           -- flextime only
    
    -- Target hours (stored as minutes)
    regular_hours_1 INT NOT NULL DEFAULT 480,  -- 8 hours
    regular_hours_1_active BOOLEAN DEFAULT true,
    regular_hours_2 INT,
    regular_hours_2_active BOOLEAN DEFAULT false,
    use_hours_from_employee BOOLEAN DEFAULT false,
    
    -- Tolerance (minutes)
    tolerance_come_plus INT DEFAULT 0,
    tolerance_come_minus INT DEFAULT 0,
    tolerance_go_plus INT DEFAULT 0,
    tolerance_go_minus INT DEFAULT 0,
    variable_work_time BOOLEAN DEFAULT false,
    
    -- Rounding
    rounding_come_type VARCHAR(20),      -- 'up', 'down', 'math', 'add', 'subtract'
    rounding_come_interval INT,          -- minutes
    rounding_go_type VARCHAR(20),
    rounding_go_interval INT,
    round_all_bookings BOOLEAN DEFAULT false,
    
    -- Holiday credits (minutes)
    holiday_credit_cat1 INT,
    holiday_credit_cat2 INT,
    holiday_credit_cat3 INT,
    
    -- Vacation
    vacation_deduction DECIMAL(4,2) DEFAULT 1.0,
    
    -- No booking behavior
    no_booking_behavior VARCHAR(20) DEFAULT 'error',
    -- 'error', 'deduct_target', 'vocational', 'credit_target', 'credit_with_order'
    
    -- Day change
    day_change_behavior VARCHAR(20) DEFAULT 'none',
    -- 'none', 'evaluate_come', 'evaluate_go', 'auto_complete'
    
    -- Limits
    max_net_work_time INT,              -- minutes, null = no limit
    
    -- Macros
    day_macro_id UUID,
    
    -- Accounts
    day_net_account_id UUID,
    cap_account_id UUID,
    
    -- Alternative plan (for quick switch)
    alternative_plan_id UUID REFERENCES day_plans(id),
    
    -- Shift detection
    shift_detection_enabled BOOLEAN DEFAULT false,
    shift_come_from INT,
    shift_come_to INT,
    shift_go_from INT,
    shift_go_to INT,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, code)
);

CREATE TABLE day_plan_breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_plan_id UUID NOT NULL REFERENCES day_plans(id),
    
    break_type VARCHAR(20) NOT NULL,
    -- 'fixed_1', 'fixed_2', 'fixed_3', 'variable', 'minimum_1', 'minimum_2'
    
    break_from INT,                      -- minutes from midnight (for fixed)
    break_duration INT NOT NULL,         -- minutes
    after_hours INT,                     -- minutes (for minimum breaks)
    minutes_difference BOOLEAN DEFAULT false,
    
    sort_order INT DEFAULT 0
);

CREATE TABLE day_plan_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_plan_id UUID NOT NULL REFERENCES day_plans(id),
    
    account_id UUID NOT NULL REFERENCES accounts(id),
    
    from_time INT NOT NULL,              -- minutes from midnight
    to_time INT NOT NULL,                -- must be 1440 (24:00) for overnight start
    
    holiday_categories INT[],            -- which holiday categories apply
    exclude_holidays BOOLEAN DEFAULT false,
    
    sort_order INT DEFAULT 0
);

CREATE TABLE day_plan_alternatives (
    day_plan_id UUID NOT NULL REFERENCES day_plans(id),
    alternative_plan_id UUID NOT NULL REFERENCES day_plans(id),
    priority INT NOT NULL,               -- 1-6
    
    PRIMARY KEY (day_plan_id, priority)
);
```

### week_plans
```sql
CREATE TABLE week_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    monday_plan_id UUID NOT NULL REFERENCES day_plans(id),
    tuesday_plan_id UUID NOT NULL REFERENCES day_plans(id),
    wednesday_plan_id UUID NOT NULL REFERENCES day_plans(id),
    thursday_plan_id UUID NOT NULL REFERENCES day_plans(id),
    friday_plan_id UUID NOT NULL REFERENCES day_plans(id),
    saturday_plan_id UUID NOT NULL REFERENCES day_plans(id),
    sunday_plan_id UUID NOT NULL REFERENCES day_plans(id),
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, code)
);
```

### monthly_evaluations
```sql
CREATE TABLE monthly_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    name VARCHAR(255) NOT NULL,
    
    -- Limits (minutes)
    max_monthly_flextime INT,
    upper_annual_limit INT,
    lower_annual_limit INT,
    flextime_threshold INT,
    
    -- Credit type
    credit_type VARCHAR(20) DEFAULT 'complete',
    -- 'none', 'complete', 'after_threshold', 'no_transfer'
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, name)
);
```

---

## Employee Tariffs

### tariffs
```sql
CREATE TABLE tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    name VARCHAR(255) NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE,
    
    -- Vacation
    annual_vacation DECIMAL(5,2) NOT NULL,
    work_days_per_week INT NOT NULL DEFAULT 5,
    employment_type_id UUID REFERENCES employment_types(id),
    
    -- Hours (minutes)
    daily_target_hours INT,
    weekly_target_hours INT,
    monthly_target_hours INT,
    annual_target_hours INT,
    
    -- Employment
    employment_kind VARCHAR(20) DEFAULT 'fulltime', -- 'fulltime', 'parttime'
    parttime_percentage DECIMAL(5,2),
    
    -- Evaluation
    monthly_evaluation_id UUID REFERENCES monthly_evaluations(id),
    
    -- Time plan rhythm
    time_plan_rhythm VARCHAR(20) DEFAULT 'weekly', -- 'weekly', 'x_days'
    x_days_count INT,
    
    -- Macros
    weekly_macro_id UUID,
    weekly_macro_day INT,                -- 0=Sunday
    monthly_macro_id UUID,
    monthly_macro_day INT,               -- 1-31
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX idx_tariffs_employee ON tariffs(employee_id);
CREATE INDEX idx_tariffs_valid ON tariffs(employee_id, valid_from, valid_to);
```

### tariff_week_plans
```sql
CREATE TABLE tariff_week_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES tariffs(id),
    
    week_plan_id UUID NOT NULL REFERENCES week_plans(id),
    sequence INT NOT NULL,               -- for rolling schedules
    
    UNIQUE(tariff_id, sequence)
);
```

### tariff_day_plans (for x-day rhythm)
```sql
CREATE TABLE tariff_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES tariffs(id),
    
    day_number INT NOT NULL,             -- 1 to x_days_count
    day_plan_id UUID NOT NULL REFERENCES day_plans(id),
    
    UNIQUE(tariff_id, day_number)
);
```

---

## Bookings

### booking_types
```sql
CREATE TABLE booking_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    code VARCHAR(10) NOT NULL,
    name VARCHAR(255) NOT NULL,
    behavior VARCHAR(20) NOT NULL,       -- 'come_go', 'break', 'business_trip', 'custom'
    
    account_id UUID REFERENCES accounts(id),
    
    is_system BOOLEAN DEFAULT false,     -- A1, A2, PA, PE are system types
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, code)
);
```

### bookings
```sql
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    booking_date DATE NOT NULL,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id),
    
    -- Times (minutes from midnight)
    original_time INT NOT NULL,          -- immutable
    edited_time INT NOT NULL,            -- can be modified
    calculated_time INT,                 -- after rules applied
    
    -- Pairing
    pair_id UUID,                        -- links come/go
    pair_position SMALLINT,              -- 1=first, 2=second
    
    -- Source
    terminal_id UUID,
    source VARCHAR(20) DEFAULT 'terminal', -- 'terminal', 'web', 'mobile', 'import', 'manual'
    
    -- Status
    is_calculated BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP
);

CREATE INDEX idx_bookings_employee_date ON bookings(employee_id, booking_date);
CREATE INDEX idx_bookings_tenant_date ON bookings(tenant_id, booking_date);
CREATE INDEX idx_bookings_pair ON bookings(pair_id);
```

---

## Absence Days

### absence_types
```sql
CREATE TABLE absence_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    code VARCHAR(10) NOT NULL,           -- must start with U, K, or S
    name VARCHAR(255) NOT NULL,
    category VARCHAR(20) NOT NULL,       -- 'vacation', 'illness', 'special'
    
    -- Calculation
    calculation_id UUID,
    portion SMALLINT DEFAULT 1,          -- 0=none, 1=full, 2=half
    
    -- Holiday handling
    holiday_code VARCHAR(10),            -- alternative code on holidays
    priority INT DEFAULT 0,
    
    -- Display
    color VARCHAR(7),
    function_key INT,                    -- 1-12 for F1-F12
    
    -- Tracking
    account_id UUID REFERENCES accounts(id),
    
    is_system BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, code)
);
```

### absence_days
```sql
CREATE TABLE absence_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    absence_date DATE NOT NULL,
    absence_type_id UUID NOT NULL REFERENCES absence_types(id),
    
    remark TEXT,
    
    -- For workflow
    request_id UUID,
    status VARCHAR(20) DEFAULT 'approved', -- 'pending', 'approved', 'rejected'
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP,
    
    UNIQUE(employee_id, absence_date)
);

CREATE INDEX idx_absence_days_employee ON absence_days(employee_id, absence_date);
CREATE INDEX idx_absence_days_type ON absence_days(absence_type_id);
```

---

## Calculated Values

### employee_day_plans
```sql
-- Stores the actual day plan for each employee/date (after assignment)
CREATE TABLE employee_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    plan_date DATE NOT NULL,
    day_plan_id UUID NOT NULL REFERENCES day_plans(id),
    
    is_manually_changed BOOLEAN DEFAULT false,
    
    -- Snapshot of day plan settings (for when plan is modified for this day only)
    settings_override JSONB,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(employee_id, plan_date)
);

CREATE INDEX idx_emp_day_plans ON employee_day_plans(employee_id, plan_date);
```

### daily_values
```sql
CREATE TABLE daily_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    value_date DATE NOT NULL,
    
    -- Times (minutes)
    gross_time INT DEFAULT 0,
    net_time INT DEFAULT 0,
    target_time INT DEFAULT 0,
    overtime INT DEFAULT 0,
    undertime INT DEFAULT 0,
    break_time INT DEFAULT 0,
    
    -- Status
    day_plan_code VARCHAR(20),
    absence_type_code VARCHAR(10),
    holiday_category SMALLINT,
    
    is_manually_changed BOOLEAN DEFAULT false,
    has_error BOOLEAN DEFAULT false,
    error_codes TEXT[],
    
    -- Audit
    calculated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(employee_id, value_date)
);

CREATE INDEX idx_daily_values_employee ON daily_values(employee_id, value_date);
CREATE INDEX idx_daily_values_tenant_date ON daily_values(tenant_id, value_date);
CREATE INDEX idx_daily_values_errors ON daily_values(tenant_id, has_error) WHERE has_error = true;
```

### monthly_values
```sql
CREATE TABLE monthly_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    year INT NOT NULL,
    month INT NOT NULL,
    
    -- Times (minutes)
    total_gross_time INT DEFAULT 0,
    total_net_time INT DEFAULT 0,
    total_target_time INT DEFAULT 0,
    total_overtime INT DEFAULT 0,
    total_undertime INT DEFAULT 0,
    total_break_time INT DEFAULT 0,
    
    -- Balance
    flextime_start INT DEFAULT 0,        -- balance at start of month
    flextime_change INT DEFAULT 0,       -- change during month
    flextime_end INT DEFAULT 0,          -- balance at end of month
    flextime_carryover INT DEFAULT 0,    -- amount carried to next month
    
    -- Vacation
    vacation_start DECIMAL(5,2) DEFAULT 0,
    vacation_taken DECIMAL(5,2) DEFAULT 0,
    vacation_end DECIMAL(5,2) DEFAULT 0,
    
    -- Absence counts
    sick_days INT DEFAULT 0,
    vacation_days INT DEFAULT 0,
    special_days INT DEFAULT 0,
    
    -- Status
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMP,
    closed_by UUID REFERENCES users(id),
    
    -- Audit
    calculated_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(employee_id, year, month)
);

CREATE INDEX idx_monthly_values_employee ON monthly_values(employee_id, year, month);
```

---

## Accounts

### accounts
```sql
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    
    payroll_code VARCHAR(50),            -- Lohnart
    format VARCHAR(20) DEFAULT 'minutes', -- 'minutes', 'decimal', 'count'
    scope VARCHAR(10) DEFAULT 'day',     -- 'day', 'month'
    
    bonus_factor DECIMAL(5,2),
    carry_to_next_year BOOLEAN DEFAULT false,
    include_in_export BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    UNIQUE(tenant_id, code)
);
```

### account_values
```sql
CREATE TABLE account_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    value_date DATE NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(account_id, employee_id, value_date)
);

CREATE INDEX idx_account_values_employee ON account_values(employee_id, value_date);
```

---

## Audit Trail

### audit_log
```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    -- What
    entity_type VARCHAR(50) NOT NULL,    -- 'booking', 'absence', 'employee', etc.
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,         -- 'create', 'update', 'delete'
    
    -- Who
    user_id UUID REFERENCES users(id),
    user_name VARCHAR(100),
    
    -- Details
    old_values JSONB,
    new_values JSONB,
    
    -- When
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_tenant_entity ON audit_log(tenant_id, entity_type, entity_id);
CREATE INDEX idx_audit_tenant_date ON audit_log(tenant_id, created_at);
```

---

## Correction/Error Tracking

### correction_items
```sql
CREATE TABLE correction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    employee_id UUID NOT NULL REFERENCES employees(id),
    
    error_date DATE NOT NULL,
    error_code VARCHAR(20) NOT NULL,
    error_message VARCHAR(500),
    severity VARCHAR(10) DEFAULT 'error', -- 'error', 'warning', 'info'
    
    -- Resolution
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    resolution_note TEXT,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_corrections_tenant ON correction_items(tenant_id, is_resolved);
CREATE INDEX idx_corrections_employee ON correction_items(employee_id, error_date);
```
