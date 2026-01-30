package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/xuri/excelize/v2"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrReportNotFound        = errors.New("report not found")
	ErrReportTypeRequired    = errors.New("report type is required")
	ErrReportTypeInvalid     = errors.New("invalid report type")
	ErrReportFormatRequired  = errors.New("report format is required")
	ErrReportFormatInvalid   = errors.New("invalid report format")
	ErrReportDateRangeNeeded = errors.New("from_date and to_date are required for this report type")
	ErrReportNotReady        = errors.New("report is not ready (still generating or not started)")
)

// --- Repository interfaces (private, following existing pattern) ---

type reportRepository interface {
	Create(ctx context.Context, r *model.Report) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Report, error)
	Update(ctx context.Context, r *model.Report) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, filter repository.ReportFilter) ([]model.Report, error)
}

type reportEmployeeRepository interface {
	List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

type reportDailyValueRepository interface {
	ListAll(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error)
}

type reportMonthlyValueRepository interface {
	GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error)
}

type reportAbsenceDayRepository interface {
	ListAll(ctx context.Context, tenantID uuid.UUID, opts model.AbsenceListOptions) ([]model.AbsenceDay, error)
}

type reportVacationBalanceRepository interface {
	GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
}

type reportTeamRepository interface {
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error)
	GetMembers(ctx context.Context, teamID uuid.UUID) ([]model.TeamMember, error)
}

// --- Input/Filter structs ---

// GenerateReportInput represents the input for generating a report.
type GenerateReportInput struct {
	TenantID      uuid.UUID
	ReportType    string
	Format        string
	Name          string
	FromDate      *string
	ToDate        *string
	EmployeeIDs   []uuid.UUID
	DepartmentIDs []uuid.UUID
	CostCenterIDs []uuid.UUID
	TeamIDs       []uuid.UUID
	CreatedBy     *uuid.UUID
}

// ReportListFilter represents filter criteria for listing reports.
type ReportListFilter struct {
	TenantID   uuid.UUID
	ReportType *string
	Status     *string
	Limit      int
	Cursor     *uuid.UUID
}

// reportRow is an internal type for tabular report data.
type reportRow struct {
	headers []string
	values  [][]string
}

// --- Service ---

// ReportService handles report generation business logic.
type ReportService struct {
	repo         reportRepository
	employeeRepo reportEmployeeRepository
	dailyRepo    reportDailyValueRepository
	monthlyRepo  reportMonthlyValueRepository
	absenceRepo  reportAbsenceDayRepository
	vacationRepo reportVacationBalanceRepository
	teamRepo     reportTeamRepository
}

// NewReportService creates a new ReportService.
func NewReportService(
	repo reportRepository,
	employeeRepo reportEmployeeRepository,
	dailyRepo reportDailyValueRepository,
	monthlyRepo reportMonthlyValueRepository,
	absenceRepo reportAbsenceDayRepository,
	vacationRepo reportVacationBalanceRepository,
	teamRepo reportTeamRepository,
) *ReportService {
	return &ReportService{
		repo:         repo,
		employeeRepo: employeeRepo,
		dailyRepo:    dailyRepo,
		monthlyRepo:  monthlyRepo,
		absenceRepo:  absenceRepo,
		vacationRepo: vacationRepo,
		teamRepo:     teamRepo,
	}
}

// Generate creates and generates a report synchronously.
func (s *ReportService) Generate(ctx context.Context, input GenerateReportInput) (*model.Report, error) {
	// Validate
	reportType := strings.TrimSpace(input.ReportType)
	if reportType == "" {
		return nil, ErrReportTypeRequired
	}
	if !model.IsValidReportType(reportType) {
		return nil, ErrReportTypeInvalid
	}

	format := strings.TrimSpace(input.Format)
	if format == "" {
		return nil, ErrReportFormatRequired
	}
	if !model.IsValidReportFormat(format) {
		return nil, ErrReportFormatInvalid
	}

	// Check date range for types that need it
	if requiresDateRange(reportType) {
		if input.FromDate == nil || input.ToDate == nil || *input.FromDate == "" || *input.ToDate == "" {
			return nil, ErrReportDateRangeNeeded
		}
	}

	// Serialize parameters
	params := model.ReportParameters{
		FromDate:      input.FromDate,
		ToDate:        input.ToDate,
		EmployeeIDs:   input.EmployeeIDs,
		DepartmentIDs: input.DepartmentIDs,
		CostCenterIDs: input.CostCenterIDs,
		TeamIDs:       input.TeamIDs,
	}
	paramsJSON, _ := json.Marshal(params)

	name := input.Name
	if name == "" {
		name = formatReportName(reportType)
	}

	// Create report record in pending state
	report := &model.Report{
		TenantID:    input.TenantID,
		ReportType:  model.ReportType(reportType),
		Name:        name,
		Status:      model.ReportStatusPending,
		Format:      model.ReportFormat(format),
		Parameters:  paramsJSON,
		RequestedAt: time.Now(),
		CreatedBy:   input.CreatedBy,
	}

	if err := s.repo.Create(ctx, report); err != nil {
		return nil, fmt.Errorf("failed to create report: %w", err)
	}

	// Generate synchronously
	if err := s.generateReportData(ctx, report, params); err != nil {
		now := time.Now()
		errMsg := err.Error()
		report.Status = model.ReportStatusFailed
		report.ErrorMessage = &errMsg
		report.CompletedAt = &now
		_ = s.repo.Update(ctx, report)
		return report, nil // Return record even on failure (202 pattern)
	}

	return report, nil
}

// GetByID retrieves a report by ID.
func (s *ReportService) GetByID(ctx context.Context, id uuid.UUID) (*model.Report, error) {
	report, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrReportNotFound
	}
	return report, nil
}

// List retrieves reports with filters.
func (s *ReportService) List(ctx context.Context, filter ReportListFilter) ([]model.Report, bool, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	repoFilter := repository.ReportFilter{
		TenantID:   filter.TenantID,
		ReportType: filter.ReportType,
		Status:     filter.Status,
		Limit:      limit,
		Cursor:     filter.Cursor,
	}

	reports, err := s.repo.List(ctx, repoFilter)
	if err != nil {
		return nil, false, err
	}

	hasMore := len(reports) > limit
	if hasMore {
		reports = reports[:limit]
	}

	return reports, hasMore, nil
}

// Delete deletes a report.
func (s *ReportService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrReportNotFound
	}

	return s.repo.Delete(ctx, id)
}

// GetDownloadContent returns the file content and metadata for download.
func (s *ReportService) GetDownloadContent(ctx context.Context, id uuid.UUID) ([]byte, string, string, error) {
	report, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, "", "", ErrReportNotFound
	}

	if report.Status != model.ReportStatusCompleted {
		return nil, "", "", ErrReportNotReady
	}

	if report.FileContent == nil {
		return nil, "", "", ErrReportNotReady
	}

	// Determine content type and filename
	contentType := "text/csv"
	ext := "csv"
	switch report.Format {
	case model.ReportFormatXLSX:
		contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
		ext = "xlsx"
	case model.ReportFormatPDF:
		contentType = "application/pdf"
		ext = "pdf"
	case model.ReportFormatJSON:
		contentType = "application/json"
		ext = "json"
	}

	filename := fmt.Sprintf("report_%s.%s", report.ID.String()[:8], ext)

	return report.FileContent, contentType, filename, nil
}

// --- Internal generation logic ---

func (s *ReportService) generateReportData(ctx context.Context, report *model.Report, params model.ReportParameters) error {
	now := time.Now()
	report.Status = model.ReportStatusGenerating
	report.StartedAt = &now
	_ = s.repo.Update(ctx, report)

	// Get employees in scope
	employees, err := s.getEmployeesInScope(ctx, report.TenantID, params)
	if err != nil {
		return fmt.Errorf("failed to get employees in scope: %w", err)
	}

	// Gather data based on report type
	var data reportRow
	switch report.ReportType {
	case model.ReportTypeMonthlyOverview:
		data, err = s.gatherMonthlyOverview(ctx, params, employees)
	case model.ReportTypeDailyOverview:
		data, err = s.gatherDailyOverview(ctx, params, report.TenantID)
	case model.ReportTypeAbsenceReport:
		data, err = s.gatherAbsenceReport(ctx, params, report.TenantID)
	case model.ReportTypeVacationReport:
		data, err = s.gatherVacationReport(ctx, params, employees)
	case model.ReportTypeOvertimeReport:
		data, err = s.gatherOvertimeReport(ctx, params, employees)
	case model.ReportTypeEmployeeTimesheet:
		data, err = s.gatherEmployeeTimesheet(ctx, params, report.TenantID)
	case model.ReportTypeDepartmentSummary:
		data, err = s.gatherDepartmentSummary(ctx, params, employees)
	case model.ReportTypeAccountBalances:
		data, err = s.gatherAccountBalances(ctx, params, employees)
	case model.ReportTypeWeeklyOverview:
		data, err = s.gatherWeeklyOverview(ctx, params, report.TenantID)
	case model.ReportTypeCustom:
		data = reportRow{
			headers: []string{"Info"},
			values:  [][]string{{"Custom report - no data"}},
		}
	default:
		return fmt.Errorf("unsupported report type: %s", report.ReportType)
	}

	if err != nil {
		return fmt.Errorf("failed to gather report data: %w", err)
	}

	// Generate file content based on format
	var content []byte
	switch report.Format {
	case model.ReportFormatCSV:
		content, err = generateReportCSV(data)
	case model.ReportFormatXLSX:
		content, err = generateReportXLSX(data, report.Name)
	case model.ReportFormatPDF:
		content, err = generateReportPDF(data, report.Name)
	case model.ReportFormatJSON:
		content, err = generateReportJSON(data)
	default:
		return fmt.Errorf("unsupported format: %s", report.Format)
	}

	if err != nil {
		return fmt.Errorf("failed to generate %s file: %w", report.Format, err)
	}

	// Update report record
	completedAt := time.Now()
	rowCount := len(data.values)
	fileSize := len(content)
	report.Status = model.ReportStatusCompleted
	report.FileContent = content
	report.FileSize = &fileSize
	report.RowCount = &rowCount
	report.CompletedAt = &completedAt

	return s.repo.Update(ctx, report)
}

// getEmployeesInScope retrieves employees filtered by scope.
func (s *ReportService) getEmployeesInScope(ctx context.Context, tenantID uuid.UUID, params model.ReportParameters) ([]model.Employee, error) {
	active := true
	filter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &active,
		Limit:    10000,
	}
	if len(params.DepartmentIDs) > 0 {
		filter.DepartmentID = &params.DepartmentIDs[0]
	}

	employees, _, err := s.employeeRepo.List(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to list employees: %w", err)
	}

	// Filter by cost center IDs
	if len(params.CostCenterIDs) > 0 {
		ccSet := make(map[uuid.UUID]bool, len(params.CostCenterIDs))
		for _, id := range params.CostCenterIDs {
			ccSet[id] = true
		}
		var filtered []model.Employee
		for _, emp := range employees {
			if emp.CostCenterID != nil && ccSet[*emp.CostCenterID] {
				filtered = append(filtered, emp)
			}
		}
		employees = filtered
	}

	// Filter by team IDs
	if len(params.TeamIDs) > 0 {
		teamEmpIDs := make(map[uuid.UUID]bool)
		for _, teamID := range params.TeamIDs {
			members, err := s.teamRepo.GetMembers(ctx, teamID)
			if err != nil {
				continue
			}
			for _, m := range members {
				teamEmpIDs[m.EmployeeID] = true
			}
		}
		var filtered []model.Employee
		for _, emp := range employees {
			if teamEmpIDs[emp.ID] {
				filtered = append(filtered, emp)
			}
		}
		employees = filtered
	}

	// Filter by specific employee IDs
	if len(params.EmployeeIDs) > 0 {
		idSet := make(map[uuid.UUID]bool, len(params.EmployeeIDs))
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

	return employees, nil
}

// --- Data gathering helpers ---

func (s *ReportService) gatherMonthlyOverview(ctx context.Context, params model.ReportParameters, employees []model.Employee) (reportRow, error) {
	data := reportRow{
		headers: []string{
			"PersonnelNumber", "FirstName", "LastName",
			"Year", "Month",
			"TargetHours", "WorkedHours", "OvertimeHours",
			"VacationDays", "SickDays", "OtherAbsenceDays",
			"FlextimeEnd", "IsClosed",
		},
	}

	fromDate, toDate := parseDateRange(params.FromDate, params.ToDate)

	for _, emp := range employees {
		// Iterate months in range
		iterateMonths(fromDate, toDate, func(year, month int) {
			mv, err := s.monthlyRepo.GetByEmployeeMonth(ctx, emp.ID, year, month)
			if err != nil || mv == nil {
				return
			}

			targetHours := decimal.NewFromInt(int64(mv.TotalTargetTime)).Div(decimal.NewFromInt(60))
			workedHours := decimal.NewFromInt(int64(mv.TotalNetTime)).Div(decimal.NewFromInt(60))
			overtimeHours := decimal.NewFromInt(int64(mv.TotalOvertime)).Div(decimal.NewFromInt(60))
			flextimeEnd := decimal.NewFromInt(int64(mv.FlextimeEnd)).Div(decimal.NewFromInt(60))

			closed := "No"
			if mv.IsClosed {
				closed = "Yes"
			}

			data.values = append(data.values, []string{
				emp.PersonnelNumber,
				emp.FirstName,
				emp.LastName,
				strconv.Itoa(year),
				strconv.Itoa(month),
				targetHours.StringFixed(2),
				workedHours.StringFixed(2),
				overtimeHours.StringFixed(2),
				mv.VacationTaken.StringFixed(2),
				strconv.Itoa(mv.SickDays),
				strconv.Itoa(mv.OtherAbsenceDays),
				flextimeEnd.StringFixed(2),
				closed,
			})
		})
	}

	return data, nil
}

func (s *ReportService) gatherDailyOverview(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) (reportRow, error) {
	data := reportRow{
		headers: []string{
			"Date", "EmployeeID", "PersonnelNumber",
			"GrossTime", "NetTime", "TargetTime",
			"Overtime", "Undertime", "BreakTime",
			"Status",
		},
	}

	fromDate, toDate := parseDateRange(params.FromDate, params.ToDate)
	opts := model.DailyValueListOptions{
		From:  fromDate,
		To:    toDate,
		Limit: 10000,
	}
	if len(params.EmployeeIDs) > 0 {
		opts.EmployeeID = &params.EmployeeIDs[0]
	}

	values, err := s.dailyRepo.ListAll(ctx, tenantID, opts)
	if err != nil {
		return data, fmt.Errorf("failed to list daily values: %w", err)
	}

	for _, dv := range values {
		pn := ""
		if dv.Employee != nil {
			pn = dv.Employee.PersonnelNumber
		}
		data.values = append(data.values, []string{
			dv.ValueDate.Format("2006-01-02"),
			dv.EmployeeID.String(),
			pn,
			minutesToHoursString(dv.GrossTime),
			minutesToHoursString(dv.NetTime),
			minutesToHoursString(dv.TargetTime),
			minutesToHoursString(dv.Overtime),
			minutesToHoursString(dv.Undertime),
			minutesToHoursString(dv.BreakTime),
			string(dv.Status),
		})
	}

	return data, nil
}

func (s *ReportService) gatherEmployeeTimesheet(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) (reportRow, error) {
	// Reuse daily overview with employee filter
	return s.gatherDailyOverview(ctx, params, tenantID)
}

func (s *ReportService) gatherAbsenceReport(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) (reportRow, error) {
	data := reportRow{
		headers: []string{
			"Date", "EmployeeID", "PersonnelNumber",
			"AbsenceType", "Status", "Duration",
		},
	}

	fromDate, toDate := parseDateRange(params.FromDate, params.ToDate)
	opts := model.AbsenceListOptions{
		From: fromDate,
		To:   toDate,
	}
	if len(params.EmployeeIDs) > 0 {
		opts.EmployeeID = &params.EmployeeIDs[0]
	}

	days, err := s.absenceRepo.ListAll(ctx, tenantID, opts)
	if err != nil {
		return data, fmt.Errorf("failed to list absence days: %w", err)
	}

	for _, ad := range days {
		pn := ""
		if ad.Employee != nil {
			pn = ad.Employee.PersonnelNumber
		}
		typeName := ""
		if ad.AbsenceType != nil {
			typeName = ad.AbsenceType.Name
		}
		data.values = append(data.values, []string{
			ad.AbsenceDate.Format("2006-01-02"),
			ad.EmployeeID.String(),
			pn,
			typeName,
			string(ad.Status),
			ad.Duration.StringFixed(2),
		})
	}

	return data, nil
}

func (s *ReportService) gatherVacationReport(ctx context.Context, params model.ReportParameters, employees []model.Employee) (reportRow, error) {
	data := reportRow{
		headers: []string{
			"PersonnelNumber", "FirstName", "LastName",
			"Year", "Entitlement", "Carryover",
			"Adjustments", "Taken", "Remaining",
		},
	}

	year := time.Now().Year()
	if params.FromDate != nil {
		if t, err := time.Parse("2006-01-02", *params.FromDate); err == nil {
			year = t.Year()
		}
	}

	for _, emp := range employees {
		vb, err := s.vacationRepo.GetByEmployeeYear(ctx, emp.ID, year)
		if err != nil || vb == nil {
			continue
		}

		remaining := vb.Entitlement.Add(vb.Carryover).Add(vb.Adjustments).Sub(vb.Taken)

		data.values = append(data.values, []string{
			emp.PersonnelNumber,
			emp.FirstName,
			emp.LastName,
			strconv.Itoa(year),
			vb.Entitlement.StringFixed(2),
			vb.Carryover.StringFixed(2),
			vb.Adjustments.StringFixed(2),
			vb.Taken.StringFixed(2),
			remaining.StringFixed(2),
		})
	}

	return data, nil
}

func (s *ReportService) gatherOvertimeReport(ctx context.Context, params model.ReportParameters, employees []model.Employee) (reportRow, error) {
	data := reportRow{
		headers: []string{
			"PersonnelNumber", "FirstName", "LastName",
			"Year", "Month",
			"TargetHours", "WorkedHours", "OvertimeHours",
			"FlextimeEnd",
		},
	}

	fromDate, toDate := parseDateRange(params.FromDate, params.ToDate)

	for _, emp := range employees {
		iterateMonths(fromDate, toDate, func(year, month int) {
			mv, err := s.monthlyRepo.GetByEmployeeMonth(ctx, emp.ID, year, month)
			if err != nil || mv == nil {
				return
			}

			targetHours := decimal.NewFromInt(int64(mv.TotalTargetTime)).Div(decimal.NewFromInt(60))
			workedHours := decimal.NewFromInt(int64(mv.TotalNetTime)).Div(decimal.NewFromInt(60))
			overtimeHours := decimal.NewFromInt(int64(mv.TotalOvertime)).Div(decimal.NewFromInt(60))
			flextimeEnd := decimal.NewFromInt(int64(mv.FlextimeEnd)).Div(decimal.NewFromInt(60))

			data.values = append(data.values, []string{
				emp.PersonnelNumber,
				emp.FirstName,
				emp.LastName,
				strconv.Itoa(year),
				strconv.Itoa(month),
				targetHours.StringFixed(2),
				workedHours.StringFixed(2),
				overtimeHours.StringFixed(2),
				flextimeEnd.StringFixed(2),
			})
		})
	}

	return data, nil
}

func (s *ReportService) gatherDepartmentSummary(ctx context.Context, params model.ReportParameters, employees []model.Employee) (reportRow, error) {
	data := reportRow{
		headers: []string{
			"Department", "EmployeeCount",
			"TotalTargetHours", "TotalWorkedHours", "TotalOvertimeHours",
		},
	}

	fromDate, toDate := parseDateRange(params.FromDate, params.ToDate)

	// Group employees by department
	deptMap := make(map[string][]model.Employee)
	for _, emp := range employees {
		deptName := "Unknown"
		if emp.Department != nil {
			deptName = emp.Department.Name
		}
		deptMap[deptName] = append(deptMap[deptName], emp)
	}

	for deptName, deptEmps := range deptMap {
		totalTarget := decimal.Zero
		totalWorked := decimal.Zero
		totalOT := decimal.Zero

		for _, emp := range deptEmps {
			iterateMonths(fromDate, toDate, func(year, month int) {
				mv, err := s.monthlyRepo.GetByEmployeeMonth(ctx, emp.ID, year, month)
				if err != nil || mv == nil {
					return
				}
				totalTarget = totalTarget.Add(decimal.NewFromInt(int64(mv.TotalTargetTime)).Div(decimal.NewFromInt(60)))
				totalWorked = totalWorked.Add(decimal.NewFromInt(int64(mv.TotalNetTime)).Div(decimal.NewFromInt(60)))
				totalOT = totalOT.Add(decimal.NewFromInt(int64(mv.TotalOvertime)).Div(decimal.NewFromInt(60)))
			})
		}

		data.values = append(data.values, []string{
			deptName,
			strconv.Itoa(len(deptEmps)),
			totalTarget.StringFixed(2),
			totalWorked.StringFixed(2),
			totalOT.StringFixed(2),
		})
	}

	return data, nil
}

func (s *ReportService) gatherAccountBalances(ctx context.Context, params model.ReportParameters, employees []model.Employee) (reportRow, error) {
	data := reportRow{
		headers: []string{
			"PersonnelNumber", "FirstName", "LastName",
			"Year", "Month",
			"FlextimeStart", "FlextimeChange", "FlextimeEnd",
		},
	}

	fromDate, toDate := parseDateRange(params.FromDate, params.ToDate)

	for _, emp := range employees {
		iterateMonths(fromDate, toDate, func(year, month int) {
			mv, err := s.monthlyRepo.GetByEmployeeMonth(ctx, emp.ID, year, month)
			if err != nil || mv == nil {
				return
			}

			ftStart := decimal.NewFromInt(int64(mv.FlextimeStart)).Div(decimal.NewFromInt(60))
			ftChange := decimal.NewFromInt(int64(mv.FlextimeChange)).Div(decimal.NewFromInt(60))
			ftEnd := decimal.NewFromInt(int64(mv.FlextimeEnd)).Div(decimal.NewFromInt(60))

			data.values = append(data.values, []string{
				emp.PersonnelNumber,
				emp.FirstName,
				emp.LastName,
				strconv.Itoa(year),
				strconv.Itoa(month),
				ftStart.StringFixed(2),
				ftChange.StringFixed(2),
				ftEnd.StringFixed(2),
			})
		})
	}

	return data, nil
}

func (s *ReportService) gatherWeeklyOverview(ctx context.Context, params model.ReportParameters, tenantID uuid.UUID) (reportRow, error) {
	// Reuse daily overview for weekly overview
	return s.gatherDailyOverview(ctx, params, tenantID)
}

// --- File generation helpers ---

func generateReportCSV(data reportRow) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	w.Comma = ';'

	if err := w.Write(data.headers); err != nil {
		return nil, err
	}
	for _, row := range data.values {
		if err := w.Write(row); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

func generateReportXLSX(data reportRow, title string) ([]byte, error) {
	f := excelize.NewFile()
	defer func() { _ = f.Close() }()

	sheetName := "Report"
	index, err := f.NewSheet(sheetName)
	if err != nil {
		return nil, err
	}
	f.SetActiveSheet(index)
	// Delete default "Sheet1" if different
	if sheetName != "Sheet1" {
		_ = f.DeleteSheet("Sheet1")
	}

	// Write headers
	for i, h := range data.headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(sheetName, cell, h)
	}

	// Write data rows
	for rowIdx, row := range data.values {
		for colIdx, val := range row {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, rowIdx+2)
			_ = f.SetCellValue(sheetName, cell, val)
		}
	}

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func generateReportPDF(data reportRow, title string) ([]byte, error) {
	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetTitle(title, false)
	pdf.AddPage()
	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(0, 10, title, "", 1, "C", false, 0, "")
	pdf.Ln(5)

	// Calculate column widths
	numCols := len(data.headers)
	pageWidth := 277.0 // A4 landscape usable width in mm
	colWidth := pageWidth / float64(numCols)
	if colWidth > 50 {
		colWidth = 50
	}

	// Header row
	pdf.SetFont("Helvetica", "B", 8)
	for _, h := range data.headers {
		pdf.CellFormat(colWidth, 7, h, "1", 0, "C", false, 0, "")
	}
	pdf.Ln(-1)

	// Data rows
	pdf.SetFont("Helvetica", "", 7)
	for _, row := range data.values {
		for i, val := range row {
			if i >= numCols {
				break
			}
			// Truncate long values
			if len(val) > 25 {
				val = val[:22] + "..."
			}
			pdf.CellFormat(colWidth, 6, val, "1", 0, "", false, 0, "")
		}
		pdf.Ln(-1)
	}

	var buf bytes.Buffer
	err := pdf.Output(&buf)
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func generateReportJSON(data reportRow) ([]byte, error) {
	rows := make([]map[string]string, 0, len(data.values))
	for _, row := range data.values {
		m := make(map[string]string, len(data.headers))
		for i, h := range data.headers {
			if i < len(row) {
				m[h] = row[i]
			}
		}
		rows = append(rows, m)
	}
	return json.MarshalIndent(rows, "", "  ")
}

// --- Utility helpers ---

func requiresDateRange(reportType string) bool {
	switch model.ReportType(reportType) {
	case model.ReportTypeDailyOverview, model.ReportTypeWeeklyOverview,
		model.ReportTypeMonthlyOverview, model.ReportTypeEmployeeTimesheet,
		model.ReportTypeAbsenceReport, model.ReportTypeOvertimeReport,
		model.ReportTypeDepartmentSummary, model.ReportTypeAccountBalances:
		return true
	}
	return false
}

func parseDateRange(fromStr, toStr *string) (*time.Time, *time.Time) {
	var from, to *time.Time
	if fromStr != nil && *fromStr != "" {
		t, err := time.Parse("2006-01-02", *fromStr)
		if err == nil {
			from = &t
		}
	}
	if toStr != nil && *toStr != "" {
		t, err := time.Parse("2006-01-02", *toStr)
		if err == nil {
			to = &t
		}
	}
	return from, to
}

func iterateMonths(from, to *time.Time, fn func(year, month int)) {
	if from == nil || to == nil {
		return
	}
	current := time.Date(from.Year(), from.Month(), 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(to.Year(), to.Month(), 1, 0, 0, 0, 0, time.UTC)
	for !current.After(end) {
		fn(current.Year(), int(current.Month()))
		current = current.AddDate(0, 1, 0)
	}
}

func minutesToHoursString(minutes int) string {
	h := minutes / 60
	m := minutes % 60
	if m < 0 {
		m = -m
	}
	if minutes < 0 && h == 0 {
		return fmt.Sprintf("-%d:%02d", h, m)
	}
	return fmt.Sprintf("%d:%02d", h, m)
}

func formatReportName(reportType string) string {
	name := strings.ReplaceAll(reportType, "_", " ")
	if len(name) > 0 {
		name = strings.ToUpper(name[:1]) + name[1:]
	}
	return name + " - " + time.Now().Format("2006-01-02")
}
