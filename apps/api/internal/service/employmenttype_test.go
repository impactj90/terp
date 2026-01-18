package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForEmploymentTypeService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestEmploymentTypeService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}

	et, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "FT", et.Code)
	assert.Equal(t, "Full Time", et.Name)
	assert.True(t, decimal.NewFromFloat(40.0).Equal(et.DefaultWeeklyHours))
	assert.Equal(t, tenant.ID, et.TenantID)
	assert.True(t, et.IsActive)
}

func TestEmploymentTypeService_Create_Inactive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           false,
	}

	et, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.False(t, et.IsActive)
}

func TestEmploymentTypeService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeCodeRequired)
}

func TestEmploymentTypeService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeNameRequired)
}

func TestEmploymentTypeService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time Duplicate",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeCodeExists)
}

func TestEmploymentTypeService_Create_TrimsWhitespace(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "  FT  ",
		Name:               "  Full Time  ",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}

	et, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "FT", et.Code)
	assert.Equal(t, "Full Time", et.Name)
}

func TestEmploymentTypeService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "FT", found.Code)
}

func TestEmploymentTypeService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeService_GetByCode_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByCode(ctx, tenant.ID, "FT")
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestEmploymentTypeService_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	_, err := svc.GetByCode(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, service.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Original Name",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newHours := decimal.NewFromFloat(35.0)
	isActive := false
	updateInput := service.UpdateEmploymentTypeInput{
		Name:               &newName,
		DefaultWeeklyHours: &newHours,
		IsActive:           &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.True(t, decimal.NewFromFloat(35.0).Equal(updated.DefaultWeeklyHours))
	assert.False(t, updated.IsActive)
}

func TestEmploymentTypeService_Update_Code(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newCode := "FULLTIME"
	updateInput := service.UpdateEmploymentTypeInput{
		Code: &newCode,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "FULLTIME", updated.Code)
}

func TestEmploymentTypeService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateEmploymentTypeInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateEmploymentTypeInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeNameRequired)
}

func TestEmploymentTypeService_Update_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyCode := "   "
	updateInput := service.UpdateEmploymentTypeInput{
		Code: &emptyCode,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeCodeRequired)
}

func TestEmploymentTypeService_Update_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	// Create first employment type
	input1 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create second employment type
	input2 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "PT",
		Name:               "Part Time",
		DefaultWeeklyHours: decimal.NewFromFloat(20.0),
		IsActive:           true,
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to update second employment type with first employment type's code
	conflictingCode := "FT"
	updateInput := service.UpdateEmploymentTypeInput{
		Code: &conflictingCode,
	}

	_, err = svc.Update(ctx, created2.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeCodeExists)
}

func TestEmploymentTypeService_Update_SameCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Update with the same code should work
	sameCode := "FT"
	updateInput := service.UpdateEmploymentTypeInput{
		Code: &sameCode,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "FT", updated.Code)
}

func TestEmploymentTypeService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "To Delete",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	codes := []string{"FT", "PT", "CT"}
	for _, code := range codes {
		input := service.CreateEmploymentTypeInput{
			TenantID:           tenant.ID,
			Code:               code,
			Name:               "Employment Type " + code,
			DefaultWeeklyHours: decimal.NewFromFloat(40.0),
			IsActive:           true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	employmentTypes, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, employmentTypes, 3)
}

func TestEmploymentTypeService_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	employmentTypes, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, employmentTypes)
}

func TestEmploymentTypeService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	// Create active and inactive employment types
	input1 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Active",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	input2 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "PT",
		Name:               "Inactive",
		DefaultWeeklyHours: decimal.NewFromFloat(20.0),
		IsActive:           false,
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	employmentTypes, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, employmentTypes, 1)
	assert.Equal(t, "FT", employmentTypes[0].Code)
}

func TestEmploymentTypeService_ListActive_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	svc := service.NewEmploymentTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentTypeService(t, db)

	employmentTypes, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, employmentTypes)
}
