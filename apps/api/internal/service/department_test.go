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

func createTestTenantForDepartmentService(t *testing.T, db *repository.DB) *model.Tenant {
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

func TestDepartmentService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID:    tenant.ID,
		Code:        "DEPT001",
		Name:        "Engineering",
		Description: "Engineering department",
	}

	dept, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "DEPT001", dept.Code)
	assert.Equal(t, "Engineering", dept.Name)
	assert.Equal(t, "Engineering department", dept.Description)
	assert.Equal(t, tenant.ID, dept.TenantID)
	assert.True(t, dept.IsActive)
	assert.Nil(t, dept.ParentID)
}

func TestDepartmentService_Create_WithParent(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	// Create parent department
	parentInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "PARENT",
		Name:     "Parent Department",
	}
	parent, err := svc.Create(ctx, parentInput)
	require.NoError(t, err)

	// Create child department
	childInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "CHILD",
		Name:     "Child Department",
		ParentID: &parent.ID,
	}
	child, err := svc.Create(ctx, childInput)
	require.NoError(t, err)
	assert.NotNil(t, child.ParentID)
	assert.Equal(t, parent.ID, *child.ParentID)
}

func TestDepartmentService_Create_ParentNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	nonExistentID := uuid.New()
	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Department",
		ParentID: &nonExistentID,
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrParentNotFound)
}

func TestDepartmentService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "",
		Name:     "Engineering",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrDepartmentCodeRequired)
}

func TestDepartmentService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrDepartmentNameRequired)
}

func TestDepartmentService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Sales",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrDepartmentCodeExists)
}

func TestDepartmentService_Create_TrimsWhitespace(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID:    tenant.ID,
		Code:        "  DEPT001  ",
		Name:        "  Engineering  ",
		Description: "  Description  ",
	}

	dept, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "DEPT001", dept.Code)
	assert.Equal(t, "Engineering", dept.Name)
	assert.Equal(t, "Description", dept.Description)
}

func TestDepartmentService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "DEPT001", found.Code)
}

func TestDepartmentService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrDepartmentNotFound)
}

func TestDepartmentService_GetByCode_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByCode(ctx, tenant.ID, "DEPT001")
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestDepartmentService_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	_, err := svc.GetByCode(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, service.ErrDepartmentNotFound)
}

func TestDepartmentService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Original Name",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newDesc := "New description"
	isActive := false
	updateInput := service.UpdateDepartmentInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "New description", updated.Description)
	assert.False(t, updated.IsActive)
}

func TestDepartmentService_Update_Code(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newCode := "DEPT999"
	updateInput := service.UpdateDepartmentInput{
		Code: &newCode,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "DEPT999", updated.Code)
}

func TestDepartmentService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateDepartmentInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrDepartmentNotFound)
}

func TestDepartmentService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateDepartmentInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrDepartmentNameRequired)
}

func TestDepartmentService_Update_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyCode := "   "
	updateInput := service.UpdateDepartmentInput{
		Code: &emptyCode,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrDepartmentCodeRequired)
}

func TestDepartmentService_Update_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	// Create first department
	input1 := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create second department
	input2 := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT002",
		Name:     "Sales",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to update second department with first department's code
	conflictingCode := "DEPT001"
	updateInput := service.UpdateDepartmentInput{
		Code: &conflictingCode,
	}

	_, err = svc.Update(ctx, created2.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrDepartmentCodeExists)
}

func TestDepartmentService_Update_SameCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Update with the same code should work
	sameCode := "DEPT001"
	updateInput := service.UpdateDepartmentInput{
		Code: &sameCode,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "DEPT001", updated.Code)
}

func TestDepartmentService_Update_CircularReference_Self(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Department",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to set parent to self
	updateInput := service.UpdateDepartmentInput{
		ParentID: &created.ID,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCircularReference)
}

func TestDepartmentService_Update_CircularReference_Chain(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	// Create chain: A -> B -> C
	inputA := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "A",
		Name:     "Department A",
	}
	deptA, err := svc.Create(ctx, inputA)
	require.NoError(t, err)

	inputB := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "B",
		Name:     "Department B",
		ParentID: &deptA.ID,
	}
	deptB, err := svc.Create(ctx, inputB)
	require.NoError(t, err)

	inputC := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "C",
		Name:     "Department C",
		ParentID: &deptB.ID,
	}
	deptC, err := svc.Create(ctx, inputC)
	require.NoError(t, err)

	// Try to set A's parent to C (would create cycle: A -> B -> C -> A)
	updateInput := service.UpdateDepartmentInput{
		ParentID: &deptC.ID,
	}

	_, err = svc.Update(ctx, deptA.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrCircularReference)
}

func TestDepartmentService_Update_ParentNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Department",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	nonExistentID := uuid.New()
	updateInput := service.UpdateDepartmentInput{
		ParentID: &nonExistentID,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrParentNotFound)
}

func TestDepartmentService_Update_ClearParent(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	// Create parent department
	parentInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "PARENT",
		Name:     "Parent",
	}
	parent, err := svc.Create(ctx, parentInput)
	require.NoError(t, err)

	// Create child department
	childInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "CHILD",
		Name:     "Child",
		ParentID: &parent.ID,
	}
	child, err := svc.Create(ctx, childInput)
	require.NoError(t, err)
	require.NotNil(t, child.ParentID)

	// Clear parent
	updateInput := service.UpdateDepartmentInput{
		ClearParentID: true,
	}

	updated, err := svc.Update(ctx, child.ID, updateInput)
	require.NoError(t, err)
	assert.Nil(t, updated.ParentID)
}

func TestDepartmentService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrDepartmentNotFound)
}

func TestDepartmentService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrDepartmentNotFound)
}

func TestDepartmentService_Delete_WithChildren(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	// Create parent
	parentInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "PARENT",
		Name:     "Parent",
	}
	parent, err := svc.Create(ctx, parentInput)
	require.NoError(t, err)

	// Create child
	childInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "CHILD",
		Name:     "Child",
		ParentID: &parent.ID,
	}
	_, err = svc.Create(ctx, childInput)
	require.NoError(t, err)

	// Try to delete parent (should fail)
	err = svc.Delete(ctx, parent.ID)
	assert.ErrorIs(t, err, service.ErrCannotDeleteWithChildren)
}

func TestDepartmentService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	codes := []string{"DEPT001", "DEPT002", "DEPT003"}
	for _, code := range codes {
		input := service.CreateDepartmentInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Department " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	departments, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, departments, 3)
}

func TestDepartmentService_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	departments, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, departments)
}

func TestDepartmentService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	// Create active department
	input1 := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Active",
	}
	active, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate a department
	input2 := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT002",
		Name:     "Inactive",
	}
	inactive, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	isActive := false
	_, err = svc.Update(ctx, inactive.ID, service.UpdateDepartmentInput{IsActive: &isActive})
	require.NoError(t, err)

	departments, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, departments, 1)
	assert.Equal(t, active.Code, departments[0].Code)
}

func TestDepartmentService_GetHierarchy(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	// Create hierarchy:
	// Engineering (root)
	//   Backend
	//   Frontend
	// HR (root)

	engInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "ENG",
		Name:     "Engineering",
	}
	eng, err := svc.Create(ctx, engInput)
	require.NoError(t, err)

	backendInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "BACKEND",
		Name:     "Backend",
		ParentID: &eng.ID,
	}
	_, err = svc.Create(ctx, backendInput)
	require.NoError(t, err)

	frontendInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "FRONTEND",
		Name:     "Frontend",
		ParentID: &eng.ID,
	}
	_, err = svc.Create(ctx, frontendInput)
	require.NoError(t, err)

	hrInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "HR",
		Name:     "HR",
	}
	_, err = svc.Create(ctx, hrInput)
	require.NoError(t, err)

	hierarchy, err := svc.GetHierarchy(ctx, tenant.ID)
	require.NoError(t, err)

	// Should have 2 root departments
	assert.Len(t, hierarchy, 2)

	// Find Engineering root and verify children
	var engNode *service.DepartmentNode
	for i := range hierarchy {
		if hierarchy[i].Department.Code == "ENG" {
			engNode = &hierarchy[i]
			break
		}
	}
	require.NotNil(t, engNode)
	assert.Len(t, engNode.Children, 2)
}

func TestDepartmentService_GetHierarchy_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	svc := service.NewDepartmentService(repo)
	ctx := context.Background()

	tenant := createTestTenantForDepartmentService(t, db)

	hierarchy, err := svc.GetHierarchy(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, hierarchy)
}
