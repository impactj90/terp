package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForEmploymentType creates a tenant for use in employment type tests
func createTestTenantForEmploymentType(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestEmploymentTypeRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	et := &model.EmploymentType{
		TenantID:           &tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}

	err := repo.Create(ctx, et)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, et.ID)
}

func TestEmploymentTypeRepository_Create_WithWeeklyHours(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	et := &model.EmploymentType{
		TenantID:           &tenant.ID,
		Code:               "PT",
		Name:               "Part Time",
		DefaultWeeklyHours: decimal.NewFromFloat(20.0),
		IsActive:           true,
	}

	err := repo.Create(ctx, et)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, et.ID)
	require.NoError(t, err)
	assert.True(t, decimal.NewFromFloat(20.0).Equal(found.DefaultWeeklyHours))
}

func TestEmploymentTypeRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	et := &model.EmploymentType{
		TenantID:           &tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
	}
	require.NoError(t, repo.Create(ctx, et))

	found, err := repo.GetByID(ctx, et.ID)
	require.NoError(t, err)
	assert.Equal(t, et.ID, found.ID)
	assert.Equal(t, et.Code, found.Code)
	assert.Equal(t, et.Name, found.Name)
	assert.True(t, et.DefaultWeeklyHours.Equal(found.DefaultWeeklyHours))
}

func TestEmploymentTypeRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	et := &model.EmploymentType{
		TenantID:           &tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
	}
	require.NoError(t, repo.Create(ctx, et))

	found, err := repo.GetByCode(ctx, tenant.ID, "FT")
	require.NoError(t, err)
	assert.Equal(t, et.ID, found.ID)
	assert.Equal(t, "FT", found.Code)
}

func TestEmploymentTypeRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByCode(ctx, uuid.New(), "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	et := &model.EmploymentType{
		TenantID:           &tenant.ID,
		Code:               "FT",
		Name:               "Original Name",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
	}
	require.NoError(t, repo.Create(ctx, et))

	et.Name = "Updated Name"
	et.DefaultWeeklyHours = decimal.NewFromFloat(35.0)
	err := repo.Update(ctx, et)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, et.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
	assert.True(t, decimal.NewFromFloat(35.0).Equal(found.DefaultWeeklyHours))
}

func TestEmploymentTypeRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	et := &model.EmploymentType{
		TenantID:           &tenant.ID,
		Code:               "FT",
		Name:               "To Delete",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
	}
	require.NoError(t, repo.Create(ctx, et))

	err := repo.Delete(ctx, et.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, et.ID)
	assert.ErrorIs(t, err, repository.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	require.NoError(t, repo.Create(ctx, &model.EmploymentType{TenantID: &tenant.ID, Code: "FT", Name: "Full Time", DefaultWeeklyHours: decimal.NewFromFloat(40.0), IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.EmploymentType{TenantID: &tenant.ID, Code: "PT", Name: "Part Time", DefaultWeeklyHours: decimal.NewFromFloat(20.0), IsActive: false}))

	employmentTypes, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	// Filter to tenant-specific only (system types also included)
	var tenantTypes []model.EmploymentType
	for _, et := range employmentTypes {
		if et.TenantID != nil {
			tenantTypes = append(tenantTypes, et)
		}
	}
	assert.Len(t, tenantTypes, 2)
}

func TestEmploymentTypeRepository_List_OrderedByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	require.NoError(t, repo.Create(ctx, &model.EmploymentType{TenantID: &tenant.ID, Code: "PT", Name: "Part Time", DefaultWeeklyHours: decimal.NewFromFloat(20.0)}))
	require.NoError(t, repo.Create(ctx, &model.EmploymentType{TenantID: &tenant.ID, Code: "CT", Name: "Contract", DefaultWeeklyHours: decimal.NewFromFloat(40.0)}))
	require.NoError(t, repo.Create(ctx, &model.EmploymentType{TenantID: &tenant.ID, Code: "FT", Name: "Full Time", DefaultWeeklyHours: decimal.NewFromFloat(40.0)}))

	employmentTypes, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	// Filter to tenant-specific only to check ordering
	var tenantTypes []model.EmploymentType
	for _, et := range employmentTypes {
		if et.TenantID != nil {
			tenantTypes = append(tenantTypes, et)
		}
	}
	assert.Len(t, tenantTypes, 3)
	assert.Equal(t, "CT", tenantTypes[0].Code)
	assert.Equal(t, "FT", tenantTypes[1].Code)
	assert.Equal(t, "PT", tenantTypes[2].Code)
}

func TestEmploymentTypeRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)

	employmentTypes, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	// Only system types should be present
	for _, et := range employmentTypes {
		assert.Nil(t, et.TenantID)
	}
}

func TestEmploymentTypeRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)
	require.NoError(t, repo.Create(ctx, &model.EmploymentType{TenantID: &tenant.ID, Code: "FT", Name: "Full Time", DefaultWeeklyHours: decimal.NewFromFloat(40.0), IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.EmploymentType{TenantID: &tenant.ID, Code: "PT", Name: "Part Time", DefaultWeeklyHours: decimal.NewFromFloat(20.0), IsActive: false}))

	employmentTypes, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	// Should include tenant-specific active + system types
	var tenantActive []model.EmploymentType
	for _, et := range employmentTypes {
		if et.TenantID != nil {
			tenantActive = append(tenantActive, et)
		}
	}
	assert.Len(t, tenantActive, 1)
	assert.Equal(t, "FT", tenantActive[0].Code)
}

func TestEmploymentTypeRepository_ListActive_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmploymentTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmploymentType(t, db)

	employmentTypes, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	// Only system types should be present
	for _, et := range employmentTypes {
		assert.Nil(t, et.TenantID)
	}
}
