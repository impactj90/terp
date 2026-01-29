package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"gorm.io/gorm"
)

// UserRole represents user roles.
type UserRole string

const (
	RoleUser  UserRole = "user"
	RoleAdmin UserRole = "admin"
)

type DataScopeType string

const (
	DataScopeAll        DataScopeType = "all"
	DataScopeTenant     DataScopeType = "tenant"
	DataScopeDepartment DataScopeType = "department"
	DataScopeEmployee   DataScopeType = "employee"
)

// User represents a user in the system.
type User struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    *uuid.UUID     `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
	UserGroupID *uuid.UUID     `gorm:"type:uuid;index" json:"user_group_id,omitempty"`
	EmployeeID  *uuid.UUID     `gorm:"type:uuid" json:"employee_id,omitempty"`
	Email       string         `gorm:"type:varchar(255);not null" json:"email"`
	Username    *string        `gorm:"type:varchar(100)" json:"username,omitempty"`
	DisplayName string         `gorm:"type:varchar(255);not null" json:"display_name"`
	AvatarURL   *string        `gorm:"type:text" json:"avatar_url,omitempty"`
	Role        UserRole       `gorm:"type:varchar(50);not null;default:'user'" json:"role"`
	IsActive    bool           `gorm:"default:true" json:"is_active"`
	PasswordHash *string       `gorm:"type:varchar(255)" json:"-"`
	SSOID        *string       `gorm:"type:varchar(255)" json:"sso_id,omitempty"`
	IsLocked     bool          `gorm:"default:false" json:"is_locked"`
	DataScopeType          DataScopeType  `gorm:"type:varchar(20);not null;default:'all'" json:"data_scope_type"`
	DataScopeTenantIDs     pq.StringArray `gorm:"type:uuid[];default:'{}'" json:"data_scope_tenant_ids,omitempty"`
	DataScopeDepartmentIDs pq.StringArray `gorm:"type:uuid[];default:'{}'" json:"data_scope_department_ids,omitempty"`
	DataScopeEmployeeIDs   pq.StringArray `gorm:"type:uuid[];default:'{}'" json:"data_scope_employee_ids,omitempty"`
	CreatedAt              time.Time      `gorm:"default:now()" json:"created_at"`
	UpdatedAt              time.Time      `gorm:"default:now()" json:"updated_at"`
	DeletedAt              gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`

	// Relations
	Tenant    *Tenant    `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
	UserGroup *UserGroup `gorm:"foreignKey:UserGroupID" json:"user_group,omitempty"`
	Employee  *Employee  `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

// TableName specifies the table name.
func (User) TableName() string {
	return "users"
}

// IsTenantUser returns true if user belongs to a tenant.
func (u *User) IsTenantUser() bool {
	return u.TenantID != nil
}

// IsAdmin returns true if user is in an admin group.
func (u *User) IsAdmin() bool {
	return u.UserGroup != nil && u.UserGroup.IsAdmin
}
