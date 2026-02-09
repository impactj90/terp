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

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupUserGroupHandler(t *testing.T) (*handler.UserGroupHandler, *service.UserGroupService, *model.Tenant, *repository.UserGroupRepository) {
	db := testutil.SetupTestDB(t)
	userGroupRepo := repository.NewUserGroupRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewUserGroupService(userGroupRepo, nil)
	h := handler.NewUserGroupHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	return h, svc, tenant, userGroupRepo
}

func withUserGroupTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestUserGroupHandler_Create_Success(t *testing.T) {
	h, _, tenant, _ := setupUserGroupHandler(t)

	body := `{"name": "Administrators", "code": "ADMIN", "description": "Admin group"}`
	req := httptest.NewRequest("POST", "/user-groups", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withUserGroupTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result models.UserGroup
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	require.NotNil(t, result.Name)
	require.NotNil(t, result.TenantID)
	assert.Equal(t, "Administrators", *result.Name)
	assert.Equal(t, tenant.ID.String(), result.TenantID.String())
	require.NotNil(t, result.Description)
	assert.Equal(t, "Admin group", *result.Description)
}

func TestUserGroupHandler_Create_MinimalFields(t *testing.T) {
	h, _, tenant, _ := setupUserGroupHandler(t)

	body := `{"name": "Users", "code": "USERS"}`
	req := httptest.NewRequest("POST", "/user-groups", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withUserGroupTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result models.UserGroup
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	require.NotNil(t, result.Name)
	assert.Equal(t, "Users", *result.Name)
}

func TestUserGroupHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant, _ := setupUserGroupHandler(t)

	req := httptest.NewRequest("POST", "/user-groups", bytes.NewBufferString("invalid"))
	req = withUserGroupTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUserGroupHandler_Create_EmptyName(t *testing.T) {
	h, _, tenant, _ := setupUserGroupHandler(t)

	body := `{"name": "", "code": "TEST"}`
	req := httptest.NewRequest("POST", "/user-groups", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withUserGroupTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUserGroupHandler_Create_NoTenant(t *testing.T) {
	h, _, _, _ := setupUserGroupHandler(t)

	body := `{"name": "Test", "code": "TEST"}`
	req := httptest.NewRequest("POST", "/user-groups", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestUserGroupHandler_Create_DuplicateName(t *testing.T) {
	h, svc, tenant, _ := setupUserGroupHandler(t)
	ctx := context.Background()

	// Create first group
	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Administrators",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"name": "Administrators", "code": "ADMIN2"}`
	req := httptest.NewRequest("POST", "/user-groups", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withUserGroupTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUserGroupHandler_Get_Success(t *testing.T) {
	h, svc, tenant, _ := setupUserGroupHandler(t)
	ctx := context.Background()

	input := service.CreateUserGroupInput{
		TenantID:    tenant.ID,
		Name:        "Test Group",
		Description: "Test description",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/user-groups/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result models.UserGroup
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	require.NotNil(t, result.ID)
	require.NotNil(t, result.Name)
	assert.Equal(t, created.ID.String(), result.ID.String())
	assert.Equal(t, "Test Group", *result.Name)
}

func TestUserGroupHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupUserGroupHandler(t)

	req := httptest.NewRequest("GET", "/user-groups/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUserGroupHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupUserGroupHandler(t)

	req := httptest.NewRequest("GET", "/user-groups/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestUserGroupHandler_List_Success(t *testing.T) {
	h, svc, tenant, _ := setupUserGroupHandler(t)
	ctx := context.Background()

	// Create groups
	input1 := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Admins",
		IsAdmin:  true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	input2 := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Users",
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/user-groups", nil)
	req = withUserGroupTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result models.UserGroupList
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 2)
}

func TestUserGroupHandler_List_Empty(t *testing.T) {
	h, _, tenant, _ := setupUserGroupHandler(t)

	req := httptest.NewRequest("GET", "/user-groups", nil)
	req = withUserGroupTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result models.UserGroupList
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Empty(t, result.Data)
}

func TestUserGroupHandler_List_NoTenant(t *testing.T) {
	h, _, _, _ := setupUserGroupHandler(t)

	req := httptest.NewRequest("GET", "/user-groups", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestUserGroupHandler_Update_Success(t *testing.T) {
	h, svc, tenant, _ := setupUserGroupHandler(t)
	ctx := context.Background()

	input := service.CreateUserGroupInput{
		TenantID:    tenant.ID,
		Name:        "Original",
		Description: "Original description",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "description": "Updated description"}`
	req := httptest.NewRequest("PATCH", "/user-groups/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result models.UserGroup
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	require.NotNil(t, result.Name)
	require.NotNil(t, result.Description)
	assert.Equal(t, "Updated", *result.Name)
	assert.Equal(t, "Updated description", *result.Description)
}

func TestUserGroupHandler_Update_InvalidID(t *testing.T) {
	h, _, _, _ := setupUserGroupHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/user-groups/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUserGroupHandler_Update_NotFound(t *testing.T) {
	h, _, _, _ := setupUserGroupHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/user-groups/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestUserGroupHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupUserGroupHandler(t)
	ctx := context.Background()

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PATCH", "/user-groups/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUserGroupHandler_Update_SystemGroup(t *testing.T) {
	h, _, tenant, repo := setupUserGroupHandler(t)
	ctx := context.Background()

	// Create system group directly via repo
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "System Group",
		IsSystem: true,
	}
	require.NoError(t, repo.Create(ctx, ug))

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/user-groups/"+ug.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", ug.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestUserGroupHandler_Delete_Success(t *testing.T) {
	h, svc, tenant, _ := setupUserGroupHandler(t)
	ctx := context.Background()

	input := service.CreateUserGroupInput{
		TenantID: tenant.ID,
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/user-groups/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrUserGroupNotFound)
}

func TestUserGroupHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _ := setupUserGroupHandler(t)

	req := httptest.NewRequest("DELETE", "/user-groups/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestUserGroupHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _ := setupUserGroupHandler(t)

	req := httptest.NewRequest("DELETE", "/user-groups/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestUserGroupHandler_Delete_SystemGroup(t *testing.T) {
	h, _, tenant, repo := setupUserGroupHandler(t)
	ctx := context.Background()

	// Create system group directly via repo
	ug := &model.UserGroup{
		TenantID: &tenant.ID,
		Name:     "System Group",
		IsSystem: true,
	}
	require.NoError(t, repo.Create(ctx, ug))

	req := httptest.NewRequest("DELETE", "/user-groups/"+ug.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", ug.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}
