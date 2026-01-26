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
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID         uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	DepartmentID     *uuid.UUID `gorm:"type:uuid;index" json:"department_id,omitempty"`
	Name             string     `gorm:"type:varchar(255);not null" json:"name"`
	Description      string     `gorm:"type:text" json:"description,omitempty"`
	LeaderEmployeeID *uuid.UUID `gorm:"type:uuid" json:"leader_employee_id,omitempty"`
	IsActive         bool       `gorm:"default:true" json:"is_active"`
	MemberCount      int        `gorm:"-" json:"member_count"` // Computed field, not stored
	CreatedAt        time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt        time.Time  `gorm:"default:now()" json:"updated_at"`

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
