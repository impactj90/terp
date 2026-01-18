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

func setupHolidayHandler(t *testing.T) (*handler.HolidayHandler, *service.HolidayService, *model.Tenant) {
	db := testutil.SetupTestDB(t)
	holidayRepo := repository.NewHolidayRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewHolidayService(holidayRepo)
	h := handler.NewHolidayHandler(svc)

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

func withTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestHolidayHandler_Create_Success(t *testing.T) {
	h, _, tenant := setupHolidayHandler(t)

	body := `{"holiday_date": "2024-01-01", "name": "New Year's Day", "is_half_day": false, "applies_to_all": true}`
	req := httptest.NewRequest("POST", "/holidays", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Holiday
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "New Year's Day", result.Name)
	assert.Equal(t, tenant.ID, result.TenantID)
	assert.False(t, result.IsHalfDay)
	assert.True(t, result.AppliesToAll)
}

func TestHolidayHandler_Create_HalfDay(t *testing.T) {
	h, _, tenant := setupHolidayHandler(t)

	body := `{"holiday_date": "2024-12-24", "name": "Christmas Eve", "is_half_day": true}`
	req := httptest.NewRequest("POST", "/holidays", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Holiday
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.True(t, result.IsHalfDay)
}

func TestHolidayHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant := setupHolidayHandler(t)

	req := httptest.NewRequest("POST", "/holidays", bytes.NewBufferString("invalid"))
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_Create_InvalidDate(t *testing.T) {
	h, _, tenant := setupHolidayHandler(t)

	body := `{"holiday_date": "not-a-date", "name": "Test"}`
	req := httptest.NewRequest("POST", "/holidays", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_Create_EmptyName(t *testing.T) {
	h, _, tenant := setupHolidayHandler(t)

	body := `{"holiday_date": "2024-01-01", "name": ""}`
	req := httptest.NewRequest("POST", "/holidays", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_Create_NoTenant(t *testing.T) {
	h, _, _ := setupHolidayHandler(t)

	body := `{"holiday_date": "2024-01-01", "name": "Test"}`
	req := httptest.NewRequest("POST", "/holidays", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestHolidayHandler_Create_DuplicateDate(t *testing.T) {
	h, svc, tenant := setupHolidayHandler(t)
	ctx := context.Background()

	// Create first holiday
	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "First",
		AppliesToAll: true,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	body := `{"holiday_date": "2024-01-01", "name": "Second"}`
	req := httptest.NewRequest("POST", "/holidays", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_Get_Success(t *testing.T) {
	h, svc, tenant := setupHolidayHandler(t)
	ctx := context.Background()

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Test Holiday",
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/holidays/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Holiday
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "Test Holiday", result.Name)
}

func TestHolidayHandler_Get_InvalidID(t *testing.T) {
	h, _, _ := setupHolidayHandler(t)

	req := httptest.NewRequest("GET", "/holidays/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_Get_NotFound(t *testing.T) {
	h, _, _ := setupHolidayHandler(t)

	req := httptest.NewRequest("GET", "/holidays/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHolidayHandler_List_ByYear(t *testing.T) {
	h, svc, tenant := setupHolidayHandler(t)
	ctx := context.Background()

	// Create holidays in 2024
	for i, date := range []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 7, 4, 0, 0, 0, 0, time.UTC),
	} {
		input := service.CreateHolidayInput{
			TenantID:     tenant.ID,
			HolidayDate:  date,
			Name:         "Holiday " + string(rune('A'+i)),
			AppliesToAll: true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/holidays?year=2024", nil)
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.Holiday
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result, 2)
}

func TestHolidayHandler_List_ByDateRange(t *testing.T) {
	h, svc, tenant := setupHolidayHandler(t)
	ctx := context.Background()

	// Create holidays
	dates := []time.Time{
		time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC),
		time.Date(2024, 7, 4, 0, 0, 0, 0, time.UTC),
	}
	for i, date := range dates {
		input := service.CreateHolidayInput{
			TenantID:     tenant.ID,
			HolidayDate:  date,
			Name:         "Holiday " + string(rune('A'+i)),
			AppliesToAll: true,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/holidays?from=2024-01-01&to=2024-03-31", nil)
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.Holiday
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result, 2)
}

func TestHolidayHandler_List_InvalidYear(t *testing.T) {
	h, _, tenant := setupHolidayHandler(t)

	req := httptest.NewRequest("GET", "/holidays?year=invalid", nil)
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_List_InvalidDateRange(t *testing.T) {
	h, _, tenant := setupHolidayHandler(t)

	req := httptest.NewRequest("GET", "/holidays?from=invalid&to=2024-03-31", nil)
	req = withTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_List_NoTenant(t *testing.T) {
	h, _, _ := setupHolidayHandler(t)

	req := httptest.NewRequest("GET", "/holidays", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestHolidayHandler_Update_Success(t *testing.T) {
	h, svc, tenant := setupHolidayHandler(t)
	ctx := context.Background()

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Original",
		IsHalfDay:    false,
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"name": "Updated", "is_half_day": true}`
	req := httptest.NewRequest("PATCH", "/holidays/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Holiday
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
	assert.True(t, result.IsHalfDay)
}

func TestHolidayHandler_Update_InvalidID(t *testing.T) {
	h, _, _ := setupHolidayHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/holidays/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_Update_NotFound(t *testing.T) {
	h, _, _ := setupHolidayHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/holidays/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestHolidayHandler_Update_InvalidBody(t *testing.T) {
	h, svc, tenant := setupHolidayHandler(t)
	ctx := context.Background()

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "Original",
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("PATCH", "/holidays/"+created.ID.String(), bytes.NewBufferString("invalid"))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_Delete_Success(t *testing.T) {
	h, svc, tenant := setupHolidayHandler(t)
	ctx := context.Background()

	input := service.CreateHolidayInput{
		TenantID:     tenant.ID,
		HolidayDate:  time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC),
		Name:         "To Delete",
		AppliesToAll: true,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/holidays/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deleted
	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrHolidayNotFound)
}

func TestHolidayHandler_Delete_InvalidID(t *testing.T) {
	h, _, _ := setupHolidayHandler(t)

	req := httptest.NewRequest("DELETE", "/holidays/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestHolidayHandler_Delete_NotFound(t *testing.T) {
	h, _, _ := setupHolidayHandler(t)

	req := httptest.NewRequest("DELETE", "/holidays/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
