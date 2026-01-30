package model

import (
	"time"

	"github.com/google/uuid"
)

type OrderAssignmentRole string

const (
	OrderAssignmentRoleWorker OrderAssignmentRole = "worker"
	OrderAssignmentRoleLeader OrderAssignmentRole = "leader"
	OrderAssignmentRoleSales  OrderAssignmentRole = "sales"
)

type OrderAssignment struct {
	ID         uuid.UUID           `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID   uuid.UUID           `gorm:"type:uuid;not null;index" json:"tenant_id"`
	OrderID    uuid.UUID           `gorm:"type:uuid;not null;index" json:"order_id"`
	EmployeeID uuid.UUID           `gorm:"type:uuid;not null;index" json:"employee_id"`
	Role       OrderAssignmentRole `gorm:"type:varchar(20);not null;default:'worker'" json:"role"`
	ValidFrom  *time.Time          `gorm:"type:date" json:"valid_from,omitempty"`
	ValidTo    *time.Time          `gorm:"type:date" json:"valid_to,omitempty"`
	IsActive   bool                `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time           `gorm:"default:now()" json:"created_at"`
	UpdatedAt  time.Time           `gorm:"default:now()" json:"updated_at"`

	// Relations
	Order    *Order    `gorm:"foreignKey:OrderID" json:"order,omitempty"`
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (OrderAssignment) TableName() string {
	return "order_assignments"
}
