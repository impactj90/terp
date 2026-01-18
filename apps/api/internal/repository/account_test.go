package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForAccount creates a tenant for use in account tests
func createTestTenantForAccount(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestAccountRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)
	account := &model.Account{
		TenantID:    &tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}

	err := repo.Create(ctx, account)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, account.ID)
}

func TestAccountRepository_Create_SystemAccount(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	account := &model.Account{
		TenantID:    nil,
		Code:        "SYS_TEST_" + uuid.New().String()[:8],
		Name:        "System Test Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
		IsActive:    true,
	}

	err := repo.Create(ctx, account)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, account.ID)
	assert.Nil(t, account.TenantID)
}

func TestAccountRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)
	account := &model.Account{
		TenantID:    &tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
	}
	require.NoError(t, repo.Create(ctx, account))

	found, err := repo.GetByID(ctx, account.ID)
	require.NoError(t, err)
	assert.Equal(t, account.ID, found.ID)
	assert.Equal(t, account.Code, found.Code)
	assert.Equal(t, account.Name, found.Name)
	assert.Equal(t, account.AccountType, found.AccountType)
}

func TestAccountRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAccountNotFound)
}

func TestAccountRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)
	account := &model.Account{
		TenantID:    &tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
	}
	require.NoError(t, repo.Create(ctx, account))

	found, err := repo.GetByCode(ctx, &tenant.ID, "OVERTIME")
	require.NoError(t, err)
	assert.Equal(t, account.ID, found.ID)
}

func TestAccountRepository_GetByCode_System(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	account := &model.Account{
		TenantID:    nil,
		Code:        "SYS_CODE_" + uuid.New().String()[:8],
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
	}
	require.NoError(t, repo.Create(ctx, account))

	found, err := repo.GetByCode(ctx, nil, account.Code)
	require.NoError(t, err)
	assert.Equal(t, account.ID, found.ID)
	assert.True(t, found.IsSystem)
}

func TestAccountRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)

	_, err := repo.GetByCode(ctx, &tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrAccountNotFound)
}

func TestAccountRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)
	account := &model.Account{
		TenantID:    &tenant.ID,
		Code:        "OVERTIME",
		Name:        "Original Name",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
	}
	require.NoError(t, repo.Create(ctx, account))

	account.Name = "Updated Name"
	err := repo.Update(ctx, account)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, account.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestAccountRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)
	account := &model.Account{
		TenantID:    &tenant.ID,
		Code:        "OVERTIME",
		Name:        "To Delete",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
	}
	require.NoError(t, repo.Create(ctx, account))

	err := repo.Delete(ctx, account.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, account.ID)
	assert.ErrorIs(t, err, repository.ErrAccountNotFound)
}

func TestAccountRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAccountNotFound)
}

func TestAccountRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)
	require.NoError(t, repo.Create(ctx, &model.Account{
		TenantID:    &tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
	}))
	require.NoError(t, repo.Create(ctx, &model.Account{
		TenantID:    &tenant.ID,
		Code:        "VACATION",
		Name:        "Vacation",
		AccountType: model.AccountTypeBalance,
		Unit:        model.AccountUnitDays,
	}))

	accounts, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, accounts, 2)
}

func TestAccountRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)

	accounts, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, accounts)
}

func TestAccountRepository_ListWithSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)

	// Create tenant account
	require.NoError(t, repo.Create(ctx, &model.Account{
		TenantID:    &tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
	}))

	// Create system account
	require.NoError(t, repo.Create(ctx, &model.Account{
		TenantID:    nil,
		Code:        "SYS_LIST_" + uuid.New().String()[:8],
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
	}))

	accounts, err := repo.ListWithSystem(ctx, tenant.ID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(accounts), 2)

	// System accounts should come first
	hasSystem := false
	for _, acc := range accounts {
		if acc.IsSystem {
			hasSystem = true
			break
		}
	}
	assert.True(t, hasSystem)
}

func TestAccountRepository_GetSystemAccounts(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)

	// Create tenant account
	require.NoError(t, repo.Create(ctx, &model.Account{
		TenantID:    &tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
	}))

	// Create system account
	require.NoError(t, repo.Create(ctx, &model.Account{
		TenantID:    nil,
		Code:        "SYS_GET_" + uuid.New().String()[:8],
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
	}))

	accounts, err := repo.GetSystemAccounts(ctx)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(accounts), 1)

	for _, acc := range accounts {
		assert.True(t, acc.IsSystem)
	}
}

func TestAccountRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAccountRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAccount(t, db)

	// Create active account
	require.NoError(t, repo.Create(ctx, &model.Account{
		TenantID:    &tenant.ID,
		Code:        "ACTIVE",
		Name:        "Active Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}))

	// Create inactive account
	require.NoError(t, repo.Create(ctx, &model.Account{
		TenantID:    &tenant.ID,
		Code:        "INACTIVE",
		Name:        "Inactive Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
		IsActive:    false,
	}))

	accounts, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, accounts, 1)
	assert.Equal(t, "ACTIVE", accounts[0].Code)
}
