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

func setupBookingTypeHandler(t *testing.T) (*handler.BookingTypeHandler, *service.BookingTypeService, *repository.BookingTypeRepository, *model.Tenant) {
	db := testutil.SetupTestDB(t)
	bookingTypeRepo := repository.NewBookingTypeRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewBookingTypeService(bookingTypeRepo)
	h := handler.NewBookingTypeHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	return h, svc, bookingTypeRepo, tenant
}

func withBookingTypeTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestBookingTypeHandler_Create_Success(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	body := `{"code": "CUSTOM-IN", "name": "Custom Clock In", "direction": "in"}`
	req := httptest.NewRequest("POST", "/booking-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.BookingType
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "CUSTOM-IN", result.Code)
	assert.Equal(t, "Custom Clock In", result.Name)
	assert.Equal(t, model.BookingDirectionIn, result.Direction)
}

func TestBookingTypeHandler_Create_WithDescription(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	body := `{"code": "DESC-TYPE", "name": "Type with Description", "direction": "out", "description": "A custom type"}`
	req := httptest.NewRequest("POST", "/booking-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.BookingType
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "DESC-TYPE", result.Code)
	require.NotNil(t, result.Description)
	assert.Equal(t, "A custom type", *result.Description)
}

func TestBookingTypeHandler_Create_InvalidBody(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	req := httptest.NewRequest("POST", "/booking-types", bytes.NewBufferString("invalid"))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingTypeHandler_Create_MissingCode(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	body := `{"name": "Test Type", "direction": "in"}`
	req := httptest.NewRequest("POST", "/booking-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingTypeHandler_Create_MissingDirection(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	body := `{"code": "TEST", "name": "Test Type"}`
	req := httptest.NewRequest("POST", "/booking-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingTypeHandler_Create_InvalidDirection(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	body := `{"code": "TEST", "name": "Test Type", "direction": "invalid"}`
	req := httptest.NewRequest("POST", "/booking-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingTypeHandler_Create_NoTenant(t *testing.T) {
	h, _, _, _ := setupBookingTypeHandler(t)

	body := `{"code": "TEST", "name": "Test", "direction": "in"}`
	req := httptest.NewRequest("POST", "/booking-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestBookingTypeHandler_Create_DuplicateCode(t *testing.T) {
	h, svc, _, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	// Create first booking type
	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "DUPLICATE",
		Name:      "First",
		Direction: "in",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"code": "DUPLICATE", "name": "Second", "direction": "out"}`
	req := httptest.NewRequest("POST", "/booking-types", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusConflict, rr.Code)
}

func TestBookingTypeHandler_Get_Success(t *testing.T) {
	h, svc, _, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "GET-TEST",
		Name:      "Get Test",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/booking-types/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.BookingType
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "Get Test", result.Name)
}

func TestBookingTypeHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupBookingTypeHandler(t)

	req := httptest.NewRequest("GET", "/booking-types/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingTypeHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupBookingTypeHandler(t)

	req := httptest.NewRequest("GET", "/booking-types/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestBookingTypeHandler_List_Success(t *testing.T) {
	h, svc, _, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	// Get the repository to create system types
	db := testutil.SetupTestDB(t)
	bookingTypeRepo := repository.NewBookingTypeRepository(db)

	// Create system types within the test transaction
	require.NoError(t, bookingTypeRepo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-COME", Name: "System Come", Direction: model.BookingDirectionIn, IsSystem: true, IsActive: true}))
	require.NoError(t, bookingTypeRepo.Create(ctx, &model.BookingType{TenantID: nil, Code: "SYS-GO", Name: "System Go", Direction: model.BookingDirectionOut, IsSystem: true, IsActive: true}))

	// Create test booking types
	for _, code := range []string{"TYPE-A", "TYPE-B"} {
		input := service.CreateBookingTypeInput{
			TenantID:  tenant.ID,
			Code:      code,
			Name:      "Type " + code,
			Direction: "in",
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/booking-types", nil)
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.BookingType
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	// Should include at least 2 custom types
	assert.GreaterOrEqual(t, len(result["data"]), 2)
}

func TestBookingTypeHandler_List_FilterByActive(t *testing.T) {
	h, svc, _, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	// Create active type
	_, err := svc.Create(ctx, service.CreateBookingTypeInput{TenantID: tenant.ID, Code: "ACTIVE", Name: "Active", Direction: "in"})
	require.NoError(t, err)

	// Create and deactivate another type
	created2, err := svc.Create(ctx, service.CreateBookingTypeInput{TenantID: tenant.ID, Code: "INACTIVE", Name: "Inactive", Direction: "out"})
	require.NoError(t, err)
	isActive := false
	_, err = svc.Update(ctx, created2.ID, tenant.ID, service.UpdateBookingTypeInput{IsActive: &isActive})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/booking-types?active=true", nil)
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.BookingType
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)

	// All returned types should be active
	for _, bt := range result["data"] {
		assert.True(t, bt.IsActive)
	}
}

func TestBookingTypeHandler_List_FilterByDirection(t *testing.T) {
	h, svc, _, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	_, err := svc.Create(ctx, service.CreateBookingTypeInput{TenantID: tenant.ID, Code: "IN-TYPE", Name: "In Type", Direction: "in"})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateBookingTypeInput{TenantID: tenant.ID, Code: "OUT-TYPE", Name: "Out Type", Direction: "out"})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/booking-types?direction=in", nil)
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string][]model.BookingType
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)

	// All returned types should have direction "in"
	for _, bt := range result["data"] {
		assert.Equal(t, model.BookingDirectionIn, bt.Direction)
	}
}

func TestBookingTypeHandler_List_NoTenant(t *testing.T) {
	h, _, _, _ := setupBookingTypeHandler(t)

	req := httptest.NewRequest("GET", "/booking-types", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestBookingTypeHandler_Update_Success(t *testing.T) {
	h, svc, _, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "UPDATE",
		Name:      "Original",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_active": false}`
	req := httptest.NewRequest("PATCH", "/booking-types/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.BookingType
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.False(t, result.IsActive)
}

func TestBookingTypeHandler_Update_InvalidID(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/booking-types/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingTypeHandler_Update_NotFound(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/booking-types/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestBookingTypeHandler_Update_InvalidBody(t *testing.T) {
	h, svc, _, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "UPDATE",
		Name:      "Original",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PATCH", "/booking-types/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingTypeHandler_Update_CannotModifySystemType(t *testing.T) {
	h, _, repo, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	// Create system type within the test transaction using the same repo
	systemType := &model.BookingType{
		TenantID:  nil, // System type
		Code:      "SYS-UPDATE-TEST",
		Name:      "System Update Test",
		Direction: model.BookingDirectionIn,
		IsSystem:  true,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	body := `{"name": "Modified"}`
	req := httptest.NewRequest("PATCH", "/booking-types/"+systemType.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", systemType.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestBookingTypeHandler_Delete_Success(t *testing.T) {
	h, svc, _, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "DELETE",
		Name:      "To Delete",
		Direction: "in",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/booking-types/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrBookingTypeNotFound)
}

func TestBookingTypeHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	req := httptest.NewRequest("DELETE", "/booking-types/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingTypeHandler_Delete_NotFound(t *testing.T) {
	h, _, _, tenant := setupBookingTypeHandler(t)

	req := httptest.NewRequest("DELETE", "/booking-types/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestBookingTypeHandler_Delete_CannotDeleteSystemType(t *testing.T) {
	h, _, repo, tenant := setupBookingTypeHandler(t)
	ctx := context.Background()

	// Create system type within the test transaction using the same repo
	systemType := &model.BookingType{
		TenantID:  nil, // System type
		Code:      "SYS-DELETE-TEST",
		Name:      "System Delete Test",
		Direction: model.BookingDirectionIn,
		IsSystem:  true,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	req := httptest.NewRequest("DELETE", "/booking-types/"+systemType.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", systemType.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTypeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestBookingTypeHandler_Delete_NoTenant(t *testing.T) {
	h, _, _, _ := setupBookingTypeHandler(t)

	req := httptest.NewRequest("DELETE", "/booking-types/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
