# TICKET-031: Create Employee Model

**Type**: Model
**Effort**: S
**Sprint**: 5 - Employees
**Dependencies**: TICKET-027, TICKET-028, TICKET-029

## Description

Create the Employee model with contacts and cards relationships.

## Files to Create

- `apps/api/internal/model/employee.go`

## Implementation

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
    "gorm.io/gorm"
)

type Employee struct {
    ID                 uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID           uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    PersonnelNumber    string          `gorm:"type:varchar(50);not null" json:"personnel_number"`
    PIN                string          `gorm:"type:varchar(20);not null" json:"-"` // Hidden in JSON
    FirstName          string          `gorm:"type:varchar(100);not null" json:"first_name"`
    LastName           string          `gorm:"type:varchar(100);not null" json:"last_name"`
    Email              string          `gorm:"type:varchar(255)" json:"email,omitempty"`
    Phone              string          `gorm:"type:varchar(50)" json:"phone,omitempty"`
    EntryDate          time.Time       `gorm:"type:date;not null" json:"entry_date"`
    ExitDate           *time.Time      `gorm:"type:date" json:"exit_date,omitempty"`
    DepartmentID       *uuid.UUID      `gorm:"type:uuid;index" json:"department_id,omitempty"`
    CostCenterID       *uuid.UUID      `gorm:"type:uuid" json:"cost_center_id,omitempty"`
    EmploymentTypeID   *uuid.UUID      `gorm:"type:uuid" json:"employment_type_id,omitempty"`
    WeeklyHours        decimal.Decimal `gorm:"type:decimal(5,2);default:40.00" json:"weekly_hours"`
    VacationDaysPerYear decimal.Decimal `gorm:"type:decimal(5,2);default:30.00" json:"vacation_days_per_year"`
    IsActive           bool            `gorm:"default:true" json:"is_active"`
    CreatedAt          time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt          time.Time       `gorm:"default:now()" json:"updated_at"`
    DeletedAt          gorm.DeletedAt  `gorm:"index" json:"deleted_at,omitempty"`

    // Relations
    Tenant         *Tenant           `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
    Department     *Department       `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`
    CostCenter     *CostCenter       `gorm:"foreignKey:CostCenterID" json:"cost_center,omitempty"`
    EmploymentType *EmploymentType   `gorm:"foreignKey:EmploymentTypeID" json:"employment_type,omitempty"`
    Contacts       []EmployeeContact `gorm:"foreignKey:EmployeeID" json:"contacts,omitempty"`
    Cards          []EmployeeCard    `gorm:"foreignKey:EmployeeID" json:"cards,omitempty"`
    User           *User             `gorm:"foreignKey:EmployeeID" json:"user,omitempty"`
}

func (Employee) TableName() string {
    return "employees"
}

// FullName returns first name + last name
func (e *Employee) FullName() string {
    return e.FirstName + " " + e.LastName
}

// IsEmployed returns true if currently employed (no exit date or exit date in future)
func (e *Employee) IsEmployed() bool {
    if e.ExitDate == nil {
        return true
    }
    return e.ExitDate.After(time.Now())
}

type EmployeeContact struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    EmployeeID  uuid.UUID `gorm:"type:uuid;not null;index" json:"employee_id"`
    ContactType string    `gorm:"type:varchar(50);not null" json:"contact_type"`
    Value       string    `gorm:"type:varchar(255);not null" json:"value"`
    Label       string    `gorm:"type:varchar(100)" json:"label,omitempty"`
    IsPrimary   bool      `gorm:"default:false" json:"is_primary"`
    CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (EmployeeContact) TableName() string {
    return "employee_contacts"
}

type EmployeeCard struct {
    ID                  uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID            uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EmployeeID          uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
    CardNumber          string     `gorm:"type:varchar(100);not null" json:"card_number"`
    CardType            string     `gorm:"type:varchar(50);default:'rfid'" json:"card_type"`
    ValidFrom           time.Time  `gorm:"type:date;not null" json:"valid_from"`
    ValidTo             *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
    IsActive            bool       `gorm:"default:true" json:"is_active"`
    DeactivatedAt       *time.Time `json:"deactivated_at,omitempty"`
    DeactivationReason  string     `gorm:"type:varchar(255)" json:"deactivation_reason,omitempty"`
    CreatedAt           time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt           time.Time  `gorm:"default:now()" json:"updated_at"`
}

func (EmployeeCard) TableName() string {
    return "employee_cards"
}

// IsValid returns true if card is currently valid
func (c *EmployeeCard) IsValid() bool {
    if !c.IsActive {
        return false
    }
    now := time.Now()
    if c.ValidFrom.After(now) {
        return false
    }
    if c.ValidTo != nil && c.ValidTo.Before(now) {
        return false
    }
    return true
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] PIN is hidden in JSON output
- [x] FullName() helper works
- [x] IsEmployed() helper works
- [x] Card IsValid() helper works
- [x] All relationships defined
