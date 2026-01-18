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
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupTenantHandler(t *testing.T) (*handler.TenantHandler, *service.TenantService) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	h := handler.NewTenantHandler(svc)
	return h, svc
}

func TestTenantHandler_Create_Success(t *testing.T) {
	h, _ := setupTenantHandler(t)

	slug := "test-" + uuid.New().String()[:8]
	body := `{"name": "Test Tenant", "slug": "` + slug + `"}`
	req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Tenant
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Test Tenant", result.Name)
	assert.Equal(t, slug, result.Slug)
	assert.True(t, result.IsActive)
}

func TestTenantHandler_Create_InvalidBody(t *testing.T) {
	h, _ := setupTenantHandler(t)

	req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString("invalid"))
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Create_SlugExists(t *testing.T) {
	h, svc := setupTenantHandler(t)
	ctx := context.Background()

	slug := "existing-" + uuid.New().String()[:8]
	_, err := svc.Create(ctx, "First", slug)
	require.NoError(t, err)

	body := `{"name": "Second", "slug": "` + slug + `"}`
	req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Create_InvalidSlug(t *testing.T) {
	h, _ := setupTenantHandler(t)

	body := `{"name": "Test", "slug": "ab"}`
	req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Get_Success(t *testing.T) {
	h, svc := setupTenantHandler(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, "Test", "test-"+uuid.New().String()[:8])
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/tenants/"+tenant.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tenant.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, tenant.ID, result.ID)
	assert.Equal(t, "Test", result.Name)
}

func TestTenantHandler_Get_InvalidID(t *testing.T) {
	h, _ := setupTenantHandler(t)

	req := httptest.NewRequest("GET", "/tenants/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Get_NotFound(t *testing.T) {
	h, _ := setupTenantHandler(t)

	req := httptest.NewRequest("GET", "/tenants/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTenantHandler_List(t *testing.T) {
	h, svc := setupTenantHandler(t)
	ctx := context.Background()

	_, err := svc.Create(ctx, "Tenant A", "tenant-a-"+uuid.New().String()[:8])
	require.NoError(t, err)
	_, err = svc.Create(ctx, "Tenant B", "tenant-b-"+uuid.New().String()[:8])
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/tenants", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(result), 2)
}

func TestTenantHandler_List_ActiveOnly(t *testing.T) {
	h, svc := setupTenantHandler(t)
	ctx := context.Background()

	activeName := "Active-" + uuid.New().String()[:8]
	active, err := svc.Create(ctx, activeName, "active-"+uuid.New().String()[:8])
	require.NoError(t, err)

	inactive, err := svc.Create(ctx, "Inactive", "inactive-"+uuid.New().String()[:8])
	require.NoError(t, err)
	inactive.IsActive = false
	require.NoError(t, svc.Update(ctx, inactive))

	req := httptest.NewRequest("GET", "/tenants?active=true", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	// Find our active tenant in the results
	var found bool
	for _, tenant := range result {
		if tenant.ID == active.ID {
			found = true
			assert.Equal(t, activeName, tenant.Name)
			break
		}
	}
	assert.True(t, found, "Active tenant should be in results")
}

func TestTenantHandler_Update_Success(t *testing.T) {
	h, svc := setupTenantHandler(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, "Original", "test-"+uuid.New().String()[:8])
	require.NoError(t, err)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/tenants/"+tenant.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tenant.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
}

func TestTenantHandler_Update_InvalidID(t *testing.T) {
	h, _ := setupTenantHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/tenants/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Update_NotFound(t *testing.T) {
	h, _ := setupTenantHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/tenants/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTenantHandler_Delete(t *testing.T) {
	h, svc := setupTenantHandler(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, "ToDelete", "to-delete-"+uuid.New().String()[:8])
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/tenants/"+tenant.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tenant.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, tenant.ID)
	assert.ErrorIs(t, err, service.ErrTenantNotFound)
}

func TestTenantHandler_Delete_InvalidID(t *testing.T) {
	h, _ := setupTenantHandler(t)

	req := httptest.NewRequest("DELETE", "/tenants/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}
