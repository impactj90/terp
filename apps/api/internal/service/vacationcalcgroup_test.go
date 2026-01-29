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

type mockVacationCalcGroupRepo struct {
	mock.Mock
}

func (m *mockVacationCalcGroupRepo) Create(ctx context.Context, group *model.VacationCalculationGroup) error {
	args := m.Called(ctx, group)
	if group.ID == uuid.Nil {
		group.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockVacationCalcGroupRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCalculationGroup, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationCalculationGroup), args.Error(1)
}

func (m *mockVacationCalcGroupRepo) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCalculationGroup, error) {
	args := m.Called(ctx, tenantID, code)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationCalculationGroup), args.Error(1)
}

func (m *mockVacationCalcGroupRepo) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.VacationCalculationGroup), args.Error(1)
}

func (m *mockVacationCalcGroupRepo) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCalculationGroup, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.VacationCalculationGroup), args.Error(1)
}

func (m *mockVacationCalcGroupRepo) Update(ctx context.Context, group *model.VacationCalculationGroup) error {
	args := m.Called(ctx, group)
	return args.Error(0)
}

func (m *mockVacationCalcGroupRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockVacationCalcGroupRepo) CountEmploymentTypeUsages(ctx context.Context, groupID uuid.UUID) (int64, error) {
	args := m.Called(ctx, groupID)
	return args.Get(0).(int64), args.Error(1)
}

func (m *mockVacationCalcGroupRepo) ReplaceSpecialCalculations(ctx context.Context, groupID uuid.UUID, specialCalcIDs []uuid.UUID) error {
	args := m.Called(ctx, groupID, specialCalcIDs)
	return args.Error(0)
}

// --- Tests ---

func TestVacationCalcGroupService_Create_Success(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	tenantID := uuid.New()

	groupRepo.On("GetByCode", ctx, tenantID, "STANDARD").Return(nil, ErrVacationCalcGroupNotFound)
	groupRepo.On("Create", ctx, mock.AnythingOfType("*model.VacationCalculationGroup")).Return(nil)
	groupRepo.On("GetByID", ctx, mock.AnythingOfType("uuid.UUID")).Return(&model.VacationCalculationGroup{
		ID:       uuid.New(),
		TenantID: tenantID,
		Code:     "STANDARD",
		Name:     "Standard",
		Basis:    model.VacationBasisCalendarYear,
		IsActive: true,
	}, nil)

	group, err := svc.Create(ctx, CreateVacationCalcGroupInput{
		TenantID: tenantID,
		Code:     "STANDARD",
		Name:     "Standard",
		Basis:    "calendar_year",
	})

	require.NoError(t, err)
	assert.Equal(t, "STANDARD", group.Code)
	assert.Equal(t, "Standard", group.Name)
	assert.Equal(t, model.VacationBasisCalendarYear, group.Basis)
	groupRepo.AssertExpectations(t)
}

func TestVacationCalcGroupService_Create_WithSpecialCalcs(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	tenantID := uuid.New()
	sc1ID := uuid.New()
	sc2ID := uuid.New()

	groupRepo.On("GetByCode", ctx, tenantID, "AGE_BONUS").Return(nil, ErrVacationCalcGroupNotFound)
	scRepo.On("ListByIDs", ctx, []uuid.UUID{sc1ID, sc2ID}).Return([]model.VacationSpecialCalculation{
		{ID: sc1ID, Type: model.VacationSpecialCalcAge, BonusDays: decimal.NewFromFloat(2)},
		{ID: sc2ID, Type: model.VacationSpecialCalcDisability, BonusDays: decimal.NewFromFloat(5)},
	}, nil)
	groupRepo.On("Create", ctx, mock.AnythingOfType("*model.VacationCalculationGroup")).Return(nil)
	groupRepo.On("ReplaceSpecialCalculations", ctx, mock.AnythingOfType("uuid.UUID"), []uuid.UUID{sc1ID, sc2ID}).Return(nil)
	groupRepo.On("GetByID", ctx, mock.AnythingOfType("uuid.UUID")).Return(&model.VacationCalculationGroup{
		ID:       uuid.New(),
		TenantID: tenantID,
		Code:     "AGE_BONUS",
		Name:     "With Age Bonus",
		Basis:    model.VacationBasisCalendarYear,
		IsActive: true,
		SpecialCalculations: []model.VacationSpecialCalculation{
			{ID: sc1ID, Type: model.VacationSpecialCalcAge, BonusDays: decimal.NewFromFloat(2)},
			{ID: sc2ID, Type: model.VacationSpecialCalcDisability, BonusDays: decimal.NewFromFloat(5)},
		},
	}, nil)

	group, err := svc.Create(ctx, CreateVacationCalcGroupInput{
		TenantID:              tenantID,
		Code:                  "AGE_BONUS",
		Name:                  "With Age Bonus",
		Basis:                 "calendar_year",
		SpecialCalculationIDs: []uuid.UUID{sc1ID, sc2ID},
	})

	require.NoError(t, err)
	assert.Len(t, group.SpecialCalculations, 2)
	groupRepo.AssertExpectations(t)
	scRepo.AssertExpectations(t)
}

func TestVacationCalcGroupService_Create_DuplicateCode(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	tenantID := uuid.New()

	groupRepo.On("GetByCode", ctx, tenantID, "STANDARD").Return(&model.VacationCalculationGroup{
		ID:   uuid.New(),
		Code: "STANDARD",
	}, nil)

	_, err := svc.Create(ctx, CreateVacationCalcGroupInput{
		TenantID: tenantID,
		Code:     "STANDARD",
		Name:     "Standard",
	})

	assert.ErrorIs(t, err, ErrVacationCalcGroupCodeExists)
}

func TestVacationCalcGroupService_Create_InvalidBasis(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	_, err := svc.Create(ctx, CreateVacationCalcGroupInput{
		TenantID: uuid.New(),
		Code:     "TEST",
		Name:     "Test",
		Basis:    "invalid_basis",
	})

	assert.ErrorIs(t, err, ErrVacationCalcGroupInvalidBasis)
}

func TestVacationCalcGroupService_Create_EmptyCode(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	_, err := svc.Create(ctx, CreateVacationCalcGroupInput{
		TenantID: uuid.New(),
		Code:     "",
		Name:     "Test",
	})

	assert.ErrorIs(t, err, ErrVacationCalcGroupCodeRequired)
}

func TestVacationCalcGroupService_Delete_InUse(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	groupID := uuid.New()
	groupRepo.On("GetByID", ctx, groupID).Return(&model.VacationCalculationGroup{
		ID:   groupID,
		Code: "STANDARD",
	}, nil)
	groupRepo.On("CountEmploymentTypeUsages", ctx, groupID).Return(int64(3), nil)

	err := svc.Delete(ctx, groupID)

	assert.ErrorIs(t, err, ErrVacationCalcGroupInUse)
}

func TestVacationCalcGroupService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	groupID := uuid.New()
	groupRepo.On("GetByID", ctx, groupID).Return(&model.VacationCalculationGroup{
		ID:   groupID,
		Code: "TEST",
	}, nil)
	groupRepo.On("CountEmploymentTypeUsages", ctx, groupID).Return(int64(0), nil)
	groupRepo.On("Delete", ctx, groupID).Return(nil)

	err := svc.Delete(ctx, groupID)

	assert.NoError(t, err)
	groupRepo.AssertExpectations(t)
}

func TestVacationCalcGroupService_Update_ChangesBasis(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	groupID := uuid.New()
	existingGroup := &model.VacationCalculationGroup{
		ID:    groupID,
		Code:  "STANDARD",
		Name:  "Standard",
		Basis: model.VacationBasisCalendarYear,
	}

	groupRepo.On("GetByID", ctx, groupID).Return(existingGroup, nil)
	groupRepo.On("Update", ctx, mock.AnythingOfType("*model.VacationCalculationGroup")).Return(nil)

	newBasis := "entry_date"
	updated, err := svc.Update(ctx, groupID, UpdateVacationCalcGroupInput{
		Basis: &newBasis,
	})

	require.NoError(t, err)
	assert.Equal(t, model.VacationBasisEntryDate, updated.Basis)
	groupRepo.AssertExpectations(t)
}

func TestVacationCalcGroupService_Update_InvalidBasis(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	groupID := uuid.New()
	groupRepo.On("GetByID", ctx, groupID).Return(&model.VacationCalculationGroup{
		ID:    groupID,
		Code:  "STANDARD",
		Name:  "Standard",
		Basis: model.VacationBasisCalendarYear,
	}, nil)

	invalidBasis := "monthly"
	_, err := svc.Update(ctx, groupID, UpdateVacationCalcGroupInput{
		Basis: &invalidBasis,
	})

	assert.ErrorIs(t, err, ErrVacationCalcGroupInvalidBasis)
}

func TestVacationCalcGroupService_Create_DefaultBasis(t *testing.T) {
	ctx := context.Background()
	groupRepo := new(mockVacationCalcGroupRepo)
	scRepo := new(mockVacationSpecialCalcRepo)
	svc := NewVacationCalcGroupService(groupRepo, scRepo)

	tenantID := uuid.New()

	groupRepo.On("GetByCode", ctx, tenantID, "DEFAULT").Return(nil, ErrVacationCalcGroupNotFound)
	groupRepo.On("Create", ctx, mock.AnythingOfType("*model.VacationCalculationGroup")).Return(nil).Run(func(args mock.Arguments) {
		grp := args.Get(1).(*model.VacationCalculationGroup)
		assert.Equal(t, model.VacationBasisCalendarYear, grp.Basis, "Default basis should be calendar_year")
	})
	groupRepo.On("GetByID", ctx, mock.AnythingOfType("uuid.UUID")).Return(&model.VacationCalculationGroup{
		ID:       uuid.New(),
		TenantID: tenantID,
		Code:     "DEFAULT",
		Name:     "Default",
		Basis:    model.VacationBasisCalendarYear,
		IsActive: true,
	}, nil)

	group, err := svc.Create(ctx, CreateVacationCalcGroupInput{
		TenantID: tenantID,
		Code:     "DEFAULT",
		Name:     "Default",
		// Basis omitted -- should default to calendar_year
	})

	require.NoError(t, err)
	assert.Equal(t, model.VacationBasisCalendarYear, group.Basis)
}
