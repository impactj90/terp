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

func createTestTenantForBookingTypeService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestBookingTypeService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "CUSTOM-IN",
		Name:      "Custom Clock In",
		Direction: "in",
	}

	bt, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "CUSTOM-IN", bt.Code)
	assert.Equal(t, "Custom Clock In", bt.Name)
	assert.Equal(t, model.BookingDirectionIn, bt.Direction)
	assert.True(t, bt.IsActive)
	assert.False(t, bt.IsSystem)
}

func TestBookingTypeService_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)
	description := "A custom booking type for special entries"

	input := service.CreateBookingTypeInput{
		TenantID:    tenant.ID,
		Code:        "DESC-TYPE",
		Name:        "Type with Description",
		Description: &description,
		Direction:   "out",
	}

	bt, err := svc.Create(ctx, input)
	require.NoError(t, err)
	require.NotNil(t, bt.Description)
	assert.Equal(t, description, *bt.Description)
}

func TestBookingTypeService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "",
		Name:      "Test Type",
		Direction: "in",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrBookingTypeCodeReq)
}

func TestBookingTypeService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "TEST",
		Name:      "",
		Direction: "in",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrBookingTypeNameReq)
}

func TestBookingTypeService_Create_EmptyDirection(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "TEST",
		Name:      "Test Type",
		Direction: "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrBookingTypeDirectionReq)
}

func TestBookingTypeService_Create_InvalidDirection(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "TEST",
		Name:      "Test Type",
		Direction: "invalid",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidDirection)
}

func TestBookingTypeService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "DUPLICATE",
		Name:      "First Type",
		Direction: "in",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "DUPLICATE",
		Name:      "Second Type",
		Direction: "out",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrBookingTypeCodeExists)
}

func TestBookingTypeService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "GET",
		Name:      "Get Test",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Get Test", found.Name)
}

func TestBookingTypeService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrBookingTypeNotFound)
}

func TestBookingTypeService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "UPDATE",
		Name:      "Original Name",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	isActive := false
	updateInput := service.UpdateBookingTypeInput{
		Name:     &newName,
		IsActive: &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, tenant.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.False(t, updated.IsActive)
}

func TestBookingTypeService_Update_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "UPDATE-DESC",
		Name:      "Original Name",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	description := "New description"
	updateInput := service.UpdateBookingTypeInput{
		Description: &description,
	}

	updated, err := svc.Update(ctx, created.ID, tenant.ID, updateInput)
	require.NoError(t, err)
	require.NotNil(t, updated.Description)
	assert.Equal(t, "New description", *updated.Description)
}

func TestBookingTypeService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	newName := "Updated"
	updateInput := service.UpdateBookingTypeInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), tenant.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrBookingTypeNotFound)
}

func TestBookingTypeService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "UPDATE-EMPTY",
		Name:      "Original Name",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateBookingTypeInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, tenant.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrBookingTypeNameReq)
}

func TestBookingTypeService_Update_CannotModifySystemType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	// Create a system type within the test transaction
	systemType := &model.BookingType{
		TenantID:  nil, // System type
		Code:      "SYS-TEST",
		Name:      "System Test",
		Direction: model.BookingDirectionIn,
		IsSystem:  true,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	newName := "Modified Name"
	updateInput := service.UpdateBookingTypeInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, systemType.ID, tenant.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCannotModifySystemType)
}

func TestBookingTypeService_Update_WrongTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant1 := createTestTenantForBookingTypeService(t, db)
	tenant2 := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant1.ID,
		Code:      "TENANT1-TYPE",
		Name:      "Tenant 1 Type",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Modified"
	updateInput := service.UpdateBookingTypeInput{
		Name: &newName,
	}

	// Try to update using tenant2's ID
	_, err = svc.Update(ctx, created.ID, tenant2.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrBookingTypeNotFound)
}

func TestBookingTypeService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "DELETE",
		Name:      "To Delete",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID, tenant.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrBookingTypeNotFound)
}

func TestBookingTypeService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	err := svc.Delete(ctx, uuid.New(), tenant.ID)
	assert.ErrorIs(t, err, service.ErrBookingTypeNotFound)
}

func TestBookingTypeService_Delete_CannotDeleteSystemType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	// Create a system type within the test transaction
	systemType := &model.BookingType{
		TenantID:  nil, // System type
		Code:      "SYS-DEL-TEST",
		Name:      "System Delete Test",
		Direction: model.BookingDirectionIn,
		IsSystem:  true,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	err := svc.Delete(ctx, systemType.ID, tenant.ID)
	assert.ErrorIs(t, err, service.ErrCannotDeleteSystemType)
}

func TestBookingTypeService_Delete_WrongTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant1 := createTestTenantForBookingTypeService(t, db)
	tenant2 := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant1.ID,
		Code:      "TENANT1-DEL",
		Name:      "Tenant 1 Delete",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to delete using tenant2's ID
	err = svc.Delete(ctx, created.ID, tenant2.ID)
	assert.ErrorIs(t, err, service.ErrBookingTypeNotFound)
}

func TestBookingTypeService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	// Create system types within the test transaction
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-COME", Name: "System Come", Direction: model.BookingDirectionIn, IsSystem: true, IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-GO", Name: "System Go", Direction: model.BookingDirectionOut, IsSystem: true, IsActive: true}))

	for _, code := range []string{"TYPE-A", "TYPE-B", "TYPE-C"} {
		input := service.CreateBookingTypeInput{
			TenantID:  tenant.ID,
			Code:      code,
			Name:      "Type " + code,
			Direction: "in",
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	types, err := svc.List(ctx, tenant.ID, service.ListFilter{})
	require.NoError(t, err)
	// Should include 3 custom types + 2 system types = 5
	assert.GreaterOrEqual(t, len(types), 5)
}

func TestBookingTypeService_List_ActiveOnly(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	// Create active type
	_, err := svc.Create(ctx, service.CreateBookingTypeInput{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active", Direction: "in"})
	require.NoError(t, err)

	// Create and deactivate another type
	created2, err := svc.Create(ctx, service.CreateBookingTypeInput{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive", Direction: "out"})
	require.NoError(t, err)

	isActive := false
	_, err = svc.Update(ctx, created2.ID, tenant.ID, service.UpdateBookingTypeInput{IsActive: &isActive})
	require.NoError(t, err)

	activeOnly := true
	types, err := svc.List(ctx, tenant.ID, service.ListFilter{ActiveOnly: &activeOnly})
	require.NoError(t, err)

	// All returned types should be active
	for _, bt := range types {
		assert.True(t, bt.IsActive)
	}
}

func TestBookingTypeService_List_ByDirection(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForBookingTypeService(t, db)

	_, err := svc.Create(ctx, service.CreateBookingTypeInput{TenantID: tenant.ID, Code: "IN-TYPE", Name: "In Type", Direction: "in"})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateBookingTypeInput{TenantID: tenant.ID, Code: "OUT-TYPE", Name: "Out Type", Direction: "out"})
	require.NoError(t, err)

	dirIn := model.BookingDirectionIn
	types, err := svc.List(ctx, tenant.ID, service.ListFilter{Direction: &dirIn})
	require.NoError(t, err)

	// All returned types should have direction "in"
	for _, bt := range types {
		assert.Equal(t, model.BookingDirectionIn, bt.Direction)
	}
}

func TestBookingTypeService_GetSystemTypes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()

	// Create system types within the test transaction
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-A", Name: "System A", Direction: model.BookingDirectionIn, IsSystem: true, IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-B", Name: "System B", Direction: model.BookingDirectionOut, IsSystem: true, IsActive: true}))

	types, err := svc.GetSystemTypes(ctx)
	require.NoError(t, err)
	// Should return the system types we created
	assert.GreaterOrEqual(t, len(types), 2)

	// All should be system types
	for _, bt := range types {
		assert.True(t, bt.IsSystem)
	}
}
