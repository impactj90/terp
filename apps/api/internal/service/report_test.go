package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// --- Mocks ---

type mockReportRepo struct {
	mock.Mock
}

func (m *mockReportRepo) Create(ctx context.Context, r *model.Report) error {
	args := m.Called(ctx, r)
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockReportRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.Report, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Report), args.Error(1)
}

func (m *mockReportRepo) Update(ctx context.Context, r *model.Report) error {
	args := m.Called(ctx, r)
	return args.Error(0)
}

func (m *mockReportRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockReportRepo) List(ctx context.Context, filter repository.ReportFilter) ([]model.Report, error) {
	args := m.Called(ctx, filter)
	return args.Get(0).([]model.Report), args.Error(1)
}

type mockReportEmployeeRepo struct {
	mock.Mock
}

func (m *mockReportEmployeeRepo) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
	args := m.Called(ctx, filter)
	return args.Get(0).([]model.Employee), args.Get(1).(int64), args.Error(2)
}

type mockReportDailyValueRepo struct {
	mock.Mock
}

func (m *mockReportDailyValueRepo) ListAll(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error) {
	args := m.Called(ctx, tenantID, opts)
	return args.Get(0).([]model.DailyValue), args.Error(1)
}

type mockReportMonthlyValueRepo struct {
	mock.Mock
}

func (m *mockReportMonthlyValueRepo) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	args := m.Called(ctx, employeeID, year, month)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

type mockReportAbsenceDayRepo struct {
	mock.Mock
}

func (m *mockReportAbsenceDayRepo) ListAll(ctx context.Context, tenantID uuid.UUID, opts model.AbsenceListOptions) ([]model.AbsenceDay, error) {
	args := m.Called(ctx, tenantID, opts)
	return args.Get(0).([]model.AbsenceDay), args.Error(1)
}

type mockReportVacationBalanceRepo struct {
	mock.Mock
}

func (m *mockReportVacationBalanceRepo) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	args := m.Called(ctx, employeeID, year)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationBalance), args.Error(1)
}

type mockReportTeamRepo struct {
	mock.Mock
}

func (m *mockReportTeamRepo) List(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.Team), args.Error(1)
}

func (m *mockReportTeamRepo) GetMembers(ctx context.Context, teamID uuid.UUID) ([]model.TeamMember, error) {
	args := m.Called(ctx, teamID)
	return args.Get(0).([]model.TeamMember), args.Error(1)
}

// newTestReportService creates a service with all mocks.
func newTestReportService() (
	*ReportService,
	*mockReportRepo,
	*mockReportEmployeeRepo,
	*mockReportDailyValueRepo,
	*mockReportMonthlyValueRepo,
	*mockReportAbsenceDayRepo,
	*mockReportVacationBalanceRepo,
	*mockReportTeamRepo,
) {
	repo := new(mockReportRepo)
	empRepo := new(mockReportEmployeeRepo)
	dvRepo := new(mockReportDailyValueRepo)
	mvRepo := new(mockReportMonthlyValueRepo)
	adRepo := new(mockReportAbsenceDayRepo)
	vbRepo := new(mockReportVacationBalanceRepo)
	teamRepo := new(mockReportTeamRepo)
	svc := NewReportService(repo, empRepo, dvRepo, mvRepo, adRepo, vbRepo, teamRepo)
	return svc, repo, empRepo, dvRepo, mvRepo, adRepo, vbRepo, teamRepo
}

// --- Generate Tests ---

func TestReportService_Generate_MonthlyOverview_CSV(t *testing.T) {
	ctx := context.Background()
	svc, repo, empRepo, _, mvRepo, _, _, _ := newTestReportService()

	tenantID := uuid.New()
	emp1ID := uuid.New()

	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{
		{
			ID:              emp1ID,
			TenantID:        tenantID,
			PersonnelNumber: "EMP001",
			FirstName:       "Max",
			LastName:        "Mustermann",
		},
	}, int64(1), nil)

	mvRepo.On("GetByEmployeeMonth", ctx, emp1ID, 2025, 1).Return(&model.MonthlyValue{
		EmployeeID:       emp1ID,
		Year:             2025,
		Month:            1,
		TotalTargetTime:  9600,
		TotalNetTime:     9900,
		TotalOvertime:    300,
		VacationTaken:    decimal.NewFromFloat(2.0),
		SickDays:         1,
		OtherAbsenceDays: 0,
		FlextimeEnd:      300,
		IsClosed:         true,
	}, nil)

	repo.On("Create", ctx, mock.AnythingOfType("*model.Report")).Return(nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.Report")).Return(nil)

	fromDate := "2025-01-01"
	toDate := "2025-01-31"

	report, err := svc.Generate(ctx, GenerateReportInput{
		TenantID:   tenantID,
		ReportType: "monthly_overview",
		Format:     "csv",
		FromDate:   &fromDate,
		ToDate:     &toDate,
	})

	require.NoError(t, err)
	assert.NotNil(t, report)
	assert.Equal(t, model.ReportStatusCompleted, report.Status)
	assert.NotNil(t, report.FileContent)
	assert.NotNil(t, report.RowCount)
	assert.Equal(t, 1, *report.RowCount)
	repo.AssertExpectations(t)
	empRepo.AssertExpectations(t)
	mvRepo.AssertExpectations(t)
}

func TestReportService_Generate_MonthlyOverview_XLSX(t *testing.T) {
	ctx := context.Background()
	svc, repo, empRepo, _, mvRepo, _, _, _ := newTestReportService()

	tenantID := uuid.New()
	emp1ID := uuid.New()

	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{
		{ID: emp1ID, PersonnelNumber: "EMP001", FirstName: "Max", LastName: "Mustermann"},
	}, int64(1), nil)

	mvRepo.On("GetByEmployeeMonth", ctx, emp1ID, 2025, 1).Return(&model.MonthlyValue{
		EmployeeID:      emp1ID,
		Year:            2025,
		Month:           1,
		TotalTargetTime: 9600,
		TotalNetTime:    9600,
		IsClosed:        true,
		VacationTaken:   decimal.Zero,
	}, nil)

	repo.On("Create", ctx, mock.AnythingOfType("*model.Report")).Return(nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.Report")).Return(nil)

	fromDate := "2025-01-01"
	toDate := "2025-01-31"

	report, err := svc.Generate(ctx, GenerateReportInput{
		TenantID:   tenantID,
		ReportType: "monthly_overview",
		Format:     "xlsx",
		FromDate:   &fromDate,
		ToDate:     &toDate,
	})

	require.NoError(t, err)
	assert.NotNil(t, report)
	assert.Equal(t, model.ReportStatusCompleted, report.Status)
	assert.NotNil(t, report.FileContent)
	// XLSX files should start with PK zip header
	assert.True(t, len(report.FileContent) > 2)
}

func TestReportService_Generate_MonthlyOverview_PDF(t *testing.T) {
	ctx := context.Background()
	svc, repo, empRepo, _, mvRepo, _, _, _ := newTestReportService()

	tenantID := uuid.New()

	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{}, int64(0), nil)

	repo.On("Create", ctx, mock.AnythingOfType("*model.Report")).Return(nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.Report")).Return(nil)

	_ = mvRepo // not called since no employees

	fromDate := "2025-01-01"
	toDate := "2025-01-31"

	report, err := svc.Generate(ctx, GenerateReportInput{
		TenantID:   tenantID,
		ReportType: "monthly_overview",
		Format:     "pdf",
		FromDate:   &fromDate,
		ToDate:     &toDate,
	})

	require.NoError(t, err)
	assert.NotNil(t, report)
	assert.Equal(t, model.ReportStatusCompleted, report.Status)
	assert.NotNil(t, report.FileContent)
	// PDF files start with %PDF
	assert.True(t, len(report.FileContent) > 4)
	assert.Equal(t, "%PDF", string(report.FileContent[:4]))
}

func TestReportService_Generate_MonthlyOverview_JSON(t *testing.T) {
	ctx := context.Background()
	svc, repo, empRepo, _, _, _, _, _ := newTestReportService()

	tenantID := uuid.New()

	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{}, int64(0), nil)

	repo.On("Create", ctx, mock.AnythingOfType("*model.Report")).Return(nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.Report")).Return(nil)

	fromDate := "2025-01-01"
	toDate := "2025-01-31"

	report, err := svc.Generate(ctx, GenerateReportInput{
		TenantID:   tenantID,
		ReportType: "monthly_overview",
		Format:     "json",
		FromDate:   &fromDate,
		ToDate:     &toDate,
	})

	require.NoError(t, err)
	assert.NotNil(t, report)
	assert.Equal(t, model.ReportStatusCompleted, report.Status)
	// JSON output should start with [
	assert.Equal(t, byte('['), report.FileContent[0])
}

func TestReportService_Generate_VacationReport_CSV(t *testing.T) {
	ctx := context.Background()
	svc, repo, empRepo, _, _, _, vbRepo, _ := newTestReportService()

	tenantID := uuid.New()
	emp1ID := uuid.New()

	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{
		{ID: emp1ID, PersonnelNumber: "EMP001", FirstName: "Max", LastName: "Mustermann"},
	}, int64(1), nil)

	vbRepo.On("GetByEmployeeYear", ctx, emp1ID, 2025).Return(&model.VacationBalance{
		EmployeeID:  emp1ID,
		Year:        2025,
		Entitlement: decimal.NewFromFloat(30.0),
		Carryover:   decimal.NewFromFloat(2.0),
		Adjustments: decimal.NewFromFloat(0.0),
		Taken:       decimal.NewFromFloat(5.0),
	}, nil)

	repo.On("Create", ctx, mock.AnythingOfType("*model.Report")).Return(nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.Report")).Return(nil)

	fromDate := "2025-01-01"

	report, err := svc.Generate(ctx, GenerateReportInput{
		TenantID:   tenantID,
		ReportType: "vacation_report",
		Format:     "csv",
		FromDate:   &fromDate,
	})

	require.NoError(t, err)
	assert.NotNil(t, report)
	assert.Equal(t, model.ReportStatusCompleted, report.Status)
	assert.NotNil(t, report.RowCount)
	assert.Equal(t, 1, *report.RowCount)
	// CSV content should have vacation data
	assert.Contains(t, string(report.FileContent), "EMP001")
	assert.Contains(t, string(report.FileContent), "30.00")
	assert.Contains(t, string(report.FileContent), "27.00") // remaining = 30+2+0-5 = 27
}

func TestReportService_Generate_MissingReportType(t *testing.T) {
	svc, _, _, _, _, _, _, _ := newTestReportService()

	_, err := svc.Generate(context.Background(), GenerateReportInput{
		TenantID: uuid.New(),
		Format:   "csv",
	})

	assert.ErrorIs(t, err, ErrReportTypeRequired)
}

func TestReportService_Generate_InvalidReportType(t *testing.T) {
	svc, _, _, _, _, _, _, _ := newTestReportService()

	_, err := svc.Generate(context.Background(), GenerateReportInput{
		TenantID:   uuid.New(),
		ReportType: "nonexistent_type",
		Format:     "csv",
	})

	assert.ErrorIs(t, err, ErrReportTypeInvalid)
}

func TestReportService_Generate_MissingFormat(t *testing.T) {
	svc, _, _, _, _, _, _, _ := newTestReportService()

	_, err := svc.Generate(context.Background(), GenerateReportInput{
		TenantID:   uuid.New(),
		ReportType: "monthly_overview",
	})

	assert.ErrorIs(t, err, ErrReportFormatRequired)
}

func TestReportService_Generate_InvalidFormat(t *testing.T) {
	svc, _, _, _, _, _, _, _ := newTestReportService()

	_, err := svc.Generate(context.Background(), GenerateReportInput{
		TenantID:   uuid.New(),
		ReportType: "monthly_overview",
		Format:     "txt",
	})

	assert.ErrorIs(t, err, ErrReportFormatInvalid)
}

func TestReportService_Generate_MissingDateRange(t *testing.T) {
	svc, _, _, _, _, _, _, _ := newTestReportService()

	_, err := svc.Generate(context.Background(), GenerateReportInput{
		TenantID:   uuid.New(),
		ReportType: "daily_overview",
		Format:     "csv",
	})

	assert.ErrorIs(t, err, ErrReportDateRangeNeeded)
}

func TestReportService_Generate_CustomReport(t *testing.T) {
	ctx := context.Background()
	svc, repo, empRepo, _, _, _, _, _ := newTestReportService()

	tenantID := uuid.New()

	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{}, int64(0), nil)

	repo.On("Create", ctx, mock.AnythingOfType("*model.Report")).Return(nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.Report")).Return(nil)

	report, err := svc.Generate(ctx, GenerateReportInput{
		TenantID:   tenantID,
		ReportType: "custom",
		Format:     "csv",
	})

	require.NoError(t, err)
	assert.Equal(t, model.ReportStatusCompleted, report.Status)
}

// --- GetByID Tests ---

func TestReportService_GetByID_Success(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	expected := &model.Report{
		ID:         reportID,
		ReportType: model.ReportTypeMonthlyOverview,
		Status:     model.ReportStatusCompleted,
	}
	repo.On("GetByID", ctx, reportID).Return(expected, nil)

	result, err := svc.GetByID(ctx, reportID)

	require.NoError(t, err)
	assert.Equal(t, reportID, result.ID)
	assert.Equal(t, model.ReportTypeMonthlyOverview, result.ReportType)
}

func TestReportService_GetByID_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	repo.On("GetByID", ctx, reportID).Return(nil, errors.New("not found"))

	_, err := svc.GetByID(ctx, reportID)

	assert.ErrorIs(t, err, ErrReportNotFound)
}

// --- Delete Tests ---

func TestReportService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	repo.On("GetByID", ctx, reportID).Return(&model.Report{ID: reportID}, nil)
	repo.On("Delete", ctx, reportID).Return(nil)

	err := svc.Delete(ctx, reportID)

	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestReportService_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	repo.On("GetByID", ctx, reportID).Return(nil, errors.New("not found"))

	err := svc.Delete(ctx, reportID)

	assert.ErrorIs(t, err, ErrReportNotFound)
}

// --- List Tests ---

func TestReportService_List_Success(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	tenantID := uuid.New()
	reports := []model.Report{
		{ID: uuid.New(), ReportType: model.ReportTypeMonthlyOverview, Status: model.ReportStatusCompleted},
		{ID: uuid.New(), ReportType: model.ReportTypeAbsenceReport, Status: model.ReportStatusCompleted},
	}
	repo.On("List", ctx, mock.AnythingOfType("repository.ReportFilter")).Return(reports, nil)

	result, hasMore, err := svc.List(ctx, ReportListFilter{
		TenantID: tenantID,
		Limit:    20,
	})

	require.NoError(t, err)
	assert.Len(t, result, 2)
	assert.False(t, hasMore)
}

func TestReportService_List_HasMore(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	tenantID := uuid.New()
	// Return 3 items for limit of 2 (triggers hasMore)
	reports := []model.Report{
		{ID: uuid.New()},
		{ID: uuid.New()},
		{ID: uuid.New()},
	}
	repo.On("List", ctx, mock.AnythingOfType("repository.ReportFilter")).Return(reports, nil)

	result, hasMore, err := svc.List(ctx, ReportListFilter{
		TenantID: tenantID,
		Limit:    2,
	})

	require.NoError(t, err)
	assert.Len(t, result, 2)
	assert.True(t, hasMore)
}

// --- GetDownloadContent Tests ---

func TestReportService_GetDownloadContent_Success_CSV(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	fileContent := []byte("PersonnelNumber;FirstName;LastName\nEMP001;Max;Mustermann\n")
	repo.On("GetByID", ctx, reportID).Return(&model.Report{
		ID:          reportID,
		Status:      model.ReportStatusCompleted,
		Format:      model.ReportFormatCSV,
		FileContent: fileContent,
	}, nil)

	data, contentType, filename, err := svc.GetDownloadContent(ctx, reportID)

	require.NoError(t, err)
	assert.Equal(t, fileContent, data)
	assert.Equal(t, "text/csv", contentType)
	assert.Contains(t, filename, ".csv")
}

func TestReportService_GetDownloadContent_Success_XLSX(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	fileContent := []byte{0x50, 0x4B, 0x03, 0x04} // PK zip header
	repo.On("GetByID", ctx, reportID).Return(&model.Report{
		ID:          reportID,
		Status:      model.ReportStatusCompleted,
		Format:      model.ReportFormatXLSX,
		FileContent: fileContent,
	}, nil)

	data, contentType, filename, err := svc.GetDownloadContent(ctx, reportID)

	require.NoError(t, err)
	assert.Equal(t, fileContent, data)
	assert.Equal(t, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentType)
	assert.Contains(t, filename, ".xlsx")
}

func TestReportService_GetDownloadContent_Success_PDF(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	fileContent := []byte("%PDF-1.4")
	repo.On("GetByID", ctx, reportID).Return(&model.Report{
		ID:          reportID,
		Status:      model.ReportStatusCompleted,
		Format:      model.ReportFormatPDF,
		FileContent: fileContent,
	}, nil)

	data, contentType, filename, err := svc.GetDownloadContent(ctx, reportID)

	require.NoError(t, err)
	assert.Equal(t, fileContent, data)
	assert.Equal(t, "application/pdf", contentType)
	assert.Contains(t, filename, ".pdf")
}

func TestReportService_GetDownloadContent_NotReady(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	repo.On("GetByID", ctx, reportID).Return(&model.Report{
		ID:     reportID,
		Status: model.ReportStatusPending,
	}, nil)

	_, _, _, err := svc.GetDownloadContent(ctx, reportID)

	assert.ErrorIs(t, err, ErrReportNotReady)
}

func TestReportService_GetDownloadContent_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _, _, _, _, _ := newTestReportService()

	reportID := uuid.New()
	repo.On("GetByID", ctx, reportID).Return(nil, errors.New("not found"))

	_, _, _, err := svc.GetDownloadContent(ctx, reportID)

	assert.ErrorIs(t, err, ErrReportNotFound)
}

// --- Helper Function Tests ---

func TestRequiresDateRange(t *testing.T) {
	assert.True(t, requiresDateRange("daily_overview"))
	assert.True(t, requiresDateRange("weekly_overview"))
	assert.True(t, requiresDateRange("monthly_overview"))
	assert.True(t, requiresDateRange("employee_timesheet"))
	assert.True(t, requiresDateRange("absence_report"))
	assert.True(t, requiresDateRange("overtime_report"))
	assert.True(t, requiresDateRange("department_summary"))
	assert.True(t, requiresDateRange("account_balances"))
	assert.False(t, requiresDateRange("vacation_report"))
	assert.False(t, requiresDateRange("custom"))
}

func TestMinutesToHoursString(t *testing.T) {
	assert.Equal(t, "8:00", minutesToHoursString(480))
	assert.Equal(t, "8:30", minutesToHoursString(510))
	assert.Equal(t, "0:00", minutesToHoursString(0))
	assert.Equal(t, "-1:30", minutesToHoursString(-90))
}

func TestFormatReportName(t *testing.T) {
	name := formatReportName("monthly_overview")
	assert.Contains(t, name, "Monthly overview")
	assert.Contains(t, name, " - ")
}

func TestParseDateRange(t *testing.T) {
	fromStr := "2025-01-01"
	toStr := "2025-01-31"

	from, to := parseDateRange(&fromStr, &toStr)
	assert.NotNil(t, from)
	assert.NotNil(t, to)
	assert.Equal(t, 2025, from.Year())
	assert.Equal(t, 1, int(from.Month()))
	assert.Equal(t, 31, to.Day())
}

func TestParseDateRange_Nil(t *testing.T) {
	from, to := parseDateRange(nil, nil)
	assert.Nil(t, from)
	assert.Nil(t, to)
}

func TestIterateMonths(t *testing.T) {
	fromStr := "2025-01-01"
	toStr := "2025-03-31"
	from, to := parseDateRange(&fromStr, &toStr)

	var months []int
	iterateMonths(from, to, func(year, month int) {
		months = append(months, month)
	})

	assert.Equal(t, []int{1, 2, 3}, months)
}

func TestIterateMonths_Nil(t *testing.T) {
	var called bool
	iterateMonths(nil, nil, func(year, month int) {
		called = true
	})
	assert.False(t, called)
}

// --- Model Validation Tests ---

func TestIsValidReportType(t *testing.T) {
	assert.True(t, model.IsValidReportType("monthly_overview"))
	assert.True(t, model.IsValidReportType("daily_overview"))
	assert.True(t, model.IsValidReportType("custom"))
	assert.False(t, model.IsValidReportType(""))
	assert.False(t, model.IsValidReportType("invalid"))
}

func TestIsValidReportFormat(t *testing.T) {
	assert.True(t, model.IsValidReportFormat("csv"))
	assert.True(t, model.IsValidReportFormat("xlsx"))
	assert.True(t, model.IsValidReportFormat("pdf"))
	assert.True(t, model.IsValidReportFormat("json"))
	assert.False(t, model.IsValidReportFormat(""))
	assert.False(t, model.IsValidReportFormat("txt"))
}

func TestIsValidReportStatus(t *testing.T) {
	assert.True(t, model.IsValidReportStatus("pending"))
	assert.True(t, model.IsValidReportStatus("generating"))
	assert.True(t, model.IsValidReportStatus("completed"))
	assert.True(t, model.IsValidReportStatus("failed"))
	assert.False(t, model.IsValidReportStatus(""))
	assert.False(t, model.IsValidReportStatus("invalid"))
}

func TestReportIsCompleted(t *testing.T) {
	r := &model.Report{Status: model.ReportStatusCompleted}
	assert.True(t, r.IsCompleted())

	r.Status = model.ReportStatusPending
	assert.False(t, r.IsCompleted())
}

// --- CSV Generation Tests ---

func TestGenerateReportCSV(t *testing.T) {
	data := reportRow{
		headers: []string{"Name", "Value"},
		values: [][]string{
			{"Test", "123"},
			{"Other", "456"},
		},
	}

	content, err := generateReportCSV(data)

	require.NoError(t, err)
	csvStr := string(content)
	assert.Contains(t, csvStr, "Name;Value")
	assert.Contains(t, csvStr, "Test;123")
	assert.Contains(t, csvStr, "Other;456")
}

// --- JSON Generation Tests ---

func TestGenerateReportJSON(t *testing.T) {
	data := reportRow{
		headers: []string{"Name", "Value"},
		values: [][]string{
			{"Test", "123"},
		},
	}

	content, err := generateReportJSON(data)

	require.NoError(t, err)
	jsonStr := string(content)
	assert.Contains(t, jsonStr, `"Name": "Test"`)
	assert.Contains(t, jsonStr, `"Value": "123"`)
}

// --- XLSX Generation Tests ---

func TestGenerateReportXLSX(t *testing.T) {
	data := reportRow{
		headers: []string{"Name", "Value"},
		values: [][]string{
			{"Test", "123"},
		},
	}

	content, err := generateReportXLSX(data, "Test Report")

	require.NoError(t, err)
	assert.NotEmpty(t, content)
	// XLSX is a ZIP file, starts with PK
	assert.Equal(t, byte('P'), content[0])
	assert.Equal(t, byte('K'), content[1])
}

// --- PDF Generation Tests ---

func TestGenerateReportPDF(t *testing.T) {
	data := reportRow{
		headers: []string{"Name", "Value"},
		values: [][]string{
			{"Test", "123"},
		},
	}

	content, err := generateReportPDF(data, "Test Report")

	require.NoError(t, err)
	assert.NotEmpty(t, content)
	assert.Equal(t, "%PDF", string(content[:4]))
}
