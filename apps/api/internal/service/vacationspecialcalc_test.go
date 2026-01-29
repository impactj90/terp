package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
)

// --- Mocks ---

type mockVacationSpecialCalcRepo struct {
	mock.Mock
}

func (m *mockVacationSpecialCalcRepo) Create(ctx context.Context, calc *model.VacationSpecialCalculation) error {
	args := m.Called(ctx, calc)
	// Simulate ID assignment
	if calc.ID == uuid.Nil {
		calc.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockVacationSpecialCalcRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationSpecialCalculation, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationSpecialCalculation), args.Error(1)
}

func (m *mockVacationSpecialCalcRepo) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.VacationSpecialCalculation), args.Error(1)
}

func (m *mockVacationSpecialCalcRepo) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationSpecialCalculation, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.VacationSpecialCalculation), args.Error(1)
}

func (m *mockVacationSpecialCalcRepo) ListByType(ctx context.Context, tenantID uuid.UUID, calcType string) ([]model.VacationSpecialCalculation, error) {
	args := m.Called(ctx, tenantID, calcType)
	return args.Get(0).([]model.VacationSpecialCalculation), args.Error(1)
}

func (m *mockVacationSpecialCalcRepo) ListByIDs(ctx context.Context, ids []uuid.UUID) ([]model.VacationSpecialCalculation, error) {
	args := m.Called(ctx, ids)
	return args.Get(0).([]model.VacationSpecialCalculation), args.Error(1)
}

func (m *mockVacationSpecialCalcRepo) Update(ctx context.Context, calc *model.VacationSpecialCalculation) error {
	args := m.Called(ctx, calc)
	return args.Error(0)
}

func (m *mockVacationSpecialCalcRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockVacationSpecialCalcRepo) CountGroupUsages(ctx context.Context, specialCalcID uuid.UUID) (int64, error) {
	args := m.Called(ctx, specialCalcID)
	return args.Get(0).(int64), args.Error(1)
}

func (m *mockVacationSpecialCalcRepo) ExistsByTypeAndThreshold(ctx context.Context, tenantID uuid.UUID, calcType string, threshold int) (bool, error) {
	args := m.Called(ctx, tenantID, calcType, threshold)
	return args.Bool(0), args.Error(1)
}

// --- Tests ---

func TestVacationSpecialCalcService_Create_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationSpecialCalcService(repo)

	tenantID := uuid.New()

	repo.On("ExistsByTypeAndThreshold", ctx, tenantID, "age", 50).Return(false, nil)
	repo.On("Create", ctx, mock.AnythingOfType("*model.VacationSpecialCalculation")).Return(nil)

	calc, err := svc.Create(ctx, CreateVacationSpecialCalcInput{
		TenantID:  tenantID,
		Type:      "age",
		Threshold: 50,
		BonusDays: 2.0,
	})

	require.NoError(t, err)
	assert.Equal(t, model.VacationSpecialCalcAge, calc.Type)
	assert.Equal(t, 50, calc.Threshold)
	assert.True(t, decimal.NewFromFloat(2.0).Equal(calc.BonusDays))
	assert.True(t, calc.IsActive)
	repo.AssertExpectations(t)
}

func TestVacationSpecialCalcService_Create_DisabilityThresholdMustBeZero(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationSpecialCalcService(repo)

	_, err := svc.Create(ctx, CreateVacationSpecialCalcInput{
		TenantID:  uuid.New(),
		Type:      "disability",
		Threshold: 5, // invalid for disability
		BonusDays: 5.0,
	})

	assert.ErrorIs(t, err, ErrVacationSpecialCalcInvalidThreshold)
}

func TestVacationSpecialCalcService_Create_InvalidType(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationSpecialCalcService(repo)

	_, err := svc.Create(ctx, CreateVacationSpecialCalcInput{
		TenantID:  uuid.New(),
		Type:      "invalid",
		BonusDays: 1.0,
	})

	assert.ErrorIs(t, err, ErrVacationSpecialCalcTypeInvalid)
}

func TestVacationSpecialCalcService_Create_Duplicate(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationSpecialCalcService(repo)

	tenantID := uuid.New()
	repo.On("ExistsByTypeAndThreshold", ctx, tenantID, "age", 50).Return(true, nil)

	_, err := svc.Create(ctx, CreateVacationSpecialCalcInput{
		TenantID:  tenantID,
		Type:      "age",
		Threshold: 50,
		BonusDays: 2.0,
	})

	assert.ErrorIs(t, err, ErrVacationSpecialCalcDuplicate)
}

func TestVacationSpecialCalcService_Create_ZeroBonusDays(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationSpecialCalcService(repo)

	_, err := svc.Create(ctx, CreateVacationSpecialCalcInput{
		TenantID:  uuid.New(),
		Type:      "age",
		Threshold: 50,
		BonusDays: 0,
	})

	assert.ErrorIs(t, err, ErrVacationSpecialCalcBonusRequired)
}

func TestVacationSpecialCalcService_Delete_InUse(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationSpecialCalcService(repo)

	calcID := uuid.New()
	repo.On("GetByID", ctx, calcID).Return(&model.VacationSpecialCalculation{ID: calcID}, nil)
	repo.On("CountGroupUsages", ctx, calcID).Return(int64(2), nil)

	err := svc.Delete(ctx, calcID)

	assert.ErrorIs(t, err, ErrVacationSpecialCalcInUse)
}

func TestVacationSpecialCalcService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationSpecialCalcService(repo)

	calcID := uuid.New()
	repo.On("GetByID", ctx, calcID).Return(&model.VacationSpecialCalculation{ID: calcID}, nil)
	repo.On("CountGroupUsages", ctx, calcID).Return(int64(0), nil)
	repo.On("Delete", ctx, calcID).Return(nil)

	err := svc.Delete(ctx, calcID)

	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestVacationSpecialCalcService_Update_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationSpecialCalcService(repo)

	calcID := uuid.New()
	existing := &model.VacationSpecialCalculation{
		ID:        calcID,
		Type:      model.VacationSpecialCalcAge,
		Threshold: 50,
		BonusDays: decimal.NewFromFloat(2.0),
		IsActive:  true,
	}
	repo.On("GetByID", ctx, calcID).Return(existing, nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.VacationSpecialCalculation")).Return(nil)

	newBonus := 3.0
	updated, err := svc.Update(ctx, calcID, UpdateVacationSpecialCalcInput{
		BonusDays: &newBonus,
	})

	require.NoError(t, err)
	assert.True(t, decimal.NewFromFloat(3.0).Equal(updated.BonusDays))
	repo.AssertExpectations(t)
}
