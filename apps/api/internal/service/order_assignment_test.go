package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

type orderAssignmentTestFixture struct {
	db       *repository.DB
	svc      *service.OrderAssignmentService
	tenant   *model.Tenant
	employee *model.Employee
	order    *model.Order
}

func setupOrderAssignmentTest(t *testing.T) *orderAssignmentTestFixture {
	t.Helper()
	db := testutil.SetupTestDB(t)
	ctx := context.Background()

	// Create tenant
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(ctx, tenant))

	// Create employee
	employeeRepo := repository.NewEmployeeRepository(db)
	employee := &model.Employee{
		TenantID:            tenant.ID,
		PersonnelNumber:     "EMP001",
		PIN:                 "1234",
		FirstName:           "John",
		LastName:            "Doe",
		EntryDate:           time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:         decimal.NewFromFloat(40.0),
		VacationDaysPerYear: decimal.NewFromFloat(30.0),
		IsActive:            true,
	}
	require.NoError(t, employeeRepo.Create(ctx, employee))

	// Create order
	orderRepo := repository.NewOrderRepository(db)
	order := &model.Order{
		TenantID: tenant.ID,
		Code:     "ORD-TEST",
		Name:     "Test Order",
		Status:   model.OrderStatusActive,
		IsActive: true,
	}
	require.NoError(t, orderRepo.Create(ctx, order))

	// Create service
	assignmentRepo := repository.NewOrderAssignmentRepository(db)
	svc := service.NewOrderAssignmentService(assignmentRepo)

	return &orderAssignmentTestFixture{
		db:       db,
		svc:      svc,
		tenant:   tenant,
		employee: employee,
		order:    order,
	}
}

func TestOrderAssignmentService_Create_Success(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	input := service.CreateOrderAssignmentInput{
		TenantID:   f.tenant.ID,
		OrderID:    f.order.ID,
		EmployeeID: f.employee.ID,
		Role:       "leader",
	}

	a, err := f.svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, f.order.ID, a.OrderID)
	assert.Equal(t, f.employee.ID, a.EmployeeID)
	assert.Equal(t, model.OrderAssignmentRoleLeader, a.Role)
	assert.True(t, a.IsActive)
}

func TestOrderAssignmentService_Create_DefaultRole(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	input := service.CreateOrderAssignmentInput{
		TenantID:   f.tenant.ID,
		OrderID:    f.order.ID,
		EmployeeID: f.employee.ID,
	}

	a, err := f.svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, model.OrderAssignmentRoleWorker, a.Role)
}

func TestOrderAssignmentService_Create_DuplicateExists(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	input := service.CreateOrderAssignmentInput{
		TenantID:   f.tenant.ID,
		OrderID:    f.order.ID,
		EmployeeID: f.employee.ID,
		Role:       "worker",
	}

	_, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	// Try creating the same assignment again
	_, err = f.svc.Create(ctx, input)
	assert.Error(t, err) // Should fail due to unique constraint
}

func TestOrderAssignmentService_GetByID_Success(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	input := service.CreateOrderAssignmentInput{
		TenantID:   f.tenant.ID,
		OrderID:    f.order.ID,
		EmployeeID: f.employee.ID,
	}
	created, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := f.svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestOrderAssignmentService_GetByID_NotFound(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	_, err := f.svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrOrderAssignmentNotFound)
}

func TestOrderAssignmentService_Update_Success(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	input := service.CreateOrderAssignmentInput{
		TenantID:   f.tenant.ID,
		OrderID:    f.order.ID,
		EmployeeID: f.employee.ID,
	}
	created, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	newRole := "leader"
	isActive := false
	updateInput := service.UpdateOrderAssignmentInput{
		Role:     &newRole,
		IsActive: &isActive,
	}

	updated, err := f.svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, model.OrderAssignmentRoleLeader, updated.Role)
	assert.False(t, updated.IsActive)
}

func TestOrderAssignmentService_Update_NotFound(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	newRole := "leader"
	_, err := f.svc.Update(ctx, uuid.New(), service.UpdateOrderAssignmentInput{Role: &newRole})
	assert.ErrorIs(t, err, service.ErrOrderAssignmentNotFound)
}

func TestOrderAssignmentService_Delete_Success(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	input := service.CreateOrderAssignmentInput{
		TenantID:   f.tenant.ID,
		OrderID:    f.order.ID,
		EmployeeID: f.employee.ID,
	}
	created, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	err = f.svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = f.svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrOrderAssignmentNotFound)
}

func TestOrderAssignmentService_Delete_NotFound(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	err := f.svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrOrderAssignmentNotFound)
}

func TestOrderAssignmentService_ListByOrder(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	input := service.CreateOrderAssignmentInput{
		TenantID:   f.tenant.ID,
		OrderID:    f.order.ID,
		EmployeeID: f.employee.ID,
	}
	_, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	assignments, err := f.svc.ListByOrder(ctx, f.order.ID)
	require.NoError(t, err)
	assert.Len(t, assignments, 1)
}

func TestOrderAssignmentService_ListByEmployee(t *testing.T) {
	f := setupOrderAssignmentTest(t)
	ctx := context.Background()

	input := service.CreateOrderAssignmentInput{
		TenantID:   f.tenant.ID,
		OrderID:    f.order.ID,
		EmployeeID: f.employee.ID,
	}
	_, err := f.svc.Create(ctx, input)
	require.NoError(t, err)

	assignments, err := f.svc.ListByEmployee(ctx, f.employee.ID)
	require.NoError(t, err)
	assert.Len(t, assignments, 1)
}
