package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrPayrollExportNotFound       = errors.New("payroll export not found")
	ErrPayrollExportYearRequired   = errors.New("year is required")
	ErrPayrollExportMonthInvalid   = errors.New("month must be between 1 and 12")
	ErrPayrollExportFormatInvalid  = errors.New("format must be csv, xlsx, xml, or json")
	ErrPayrollExportNotReady       = errors.New("export is not ready (still generating or not started)")
	ErrPayrollExportFailed         = errors.New("export generation failed")
	ErrPayrollExportMonthNotClosed = errors.New("month is not closed for all employees in scope")
)

// payrollExportRepository defines the interface for payroll export data access.
type payrollExportRepository interface {
	Create(ctx context.Context, pe *model.PayrollExport) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error)
	Update(ctx context.Context, pe *model.PayrollExport) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, filter repository.PayrollExportFilter) ([]model.PayrollExport, error)
}

// payrollMonthlyValueRepository defines the interface for monthly value queries used in payroll export.
type payrollMonthlyValueRepository interface {
	GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
}

// payrollEmployeeRepository defines the interface for employee queries used in payroll export.
type payrollEmployeeRepository interface {
	List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

// payrollAccountRepository defines the interface for account queries used in payroll export.
type payrollAccountRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Account, error)
}

// payrollExportInterfaceRepository defines the interface for export interface queries.
type payrollExportInterfaceRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error)
	ListAccounts(ctx context.Context, interfaceID uuid.UUID) ([]model.ExportInterfaceAccount, error)
}

// GeneratePayrollExportInput represents the input for generating a payroll export.
type GeneratePayrollExportInput struct {
	TenantID          uuid.UUID
	Year              int
	Month             int
	ExportType        string
	Format            string
	ExportInterfaceID *uuid.UUID
	EmployeeIDs       []uuid.UUID
	DepartmentIDs     []uuid.UUID
	IncludeAccounts   []uuid.UUID
	CreatedBy         *uuid.UUID
}

// PayrollExportListFilter represents filter criteria for listing exports.
type PayrollExportListFilter struct {
	TenantID uuid.UUID
	Year     *int
	Month    *int
	Status   *string
	Limit    int
	Cursor   *uuid.UUID
}

// PayrollExportService handles business logic for payroll exports.
type PayrollExportService struct {
	repo          payrollExportRepository
	monthlyRepo   payrollMonthlyValueRepository
	employeeRepo  payrollEmployeeRepository
	accountRepo   payrollAccountRepository
	interfaceRepo payrollExportInterfaceRepository
}

// NewPayrollExportService creates a new PayrollExportService.
func NewPayrollExportService(
	repo payrollExportRepository,
	monthlyRepo payrollMonthlyValueRepository,
	employeeRepo payrollEmployeeRepository,
	accountRepo payrollAccountRepository,
	interfaceRepo payrollExportInterfaceRepository,
) *PayrollExportService {
	return &PayrollExportService{
		repo:          repo,
		monthlyRepo:   monthlyRepo,
		employeeRepo:  employeeRepo,
		accountRepo:   accountRepo,
		interfaceRepo: interfaceRepo,
	}
}

// Generate creates and generates a payroll export synchronously.
func (s *PayrollExportService) Generate(ctx context.Context, input GeneratePayrollExportInput) (*model.PayrollExport, error) {
	// Validate
	if input.Year <= 0 {
		return nil, ErrPayrollExportYearRequired
	}
	if input.Month < 1 || input.Month > 12 {
		return nil, ErrPayrollExportMonthInvalid
	}

	format := strings.TrimSpace(input.Format)
	if format == "" {
		format = "csv"
	}
	if !model.IsValidPayrollExportFormat(format) {
		return nil, ErrPayrollExportFormatInvalid
	}

	exportType := strings.TrimSpace(input.ExportType)
	if exportType == "" {
		exportType = "standard"
	}

	// Serialize parameters
	params := model.PayrollExportParameters{
		EmployeeIDs:     input.EmployeeIDs,
		DepartmentIDs:   input.DepartmentIDs,
		IncludeAccounts: input.IncludeAccounts,
	}
	paramsJSON, _ := json.Marshal(params)

	// Create export record in pending state
	pe := &model.PayrollExport{
		TenantID:          input.TenantID,
		ExportInterfaceID: input.ExportInterfaceID,
		Year:              input.Year,
		Month:             input.Month,
		Status:            model.PayrollExportStatusPending,
		ExportType:        model.PayrollExportType(exportType),
		Format:            model.PayrollExportFormat(format),
		Parameters:        paramsJSON,
		RequestedAt:       time.Now(),
		CreatedBy:         input.CreatedBy,
	}

	if err := s.repo.Create(ctx, pe); err != nil {
		return nil, fmt.Errorf("failed to create payroll export: %w", err)
	}

	// Generate synchronously (for now; in production would be async)
	if err := s.generateExportData(ctx, pe, input); err != nil {
		now := time.Now()
		errMsg := err.Error()
		pe.Status = model.PayrollExportStatusFailed
		pe.ErrorMessage = &errMsg
		pe.CompletedAt = &now
		_ = s.repo.Update(ctx, pe)
		return pe, nil // Return the export record even on failure (202 pattern)
	}

	return pe, nil
}

// generateExportData performs the actual data gathering and CSV generation.
func (s *PayrollExportService) generateExportData(ctx context.Context, pe *model.PayrollExport, input GeneratePayrollExportInput) error {
	now := time.Now()
	pe.Status = model.PayrollExportStatusGenerating
	pe.StartedAt = &now
	_ = s.repo.Update(ctx, pe)

	// Get employees in scope
	active := true
	filter := repository.EmployeeFilter{
		TenantID: input.TenantID,
		IsActive: &active,
		Limit:    10000,
	}
	if len(input.DepartmentIDs) > 0 {
		filter.DepartmentID = &input.DepartmentIDs[0] // Simplified: first department
	}
	employees, _, err := s.employeeRepo.List(ctx, filter)
	if err != nil {
		return fmt.Errorf("failed to list employees: %w", err)
	}

	// Filter by specific employee IDs if provided
	if len(input.EmployeeIDs) > 0 {
		idSet := make(map[uuid.UUID]bool, len(input.EmployeeIDs))
		for _, id := range input.EmployeeIDs {
			idSet[id] = true
		}
		var filtered []model.Employee
		for _, emp := range employees {
			if idSet[emp.ID] {
				filtered = append(filtered, emp)
			}
		}
		employees = filtered
	}

	// Determine which accounts to include
	accountIDs := input.IncludeAccounts
	if len(accountIDs) == 0 && input.ExportInterfaceID != nil {
		// Use accounts from the export interface
		ifaceAccounts, err := s.interfaceRepo.ListAccounts(ctx, *input.ExportInterfaceID)
		if err == nil {
			for _, ia := range ifaceAccounts {
				accountIDs = append(accountIDs, ia.AccountID)
			}
		}
	}

	// Build account code map
	accountCodeMap := make(map[uuid.UUID]string)
	for _, aid := range accountIDs {
		acct, err := s.accountRepo.GetByID(ctx, aid)
		if err == nil {
			accountCodeMap[aid] = acct.Code
		}
	}

	// Generate export lines
	lines := make([]model.PayrollExportLine, 0, len(employees))
	totalTarget := decimal.Zero
	totalWorked := decimal.Zero
	totalOT := decimal.Zero
	unclosedCount := 0

	for _, emp := range employees {
		mv, err := s.monthlyRepo.GetByEmployeeMonth(ctx, emp.ID, input.Year, input.Month)
		if err != nil || mv == nil {
			continue // Skip employees without monthly values
		}

		if !mv.IsClosed {
			unclosedCount++
		}

		targetHours := decimal.NewFromInt(int64(mv.TotalTargetTime)).Div(decimal.NewFromInt(60))
		workedHours := decimal.NewFromInt(int64(mv.TotalNetTime)).Div(decimal.NewFromInt(60))
		overtimeHours := decimal.NewFromInt(int64(mv.TotalOvertime)).Div(decimal.NewFromInt(60))

		totalTarget = totalTarget.Add(targetHours)
		totalWorked = totalWorked.Add(workedHours)
		totalOT = totalOT.Add(overtimeHours)

		line := model.PayrollExportLine{
			EmployeeID:       emp.ID,
			PersonnelNumber:  emp.PersonnelNumber,
			FirstName:        emp.FirstName,
			LastName:         emp.LastName,
			TargetHours:      targetHours,
			WorkedHours:      workedHours,
			OvertimeHours:    overtimeHours,
			AccountValues:    make(map[string]float64),
			VacationDays:     mv.VacationTaken,
			SickDays:         decimal.NewFromInt(int64(mv.SickDays)),
			OtherAbsenceDays: decimal.NewFromInt(int64(mv.OtherAbsenceDays)),
		}

		if emp.Department != nil {
			line.DepartmentCode = emp.Department.Code
		}
		if emp.CostCenter != nil {
			line.CostCenterCode = emp.CostCenter.Code
		}

		lines = append(lines, line)
	}

	// Generate CSV content
	csvContent, err := generateCSV(lines, accountCodeMap)
	if err != nil {
		return fmt.Errorf("failed to generate CSV: %w", err)
	}

	// Update export record
	completedAt := time.Now()
	rowCount := len(lines)
	fileSize := len(csvContent)
	pe.Status = model.PayrollExportStatusCompleted
	pe.FileContent = &csvContent
	pe.FileSize = &fileSize
	pe.RowCount = &rowCount
	pe.EmployeeCount = len(lines)
	pe.TotalHours = totalWorked
	pe.TotalOvertime = totalOT
	pe.CompletedAt = &completedAt

	return s.repo.Update(ctx, pe)
}

// generateCSV builds a CSV string from export lines.
func generateCSV(lines []model.PayrollExportLine, accountCodes map[uuid.UUID]string) (string, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Comma = ';'

	// Header row
	header := []string{
		"PersonnelNumber", "FirstName", "LastName",
		"DepartmentCode", "CostCenterCode",
		"TargetHours", "WorkedHours", "OvertimeHours",
		"VacationDays", "SickDays", "OtherAbsenceDays",
	}
	// Add account code columns
	accountCodeList := make([]string, 0, len(accountCodes))
	for _, code := range accountCodes {
		accountCodeList = append(accountCodeList, code)
		header = append(header, "Account_"+code)
	}
	if err := w.Write(header); err != nil {
		return "", err
	}

	// Data rows
	for _, line := range lines {
		record := []string{
			line.PersonnelNumber,
			line.FirstName,
			line.LastName,
			line.DepartmentCode,
			line.CostCenterCode,
			line.TargetHours.StringFixed(2),
			line.WorkedHours.StringFixed(2),
			line.OvertimeHours.StringFixed(2),
			line.VacationDays.StringFixed(2),
			line.SickDays.StringFixed(2),
			line.OtherAbsenceDays.StringFixed(2),
		}
		// Add account values
		for _, code := range accountCodeList {
			val := line.AccountValues[code]
			record = append(record, decimal.NewFromFloat(val).StringFixed(2))
		}
		if err := w.Write(record); err != nil {
			return "", err
		}
	}

	w.Flush()
	return buf.String(), w.Error()
}

// GetByID retrieves a payroll export by ID.
func (s *PayrollExportService) GetByID(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error) {
	pe, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrPayrollExportNotFound
	}
	return pe, nil
}

// List retrieves payroll exports with filters.
func (s *PayrollExportService) List(ctx context.Context, filter PayrollExportListFilter) ([]model.PayrollExport, bool, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	repoFilter := repository.PayrollExportFilter{
		TenantID: filter.TenantID,
		Year:     filter.Year,
		Month:    filter.Month,
		Status:   filter.Status,
		Limit:    limit,
		Cursor:   filter.Cursor,
	}

	exports, err := s.repo.List(ctx, repoFilter)
	if err != nil {
		return nil, false, err
	}

	hasMore := len(exports) > limit
	if hasMore {
		exports = exports[:limit]
	}

	return exports, hasMore, nil
}

// Delete deletes a payroll export.
func (s *PayrollExportService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrPayrollExportNotFound
	}

	return s.repo.Delete(ctx, id)
}

// GetPreviewData returns the export data as structured lines for preview.
func (s *PayrollExportService) GetPreviewData(ctx context.Context, id uuid.UUID) ([]model.PayrollExportLine, *model.PayrollExport, error) {
	pe, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, nil, ErrPayrollExportNotFound
	}

	if pe.Status != model.PayrollExportStatusCompleted {
		return nil, nil, ErrPayrollExportNotReady
	}

	// Re-generate lines for preview (without file generation)
	var params model.PayrollExportParameters
	if len(pe.Parameters) > 0 {
		_ = json.Unmarshal(pe.Parameters, &params)
	}

	// Get employees
	active := true
	filter := repository.EmployeeFilter{
		TenantID: pe.TenantID,
		IsActive: &active,
		Limit:    10000,
	}
	employees, _, err := s.employeeRepo.List(ctx, filter)
	if err != nil {
		return nil, pe, fmt.Errorf("failed to list employees: %w", err)
	}

	// Filter employees if specific IDs given
	if len(params.EmployeeIDs) > 0 {
		idSet := make(map[uuid.UUID]bool)
		for _, id := range params.EmployeeIDs {
			idSet[id] = true
		}
		var filtered []model.Employee
		for _, emp := range employees {
			if idSet[emp.ID] {
				filtered = append(filtered, emp)
			}
		}
		employees = filtered
	}

	lines := make([]model.PayrollExportLine, 0, len(employees))
	for _, emp := range employees {
		mv, err := s.monthlyRepo.GetByEmployeeMonth(ctx, emp.ID, pe.Year, pe.Month)
		if err != nil || mv == nil {
			continue
		}

		targetHours := decimal.NewFromInt(int64(mv.TotalTargetTime)).Div(decimal.NewFromInt(60))
		workedHours := decimal.NewFromInt(int64(mv.TotalNetTime)).Div(decimal.NewFromInt(60))
		overtimeHours := decimal.NewFromInt(int64(mv.TotalOvertime)).Div(decimal.NewFromInt(60))

		line := model.PayrollExportLine{
			EmployeeID:       emp.ID,
			PersonnelNumber:  emp.PersonnelNumber,
			FirstName:        emp.FirstName,
			LastName:         emp.LastName,
			TargetHours:      targetHours,
			WorkedHours:      workedHours,
			OvertimeHours:    overtimeHours,
			AccountValues:    make(map[string]float64),
			VacationDays:     mv.VacationTaken,
			SickDays:         decimal.NewFromInt(int64(mv.SickDays)),
			OtherAbsenceDays: decimal.NewFromInt(int64(mv.OtherAbsenceDays)),
		}

		lines = append(lines, line)
	}

	return lines, pe, nil
}

// GetDownloadContent returns the file content and metadata for download.
func (s *PayrollExportService) GetDownloadContent(ctx context.Context, id uuid.UUID) (string, string, string, error) {
	pe, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return "", "", "", ErrPayrollExportNotFound
	}

	if pe.Status != model.PayrollExportStatusCompleted {
		return "", "", "", ErrPayrollExportNotReady
	}

	if pe.FileContent == nil {
		return "", "", "", ErrPayrollExportNotReady
	}

	// Determine content type and filename
	contentType := "text/csv"
	ext := "csv"
	switch pe.Format {
	case model.PayrollExportFormatXLSX:
		contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		ext = "xlsx"
	case model.PayrollExportFormatXML:
		contentType = "application/xml"
		ext = "xml"
	case model.PayrollExportFormatJSON:
		contentType = "application/json"
		ext = "json"
	}

	filename := fmt.Sprintf("payroll_export_%d_%02d.%s", pe.Year, pe.Month, ext)

	return *pe.FileContent, contentType, filename, nil
}
