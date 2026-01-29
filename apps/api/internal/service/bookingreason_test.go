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

func createTestTenantForBRService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "BR Test Tenant " + uuid.New().String()[:8],
		Slug:     "br-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func createTestBookingTypeForBRService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.BookingType {
	t.Helper()
	repo := repository.NewBookingTypeRepository(db)
	bt := &model.BookingType{
		TenantID:  &tenantID,
		Code:      "BR-" + uuid.New().String()[:8],
		Name:      "BR Test Type",
		Direction: model.BookingDirectionIn,
		Category:  model.BookingCategoryWork,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(context.Background(), bt))
	return bt
}

func newBookingReasonService(db *repository.DB) *service.BookingReasonService {
	return service.NewBookingReasonService(repository.NewBookingReasonRepository(db))
}

func TestBookingReasonService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	br, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "ERRAND",
		Label:         "Work Errand",
	})
	require.NoError(t, err)
	assert.Equal(t, "ERRAND", br.Code)
	assert.Equal(t, "Work Errand", br.Label)
	assert.True(t, br.IsActive)
	assert.Equal(t, bt.ID, br.BookingTypeID)
}

func TestBookingReasonService_Create_WithSortOrder(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	so := 5
	br, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "ORDERED",
		Label:         "Ordered Reason",
		SortOrder:     &so,
	})
	require.NoError(t, err)
	assert.Equal(t, 5, br.SortOrder)
}

func TestBookingReasonService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	_, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "",
		Label:         "Test",
	})
	assert.ErrorIs(t, err, service.ErrBookingReasonCodeReq)
}

func TestBookingReasonService_Create_EmptyLabel(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	_, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "TEST",
		Label:         "",
	})
	assert.ErrorIs(t, err, service.ErrBookingReasonLabelReq)
}

func TestBookingReasonService_Create_MissingBookingTypeID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)

	_, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: uuid.Nil,
		Code:          "TEST",
		Label:         "Test",
	})
	assert.ErrorIs(t, err, service.ErrBookingReasonTypeIDReq)
}

func TestBookingReasonService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	_, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "DUP",
		Label:         "First",
	})
	require.NoError(t, err)

	_, err = svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "DUP",
		Label:         "Second",
	})
	assert.ErrorIs(t, err, service.ErrBookingReasonCodeExists)
}

func TestBookingReasonService_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	created, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "GET01",
		Label:         "Get Test",
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "GET01", found.Code)
}

func TestBookingReasonService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrBookingReasonNotFound)
}

func TestBookingReasonService_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	created, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "UPD01",
		Label:         "Original",
	})
	require.NoError(t, err)

	newLabel := "Updated Label"
	inactive := false
	newOrder := 10
	updated, err := svc.Update(ctx, created.ID, service.UpdateBookingReasonInput{
		Label:     &newLabel,
		IsActive:  &inactive,
		SortOrder: &newOrder,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated Label", updated.Label)
	assert.False(t, updated.IsActive)
	assert.Equal(t, 10, updated.SortOrder)
}

func TestBookingReasonService_Update_EmptyLabel(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	created, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "UPDEMPTY",
		Label:         "Original",
	})
	require.NoError(t, err)

	emptyLabel := "   "
	_, err = svc.Update(ctx, created.ID, service.UpdateBookingReasonInput{
		Label: &emptyLabel,
	})
	assert.ErrorIs(t, err, service.ErrBookingReasonLabelReq)
}

func TestBookingReasonService_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	created, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "DEL01",
		Label:         "To Delete",
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrBookingReasonNotFound)
}

func TestBookingReasonService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrBookingReasonNotFound)
}

func TestBookingReasonService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt := createTestBookingTypeForBRService(t, db, tenant.ID)

	for _, code := range []string{"LST01", "LST02", "LST03"} {
		_, err := svc.Create(ctx, service.CreateBookingReasonInput{
			TenantID:      tenant.ID,
			BookingTypeID: bt.ID,
			Code:          code,
			Label:         "List " + code,
		})
		require.NoError(t, err)
	}

	reasons, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, reasons, 3)
}

func TestBookingReasonService_ListByBookingType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newBookingReasonService(db)
	ctx := context.Background()
	tenant := createTestTenantForBRService(t, db)
	bt1 := createTestBookingTypeForBRService(t, db, tenant.ID)
	bt2 := createTestBookingTypeForBRService(t, db, tenant.ID)

	// Create reasons for bt1
	_, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt1.ID,
		Code:          "R1-A",
		Label:         "Reason 1A",
	})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt1.ID,
		Code:          "R1-B",
		Label:         "Reason 1B",
	})
	require.NoError(t, err)

	// Create reason for bt2
	_, err = svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt2.ID,
		Code:          "R2-A",
		Label:         "Reason 2A",
	})
	require.NoError(t, err)

	// Should return only bt1's reasons
	reasons, err := svc.ListByBookingType(ctx, tenant.ID, bt1.ID)
	require.NoError(t, err)
	assert.Len(t, reasons, 2)

	// Should return only bt2's reason
	reasons2, err := svc.ListByBookingType(ctx, tenant.ID, bt2.ID)
	require.NoError(t, err)
	assert.Len(t, reasons2, 1)
}
