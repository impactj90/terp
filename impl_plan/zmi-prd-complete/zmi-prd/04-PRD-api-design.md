# ZMI Time Clone - PRD Part 4: API Design

## API Principles

- **RESTful** design
- **JSON** request/response format
- **JWT** authentication
- **Tenant isolation** via token claims
- **Pagination** for list endpoints
- **Consistent error format**

---

## Authentication

### POST /api/auth/login
```json
// Request
{
  "username": "string",
  "password": "string",
  "tenant_code": "string"  // optional if single-tenant
}

// Response 200
{
  "access_token": "jwt_token",
  "refresh_token": "jwt_token",
  "expires_in": 3600,
  "user": {
    "id": "uuid",
    "username": "string",
    "employee_id": "uuid",
    "permissions": ["string"]
  }
}

// Response 401
{
  "error": "INVALID_CREDENTIALS",
  "message": "Invalid username or password"
}
```

### POST /api/auth/refresh
```json
// Request
{
  "refresh_token": "string"
}

// Response 200
{
  "access_token": "jwt_token",
  "expires_in": 3600
}
```

### POST /api/auth/logout
```json
// Response 200
{
  "message": "Logged out successfully"
}
```

---

## Employees

### GET /api/employees
```
Query params:
- page: int (default 1)
- per_page: int (default 20, max 100)
- search: string (name, personnel_number)
- department_id: uuid
- team_id: uuid
- is_active: boolean
- sort: string (name, personnel_number, entry_date)
- order: asc|desc
```

```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "personnel_number": "string",
      "first_name": "string",
      "last_name": "string",
      "department": { "id": "uuid", "name": "string" },
      "entry_date": "2024-01-15",
      "is_active": true
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### GET /api/employees/{id}
```json
// Response 200
{
  "id": "uuid",
  "personnel_number": "string",
  "pin": "string",
  "first_name": "string",
  "last_name": "string",
  "salutation": "string",
  "entry_date": "2024-01-15",
  "exit_date": null,
  "department_id": "uuid",
  "birth_date": "1990-05-20",
  "address": {
    "street": "string",
    "postal_code": "string",
    "city": "string",
    "country": "string"
  },
  "contacts": [
    { "type": "email", "label": "Work", "value": "john@company.com" }
  ],
  "is_active": true,
  "has_disability": false,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### POST /api/employees
```json
// Request
{
  "personnel_number": "string",  // required
  "first_name": "string",        // required
  "last_name": "string",         // required
  "entry_date": "2024-01-15",    // required
  "department_id": "uuid",
  "salutation": "string",
  "birth_date": "1990-05-20",
  "address": { ... },
  "contacts": [ ... ]
}

// Response 201
{
  "id": "uuid",
  "personnel_number": "string",
  "pin": "1234",  // auto-generated
  ...
}
```

### PUT /api/employees/{id}
```json
// Request - partial update
{
  "first_name": "string",
  "department_id": "uuid"
}

// Response 200
{ ... updated employee ... }
```

### DELETE /api/employees/{id}
```json
// Response 200
{
  "message": "Employee deactivated",
  "id": "uuid"
}
```

---

## Tariffs

### GET /api/employees/{id}/tariffs
```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "name": "Standard Full-Time",
      "valid_from": "2024-01-01",
      "valid_to": null,
      "annual_vacation": 30,
      "work_days_per_week": 5,
      "employment_kind": "fulltime",
      "time_plan_rhythm": "weekly",
      "week_plans": [
        { "sequence": 1, "week_plan": { "id": "uuid", "name": "Standard Week" } }
      ]
    }
  ]
}
```

### POST /api/employees/{id}/tariffs
```json
// Request
{
  "name": "string",
  "valid_from": "2024-01-01",
  "annual_vacation": 30,
  "work_days_per_week": 5,
  "employment_type_id": "uuid",
  "monthly_evaluation_id": "uuid",
  "time_plan_rhythm": "weekly",
  "week_plan_ids": ["uuid", "uuid"]  // for rolling schedule
}

// Response 201
{ ... created tariff ... }
```

### POST /api/employees/{id}/tariffs/{tariff_id}/apply
Apply time plans to employee's calendar
```json
// Request
{
  "from_date": "2024-01-01",
  "to_date": "2024-12-31",
  "overwrite_manual_changes": false
}

// Response 200
{
  "message": "Time plans applied",
  "days_updated": 365,
  "days_skipped": 5
}
```

---

## Time Plans

### GET /api/day-plans
```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "code": "010",
      "name": "Flextime 8h",
      "plan_type": "flextime",
      "come_from": "07:00",
      "come_to": "09:00",
      "go_from": "15:00",
      "go_to": "19:00",
      "regular_hours": "08:00"
    }
  ]
}
```

### GET /api/day-plans/{id}
```json
// Response 200
{
  "id": "uuid",
  "code": "010",
  "name": "Flextime 8h",
  "plan_type": "flextime",
  "color": "#4CAF50",
  
  "come_from": "07:00",
  "come_to": "09:00",
  "go_from": "15:00",
  "go_to": "19:00",
  
  "regular_hours_1": "08:00",
  "regular_hours_1_active": true,
  "regular_hours_2": null,
  
  "tolerance": {
    "come_plus": 0,
    "come_minus": 60,
    "go_plus": 120,
    "go_minus": 0,
    "variable_work_time": false
  },
  
  "rounding": {
    "come_type": "up",
    "come_interval": 15,
    "go_type": "down",
    "go_interval": 15,
    "round_all": false
  },
  
  "breaks": [
    { "type": "fixed_1", "duration": 30, "from": "12:00" },
    { "type": "minimum_1", "duration": 15, "after_hours": "06:00" }
  ],
  
  "holiday_credits": {
    "category_1": "08:00",
    "category_2": "04:00",
    "category_3": "00:00"
  },
  
  "vacation_deduction": 1.0,
  "no_booking_behavior": "error",
  "day_change_behavior": "none",
  "max_net_work_time": "10:00",
  
  "shift_detection": {
    "enabled": false
  }
}
```

### POST /api/day-plans
```json
// Request
{
  "code": "015",
  "name": "New Plan",
  "plan_type": "flextime",
  ...
}

// Response 201
{ ... created day plan ... }
```

### POST /api/day-plans/{id}/copy
```json
// Request
{
  "new_code": "016",
  "new_name": "Copy of Plan"
}

// Response 201
{ ... copied day plan ... }
```

### GET /api/week-plans
### GET /api/week-plans/{id}
### POST /api/week-plans
### PUT /api/week-plans/{id}
### DELETE /api/week-plans/{id}

---

## Bookings

### GET /api/bookings
```
Query params:
- employee_id: uuid (required if not admin)
- from_date: date
- to_date: date
- has_errors: boolean
```

```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "employee_id": "uuid",
      "date": "2024-01-15",
      "booking_type": { "code": "A1", "name": "Come" },
      "original_time": "08:03",
      "edited_time": "08:03",
      "calculated_time": "08:15",
      "source": "terminal"
    }
  ]
}
```

### GET /api/employees/{id}/bookings/{date}
Get all bookings for an employee on a specific date
```json
// Response 200
{
  "date": "2024-01-15",
  "day_plan": {
    "code": "010",
    "name": "Flextime 8h",
    "is_manually_changed": false
  },
  "bookings": [
    {
      "id": "uuid",
      "type": { "code": "A1", "name": "Come" },
      "original_time": "08:03",
      "edited_time": "08:03",
      "calculated_time": "08:15",
      "pair_id": "uuid"
    },
    {
      "id": "uuid",
      "type": { "code": "A2", "name": "Go" },
      "original_time": "17:12",
      "edited_time": "17:12",
      "calculated_time": "17:00",
      "pair_id": "uuid"
    }
  ],
  "daily_values": {
    "gross_time": "09:09",
    "net_time": "08:39",
    "target_time": "08:00",
    "overtime": "00:39",
    "break_time": "00:30"
  },
  "errors": [],
  "absence": null,
  "holiday": null
}
```

### POST /api/bookings
```json
// Request
{
  "employee_id": "uuid",
  "date": "2024-01-15",
  "booking_type_code": "A1",
  "time": "08:00"
}

// Response 201
{ ... created booking ... }
```

### PUT /api/bookings/{id}
```json
// Request
{
  "edited_time": "08:15"
}

// Response 200
{ ... updated booking ... }
```

### DELETE /api/bookings/{id}
```json
// Response 200
{
  "message": "Booking deleted"
}
```

### POST /api/employees/{id}/bookings/{date}/calculate
Recalculate a single day
```json
// Response 200
{
  "message": "Day calculated",
  "daily_values": { ... }
}
```

---

## Absences

### GET /api/employees/{id}/absences
```
Query params:
- from_date: date
- to_date: date
- category: vacation|illness|special
```

```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "from_date": "2024-01-15",
      "to_date": "2024-01-19",
      "type": { "code": "UL", "name": "Vacation" },
      "days": 5,
      "remark": "Summer vacation",
      "status": "approved"
    }
  ]
}
```

### POST /api/employees/{id}/absences
```json
// Request
{
  "from_date": "2024-01-15",
  "to_date": "2024-01-19",
  "absence_type_code": "UL",
  "remark": "Summer vacation"
}

// Response 201
{
  "id": "uuid",
  "days_created": 5,
  ...
}
```

### DELETE /api/absences/{id}
or
### DELETE /api/employees/{id}/absences
```json
// Request
{
  "from_date": "2024-01-15",
  "to_date": "2024-01-19"
}

// Response 200
{
  "message": "Absences deleted",
  "days_deleted": 5
}
```

### GET /api/employees/{id}/vacation-balance
```json
// Response 200
{
  "year": 2024,
  "annual_entitlement": 30.0,
  "special_entitlement": 2.0,
  "carryover": 3.5,
  "total_entitlement": 35.5,
  "taken": 10.0,
  "pending": 5.0,
  "remaining": 20.5
}
```

---

## Day Values / Reports

### GET /api/employees/{id}/daily-values
```
Query params:
- from_date: date
- to_date: date
```

```json
// Response 200
{
  "data": [
    {
      "date": "2024-01-15",
      "day_plan_code": "010",
      "gross_time": "09:00",
      "net_time": "08:30",
      "target_time": "08:00",
      "overtime": "00:30",
      "break_time": "00:30",
      "absence_type": null,
      "holiday": null,
      "has_error": false
    }
  ]
}
```

### GET /api/employees/{id}/monthly-values
```
Query params:
- year: int
- month: int
```

```json
// Response 200
{
  "year": 2024,
  "month": 1,
  "total_gross_time": "180:00",
  "total_net_time": "168:00",
  "total_target_time": "160:00",
  "total_overtime": "08:00",
  "flextime_start": "05:30",
  "flextime_change": "08:00",
  "flextime_end": "13:30",
  "flextime_carryover": "13:30",
  "vacation_start": 30.0,
  "vacation_taken": 2.0,
  "vacation_end": 28.0,
  "sick_days": 1,
  "is_closed": false
}
```

### POST /api/employees/{id}/calculate-month
```json
// Request
{
  "year": 2024,
  "month": 1
}

// Response 200
{
  "message": "Month calculated",
  "monthly_values": { ... }
}
```

---

## Corrections

### GET /api/corrections
```
Query params:
- from_date: date
- to_date: date
- department_id: uuid
- severity: error|warning|info
- is_resolved: boolean
```

```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "employee": { "id": "uuid", "name": "John Doe" },
      "date": "2024-01-15",
      "error_code": "MISSING_GO",
      "error_message": "Missing departure booking",
      "severity": "error",
      "is_resolved": false
    }
  ],
  "meta": {
    "total_errors": 15,
    "total_warnings": 8
  }
}
```

### PUT /api/corrections/{id}/resolve
```json
// Request
{
  "resolution_note": "Added manual booking"
}

// Response 200
{
  "message": "Correction resolved"
}
```

---

## Month Closing

### POST /api/employees/close-months
```json
// Request
{
  "employee_ids": ["uuid", "uuid"],  // or "all"
  "through_month": "2024-01"
}

// Response 200
{
  "message": "Months closed",
  "employees_affected": 50,
  "months_closed": 1
}
```

### POST /api/employees/reopen-months
```json
// Request
{
  "employee_ids": ["uuid"],
  "from_month": "2024-01"
}

// Response 200
{
  "message": "Months reopened",
  "employees_affected": 1
}
```

---

## Reports

### GET /api/reports/monthly
```
Query params:
- year: int
- month: int
- department_id: uuid
- employee_ids: uuid[] 
- format: json|pdf|xlsx
```

### GET /api/reports/absence-statistics
```
Query params:
- from_date: date
- to_date: date
- group_by: employee|department|type
- format: json|pdf|xlsx
```

### GET /api/reports/vacation-list
```
Query params:
- year: int
- department_id: uuid
- format: json|pdf|xlsx
```

---

## Payroll Export

### POST /api/payroll/export
```json
// Request
{
  "interface_id": "uuid",
  "year": 2024,
  "month": 1,
  "employee_ids": ["uuid"]  // optional, default all
}

// Response 200
{
  "message": "Export generated",
  "file_url": "/api/files/exports/payroll_2024_01.csv",
  "records": 50
}
```

---

## Audit Log

### GET /api/audit-log
```
Query params:
- entity_type: string
- entity_id: uuid
- user_id: uuid
- from_date: datetime
- to_date: datetime
```

```json
// Response 200
{
  "data": [
    {
      "id": "uuid",
      "entity_type": "booking",
      "entity_id": "uuid",
      "action": "update",
      "user": { "id": "uuid", "name": "Admin" },
      "old_values": { "edited_time": "08:00" },
      "new_values": { "edited_time": "08:15" },
      "created_at": "2024-01-15T14:30:00Z"
    }
  ]
}
```

---

## Error Response Format

All error responses follow this format:
```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "details": {
    "field": "specific field",
    "reason": "additional info"
  }
}
```

Common error codes:
- `UNAUTHORIZED` - Not logged in (401)
- `FORBIDDEN` - Not allowed (403)
- `NOT_FOUND` - Resource not found (404)
- `VALIDATION_ERROR` - Invalid input (422)
- `CONFLICT` - Resource conflict (409)
- `SERVER_ERROR` - Internal error (500)
