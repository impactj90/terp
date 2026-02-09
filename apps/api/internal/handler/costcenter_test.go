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

func setupCostCenterHandler(t *testing.T) (*handler.CostCenterHandler, *service.CostCenterService, *model.Tenant) {
	db := testutil.SetupTestDB(t)
	costCenterRepo := repository.NewCostCenterRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewCostCenterService(costCenterRepo)
	h := handler.NewCostCenterHandler(svc)

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

func withCostCenterTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestCostCenterHandler_Create_Success(t *testing.T) {
	h, _, tenant := setupCostCenterHandler(t)

	body := `{"code": "CC001", "name": "Marketing", "description": "Marketing department", "is_active": true}`
	req := httptest.NewRequest("POST", "/cost-centers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCostCenterTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.CostCenter
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "CC001", result.Code)
	assert.Equal(t, "Marketing", result.Name)
	assert.Equal(t, "Marketing department", result.Description)
	assert.Equal(t, tenant.ID, result.TenantID)
	assert.True(t, result.IsActive)
}

// Note: Create_Inactive test removed - OpenAPI spec doesn't include is_active in create request.
// New items always default to active. To create inactive, create then update.

func TestCostCenterHandler_Create_DefaultActive(t *testing.T) {
	h, _, tenant := setupCostCenterHandler(t)

	body := `{"code": "CC001", "name": "Marketing"}`
	req := httptest.NewRequest("POST", "/cost-centers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCostCenterTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.CostCenter
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.True(t, result.IsActive)
}

func TestCostCenterHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant := setupCostCenterHandler(t)

	req := httptest.NewRequest("POST", "/cost-centers", bytes.NewBufferString("invalid"))
	req = withCostCenterTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Create_EmptyCode(t *testing.T) {
	h, _, tenant := setupCostCenterHandler(t)

	body := `{"code": "", "name": "Marketing"}`
	req := httptest.NewRequest("POST", "/cost-centers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCostCenterTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Create_EmptyName(t *testing.T) {
	h, _, tenant := setupCostCenterHandler(t)

	body := `{"code": "CC001", "name": ""}`
	req := httptest.NewRequest("POST", "/cost-centers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCostCenterTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Create_NoTenant(t *testing.T) {
	h, _, _ := setupCostCenterHandler(t)

	body := `{"code": "CC001", "name": "Marketing"}`
	req := httptest.NewRequest("POST", "/cost-centers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestCostCenterHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	// Create first cost center
	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "First",
		IsActive: true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "CC001", "name": "Second"}`
	req := httptest.NewRequest("POST", "/cost-centers", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCostCenterTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Get_Success(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/cost-centers/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.CostCenter
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "CC001", result.Code)
	assert.Equal(t, "Marketing", result.Name)
}

func TestCostCenterHandler_Get_InvalidID(t *testing.T) {
	h, _, _ := setupCostCenterHandler(t)

	req := httptest.NewRequest("GET", "/cost-centers/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Get_NotFound(t *testing.T) {
	h, _, _ := setupCostCenterHandler(t)

	req := httptest.NewRequest("GET", "/cost-centers/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCostCenterHandler_List_All(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	// Create cost centers
	for _, code := range []string{"CC001", "CC002"} {
		input := service.CreateCostCenterInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Cost Center " + code,
			IsActive: true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/cost-centers", nil)
	req = withCostCenterTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result struct {
		Data []model.CostCenter `json:"data"`
	}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 2)
}

func TestCostCenterHandler_List_ActiveOnly(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	// Create active cost center
	input1 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Active",
		IsActive: true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create inactive cost center
	input2 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC002",
		Name:     "Inactive",
		IsActive: false,
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/cost-centers?active_only=true", nil)
	req = withCostCenterTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result struct {
		Data []model.CostCenter `json:"data"`
	}
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 1)
	assert.Equal(t, "CC001", result.Data[0].Code)
}

func TestCostCenterHandler_List_NoTenant(t *testing.T) {
	h, _, _ := setupCostCenterHandler(t)

	req := httptest.NewRequest("GET", "/cost-centers", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestCostCenterHandler_Update_Success(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Original",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_active": false}`
	req := httptest.NewRequest("PATCH", "/cost-centers/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.CostCenter
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.False(t, result.IsActive)
}

func TestCostCenterHandler_Update_Code(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"code": "CC999"}`
	req := httptest.NewRequest("PATCH", "/cost-centers/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.CostCenter
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "CC999", result.Code)
}

func TestCostCenterHandler_Update_InvalidID(t *testing.T) {
	h, _, _ := setupCostCenterHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/cost-centers/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Update_NotFound(t *testing.T) {
	h, _, _ := setupCostCenterHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/cost-centers/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCostCenterHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "Marketing",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PATCH", "/cost-centers/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Update_DuplicateCode(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	// Create first cost center
	input1 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "First",
		IsActive: true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create second cost center
	input2 := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC002",
		Name:     "Second",
		IsActive: true,
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to update second with first's code
	body := `{"code": "CC001"}`
	req := httptest.NewRequest("PATCH", "/cost-centers/"+created2.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created2.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Delete_Success(t *testing.T) {
	h, svc, tenant := setupCostCenterHandler(t)
	ctx := context.Background()

	input := service.CreateCostCenterInput{
		TenantID: tenant.ID,
		Code:     "CC001",
		Name:     "To Delete",
		IsActive: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/cost-centers/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrCostCenterNotFound)
}

func TestCostCenterHandler_Delete_InvalidID(t *testing.T) {
	h, _, _ := setupCostCenterHandler(t)

	req := httptest.NewRequest("DELETE", "/cost-centers/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCostCenterHandler_Delete_NotFound(t *testing.T) {
	h, _, _ := setupCostCenterHandler(t)

	req := httptest.NewRequest("DELETE", "/cost-centers/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
