package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// TaskType represents a scheduler task type from the catalog.
type TaskType string

const (
	TaskTypeCalculateDays     TaskType = "calculate_days"
	TaskTypeCalculateMonths   TaskType = "calculate_months"
	TaskTypeBackupDatabase    TaskType = "backup_database"
	TaskTypeSendNotifications TaskType = "send_notifications"
	TaskTypeExportData        TaskType = "export_data"
	TaskTypeAliveCheck        TaskType = "alive_check"
)

// TimingType represents a schedule timing type.
type TimingType string

const (
	TimingTypeSeconds TimingType = "seconds"
	TimingTypeMinutes TimingType = "minutes"
	TimingTypeHours   TimingType = "hours"
	TimingTypeDaily   TimingType = "daily"
	TimingTypeWeekly  TimingType = "weekly"
	TimingTypeMonthly TimingType = "monthly"
	TimingTypeManual  TimingType = "manual"
)

// ExecutionStatus represents the status of an execution.
type ExecutionStatus string

const (
	ExecutionStatusPending   ExecutionStatus = "pending"
	ExecutionStatusRunning   ExecutionStatus = "running"
	ExecutionStatusCompleted ExecutionStatus = "completed"
	ExecutionStatusFailed    ExecutionStatus = "failed"
	ExecutionStatusPartial   ExecutionStatus = "partial"
)

// TaskExecutionStatus represents the status of a task execution.
type TaskExecutionStatus string

const (
	TaskExecutionStatusPending   TaskExecutionStatus = "pending"
	TaskExecutionStatusRunning   TaskExecutionStatus = "running"
	TaskExecutionStatusCompleted TaskExecutionStatus = "completed"
	TaskExecutionStatusFailed    TaskExecutionStatus = "failed"
	TaskExecutionStatusSkipped   TaskExecutionStatus = "skipped"
)

// TriggerType represents how an execution was triggered.
type TriggerType string

const (
	TriggerTypeScheduled TriggerType = "scheduled"
	TriggerTypeManual    TriggerType = "manual"
)

// Schedule represents a schedule definition.
type Schedule struct {
	ID           uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID      `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Name         string         `gorm:"type:varchar(255);not null" json:"name"`
	Description  *string        `gorm:"type:text" json:"description,omitempty"`
	TimingType   TimingType     `gorm:"type:varchar(20);not null" json:"timing_type"`
	TimingConfig datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"timing_config"`
	IsEnabled    bool           `gorm:"default:true" json:"is_enabled"`
	LastRunAt    *time.Time     `gorm:"type:timestamptz" json:"last_run_at,omitempty"`
	NextRunAt    *time.Time     `gorm:"type:timestamptz" json:"next_run_at,omitempty"`
	CreatedAt    time.Time      `gorm:"type:timestamptz;default:now()" json:"created_at"`
	UpdatedAt    time.Time      `gorm:"type:timestamptz;default:now()" json:"updated_at"`

	// Relations
	Tasks []ScheduleTask `gorm:"foreignKey:ScheduleID" json:"tasks,omitempty"`
}

// TableName returns the database table name.
func (Schedule) TableName() string { return "schedules" }

// ScheduleTask represents an ordered task within a schedule.
type ScheduleTask struct {
	ID         uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ScheduleID uuid.UUID      `gorm:"type:uuid;not null;index" json:"schedule_id"`
	TaskType   TaskType       `gorm:"type:varchar(50);not null" json:"task_type"`
	SortOrder  int            `gorm:"not null;default:0" json:"sort_order"`
	Parameters datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"parameters"`
	IsEnabled  bool           `gorm:"default:true" json:"is_enabled"`
	CreatedAt  time.Time      `gorm:"type:timestamptz;default:now()" json:"created_at"`
	UpdatedAt  time.Time      `gorm:"type:timestamptz;default:now()" json:"updated_at"`
}

// TableName returns the database table name.
func (ScheduleTask) TableName() string { return "schedule_tasks" }

// ScheduleExecution represents an execution run of a schedule.
type ScheduleExecution struct {
	ID             uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID       uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	ScheduleID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"schedule_id"`
	Status         ExecutionStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	TriggerType    TriggerType     `gorm:"type:varchar(20);not null;default:'scheduled'" json:"trigger_type"`
	TriggeredBy    *uuid.UUID      `gorm:"type:uuid" json:"triggered_by,omitempty"`
	StartedAt      *time.Time      `gorm:"type:timestamptz" json:"started_at,omitempty"`
	CompletedAt    *time.Time      `gorm:"type:timestamptz" json:"completed_at,omitempty"`
	ErrorMessage   *string         `gorm:"type:text" json:"error_message,omitempty"`
	TasksTotal     int             `gorm:"default:0" json:"tasks_total"`
	TasksSucceeded int             `gorm:"default:0" json:"tasks_succeeded"`
	TasksFailed    int             `gorm:"default:0" json:"tasks_failed"`
	CreatedAt      time.Time       `gorm:"type:timestamptz;default:now()" json:"created_at"`

	// Relations
	TaskExecutions []ScheduleTaskExecution `gorm:"foreignKey:ExecutionID" json:"task_executions,omitempty"`
	Schedule       *Schedule               `gorm:"foreignKey:ScheduleID" json:"schedule,omitempty"`
}

// TableName returns the database table name.
func (ScheduleExecution) TableName() string { return "schedule_executions" }

// ScheduleTaskExecution represents a single task execution within a schedule execution.
type ScheduleTaskExecution struct {
	ID           uuid.UUID           `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ExecutionID  uuid.UUID           `gorm:"type:uuid;not null;index" json:"execution_id"`
	TaskType     TaskType            `gorm:"type:varchar(50);not null" json:"task_type"`
	SortOrder    int                 `gorm:"not null;default:0" json:"sort_order"`
	Status       TaskExecutionStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	StartedAt    *time.Time          `gorm:"type:timestamptz" json:"started_at,omitempty"`
	CompletedAt  *time.Time          `gorm:"type:timestamptz" json:"completed_at,omitempty"`
	ErrorMessage *string             `gorm:"type:text" json:"error_message,omitempty"`
	Result       datatypes.JSON      `gorm:"type:jsonb;default:'{}'" json:"result"`
	CreatedAt    time.Time           `gorm:"type:timestamptz;default:now()" json:"created_at"`
}

// TableName returns the database table name.
func (ScheduleTaskExecution) TableName() string { return "schedule_task_executions" }
