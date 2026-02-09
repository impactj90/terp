package handler_test

import (
	"bytes"
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

	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupAssignmentHandler(t *testing.T) (
	*handler.EmployeeTariffAssignmentHandler,
	*service.EmployeeTariffAssignmentService,
	*repository.EmployeeRepository,
	*repository.TariffRepository,
	*model.Tenant,
) {
	t.Helper()
	db := testutil.SetupTestDB(t)

	tenantRepo := repository.NewTenantRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	assignmentRepo := repository.NewEmployeeTariffAssignmentRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)

	svc := service.NewEmployeeTariffAssignmentService(assignmentRepo, employeeRepo, tariffRepo, empDayPlanRepo)
	h := handler.NewEmployeeTariffAssignmentHandler(svc)

	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))

	return h, svc, employeeRepo, tariffRepo, tenant
}

func createHandlerTestEmployee(t *testing.T, repo *repository.EmployeeRepository, tenantID uuid.UUID, pn string) *model.Employee {
	t.Helper()
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: pn,
		PIN:             "0000",
		FirstName:       "Test",
		LastName:        "Handler",
		EntryDate:       time.Now().AddDate(0, 0, -30),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(context.Background(), emp))
	return emp
}

func createHandlerTestTariff(t *testing.T, repo *repository.TariffRepository, tenantID uuid.UUID, code string) *model.Tariff {
	t.Helper()
	tariff := &model.Tariff{
		TenantID: tenantID,
		Code:     code,
		Name:     "Tariff " + code,
		IsActive: true,
	}
	require.NoError(t, repo.Create(context.Background(), tariff))
	return tariff
}

func withAssignmentTenantCtx(r *http.Request, tenantID uuid.UUID) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenantID)
	return r.WithContext(ctx)
}

func TestAssignmentHandler_Create_Success(t *testing.T) {
	h, _, employeeRepo, tariffRepo, tenant := setupAssignmentHandler(t)

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E01")
	tariff := createHandlerTestTariff(t, tariffRepo, tenant.ID, "HA-T01")

	body := `{"tariff_id": "` + tariff.ID.String() + `", "effective_from": "2026-01-01", "effective_to": "2026-06-30"}`
	req := httptest.NewRequest("POST", "/employees/"+emp.ID.String()+"/tariff-assignments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withAssignmentTenantCtx(req, tenant.ID)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.EmployeeTariffAssignment
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, emp.ID, result.EmployeeID)
	assert.Equal(t, tariff.ID, result.TariffID)
	assert.True(t, result.IsActive)
}

func TestAssignmentHandler_Create_InvalidBody(t *testing.T) {
	h, _, employeeRepo, _, tenant := setupAssignmentHandler(t)

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E02")

	req := httptest.NewRequest("POST", "/employees/"+emp.ID.String()+"/tariff-assignments", bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withAssignmentTenantCtx(req, tenant.ID)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAssignmentHandler_Create_NoTenant(t *testing.T) {
	h, _, employeeRepo, tariffRepo, tenant := setupAssignmentHandler(t)

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E03")
	tariff := createHandlerTestTariff(t, tariffRepo, tenant.ID, "HA-T03")

	body := `{"tariff_id": "` + tariff.ID.String() + `", "effective_from": "2026-01-01"}`
	req := httptest.NewRequest("POST", "/employees/"+emp.ID.String()+"/tariff-assignments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	// No tenant context
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestAssignmentHandler_Create_Overlap(t *testing.T) {
	h, svc, employeeRepo, tariffRepo, tenant := setupAssignmentHandler(t)
	ctx := context.Background()

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E04")
	tariff := createHandlerTestTariff(t, tariffRepo, tenant.ID, "HA-T04")

	// Create first assignment via service
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from,
		EffectiveTo:   &to,
	})
	require.NoError(t, err)

	// Try to create overlapping via handler
	body := `{"tariff_id": "` + tariff.ID.String() + `", "effective_from": "2026-03-01", "effective_to": "2026-09-30"}`
	req := httptest.NewRequest("POST", "/employees/"+emp.ID.String()+"/tariff-assignments", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withAssignmentTenantCtx(req, tenant.ID)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestAssignmentHandler_Get_Success(t *testing.T) {
	h, svc, employeeRepo, tariffRepo, tenant := setupAssignmentHandler(t)
	ctx := context.Background()

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E05")
	tariff := createHandlerTestTariff(t, tariffRepo, tenant.ID, "HA-T05")

	created, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employees/"+emp.ID.String()+"/tariff-assignments/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	rctx.URLParams.Add("assignmentId", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.EmployeeTariffAssignment
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
}

func TestAssignmentHandler_Get_NotFound(t *testing.T) {
	h, _, _, _, _ := setupAssignmentHandler(t)

	req := httptest.NewRequest("GET", "/employees/xxx/tariff-assignments/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	rctx.URLParams.Add("assignmentId", uuid.New().String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAssignmentHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _, _ := setupAssignmentHandler(t)

	req := httptest.NewRequest("GET", "/employees/xxx/tariff-assignments/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	rctx.URLParams.Add("assignmentId", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAssignmentHandler_Update_Success(t *testing.T) {
	h, svc, employeeRepo, tariffRepo, tenant := setupAssignmentHandler(t)
	ctx := context.Background()

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E06")
	tariff := createHandlerTestTariff(t, tariffRepo, tenant.ID, "HA-T06")

	created, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	})
	require.NoError(t, err)

	body := `{"notes": "Updated notes", "is_active": true}`
	req := httptest.NewRequest("PUT", "/employees/"+emp.ID.String()+"/tariff-assignments/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	rctx.URLParams.Add("assignmentId", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withAssignmentTenantCtx(req, tenant.ID)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.EmployeeTariffAssignment
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated notes", result.Notes)
}

func TestAssignmentHandler_Update_NotFound(t *testing.T) {
	h, _, _, _, tenant := setupAssignmentHandler(t)

	body := `{"notes": "Test"}`
	req := httptest.NewRequest("PUT", "/employees/xxx/tariff-assignments/"+uuid.New().String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	rctx.URLParams.Add("assignmentId", uuid.New().String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withAssignmentTenantCtx(req, tenant.ID)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAssignmentHandler_Delete_Success(t *testing.T) {
	h, svc, employeeRepo, tariffRepo, tenant := setupAssignmentHandler(t)
	ctx := context.Background()

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E07")
	tariff := createHandlerTestTariff(t, tariffRepo, tenant.ID, "HA-T07")

	created, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	})
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/employees/"+emp.ID.String()+"/tariff-assignments/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	rctx.URLParams.Add("assignmentId", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestAssignmentHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _, _ := setupAssignmentHandler(t)

	req := httptest.NewRequest("DELETE", "/employees/xxx/tariff-assignments/"+uuid.New().String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	rctx.URLParams.Add("assignmentId", uuid.New().String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAssignmentHandler_List_Success(t *testing.T) {
	h, svc, employeeRepo, tariffRepo, tenant := setupAssignmentHandler(t)
	ctx := context.Background()

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E08")
	tariff := createHandlerTestTariff(t, tariffRepo, tenant.ID, "HA-T08")

	// Create two assignments
	from1 := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to1 := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from1,
		EffectiveTo:   &to1,
	})
	require.NoError(t, err)

	from2 := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	_, err = svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from2,
	})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employees/"+emp.ID.String()+"/tariff-assignments", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.EmployeeTariffAssignment
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result["data"], 2)
}

func TestAssignmentHandler_GetEffectiveTariff_FromAssignment(t *testing.T) {
	h, svc, employeeRepo, tariffRepo, tenant := setupAssignmentHandler(t)
	ctx := context.Background()

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E09")
	tariff := createHandlerTestTariff(t, tariffRepo, tenant.ID, "HA-T09")

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC)
	_, err := svc.Create(ctx, service.CreateEmployeeTariffAssignmentInput{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		TariffID:      tariff.ID,
		EffectiveFrom: from,
		EffectiveTo:   &to,
	})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employees/"+emp.ID.String()+"/effective-tariff?date=2026-06-15", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetEffectiveTariff(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result service.EffectiveTariffResult
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "assignment", result.Source)
}

func TestAssignmentHandler_GetEffectiveTariff_NoDate(t *testing.T) {
	h, _, employeeRepo, _, tenant := setupAssignmentHandler(t)

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E10")

	req := httptest.NewRequest("GET", "/employees/"+emp.ID.String()+"/effective-tariff", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetEffectiveTariff(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAssignmentHandler_GetEffectiveTariff_InvalidDate(t *testing.T) {
	h, _, employeeRepo, _, tenant := setupAssignmentHandler(t)

	emp := createHandlerTestEmployee(t, employeeRepo, tenant.ID, "HA-E11")

	req := httptest.NewRequest("GET", "/employees/"+emp.ID.String()+"/effective-tariff?date=not-a-date", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetEffectiveTariff(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAssignmentHandler_GetEffectiveTariff_EmployeeNotFound(t *testing.T) {
	h, _, _, _, _ := setupAssignmentHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+uuid.New().String()+"/effective-tariff?date=2026-06-15", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetEffectiveTariff(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
