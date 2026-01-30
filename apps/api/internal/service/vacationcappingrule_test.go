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
)

// --- Mocks ---

type mockVacationCappingRuleRepo struct {
	mock.Mock
}

func (m *mockVacationCappingRuleRepo) Create(ctx context.Context, rule *model.VacationCappingRule) error {
	args := m.Called(ctx, rule)
	if rule.ID == uuid.Nil {
		rule.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockVacationCappingRuleRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRule, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationCappingRule), args.Error(1)
}

func (m *mockVacationCappingRuleRepo) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.VacationCappingRule, error) {
	args := m.Called(ctx, tenantID, code)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.VacationCappingRule), args.Error(1)
}

func (m *mockVacationCappingRuleRepo) List(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.VacationCappingRule), args.Error(1)
}

func (m *mockVacationCappingRuleRepo) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.VacationCappingRule, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.VacationCappingRule), args.Error(1)
}

func (m *mockVacationCappingRuleRepo) ListByType(ctx context.Context, tenantID uuid.UUID, ruleType string) ([]model.VacationCappingRule, error) {
	args := m.Called(ctx, tenantID, ruleType)
	return args.Get(0).([]model.VacationCappingRule), args.Error(1)
}

func (m *mockVacationCappingRuleRepo) ListByIDs(ctx context.Context, ids []uuid.UUID) ([]model.VacationCappingRule, error) {
	args := m.Called(ctx, ids)
	return args.Get(0).([]model.VacationCappingRule), args.Error(1)
}

func (m *mockVacationCappingRuleRepo) Update(ctx context.Context, rule *model.VacationCappingRule) error {
	args := m.Called(ctx, rule)
	return args.Error(0)
}

func (m *mockVacationCappingRuleRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockVacationCappingRuleRepo) CountGroupUsages(ctx context.Context, ruleID uuid.UUID) (int64, error) {
	args := m.Called(ctx, ruleID)
	return args.Get(0).(int64), args.Error(1)
}

// --- Tests ---

func TestVacationCappingRuleService_Create_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	tenantID := uuid.New()

	repo.On("GetByCode", ctx, tenantID, "YE-10").Return(nil, errors.New("not found"))
	repo.On("Create", ctx, mock.AnythingOfType("*model.VacationCappingRule")).Return(nil)

	rule, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID: tenantID,
		Code:     "YE-10",
		Name:     "Year End Cap 10",
		RuleType: "year_end",
		CapValue: 10.0,
	})

	require.NoError(t, err)
	assert.Equal(t, "YE-10", rule.Code)
	assert.Equal(t, "Year End Cap 10", rule.Name)
	assert.Equal(t, model.CappingRuleType("year_end"), rule.RuleType)
	assert.True(t, decimal.NewFromFloat(10.0).Equal(rule.CapValue))
	assert.Equal(t, 12, rule.CutoffMonth, "default cutoff month should be 12")
	assert.Equal(t, 31, rule.CutoffDay, "default cutoff day should be 31")
	assert.True(t, rule.IsActive)
	repo.AssertExpectations(t)
}

func TestVacationCappingRuleService_Create_MidYear(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	tenantID := uuid.New()

	repo.On("GetByCode", ctx, tenantID, "MY-Q1").Return(nil, errors.New("not found"))
	repo.On("Create", ctx, mock.AnythingOfType("*model.VacationCappingRule")).Return(nil)

	rule, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID:    tenantID,
		Code:        "MY-Q1",
		Name:        "Mid Year Cap Q1",
		RuleType:    "mid_year",
		CutoffMonth: 3,
		CutoffDay:   31,
		CapValue:    5.0,
	})

	require.NoError(t, err)
	assert.Equal(t, model.CappingRuleType("mid_year"), rule.RuleType)
	assert.Equal(t, 3, rule.CutoffMonth)
	assert.Equal(t, 31, rule.CutoffDay)
	repo.AssertExpectations(t)
}

func TestVacationCappingRuleService_Create_CodeRequired(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	_, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID: uuid.New(),
		Code:     "",
		Name:     "Test",
		RuleType: "year_end",
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleCodeRequired)
}

func TestVacationCappingRuleService_Create_NameRequired(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	_, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID: uuid.New(),
		Code:     "TEST",
		Name:     "",
		RuleType: "year_end",
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleNameRequired)
}

func TestVacationCappingRuleService_Create_TypeRequired(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	_, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID: uuid.New(),
		Code:     "TEST",
		Name:     "Test",
		RuleType: "",
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleTypeRequired)
}

func TestVacationCappingRuleService_Create_TypeInvalid(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	_, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID: uuid.New(),
		Code:     "TEST",
		Name:     "Test",
		RuleType: "invalid_type",
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleTypeInvalid)
}

func TestVacationCappingRuleService_Create_CodeExists(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	tenantID := uuid.New()
	existing := &model.VacationCappingRule{ID: uuid.New(), Code: "DUPE"}
	repo.On("GetByCode", ctx, tenantID, "DUPE").Return(existing, nil)

	_, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID: tenantID,
		Code:     "DUPE",
		Name:     "Duplicate",
		RuleType: "year_end",
		CapValue: 10.0,
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleCodeExists)
}

func TestVacationCappingRuleService_Create_InvalidMonth(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	_, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID:    uuid.New(),
		Code:        "TEST",
		Name:        "Test",
		RuleType:    "year_end",
		CutoffMonth: 13,
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleInvalidMonth)
}

func TestVacationCappingRuleService_Create_InvalidDay(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	_, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID:  uuid.New(),
		Code:      "TEST",
		Name:      "Test",
		RuleType:  "year_end",
		CutoffDay: 32,
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleInvalidDay)
}

func TestVacationCappingRuleService_Create_NegativeCapValue(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	_, err := svc.Create(ctx, CreateVacationCappingRuleInput{
		TenantID: uuid.New(),
		Code:     "TEST",
		Name:     "Test",
		RuleType: "year_end",
		CapValue: -5.0,
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleInvalidCap)
}

func TestVacationCappingRuleService_Delete_InUse(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	ruleID := uuid.New()
	repo.On("GetByID", ctx, ruleID).Return(&model.VacationCappingRule{ID: ruleID}, nil)
	repo.On("CountGroupUsages", ctx, ruleID).Return(int64(2), nil)

	err := svc.Delete(ctx, ruleID)

	assert.ErrorIs(t, err, ErrVacationCappingRuleInUse)
}

func TestVacationCappingRuleService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	ruleID := uuid.New()
	repo.On("GetByID", ctx, ruleID).Return(&model.VacationCappingRule{ID: ruleID}, nil)
	repo.On("CountGroupUsages", ctx, ruleID).Return(int64(0), nil)
	repo.On("Delete", ctx, ruleID).Return(nil)

	err := svc.Delete(ctx, ruleID)

	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestVacationCappingRuleService_Update_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	ruleID := uuid.New()
	existing := &model.VacationCappingRule{
		ID:       ruleID,
		Code:     "YE-10",
		Name:     "Year End 10",
		RuleType: model.CappingRuleType("year_end"),
		CapValue: decimal.NewFromFloat(10.0),
		IsActive: true,
	}
	repo.On("GetByID", ctx, ruleID).Return(existing, nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.VacationCappingRule")).Return(nil)

	newName := "Updated Name"
	newCap := 15.0
	updated, err := svc.Update(ctx, ruleID, UpdateVacationCappingRuleInput{
		Name:     &newName,
		CapValue: &newCap,
	})

	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.True(t, decimal.NewFromFloat(15.0).Equal(updated.CapValue))
	repo.AssertExpectations(t)
}

func TestVacationCappingRuleService_Update_InvalidType(t *testing.T) {
	ctx := context.Background()
	repo := new(mockVacationCappingRuleRepo)
	svc := NewVacationCappingRuleService(repo)

	ruleID := uuid.New()
	existing := &model.VacationCappingRule{ID: ruleID, RuleType: model.CappingRuleType("year_end")}
	repo.On("GetByID", ctx, ruleID).Return(existing, nil)

	badType := "invalid"
	_, err := svc.Update(ctx, ruleID, UpdateVacationCappingRuleInput{
		RuleType: &badType,
	})

	assert.ErrorIs(t, err, ErrVacationCappingRuleTypeInvalid)
}
