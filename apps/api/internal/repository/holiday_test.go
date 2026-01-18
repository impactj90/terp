package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenant creates a tenant for use in holiday tests
func createTestTenant(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestHolidayRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	holiday := &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:        "New Year",
		IsHalfDay:   false,
	}

	err := repo.Create(ctx, holiday)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, holiday.ID)
}

func TestHolidayRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	// Create tenant and holiday first
	tenant := createTestTenant(t, db)
	holiday := &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:        "New Year",
	}
	require.NoError(t, repo.Create(ctx, holiday))

	// Test GetByID
	found, err := repo.GetByID(ctx, holiday.ID)
	require.NoError(t, err)
	assert.Equal(t, holiday.ID, found.ID)
	assert.Equal(t, holiday.Name, found.Name)
}

func TestHolidayRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrHolidayNotFound)
}

func TestHolidayRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	holiday := &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:        "Original Name",
	}
	require.NoError(t, repo.Create(ctx, holiday))

	holiday.Name = "Updated Name"
	err := repo.Update(ctx, holiday)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, holiday.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestHolidayRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	holiday := &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:        "To Delete",
	}
	require.NoError(t, repo.Create(ctx, holiday))

	err := repo.Delete(ctx, holiday.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, holiday.ID)
	assert.ErrorIs(t, err, repository.ErrHolidayNotFound)
}

func TestHolidayRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrHolidayNotFound)
}

func TestHolidayRepository_GetByDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	require.NoError(t, repo.Create(ctx, &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:        "New Year",
	}))
	require.NoError(t, repo.Create(ctx, &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC),
		Name:        "Christmas",
	}))

	from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 12, 31, 0, 0, 0, 0, time.UTC)
	holidays, err := repo.GetByDateRange(ctx, tenant.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, holidays, 2)
}

func TestHolidayRepository_GetByDateRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 12, 31, 0, 0, 0, 0, time.UTC)

	holidays, err := repo.GetByDateRange(ctx, tenant.ID, from, to)
	require.NoError(t, err)
	assert.Empty(t, holidays)
}

func TestHolidayRepository_GetByDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	date := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	require.NoError(t, repo.Create(ctx, &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: date,
		Name:        "New Year",
	}))

	found, err := repo.GetByDate(ctx, tenant.ID, date)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, "New Year", found.Name)
}

func TestHolidayRepository_GetByDate_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	date := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	found, err := repo.GetByDate(ctx, tenant.ID, date)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestHolidayRepository_ListByYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)
	require.NoError(t, repo.Create(ctx, &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:        "New Year 2024",
	}))
	require.NoError(t, repo.Create(ctx, &model.Holiday{
		TenantID:    tenant.ID,
		HolidayDate: time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:        "New Year 2025",
	}))

	holidays, err := repo.ListByYear(ctx, tenant.ID, 2024)
	require.NoError(t, err)
	assert.Len(t, holidays, 1)
	assert.Equal(t, "New Year 2024", holidays[0].Name)
}

func TestHolidayRepository_ListByYear_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewHolidayRepository(db)
	ctx := context.Background()

	tenant := createTestTenant(t, db)

	holidays, err := repo.ListByYear(ctx, tenant.ID, 2024)
	require.NoError(t, err)
	assert.Empty(t, holidays)
}
