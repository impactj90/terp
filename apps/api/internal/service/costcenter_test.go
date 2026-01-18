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

func createTestTenantForCostCenterService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestCostCenterService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID:    tenant.ID,
		Code:        "CC001",
		Name:        "Marketing",
		Description: "Marketing department",
		IsActive:    true,
	}

	cc, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "CC001", cc.Code)
	assert.Equal(t, "Marketing", cc.Name)
	assert.Equal(t, "Marketing department", cc.Description)
	assert.Equal(t, tenant.ID, cc.TenantID)
	assert.True(t, cc.IsActive)
}

func TestCostCenterService_Create_Inactive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: false,
	}

	cc, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.False(t, cc.IsActive)
}

func TestCostCenterService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Marketing",
		IsActive: true,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrCostCenterCodeRequired)
}

func TestCostCenterService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "",
		IsActive: true,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrCostCenterNameRequired)
}

func TestCostCenterService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Sales",
		IsActive: true,
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrCostCenterCodeExists)
}

func TestCostCenterService_Create_TrimsWhitespace(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID:    tenant.ID,
		Code:        "  CC001  ",
		Name:        "  Marketing  ",
		Description: "  Description  ",
		IsActive:    true,
	}

	cc, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "CC001", cc.Code)
	assert.Equal(t, "Marketing", cc.Name)
	assert.Equal(t, "Description", cc.Description)
}

func TestCostCenterService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "CC001", found.Code)
}

func TestCostCenterService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrCostCenterNotFound)
}

func TestCostCenterService_GetByCode_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByCode(ctx, tenant.ID, "CC001")
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestCostCenterService_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	_, err := svc.GetByCode(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, service.ErrCostCenterNotFound)
}

func TestCostCenterService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Original Name",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newDesc := "New description"
	isActive := false
	updateInput := service.UpdateCostCenterInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "New description", updated.Description)
	assert.False(t, updated.IsActive)
}

func TestCostCenterService_Update_Code(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newCode := "CC999"
	updateInput := service.UpdateCostCenterInput{
		Code: &newCode,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "CC999", updated.Code)
}

func TestCostCenterService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateCostCenterInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrCostCenterNotFound)
}

func TestCostCenterService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateCostCenterInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCostCenterNameRequired)
}

func TestCostCenterService_Update_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyCode := "   "
	updateInput := service.UpdateCostCenterInput{
		Code: &emptyCode,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCostCenterCodeRequired)
}

func TestCostCenterService_Update_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	// Create first cost center
	input1 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create second cost center
	input2 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC002",
		Name:     "Sales",
		IsActive: true,
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to update second cost center with first cost center's code
	conflictingCode := "CC001"
	updateInput := service.UpdateCostCenterInput{
		Code: &conflictingCode,
	}

	_, err = svc.Update(ctx, created2.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCostCenterCodeExists)
}

func TestCostCenterService_Update_SameCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Update with the same code should work
	sameCode := "CC001"
	updateInput := service.UpdateCostCenterInput{
		Code: &sameCode,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "CC001", updated.Code)
}

func TestCostCenterService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "To Delete",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrCostCenterNotFound)
}

func TestCostCenterService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrCostCenterNotFound)
}

func TestCostCenterService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	codes := []string{"CC001", "CC002", "CC003"}
	for _, code := range codes {
		input := service.CreateCostCenterInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Cost Center " + code,
			IsActive: true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	costCenters, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, costCenters, 3)
}

func TestCostCenterService_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	costCenters, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, costCenters)
}

func TestCostCenterService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	// Create active and inactive cost centers
	input1 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Active",
		IsActive: true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	input2 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC002",
		Name:     "Inactive",
		IsActive: false,
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	costCenters, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, costCenters, 1)
	assert.Equal(t, "CC001", costCenters[0].Code)
}

func TestCostCenterService_ListActive_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewCostCenterRepository(db)
	svc := service.NewCostCenterService(repo)
	ctx := context.Background()

	tenant := createTestTenantForCostCenterService(t, db)

	costCenters, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, costCenters)
}
