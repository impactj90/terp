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

func setupDayPlanHandler(t *testing.T) (*handler.DayPlanHandler, *service.DayPlanService, *model.Tenant, *model.Account) {
	db := testutil.SetupTestDB(t)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	accountRepo := repository.NewAccountRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewDayPlanService(dayPlanRepo)
	h := handler.NewDayPlanHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	// Create test account
	account := &model.Account{
		TenantID:    &tenant.ID,
		Code:        "BONUS_HANDLER_" + uuid.New().String()[:8],
		Name:        "Bonus Account",
		AccountType: model.AccountTypeBonus,
		Unit:        model.AccountUnitMinutes,
		IsActive:    true,
	}
	err = accountRepo.Create(context.Background(), account)
	require.NoError(t, err)

	return h, svc, tenant, account
}

func withDayPlanTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestDayPlanHandler_Create_Success(t *testing.T) {
	h, _, tenant, _ := setupDayPlanHandler(t)

	body := `{"code": "PLAN-001", "name": "Standard Day", "plan_type": "fixed", "regular_hours": 480}`
	req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.DayPlan
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "PLAN-001", result.Code)
	assert.Equal(t, "Standard Day", result.Name)
	assert.Equal(t, model.PlanTypeFixed, result.PlanType)
	assert.Equal(t, 480, result.RegularHours)
}

func TestDayPlanHandler_Create_WithTimeWindows(t *testing.T) {
	h, _, tenant, _ := setupDayPlanHandler(t)

	body := `{"code": "FLEX-001", "name": "Flextime Day", "plan_type": "flextime", "regular_hours": 480, "come_from": 420, "come_to": 540, "go_from": 960, "go_to": 1140}`
	req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.DayPlan
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, model.PlanTypeFlextime, result.PlanType)
	require.NotNil(t, result.ComeFrom)
	assert.Equal(t, 420, *result.ComeFrom)
}

func TestDayPlanHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString("invalid"))
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Create_MissingCode(t *testing.T) {
	h, _, tenant, _ := setupDayPlanHandler(t)

	body := `{"name": "Test Plan", "plan_type": "fixed", "regular_hours": 480}`
	req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Create_NoTenant(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	body := `{"code": "TEST", "name": "Test", "plan_type": "fixed", "regular_hours": 480}`
	req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestDayPlanHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	// Create first plan
	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "DUPLICATE",
		Name:         "First",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "DUPLICATE", "name": "Second", "plan_type": "fixed", "regular_hours": 480}`
	req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestDayPlanHandler_Create_InvalidTimeRange(t *testing.T) {
	h, _, tenant, _ := setupDayPlanHandler(t)

	body := `{"code": "INVALID", "name": "Invalid", "plan_type": "fixed", "regular_hours": 480, "come_from": 540, "come_to": 420}`
	req := httptest.NewRequest("POST", "/day-plans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Get_Success(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "GET-TEST",
		Name:         "Get Test",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/day-plans/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.DayPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "Get Test", result.Name)
}

func TestDayPlanHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("GET", "/day-plans/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("GET", "/day-plans/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDayPlanHandler_List_Success(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	// Create test plans
	for _, code := range []string{"PLAN-A", "PLAN-B"} {
		input := service.CreateDayPlanInput{
			TenantID:     tenant.ID,
			Code:         code,
			Name:         "Plan " + code,
			PlanType:     model.PlanTypeFixed,
			RegularHours: 480,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/day-plans", nil)
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.DayPlan
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result["data"], 2)
}

func TestDayPlanHandler_List_ActiveOnly(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	// Create active plan
	_, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	// Create and deactivate another plan
	created2, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, created2.ID, service.UpdateDayPlanInput{IsActive: &isActive})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/day-plans?active=true", nil)
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.DayPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result["data"], 1)
	assert.Equal(t, "ACTIVE", result["data"][0].Code)
}

func TestDayPlanHandler_List_ByPlanType(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	_, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "FIXED1", Name: "Fixed 1", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "FLEX1", Name: "Flex 1", PlanType: model.PlanTypeFlextime, RegularHours: 480})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/day-plans?plan_type=flextime", nil)
	req = withDayPlanTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.DayPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result["data"], 1)
	assert.Equal(t, "FLEX1", result["data"][0].Code)
}

func TestDayPlanHandler_List_NoTenant(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("GET", "/day-plans", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestDayPlanHandler_Update_Success(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "UPDATE",
		Name:         "Original",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_active": false}`
	req := httptest.NewRequest("PUT", "/day-plans/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.DayPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.False(t, result.IsActive)
}

func TestDayPlanHandler_Update_InvalidID(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PUT", "/day-plans/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Update_NotFound(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PUT", "/day-plans/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDayPlanHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "UPDATE",
		Name:         "Original",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PUT", "/day-plans/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Delete_Success(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	input := service.CreateDayPlanInput{
		TenantID:     tenant.ID,
		Code:         "DELETE",
		Name:         "To Delete",
		PlanType:     model.PlanTypeFixed,
		RegularHours: 480,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/day-plans/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrDayPlanNotFound)
}

func TestDayPlanHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("DELETE", "/day-plans/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("DELETE", "/day-plans/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDayPlanHandler_Copy_Success(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	original, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "ORIGINAL", Name: "Original", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	body := `{"new_code": "COPY", "new_name": "Copy of Plan"}`
	req := httptest.NewRequest("POST", "/day-plans/"+original.ID.String()+"/copy", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", original.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Copy(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.DayPlan
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "COPY", result.Code)
	assert.Equal(t, "Copy of Plan", result.Name)
}

func TestDayPlanHandler_Copy_InvalidID(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	body := `{"new_code": "COPY", "new_name": "Copy"}`
	req := httptest.NewRequest("POST", "/day-plans/invalid/copy", bytes.NewBufferString(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Copy(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_Copy_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	original, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "ORIGINAL", Name: "Original", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	req := httptest.NewRequest("POST", "/day-plans/"+original.ID.String()+"/copy", bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", original.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Copy(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_AddBreak_Success(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	body := `{"break_type": "fixed", "start_time": 720, "end_time": 750, "duration": 30, "auto_deduct": true, "is_paid": false}`
	req := httptest.NewRequest("POST", "/day-plans/"+plan.ID.String()+"/breaks", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", plan.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddBreak(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.DayPlanBreak
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, model.BreakTypeFixed, result.BreakType)
	assert.Equal(t, 30, result.Duration)
}

func TestDayPlanHandler_AddBreak_InvalidPlanID(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	body := `{"break_type": "fixed", "duration": 30}`
	req := httptest.NewRequest("POST", "/day-plans/invalid/breaks", bytes.NewBufferString(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddBreak(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_AddBreak_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	req := httptest.NewRequest("POST", "/day-plans/"+plan.ID.String()+"/breaks", bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", plan.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddBreak(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_DeleteBreak_Success(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BREAK", Name: "Break Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	startTime := 720
	endTime := 750
	b, err := svc.AddBreak(ctx, plan.ID, service.CreateBreakInput{BreakType: model.BreakTypeFixed, StartTime: &startTime, EndTime: &endTime, Duration: 30})
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/day-plans/"+plan.ID.String()+"/breaks/"+b.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", plan.ID.String())
	rctx.URLParams.Add("breakId", b.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBreak(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestDayPlanHandler_DeleteBreak_InvalidID(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("DELETE", "/day-plans/xxx/breaks/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "xxx")
	rctx.URLParams.Add("breakId", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBreak(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_DeleteBreak_NotFound(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("DELETE", "/day-plans/xxx/breaks/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "xxx")
	rctx.URLParams.Add("breakId", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBreak(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestDayPlanHandler_AddBonus_Success(t *testing.T) {
	h, svc, tenant, account := setupDayPlanHandler(t)
	ctx := context.Background()

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BONUS", Name: "Bonus Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	body := `{"account_id": "` + account.ID.String() + `", "time_from": 1200, "time_to": 1380, "calculation_type": "per_minute", "value_minutes": 15}`
	req := httptest.NewRequest("POST", "/day-plans/"+plan.ID.String()+"/bonuses", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", plan.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddBonus(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.DayPlanBonus
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, model.CalculationPerMinute, result.CalculationType)
	assert.Equal(t, 15, result.ValueMinutes)
}

func TestDayPlanHandler_AddBonus_InvalidPlanID(t *testing.T) {
	h, _, _, account := setupDayPlanHandler(t)

	body := `{"account_id": "` + account.ID.String() + `", "time_from": 1200, "time_to": 1380, "calculation_type": "per_minute", "value_minutes": 15}`
	req := httptest.NewRequest("POST", "/day-plans/invalid/bonuses", bytes.NewBufferString(body))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddBonus(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_AddBonus_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupDayPlanHandler(t)
	ctx := context.Background()

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BONUS", Name: "Bonus Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	req := httptest.NewRequest("POST", "/day-plans/"+plan.ID.String()+"/bonuses", bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", plan.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddBonus(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_DeleteBonus_Success(t *testing.T) {
	h, svc, tenant, account := setupDayPlanHandler(t)
	ctx := context.Background()

	plan, err := svc.Create(ctx, service.CreateDayPlanInput{TenantID: tenant.ID, Code: "BONUS", Name: "Bonus Test", PlanType: model.PlanTypeFixed, RegularHours: 480})
	require.NoError(t, err)

	b, err := svc.AddBonus(ctx, plan.ID, service.CreateBonusInput{AccountID: account.ID, TimeFrom: 1200, TimeTo: 1380, CalculationType: model.CalculationPerMinute, ValueMinutes: 15})
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/day-plans/"+plan.ID.String()+"/bonuses/"+b.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", plan.ID.String())
	rctx.URLParams.Add("bonusId", b.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBonus(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestDayPlanHandler_DeleteBonus_InvalidID(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("DELETE", "/day-plans/xxx/bonuses/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "xxx")
	rctx.URLParams.Add("bonusId", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBonus(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestDayPlanHandler_DeleteBonus_NotFound(t *testing.T) {
	h, _, _, _ := setupDayPlanHandler(t)

	req := httptest.NewRequest("DELETE", "/day-plans/xxx/bonuses/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "xxx")
	rctx.URLParams.Add("bonusId", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeleteBonus(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
