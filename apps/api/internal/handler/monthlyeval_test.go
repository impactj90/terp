package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

type monthlyEvalTestContext struct {
	handler          *handler.MonthlyEvalHandler
	service          *service.MonthlyEvalService
	monthlyValueRepo *repository.MonthlyValueRepository
	tenant           *model.Tenant
	employee         *model.Employee
	user             *auth.User
	dbUser           *model.User
}

func setupMonthlyEvalHandler(t *testing.T) *monthlyEvalTestContext {
	db := testutil.SetupTestDB(t)
	tenantRepo := repository.NewTenantRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	userRepo := repository.NewUserRepository(db)
	monthlyValueRepo := repository.NewMonthlyValueRepository(db)
	dailyValueRepo := repository.NewDailyValueRepository(db)
	absenceDayRepo := repository.NewAbsenceDayRepository(db)
	tariffRepo := repository.NewTariffRepository(db)

	ctx := context.Background()

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(ctx, tenant))

	// Create test user in database (for foreign key constraint)
	dbUser := &model.User{
		TenantID:    &tenant.ID,
		Email:       "monthlyeval-test-" + uuid.New().String()[:8] + "@example.com",
		DisplayName: "Test User",
		IsActive:    true,
	}
	require.NoError(t, userRepo.Create(ctx, dbUser))

	// Create test employee
	employee := &model.Employee{
		TenantID:        tenant.ID,
		FirstName:       "Test",
		LastName:        "Employee",
		PersonnelNumber: "TEST-" + uuid.New().String()[:4],
		PIN:             "1234",
		EntryDate:       time.Now().AddDate(-1, 0, 0),
		IsActive:        true,
	}
	require.NoError(t, employeeRepo.Create(ctx, employee))

	// Create services
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo, tariffRepo)
	employeeService := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo)

	// Create handler
	h := handler.NewMonthlyEvalHandler(monthlyEvalService, employeeService)

	// Create auth user matching the database user
	user := &auth.User{
		ID:          dbUser.ID,
		Email:       dbUser.Email,
		DisplayName: dbUser.DisplayName,
		Role:        "admin",
	}

	return &monthlyEvalTestContext{
		handler:          h,
		service:          monthlyEvalService,
		monthlyValueRepo: monthlyValueRepo,
		tenant:           tenant,
		employee:         employee,
		user:             user,
		dbUser:           dbUser,
	}
}

func withMonthlyEvalTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func withUserContext(r *http.Request, user *auth.User) *http.Request {
	ctx := auth.ContextWithUser(r.Context(), user)
	return r.WithContext(ctx)
}

// --- GetMonthSummary tests ---

func TestMonthlyEvalHandler_GetMonthSummary_NoPersistedValue_CalculatesOnTheFly(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, float64(2026), result["year"])
	assert.Equal(t, float64(1), result["month"])
	// total_net_time is omitted when 0 due to omitempty in generated model
	assert.Nil(t, result["total_net_time"])
	assert.Equal(t, false, result["is_closed"])
}

func TestMonthlyEvalHandler_GetMonthSummary_InvalidMonth(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026/13", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "13")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyEvalHandler_GetMonthSummary_InvalidEmployeeID(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/invalid/months/2026/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyEvalHandler_GetMonthSummary_NoTenant(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestMonthlyEvalHandler_GetMonthSummary_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create a monthly value directly
	mv := &model.MonthlyValue{
		TenantID:        tc.tenant.ID,
		EmployeeID:      tc.employee.ID,
		Year:            2026,
		Month:           1,
		TotalGrossTime:  9600,
		TotalNetTime:    9000,
		TotalTargetTime: 8800,
		WorkDays:        20,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026/1", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetMonthSummary(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, float64(2026), result["year"])
	assert.Equal(t, float64(1), result["month"])
	assert.Equal(t, float64(9600), result["total_gross_time"])
	assert.Equal(t, float64(9000), result["total_net_time"])
	assert.Equal(t, false, result["is_closed"])
}

// --- GetYearOverview tests ---

func TestMonthlyEvalHandler_GetYearOverview_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetYearOverview(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, float64(2026), result["year"])
	assert.NotNil(t, result["data"])
}

func TestMonthlyEvalHandler_GetYearOverview_InvalidYear(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetYearOverview(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyEvalHandler_GetYearOverview_NoTenant(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+tc.employee.ID.String()+"/months/2026", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	tc.handler.GetYearOverview(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// --- CloseMonth tests ---

func TestMonthlyEvalHandler_CloseMonth_NotFound(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/1/close", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.CloseMonth(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestMonthlyEvalHandler_CloseMonth_NoUser(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/1/close", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	// No user context
	rr := httptest.NewRecorder()

	tc.handler.CloseMonth(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestMonthlyEvalHandler_CloseMonth_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create a monthly value to close
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      1,
		WorkDays:   20,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/1/close", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.CloseMonth(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, true, result["is_closed"])
	assert.NotNil(t, result["closed_at"])
	assert.NotNil(t, result["closed_by"])
}

func TestMonthlyEvalHandler_CloseMonth_AlreadyClosed(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create an already closed monthly value
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      2,
		WorkDays:   20,
		IsClosed:   true,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/2/close", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "2")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.CloseMonth(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}

// --- ReopenMonth tests ---

func TestMonthlyEvalHandler_ReopenMonth_NotClosed(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create an open monthly value
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      3,
		WorkDays:   20,
		IsClosed:   false,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/3/reopen", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "3")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.ReopenMonth(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestMonthlyEvalHandler_ReopenMonth_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create a closed monthly value
	closedAt := time.Now()
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      4,
		WorkDays:   20,
		IsClosed:   true,
		ClosedAt:   &closedAt,
		ClosedBy:   &tc.user.ID,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/4/reopen", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "4")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	req = withUserContext(req, tc.user)
	rr := httptest.NewRecorder()

	tc.handler.ReopenMonth(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, false, result["is_closed"])
	assert.NotNil(t, result["reopened_at"])
	assert.NotNil(t, result["reopened_by"])
}

// --- Recalculate tests ---

func TestMonthlyEvalHandler_Recalculate_EmployeeNotFound(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	nonExistentID := uuid.New()
	req := httptest.NewRequest("POST", "/employees/"+nonExistentID.String()+"/months/2026/1/recalculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", nonExistentID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "1")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.Recalculate(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestMonthlyEvalHandler_Recalculate_MonthClosed(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)
	ctx := context.Background()

	// Create a closed monthly value
	closedAt := time.Now()
	mv := &model.MonthlyValue{
		TenantID:   tc.tenant.ID,
		EmployeeID: tc.employee.ID,
		Year:       2026,
		Month:      5,
		WorkDays:   20,
		IsClosed:   true,
		ClosedAt:   &closedAt,
		ClosedBy:   &tc.user.ID,
	}
	require.NoError(t, tc.monthlyValueRepo.Upsert(ctx, mv))

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/5/recalculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "5")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.Recalculate(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestMonthlyEvalHandler_Recalculate_Success(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/6/recalculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "6")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withMonthlyEvalTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.Recalculate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, float64(2026), result["year"])
	assert.Equal(t, float64(6), result["month"])
}

func TestMonthlyEvalHandler_Recalculate_NoTenant(t *testing.T) {
	tc := setupMonthlyEvalHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+tc.employee.ID.String()+"/months/2026/6/recalculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	rctx.URLParams.Add("year", "2026")
	rctx.URLParams.Add("month", "6")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	tc.handler.Recalculate(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
