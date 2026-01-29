package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupTenantMiddleware(t *testing.T) (*middleware.TenantMiddleware, *service.TenantService) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTenantRepository(db)
	svc := service.NewTenantService(repo)
	mw := middleware.NewTenantMiddleware(svc)
	return mw, svc
}

func TestTenantFromContext_Found(t *testing.T) {
	tenantID := uuid.New()
	ctx := context.WithValue(context.Background(), middleware.TenantContextKey, tenantID)

	got, ok := middleware.TenantFromContext(ctx)
	require.True(t, ok)
	assert.Equal(t, tenantID, got)
}

func TestTenantFromContext_NotFound(t *testing.T) {
	ctx := context.Background()

	_, ok := middleware.TenantFromContext(ctx)
	assert.False(t, ok)
}

func TestRequireTenant_Success(t *testing.T) {
	mw, svc := setupTenantMiddleware(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Test Tenant",
		Slug:           "test-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)

	handler := mw.RequireTenant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tenantID, ok := middleware.TenantFromContext(r.Context())
		require.True(t, ok)
		assert.Equal(t, tenant.ID, tenantID)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Tenant-ID", tenant.ID.String())
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestRequireTenant_MissingHeader(t *testing.T) {
	mw, _ := setupTenantMiddleware(t)

	handler := mw.RequireTenant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "tenant ID required")
}

func TestRequireTenant_InvalidUUID(t *testing.T) {
	mw, _ := setupTenantMiddleware(t)

	handler := mw.RequireTenant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Tenant-ID", "not-a-uuid")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid tenant ID")
}

func TestRequireTenant_TenantNotFound(t *testing.T) {
	mw, _ := setupTenantMiddleware(t)

	handler := mw.RequireTenant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Tenant-ID", uuid.New().String())
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Contains(t, rr.Body.String(), "tenant not found")
}

func TestRequireTenant_InactiveTenant(t *testing.T) {
	mw, svc := setupTenantMiddleware(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Inactive Tenant",
		Slug:           "inactive-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)

	isActive := false
	err = svc.Update(ctx, tenant, service.UpdateTenantInput{IsActive: &isActive})
	require.NoError(t, err)

	handler := mw.RequireTenant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("handler should not be called")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Tenant-ID", tenant.ID.String())
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code)
	assert.Contains(t, rr.Body.String(), "tenant is inactive")
}

func TestOptionalTenant_WithValidHeader(t *testing.T) {
	mw, svc := setupTenantMiddleware(t)
	ctx := context.Background()

	tenant, err := svc.Create(ctx, service.CreateTenantInput{
		Name:           "Test Tenant",
		Slug:           "test-" + uuid.New().String()[:8],
		AddressStreet:  "Main Street 1",
		AddressZip:     "10115",
		AddressCity:    "Berlin",
		AddressCountry: "DE",
	})
	require.NoError(t, err)

	handler := mw.OptionalTenant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tenantID, ok := middleware.TenantFromContext(r.Context())
		require.True(t, ok)
		assert.Equal(t, tenant.ID, tenantID)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Tenant-ID", tenant.ID.String())
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestOptionalTenant_WithoutHeader(t *testing.T) {
	mw, _ := setupTenantMiddleware(t)

	handler := mw.OptionalTenant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, ok := middleware.TenantFromContext(r.Context())
		assert.False(t, ok)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestOptionalTenant_InvalidUUID(t *testing.T) {
	mw, _ := setupTenantMiddleware(t)

	handler := mw.OptionalTenant(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, ok := middleware.TenantFromContext(r.Context())
		assert.False(t, ok)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Tenant-ID", "not-a-uuid")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}
