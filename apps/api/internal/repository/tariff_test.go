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

func createTestTenantForTariff(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestTariffRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)

	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "STANDARD",
		Name:     "Standard Tariff",
		IsActive: true,
	}

	err := repo.Create(ctx, tariff)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, tariff.ID)
}

func TestTariffRepository_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	description := "A standard tariff with default breaks"

	tariff := &model.Tariff{
		TenantID:    tenant.ID,
		Code:        "DESC-TARIFF",
		Name:        "Tariff with Description",
		Description: &description,
		IsActive:    true,
	}

	err := repo.Create(ctx, tariff)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, tariff.ID)
	require.NoError(t, err)
	require.NotNil(t, found.Description)
	assert.Equal(t, description, *found.Description)
}

func TestTariffRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "GETBYID",
		Name:     "Get By ID Test",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	found, err := repo.GetByID(ctx, tariff.ID)
	require.NoError(t, err)
	assert.Equal(t, tariff.ID, found.ID)
	assert.Equal(t, tariff.Code, found.Code)
	assert.Equal(t, tariff.Name, found.Name)
}

func TestTariffRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTariffNotFound)
}

func TestTariffRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "UNIQUE-TARIFF",
		Name:     "Unique Tariff",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	found, err := repo.GetByCode(ctx, tenant.ID, "UNIQUE-TARIFF")
	require.NoError(t, err)
	assert.Equal(t, tariff.ID, found.ID)
}

func TestTariffRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)

	_, err := repo.GetByCode(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrTariffNotFound)
}

func TestTariffRepository_GetWithDetails(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)

	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "DETAILED",
		Name:     "Tariff with Breaks",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	// Add breaks
	break1 := &model.TariffBreak{
		TariffID:  tariff.ID,
		BreakType: model.BreakTypeMinimum,
		Duration:  30,
		SortOrder: 1,
	}
	break2 := &model.TariffBreak{
		TariffID:  tariff.ID,
		BreakType: model.BreakTypeMinimum,
		Duration:  15,
		SortOrder: 0,
	}
	require.NoError(t, repo.CreateBreak(ctx, break1))
	require.NoError(t, repo.CreateBreak(ctx, break2))

	found, err := repo.GetWithDetails(ctx, tariff.ID)
	require.NoError(t, err)
	assert.Equal(t, tariff.ID, found.ID)
	assert.Len(t, found.Breaks, 2)
	// Verify ordered by sort_order
	assert.Equal(t, 0, found.Breaks[0].SortOrder)
	assert.Equal(t, 1, found.Breaks[1].SortOrder)
}

func TestTariffRepository_GetWithDetails_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	_, err := repo.GetWithDetails(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTariffNotFound)
}

func TestTariffRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "UPDATE",
		Name:     "Original Name",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	tariff.Name = "Updated Name"
	err := repo.Update(ctx, tariff)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, tariff.ID)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestTariffRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "DELETE",
		Name:     "To Delete",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	err := repo.Delete(ctx, tariff.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, tariff.ID)
	assert.ErrorIs(t, err, repository.ErrTariffNotFound)
}

func TestTariffRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTariffNotFound)
}

func TestTariffRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	require.NoError(t, repo.Create(ctx, &model.Tariff{TenantID: tenant.ID, Code: "B", Name: "Tariff B"}))
	require.NoError(t, repo.Create(ctx, &model.Tariff{TenantID: tenant.ID, Code: "A", Name: "Tariff A"}))

	tariffs, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, tariffs, 2)
	// Verify ordered by code
	assert.Equal(t, "A", tariffs[0].Code)
	assert.Equal(t, "B", tariffs[1].Code)
}

func TestTariffRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)

	tariffs, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, tariffs)
}

func TestTariffRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	require.NoError(t, repo.Create(ctx, &model.Tariff{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active", IsActive: true}))

	// Create and then update to inactive
	inactiveTariff := &model.Tariff{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive"}
	require.NoError(t, repo.Create(ctx, inactiveTariff))
	inactiveTariff.IsActive = false
	require.NoError(t, repo.Update(ctx, inactiveTariff))

	tariffs, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, tariffs, 1)
	assert.Equal(t, "ACTIVE", tariffs[0].Code)
}

func TestTariffRepository_CreateBreak(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "BREAK-TEST",
		Name:     "Break Test",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	afterWork := 360
	tariffBreak := &model.TariffBreak{
		TariffID:         tariff.ID,
		BreakType:        model.BreakTypeMinimum,
		AfterWorkMinutes: &afterWork,
		Duration:         30,
		IsPaid:           false,
		SortOrder:        0,
	}

	err := repo.CreateBreak(ctx, tariffBreak)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, tariffBreak.ID)
}

func TestTariffRepository_GetBreakByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "BREAK-GET",
		Name:     "Break Get",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	tariffBreak := &model.TariffBreak{
		TariffID:  tariff.ID,
		BreakType: model.BreakTypeFixed,
		Duration:  15,
	}
	require.NoError(t, repo.CreateBreak(ctx, tariffBreak))

	found, err := repo.GetBreakByID(ctx, tariffBreak.ID)
	require.NoError(t, err)
	assert.Equal(t, tariffBreak.ID, found.ID)
	assert.Equal(t, model.BreakTypeFixed, found.BreakType)
	assert.Equal(t, 15, found.Duration)
}

func TestTariffRepository_GetBreakByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	_, err := repo.GetBreakByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTariffBreakNotFound)
}

func TestTariffRepository_DeleteBreak(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "BREAK-DEL",
		Name:     "Break Delete",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	tariffBreak := &model.TariffBreak{
		TariffID:  tariff.ID,
		BreakType: model.BreakTypeVariable,
		Duration:  20,
	}
	require.NoError(t, repo.CreateBreak(ctx, tariffBreak))

	err := repo.DeleteBreak(ctx, tariffBreak.ID)
	require.NoError(t, err)

	_, err = repo.GetBreakByID(ctx, tariffBreak.ID)
	assert.ErrorIs(t, err, repository.ErrTariffBreakNotFound)
}

func TestTariffRepository_DeleteBreak_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	err := repo.DeleteBreak(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTariffBreakNotFound)
}

func TestTariffRepository_ListBreaks(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "BREAK-LIST",
		Name:     "Break List",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	// Create breaks with different sort orders
	require.NoError(t, repo.CreateBreak(ctx, &model.TariffBreak{TariffID: tariff.ID, BreakType: model.BreakTypeMinimum, Duration: 30, SortOrder: 2}))
	require.NoError(t, repo.CreateBreak(ctx, &model.TariffBreak{TariffID: tariff.ID, BreakType: model.BreakTypeMinimum, Duration: 15, SortOrder: 1}))
	require.NoError(t, repo.CreateBreak(ctx, &model.TariffBreak{TariffID: tariff.ID, BreakType: model.BreakTypeFixed, Duration: 10, SortOrder: 0}))

	breaks, err := repo.ListBreaks(ctx, tariff.ID)
	require.NoError(t, err)
	assert.Len(t, breaks, 3)
	// Verify ordered by sort_order
	assert.Equal(t, 0, breaks[0].SortOrder)
	assert.Equal(t, 1, breaks[1].SortOrder)
	assert.Equal(t, 2, breaks[2].SortOrder)
}

func TestTariffRepository_ListBreaks_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "NO-BREAKS",
		Name:     "No Breaks",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	breaks, err := repo.ListBreaks(ctx, tariff.ID)
	require.NoError(t, err)
	assert.Empty(t, breaks)
}

func TestTariffRepository_CascadeDeleteBreaks(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTariffRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTariff(t, db)
	tariff := &model.Tariff{
		TenantID: tenant.ID,
		Code:     "CASCADE",
		Name:     "Cascade Delete",
	}
	require.NoError(t, repo.Create(ctx, tariff))

	// Add breaks
	tariffBreak := &model.TariffBreak{
		TariffID:  tariff.ID,
		BreakType: model.BreakTypeMinimum,
		Duration:  30,
	}
	require.NoError(t, repo.CreateBreak(ctx, tariffBreak))
	breakID := tariffBreak.ID

	// Delete tariff
	err := repo.Delete(ctx, tariff.ID)
	require.NoError(t, err)

	// Break should also be deleted due to cascade
	_, err = repo.GetBreakByID(ctx, breakID)
	assert.ErrorIs(t, err, repository.ErrTariffBreakNotFound)
}
