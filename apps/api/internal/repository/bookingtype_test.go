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

func createTestTenantForBookingType(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestBookingTypeRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)

	bt := &model.BookingType{
		TenantID:  &tenant.ID,
		Code:      "CUSTOM-IN",
		Name:      "Custom Clock In",
		Direction: model.BookingDirectionIn,
		IsActive:  true,
	}

	err := repo.Create(ctx, bt)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, bt.ID)
}

func TestBookingTypeRepository_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)
	description := "A custom booking type for special entries"

	bt := &model.BookingType{
		TenantID:    &tenant.ID,
		Code:        "DESC-TYPE",
		Name:        "Type with Description",
		Description: &description,
		Direction:   model.BookingDirectionOut,
		IsActive:    true,
	}

	err := repo.Create(ctx, bt)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, bt.ID)
	require.NoError(t, err)
	require.NotNil(t, found.Description)
	assert.Equal(t, description, *found.Description)
}

func TestBookingTypeRepository_Create_SystemType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	bt := &model.BookingType{
		TenantID:  nil, // System type
		Code:      "SYS-TEST",
		Name:      "System Test Type",
		Direction: model.BookingDirectionIn,
		IsSystem:  true,
		IsActive:  true,
	}

	err := repo.Create(ctx, bt)
	require.NoError(t, err)
	assert.True(t, bt.IsSystem)
	assert.Nil(t, bt.TenantID)
}

func TestBookingTypeRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)
	bt := &model.BookingType{
		TenantID:  &tenant.ID,
		Code:      "GETBYID",
		Name:      "Get By ID Test",
		Direction: model.BookingDirectionIn,
	}
	require.NoError(t, repo.Create(ctx, bt))

	found, err := repo.GetByID(ctx, bt.ID)
	require.NoError(t, err)
	assert.Equal(t, bt.ID, found.ID)
	assert.Equal(t, bt.Code, found.Code)
	assert.Equal(t, bt.Name, found.Name)
	assert.Equal(t, model.BookingDirectionIn, found.Direction)
}

func TestBookingTypeRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingTypeNotFound)
}

func TestBookingTypeRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)
	bt := &model.BookingType{
		TenantID:  &tenant.ID,
		Code:      "UNIQUE-CODE",
		Name:      "Unique Code Type",
		Direction: model.BookingDirectionOut,
	}
	require.NoError(t, repo.Create(ctx, bt))

	found, err := repo.GetByCode(ctx, &tenant.ID, "UNIQUE-CODE")
	require.NoError(t, err)
	assert.Equal(t, bt.ID, found.ID)
}

func TestBookingTypeRepository_GetByCode_SystemType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	// Create a system type within the test transaction
	systemType := &model.BookingType{
		TenantID:  nil, // System type
		Code:      "SYS-CODE-TEST",
		Name:      "System Code Test",
		Direction: model.BookingDirectionIn,
		IsSystem:  true,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	found, err := repo.GetByCode(ctx, nil, "SYS-CODE-TEST")
	require.NoError(t, err)
	assert.Equal(t, "SYS-CODE-TEST", found.Code)
	assert.True(t, found.IsSystem)
}

func TestBookingTypeRepository_GetByCode_TenantCanSeeSystemType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)

	// Create a system type within the test transaction
	systemType := &model.BookingType{
		TenantID:  nil, // System type
		Code:      "SYS-VISIBLE",
		Name:      "System Visible",
		Direction: model.BookingDirectionIn,
		IsSystem:  true,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	// Tenant should be able to see system types
	found, err := repo.GetByCode(ctx, &tenant.ID, "SYS-VISIBLE")
	require.NoError(t, err)
	assert.Equal(t, "SYS-VISIBLE", found.Code)
	assert.True(t, found.IsSystem)
}

func TestBookingTypeRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)

	_, err := repo.GetByCode(ctx, &tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrBookingTypeNotFound)
}

func TestBookingTypeRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)
	bt := &model.BookingType{
		TenantID:  &tenant.ID,
		Code:      "UPDATE",
		Name:      "Original Name",
		Direction: model.BookingDirectionIn,
	}
	require.NoError(t, repo.Create(ctx, bt))

	bt.Name = "Updated Name"
	err := repo.Update(ctx, bt)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, bt.ID)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestBookingTypeRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)
	bt := &model.BookingType{
		TenantID:  &tenant.ID,
		Code:      "DELETE",
		Name:      "To Delete",
		Direction: model.BookingDirectionOut,
	}
	require.NoError(t, repo.Create(ctx, bt))

	err := repo.Delete(ctx, bt.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, bt.ID)
	assert.ErrorIs(t, err, repository.ErrBookingTypeNotFound)
}

func TestBookingTypeRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingTypeNotFound)
}

func TestBookingTypeRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: &tenant.ID, Code: "B", Name: "Type B", Direction: model.BookingDirectionOut}))
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: &tenant.ID, Code: "A", Name: "Type A", Direction: model.BookingDirectionIn}))

	types, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, types, 2)
	// Verify ordered by code
	assert.Equal(t, "A", types[0].Code)
	assert.Equal(t, "B", types[1].Code)
}

func TestBookingTypeRepository_List_ExcludesSystemTypes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: &tenant.ID, Code: "TENANT-TYPE", Name: "Tenant Type", Direction: model.BookingDirectionIn}))

	types, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)

	// Should only return tenant-specific types, not system types
	for _, bt := range types {
		assert.False(t, bt.IsSystem)
	}
}

func TestBookingTypeRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)

	types, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, types)
}

func TestBookingTypeRepository_ListWithSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)

	// Create system types within the test transaction
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-COME", Name: "System Come", Direction: model.BookingDirectionIn, IsSystem: true, IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-GO", Name: "System Go", Direction: model.BookingDirectionOut, IsSystem: true, IsActive: true}))

	// Create tenant-specific type
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: &tenant.ID, Code: "CUSTOM", Name: "Custom Type", Direction: model.BookingDirectionIn, IsActive: true}))

	types, err := repo.ListWithSystem(ctx, tenant.ID)
	require.NoError(t, err)

	// Should include 2 system types plus 1 custom = 3
	assert.GreaterOrEqual(t, len(types), 3)

	// Verify system types are included
	var hasSystemType bool
	for _, bt := range types {
		if bt.IsSystem {
			hasSystemType = true
			break
		}
	}
	assert.True(t, hasSystemType, "Should include system types")
}

func TestBookingTypeRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)

	// Create active type
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: &tenant.ID, Code: "ACTIVE", Name: "Active", Direction: model.BookingDirectionIn, IsActive: true}))

	// Create and then deactivate another type
	inactiveType := &model.BookingType{TenantID: &tenant.ID, Code: "INACTIVE", Name: "Inactive", Direction: model.BookingDirectionOut, IsActive: true}
	require.NoError(t, repo.Create(ctx, inactiveType))
	inactiveType.IsActive = false
	require.NoError(t, repo.Update(ctx, inactiveType))

	types, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)

	// All returned types should be active
	for _, bt := range types {
		assert.True(t, bt.IsActive)
	}

	// Check that INACTIVE is not in results
	var foundInactive bool
	for _, bt := range types {
		if bt.Code == "INACTIVE" {
			foundInactive = true
		}
	}
	assert.False(t, foundInactive, "Should not include inactive types")
}

func TestBookingTypeRepository_ListByDirection(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBookingType(t, db)
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: &tenant.ID, Code: "IN-TYPE", Name: "In Type", Direction: model.BookingDirectionIn, IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: &tenant.ID, Code: "OUT-TYPE", Name: "Out Type", Direction: model.BookingDirectionOut, IsActive: true}))

	inTypes, err := repo.ListByDirection(ctx, tenant.ID, model.BookingDirectionIn)
	require.NoError(t, err)

	// All returned types should have direction "in"
	for _, bt := range inTypes {
		assert.Equal(t, model.BookingDirectionIn, bt.Direction)
	}

	outTypes, err := repo.ListByDirection(ctx, tenant.ID, model.BookingDirectionOut)
	require.NoError(t, err)

	// All returned types should have direction "out"
	for _, bt := range outTypes {
		assert.Equal(t, model.BookingDirectionOut, bt.Direction)
	}
}

func TestBookingTypeRepository_GetSystemTypes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	ctx := context.Background()

	// Create system types within the test transaction
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-A", Name: "System A", Direction: model.BookingDirectionIn, IsSystem: true, IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-B", Name: "System B", Direction: model.BookingDirectionOut, IsSystem: true, IsActive: true}))

	types, err := repo.GetSystemTypes(ctx)
	require.NoError(t, err)

	// Should return the system types we created
	assert.GreaterOrEqual(t, len(types), 2)

	// All returned types should be system types
	for _, bt := range types {
		assert.True(t, bt.IsSystem)
		assert.Nil(t, bt.TenantID)
	}
}
