package auth

import "github.com/google/uuid"

// DevTeam represents a predefined development team.
type DevTeam struct {
	ID               uuid.UUID
	Name             string
	Description      string
	DepartmentID     *uuid.UUID
	LeaderEmployeeID *uuid.UUID
}

// DevTeamMember represents a predefined development team member.
type DevTeamMember struct {
	TeamID     uuid.UUID
	EmployeeID uuid.UUID
	Role       string // "member", "lead", "deputy"
}

// Team UUIDs for reference.
var (
	TeamBackendID    = uuid.MustParse("00000000-0000-0000-0000-000000000901")
	TeamFrontendID   = uuid.MustParse("00000000-0000-0000-0000-000000000902")
	TeamDevOpsID     = uuid.MustParse("00000000-0000-0000-0000-000000000903")
	TeamHRCoreID     = uuid.MustParse("00000000-0000-0000-0000-000000000904")
	TeamAccountingID = uuid.MustParse("00000000-0000-0000-0000-000000000905")
)

// DevTeams contains predefined teams for development mode.
var DevTeams = []DevTeam{
	// Development teams (under Software Development department)
	{
		ID:               TeamBackendID,
		Name:             "Backend Team",
		Description:      "Backend API and server-side development",
		DepartmentID:     &DeptDevID,
		LeaderEmployeeID: &DevEmployeeAdminID,
	},
	{
		ID:               TeamFrontendID,
		Name:             "Frontend Team",
		Description:      "Frontend web and mobile development",
		DepartmentID:     &DeptDevID,
		LeaderEmployeeID: &DevEmployeeAnnaID,
	},
	// Infrastructure team (under Infrastructure department)
	{
		ID:               TeamDevOpsID,
		Name:             "DevOps Team",
		Description:      "DevOps, CI/CD, and cloud infrastructure",
		DepartmentID:     &DeptInfraID,
		LeaderEmployeeID: nil,
	},
	// HR team (under Human Resources department)
	{
		ID:               TeamHRCoreID,
		Name:             "HR Core Team",
		Description:      "Core HR operations and employee relations",
		DepartmentID:     &DeptHRID,
		LeaderEmployeeID: nil,
	},
	// Finance team (under Finance department)
	{
		ID:               TeamAccountingID,
		Name:             "Accounting Team",
		Description:      "Financial accounting and reporting",
		DepartmentID:     &DeptFinanceID,
		LeaderEmployeeID: nil,
	},
}

// DevTeamMembers contains predefined team memberships for development mode.
var DevTeamMembers = []DevTeamMember{
	// Backend Team members
	{TeamID: TeamBackendID, EmployeeID: DevEmployeeAdminID, Role: "lead"},
	{TeamID: TeamBackendID, EmployeeID: DevEmployeeThomasID, Role: "member"},
	{TeamID: TeamBackendID, EmployeeID: DevEmployeeMariaID, Role: "member"},
	// Frontend Team members
	{TeamID: TeamFrontendID, EmployeeID: DevEmployeeAnnaID, Role: "lead"},
	{TeamID: TeamFrontendID, EmployeeID: DevEmployeeUserID, Role: "member"},
	// DevOps Team members
	{TeamID: TeamDevOpsID, EmployeeID: DevEmployeeThomasID, Role: "member"},
	// HR Core Team members
	{TeamID: TeamHRCoreID, EmployeeID: DevEmployeeMariaID, Role: "deputy"},
	// Accounting Team members
	{TeamID: TeamAccountingID, EmployeeID: DevEmployeeAnnaID, Role: "member"},
}

// GetDevTeams returns all predefined dev teams.
func GetDevTeams() []DevTeam {
	return DevTeams
}

// GetDevTeamMembers returns all predefined dev team members.
func GetDevTeamMembers() []DevTeamMember {
	return DevTeamMembers
}
