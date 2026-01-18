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

func setupWeekPlanHandler(t *testing.T) (*handler.WeekPlanHandler, *service.WeekPlanService, *model.Tenant, *model.DayPlan) {
	db := testutil.SetupTestDB(t)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	h := handler.NewWeekPlanHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	// Create test day plan
	dayPlan := &model.DayPlan{
		TenantID:     tenant.ID,
		Code:         "DP-HANDLER-" + uuid.New().String()[:8],
		Name:         "Day Plan for Handler Tests",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
		IsActive:     true,
	}
	err = dayPlanRepo.Create(context.Background(), dayPlan)
	require.NoError(t, err)

	return h, svc, tenant, dayPlan
}

func withWeekPlanTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestWeekPlanHandler_Create_Success(t *testing.T) {
	h, _, tenant, _ := setupWeekPlanHandler(t)

	body := `{"code": "WEEK-001", "name": "Standard Week"}`
	req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withWeekPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.WeekPlan
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "WEEK-001", result.Code)
	assert.Equal(t, "Standard Week", result.Name)
}

func TestWeekPlanHandler_Create_WithDayPlans(t *testing.T) {
	h, _, tenant, dayPlan := setupWeekPlanHandler(t)

	body := `{"code": "WEEK-002", "name": "Week with Day Plans", "monday_day_plan_id": "` + dayPlan.ID.String() + `"}`
	req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withWeekPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.WeekPlan
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "WEEK-002", result.Code)
	require.NotNil(t, result.MondayDayPlanID)
	assert.Equal(t, dayPlan.ID, *result.MondayDayPlanID)
}

func TestWeekPlanHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant, _ := setupWeekPlanHandler(t)

	req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString("invalid"))
	req = withWeekPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Create_MissingCode(t *testing.T) {
	h, _, tenant, _ := setupWeekPlanHandler(t)

	body := `{"name": "Test Plan"}`
	req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withWeekPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Create_NoTenant(t *testing.T) {
	h, _, _, _ := setupWeekPlanHandler(t)

	body := `{"code": "TEST", "name": "Test"}`
	req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestWeekPlanHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, tenant, _ := setupWeekPlanHandler(t)
	ctx := context.Background()

	// Create first plan
	input := service.CreateWeekPlanInput{
		TenantID: tenant.ID,
		Code:     "DUPLICATE",
		Name:     "First",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "DUPLICATE", "name": "Second"}`
	req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withWeekPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestWeekPlanHandler_Create_InvalidDayPlan(t *testing.T) {
	h, _, tenant, _ := setupWeekPlanHandler(t)

	body := `{"code": "INVALID-DP", "name": "Invalid", "monday_day_plan_id": "` + uuid.New().String() + `"}`
	req := httptest.NewRequest("POST", "/week-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withWeekPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Get_Success(t *testing.T) {
	h, svc, tenant, _ := setupWeekPlanHandler(t)
	ctx := context.Background()

	input := service.CreateWeekPlanInput{
		TenantID: tenant.ID,
		Code:     "GET-TEST",
		Name:     "Get Test",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/week-plans/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.WeekPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "Get Test", result.Name)
}

func TestWeekPlanHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupWeekPlanHandler(t)

	req := httptest.NewRequest("GET", "/week-plans/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupWeekPlanHandler(t)

	req := httptest.NewRequest("GET", "/week-plans/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestWeekPlanHandler_List_Success(t *testing.T) {
	h, svc, tenant, _ := setupWeekPlanHandler(t)
	ctx := context.Background()

	// Create test plans
	for _, code := range []string{"PLAN-A", "PLAN-B"} {
		input := service.CreateWeekPlanInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Plan " + code,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/week-plans", nil)
	req = withWeekPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.WeekPlan
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result["data"], 2)
}

func TestWeekPlanHandler_List_ActiveOnly(t *testing.T) {
	h, svc, tenant, _ := setupWeekPlanHandler(t)
	ctx := context.Background()

	// Create active plan
	_, err := svc.Create(ctx, service.CreateWeekPlanInput{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active"})
	require.NoError(t, err)

	// Create and deactivate another plan
	created2, err := svc.Create(ctx, service.CreateWeekPlanInput{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive"})
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, created2.ID, service.UpdateWeekPlanInput{IsActive: &isActive})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/week-plans?active=true", nil)
	req = withWeekPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.WeekPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result["data"], 1)
	assert.Equal(t, "ACTIVE", result["data"][0].Code)
}

func TestWeekPlanHandler_List_NoTenant(t *testing.T) {
	h, _, _, _ := setupWeekPlanHandler(t)

	req := httptest.NewRequest("GET", "/week-plans", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestWeekPlanHandler_Update_Success(t *testing.T) {
	h, svc, tenant, _ := setupWeekPlanHandler(t)
	ctx := context.Background()

	input := service.CreateWeekPlanInput{
		TenantID: tenant.ID,
		Code:     "UPDATE",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_active": false}`
	req := httptest.NewRequest("PUT", "/week-plans/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.WeekPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.False(t, result.IsActive)
}

func TestWeekPlanHandler_Update_AddDayPlan(t *testing.T) {
	h, svc, tenant, dayPlan := setupWeekPlanHandler(t)
	ctx := context.Background()

	input := service.CreateWeekPlanInput{
		TenantID: tenant.ID,
		Code:     "UPDATE-DP",
		Name:     "Update Day Plan",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"monday_day_plan_id": "` + dayPlan.ID.String() + `"}`
	req := httptest.NewRequest("PUT", "/week-plans/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.WeekPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	require.NotNil(t, result.MondayDayPlanID)
	assert.Equal(t, dayPlan.ID, *result.MondayDayPlanID)
}

func TestWeekPlanHandler_Update_InvalidID(t *testing.T) {
	h, _, _, _ := setupWeekPlanHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PUT", "/week-plans/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Update_NotFound(t *testing.T) {
	h, _, _, _ := setupWeekPlanHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PUT", "/week-plans/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestWeekPlanHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupWeekPlanHandler(t)
	ctx := context.Background()

	input := service.CreateWeekPlanInput{
		TenantID: tenant.ID,
		Code:     "UPDATE",
		Name:     "Original",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PUT", "/week-plans/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Delete_Success(t *testing.T) {
	h, svc, tenant, _ := setupWeekPlanHandler(t)
	ctx := context.Background()

	input := service.CreateWeekPlanInput{
		TenantID: tenant.ID,
		Code:     "DELETE",
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/week-plans/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrWeekPlanNotFound)
}

func TestWeekPlanHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _ := setupWeekPlanHandler(t)

	req := httptest.NewRequest("DELETE", "/week-plans/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestWeekPlanHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _ := setupWeekPlanHandler(t)

	req := httptest.NewRequest("DELETE", "/week-plans/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
