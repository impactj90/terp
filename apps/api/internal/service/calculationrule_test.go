package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForCalculationRuleService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func TestCalculationRuleService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "FULL_DAY",
		Name:     "Full Day Absence",
		Value:    0,
		Factor:   1.0,
	}

	rule, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "FULL_DAY", rule.Code)
	assert.Equal(t, "Full Day Absence", rule.Name)
	assert.Equal(t, 0, rule.Value)
	assert.Equal(t, 1.0, rule.Factor)
	assert.True(t, rule.IsActive)
}

func TestCalculationRuleService_Create_DefaultFactor(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "DEFAULT_FAC",
		Name:     "Default Factor Rule",
		Value:    480,
		// Factor not specified (0 means use default 1.0)
	}

	rule, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, 1.0, rule.Factor)
}

func TestCalculationRuleService_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	desc := "Credits full day target time for sick leave"
	input := service.CreateCalculationRuleInput{
		TenantID:    tenant.ID,
		Code:        "SICK_FULL",
		Name:        "Sick Leave Full Day",
		Description: &desc,
		Value:       0,
		Factor:      1.0,
	}

	rule, err := svc.Create(ctx, input)
	require.NoError(t, err)
	require.NotNil(t, rule.Description)
	assert.Equal(t, desc, *rule.Description)
}

func TestCalculationRuleService_Create_WithAccount(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ruleRepo := repository.NewCalculationRuleRepository(db)
	accountRepo := repository.NewAccountRepository(db)
	svc := service.NewCalculationRuleService(ruleRepo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	// Create an account to link
	account := &model.Account{
		TenantID:    &tenant.ID,
		Code:        "SICK_ACC_" + uuid.New().String()[:8],
		Name:        "Sick Account",
		AccountType: model.AccountTypeDay,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}
	require.NoError(t, accountRepo.Create(ctx, account))

	input := service.CreateCalculationRuleInput{
		TenantID:  tenant.ID,
		Code:      "SICK_WITH_ACCT",
		Name:      "Sick Leave with Account",
		AccountID: &account.ID,
		Value:     0,
		Factor:    1.0,
	}

	rule, err := svc.Create(ctx, input)
	require.NoError(t, err)
	require.NotNil(t, rule.AccountID)
	assert.Equal(t, account.ID, *rule.AccountID)
}

func TestCalculationRuleService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Test Rule",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrCalculationRuleCodeRequired)
}

func TestCalculationRuleService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "TEST",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrCalculationRuleNameRequired)
}

func TestCalculationRuleService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "DUP_RULE",
		Name:     "First Rule",
		Factor:   1.0,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "DUP_RULE",
		Name:     "Second Rule",
		Factor:   0.5,
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrCalculationRuleCodeExists)
}

func TestCalculationRuleService_Create_NegativeValue(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "NEG_VAL",
		Name:     "Negative Value",
		Value:    -100,
		Factor:   1.0,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidValue)
}

func TestCalculationRuleService_Create_NegativeFactor(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "NEG_FAC",
		Name:     "Negative Factor",
		Value:    0,
		Factor:   -1.0,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidFactor)
}

func TestCalculationRuleService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "FULL_DAY",
		Name:     "Full Day Absence",
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Full Day Absence", found.Name)
}

func TestCalculationRuleService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrCalculationRuleNotFound)
}

func TestCalculationRuleService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "UPDATE_ME",
		Name:     "Original Name",
		Value:    0,
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newFactor := 0.5
	newValue := 480
	isActive := false
	updateInput := service.UpdateCalculationRuleInput{
		Name:     &newName,
		Factor:   &newFactor,
		Value:    &newValue,
		IsActive: &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, 0.5, updated.Factor)
	assert.Equal(t, 480, updated.Value)
	assert.False(t, updated.IsActive)
}

func TestCalculationRuleService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateCalculationRuleInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrCalculationRuleNotFound)
}

func TestCalculationRuleService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "EMPTY_NAME",
		Name:     "Original Name",
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateCalculationRuleInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCalculationRuleNameRequired)
}

func TestCalculationRuleService_Update_ClearAccountID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ruleRepo := repository.NewCalculationRuleRepository(db)
	accountRepo := repository.NewAccountRepository(db)
	svc := service.NewCalculationRuleService(ruleRepo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	// Create account
	account := &model.Account{
		TenantID:    &tenant.ID,
		Code:        "ACC_CLEAR_" + uuid.New().String()[:8],
		Name:        "Account for Clearing",
		AccountType: model.AccountTypeDay,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}
	require.NoError(t, accountRepo.Create(ctx, account))

	// Create rule with account
	input := service.CreateCalculationRuleInput{
		TenantID:  tenant.ID,
		Code:      "CLEAR_ACCT",
		Name:      "Clear Account Rule",
		AccountID: &account.ID,
		Factor:    1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)
	require.NotNil(t, created.AccountID)

	// Clear account
	updateInput := service.UpdateCalculationRuleInput{
		ClearAccountID: true,
	}
	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Nil(t, updated.AccountID)
}

func TestCalculationRuleService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "DELETE_ME",
		Name:     "To Delete",
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrCalculationRuleNotFound)
}

func TestCalculationRuleService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrCalculationRuleNotFound)
}

func TestCalculationRuleService_Delete_InUse(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ruleRepo := repository.NewCalculationRuleRepository(db)
	absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
	svc := service.NewCalculationRuleService(ruleRepo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	// Create rule
	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "IN_USE_RULE",
		Name:     "In Use Rule",
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Create absence type referencing the rule
	absenceType := &model.AbsenceType{
		TenantID:          &tenant.ID,
		Code:              "ABS_" + uuid.New().String()[:4],
		Name:              "Test Absence Type",
		Category:          model.AbsenceCategoryVacation,
		CalculationRuleID: &created.ID,
	}
	require.NoError(t, absenceTypeRepo.Create(ctx, absenceType))

	// Attempt delete
	err = svc.Delete(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrCalculationRuleInUse)
}

func TestCalculationRuleService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	// Create test rules
	for i, code := range []string{"FULL_DAY", "HALF_DAY", "ZERO"} {
		input := service.CreateCalculationRuleInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Rule " + code,
			Factor:   1.0,
		}
		if i == 2 {
			// Create one as inactive via update after creation
			rule, err := svc.Create(ctx, input)
			require.NoError(t, err)
			isActive := false
			_, err = svc.Update(ctx, rule.ID, service.UpdateCalculationRuleInput{IsActive: &isActive})
			require.NoError(t, err)
		} else {
			_, err := svc.Create(ctx, input)
			require.NoError(t, err)
		}
	}

	rules, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, rules, 3)
}

func TestCalculationRuleService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	// Create active rule
	_, err := svc.Create(ctx, service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "ACTIVE_RULE",
		Name:     "Active Rule",
		Factor:   1.0,
	})
	require.NoError(t, err)

	// Create inactive rule
	rule2, err := svc.Create(ctx, service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "INACTIVE_RULE",
		Name:     "Inactive Rule",
		Factor:   0.5,
	})
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, rule2.ID, service.UpdateCalculationRuleInput{IsActive: &isActive})
	require.NoError(t, err)

	rules, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, rules, 1)
	assert.Equal(t, "ACTIVE_RULE", rules[0].Code)
}

func TestCalculationRuleService_ValidateRuleForAssignment_Active(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	rule, err := svc.Create(ctx, service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "VALID_RULE",
		Name:     "Valid Rule",
		Factor:   1.0,
	})
	require.NoError(t, err)

	err = svc.ValidateRuleForAssignment(ctx, rule.ID)
	assert.NoError(t, err)
}

func TestCalculationRuleService_ValidateRuleForAssignment_Inactive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCalculationRuleService(t, db)

	rule, err := svc.Create(ctx, service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "INACT_RULE",
		Name:     "Inactive Rule",
		Factor:   1.0,
	})
	require.NoError(t, err)

	isActive := false
	_, err = svc.Update(ctx, rule.ID, service.UpdateCalculationRuleInput{IsActive: &isActive})
	require.NoError(t, err)

	err = svc.ValidateRuleForAssignment(ctx, rule.ID)
	assert.ErrorIs(t, err, service.ErrCalculationRuleInactive)
}

func TestCalculationRuleService_ValidateRuleForAssignment_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCalculationRuleRepository(db)
	svc := service.NewCalculationRuleService(repo)
	ctx := context.Background()

	err := svc.ValidateRuleForAssignment(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrCalculationRuleNotFound)
}
