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

type mockPayrollExportRepo struct {
	mock.Mock
}

func (m *mockPayrollExportRepo) Create(ctx context.Context, pe *model.PayrollExport) error {
	args := m.Called(ctx, pe)
	if pe.ID == uuid.Nil {
		pe.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockPayrollExportRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.PayrollExport), args.Error(1)
}

func (m *mockPayrollExportRepo) Update(ctx context.Context, pe *model.PayrollExport) error {
	args := m.Called(ctx, pe)
	return args.Error(0)
}

func (m *mockPayrollExportRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockPayrollExportRepo) List(ctx context.Context, filter repository.PayrollExportFilter) ([]model.PayrollExport, error) {
	args := m.Called(ctx, filter)
	return args.Get(0).([]model.PayrollExport), args.Error(1)
}

type mockPayrollMonthlyValueRepo struct {
	mock.Mock
}

func (m *mockPayrollMonthlyValueRepo) GetByEmployeeMonth(ctx context.Context, employeeID uuid.UUID, year, month int) (*model.MonthlyValue, error) {
	args := m.Called(ctx, employeeID, year, month)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.MonthlyValue), args.Error(1)
}

type mockPayrollEmployeeRepo struct {
	mock.Mock
}

func (m *mockPayrollEmployeeRepo) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
	args := m.Called(ctx, filter)
	return args.Get(0).([]model.Employee), args.Get(1).(int64), args.Error(2)
}

type mockPayrollAccountRepo struct {
	mock.Mock
}

func (m *mockPayrollAccountRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.Account, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Account), args.Error(1)
}

type mockPayrollExportInterfaceRepo struct {
	mock.Mock
}

func (m *mockPayrollExportInterfaceRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.ExportInterface), args.Error(1)
}

func (m *mockPayrollExportInterfaceRepo) ListAccounts(ctx context.Context, interfaceID uuid.UUID) ([]model.ExportInterfaceAccount, error) {
	args := m.Called(ctx, interfaceID)
	return args.Get(0).([]model.ExportInterfaceAccount), args.Error(1)
}

// --- Tests ---

func TestPayrollExportService_Generate_Success(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	mvRepo := new(mockPayrollMonthlyValueRepo)
	empRepo := new(mockPayrollEmployeeRepo)
	acctRepo := new(mockPayrollAccountRepo)
	eiRepo := new(mockPayrollExportInterfaceRepo)
	svc := NewPayrollExportService(peRepo, mvRepo, empRepo, acctRepo, eiRepo)

	tenantID := uuid.New()
	emp1ID := uuid.New()

	// Mock employee list
	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{
		{
			ID:              emp1ID,
			TenantID:        tenantID,
			PersonnelNumber: "EMP001",
			FirstName:       "Max",
			LastName:         "Mustermann",
		},
	}, int64(1), nil)

	// Mock monthly value for employee
	mvRepo.On("GetByEmployeeMonth", ctx, emp1ID, 2025, 1).Return(&model.MonthlyValue{
		EmployeeID:      emp1ID,
		TotalTargetTime: 480, // 8 hours in minutes
		TotalNetTime:    510, // 8.5 hours in minutes
		TotalOvertime:   30,  // 0.5 hours in minutes
		VacationTaken:   decimal.NewFromFloat(2.0),
		SickDays:        1,
		OtherAbsenceDays: 0,
		IsClosed:        true,
	}, nil)

	// Mock repo operations
	peRepo.On("Create", ctx, mock.AnythingOfType("*model.PayrollExport")).Return(nil)
	peRepo.On("Update", ctx, mock.AnythingOfType("*model.PayrollExport")).Return(nil)

	pe, err := svc.Generate(ctx, GeneratePayrollExportInput{
		TenantID: tenantID,
		Year:     2025,
		Month:    1,
		Format:   "csv",
	})

	require.NoError(t, err)
	assert.NotNil(t, pe)
	assert.Equal(t, model.PayrollExportStatusCompleted, pe.Status)
	assert.Equal(t, 1, pe.EmployeeCount)
	assert.NotNil(t, pe.FileContent)
	assert.NotNil(t, pe.CompletedAt)
	peRepo.AssertExpectations(t)
	mvRepo.AssertExpectations(t)
	empRepo.AssertExpectations(t)
}

func TestPayrollExportService_Generate_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc := NewPayrollExportService(nil, nil, nil, nil, nil)

	_, err := svc.Generate(ctx, GeneratePayrollExportInput{
		TenantID: uuid.New(),
		Year:     0,
		Month:    1,
	})

	assert.ErrorIs(t, err, ErrPayrollExportYearRequired)
}

func TestPayrollExportService_Generate_InvalidMonth(t *testing.T) {
	ctx := context.Background()
	svc := NewPayrollExportService(nil, nil, nil, nil, nil)

	_, err := svc.Generate(ctx, GeneratePayrollExportInput{
		TenantID: uuid.New(),
		Year:     2025,
		Month:    13,
	})

	assert.ErrorIs(t, err, ErrPayrollExportMonthInvalid)
}

func TestPayrollExportService_Generate_InvalidMonthZero(t *testing.T) {
	ctx := context.Background()
	svc := NewPayrollExportService(nil, nil, nil, nil, nil)

	_, err := svc.Generate(ctx, GeneratePayrollExportInput{
		TenantID: uuid.New(),
		Year:     2025,
		Month:    0,
	})

	assert.ErrorIs(t, err, ErrPayrollExportMonthInvalid)
}

func TestPayrollExportService_Generate_InvalidFormat(t *testing.T) {
	ctx := context.Background()
	svc := NewPayrollExportService(nil, nil, nil, nil, nil)

	_, err := svc.Generate(ctx, GeneratePayrollExportInput{
		TenantID: uuid.New(),
		Year:     2025,
		Month:    1,
		Format:   "pdf",
	})

	assert.ErrorIs(t, err, ErrPayrollExportFormatInvalid)
}

func TestPayrollExportService_Generate_DefaultFormat(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	mvRepo := new(mockPayrollMonthlyValueRepo)
	empRepo := new(mockPayrollEmployeeRepo)
	acctRepo := new(mockPayrollAccountRepo)
	eiRepo := new(mockPayrollExportInterfaceRepo)
	svc := NewPayrollExportService(peRepo, mvRepo, empRepo, acctRepo, eiRepo)

	tenantID := uuid.New()

	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{}, int64(0), nil)
	peRepo.On("Create", ctx, mock.AnythingOfType("*model.PayrollExport")).Return(nil)
	peRepo.On("Update", ctx, mock.AnythingOfType("*model.PayrollExport")).Return(nil)

	pe, err := svc.Generate(ctx, GeneratePayrollExportInput{
		TenantID: tenantID,
		Year:     2025,
		Month:    1,
		Format:   "", // Should default to csv
	})

	require.NoError(t, err)
	assert.Equal(t, model.PayrollExportFormatCSV, pe.Format)
}

func TestPayrollExportService_Generate_WithInterface(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	mvRepo := new(mockPayrollMonthlyValueRepo)
	empRepo := new(mockPayrollEmployeeRepo)
	acctRepo := new(mockPayrollAccountRepo)
	eiRepo := new(mockPayrollExportInterfaceRepo)
	svc := NewPayrollExportService(peRepo, mvRepo, empRepo, acctRepo, eiRepo)

	tenantID := uuid.New()
	interfaceID := uuid.New()
	accountID := uuid.New()
	emp1ID := uuid.New()

	empRepo.On("List", ctx, mock.AnythingOfType("repository.EmployeeFilter")).Return([]model.Employee{
		{ID: emp1ID, PersonnelNumber: "EMP001", FirstName: "Max", LastName: "Mustermann"},
	}, int64(1), nil)

	mvRepo.On("GetByEmployeeMonth", ctx, emp1ID, 2025, 3).Return(&model.MonthlyValue{
		EmployeeID:      emp1ID,
		TotalTargetTime: 480,
		TotalNetTime:    480,
		VacationTaken:   decimal.Zero,
		IsClosed:        true,
	}, nil)

	// Interface accounts
	eiRepo.On("ListAccounts", ctx, interfaceID).Return([]model.ExportInterfaceAccount{
		{AccountID: accountID, SortOrder: 0},
	}, nil)

	// Account lookup
	acctRepo.On("GetByID", ctx, accountID).Return(&model.Account{
		ID:   accountID,
		Code: "OT100",
		Name: "Overtime 100%",
	}, nil)

	peRepo.On("Create", ctx, mock.AnythingOfType("*model.PayrollExport")).Return(nil)
	peRepo.On("Update", ctx, mock.AnythingOfType("*model.PayrollExport")).Return(nil)

	pe, err := svc.Generate(ctx, GeneratePayrollExportInput{
		TenantID:          tenantID,
		Year:              2025,
		Month:             3,
		Format:            "csv",
		ExportInterfaceID: &interfaceID,
	})

	require.NoError(t, err)
	assert.Equal(t, model.PayrollExportStatusCompleted, pe.Status)
	assert.NotNil(t, pe.ExportInterfaceID)
	assert.Equal(t, interfaceID, *pe.ExportInterfaceID)
}

func TestPayrollExportService_GetByID_Success(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	svc := NewPayrollExportService(peRepo, nil, nil, nil, nil)

	peID := uuid.New()
	expected := &model.PayrollExport{
		ID:     peID,
		Year:   2025,
		Month:  1,
		Status: model.PayrollExportStatusCompleted,
	}
	peRepo.On("GetByID", ctx, peID).Return(expected, nil)

	result, err := svc.GetByID(ctx, peID)

	require.NoError(t, err)
	assert.Equal(t, peID, result.ID)
}

func TestPayrollExportService_GetByID_NotFound(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	svc := NewPayrollExportService(peRepo, nil, nil, nil, nil)

	peID := uuid.New()
	peRepo.On("GetByID", ctx, peID).Return(nil, errors.New("not found"))

	_, err := svc.GetByID(ctx, peID)

	assert.ErrorIs(t, err, ErrPayrollExportNotFound)
}

func TestPayrollExportService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	svc := NewPayrollExportService(peRepo, nil, nil, nil, nil)

	peID := uuid.New()
	peRepo.On("GetByID", ctx, peID).Return(&model.PayrollExport{ID: peID}, nil)
	peRepo.On("Delete", ctx, peID).Return(nil)

	err := svc.Delete(ctx, peID)

	assert.NoError(t, err)
	peRepo.AssertExpectations(t)
}

func TestPayrollExportService_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	svc := NewPayrollExportService(peRepo, nil, nil, nil, nil)

	peID := uuid.New()
	peRepo.On("GetByID", ctx, peID).Return(nil, errors.New("not found"))

	err := svc.Delete(ctx, peID)

	assert.ErrorIs(t, err, ErrPayrollExportNotFound)
}

func TestPayrollExportService_List(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	svc := NewPayrollExportService(peRepo, nil, nil, nil, nil)

	tenantID := uuid.New()
	exports := []model.PayrollExport{
		{ID: uuid.New(), Year: 2025, Month: 1, Status: model.PayrollExportStatusCompleted},
		{ID: uuid.New(), Year: 2025, Month: 2, Status: model.PayrollExportStatusCompleted},
	}
	peRepo.On("List", ctx, mock.AnythingOfType("repository.PayrollExportFilter")).Return(exports, nil)

	result, hasMore, err := svc.List(ctx, PayrollExportListFilter{
		TenantID: tenantID,
		Limit:    20,
	})

	require.NoError(t, err)
	assert.Len(t, result, 2)
	assert.False(t, hasMore)
}

func TestPayrollExportService_GetDownloadContent_Success(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	svc := NewPayrollExportService(peRepo, nil, nil, nil, nil)

	content := "PersonnelNumber;FirstName;LastName\nEMP001;Max;Mustermann\n"
	peID := uuid.New()
	peRepo.On("GetByID", ctx, peID).Return(&model.PayrollExport{
		ID:          peID,
		Year:        2025,
		Month:       1,
		Status:      model.PayrollExportStatusCompleted,
		Format:      model.PayrollExportFormatCSV,
		FileContent: &content,
	}, nil)

	data, contentType, filename, err := svc.GetDownloadContent(ctx, peID)

	require.NoError(t, err)
	assert.Equal(t, content, data)
	assert.Equal(t, "text/csv", contentType)
	assert.Equal(t, "payroll_export_2025_01.csv", filename)
}

func TestPayrollExportService_GetDownloadContent_NotReady(t *testing.T) {
	ctx := context.Background()
	peRepo := new(mockPayrollExportRepo)
	svc := NewPayrollExportService(peRepo, nil, nil, nil, nil)

	peID := uuid.New()
	peRepo.On("GetByID", ctx, peID).Return(&model.PayrollExport{
		ID:     peID,
		Status: model.PayrollExportStatusPending,
	}, nil)

	_, _, _, err := svc.GetDownloadContent(ctx, peID)

	assert.ErrorIs(t, err, ErrPayrollExportNotReady)
}

func TestGenerateCSV(t *testing.T) {
	lines := []model.PayrollExportLine{
		{
			PersonnelNumber: "EMP001",
			FirstName:       "Max",
			LastName:        "Mustermann",
			DepartmentCode:  "DEV",
			CostCenterCode:  "CC100",
			TargetHours:     decimal.NewFromFloat(160.00),
			WorkedHours:     decimal.NewFromFloat(168.50),
			OvertimeHours:   decimal.NewFromFloat(8.50),
			AccountValues:   map[string]float64{},
			VacationDays:    decimal.NewFromFloat(2.00),
			SickDays:        decimal.NewFromFloat(1.00),
			OtherAbsenceDays: decimal.NewFromFloat(0.00),
		},
	}

	csv, err := generateCSV(lines, map[uuid.UUID]string{})

	require.NoError(t, err)
	assert.Contains(t, csv, "PersonnelNumber")
	assert.Contains(t, csv, "EMP001")
	assert.Contains(t, csv, "Max")
	assert.Contains(t, csv, "Mustermann")
	assert.Contains(t, csv, "160.00")
	assert.Contains(t, csv, "168.50")
	assert.Contains(t, csv, "8.50")
	assert.Contains(t, csv, "2.00")
	assert.Contains(t, csv, "1.00")
}
