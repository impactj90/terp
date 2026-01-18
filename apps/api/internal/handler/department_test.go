package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupDepartmentHandler(t *testing.T) (*handler.DepartmentHandler, *service.DepartmentService, *model.Tenant) {
	db := testutil.SetupTestDB(t)
	departmentRepo := repository.NewDepartmentRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewDepartmentService(departmentRepo)
	h := handler.NewDepartmentHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	return h, svc, tenant
}

func withDepartmentTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestDepartmentHandler_Create_Success(t *testing.T) {
	h, _, tenant := setupDepartmentHandler(t)

	body := `{"code": "DEPT001", "name": "Engineering", "description": "Engineering department"}`
	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Department
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "DEPT001", result.Code)
	assert.Equal(t, "Engineering", result.Name)
	assert.Equal(t, "Engineering department", result.Description)
	assert.Equal(t, tenant.ID, result.TenantID)
	assert.True(t, result.IsActive)
}

func TestDepartmentHandler_Create_WithParent(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	// Create parent department
	parentInput := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "PARENT",
		Name:     "Parent Department",
	}
	parent, err := svc.Create(ctx, parentInput)
	require.NoError(t, err)

	body := `{"code": "CHILD", "name": "Child Department", "parent_id": "` + parent.ID.String() + `"}`
	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Department
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.NotNil(t, result.ParentID)
	assert.Equal(t, parent.ID, *result.ParentID)
}

func TestDepartmentHandler_Create_DefaultActive(t *testing.T) {
	h, _, tenant := setupDepartmentHandler(t)

	body := `{"code": "DEPT001", "name": "Engineering"}`
	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Department
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.True(t, result.IsActive)
}

func TestDepartmentHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant := setupDepartmentHandler(t)

	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString("invalid"))
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Create_EmptyCode(t *testing.T) {
	h, _, tenant := setupDepartmentHandler(t)

	body := `{"code": "", "name": "Engineering"}`
	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Create_EmptyName(t *testing.T) {
	h, _, tenant := setupDepartmentHandler(t)

	body := `{"code": "DEPT001", "name": ""}`
	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Create_NoTenant(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	body := `{"code": "DEPT001", "name": "Engineering"}`
	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestDepartmentHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	// Create first department
	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "First",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "DEPT001", "name": "Second"}`
	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Create_ParentNotFound(t *testing.T) {
	h, _, tenant := setupDepartmentHandler(t)

	body := `{"code": "DEPT001", "name": "Department", "parent_id": "` + uuid.New().String() + `"}`
	req := httptest.NewRequest("POST", "/departments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Get_Success(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/departments/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Department
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "DEPT001", result.Code)
	assert.Equal(t, "Engineering", result.Name)
}

func TestDepartmentHandler_Get_InvalidID(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	req := httptest.NewRequest("GET", "/departments/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Get_NotFound(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	req := httptest.NewRequest("GET", "/departments/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDepartmentHandler_List_All(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	// Create departments
	for _, code := range []string{"DEPT001", "DEPT002"} {
		input := service.CreateDepartmentInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Department " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/departments", nil)
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.DepartmentList
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 2)
}

func TestDepartmentHandler_List_Active(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

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

	// Use active query param per OpenAPI spec
	req := httptest.NewRequest("GET", "/departments?active=true", nil)
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.DepartmentList
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 1)
	assert.Equal(t, active.Code, result.Data[0].Code)
}

func TestDepartmentHandler_List_NoTenant(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	req := httptest.NewRequest("GET", "/departments", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestDepartmentHandler_Update_Success(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_active": false}`
	req := httptest.NewRequest("PATCH", "/departments/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Department
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.False(t, result.IsActive)
}

func TestDepartmentHandler_Update_Code(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"code": "DEPT999"}`
	req := httptest.NewRequest("PATCH", "/departments/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Department
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "DEPT999", result.Code)
}

func TestDepartmentHandler_Update_InvalidID(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/departments/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Update_NotFound(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/departments/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDepartmentHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Engineering",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PATCH", "/departments/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Update_DuplicateCode(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	// Create first department
	input1 := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "First",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create second department
	input2 := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT002",
		Name:     "Second",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to update second with first's code
	body := `{"code": "DEPT001"}`
	req := httptest.NewRequest("PATCH", "/departments/"+created2.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created2.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Update_CircularReference(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	// Create department
	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "Department",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to set parent to self
	body := `{"parent_id": "` + created.ID.String() + `"}`
	req := httptest.NewRequest("PATCH", "/departments/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Delete_Success(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	input := service.CreateDepartmentInput{
		TenantID: tenant.ID,
		Code:     "DEPT001",
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/departments/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrDepartmentNotFound)
}

func TestDepartmentHandler_Delete_InvalidID(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	req := httptest.NewRequest("DELETE", "/departments/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_Delete_NotFound(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	req := httptest.NewRequest("DELETE", "/departments/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDepartmentHandler_Delete_WithChildren(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

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

	// Try to delete parent
	req := httptest.NewRequest("DELETE", "/departments/"+parent.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", parent.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDepartmentHandler_GetTree_Success(t *testing.T) {
	h, svc, tenant := setupDepartmentHandler(t)
	ctx := context.Background()

	// Create hierarchy
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

	req := httptest.NewRequest("GET", "/departments/tree", nil)
	req = withDepartmentTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.GetTree(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []service.DepartmentNode
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, "ENG", result[0].Department.Code)
	assert.Len(t, result[0].Children, 1)
	assert.Equal(t, "BACKEND", result[0].Children[0].Department.Code)
}

func TestDepartmentHandler_GetTree_NoTenant(t *testing.T) {
	h, _, _ := setupDepartmentHandler(t)

	req := httptest.NewRequest("GET", "/departments/tree", nil)
	rr := httptest.NewRecorder()

	h.GetTree(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
