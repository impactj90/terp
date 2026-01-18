package middleware

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

type contextKey string

const TenantContextKey contextKey = "tenant_id"

// TenantService defines the interface for tenant operations needed by middleware.
type TenantService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error)
}

type TenantMiddleware struct {
	tenantService TenantService
}

func NewTenantMiddleware(ts TenantService) *TenantMiddleware {
	return &TenantMiddleware{tenantService: ts}
}

// TenantFromContext extracts tenant ID from context.
func TenantFromContext(ctx context.Context) (uuid.UUID, bool) {
	tenantID, ok := ctx.Value(TenantContextKey).(uuid.UUID)
	return tenantID, ok
}

// RequireTenant middleware extracts tenant from JWT or header.
func (m *TenantMiddleware) RequireTenant(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tenantID uuid.UUID
		var err error

		// Try to get from X-Tenant-ID header first
		tenantIDStr := r.Header.Get("X-Tenant-ID")
		if tenantIDStr != "" {
			tenantID, err = uuid.Parse(tenantIDStr)
			if err != nil {
				http.Error(w, "invalid tenant ID", http.StatusBadRequest)
				return
			}
		} else {
			// TODO: Extract from JWT claims when auth is implemented
			// claims := auth.ClaimsFromContext(r.Context())
			// tenantID = claims.TenantID
			http.Error(w, "tenant ID required", http.StatusBadRequest)
			return
		}

		// Verify tenant exists and is active
		tenant, err := m.tenantService.GetByID(r.Context(), tenantID)
		if err != nil {
			http.Error(w, "tenant not found", http.StatusUnauthorized)
			return
		}
		if !tenant.IsActive {
			http.Error(w, "tenant is inactive", http.StatusForbidden)
			return
		}

		// Add tenant ID to context
		ctx := context.WithValue(r.Context(), TenantContextKey, tenantID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// OptionalTenant middleware adds tenant to context if provided, but doesn't require it.
func (m *TenantMiddleware) OptionalTenant(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tenantIDStr := r.Header.Get("X-Tenant-ID")
		if tenantIDStr != "" {
			tenantID, err := uuid.Parse(tenantIDStr)
			if err == nil {
				ctx := context.WithValue(r.Context(), TenantContextKey, tenantID)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}
