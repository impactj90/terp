package access

import (
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

type Scope struct {
	Type          model.DataScopeType
	TenantIDs     []uuid.UUID
	DepartmentIDs []uuid.UUID
	EmployeeIDs   []uuid.UUID
}

func ScopeFromUser(user *model.User) (Scope, error) {
	if user == nil {
		return Scope{Type: model.DataScopeAll}, nil
	}

	scope := Scope{Type: user.DataScopeType}

	if scope.Type == "" {
		scope.Type = model.DataScopeAll
	}

	var err error
	scope.TenantIDs, err = parseUUIDList(user.DataScopeTenantIDs)
	if err != nil {
		return Scope{}, err
	}
	scope.DepartmentIDs, err = parseUUIDList(user.DataScopeDepartmentIDs)
	if err != nil {
		return Scope{}, err
	}
	scope.EmployeeIDs, err = parseUUIDList(user.DataScopeEmployeeIDs)
	if err != nil {
		return Scope{}, err
	}

	return scope, nil
}

func (s Scope) AllowsTenant(tenantID uuid.UUID) bool {
	switch s.Type {
	case model.DataScopeTenant:
		return containsUUID(s.TenantIDs, tenantID)
	default:
		return true
	}
}

func (s Scope) AllowsEmployee(employee *model.Employee) bool {
	if employee == nil {
		return false
	}
	switch s.Type {
	case model.DataScopeDepartment:
		if employee.DepartmentID == nil {
			return false
		}
		return containsUUID(s.DepartmentIDs, *employee.DepartmentID)
	case model.DataScopeEmployee:
		return containsUUID(s.EmployeeIDs, employee.ID)
	default:
		return true
	}
}

func (s Scope) AllowsEmployeeID(employeeID uuid.UUID) bool {
	switch s.Type {
	case model.DataScopeEmployee:
		return containsUUID(s.EmployeeIDs, employeeID)
	default:
		return true
	}
}

func (s Scope) ApplyEmployeeScope(query *gorm.DB, employeeColumn, departmentColumn string) *gorm.DB {
	switch s.Type {
	case model.DataScopeDepartment:
		if len(s.DepartmentIDs) == 0 {
			return query.Where("1 = 0")
		}
		return query.Where(fmt.Sprintf("%s IN ?", departmentColumn), s.DepartmentIDs)
	case model.DataScopeEmployee:
		if len(s.EmployeeIDs) == 0 {
			return query.Where("1 = 0")
		}
		return query.Where(fmt.Sprintf("%s IN ?", employeeColumn), s.EmployeeIDs)
	default:
		return query
	}
}

func parseUUIDList(values []string) ([]uuid.UUID, error) {
	if len(values) == 0 {
		return nil, nil
	}
	parsed := make([]uuid.UUID, 0, len(values))
	for _, value := range values {
		id, err := uuid.Parse(value)
		if err != nil {
			return nil, err
		}
		parsed = append(parsed, id)
	}
	return parsed, nil
}

func containsUUID(values []uuid.UUID, target uuid.UUID) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
