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

type mockEmployeeCappingExceptionRepo struct {
	mock.Mock
}

func (m *mockEmployeeCappingExceptionRepo) Create(ctx context.Context, exc *model.EmployeeCappingException) error {
	args := m.Called(ctx, exc)
	if exc.ID == uuid.Nil {
		exc.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockEmployeeCappingExceptionRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeCappingException, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.EmployeeCappingException), args.Error(1)
}

func (m *mockEmployeeCappingExceptionRepo) List(ctx context.Context, tenantID uuid.UUID, filters repository.EmployeeCappingExceptionFilters) ([]model.EmployeeCappingException, error) {
	args := m.Called(ctx, tenantID, filters)
	return args.Get(0).([]model.EmployeeCappingException), args.Error(1)
}

func (m *mockEmployeeCappingExceptionRepo) ListActiveByEmployee(ctx context.Context, employeeID uuid.UUID, year *int) ([]model.EmployeeCappingException, error) {
	args := m.Called(ctx, employeeID, year)
	return args.Get(0).([]model.EmployeeCappingException), args.Error(1)
}

func (m *mockEmployeeCappingExceptionRepo) ExistsByEmployeeRuleYear(ctx context.Context, employeeID, cappingRuleID uuid.UUID, year *int) (bool, error) {
	args := m.Called(ctx, employeeID, cappingRuleID, year)
	return args.Bool(0), args.Error(1)
}

func (m *mockEmployeeCappingExceptionRepo) Update(ctx context.Context, exc *model.EmployeeCappingException) error {
	args := m.Called(ctx, exc)
	return args.Error(0)
}

func (m *mockEmployeeCappingExceptionRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

// We also need the capping rule repo mock for this service
type mockCappingRuleRepoForException struct {
	mock.Mock
}

func (m *mockCappingRuleRepoForException) Create(ctx context.Context, rule *model.VacationCappingRule) error {
	args := m.Called(ctx, rule)
	return args.Error(0)
}

func (m *mockCappingRuleRepoForException) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRule, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationCappingRule), args.Error(1)
}

func (m *mockCappingRuleRepoForException) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCappingRule, error) {
	args := m.Called(ctx, tenantID, code)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationCappingRule), args.Error(1)
}

func (m *mockCappingRuleRepoForException) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.VacationCappingRule), args.Error(1)
}

func (m *mockCappingRuleRepoForException) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.VacationCappingRule), args.Error(1)
}

func (m *mockCappingRuleRepoForException) ListByType(ctx context.Context, tenantID uuid.UUID, ruleType string) ([]model.VacationCappingRule, error) {
	args := m.Called(ctx, tenantID, ruleType)
	return args.Get(0).([]model.VacationCappingRule), args.Error(1)
}

func (m *mockCappingRuleRepoForException) ListByIDs(ctx context.Context, ids []uuid.UUID) ([]model.VacationCappingRule, error) {
	args := m.Called(ctx, ids)
	return args.Get(0).([]model.VacationCappingRule), args.Error(1)
}

func (m *mockCappingRuleRepoForException) Update(ctx context.Context, rule *model.VacationCappingRule) error {
	args := m.Called(ctx, rule)
	return args.Error(0)
}

func (m *mockCappingRuleRepoForException) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockCappingRuleRepoForException) CountGroupUsages(ctx context.Context, ruleID uuid.UUID) (int64, error) {
	args := m.Called(ctx, ruleID)
	return args.Get(0).(int64), args.Error(1)
}

// --- Tests ---

func TestEmployeeCappingExceptionService_Create_FullSuccess(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	tenantID := uuid.New()
	employeeID := uuid.New()
	cappingRuleID := uuid.New()

	ruleRepo.On("GetByID", ctx, cappingRuleID).Return(&model.VacationCappingRule{ID: cappingRuleID}, nil)
	excRepo.On("ExistsByEmployeeRuleYear", ctx, employeeID, cappingRuleID, (*int)(nil)).Return(false, nil)
	excRepo.On("Create", ctx, mock.AnythingOfType("*model.EmployeeCappingException")).Return(nil)

	exc, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		CappingRuleID: cappingRuleID,
		ExemptionType: "full",
	})

	require.NoError(t, err)
	assert.Equal(t, model.ExemptionTypeFull, exc.ExemptionType)
	assert.True(t, exc.IsActive)
	assert.Nil(t, exc.RetainDays)
	excRepo.AssertExpectations(t)
	ruleRepo.AssertExpectations(t)
}

func TestEmployeeCappingExceptionService_Create_PartialSuccess(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	tenantID := uuid.New()
	employeeID := uuid.New()
	cappingRuleID := uuid.New()
	retainDays := 15.0

	ruleRepo.On("GetByID", ctx, cappingRuleID).Return(&model.VacationCappingRule{ID: cappingRuleID}, nil)
	excRepo.On("ExistsByEmployeeRuleYear", ctx, employeeID, cappingRuleID, (*int)(nil)).Return(false, nil)
	excRepo.On("Create", ctx, mock.AnythingOfType("*model.EmployeeCappingException")).Return(nil)

	exc, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		CappingRuleID: cappingRuleID,
		ExemptionType: "partial",
		RetainDays:    &retainDays,
	})

	require.NoError(t, err)
	assert.Equal(t, model.ExemptionTypePartial, exc.ExemptionType)
	assert.NotNil(t, exc.RetainDays)
	assert.True(t, decimal.NewFromFloat(15.0).Equal(*exc.RetainDays))
	excRepo.AssertExpectations(t)
}

func TestEmployeeCappingExceptionService_Create_EmployeeRequired(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	_, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.Nil,
		CappingRuleID: uuid.New(),
		ExemptionType: "full",
	})

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionEmployeeReq)
}

func TestEmployeeCappingExceptionService_Create_RuleRequired(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	_, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		CappingRuleID: uuid.Nil,
		ExemptionType: "full",
	})

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionRuleReq)
}

func TestEmployeeCappingExceptionService_Create_TypeRequired(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	_, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		CappingRuleID: uuid.New(),
		ExemptionType: "",
	})

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionTypeReq)
}

func TestEmployeeCappingExceptionService_Create_TypeInvalid(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	_, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		CappingRuleID: uuid.New(),
		ExemptionType: "invalid",
	})

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionTypeInv)
}

func TestEmployeeCappingExceptionService_Create_PartialNoRetainDays(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	_, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		CappingRuleID: uuid.New(),
		ExemptionType: "partial",
		RetainDays:    nil,
	})

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionRetainReq)
}

func TestEmployeeCappingExceptionService_Create_NegativeRetainDays(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	negDays := -5.0
	_, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		CappingRuleID: uuid.New(),
		ExemptionType: "partial",
		RetainDays:    &negDays,
	})

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionRetainNeg)
}

func TestEmployeeCappingExceptionService_Create_CappingRuleNotFound(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	cappingRuleID := uuid.New()
	ruleRepo.On("GetByID", ctx, cappingRuleID).Return(nil, errors.New("not found"))

	_, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      uuid.New(),
		EmployeeID:    uuid.New(),
		CappingRuleID: cappingRuleID,
		ExemptionType: "full",
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleNotFound)
}

func TestEmployeeCappingExceptionService_Create_Duplicate(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	employeeID := uuid.New()
	cappingRuleID := uuid.New()

	ruleRepo.On("GetByID", ctx, cappingRuleID).Return(&model.VacationCappingRule{ID: cappingRuleID}, nil)
	excRepo.On("ExistsByEmployeeRuleYear", ctx, employeeID, cappingRuleID, (*int)(nil)).Return(true, nil)

	_, err := svc.Create(ctx, CreateEmployeeCappingExceptionInput{
		TenantID:      uuid.New(),
		EmployeeID:    employeeID,
		CappingRuleID: cappingRuleID,
		ExemptionType: "full",
	})

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionDuplicate)
}

func TestEmployeeCappingExceptionService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	excID := uuid.New()
	excRepo.On("GetByID", ctx, excID).Return(&model.EmployeeCappingException{ID: excID}, nil)
	excRepo.On("Delete", ctx, excID).Return(nil)

	err := svc.Delete(ctx, excID)

	assert.NoError(t, err)
	excRepo.AssertExpectations(t)
}

func TestEmployeeCappingExceptionService_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	excID := uuid.New()
	excRepo.On("GetByID", ctx, excID).Return(nil, errors.New("not found"))

	err := svc.Delete(ctx, excID)

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionNotFound)
}

func TestEmployeeCappingExceptionService_Update_Success(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	excID := uuid.New()
	rd := decimal.NewFromFloat(10.0)
	existing := &model.EmployeeCappingException{
		ID:            excID,
		ExemptionType: model.ExemptionTypePartial,
		RetainDays:    &rd,
		IsActive:      true,
	}
	excRepo.On("GetByID", ctx, excID).Return(existing, nil)
	excRepo.On("Update", ctx, mock.AnythingOfType("*model.EmployeeCappingException")).Return(nil)

	newRetain := 20.0
	updated, err := svc.Update(ctx, excID, UpdateEmployeeCappingExceptionInput{
		RetainDays: &newRetain,
	})

	require.NoError(t, err)
	assert.True(t, decimal.NewFromFloat(20.0).Equal(*updated.RetainDays))
	excRepo.AssertExpectations(t)
}

func TestEmployeeCappingExceptionService_Update_InvalidType(t *testing.T) {
	ctx := context.Background()
	excRepo := new(mockEmployeeCappingExceptionRepo)
	ruleRepo := new(mockCappingRuleRepoForException)
	svc := NewEmployeeCappingExceptionService(excRepo, ruleRepo)

	excID := uuid.New()
	existing := &model.EmployeeCappingException{ID: excID, ExemptionType: model.ExemptionTypeFull}
	excRepo.On("GetByID", ctx, excID).Return(existing, nil)

	badType := "invalid"
	_, err := svc.Update(ctx, excID, UpdateEmployeeCappingExceptionInput{
		ExemptionType: &badType,
	})

	assert.ErrorIs(t, err, ErrEmployeeCappingExceptionTypeInv)
}
