# TICKET-019: Update User Model for Multi-Tenancy

**Type**: Model
**Effort**: S
**Sprint**: 3 - User Groups & Permissions
**Dependencies**: TICKET-018

## Description

Update the existing User model to include multi-tenancy fields.

## Files to Modify

- `apps/api/internal/model/user.go`

## Implementation

Add/update fields in User struct:

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"
)

type User struct {
    ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    *uuid.UUID     `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
    UserGroupID *uuid.UUID     `gorm:"type:uuid;index" json:"user_group_id,omitempty"`
    EmployeeID  *uuid.UUID     `gorm:"type:uuid" json:"employee_id,omitempty"`
    Email       string         `gorm:"type:varchar(255);not null" json:"email"`
    Username    *string        `gorm:"type:varchar(100)" json:"username,omitempty"`
    Password    string         `gorm:"type:varchar(255);not null" json:"-"`
    IsActive    bool           `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time      `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time      `gorm:"default:now()" json:"updated_at"`
    DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`

    // Relations
    Tenant    *Tenant    `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
    UserGroup *UserGroup `gorm:"foreignKey:UserGroupID" json:"user_group,omitempty"`
    Employee  *Employee  `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (User) TableName() string {
    return "users"
}

// IsTenantUser returns true if user belongs to a tenant
func (u *User) IsTenantUser() bool {
    return u.TenantID != nil
}

// IsAdmin returns true if user is in an admin group
func (u *User) IsAdmin() bool {
    return u.UserGroup != nil && u.UserGroup.IsAdmin
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] Soft delete via gorm.DeletedAt
- [x] Nullable fields are pointers
- [x] Relations defined correctly
