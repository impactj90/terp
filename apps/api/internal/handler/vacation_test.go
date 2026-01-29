package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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

type vacationTestContext struct {
	handler             *handler.VacationHandler
	vacationService     *service.VacationService
	vacationBalanceRepo *repository.VacationBalanceRepository
	tenant              *model.Tenant
	employee            *model.Employee
}

func setupVacationHandler(t *testing.T) *vacationTestContext {
	db := testutil.SetupTestDB(t)
	tenantRepo := repository.NewTenantRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	vacationBalanceRepo := repository.NewVacationBalanceRepository(db)
	absenceDayRepo := repository.NewAbsenceDayRepository(db)
	absenceTypeRepo := repository.NewAbsenceTypeRepository(db)

	ctx := context.Background()

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(ctx, tenant))

	// Create test employee
	employee := &model.Employee{
		TenantID:        tenant.ID,
		FirstName:       "Test",
		LastName:        "Vacation",
		PersonnelNumber: "VAC-" + uuid.New().String()[:4],
		PIN:             "5678",
		EntryDate:       time.Now().AddDate(-1, 0, 0),
		IsActive:        true,
	}
	require.NoError(t, employeeRepo.Create(ctx, employee))

	// Create vacation service
	employmentTypeRepo := repository.NewEmploymentTypeRepository(db)
	vacationCalcGroupRepo := repository.NewVacationCalcGroupRepository(db)
	vacationService := service.NewVacationService(
		vacationBalanceRepo,
		absenceDayRepo,
		absenceTypeRepo,
		employeeRepo,
		tenantRepo,
		tariffRepo,
		employmentTypeRepo,
		vacationCalcGroupRepo,
		decimal.Zero,
	)

	// Create handler
	h := handler.NewVacationHandler(vacationService)

	return &vacationTestContext{
		handler:             h,
		vacationService:     vacationService,
		vacationBalanceRepo: vacationBalanceRepo,
		tenant:              tenant,
		employee:            employee,
	}
}

func withVacationTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestVacationHandler_GetBalance_Success(t *testing.T) {
	tc := setupVacationHandler(t)
	ctx := context.Background()

	// Create a vacation balance record
	balance := &model.VacationBalance{
		TenantID:    tc.tenant.ID,
		EmployeeID:  tc.employee.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(5),
		Adjustments: decimal.NewFromInt(2),
		Taken:       decimal.NewFromInt(10),
	}
	require.NoError(t, tc.vacationBalanceRepo.Create(ctx, balance))

	req := httptest.NewRequest("GET", fmt.Sprintf("/employees/%s/vacation-balance?year=2026", tc.employee.ID.String()), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withVacationTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetBalance(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)

	assert.Equal(t, tc.employee.ID.String(), result["employee_id"])
	assert.Equal(t, float64(2026), result["year"])
	assert.Equal(t, float64(30), result["base_entitlement"])
	assert.Equal(t, float64(5), result["carryover_from_previous"])
	assert.Equal(t, float64(2), result["manual_adjustment"])
	assert.Equal(t, float64(10), result["used_days"])
	assert.Equal(t, float64(37), result["total_entitlement"]) // 30 + 5 + 2
	assert.Equal(t, float64(27), result["remaining_days"])    // 37 - 10
}

func TestVacationHandler_GetBalance_DefaultYear(t *testing.T) {
	tc := setupVacationHandler(t)
	ctx := context.Background()

	currentYear := time.Now().Year()

	// Create a vacation balance for the current year
	balance := &model.VacationBalance{
		TenantID:    tc.tenant.ID,
		EmployeeID:  tc.employee.ID,
		Year:        currentYear,
		Entitlement: decimal.NewFromInt(25),
		Carryover:   decimal.Zero,
		Adjustments: decimal.Zero,
		Taken:       decimal.Zero,
	}
	require.NoError(t, tc.vacationBalanceRepo.Create(ctx, balance))

	// Request without year query param
	req := httptest.NewRequest("GET", fmt.Sprintf("/employees/%s/vacation-balance", tc.employee.ID.String()), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withVacationTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetBalance(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)

	assert.Equal(t, float64(currentYear), result["year"])
	assert.Equal(t, float64(25), result["base_entitlement"])
}

func TestVacationHandler_GetBalance_InvalidEmployeeID(t *testing.T) {
	tc := setupVacationHandler(t)

	req := httptest.NewRequest("GET", "/employees/invalid/vacation-balance", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withVacationTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetBalance(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestVacationHandler_GetBalance_InvalidYear(t *testing.T) {
	tc := setupVacationHandler(t)

	req := httptest.NewRequest("GET", fmt.Sprintf("/employees/%s/vacation-balance?year=abc", tc.employee.ID.String()), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withVacationTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetBalance(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestVacationHandler_GetBalance_NotFound(t *testing.T) {
	tc := setupVacationHandler(t)

	// Request for a year with no balance record
	req := httptest.NewRequest("GET", fmt.Sprintf("/employees/%s/vacation-balance?year=2020", tc.employee.ID.String()), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withVacationTenantContext(req, tc.tenant)
	rr := httptest.NewRecorder()

	tc.handler.GetBalance(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestVacationHandler_GetBalance_NoTenant(t *testing.T) {
	tc := setupVacationHandler(t)

	req := httptest.NewRequest("GET", fmt.Sprintf("/employees/%s/vacation-balance", tc.employee.ID.String()), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tc.employee.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	// No tenant context added
	rr := httptest.NewRecorder()

	tc.handler.GetBalance(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
