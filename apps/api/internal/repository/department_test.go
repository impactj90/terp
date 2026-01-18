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

// createTestTenantForDepartment creates a tenant for use in department tests
func createTestTenantForDepartment(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestDepartmentRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)
	dept := &model.Department{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
		IsActive: true,
	}

	err := repo.Create(ctx, dept)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, dept.ID)
}

func TestDepartmentRepository_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)
	dept := &model.Department{
		TenantID:    tenant.ID,
		Code:        "DEPT001",
		Name:        "Engineering",
		Description: "Software engineering department",
		IsActive:    true,
	}

	err := repo.Create(ctx, dept)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, dept.ID)
	require.NoError(t, err)
	assert.Equal(t, "Software engineering department", found.Description)
}

func TestDepartmentRepository_Create_WithParent(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create parent department
	parent := &model.Department{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
		IsActive: true,
	}
	require.NoError(t, repo.Create(ctx, parent))

	// Create child department
	child := &model.Department{
		TenantID: tenant.ID,
		ParentID: &parent.ID,
		Code:     "DEPT002",
		Name:     "Backend",
		IsActive: true,
	}
	err := repo.Create(ctx, child)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, child.ID)
	require.NoError(t, err)
	assert.Equal(t, parent.ID, *found.ParentID)
}

func TestDepartmentRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)
	dept := &model.Department{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	require.NoError(t, repo.Create(ctx, dept))

	found, err := repo.GetByID(ctx, dept.ID)
	require.NoError(t, err)
	assert.Equal(t, dept.ID, found.ID)
	assert.Equal(t, dept.Code, found.Code)
	assert.Equal(t, dept.Name, found.Name)
}

func TestDepartmentRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDepartmentNotFound)
}

func TestDepartmentRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)
	dept := &model.Department{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	require.NoError(t, repo.Create(ctx, dept))

	found, err := repo.GetByCode(ctx, tenant.ID, "DEPT001")
	require.NoError(t, err)
	assert.Equal(t, dept.ID, found.ID)
	assert.Equal(t, "DEPT001", found.Code)
}

func TestDepartmentRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	_, err := repo.GetByCode(ctx, uuid.New(), "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrDepartmentNotFound)
}

func TestDepartmentRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)
	dept := &model.Department{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Original Name",
	}
	require.NoError(t, repo.Create(ctx, dept))

	dept.Name = "Updated Name"
	err := repo.Update(ctx, dept)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, dept.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestDepartmentRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)
	dept := &model.Department{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "To Delete",
	}
	require.NoError(t, repo.Create(ctx, dept))

	err := repo.Delete(ctx, dept.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, dept.ID)
	assert.ErrorIs(t, err, repository.ErrDepartmentNotFound)
}

func TestDepartmentRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDepartmentNotFound)
}

func TestDepartmentRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)
	require.NoError(t, repo.Create(ctx, &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.Department{TenantID: tenant.ID, Code: "DEPT002", Name: "Marketing", IsActive: false}))

	departments, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, departments, 2)
}

func TestDepartmentRepository_List_OrderedByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)
	require.NoError(t, repo.Create(ctx, &model.Department{TenantID: tenant.ID, Code: "DEPT003", Name: "HR"}))
	require.NoError(t, repo.Create(ctx, &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering"}))
	require.NoError(t, repo.Create(ctx, &model.Department{TenantID: tenant.ID, Code: "DEPT002", Name: "Marketing"}))

	departments, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, departments, 3)
	assert.Equal(t, "DEPT001", departments[0].Code)
	assert.Equal(t, "DEPT002", departments[1].Code)
	assert.Equal(t, "DEPT003", departments[2].Code)
}

func TestDepartmentRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	departments, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, departments)
}

func TestDepartmentRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create both as active first
	dept1 := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	dept2 := &model.Department{TenantID: tenant.ID, Code: "DEPT002", Name: "Marketing", IsActive: true}
	require.NoError(t, repo.Create(ctx, dept1))
	require.NoError(t, repo.Create(ctx, dept2))

	// Then deactivate the second one via Update
	dept2.IsActive = false
	require.NoError(t, repo.Update(ctx, dept2))

	departments, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, departments, 1)
	assert.Equal(t, "DEPT001", departments[0].Code)
}

func TestDepartmentRepository_ListActive_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	departments, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, departments)
}

func TestDepartmentRepository_GetChildren(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create parent
	parent := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	require.NoError(t, repo.Create(ctx, parent))

	// Create children
	child1 := &model.Department{TenantID: tenant.ID, ParentID: &parent.ID, Code: "DEPT002", Name: "Backend", IsActive: true}
	child2 := &model.Department{TenantID: tenant.ID, ParentID: &parent.ID, Code: "DEPT003", Name: "Frontend", IsActive: true}
	require.NoError(t, repo.Create(ctx, child1))
	require.NoError(t, repo.Create(ctx, child2))

	children, err := repo.GetChildren(ctx, parent.ID)
	require.NoError(t, err)
	assert.Len(t, children, 2)
}

func TestDepartmentRepository_GetChildren_DirectOnly(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create hierarchy: Engineering -> Backend -> API
	engineering := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	require.NoError(t, repo.Create(ctx, engineering))

	backend := &model.Department{TenantID: tenant.ID, ParentID: &engineering.ID, Code: "DEPT002", Name: "Backend", IsActive: true}
	require.NoError(t, repo.Create(ctx, backend))

	api := &model.Department{TenantID: tenant.ID, ParentID: &backend.ID, Code: "DEPT003", Name: "API", IsActive: true}
	require.NoError(t, repo.Create(ctx, api))

	// GetChildren of Engineering should only return Backend, not API
	children, err := repo.GetChildren(ctx, engineering.ID)
	require.NoError(t, err)
	assert.Len(t, children, 1)
	assert.Equal(t, "Backend", children[0].Name)
}

func TestDepartmentRepository_GetChildren_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create department with no children
	dept := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	require.NoError(t, repo.Create(ctx, dept))

	children, err := repo.GetChildren(ctx, dept.ID)
	require.NoError(t, err)
	assert.Empty(t, children)
}

func TestDepartmentRepository_GetRoots(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create root departments (no parent)
	root1 := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	root2 := &model.Department{TenantID: tenant.ID, Code: "DEPT002", Name: "Marketing", IsActive: true}
	require.NoError(t, repo.Create(ctx, root1))
	require.NoError(t, repo.Create(ctx, root2))

	// Create child department
	child := &model.Department{TenantID: tenant.ID, ParentID: &root1.ID, Code: "DEPT003", Name: "Backend", IsActive: true}
	require.NoError(t, repo.Create(ctx, child))

	roots, err := repo.GetRoots(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, roots, 2)

	// Verify returned departments have no parent
	for _, root := range roots {
		assert.Nil(t, root.ParentID)
	}
}

func TestDepartmentRepository_GetRoots_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	roots, err := repo.GetRoots(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, roots)
}

func TestDepartmentRepository_GetWithChildren(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create parent
	parent := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	require.NoError(t, repo.Create(ctx, parent))

	// Create children
	child1 := &model.Department{TenantID: tenant.ID, ParentID: &parent.ID, Code: "DEPT002", Name: "Backend", IsActive: true}
	child2 := &model.Department{TenantID: tenant.ID, ParentID: &parent.ID, Code: "DEPT003", Name: "Frontend", IsActive: true}
	require.NoError(t, repo.Create(ctx, child1))
	require.NoError(t, repo.Create(ctx, child2))

	found, err := repo.GetWithChildren(ctx, parent.ID)
	require.NoError(t, err)
	assert.Equal(t, parent.ID, found.ID)
	assert.Len(t, found.Children, 2)
}

func TestDepartmentRepository_GetWithChildren_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	_, err := repo.GetWithChildren(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrDepartmentNotFound)
}

func TestDepartmentRepository_GetWithChildren_NoChildren(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create department with no children
	dept := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	require.NoError(t, repo.Create(ctx, dept))

	found, err := repo.GetWithChildren(ctx, dept.ID)
	require.NoError(t, err)
	assert.Equal(t, dept.ID, found.ID)
	assert.Empty(t, found.Children)
}

func TestDepartmentRepository_GetHierarchy(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create hierarchy: Engineering -> Backend, Frontend
	engineering := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	require.NoError(t, repo.Create(ctx, engineering))

	backend := &model.Department{TenantID: tenant.ID, ParentID: &engineering.ID, Code: "DEPT002", Name: "Backend", IsActive: true}
	frontend := &model.Department{TenantID: tenant.ID, ParentID: &engineering.ID, Code: "DEPT003", Name: "Frontend", IsActive: true}
	require.NoError(t, repo.Create(ctx, backend))
	require.NoError(t, repo.Create(ctx, frontend))

	// Create another root
	marketing := &model.Department{TenantID: tenant.ID, Code: "DEPT004", Name: "Marketing", IsActive: true}
	require.NoError(t, repo.Create(ctx, marketing))

	hierarchy, err := repo.GetHierarchy(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, hierarchy, 4)
}

func TestDepartmentRepository_GetHierarchy_OrderedRootsFirst(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	// Create in mixed order
	backend := &model.Department{TenantID: tenant.ID, Code: "DEPT002", Name: "Backend", IsActive: true}
	require.NoError(t, repo.Create(ctx, backend))

	engineering := &model.Department{TenantID: tenant.ID, Code: "DEPT001", Name: "Engineering", IsActive: true}
	require.NoError(t, repo.Create(ctx, engineering))

	// Now update backend to have engineering as parent
	backend.ParentID = &engineering.ID
	require.NoError(t, repo.Update(ctx, backend))

	hierarchy, err := repo.GetHierarchy(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, hierarchy, 2)

	// Root (NULL parent_id) should come first
	assert.Nil(t, hierarchy[0].ParentID)
	assert.Equal(t, "Engineering", hierarchy[0].Name)
}

func TestDepartmentRepository_GetHierarchy_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForDepartment(t, db)

	hierarchy, err := repo.GetHierarchy(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, hierarchy)
}
