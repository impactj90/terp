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

func createTestTenantForOrderService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestOrderService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input := service.CreateOrderInput{
		TenantID:    tenant.ID,
		Code:        "ORD001",
		Name:        "Project Alpha",
		Description: "Alpha project order",
		Status:      "planned",
		Customer:    "Acme Corp",
	}

	o, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "ORD001", o.Code)
	assert.Equal(t, "Project Alpha", o.Name)
	assert.Equal(t, "Alpha project order", o.Description)
	assert.Equal(t, model.OrderStatusPlanned, o.Status)
	assert.Equal(t, "Acme Corp", o.Customer)
	assert.True(t, o.IsActive)
}

func TestOrderService_Create_DefaultStatus(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "No Status",
	}

	o, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, model.OrderStatusActive, o.Status)
}

func TestOrderService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Project Alpha",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrOrderCodeRequired)
}

func TestOrderService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrOrderNameRequired)
}

func TestOrderService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "First",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "Second",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrOrderCodeExists)
}

func TestOrderService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "Project Alpha",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "ORD001", found.Code)
}

func TestOrderService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrOrderNotFound)
}

func TestOrderService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated"
	newStatus := "active"
	isActive := false
	updateInput := service.UpdateOrderInput{
		Name:     &newName,
		Status:   &newStatus,
		IsActive: &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated", updated.Name)
	assert.Equal(t, model.OrderStatusActive, updated.Status)
	assert.False(t, updated.IsActive)
}

func TestOrderService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	newName := "Updated"
	_, err := svc.Update(ctx, uuid.New(), service.UpdateOrderInput{Name: &newName})
	assert.ErrorIs(t, err, service.ErrOrderNotFound)
}

func TestOrderService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrOrderNotFound)
}

func TestOrderService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrOrderNotFound)
}

func TestOrderService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	codes := []string{"ORD001", "ORD002", "ORD003"}
	for _, code := range codes {
		input := service.CreateOrderInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Order " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	orders, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, orders, 3)
}

func TestOrderService_ListByStatus(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	// Create orders with different statuses
	input1 := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "Planned",
		Status:   "planned",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	input2 := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD002",
		Name:     "Active",
		Status:   "active",
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	orders, err := svc.ListByStatus(ctx, tenant.ID, model.OrderStatusActive)
	require.NoError(t, err)
	assert.Len(t, orders, 1)
	assert.Equal(t, "ORD002", orders[0].Code)
}

func TestOrderService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewOrderRepository(db)
	svc := service.NewOrderService(repo)
	ctx := context.Background()

	tenant := createTestTenantForOrderService(t, db)

	input1 := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD001",
		Name:     "Active Order",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate
	input2 := service.CreateOrderInput{
		TenantID: tenant.ID,
		Code:     "ORD002",
		Name:     "Inactive Order",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, created2.ID, service.UpdateOrderInput{IsActive: &isActive})
	require.NoError(t, err)

	orders, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, orders, 1)
	assert.Equal(t, "ORD001", orders[0].Code)
}
