package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// PayrollExportStatus represents the status of a payroll export.
type PayrollExportStatus string

const (
	PayrollExportStatusPending    PayrollExportStatus = "pending"
	PayrollExportStatusGenerating PayrollExportStatus = "generating"
	PayrollExportStatusCompleted  PayrollExportStatus = "completed"
	PayrollExportStatusFailed     PayrollExportStatus = "failed"
)

// PayrollExportType represents the type of payroll export.
type PayrollExportType string

const (
	PayrollExportTypeStandard PayrollExportType = "standard"
	PayrollExportTypeDATEV    PayrollExportType = "datev"
	PayrollExportTypeSage     PayrollExportType = "sage"
	PayrollExportTypeCustom   PayrollExportType = "custom"
)

// PayrollExportFormat represents the output format.
type PayrollExportFormat string

const (
	PayrollExportFormatCSV  PayrollExportFormat = "csv"
	PayrollExportFormatXLSX PayrollExportFormat = "xlsx"
	PayrollExportFormatXML  PayrollExportFormat = "xml"
	PayrollExportFormatJSON PayrollExportFormat = "json"
)

// PayrollExport represents a generated payroll export record.
type PayrollExport struct {
	ID                uuid.UUID           `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID          uuid.UUID           `gorm:"type:uuid;not null;index" json:"tenant_id"`
	ExportInterfaceID *uuid.UUID          `gorm:"type:uuid;index" json:"export_interface_id,omitempty"`
	Year              int                 `gorm:"type:int;not null" json:"year"`
	Month             int                 `gorm:"type:int;not null" json:"month"`
	Status            PayrollExportStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
	ExportType        PayrollExportType   `gorm:"type:varchar(20);default:'standard'" json:"export_type"`
	Format            PayrollExportFormat `gorm:"type:varchar(10);default:'csv'" json:"format"`
	Parameters        json.RawMessage     `gorm:"type:jsonb;default:'{}'" json:"parameters,omitempty"`
	FileContent       *string             `gorm:"type:text" json:"-"` // Not exposed in API
	FileSize          *int                `gorm:"type:int" json:"file_size,omitempty"`
	RowCount          *int                `gorm:"type:int" json:"row_count,omitempty"`
	EmployeeCount     int                 `gorm:"type:int" json:"employee_count"`
	TotalHours        decimal.Decimal     `gorm:"type:decimal(12,2)" json:"total_hours"`
	TotalOvertime     decimal.Decimal     `gorm:"type:decimal(12,2)" json:"total_overtime"`
	ErrorMessage      *string             `gorm:"type:text" json:"error_message,omitempty"`
	RequestedAt       time.Time           `gorm:"type:timestamptz;default:now()" json:"requested_at"`
	StartedAt         *time.Time          `gorm:"type:timestamptz" json:"started_at,omitempty"`
	CompletedAt       *time.Time          `gorm:"type:timestamptz" json:"completed_at,omitempty"`
	CreatedBy         *uuid.UUID          `gorm:"type:uuid" json:"created_by,omitempty"`
	CreatedAt         time.Time           `gorm:"default:now()" json:"created_at"`
	UpdatedAt         time.Time           `gorm:"default:now()" json:"updated_at"`
}

// TableName returns the database table name.
func (PayrollExport) TableName() string {
	return "payroll_exports"
}

// IsCompleted returns true if the export is completed.
func (pe *PayrollExport) IsCompleted() bool {
	return pe.Status == PayrollExportStatusCompleted
}

// PayrollExportParameters defines export filter parameters.
type PayrollExportParameters struct {
	EmployeeIDs     []uuid.UUID `json:"employee_ids,omitempty"`
	DepartmentIDs   []uuid.UUID `json:"department_ids,omitempty"`
	IncludeAccounts []uuid.UUID `json:"include_accounts,omitempty"`
}

// PayrollExportLine represents a single line in the export data.
type PayrollExportLine struct {
	EmployeeID       uuid.UUID          `json:"employee_id"`
	PersonnelNumber  string             `json:"personnel_number"`
	FirstName        string             `json:"first_name"`
	LastName         string             `json:"last_name"`
	DepartmentCode   string             `json:"department_code"`
	CostCenterCode   string             `json:"cost_center_code"`
	TargetHours      decimal.Decimal    `json:"target_hours"`
	WorkedHours      decimal.Decimal    `json:"worked_hours"`
	OvertimeHours    decimal.Decimal    `json:"overtime_hours"`
	AccountValues    map[string]float64 `json:"account_values"`
	VacationDays     decimal.Decimal    `json:"vacation_days"`
	SickDays         decimal.Decimal    `json:"sick_days"`
	OtherAbsenceDays decimal.Decimal    `json:"other_absence_days"`
}

// IsValidPayrollExportStatus checks if a string is a valid export status.
func IsValidPayrollExportStatus(s string) bool {
	switch PayrollExportStatus(s) {
	case PayrollExportStatusPending, PayrollExportStatusGenerating,
		PayrollExportStatusCompleted, PayrollExportStatusFailed:
		return true
	}
	return false
}

// IsValidPayrollExportFormat checks if a string is a valid export format.
func IsValidPayrollExportFormat(s string) bool {
	switch PayrollExportFormat(s) {
	case PayrollExportFormatCSV, PayrollExportFormatXLSX,
		PayrollExportFormatXML, PayrollExportFormatJSON:
		return true
	}
	return false
}

// IsValidPayrollExportType checks if a string is a valid export type.
func IsValidPayrollExportType(s string) bool {
	switch PayrollExportType(s) {
	case PayrollExportTypeStandard, PayrollExportTypeDATEV,
		PayrollExportTypeSage, PayrollExportTypeCustom:
		return true
	}
	return false
}
