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

func createTestTenantForGroupService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Group Test Tenant " + uuid.New().String()[:8],
		Slug:     "grp-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func newGroupService(db *repository.DB) *service.GroupService {
	return service.NewGroupService(
		repository.NewEmployeeGroupRepository(db),
		repository.NewWorkflowGroupRepository(db),
		repository.NewActivityGroupRepository(db),
	)
}

// --- Employee Group Tests ---

func TestGroupService_CreateEmployeeGroup_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	input := service.CreateGroupInput{
		TenantID:    tenant.ID,
		Code:        "EG001",
		Name:        "Engineering",
		Description: "Engineering group",
		IsActive:    true,
	}
	g, err := svc.CreateEmployeeGroup(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "EG001", g.Code)
	assert.Equal(t, "Engineering", g.Name)
	assert.Equal(t, "Engineering group", g.Description)
	assert.True(t, g.IsActive)
}

func TestGroupService_CreateEmployeeGroup_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	input := service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "DUP01",
		Name:     "First",
		IsActive: true,
	}
	_, err := svc.CreateEmployeeGroup(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "DUP01",
		Name:     "Second",
		IsActive: true,
	}
	_, err = svc.CreateEmployeeGroup(ctx, input2)
	assert.ErrorIs(t, err, service.ErrGroupCodeExists)
}

func TestGroupService_CreateEmployeeGroup_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	input := service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "NoCode",
		IsActive: true,
	}
	_, err := svc.CreateEmployeeGroup(ctx, input)
	assert.ErrorIs(t, err, service.ErrGroupCodeRequired)
}

func TestGroupService_CreateEmployeeGroup_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	input := service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "EG002",
		Name:     "",
		IsActive: true,
	}
	_, err := svc.CreateEmployeeGroup(ctx, input)
	assert.ErrorIs(t, err, service.ErrGroupNameRequired)
}

func TestGroupService_GetEmployeeGroup(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	created, err := svc.CreateEmployeeGroup(ctx, service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "GET01",
		Name:     "Get Test",
		IsActive: true,
	})
	require.NoError(t, err)

	found, err := svc.GetEmployeeGroup(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "GET01", found.Code)
}

func TestGroupService_GetEmployeeGroup_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()

	_, err := svc.GetEmployeeGroup(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrGroupNotFound)
}

func TestGroupService_UpdateEmployeeGroup(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	created, err := svc.CreateEmployeeGroup(ctx, service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "UPD01",
		Name:     "Original",
		IsActive: true,
	})
	require.NoError(t, err)

	newName := "Updated"
	newDesc := "Updated description"
	updated, err := svc.UpdateEmployeeGroup(ctx, created.ID, service.UpdateGroupInput{
		Name:        &newName,
		Description: &newDesc,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated", updated.Name)
	assert.Equal(t, "Updated description", updated.Description)
}

func TestGroupService_DeleteEmployeeGroup(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	created, err := svc.CreateEmployeeGroup(ctx, service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "DEL01",
		Name:     "To Delete",
		IsActive: true,
	})
	require.NoError(t, err)

	err = svc.DeleteEmployeeGroup(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetEmployeeGroup(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrGroupNotFound)
}

func TestGroupService_ListEmployeeGroups(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	for _, code := range []string{"LST01", "LST02", "LST03"} {
		_, err := svc.CreateEmployeeGroup(ctx, service.CreateGroupInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "List " + code,
			IsActive: true,
		})
		require.NoError(t, err)
	}

	groups, err := svc.ListEmployeeGroups(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, groups, 3)
}

// --- Workflow Group Tests ---

func TestGroupService_WorkflowGroupCRUD(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	// Create
	g, err := svc.CreateWorkflowGroup(ctx, service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "WF001",
		Name:     "Standard Workflow",
		IsActive: true,
	})
	require.NoError(t, err)
	assert.Equal(t, "WF001", g.Code)

	// Get
	found, err := svc.GetWorkflowGroup(ctx, g.ID)
	require.NoError(t, err)
	assert.Equal(t, g.ID, found.ID)

	// Update
	newName := "Updated Workflow"
	updated, err := svc.UpdateWorkflowGroup(ctx, g.ID, service.UpdateGroupInput{Name: &newName})
	require.NoError(t, err)
	assert.Equal(t, "Updated Workflow", updated.Name)

	// List
	groups, err := svc.ListWorkflowGroups(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, groups, 1)

	// Delete
	err = svc.DeleteWorkflowGroup(ctx, g.ID)
	require.NoError(t, err)
}

// --- Activity Group Tests ---

func TestGroupService_ActivityGroupCRUD(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newGroupService(db)
	ctx := context.Background()
	tenant := createTestTenantForGroupService(t, db)

	// Create
	g, err := svc.CreateActivityGroup(ctx, service.CreateGroupInput{
		TenantID: tenant.ID,
		Code:     "AG001",
		Name:     "Production",
		IsActive: true,
	})
	require.NoError(t, err)
	assert.Equal(t, "AG001", g.Code)

	// Get
	found, err := svc.GetActivityGroup(ctx, g.ID)
	require.NoError(t, err)
	assert.Equal(t, g.ID, found.ID)

	// Update
	newName := "Updated Activity"
	updated, err := svc.UpdateActivityGroup(ctx, g.ID, service.UpdateGroupInput{Name: &newName})
	require.NoError(t, err)
	assert.Equal(t, "Updated Activity", updated.Name)

	// List
	groups, err := svc.ListActivityGroups(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, groups, 1)

	// Delete
	err = svc.DeleteActivityGroup(ctx, g.ID)
	require.NoError(t, err)
}
