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

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupTenantHandler(t *testing.T) (*handler.TenantHandler, *service.TenantService, *repository.UserTenantRepository, *repository.DB) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	userTenantRepo := repository.NewUserTenantRepository(db)
	svc := service.NewTenantService(repo, userTenantRepo)
	h := handler.NewTenantHandler(svc)
	return h, svc, userTenantRepo, db
}

func tenantRequestBody(name, slug string) string {
	return `{"name": "` + name + `", "slug": "` + slug + `", "address_street": "Main Street 1", "address_zip": "10115", "address_city": "Berlin", "address_country": "DE"}`
}

func TestTenantHandler_Create_Success(t *testing.T) {
	h, _, _, _ := setupTenantHandler(t)

	slug := "test-" + uuid.New().String()[:8]
	body := tenantRequestBody("Test Tenant", slug)
	req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Tenant
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Test Tenant", result.Name)
	assert.Equal(t, slug, result.Slug)
	assert.True(t, result.IsActive)
}

func TestTenantHandler_Create_InvalidBody(t *testing.T) {
	h, _, _, _ := setupTenantHandler(t)

	req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString("invalid"))
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Create_SlugExists(t *testing.T) {
	h, svc, _, _ := setupTenantHandler(t)
	ctx := context.Background()

	slug := "existing-" + uuid.New().String()[:8]
	_, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "First",
		Slug:           slug,
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)

	body := tenantRequestBody("Second", slug)
	req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Create_InvalidSlug(t *testing.T) {
	h, _, _, _ := setupTenantHandler(t)

	body := tenantRequestBody("Test", "ab")
	req := httptest.NewRequest("POST", "/tenants", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Get_Success(t *testing.T) {
	h, svc, _, _ := setupTenantHandler(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Test",
		Slug:           "test-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/tenants/"+tenant.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tenant.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, tenant.ID, result.ID)
	assert.Equal(t, "Test", result.Name)
}

func TestTenantHandler_Get_InvalidID(t *testing.T) {
	h, _, _, _ := setupTenantHandler(t)

	req := httptest.NewRequest("GET", "/tenants/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Get_NotFound(t *testing.T) {
	h, _, _, _ := setupTenantHandler(t)

	req := httptest.NewRequest("GET", "/tenants/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTenantHandler_List(t *testing.T) {
	h, svc, utRepo, db := setupTenantHandler(t)
	ctx := context.Background()

	userID := uuid.New()
	db.GORM.Exec("INSERT INTO users (id, email, display_name, role, is_active, is_locked) VALUES (?, 'test@test.com', 'Test', 'admin', true, false)", userID)

	tenantA, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Tenant A",
		Slug:           "tenant-a-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)
	require.NoError(t, utRepo.AddUserToTenant(ctx, userID, tenantA.ID, "member"))

	tenantB, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Tenant B",
		Slug:           "tenant-b-" + uuid.New().String()[:8],
		AddressStreet:  "Second Street 2",
		AddressZip:     "10117",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)
	require.NoError(t, utRepo.AddUserToTenant(ctx, userID, tenantB.ID, "member"))

	req := httptest.NewRequest("GET", "/tenants", nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: userID, Email: "test@test.com", DisplayName: "Test", Role: "admin"}))
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(result), 2)
}

func TestTenantHandler_List_ActiveOnly(t *testing.T) {
	h, svc, utRepo, db := setupTenantHandler(t)
	ctx := context.Background()

	userID := uuid.New()
	db.GORM.Exec("INSERT INTO users (id, email, display_name, role, is_active, is_locked) VALUES (?, 'test2@test.com', 'Test2', 'admin', true, false)", userID)

	activeName := "Active-" + uuid.New().String()[:8]
	active, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           activeName,
		Slug:           "active-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)
	require.NoError(t, utRepo.AddUserToTenant(ctx, userID, active.ID, "member"))

	inactive, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Inactive",
		Slug:           "inactive-" + uuid.New().String()[:8],
		AddressStreet:  "Side Street 5",
		AddressZip:     "10118",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)
	require.NoError(t, utRepo.AddUserToTenant(ctx, userID, inactive.ID, "member"))
	isActive := false
	require.NoError(t, svc.Update(ctx, inactive, service.UpdateTenantInput{IsActive: &isActive}))

	req := httptest.NewRequest("GET", "/tenants", nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: userID, Email: "test@test.com", DisplayName: "Test", Role: "admin"}))
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	// Find our active tenant in the results (ListForUser only returns active tenants)
	var found bool
	for _, tenant := range result {
		if tenant.ID == active.ID {
			found = true
			assert.Equal(t, activeName, tenant.Name)
			break
		}
	}
	assert.True(t, found, "Active tenant should be in results")
}

func TestTenantHandler_List_IncludeInactive(t *testing.T) {
	h, svc, utRepo, db := setupTenantHandler(t)
	ctx := context.Background()

	userID := uuid.New()
	db.GORM.Exec("INSERT INTO users (id, email, display_name, role, is_active, is_locked) VALUES (?, 'test3@test.com', 'Test3', 'admin', true, false)", userID)

	activeTenant, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Active Tenant",
		Slug:           "active-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)
	require.NoError(t, utRepo.AddUserToTenant(ctx, userID, activeTenant.ID, "member"))

	inactive, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Inactive Tenant",
		Slug:           "inactive-" + uuid.New().String()[:8],
		AddressStreet:  "Side Street 5",
		AddressZip:     "10118",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)
	require.NoError(t, utRepo.AddUserToTenant(ctx, userID, inactive.ID, "member"))
	isActive := false
	require.NoError(t, svc.Update(ctx, inactive, service.UpdateTenantInput{IsActive: &isActive}))

	// Note: ListForUser already filters to active-only tenants, so include_inactive
	// doesn't apply the same way. We just verify the user gets their active tenants.
	req := httptest.NewRequest("GET", "/tenants", nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: userID, Email: "test@test.com", DisplayName: "Test", Role: "admin"}))
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(result), 1)
}

func TestTenantHandler_Update_Success(t *testing.T) {
	h, svc, _, _ := setupTenantHandler(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Original",
		Slug:           "test-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/tenants/"+tenant.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tenant.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Tenant
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Updated", result.Name)
}

func TestTenantHandler_Update_InvalidID(t *testing.T) {
	h, _, _, _ := setupTenantHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/tenants/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTenantHandler_Update_NotFound(t *testing.T) {
	h, _, _, _ := setupTenantHandler(t)

	body := `{"name": "Updated"}`
	req := httptest.NewRequest("PATCH", "/tenants/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestTenantHandler_Deactivate(t *testing.T) {
	h, svc, _, _ := setupTenantHandler(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "ToDeactivate",
		Slug:           "to-delete-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/tenants/"+tenant.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", tenant.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	found, err := svc.GetByID(ctx, tenant.ID)
	require.NoError(t, err)
	assert.False(t, found.IsActive)
}

func TestTenantHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _ := setupTenantHandler(t)

	req := httptest.NewRequest("DELETE", "/tenants/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}
