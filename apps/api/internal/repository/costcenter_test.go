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

// createTestTenantForCostCenter creates a tenant for use in cost center tests
func createTestTenantForCostCenter(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestCostCenterRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	cc := &model.CostCenter{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}

	err := repo.Create(ctx, cc)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, cc.ID)
}

func TestCostCenterRepository_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	cc := &model.CostCenter{
		TenantID:    tenant.ID,
		Code:        "CC001",
		Name:        "Marketing",
		Description: "Marketing department cost center",
		IsActive:    true,
	}

	err := repo.Create(ctx, cc)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, cc.ID)
	require.NoError(t, err)
	assert.Equal(t, "Marketing department cost center", found.Description)
}

func TestCostCenterRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	cc := &model.CostCenter{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
	}
	require.NoError(t, repo.Create(ctx, cc))

	found, err := repo.GetByID(ctx, cc.ID)
	require.NoError(t, err)
	assert.Equal(t, cc.ID, found.ID)
	assert.Equal(t, cc.Code, found.Code)
	assert.Equal(t, cc.Name, found.Name)
}

func TestCostCenterRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrCostCenterNotFound)
}

func TestCostCenterRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	cc := &model.CostCenter{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
	}
	require.NoError(t, repo.Create(ctx, cc))

	found, err := repo.GetByCode(ctx, tenant.ID, "CC001")
	require.NoError(t, err)
	assert.Equal(t, cc.ID, found.ID)
	assert.Equal(t, "CC001", found.Code)
}

func TestCostCenterRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	_, err := repo.GetByCode(ctx, uuid.New(), "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrCostCenterNotFound)
}

func TestCostCenterRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	cc := &model.CostCenter{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Original Name",
	}
	require.NoError(t, repo.Create(ctx, cc))

	cc.Name = "Updated Name"
	err := repo.Update(ctx, cc)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, cc.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestCostCenterRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	cc := &model.CostCenter{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "To Delete",
	}
	require.NoError(t, repo.Create(ctx, cc))

	err := repo.Delete(ctx, cc.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, cc.ID)
	assert.ErrorIs(t, err, repository.ErrCostCenterNotFound)
}

func TestCostCenterRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrCostCenterNotFound)
}

func TestCostCenterRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	require.NoError(t, repo.Create(ctx, &model.CostCenter{TenantID: tenant.ID, Code: "CC001", Name: "Marketing", IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.CostCenter{TenantID: tenant.ID, Code: "CC002", Name: "Sales", IsActive: false}))

	costCenters, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, costCenters, 2)
}

func TestCostCenterRepository_List_OrderedByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	require.NoError(t, repo.Create(ctx, &model.CostCenter{TenantID: tenant.ID, Code: "CC003", Name: "HR"}))
	require.NoError(t, repo.Create(ctx, &model.CostCenter{TenantID: tenant.ID, Code: "CC001", Name: "Marketing"}))
	require.NoError(t, repo.Create(ctx, &model.CostCenter{TenantID: tenant.ID, Code: "CC002", Name: "Sales"}))

	costCenters, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, costCenters, 3)
	assert.Equal(t, "CC001", costCenters[0].Code)
	assert.Equal(t, "CC002", costCenters[1].Code)
	assert.Equal(t, "CC003", costCenters[2].Code)
}

func TestCostCenterRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)

	costCenters, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, costCenters)
}

func TestCostCenterRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)
	require.NoError(t, repo.Create(ctx, &model.CostCenter{TenantID: tenant.ID, Code: "CC001", Name: "Marketing", IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.CostCenter{TenantID: tenant.ID, Code: "CC002", Name: "Sales", IsActive: false}))

	costCenters, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, costCenters, 1)
	assert.Equal(t, "CC001", costCenters[0].Code)
}

func TestCostCenterRepository_ListActive_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForCostCenter(t, db)

	costCenters, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, costCenters)
}
