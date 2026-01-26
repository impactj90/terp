package auth

import "github.com/google/uuid"

// DevDepartment represents a predefined development department.
type DevDepartment struct {
	ID                uuid.UUID
	Code              string
	Name              string
	Description       string
	ParentID          *uuid.UUID
	ManagerEmployeeID *uuid.UUID
}

// Department UUIDs for reference by teams and other seed data.
var (
	DeptCompanyID    = uuid.MustParse("00000000-0000-0000-0000-000000000801")
	DeptITID         = uuid.MustParse("00000000-0000-0000-0000-000000000802")
	DeptHRID         = uuid.MustParse("00000000-0000-0000-0000-000000000803")
	DeptFinanceID    = uuid.MustParse("00000000-0000-0000-0000-000000000804")
	DeptOperationsID = uuid.MustParse("00000000-0000-0000-0000-000000000805")
	DeptDevID        = uuid.MustParse("00000000-0000-0000-0000-000000000806")
	DeptInfraID      = uuid.MustParse("00000000-0000-0000-0000-000000000807")
)

// DevDepartments contains predefined departments for development mode.
// Organized in a hierarchy: Company -> IT, HR, Finance, Operations -> Dev, Infra (under IT)
var DevDepartments = []DevDepartment{
	// Root department (company level)
	{
		ID:                DeptCompanyID,
		Code:              "COMPANY",
		Name:              "Dev Company",
		Description:       "Root organization department",
		ParentID:          nil,
		ManagerEmployeeID: &DevEmployeeAdminID, // Admin user as company manager
	},
	// First-level departments
	{
		ID:                DeptITID,
		Code:              "IT",
		Name:              "Information Technology",
		Description:       "IT department handling all technology needs",
		ParentID:          &DeptCompanyID,
		ManagerEmployeeID: &DevEmployeeAdminID,
	},
	{
		ID:                DeptHRID,
		Code:              "HR",
		Name:              "Human Resources",
		Description:       "HR department for employee management and recruitment",
		ParentID:          &DeptCompanyID,
		ManagerEmployeeID: nil,
	},
	{
		ID:                DeptFinanceID,
		Code:              "FIN",
		Name:              "Finance",
		Description:       "Finance and accounting department",
		ParentID:          &DeptCompanyID,
		ManagerEmployeeID: nil,
	},
	{
		ID:                DeptOperationsID,
		Code:              "OPS",
		Name:              "Operations",
		Description:       "Operations and logistics department",
		ParentID:          &DeptCompanyID,
		ManagerEmployeeID: nil,
	},
	// Second-level departments (under IT)
	{
		ID:                DeptDevID,
		Code:              "DEV",
		Name:              "Software Development",
		Description:       "Software development and engineering team",
		ParentID:          &DeptITID,
		ManagerEmployeeID: &DevEmployeeAdminID,
	},
	{
		ID:                DeptInfraID,
		Code:              "INFRA",
		Name:              "Infrastructure",
		Description:       "IT infrastructure and DevOps team",
		ParentID:          &DeptITID,
		ManagerEmployeeID: nil,
	},
}

// GetDevDepartments returns all predefined dev departments.
func GetDevDepartments() []DevDepartment {
	return DevDepartments
}
