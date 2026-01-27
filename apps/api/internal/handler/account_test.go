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

func setupAccountHandler(t *testing.T) (*handler.AccountHandler, *service.AccountService, *repository.AccountRepository, *model.Tenant) {
	db := testutil.SetupTestDB(t)
	accountRepo := repository.NewAccountRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewAccountService(accountRepo)
	h := handler.NewAccountHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	return h, svc, accountRepo, tenant
}

func withAccountTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestAccountHandler_Create_Success(t *testing.T) {
	h, _, _, tenant := setupAccountHandler(t)

	body := `{"code": "OVERTIME", "name": "Overtime Account", "account_type": "bonus"}`
	req := httptest.NewRequest("POST", "/accounts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withAccountTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Account
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "OVERTIME", result.Code)
	assert.Equal(t, "Overtime Account", result.Name)
	assert.Equal(t, model.AccountTypeBonus, result.AccountType)
}

func TestAccountHandler_Create_InvalidBody(t *testing.T) {
	h, _, _, tenant := setupAccountHandler(t)

	req := httptest.NewRequest("POST", "/accounts", bytes.NewBufferString("invalid"))
	req = withAccountTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAccountHandler_Create_MissingCode(t *testing.T) {
	h, _, _, tenant := setupAccountHandler(t)

	body := `{"name": "Test Account", "account_type": "bonus"}`
	req := httptest.NewRequest("POST", "/accounts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withAccountTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAccountHandler_Create_MissingName(t *testing.T) {
	h, _, _, tenant := setupAccountHandler(t)

	body := `{"code": "TEST", "account_type": "bonus"}`
	req := httptest.NewRequest("POST", "/accounts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withAccountTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAccountHandler_Create_NoTenant(t *testing.T) {
	h, _, _, _ := setupAccountHandler(t)

	body := `{"code": "TEST", "name": "Test", "account_type": "bonus"}`
	req := httptest.NewRequest("POST", "/accounts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestAccountHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, _, tenant := setupAccountHandler(t)
	ctx := context.Background()

	// Create first account
	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "First",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "OVERTIME", "name": "Second", "account_type": "bonus"}`
	req := httptest.NewRequest("POST", "/accounts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withAccountTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAccountHandler_Get_Success(t *testing.T) {
	h, svc, _, tenant := setupAccountHandler(t)
	ctx := context.Background()

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime Account",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/accounts/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Account
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "Overtime Account", result.Name)
}

func TestAccountHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupAccountHandler(t)

	req := httptest.NewRequest("GET", "/accounts/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAccountHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupAccountHandler(t)

	req := httptest.NewRequest("GET", "/accounts/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAccountHandler_List_Success(t *testing.T) {
	h, svc, _, tenant := setupAccountHandler(t)
	ctx := context.Background()

	// Create test accounts
	for _, code := range []string{"OVERTIME", "VACATION"} {
		input := service.CreateAccountInput{
			TenantID:    tenant.ID,
			Code:        code,
			Name:        "Account " + code,
			AccountType: model.AccountTypeBonus,
			IsActive:    true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/accounts", nil)
	req = withAccountTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var response struct {
		Data []model.Account `json:"data"`
	}
	err := json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	result := response.Data
	assert.Len(t, result, 2)
}

func TestAccountHandler_List_ActiveOnly(t *testing.T) {
	h, svc, _, tenant := setupAccountHandler(t)
	ctx := context.Background()

	// Create active account
	input1 := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "ACTIVE",
		Name:        "Active Account",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create inactive account
	input2 := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "INACTIVE",
		Name:        "Inactive Account",
		AccountType: model.AccountTypeBonus,
		IsActive:    false,
	}
	_, err = svc.Create(ctx, input2)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/accounts?active_only=true", nil)
	req = withAccountTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var response struct {
		Data []model.Account `json:"data"`
	}
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	result := response.Data
	assert.Len(t, result, 1)
	assert.Equal(t, "ACTIVE", result[0].Code)
}

func TestAccountHandler_List_IncludeSystem(t *testing.T) {
	h, svc, repo, tenant := setupAccountHandler(t)
	ctx := context.Background()

	// Create tenant account
	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Overtime",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Create system account via repo
	sysAccount := &model.Account{
		TenantID:    nil,
		Code:        "SYS_HANDLER_" + uuid.New().String()[:8],
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
	}
	require.NoError(t, repo.Create(ctx, sysAccount))

	req := httptest.NewRequest("GET", "/accounts?include_system=true", nil)
	req = withAccountTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var response struct {
		Data []model.Account `json:"data"`
	}
	err = json.Unmarshal(rr.Body.Bytes(), &response)
	require.NoError(t, err)
	result := response.Data
	assert.GreaterOrEqual(t, len(result), 2)
}

func TestAccountHandler_List_NoTenant(t *testing.T) {
	h, _, _, _ := setupAccountHandler(t)

	req := httptest.NewRequest("GET", "/accounts", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestAccountHandler_Update_Success(t *testing.T) {
	h, svc, _, tenant := setupAccountHandler(t)
	ctx := context.Background()

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Original",
		AccountType: model.AccountTypeBonus,
		IsActive:    true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_active": false}`
	req := httptest.NewRequest("PATCH", "/accounts/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Account
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.False(t, result.IsActive)
}

func TestAccountHandler_Update_InvalidID(t *testing.T) {
	h, _, _, _ := setupAccountHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/accounts/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAccountHandler_Update_NotFound(t *testing.T) {
	h, _, _, _ := setupAccountHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/accounts/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAccountHandler_Update_InvalidBody(t *testing.T) {
	h, svc, _, tenant := setupAccountHandler(t)
	ctx := context.Background()

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "Original",
		AccountType: model.AccountTypeBonus,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PATCH", "/accounts/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAccountHandler_Delete_Success(t *testing.T) {
	h, svc, _, tenant := setupAccountHandler(t)
	ctx := context.Background()

	input := service.CreateAccountInput{
		TenantID:    tenant.ID,
		Code:        "OVERTIME",
		Name:        "To Delete",
		AccountType: model.AccountTypeBonus,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/accounts/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrAccountNotFound)
}

func TestAccountHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _ := setupAccountHandler(t)

	req := httptest.NewRequest("DELETE", "/accounts/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestAccountHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _ := setupAccountHandler(t)

	req := httptest.NewRequest("DELETE", "/accounts/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAccountHandler_Delete_SystemAccount(t *testing.T) {
	h, _, repo, _ := setupAccountHandler(t)
	ctx := context.Background()

	// Create system account via repo
	sysAccount := &model.Account{
		TenantID:    nil,
		Code:        "SYS_DEL_HANDLER_" + uuid.New().String()[:8],
		Name:        "System Account",
		AccountType: model.AccountTypeTracking,
		Unit:        model.AccountUnitMinutes,
		IsSystem:    true,
	}
	require.NoError(t, repo.Create(ctx, sysAccount))

	req := httptest.NewRequest("DELETE", "/accounts/"+sysAccount.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", sysAccount.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}
