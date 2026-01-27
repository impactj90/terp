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

func setupTariffHandler(t *testing.T) (*handler.TariffHandler, *service.TariffService, *model.Tenant, *model.WeekPlan) {
	db := testutil.SetupTestDB(t)
	tariffRepo := repository.NewTariffRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	h := handler.NewTariffHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	// Create test week plan
	weekPlan := &model.WeekPlan{
		TenantID: tenant.ID,
		Code:     "WP-HANDLER-" + uuid.New().String()[:8],
		Name:     "Week Plan for Handler Tests",
		IsActive: true,
	}
	err = weekPlanRepo.Create(context.Background(), weekPlan)
	require.NoError(t, err)

	return h, svc, tenant, weekPlan
}

func withTariffTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestTariffHandler_Create_Success(t *testing.T) {
	h, _, tenant, _ := setupTariffHandler(t)

	body := `{"code": "TARIFF-001", "name": "Standard Tariff"}`
	req := httptest.NewRequest("POST", "/tariffs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Tariff
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "TARIFF-001", result.Code)
	assert.Equal(t, "Standard Tariff", result.Name)
}

func TestTariffHandler_Create_WithWeekPlan(t *testing.T) {
	h, _, tenant, weekPlan := setupTariffHandler(t)

	body := `{"code": "TARIFF-002", "name": "Tariff with Week Plan", "week_plan_id": "` + weekPlan.ID.String() + `"}`
	req := httptest.NewRequest("POST", "/tariffs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Tariff
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "TARIFF-002", result.Code)
	require.NotNil(t, result.WeekPlanID)
	assert.Equal(t, weekPlan.ID, *result.WeekPlanID)
}

func TestTariffHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant, _ := setupTariffHandler(t)

	req := httptest.NewRequest("POST", "/tariffs", bytes.NewBufferString("invalid"))
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Create_MissingCode(t *testing.T) {
	h, _, tenant, _ := setupTariffHandler(t)

	body := `{"name": "Test Tariff"}`
	req := httptest.NewRequest("POST", "/tariffs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Create_NoTenant(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	body := `{"code": "TEST", "name": "Test"}`
	req := httptest.NewRequest("POST", "/tariffs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestTariffHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	// Create first tariff
	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "DUPLICATE",
		Name:     "First",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "DUPLICATE", "name": "Second"}`
	req := httptest.NewRequest("POST", "/tariffs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestTariffHandler_Create_InvalidWeekPlan(t *testing.T) {
	h, _, tenant, _ := setupTariffHandler(t)

	body := `{"code": "INVALID-WP", "name": "Invalid", "week_plan_id": "` + uuid.New().String() + `"}`
	req := httptest.NewRequest("POST", "/tariffs", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Get_Success(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "GET-TEST",
		Name:     "Get Test",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/tariffs/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Tariff
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "Get Test", result.Name)
}

func TestTariffHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	req := httptest.NewRequest("GET", "/tariffs/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	req := httptest.NewRequest("GET", "/tariffs/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTariffHandler_List_Success(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	// Create test tariffs
	for _, code := range []string{"TARIFF-A", "TARIFF-B"} {
		input := service.CreateTariffInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Tariff " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/tariffs", nil)
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.Tariff
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result["data"], 2)
}

func TestTariffHandler_List_ActiveOnly(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	// Create active tariff
	_, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active"})
	require.NoError(t, err)

	// Create and deactivate another tariff
	created2, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive"})
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, created2.ID, tenant.ID, service.UpdateTariffInput{IsActive: &isActive})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/tariffs?active=true", nil)
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.Tariff
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result["data"], 1)
	assert.Equal(t, "ACTIVE", result["data"][0].Code)
}

func TestTariffHandler_List_NoTenant(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	req := httptest.NewRequest("GET", "/tariffs", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestTariffHandler_Update_Success(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "UPDATE",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_active": false}`
	req := httptest.NewRequest("PUT", "/tariffs/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Tariff
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.False(t, result.IsActive)
}

func TestTariffHandler_Update_AddWeekPlan(t *testing.T) {
	h, svc, tenant, weekPlan := setupTariffHandler(t)
	ctx := context.Background()

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "UPDATE-WP",
		Name:     "Update Week Plan",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"week_plan_id": "` + weekPlan.ID.String() + `"}`
	req := httptest.NewRequest("PUT", "/tariffs/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Tariff
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	require.NotNil(t, result.WeekPlanID)
	assert.Equal(t, weekPlan.ID, *result.WeekPlanID)
}

func TestTariffHandler_Update_InvalidID(t *testing.T) {
	h, _, tenant, _ := setupTariffHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PUT", "/tariffs/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Update_NotFound(t *testing.T) {
	h, _, tenant, _ := setupTariffHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PUT", "/tariffs/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTariffHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "UPDATE",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PUT", "/tariffs/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withTariffTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Delete_Success(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	input := service.CreateTariffInput{
		TenantID: tenant.ID,
		Code:     "DELETE",
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/tariffs/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrTariffNotFound)
}

func TestTariffHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	req := httptest.NewRequest("DELETE", "/tariffs/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	req := httptest.NewRequest("DELETE", "/tariffs/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTariffHandler_CreateBreak_Success(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test"})
	require.NoError(t, err)

	body := `{"break_type": "minimum", "duration": 30, "after_work_minutes": 360}`
	req := httptest.NewRequest("POST", "/tariffs/"+tariff.ID.String()+"/breaks", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tariff.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.CreateBreak(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.TariffBreak
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, model.BreakTypeMinimum, result.BreakType)
	assert.Equal(t, 30, result.Duration)
	require.NotNil(t, result.AfterWorkMinutes)
	assert.Equal(t, 360, *result.AfterWorkMinutes)
}

func TestTariffHandler_CreateBreak_TariffNotFound(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	body := `{"break_type": "minimum", "duration": 30}`
	req := httptest.NewRequest("POST", "/tariffs/00000000-0000-0000-0000-000000000000/breaks", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.CreateBreak(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTariffHandler_CreateBreak_InvalidTariffID(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	body := `{"break_type": "minimum", "duration": 30}`
	req := httptest.NewRequest("POST", "/tariffs/invalid/breaks", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.CreateBreak(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_CreateBreak_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "BREAK-INV", Name: "Break Invalid"})
	require.NoError(t, err)

	req := httptest.NewRequest("POST", "/tariffs/"+tariff.ID.String()+"/breaks", bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tariff.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.CreateBreak(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_DeleteBreak_Success(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "DEL-BREAK", Name: "Delete Break"})
	require.NoError(t, err)

	tariffBreak, err := svc.CreateBreak(ctx, service.CreateTariffBreakInput{TariffID: tariff.ID, BreakType: "fixed", Duration: 15})
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/tariffs/"+tariff.ID.String()+"/breaks/"+tariffBreak.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tariff.ID.String())
	rctx.URLParams.Add("breakId", tariffBreak.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBreak(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestTariffHandler_DeleteBreak_TariffNotFound(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	req := httptest.NewRequest("DELETE", "/tariffs/00000000-0000-0000-0000-000000000000/breaks/00000000-0000-0000-0000-000000000001", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	rctx.URLParams.Add("breakId", "00000000-0000-0000-0000-000000000001")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBreak(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTariffHandler_DeleteBreak_BreakNotFound(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "DEL-BREAK-NF", Name: "Delete Break NF"})
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/tariffs/"+tariff.ID.String()+"/breaks/00000000-0000-0000-0000-000000000001", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tariff.ID.String())
	rctx.URLParams.Add("breakId", "00000000-0000-0000-0000-000000000001")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBreak(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTariffHandler_DeleteBreak_InvalidTariffID(t *testing.T) {
	h, _, _, _ := setupTariffHandler(t)

	req := httptest.NewRequest("DELETE", "/tariffs/invalid/breaks/00000000-0000-0000-0000-000000000001", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	rctx.URLParams.Add("breakId", "00000000-0000-0000-0000-000000000001")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBreak(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTariffHandler_DeleteBreak_InvalidBreakID(t *testing.T) {
	h, svc, tenant, _ := setupTariffHandler(t)
	ctx := context.Background()

	tariff, err := svc.Create(ctx, service.CreateTariffInput{TenantID: tenant.ID, Code: "DEL-INV-BREAK", Name: "Delete Invalid Break"})
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/tariffs/"+tariff.ID.String()+"/breaks/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tariff.ID.String())
	rctx.URLParams.Add("breakId", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBreak(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}
