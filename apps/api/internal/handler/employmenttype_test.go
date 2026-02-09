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
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupEmploymentTypeHandler(t *testing.T) (*handler.EmploymentTypeHandler, *service.EmploymentTypeService, *model.Tenant) {
	db := testutil.SetupTestDB(t)
	employmentTypeRepo := repository.NewEmploymentTypeRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewEmploymentTypeService(employmentTypeRepo)
	h := handler.NewEmploymentTypeHandler(svc)

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

func withEmploymentTypeTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestEmploymentTypeHandler_Create_Success(t *testing.T) {
	h, _, tenant := setupEmploymentTypeHandler(t)

	// Note: default_weekly_hours is float64 per OpenAPI spec, is_active is not in create request
	body := `{"code": "FT", "name": "Full Time", "default_weekly_hours": 40.00}`
	req := httptest.NewRequest("POST", "/employment-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.EmploymentType
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "FT", result.Code)
	assert.Equal(t, "Full Time", result.Name)
	assert.True(t, decimal.NewFromFloat(40.0).Equal(result.DefaultWeeklyHours))
	assert.NotNil(t, result.TenantID)
	assert.True(t, result.IsActive)
}

// Note: Create_Inactive test removed - OpenAPI spec doesn't include is_active in create request.
// New items always default to active. To create inactive, create then update.

func TestEmploymentTypeHandler_Create_DefaultActive(t *testing.T) {
	h, _, tenant := setupEmploymentTypeHandler(t)

	body := `{"code": "FT", "name": "Full Time"}`
	req := httptest.NewRequest("POST", "/employment-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.EmploymentType
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.True(t, result.IsActive)
}

func TestEmploymentTypeHandler_Create_DefaultWeeklyHours(t *testing.T) {
	h, _, tenant := setupEmploymentTypeHandler(t)

	body := `{"code": "FT", "name": "Full Time"}`
	req := httptest.NewRequest("POST", "/employment-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.EmploymentType
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.True(t, decimal.NewFromFloat(40.0).Equal(result.DefaultWeeklyHours))
}

func TestEmploymentTypeHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant := setupEmploymentTypeHandler(t)

	req := httptest.NewRequest("POST", "/employment-types", bytes.NewBufferString("invalid"))
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Create_EmptyCode(t *testing.T) {
	h, _, tenant := setupEmploymentTypeHandler(t)

	body := `{"code": "", "name": "Full Time"}`
	req := httptest.NewRequest("POST", "/employment-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Create_EmptyName(t *testing.T) {
	h, _, tenant := setupEmploymentTypeHandler(t)

	body := `{"code": "FT", "name": ""}`
	req := httptest.NewRequest("POST", "/employment-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Create_NoTenant(t *testing.T) {
	h, _, _ := setupEmploymentTypeHandler(t)

	body := `{"code": "FT", "name": "Full Time"}`
	req := httptest.NewRequest("POST", "/employment-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestEmploymentTypeHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	// Create first employment type
	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "First",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "FT", "name": "Second"}`
	req := httptest.NewRequest("POST", "/employment-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Get_Success(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employment-types/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.EmploymentType
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "FT", result.Code)
	assert.Equal(t, "Full Time", result.Name)
}

func TestEmploymentTypeHandler_Get_InvalidID(t *testing.T) {
	h, _, _ := setupEmploymentTypeHandler(t)

	req := httptest.NewRequest("GET", "/employment-types/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Get_NotFound(t *testing.T) {
	h, _, _ := setupEmploymentTypeHandler(t)

	req := httptest.NewRequest("GET", "/employment-types/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestEmploymentTypeHandler_List_All(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	// Create employment types
	for _, code := range []string{"FT", "PT"} {
		input := service.CreateEmploymentTypeInput{
			TenantID:           tenant.ID,
			Code:               code,
			Name:               "Employment Type " + code,
			DefaultWeeklyHours: decimal.NewFromFloat(40.0),
			IsActive:           true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/employment-types", nil)
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.EmploymentType
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result, 2)
}

func TestEmploymentTypeHandler_List_ActiveOnly(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	// Create active employment type
	input1 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Active",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create inactive employment type
	input2 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "PT",
		Name:               "Inactive",
		DefaultWeeklyHours: decimal.NewFromFloat(20.0),
		IsActive:           false,
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employment-types?active_only=true", nil)
	req = withEmploymentTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.EmploymentType
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, "FT", result[0].Code)
}

func TestEmploymentTypeHandler_List_NoTenant(t *testing.T) {
	h, _, _ := setupEmploymentTypeHandler(t)

	req := httptest.NewRequest("GET", "/employment-types", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestEmploymentTypeHandler_Update_Success(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Original",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Note: default_weekly_hours is float64 per OpenAPI spec
	body := `{"name": "Updated", "default_weekly_hours": 35.00, "is_active": false}`
	req := httptest.NewRequest("PATCH", "/employment-types/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.EmploymentType
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.True(t, decimal.NewFromFloat(35.0).Equal(result.DefaultWeeklyHours))
	assert.False(t, result.IsActive)
}

func TestEmploymentTypeHandler_Update_Code(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"code": "FULLTIME"}`
	req := httptest.NewRequest("PATCH", "/employment-types/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.EmploymentType
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "FULLTIME", result.Code)
}

func TestEmploymentTypeHandler_Update_InvalidID(t *testing.T) {
	h, _, _ := setupEmploymentTypeHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/employment-types/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Update_NotFound(t *testing.T) {
	h, _, _ := setupEmploymentTypeHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/employment-types/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestEmploymentTypeHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "Full Time",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PATCH", "/employment-types/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Update_DuplicateCode(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	// Create first employment type
	input1 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "First",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create second employment type
	input2 := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "PT",
		Name:               "Second",
		DefaultWeeklyHours: decimal.NewFromFloat(20.0),
		IsActive:           true,
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to update second with first's code
	body := `{"code": "FT"}`
	req := httptest.NewRequest("PATCH", "/employment-types/"+created2.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created2.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Delete_Success(t *testing.T) {
	h, svc, tenant := setupEmploymentTypeHandler(t)
	ctx := context.Background()

	input := service.CreateEmploymentTypeInput{
		TenantID:           tenant.ID,
		Code:               "FT",
		Name:               "To Delete",
		DefaultWeeklyHours: decimal.NewFromFloat(40.0),
		IsActive:           true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/employment-types/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrEmploymentTypeNotFound)
}

func TestEmploymentTypeHandler_Delete_InvalidID(t *testing.T) {
	h, _, _ := setupEmploymentTypeHandler(t)

	req := httptest.NewRequest("DELETE", "/employment-types/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmploymentTypeHandler_Delete_NotFound(t *testing.T) {
	h, _, _ := setupEmploymentTypeHandler(t)

	req := httptest.NewRequest("DELETE", "/employment-types/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
