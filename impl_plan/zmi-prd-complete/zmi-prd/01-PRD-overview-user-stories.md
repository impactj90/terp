# ZMI Time Clone - Product Requirements Document (PRD)

## Document Info
- **Version:** 1.0
- **Based on:** ZMI Time Handbuch Version 6.4 (18.05.2022)
- **Target:** Cloud-native, web-based time tracking system

---

# 1. Executive Summary

## 1.1 Product Overview

A cloud-based workforce management system for:
- Time tracking and attendance
- Vacation and absence management
- Shift planning
- Overtime and flextime calculation
- Payroll data export
- Multi-tenant support

## 1.2 Key Differentiators from Original

| Original (ZMI Time) | New Cloud Version |
|---------------------|-------------------|
| Windows desktop app | Web application (responsive) |
| Local database | Cloud database (multi-tenant) |
| Terminal polling | Real-time webhooks + polling fallback |
| Manual backups | Automated cloud backups |
| Single server | Horizontally scalable |

## 1.3 Target Users

| Role | Description |
|------|-------------|
| **Administrator** | Full system access, configuration |
| **HR Manager** | Employee management, reports |
| **Team Lead** | Team oversight, approvals |
| **Employee** | Self-service time tracking |

---

# 2. User Stories by Module

## 2.1 Authentication & Authorization

### US-AUTH-001: User Login
**As a** user  
**I want to** log in with username and password  
**So that** I can access the system securely

**Acceptance Criteria:**
- Username/password authentication
- Password complexity enforcement (configurable)
- Session management with timeout
- Failed login attempt tracking

### US-AUTH-002: Single Sign-On
**As a** user  
**I want to** log in with my Windows/corporate credentials  
**So that** I don't need separate passwords

**Acceptance Criteria:**
- OAuth2/OIDC integration
- SAML support
- Map external identity to internal user

### US-AUTH-003: Role-Based Access
**As an** administrator  
**I want to** define user groups with specific permissions  
**So that** users only see what they're authorized to see

**Acceptance Criteria:**
- Granular permissions per module (read/write/delete)
- Permissions per data field
- Permissions per employee subset
- Inherit permissions from group

---

## 2.2 Multi-Tenant (Mandant) Management

### US-TENANT-001: Create Tenant
**As a** super admin  
**I want to** create new tenants  
**So that** multiple companies can use the system

**Acceptance Criteria:**
- Tenant with name, address, settings
- Complete data isolation between tenants
- Tenant-specific configurations

### US-TENANT-002: Manage Holidays
**As an** administrator  
**I want to** define holidays for my tenant  
**So that** they're correctly considered in calculations

**Acceptance Criteria:**
- Add/edit/delete holidays
- Assign category (1=full, 2=half, 3=custom)
- Auto-generate holidays by country/region/year
- Holidays apply to all employees in tenant

---

## 2.3 Employee Management

### US-EMP-001: Create Employee
**As an** HR manager  
**I want to** create new employee records  
**So that** they can use the time tracking system

**Acceptance Criteria:**
- Required fields: personnel number, PIN, name, entry date
- Auto-generate next available PIN
- Assign to tenant, department
- Set active/inactive status

### US-EMP-002: Employee Profile
**As an** HR manager  
**I want to** maintain complete employee information  
**So that** all relevant data is in one place

**Acceptance Criteria:**
- Personal info (address, birth date, photo)
- Contact information (configurable fields)
- Bank details, tax info
- Organizational assignment (department, cost center, team)

### US-EMP-003: Employee Tariff
**As an** HR manager  
**I want to** assign work rules to employees  
**So that** their time is calculated correctly

**Acceptance Criteria:**
- Assign time plan (weekly or X-day rhythm)
- Set vacation entitlement
- Set employment type (full/part time)
- Define validity periods for tariff changes

### US-EMP-004: Employee Exit
**As an** HR manager  
**I want to** set an exit date for employees  
**So that** they can't book after leaving

**Acceptance Criteria:**
- Set exit date and reason
- Block bookings after exit date
- Optionally assign "exit" day plan
- Retain historical data

### US-EMP-005: Employee Search
**As a** user  
**I want to** search and filter employees  
**So that** I can quickly find who I'm looking for

**Acceptance Criteria:**
- Search by name, number, department
- Filter by status, department, team
- Save filter presets
- Tree view by organizational structure

---

## 2.4 Time Plan Management

### US-PLAN-001: Create Day Plan
**As an** administrator  
**I want to** create day plan templates  
**So that** I can define daily work rules

**Acceptance Criteria:**
- Fixed time or flextime type
- Define core hours (come from/to, go from/to)
- Set target hours
- Configure breaks (fixed, variable, minimum-after-hours)
- Set tolerance rules
- Set rounding rules

### US-PLAN-002: Day Plan Breaks
**As an** administrator  
**I want to** configure automatic break deductions  
**So that** breaks are handled consistently

**Acceptance Criteria:**
- Fixed breaks: always deducted at specified time
- Variable breaks: only if employee didn't book break
- Minimum breaks: deducted after X hours worked
- Option: deduct only actual overage vs. full break

### US-PLAN-003: Day Plan Rounding
**As an** administrator  
**I want to** configure time rounding rules  
**So that** bookings are standardized

**Acceptance Criteria:**
- Round up, round down, mathematical rounding
- Configurable interval (5, 10, 15 minutes, etc.)
- Add/subtract fixed time from bookings
- Apply to first/last booking only or all bookings

### US-PLAN-004: Create Week Plan
**As an** administrator  
**I want to** combine day plans into week plans  
**So that** I can assign complete weekly schedules

**Acceptance Criteria:**
- Assign day plan for each day of week
- All 7 days must have a plan (even "off" days)
- Optionally restrict to specific tenant

### US-PLAN-005: Assign Time Plan to Employee
**As an** HR manager  
**I want to** assign time plans to employees  
**So that** their schedules are defined

**Acceptance Criteria:**
- Assign one or more week plans
- Support rolling schedules (shift rotation)
- Support X-day rhythms (non-weekly cycles)
- Define validity period
- Option to overwrite or preserve manual changes

### US-PLAN-006: Manual Day Override
**As a** supervisor  
**I want to** change an employee's day plan for a specific date  
**So that** exceptions are handled

**Acceptance Criteria:**
- Select different day plan for one day
- Modify day plan settings for one day
- Mark day as manually changed
- Preserve changes when bulk-updating plans

---

## 2.5 Time Booking

### US-BOOK-001: Clock In/Out
**As an** employee  
**I want to** record my arrival and departure times  
**So that** my work hours are tracked

**Acceptance Criteria:**
- Record "Kommen" (arrive) booking
- Record "Gehen" (leave) booking
- Timestamp captured automatically
- Support manual time entry with permission

### US-BOOK-002: Break Booking
**As an** employee  
**I want to** record my break times  
**So that** breaks are tracked accurately

**Acceptance Criteria:**
- Record break start/end
- Override automatic break deduction if booked
- Multiple breaks per day supported

### US-BOOK-003: View My Bookings
**As an** employee  
**I want to** see my bookings for any day  
**So that** I can verify my times

**Acceptance Criteria:**
- Show original, edited, and calculated times
- Show daily totals
- Show any errors or warnings
- View current and past days

### US-BOOK-004: Edit Booking (Admin)
**As a** supervisor  
**I want to** correct employee bookings  
**So that** errors can be fixed

**Acceptance Criteria:**
- Edit the "edited" time (original preserved)
- Add missing bookings
- Delete erroneous bookings
- Recalculate day after changes
- Log all changes with user/timestamp

### US-BOOK-005: Booking Validation
**As the** system  
**I want to** validate bookings  
**So that** errors are detected

**Acceptance Criteria:**
- Detect unpaired bookings (come without go)
- Detect bookings outside allowed window
- Detect core time violations
- Generate errors in correction assistant

---

## 2.6 Absence Management

### US-ABS-001: Request Vacation
**As an** employee  
**I want to** request vacation days  
**So that** I can take time off

**Acceptance Criteria:**
- Select date range
- Select absence type
- Add optional comment
- Check available balance
- Submit for approval (if workflow enabled)

### US-ABS-002: Record Absence (Admin)
**As an** HR manager  
**I want to** record absences for employees  
**So that** their time is tracked correctly

**Acceptance Criteria:**
- Select employee and date range
- Select absence type (vacation, sick, special)
- Add remarks
- Immediate application (no approval needed)

### US-ABS-003: Absence Types
**As an** administrator  
**I want to** configure absence types  
**So that** all company absence reasons are covered

**Acceptance Criteria:**
- Code prefix: U (vacation), K (illness), S (special)
- Set time credit: none, full, half
- Assign calculation rules
- Set color for calendar display
- Configure alternative code for holidays

### US-ABS-004: Vacation Balance
**As an** employee  
**I want to** see my vacation balance  
**So that** I know how many days I have left

**Acceptance Criteria:**
- Show annual entitlement
- Show taken days
- Show remaining days
- Show pending requests
- Show carryover from previous year

### US-ABS-005: Vacation Calculation
**As the** system  
**I want to** calculate vacation entitlements  
**So that** balances are always correct

**Acceptance Criteria:**
- Annual entitlement from tariff
- Prorate for partial years (entry/exit)
- Add special entitlements (age, tenure, disability)
- Apply carryover rules
- Apply capping rules at configured dates

---

## 2.7 Calculation & Processing

### US-CALC-001: Calculate Day
**As the** system  
**I want to** calculate daily time values  
**So that** hours are properly computed

**Acceptance Criteria:**
- Pair bookings (come/go, break start/end)
- Apply day plan rules (tolerance, rounding)
- Deduct breaks
- Calculate gross and net time
- Calculate overtime
- Update account values
- Execute day macro if configured

### US-CALC-002: Calculate Month
**As the** system  
**I want to** calculate monthly totals  
**So that** period summaries are available

**Acceptance Criteria:**
- Sum all daily values
- Calculate vs. target hours
- Apply monthly evaluation rules
- Update flextime balance
- Execute month macro if configured
- Prepare previous month on first of month

### US-CALC-003: Monthly Evaluation Rules
**As an** administrator  
**I want to** configure month-end processing  
**So that** overtime is handled per company policy

**Acceptance Criteria:**
- Maximum monthly flextime accrual
- Upper/lower limits on annual balance
- Flextime threshold (minimum before credited)
- Credit type: complete, after threshold, none

### US-CALC-004: Automatic Shift Detection
**As the** system  
**I want to** detect which shift an employee worked  
**So that** the correct day plan is applied

**Acceptance Criteria:**
- Check booking time against shift windows
- Switch to matching day plan
- Check up to 6 alternative plans
- Generate error if no match found

---

## 2.8 Correction & Validation

### US-CORR-001: View Errors
**As a** supervisor  
**I want to** see all booking errors  
**So that** I can correct them

**Acceptance Criteria:**
- List errors and hints separately
- Filter by date range, department
- Show employee, date, error type
- Click to navigate to booking

### US-CORR-002: Error Types
**As the** system  
**I want to** classify booking problems  
**So that** users know what needs fixing

**Error Types:**
- Missing come booking
- Missing go booking
- Unpaired booking
- Core time violation
- No day plan found
- Booking outside allowed window
- Maximum work time exceeded

---

## 2.9 Reports & Analytics

### US-RPT-001: Monthly Report
**As a** manager  
**I want to** generate monthly time reports  
**So that** I can review team hours

**Acceptance Criteria:**
- Select month and employees/departments
- Show totals: worked, target, overtime, absences
- Export to PDF and Excel
- Print directly

### US-RPT-002: Absence Report
**As an** HR manager  
**I want to** analyze absences  
**So that** I can identify patterns

**Acceptance Criteria:**
- Filter by date range, type, employee
- Summary statistics
- Trend visualization
- Export capability

### US-RPT-003: Custom Query Builder
**As a** power user  
**I want to** create custom data queries  
**So that** I can analyze specific metrics

**Acceptance Criteria:**
- Select data source (daily, monthly, bookings)
- Choose columns to display
- Apply filters
- Group and sort
- Save query layouts
- Export to Excel

---

## 2.10 Payroll Export

### US-PAY-001: Configure Export
**As an** administrator  
**I want to** set up payroll export  
**So that** time data flows to our payroll system

**Acceptance Criteria:**
- Define export format (Datev, Lexware, etc.)
- Map accounts to payroll codes
- Set export path and filename
- Configure which values to include

### US-PAY-002: Generate Export
**As an** HR manager  
**I want to** export time data for payroll  
**So that** employees get paid correctly

**Acceptance Criteria:**
- Select period and employees
- Generate export file
- Log export for audit
- Handle previously exported periods

---

## 2.11 System Administration

### US-ADMIN-001: Audit Trail
**As an** administrator  
**I want to** see who changed what  
**So that** changes are accountable

**Acceptance Criteria:**
- Log all booking changes
- Log absence changes
- Log time plan changes
- Show old/new values, user, timestamp

### US-ADMIN-002: Month Closing
**As an** HR manager  
**I want to** close completed months  
**So that** they can't be accidentally changed

**Acceptance Criteria:**
- Lock month from editing
- Per-employee closing
- Unlock with permission if needed

### US-ADMIN-003: Data Retention
**As an** administrator  
**I want to** configure data retention  
**So that** we comply with regulations

**Acceptance Criteria:**
- Define retention periods per data type
- Automatic deletion after period
- GDPR compliance features
