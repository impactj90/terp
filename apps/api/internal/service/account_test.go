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

func createTestTenantForAccountService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestAccountService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}

	account, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "OVERTIME", account.Code)
	assert.Equal(t, "Overtime Account", account.Name)
	assert.Equal(t, model.AccountTypeBonus, account.AccountType)
	assert.Equal(t, model.AccountUnitMinutes, account.Unit)
	assert.True(t, account.IsActive)
	assert.False(t, account.IsSystem)
}

func TestAccountService_Create_DefaultUnit(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime Account",
		AccountType: model.AccountTypeBonus,
		// Unit not specified
		IsActive: true,
	}

	account, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, model.AccountUnitMinutes, account.Unit)
}

func TestAccountService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "",
		Name:        "Test Account",
		AccountType: model.AccountTypeBonus,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrAccountCodeRequired)
}

func TestAccountService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "TEST",
		Name:        "",
		AccountType: model.AccountTypeBonus,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrAccountNameRequired)
}

func TestAccountService_Create_EmptyType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "TEST",
		Name:        "Test Account",
		AccountType: "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrAccountTypeRequired)
}

func TestAccountService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "First Account",
		AccountType: model.AccountTypeBonus,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Second Account",
		AccountType: model.AccountTypeBonus,
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrAccountCodeExists)
}

func TestAccountService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime Account",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Overtime Account", found.Name)
}

func TestAccountService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAccountNotFound)
}

func TestAccountService_GetByCode_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime Account",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByCode(ctx, tenant.ID, "OVERTIME")
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestAccountService_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	_, err := svc.GetByCode(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, service.ErrAccountNotFound)
}

func TestAccountService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Original Name",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newUnit := model.AccountUnitHours
	isActive := false
	updateInput := service.UpdateAccountInput{
		Name:     &newName,
		Unit:     &newUnit,
		IsActive: &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, model.AccountUnitHours, updated.Unit)
	assert.False(t, updated.IsActive)
}

func TestAccountService_Update_SystemAccount(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	sysAccount := &model.Account{
		TenantID:    nil,
		Code:        "SYS_ACC",
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
		IsActive:    true,
	}
	require.NoError(t, repo.Create(ctx, sysAccount))

	newName := "Updated"
	updateInput := service.UpdateAccountInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, sysAccount.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCannotModifySystemAccount)
}

func TestAccountService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateAccountInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrAccountNotFound)
}

func TestAccountService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Original Name",
		AccountType: model.AccountTypeBonus,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateAccountInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrAccountNameRequired)
}

func TestAccountService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "To Delete",
		AccountType: model.AccountTypeBonus,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrAccountNotFound)
}

func TestAccountService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrAccountNotFound)
}

func TestAccountService_Delete_SystemAccount(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	// Create a system account directly via repository
	account := &model.Account{
		TenantID:    nil,
		Code:        "SYS_DEL_" + uuid.New().String()[:8],
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
	}
	require.NoError(t, repo.Create(ctx, account))

	err := svc.Delete(ctx, account.ID)
	assert.ErrorIs(t, err, service.ErrCannotDeleteSystem)
}

func TestAccountService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	// Create test accounts
	for i, code := range []string{"OVERTIME", "VACATION", "SICK"} {
		input := service.CreateAccountInput{
			TenantID:    tenant.ID,
			Code:        code,
			Name:        "Account " + code,
			AccountType: model.AccountTypeBonus,
			IsActive:    i < 2, // First two active
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	accounts, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, accounts, 3)
}

func TestAccountService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	// Create active account
	input1 := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "ACTIVE",
		Name:        "Active Account",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create inactive account
	input2 := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "INACTIVE",
		Name:        "Inactive Account",
		AccountType: model.AccountTypeBonus,
		IsActive:    false,
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	accounts, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, accounts, 1)
	assert.Equal(t, "ACTIVE", accounts[0].Code)
}

func TestAccountService_ListWithSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	tenant := createTestTenantForAccountService(t, db)

	// Create tenant account
	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Create system account via repo
	sysAccount := &model.Account{
		TenantID:    nil,
		Code:        "SYS_LIST_SVC_" + uuid.New().String()[:8],
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
	}
	require.NoError(t, repo.Create(ctx, sysAccount))

	accounts, err := svc.ListWithSystem(ctx, tenant.ID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(accounts), 2)
}

func TestAccountService_GetSystemAccounts(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	svc := service.NewAccountService(repo)
	ctx := context.Background()

	// Create system account
	sysAccount := &model.Account{
		TenantID:    nil,
		Code:        "SYS_GET_SVC_" + uuid.New().String()[:8],
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
	}
	require.NoError(t, repo.Create(ctx, sysAccount))

	accounts, err := svc.GetSystemAccounts(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(accounts), 1)

	for _, acc := range accounts {
		assert.True(t, acc.IsSystem)
	}
}
