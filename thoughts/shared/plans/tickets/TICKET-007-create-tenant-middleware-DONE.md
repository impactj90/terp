# TICKET-007: Create Tenant Middleware

**Type**: Middleware
**Effort**: S
**Sprint**: 1 - Multi-Tenant Foundation
**Dependencies**: TICKET-004

## Description

Create middleware to extract tenant from JWT claims or header and add to request context.

## Files to Create

- `apps/api/internal/middleware/tenant.go`

## Implementation

```go
package middleware

import (
    "context"
    "net/http"

    "github.com/google/uuid"

    "terp/apps/api/internal/service"
)

type contextKey string

const TenantContextKey contextKey = "tenant_id"

type TenantMiddleware struct {
    tenantService service.TenantService
}

func NewTenantMiddleware(ts service.TenantService) *TenantMiddleware {
    return &TenantMiddleware{tenantService: ts}
}

// TenantFromContext extracts tenant ID from context
func TenantFromContext(ctx context.Context) (uuid.UUID, bool) {
    tenantID, ok := ctx.Value(TenantContextKey).(uuid.UUID)
    return tenantID, ok
}

// RequireTenant middleware extracts tenant from JWT or header
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

// OptionalTenant middleware adds tenant to context if provided, but doesn't require it
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
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] TenantFromContext helper works correctly
- [x] RequireTenant blocks requests without tenant
- [x] OptionalTenant allows requests without tenant
- [x] Inactive tenants are rejected
