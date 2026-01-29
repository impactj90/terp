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

func setupCalculationRuleHandler(t *testing.T) (*handler.CalculationRuleHandler, *service.CalculationRuleService, *model.Tenant, *repository.DB) {
	db := testutil.SetupTestDB(t)
	ruleRepo := repository.NewCalculationRuleRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewCalculationRuleService(ruleRepo)
	h := handler.NewCalculationRuleHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	return h, svc, tenant, db
}

func withCalcRuleTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestCalculationRuleHandler_Create_Success(t *testing.T) {
	h, _, tenant, _ := setupCalculationRuleHandler(t)

	body := `{"code": "FULL_DAY", "name": "Full Day Absence", "value": 0, "factor": 1.0}`
	req := httptest.NewRequest("POST", "/calculation-rules", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCalcRuleTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "FULL_DAY", result["code"])
	assert.Equal(t, "Full Day Absence", result["name"])
}

func TestCalculationRuleHandler_Create_HalfDay(t *testing.T) {
	h, _, tenant, _ := setupCalculationRuleHandler(t)

	body := `{"code": "HALF_DAY", "name": "Half Day Absence", "value": 0, "factor": 0.5}`
	req := httptest.NewRequest("POST", "/calculation-rules", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCalcRuleTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "HALF_DAY", result["code"])
	assert.Equal(t, 0.5, result["factor"])
}

func TestCalculationRuleHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant, _ := setupCalculationRuleHandler(t)

	req := httptest.NewRequest("POST", "/calculation-rules", bytes.NewBufferString("invalid"))
	req = withCalcRuleTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCalculationRuleHandler_Create_MissingCode(t *testing.T) {
	h, _, tenant, _ := setupCalculationRuleHandler(t)

	body := `{"name": "Test Rule", "factor": 1.0}`
	req := httptest.NewRequest("POST", "/calculation-rules", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCalcRuleTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCalculationRuleHandler_Create_MissingName(t *testing.T) {
	h, _, tenant, _ := setupCalculationRuleHandler(t)

	body := `{"code": "TEST", "factor": 1.0}`
	req := httptest.NewRequest("POST", "/calculation-rules", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCalcRuleTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCalculationRuleHandler_Create_NoTenant(t *testing.T) {
	h, _, _, _ := setupCalculationRuleHandler(t)

	body := `{"code": "TEST", "name": "Test", "factor": 1.0}`
	req := httptest.NewRequest("POST", "/calculation-rules", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestCalculationRuleHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, tenant, _ := setupCalculationRuleHandler(t)
	ctx := context.Background()

	// Create first rule
	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "DUP_CODE",
		Name:     "First",
		Factor:   1.0,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "DUP_CODE", "name": "Second", "factor": 1.0}`
	req := httptest.NewRequest("POST", "/calculation-rules", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withCalcRuleTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestCalculationRuleHandler_Get_Success(t *testing.T) {
	h, svc, tenant, _ := setupCalculationRuleHandler(t)
	ctx := context.Background()

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "FULL_DAY",
		Name:     "Full Day Absence",
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/calculation-rules/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID.String(), result["id"])
	assert.Equal(t, "Full Day Absence", result["name"])
}

func TestCalculationRuleHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupCalculationRuleHandler(t)

	req := httptest.NewRequest("GET", "/calculation-rules/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCalculationRuleHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupCalculationRuleHandler(t)

	req := httptest.NewRequest("GET", "/calculation-rules/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCalculationRuleHandler_List_Success(t *testing.T) {
	h, svc, tenant, _ := setupCalculationRuleHandler(t)
	ctx := context.Background()

	// Create test rules
	for _, code := range []string{"FULL_DAY", "HALF_DAY"} {
		input := service.CreateCalculationRuleInput{
			TenantID: tenant.ID,
			Code:     code,
			Name:     "Rule " + code,
			Factor:   1.0,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/calculation-rules", nil)
	req = withCalcRuleTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var response struct {
		Data []map[string]interface{} `json:"data"`
	}
	err := json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Len(t, response.Data, 2)
}

func TestCalculationRuleHandler_List_ActiveOnly(t *testing.T) {
	h, svc, tenant, _ := setupCalculationRuleHandler(t)
	ctx := context.Background()

	// Create active rule
	_, err := svc.Create(ctx, service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "ACTIVE",
		Name:     "Active Rule",
		Factor:   1.0,
	})
	require.NoError(t, err)

	// Create and deactivate rule
	r2, err := svc.Create(ctx, service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "INACTIVE",
		Name:     "Inactive Rule",
		Factor:   0.5,
	})
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, r2.ID, service.UpdateCalculationRuleInput{IsActive: &isActive})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/calculation-rules?active_only=true", nil)
	req = withCalcRuleTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var response struct {
		Data []map[string]interface{} `json:"data"`
	}
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	assert.Len(t, response.Data, 1)
	assert.Equal(t, "ACTIVE", response.Data[0]["code"])
}

func TestCalculationRuleHandler_List_NoTenant(t *testing.T) {
	h, _, _, _ := setupCalculationRuleHandler(t)

	req := httptest.NewRequest("GET", "/calculation-rules", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestCalculationRuleHandler_Update_Success(t *testing.T) {
	h, svc, tenant, _ := setupCalculationRuleHandler(t)
	ctx := context.Background()

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "UPDATE_ME",
		Name:     "Original",
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "factor": 0.5, "is_active": false}`
	req := httptest.NewRequest("PATCH", "/calculation-rules/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result["name"])
	assert.Equal(t, 0.5, result["factor"])
	// is_active is omitempty in generated model, so false value may be omitted from JSON
	isActive, ok := result["is_active"]
	if ok {
		assert.False(t, isActive.(bool))
	}
	// else: false is omitted, which is correct behavior

	// Verify via service that it's actually inactive
	found, err := svc.GetByID(context.Background(), created.ID)
	require.NoError(t, err)
	assert.False(t, found.IsActive)
}

func TestCalculationRuleHandler_Update_InvalidID(t *testing.T) {
	h, _, _, _ := setupCalculationRuleHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/calculation-rules/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCalculationRuleHandler_Update_NotFound(t *testing.T) {
	h, _, _, _ := setupCalculationRuleHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/calculation-rules/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCalculationRuleHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant, _ := setupCalculationRuleHandler(t)
	ctx := context.Background()

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "INVALID_BODY",
		Name:     "Original",
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PATCH", "/calculation-rules/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCalculationRuleHandler_Delete_Success(t *testing.T) {
	h, svc, tenant, _ := setupCalculationRuleHandler(t)
	ctx := context.Background()

	input := service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "DELETE_ME",
		Name:     "To Delete",
		Factor:   1.0,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/calculation-rules/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrCalculationRuleNotFound)
}

func TestCalculationRuleHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _ := setupCalculationRuleHandler(t)

	req := httptest.NewRequest("DELETE", "/calculation-rules/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestCalculationRuleHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _ := setupCalculationRuleHandler(t)

	req := httptest.NewRequest("DELETE", "/calculation-rules/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestCalculationRuleHandler_Delete_InUse(t *testing.T) {
	h, svc, tenant, db := setupCalculationRuleHandler(t)
	ctx := context.Background()

	// Create rule
	rule, err := svc.Create(ctx, service.CreateCalculationRuleInput{
		TenantID: tenant.ID,
		Code:     "IN_USE",
		Name:     "In Use Rule",
		Factor:   1.0,
	})
	require.NoError(t, err)

	// Create absence type referencing the rule
	absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
	absenceType := &model.AbsenceType{
		TenantID:          &tenant.ID,
		Code:              "ABS_" + uuid.New().String()[:4],
		Name:              "Test Absence Type",
		Category:          model.AbsenceCategoryVacation,
		CalculationRuleID: &rule.ID,
	}
	require.NoError(t, absenceTypeRepo.Create(ctx, absenceType))

	req := httptest.NewRequest("DELETE", "/calculation-rules/"+rule.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", rule.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusConflict, rr.Code)
}
