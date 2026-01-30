package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ReportStatus represents the status of a report.
type ReportStatus string

const (
	ReportStatusPending    ReportStatus = "pending"
	ReportStatusGenerating ReportStatus = "generating"
	ReportStatusCompleted  ReportStatus = "completed"
	ReportStatusFailed     ReportStatus = "failed"
)

// ReportType represents the type of report.
type ReportType string

const (
	ReportTypeDailyOverview     ReportType = "daily_overview"
	ReportTypeWeeklyOverview    ReportType = "weekly_overview"
	ReportTypeMonthlyOverview   ReportType = "monthly_overview"
	ReportTypeEmployeeTimesheet ReportType = "employee_timesheet"
	ReportTypeDepartmentSummary ReportType = "department_summary"
	ReportTypeAbsenceReport     ReportType = "absence_report"
	ReportTypeVacationReport    ReportType = "vacation_report"
	ReportTypeOvertimeReport    ReportType = "overtime_report"
	ReportTypeAccountBalances   ReportType = "account_balances"
	ReportTypeCustom            ReportType = "custom"
)

// ReportFormat represents the output format.
type ReportFormat string

const (
	ReportFormatJSON ReportFormat = "json"
	ReportFormatCSV  ReportFormat = "csv"
	ReportFormatXLSX ReportFormat = "xlsx"
	ReportFormatPDF  ReportFormat = "pdf"
)

// Report represents a generated report record.
type Report struct {
	ID           uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID     uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	ReportType   ReportType      `gorm:"type:varchar(30);not null" json:"report_type"`
	Name         string          `gorm:"type:varchar(255)" json:"name,omitempty"`
	Description  *string         `gorm:"type:text" json:"description,omitempty"`
	Status       ReportStatus    `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	Format       ReportFormat    `gorm:"type:varchar(10);not null;default:'xlsx'" json:"format"`
	Parameters   json.RawMessage `gorm:"type:jsonb;default:'{}'" json:"parameters,omitempty"`
	FileContent  []byte          `gorm:"type:bytea" json:"-"` // Not exposed in API
	FileSize     *int            `gorm:"type:int" json:"file_size,omitempty"`
	RowCount     *int            `gorm:"type:int" json:"row_count,omitempty"`
	ErrorMessage *string         `gorm:"type:text" json:"error_message,omitempty"`
	RequestedAt  time.Time       `gorm:"type:timestamptz;default:now()" json:"requested_at"`
	StartedAt    *time.Time      `gorm:"type:timestamptz" json:"started_at,omitempty"`
	CompletedAt  *time.Time      `gorm:"type:timestamptz" json:"completed_at,omitempty"`
	CreatedBy    *uuid.UUID      `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt    time.Time       `gorm:"default:now()" json:"created_at"`
	UpdatedAt    time.Time       `gorm:"default:now()" json:"updated_at"`
}

// TableName returns the database table name.
func (Report) TableName() string {
	return "reports"
}

// IsCompleted returns true if the report is completed.
func (r *Report) IsCompleted() bool {
	return r.Status == ReportStatusCompleted
}

// ReportParameters defines report filter parameters.
type ReportParameters struct {
	FromDate      *string     `json:"from_date,omitempty"`
	ToDate        *string     `json:"to_date,omitempty"`
	EmployeeIDs   []uuid.UUID `json:"employee_ids,omitempty"`
	DepartmentIDs []uuid.UUID `json:"department_ids,omitempty"`
	CostCenterIDs []uuid.UUID `json:"cost_center_ids,omitempty"`
	TeamIDs       []uuid.UUID `json:"team_ids,omitempty"`
}

// IsValidReportStatus checks if a string is a valid report status.
func IsValidReportStatus(s string) bool {
	switch ReportStatus(s) {
	case ReportStatusPending, ReportStatusGenerating,
		ReportStatusCompleted, ReportStatusFailed:
		return true
	}
	return false
}

// IsValidReportType checks if a string is a valid report type.
func IsValidReportType(s string) bool {
	switch ReportType(s) {
	case ReportTypeDailyOverview, ReportTypeWeeklyOverview,
		ReportTypeMonthlyOverview, ReportTypeEmployeeTimesheet,
		ReportTypeDepartmentSummary, ReportTypeAbsenceReport,
		ReportTypeVacationReport, ReportTypeOvertimeReport,
		ReportTypeAccountBalances, ReportTypeCustom:
		return true
	}
	return false
}

// IsValidReportFormat checks if a string is a valid report format.
func IsValidReportFormat(s string) bool {
	switch ReportFormat(s) {
	case ReportFormatJSON, ReportFormatCSV, ReportFormatXLSX, ReportFormatPDF:
		return true
	}
	return false
}
