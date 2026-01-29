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

func createTestTenantForBTGService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "BTG Test Tenant " + uuid.New().String()[:8],
		Slug:     "btg-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func createTestBookingTypeForBTGService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.BookingType {
	t.Helper()
	repo := repository.NewBookingTypeRepository(db)
	bt := &model.BookingType{
		TenantID:  &tenantID,
		Code:      "BTG-" + uuid.New().String()[:8],
		Name:      "BTG Test Type",
		Direction: model.BookingDirectionIn,
		Category:  model.BookingCategoryWork,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(context.Background(), bt))
	return bt
}

func newBookingTypeGroupService(db *repository.DB) *service.BookingTypeGroupService {
	return service.NewBookingTypeGroupService(repository.NewBookingTypeGroupRepository(db))
}

func TestBookingTypeGroupService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)

	g, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID:    tenant.ID,
		Code:        "TERMINAL-1",
		Name:        "Terminal Default",
		Description: strPtr("Default booking types for terminal"),
	})
	require.NoError(t, err)
	assert.Equal(t, "TERMINAL-1", g.Code)
	assert.Equal(t, "Terminal Default", g.Name)
	assert.NotNil(t, g.Description)
	assert.Equal(t, "Default booking types for terminal", *g.Description)
	assert.True(t, g.IsActive)
}

func TestBookingTypeGroupService_Create_WithMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)
	bt1 := createTestBookingTypeForBTGService(t, db, tenant.ID)
	bt2 := createTestBookingTypeForBTGService(t, db, tenant.ID)

	g, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID:       tenant.ID,
		Code:           "WITH-MEMBERS",
		Name:           "With Members",
		BookingTypeIDs: []uuid.UUID{bt1.ID, bt2.ID},
	})
	require.NoError(t, err)

	members, err := svc.ListMembers(ctx, g.ID)
	require.NoError(t, err)
	assert.Len(t, members, 2)
}

func TestBookingTypeGroupService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)

	_, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "DUP",
		Name:     "First",
	})
	require.NoError(t, err)

	_, err = svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "DUP",
		Name:     "Second",
	})
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupCodeExists)
}

func TestBookingTypeGroupService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)

	_, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Test",
	})
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupCodeRequired)
}

func TestBookingTypeGroupService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)

	_, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "TEST",
		Name:     "",
	})
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupNameRequired)
}

func TestBookingTypeGroupService_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "GET01",
		Name:     "Get Test",
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "GET01", found.Code)
}

func TestBookingTypeGroupService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupNotFound)
}

func TestBookingTypeGroupService_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "UPD01",
		Name:     "Original",
	})
	require.NoError(t, err)

	newName := "Updated"
	newDesc := "Updated description"
	inactive := false
	updated, err := svc.Update(ctx, created.ID, service.UpdateBookingTypeGroupInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &inactive,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated", updated.Name)
	assert.NotNil(t, updated.Description)
	assert.Equal(t, "Updated description", *updated.Description)
	assert.False(t, updated.IsActive)
}

func TestBookingTypeGroupService_Update_Members(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)
	bt1 := createTestBookingTypeForBTGService(t, db, tenant.ID)
	bt2 := createTestBookingTypeForBTGService(t, db, tenant.ID)
	bt3 := createTestBookingTypeForBTGService(t, db, tenant.ID)

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID:       tenant.ID,
		Code:           "UPD-MEMBERS",
		Name:           "Update Members",
		BookingTypeIDs: []uuid.UUID{bt1.ID, bt2.ID},
	})
	require.NoError(t, err)

	// Verify initial members
	members, err := svc.ListMembers(ctx, created.ID)
	require.NoError(t, err)
	assert.Len(t, members, 2)

	// Update with different members
	_, err = svc.Update(ctx, created.ID, service.UpdateBookingTypeGroupInput{
		BookingTypeIDs: []uuid.UUID{bt2.ID, bt3.ID},
	})
	require.NoError(t, err)

	// Verify updated members
	members2, err := svc.ListMembers(ctx, created.ID)
	require.NoError(t, err)
	assert.Len(t, members2, 2)
	// Should contain bt2 and bt3
	memberIDs := make(map[uuid.UUID]bool)
	for _, m := range members2 {
		memberIDs[m.ID] = true
	}
	assert.True(t, memberIDs[bt2.ID])
	assert.True(t, memberIDs[bt3.ID])
}

func TestBookingTypeGroupService_Update_ClearMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)
	bt1 := createTestBookingTypeForBTGService(t, db, tenant.ID)

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID:       tenant.ID,
		Code:           "CLR-MEMBERS",
		Name:           "Clear Members",
		BookingTypeIDs: []uuid.UUID{bt1.ID},
	})
	require.NoError(t, err)

	// Clear all members
	_, err = svc.Update(ctx, created.ID, service.UpdateBookingTypeGroupInput{
		BookingTypeIDs: []uuid.UUID{},
	})
	require.NoError(t, err)

	members, err := svc.ListMembers(ctx, created.ID)
	require.NoError(t, err)
	assert.Len(t, members, 0)
}

func TestBookingTypeGroupService_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "DEL01",
		Name:     "To Delete",
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupNotFound)
}

func TestBookingTypeGroupService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupNotFound)
}

func TestBookingTypeGroupService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingTypeGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForBTGService(t, db)

	for _, code := range []string{"LST01", "LST02", "LST03"} {
		_, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "List " + code,
		})
		require.NoError(t, err)
	}

	groups, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, groups, 3)
}

// strPtr is a helper to create a pointer to a string
func strPtr(s string) *string {
	return &s
}
