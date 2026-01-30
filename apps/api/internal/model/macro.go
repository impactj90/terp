package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// MacroType represents the type of macro (weekly or monthly).
type MacroType string

const (
	MacroTypeWeekly  MacroType = "weekly"
	MacroTypeMonthly MacroType = "monthly"
)

// MacroActionType represents the predefined action a macro performs.
type MacroActionType string

const (
	MacroActionLogMessage             MacroActionType = "log_message"
	MacroActionRecalculateTargetHours MacroActionType = "recalculate_target_hours"
	MacroActionResetFlextime          MacroActionType = "reset_flextime"
	MacroActionCarryForwardBalance    MacroActionType = "carry_forward_balance"
)

// MacroExecutionStatus represents the status of a macro execution.
type MacroExecutionStatus string

const (
	MacroExecutionStatusPending   MacroExecutionStatus = "pending"
	MacroExecutionStatusRunning   MacroExecutionStatus = "running"
	MacroExecutionStatusCompleted MacroExecutionStatus = "completed"
	MacroExecutionStatusFailed    MacroExecutionStatus = "failed"
)

// MacroTriggerType represents how a macro execution was triggered.
type MacroTriggerType string

const (
	MacroTriggerTypeScheduled MacroTriggerType = "scheduled"
	MacroTriggerTypeManual    MacroTriggerType = "manual"
)

// Macro represents a macro definition.
type Macro struct {
	ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Name         string          `gorm:"type:varchar(255);not null" json:"name"`
	Description  *string         `gorm:"type:text" json:"description,omitempty"`
	MacroType    MacroType       `gorm:"type:varchar(10);not null" json:"macro_type"`
	ActionType   MacroActionType `gorm:"type:varchar(50);not null" json:"action_type"`
	ActionParams datatypes.JSON  `gorm:"type:jsonb;default:'{}'" json:"action_params"`
	IsActive     bool            `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time       `gorm:"default:now()" json:"updated_at"`

	// Relations
	Assignments []MacroAssignment `gorm:"foreignKey:MacroID" json:"assignments,omitempty"`
}

func (Macro) TableName() string {
	return "macros"
}

// MacroAssignment links a macro to a tariff or employee with execution day.
type MacroAssignment struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	MacroID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"macro_id"`
	TariffID     *uuid.UUID `gorm:"type:uuid;index" json:"tariff_id,omitempty"`
	EmployeeID   *uuid.UUID `gorm:"type:uuid;index" json:"employee_id,omitempty"`
	ExecutionDay int        `gorm:"not null" json:"execution_day"`
	IsActive     bool       `gorm:"default:true" json:"is_active"`
	CreatedAt    time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	Macro    *Macro    `gorm:"foreignKey:MacroID" json:"macro,omitempty"`
	Tariff   *Tariff   `gorm:"foreignKey:TariffID" json:"tariff,omitempty"`
	Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (MacroAssignment) TableName() string {
	return "macro_assignments"
}

// MacroExecution records a macro execution run.
type MacroExecution struct {
	ID           uuid.UUID            `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID            `gorm:"type:uuid;not null;index" json:"tenant_id"`
	MacroID      uuid.UUID            `gorm:"type:uuid;not null;index" json:"macro_id"`
	AssignmentID *uuid.UUID           `gorm:"type:uuid" json:"assignment_id,omitempty"`
	Status       MacroExecutionStatus `gorm:"type:varchar(20);not null;default:pending" json:"status"`
	TriggerType  MacroTriggerType     `gorm:"type:varchar(20);not null;default:scheduled" json:"trigger_type"`
	TriggeredBy  *uuid.UUID           `gorm:"type:uuid" json:"triggered_by,omitempty"`
	StartedAt    *time.Time           `json:"started_at,omitempty"`
	CompletedAt  *time.Time           `json:"completed_at,omitempty"`
	Result       datatypes.JSON       `gorm:"type:jsonb;default:'{}'" json:"result"`
	ErrorMessage *string              `gorm:"type:text" json:"error_message,omitempty"`
	CreatedAt    time.Time            `gorm:"default:now()" json:"created_at"`

	// Relations
	Macro      *Macro           `gorm:"foreignKey:MacroID" json:"macro,omitempty"`
	Assignment *MacroAssignment `gorm:"foreignKey:AssignmentID" json:"assignment,omitempty"`
}

func (MacroExecution) TableName() string {
	return "macro_executions"
}
