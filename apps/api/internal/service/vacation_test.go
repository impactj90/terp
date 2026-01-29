package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

// --- Mock implementations ---

type mockVacationBalanceRepoForVacation struct {
	mock.Mock
}

func (m *mockVacationBalanceRepoForVacation) GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	args := m.Called(ctx, employeeID, year)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationBalance), args.Error(1)
}

func (m *mockVacationBalanceRepoForVacation) Upsert(ctx context.Context, balance *model.VacationBalance) error {
	args := m.Called(ctx, balance)
	return args.Error(0)
}

func (m *mockVacationBalanceRepoForVacation) UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error {
	args := m.Called(ctx, employeeID, year, taken)
	return args.Error(0)
}

type mockAbsenceDayRepoForVacation struct {
	mock.Mock
}

func (m *mockAbsenceDayRepoForVacation) CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error) {
	args := m.Called(ctx, employeeID, typeID, from, to)
	return args.Get(0).(decimal.Decimal), args.Error(1)
}

type mockAbsenceTypeRepoForVacation struct {
	mock.Mock
}

func (m *mockAbsenceTypeRepoForVacation) List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error) {
	args := m.Called(ctx, tenantID, includeSystem)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]model.AbsenceType), args.Error(1)
}

type mockEmployeeRepoForVacation struct {
	mock.Mock
}

func (m *mockEmployeeRepoForVacation) GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Employee), args.Error(1)
}

type mockTenantRepoForVacation struct {
	mock.Mock
}

func (m *mockTenantRepoForVacation) GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Tenant), args.Error(1)
}

type mockTariffRepoForVacation struct {
	mock.Mock
}

func (m *mockTariffRepoForVacation) GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Tariff), args.Error(1)
}

// --- Test helper ---

func newTestVacationService(maxCarryover decimal.Decimal) (
	*VacationService,
	*mockVacationBalanceRepoForVacation,
	*mockAbsenceDayRepoForVacation,
	*mockAbsenceTypeRepoForVacation,
	*mockEmployeeRepoForVacation,
	*mockTenantRepoForVacation,
	*mockTariffRepoForVacation,
) {
	vacBalanceRepo := new(mockVacationBalanceRepoForVacation)
	absenceDayRepo := new(mockAbsenceDayRepoForVacation)
	absenceTypeRepo := new(mockAbsenceTypeRepoForVacation)
	employeeRepo := new(mockEmployeeRepoForVacation)
	tenantRepo := new(mockTenantRepoForVacation)
	tariffRepo := new(mockTariffRepoForVacation)

	svc := NewVacationService(
		vacBalanceRepo,
		absenceDayRepo,
		absenceTypeRepo,
		employeeRepo,
		tenantRepo,
		tariffRepo,
		maxCarryover,
	)
	return svc, vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, tenantRepo, tariffRepo
}

// --- GetBalance Tests ---

func TestVacationService_GetBalance_Success(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	year := 2026
	expected := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        year,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(5),
		Taken:       decimal.NewFromInt(10),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, year).Return(expected, nil)

	result, err := svc.GetBalance(ctx, employeeID, year)

	require.NoError(t, err)
	assert.Equal(t, decimal.NewFromInt(30), result.Entitlement)
	assert.Equal(t, decimal.NewFromInt(5), result.Carryover)
	assert.Equal(t, decimal.NewFromInt(10), result.Taken)
	// Verify derived values
	assert.Equal(t, decimal.NewFromInt(35), result.Total())     // 30 + 5 + 0
	assert.Equal(t, decimal.NewFromInt(25), result.Available()) // 35 - 10
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_GetBalance_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)

	_, err := svc.GetBalance(ctx, employeeID, 2026)

	assert.ErrorIs(t, err, ErrVacationBalanceNotFound)
}

func TestVacationService_GetBalance_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	_, err := svc.GetBalance(ctx, uuid.New(), 1800)
	assert.ErrorIs(t, err, ErrInvalidYear)

	_, err = svc.GetBalance(ctx, uuid.New(), 2500)
	assert.ErrorIs(t, err, ErrInvalidYear)
}

// --- InitializeYear Tests ---

func TestVacationService_InitializeYear_FullYear(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo, tenantRepo, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{
		ID:                  employeeID,
		TenantID:            tenantID,
		EntryDate:           time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC), // Employed since 2020
		WeeklyHours:         decimal.NewFromInt(40),                      // Full-time
		VacationDaysPerYear: decimal.NewFromInt(30),
	}

	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
	tenantRepo.On("GetByID", ctx, tenantID).Return(&model.Tenant{
		ID:            tenantID,
		VacationBasis: model.VacationBasisCalendarYear,
	}, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil) // No existing balance
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		return b.EmployeeID == employeeID &&
			b.Year == 2026 &&
			b.TenantID == tenantID &&
			b.Entitlement.Equal(decimal.NewFromInt(30)) // Full year, full-time = 30
	})).Return(nil)

	result, err := svc.InitializeYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.True(t, result.Entitlement.Equal(decimal.NewFromInt(30)), "expected 30, got %s", result.Entitlement)
	vacBalanceRepo.AssertExpectations(t)
	employeeRepo.AssertExpectations(t)
}

func TestVacationService_InitializeYear_PartYear(t *testing.T) {
	// Employee started July 1, 2026 -> 6 months -> 30 * 6/12 = 15 days
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo, tenantRepo, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{
		ID:                  employeeID,
		TenantID:            tenantID,
		EntryDate:           time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC), // Started mid-year
		WeeklyHours:         decimal.NewFromInt(40),
		VacationDaysPerYear: decimal.NewFromInt(30),
	}

	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
	tenantRepo.On("GetByID", ctx, tenantID).Return(&model.Tenant{
		ID:            tenantID,
		VacationBasis: model.VacationBasisCalendarYear,
	}, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 6 months (Jul-Dec) -> 30 * 6/12 = 15.0
		return b.Entitlement.Equal(decimal.NewFromInt(15))
	})).Return(nil)

	result, err := svc.InitializeYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.True(t, result.Entitlement.Equal(decimal.NewFromInt(15)), "expected 15, got %s", result.Entitlement)
}

func TestVacationService_InitializeYear_PartTime(t *testing.T) {
	// Employee works 20h/week out of 40h standard -> 30 * 20/40 = 15 days
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo, tenantRepo, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{
		ID:                  employeeID,
		TenantID:            tenantID,
		EntryDate:           time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:         decimal.NewFromInt(20), // Half-time
		VacationDaysPerYear: decimal.NewFromInt(30),
	}

	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
	tenantRepo.On("GetByID", ctx, tenantID).Return(&model.Tenant{
		ID:            tenantID,
		VacationBasis: model.VacationBasisCalendarYear,
	}, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// Full year, part-time: 30 * (20/40) = 15.0
		return b.Entitlement.Equal(decimal.NewFromInt(15))
	})).Return(nil)

	result, err := svc.InitializeYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.True(t, result.Entitlement.Equal(decimal.NewFromInt(15)), "expected 15, got %s", result.Entitlement)
}

func TestVacationService_InitializeYear_PreservesExistingFields(t *testing.T) {
	// When re-initializing, carryover/adjustments/taken should be preserved
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo, tenantRepo, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{
		ID:                  employeeID,
		TenantID:            tenantID,
		EntryDate:           time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:         decimal.NewFromInt(40),
		VacationDaysPerYear: decimal.NewFromInt(30),
	}

	existing := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(25), // Old value
		Carryover:   decimal.NewFromInt(5),
		Adjustments: decimal.NewFromInt(2),
		Taken:       decimal.NewFromInt(10),
	}

	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)
	tenantRepo.On("GetByID", ctx, tenantID).Return(&model.Tenant{
		ID:            tenantID,
		VacationBasis: model.VacationBasisCalendarYear,
	}, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(existing, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// Entitlement recalculated, but carryover/adjustments/taken preserved
		return b.Entitlement.Equal(decimal.NewFromInt(30)) &&
			b.Carryover.Equal(decimal.NewFromInt(5)) &&
			b.Adjustments.Equal(decimal.NewFromInt(2)) &&
			b.Taken.Equal(decimal.NewFromInt(10))
	})).Return(nil)

	result, err := svc.InitializeYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	assert.True(t, result.Entitlement.Equal(decimal.NewFromInt(30)), "expected 30, got %s", result.Entitlement)
	assert.True(t, result.Carryover.Equal(decimal.NewFromInt(5)), "expected 5, got %s", result.Carryover)
}

func TestVacationService_InitializeYear_EmployeeNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, employeeRepo, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employeeRepo.On("GetByID", ctx, employeeID).Return(nil, errors.New("not found"))

	_, err := svc.InitializeYear(ctx, employeeID, 2026)

	assert.ErrorIs(t, err, ErrEmployeeNotFound)
}

func TestVacationService_InitializeYear_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	_, err := svc.InitializeYear(ctx, uuid.New(), 0)
	assert.ErrorIs(t, err, ErrInvalidYear)
}

func TestVacationService_ResolveVacationBasis_UsesTenantDefault(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, tenantRepo, _ := newTestVacationService(decimal.Zero)

	tenantID := uuid.New()
	employee := &model.Employee{TenantID: tenantID}

	tenantRepo.On("GetByID", ctx, tenantID).Return(&model.Tenant{
		ID:            tenantID,
		VacationBasis: model.VacationBasisEntryDate,
	}, nil)

	basis := svc.resolveVacationBasis(ctx, employee)
	assert.Equal(t, calculation.VacationBasisEntryDate, basis)
}

// --- RecalculateTaken Tests ---

func TestVacationService_RecalculateTaken_Success(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	vacTypeID := uuid.New()
	specialTypeID := uuid.New()
	nonVacTypeID := uuid.New()

	absenceTypeRepo.On("List", ctx, tenantID, true).Return([]model.AbsenceType{
		{ID: vacTypeID, DeductsVacation: true},
		{ID: specialTypeID, DeductsVacation: true},
		{ID: nonVacTypeID, DeductsVacation: false}, // Illness - should not count
	}, nil)

	yearStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)

	absenceDayRepo.On("CountByTypeInRange", ctx, employeeID, vacTypeID, yearStart, yearEnd).
		Return(decimal.NewFromFloat(5.5), nil)
	absenceDayRepo.On("CountByTypeInRange", ctx, employeeID, specialTypeID, yearStart, yearEnd).
		Return(decimal.NewFromFloat(2.0), nil)

	// Total taken should be 5.5 + 2.0 = 7.5
	vacBalanceRepo.On("UpdateTaken", ctx, employeeID, 2026, decimal.NewFromFloat(7.5)).Return(nil)

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
	absenceDayRepo.AssertExpectations(t)
}

func TestVacationService_RecalculateTaken_NoVacationTypes(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, absenceTypeRepo, employeeRepo, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// No types deduct vacation
	absenceTypeRepo.On("List", ctx, tenantID, true).Return([]model.AbsenceType{
		{ID: uuid.New(), DeductsVacation: false},
	}, nil)

	// Total taken should be 0
	vacBalanceRepo.On("UpdateTaken", ctx, employeeID, 2026, decimal.Zero).Return(nil)

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_RecalculateTaken_EmployeeNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, employeeRepo, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employeeRepo.On("GetByID", ctx, employeeID).Return(nil, errors.New("not found"))

	err := svc.RecalculateTaken(ctx, employeeID, 2026)

	assert.ErrorIs(t, err, ErrEmployeeNotFound)
}

func TestVacationService_RecalculateTaken_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	err := svc.RecalculateTaken(ctx, uuid.New(), -1)
	assert.ErrorIs(t, err, ErrInvalidYear)
}

// --- AdjustBalance Tests ---

func TestVacationService_AdjustBalance_Success(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	existing := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Adjustments: decimal.NewFromInt(2), // Already has 2 days adjustment
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(existing, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// Adjustments should be 2 + 3 = 5
		return b.Adjustments.Equal(decimal.NewFromInt(5))
	})).Return(nil)

	err := svc.AdjustBalance(ctx, employeeID, 2026, decimal.NewFromInt(3), "bonus days")

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_AdjustBalance_NegativeAdjustment(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	existing := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2026,
		Adjustments: decimal.NewFromInt(5),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(existing, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 5 + (-2) = 3
		return b.Adjustments.Equal(decimal.NewFromInt(3))
	})).Return(nil)

	err := svc.AdjustBalance(ctx, employeeID, 2026, decimal.NewFromInt(-2), "correction")

	require.NoError(t, err)
}

func TestVacationService_AdjustBalance_NotFound(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)

	err := svc.AdjustBalance(ctx, employeeID, 2026, decimal.NewFromInt(1), "test")

	assert.ErrorIs(t, err, ErrVacationBalanceNotFound)
}

func TestVacationService_AdjustBalance_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	err := svc.AdjustBalance(ctx, uuid.New(), 0, decimal.NewFromInt(1), "test")
	assert.ErrorIs(t, err, ErrInvalidYear)
}

// --- CarryoverFromPreviousYear Tests ---

func TestVacationService_CarryoverFromPreviousYear_Success(t *testing.T) {
	ctx := context.Background()
	maxCarryover := decimal.NewFromInt(10)
	svc, vacBalanceRepo, _, _, employeeRepo, _, _ := newTestVacationService(maxCarryover)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Previous year: 30 entitlement - 22 taken = 8 available
	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(22),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil) // No current year balance yet
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 8 available, max 10 -> carryover = 8 (under max)
		return b.Year == 2026 &&
			b.EmployeeID == employeeID &&
			b.Carryover.Equal(decimal.NewFromInt(8))
	})).Return(nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_CarryoverFromPreviousYear_CappedAtMax(t *testing.T) {
	ctx := context.Background()
	maxCarryover := decimal.NewFromInt(5)
	svc, vacBalanceRepo, _, _, employeeRepo, _, _ := newTestVacationService(maxCarryover)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Previous year: 30 entitlement - 20 taken = 10 available
	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(20),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 10 available, max 5 -> carryover = 5 (capped)
		return b.Carryover.Equal(decimal.NewFromInt(5))
	})).Return(nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_CarryoverFromPreviousYear_Unlimited(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo, _, _ := newTestVacationService(decimal.Zero) // 0 = unlimited

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Previous year: 30 entitlement - 10 taken = 20 available
	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(10),
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(nil, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// 20 available, unlimited -> carryover = 20
		return b.Carryover.Equal(decimal.NewFromInt(20))
	})).Return(nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_CarryoverFromPreviousYear_NoPreviousBalance(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employee := &model.Employee{ID: employeeID, TenantID: uuid.New()}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// No previous year balance
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(nil, nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	// Verify Upsert was NOT called (no carryover to process)
	vacBalanceRepo.AssertNotCalled(t, "Upsert")
}

func TestVacationService_CarryoverFromPreviousYear_NegativeAvailable(t *testing.T) {
	ctx := context.Background()
	svc, vacBalanceRepo, _, _, employeeRepo, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employee := &model.Employee{ID: employeeID, TenantID: uuid.New()}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	// Previous year: overbooked (taken > total)
	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(35), // Overspent
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	// CalculateCarryover returns 0 for negative available; no Upsert expected
	vacBalanceRepo.AssertNotCalled(t, "Upsert")
}

func TestVacationService_CarryoverFromPreviousYear_UpdatesExisting(t *testing.T) {
	ctx := context.Background()
	maxCarryover := decimal.NewFromInt(10)
	svc, vacBalanceRepo, _, _, employeeRepo, _, _ := newTestVacationService(maxCarryover)

	employeeID := uuid.New()
	tenantID := uuid.New()

	employee := &model.Employee{ID: employeeID, TenantID: tenantID}
	employeeRepo.On("GetByID", ctx, employeeID).Return(employee, nil)

	prevBalance := &model.VacationBalance{
		EmployeeID:  employeeID,
		Year:        2025,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(25), // 5 available
	}

	// Current year balance already exists (e.g., InitializeYear was called)
	currentBalance := &model.VacationBalance{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(3), // Old carryover to be replaced
	}

	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2025).Return(prevBalance, nil)
	vacBalanceRepo.On("GetByEmployeeYear", ctx, employeeID, 2026).Return(currentBalance, nil)
	vacBalanceRepo.On("Upsert", ctx, mock.MatchedBy(func(b *model.VacationBalance) bool {
		// Carryover replaced with new value (5), not accumulated
		return b.Carryover.Equal(decimal.NewFromInt(5)) &&
			b.Entitlement.Equal(decimal.NewFromInt(30)) // Entitlement preserved
	})).Return(nil)

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	require.NoError(t, err)
	vacBalanceRepo.AssertExpectations(t)
}

func TestVacationService_CarryoverFromPreviousYear_EmployeeNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, employeeRepo, _, _ := newTestVacationService(decimal.Zero)

	employeeID := uuid.New()
	employeeRepo.On("GetByID", ctx, employeeID).Return(nil, errors.New("not found"))

	err := svc.CarryoverFromPreviousYear(ctx, employeeID, 2026)

	assert.ErrorIs(t, err, ErrEmployeeNotFound)
}

func TestVacationService_CarryoverFromPreviousYear_InvalidYear(t *testing.T) {
	ctx := context.Background()
	svc, _, _, _, _, _, _ := newTestVacationService(decimal.Zero)

	err := svc.CarryoverFromPreviousYear(ctx, uuid.New(), 1900) // min is 1901 for carryover
	assert.ErrorIs(t, err, ErrInvalidYear)
}
