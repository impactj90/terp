# TICKET-006: Register Tenant Routes

**Type**: Routes
**Effort**: XS
**Sprint**: 1 - Multi-Tenant Foundation
**Dependencies**: TICKET-005

## Description

Register tenant API routes in the router configuration.

## Files to Modify

- `apps/api/internal/handler/routes.go`

## Implementation

Add to route registration:

```go
// Tenant routes
tenantHandler := handler.NewTenantHandler(tenantService)
r.Route("/api/v1/tenants", func(r chi.Router) {
    r.Get("/", tenantHandler.List)
    r.Post("/", tenantHandler.Create)
    r.Get("/{id}", tenantHandler.Get)
    r.Put("/{id}", tenantHandler.Update)
    r.Delete("/{id}", tenantHandler.Delete)
})
```

## Wire Up Dependencies

Ensure the following are created and injected:
1. `tenantRepository := repository.NewTenantRepository(db)`
2. `tenantService := service.NewTenantService(tenantRepository)`
3. `tenantHandler := handler.NewTenantHandler(tenantService)`

## Acceptance Criteria

- [x] `make dev` starts without errors
- [ ] `curl localhost:8080/api/v1/tenants` returns 200
- [ ] All CRUD endpoints respond correctly
- [x] Routes follow RESTful conventions
