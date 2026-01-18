# TICKET-026: Create Team Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 4 - Organization Structure
**Dependencies**: TICKET-025

## Description

Create Team and TeamMember models with repository.

## Files to Create

- `apps/api/internal/model/team.go`
- `apps/api/internal/repository/team.go`

## Implementation

### Models

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type TeamMemberRole string

const (
    TeamMemberRoleMember TeamMemberRole = "member"
    TeamMemberRoleLead   TeamMemberRole = "lead"
    TeamMemberRoleDeputy TeamMemberRole = "deputy"
)

type Team struct {
    ID               uuid.UUID    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID         uuid.UUID    `gorm:"type:uuid;not null;index" json:"tenant_id"`
    DepartmentID     *uuid.UUID   `gorm:"type:uuid;index" json:"department_id,omitempty"`
    Name             string       `gorm:"type:varchar(255);not null" json:"name"`
    Description      string       `gorm:"type:text" json:"description,omitempty"`
    LeaderEmployeeID *uuid.UUID   `gorm:"type:uuid" json:"leader_employee_id,omitempty"`
    IsActive         bool         `gorm:"default:true" json:"is_active"`
    CreatedAt        time.Time    `gorm:"default:now()" json:"created_at"`
    UpdatedAt        time.Time    `gorm:"default:now()" json:"updated_at"`

    // Relations
    Department *Department  `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`
    Leader     *Employee    `gorm:"foreignKey:LeaderEmployeeID" json:"leader,omitempty"`
    Members    []TeamMember `gorm:"foreignKey:TeamID" json:"members,omitempty"`
}

func (Team) TableName() string {
    return "teams"
}

type TeamMember struct {
    TeamID     uuid.UUID      `gorm:"type:uuid;primaryKey" json:"team_id"`
    EmployeeID uuid.UUID      `gorm:"type:uuid;primaryKey" json:"employee_id"`
    JoinedAt   time.Time      `gorm:"default:now()" json:"joined_at"`
    Role       TeamMemberRole `gorm:"type:varchar(50);default:'member'" json:"role"`

    // Relations
    Team     *Team     `gorm:"foreignKey:TeamID" json:"team,omitempty"`
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (TeamMember) TableName() string {
    return "team_members"
}
```

### Repository

```go
type TeamRepository interface {
    Create(ctx context.Context, team *model.Team) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Team, error)
    Update(ctx context.Context, team *model.Team) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error)
    ListByDepartment(ctx context.Context, departmentID uuid.UUID) ([]model.Team, error)
    GetWithMembers(ctx context.Context, id uuid.UUID) (*model.Team, error)
    AddMember(ctx context.Context, teamID, employeeID uuid.UUID, role TeamMemberRole) error
    RemoveMember(ctx context.Context, teamID, employeeID uuid.UUID) error
    GetMemberTeams(ctx context.Context, employeeID uuid.UUID) ([]model.Team, error)
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] TeamMemberRole enum defined
- [x] AddMember/RemoveMember work correctly
- [x] GetMemberTeams returns all teams for an employee
