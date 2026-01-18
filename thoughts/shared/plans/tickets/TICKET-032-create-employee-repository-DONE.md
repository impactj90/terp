# TICKET-032: Create Employee Repository

**Type**: Repository
**Effort**: M
**Sprint**: 5 - Employees
**Dependencies**: TICKET-031

## Description

Create the Employee repository with search, filter, and pagination support.

## Files to Create

- `apps/api/internal/repository/employee.go`

## Implementation

```go
package repository

import (
    "context"
    "strings"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type EmployeeFilter struct {
    TenantID     uuid.UUID
    DepartmentID *uuid.UUID
    IsActive     *bool
    SearchQuery  string
    Offset       int
    Limit        int
}

type EmployeeRepository interface {
    Create(ctx context.Context, emp *model.Employee) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
    GetByPersonnelNumber(ctx context.Context, tenantID uuid.UUID, pn string) (*model.Employee, error)
    GetByPIN(ctx context.Context, tenantID uuid.UUID, pin string) (*model.Employee, error)
    GetByCardNumber(ctx context.Context, tenantID uuid.UUID, cardNumber string) (*model.Employee, error)
    Update(ctx context.Context, emp *model.Employee) error
    Delete(ctx context.Context, id uuid.UUID) error // soft delete
    List(ctx context.Context, filter EmployeeFilter) ([]model.Employee, int64, error)
    GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Employee, error)
    Search(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]model.Employee, error)
}

type employeeRepository struct {
    db *gorm.DB
}

func NewEmployeeRepository(db *gorm.DB) EmployeeRepository {
    return &employeeRepository{db: db}
}

func (r *employeeRepository) Create(ctx context.Context, emp *model.Employee) error {
    return r.db.WithContext(ctx).Create(emp).Error
}

func (r *employeeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
    var emp model.Employee
    err := r.db.WithContext(ctx).Where("id = ?", id).First(&emp).Error
    return &emp, err
}

func (r *employeeRepository) GetByPersonnelNumber(ctx context.Context, tenantID uuid.UUID, pn string) (*model.Employee, error) {
    var emp model.Employee
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND personnel_number = ?", tenantID, pn).
        First(&emp).Error
    return &emp, err
}

func (r *employeeRepository) GetByPIN(ctx context.Context, tenantID uuid.UUID, pin string) (*model.Employee, error) {
    var emp model.Employee
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND pin = ?", tenantID, pin).
        First(&emp).Error
    return &emp, err
}

func (r *employeeRepository) GetByCardNumber(ctx context.Context, tenantID uuid.UUID, cardNumber string) (*model.Employee, error) {
    var emp model.Employee
    err := r.db.WithContext(ctx).
        Joins("JOIN employee_cards ON employee_cards.employee_id = employees.id").
        Where("employee_cards.tenant_id = ? AND employee_cards.card_number = ? AND employee_cards.is_active = true", tenantID, cardNumber).
        First(&emp).Error
    return &emp, err
}

func (r *employeeRepository) Update(ctx context.Context, emp *model.Employee) error {
    return r.db.WithContext(ctx).Save(emp).Error
}

func (r *employeeRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.Employee{}, "id = ?", id).Error
}

func (r *employeeRepository) List(ctx context.Context, filter EmployeeFilter) ([]model.Employee, int64, error) {
    var employees []model.Employee
    var total int64

    query := r.db.WithContext(ctx).Model(&model.Employee{}).Where("tenant_id = ?", filter.TenantID)

    if filter.DepartmentID != nil {
        query = query.Where("department_id = ?", *filter.DepartmentID)
    }
    if filter.IsActive != nil {
        query = query.Where("is_active = ?", *filter.IsActive)
    }
    if filter.SearchQuery != "" {
        search := "%" + strings.ToLower(filter.SearchQuery) + "%"
        query = query.Where(
            "LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(personnel_number) LIKE ?",
            search, search, search,
        )
    }

    // Count total
    query.Count(&total)

    // Apply pagination
    if filter.Limit > 0 {
        query = query.Limit(filter.Limit)
    }
    if filter.Offset > 0 {
        query = query.Offset(filter.Offset)
    }

    err := query.Order("last_name ASC, first_name ASC").Find(&employees).Error
    return employees, total, err
}

func (r *employeeRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
    var emp model.Employee
    err := r.db.WithContext(ctx).
        Preload("Department").
        Preload("CostCenter").
        Preload("EmploymentType").
        Preload("Contacts").
        Preload("Cards", "is_active = ?", true).
        Where("id = ?", id).
        First(&emp).Error
    return &emp, err
}

func (r *employeeRepository) Search(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]model.Employee, error) {
    var employees []model.Employee
    search := "%" + strings.ToLower(query) + "%"
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND is_active = true", tenantID).
        Where(
            "LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(personnel_number) LIKE ?",
            search, search, search,
        ).
        Limit(limit).
        Find(&employees).Error
    return employees, err
}
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] List with filters and pagination works
- [x] Search searches name and personnel number
- [x] GetWithDetails preloads all relationships
- [x] GetByCardNumber joins card table correctly
