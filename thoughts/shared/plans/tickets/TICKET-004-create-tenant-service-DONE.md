# TICKET-004: Create Tenant Service

**Type**: Service
**Effort**: S
**Sprint**: 1 - Multi-Tenant Foundation
**Dependencies**: TICKET-003

## Description

Create the Tenant service with business logic for tenant management.

## Files to Create

- `apps/api/internal/service/tenant.go`

## Implementation

```go
package service

import (
    "context"
    "errors"
    "strings"

    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

var (
    ErrTenantNotFound     = errors.New("tenant not found")
    ErrTenantSlugExists   = errors.New("tenant slug already exists")
    ErrInvalidTenantSlug  = errors.New("invalid tenant slug")
)

type TenantService interface {
    Create(ctx context.Context, name, slug string) (*model.Tenant, error)
    GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error)
    GetBySlug(ctx context.Context, slug string) (*model.Tenant, error)
    Update(ctx context.Context, tenant *model.Tenant) error
    List(ctx context.Context, activeOnly bool) ([]model.Tenant, error)
    Delete(ctx context.Context, id uuid.UUID) error
}

type tenantService struct {
    repo repository.TenantRepository
}

func NewTenantService(repo repository.TenantRepository) TenantService {
    return &tenantService{repo: repo}
}

func (s *tenantService) Create(ctx context.Context, name, slug string) (*model.Tenant, error) {
    // Validate slug
    slug = strings.ToLower(strings.TrimSpace(slug))
    if slug == "" || len(slug) < 3 {
        return nil, ErrInvalidTenantSlug
    }

    // Check slug uniqueness
    existing, err := s.repo.GetBySlug(ctx, slug)
    if err == nil && existing != nil {
        return nil, ErrTenantSlugExists
    }

    tenant := &model.Tenant{
        Name:     strings.TrimSpace(name),
        Slug:     slug,
        IsActive: true,
    }

    if err := s.repo.Create(ctx, tenant); err != nil {
        return nil, err
    }

    return tenant, nil
}

func (s *tenantService) GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error) {
    tenant, err := s.repo.GetByID(ctx, id)
    if err != nil {
        return nil, ErrTenantNotFound
    }
    return tenant, nil
}

func (s *tenantService) GetBySlug(ctx context.Context, slug string) (*model.Tenant, error) {
    tenant, err := s.repo.GetBySlug(ctx, slug)
    if err != nil {
        return nil, ErrTenantNotFound
    }
    return tenant, nil
}

func (s *tenantService) Update(ctx context.Context, tenant *model.Tenant) error {
    return s.repo.Update(ctx, tenant)
}

func (s *tenantService) List(ctx context.Context, activeOnly bool) ([]model.Tenant, error) {
    return s.repo.List(ctx, activeOnly)
}

func (s *tenantService) Delete(ctx context.Context, id uuid.UUID) error {
    return s.repo.Delete(ctx, id)
}
```

## Unit Tests

**File**: `apps/api/internal/service/tenant_test.go`

```go
package service

import (
    "context"
    "testing"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
)

// MockTenantRepository is a mock implementation
type MockTenantRepository struct {
    mock.Mock
}

func (m *MockTenantRepository) Create(ctx context.Context, tenant *model.Tenant) error {
    args := m.Called(ctx, tenant)
    tenant.ID = uuid.New()
    return args.Error(0)
}

func (m *MockTenantRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Tenant), args.Error(1)
}

func (m *MockTenantRepository) GetBySlug(ctx context.Context, slug string) (*model.Tenant, error) {
    args := m.Called(ctx, slug)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.Tenant), args.Error(1)
}

func (m *MockTenantRepository) Update(ctx context.Context, tenant *model.Tenant) error {
    args := m.Called(ctx, tenant)
    return args.Error(0)
}

func (m *MockTenantRepository) List(ctx context.Context, activeOnly bool) ([]model.Tenant, error) {
    args := m.Called(ctx, activeOnly)
    return args.Get(0).([]model.Tenant), args.Error(1)
}

func (m *MockTenantRepository) Delete(ctx context.Context, id uuid.UUID) error {
    args := m.Called(ctx, id)
    return args.Error(0)
}

func TestTenantService_Create_Success(t *testing.T) {
    mockRepo := new(MockTenantRepository)
    svc := NewTenantService(mockRepo)
    ctx := context.Background()

    mockRepo.On("GetBySlug", ctx, "test-tenant").Return(nil, ErrTenantNotFound)
    mockRepo.On("Create", ctx, mock.AnythingOfType("*model.Tenant")).Return(nil)

    tenant, err := svc.Create(ctx, "Test Tenant", "test-tenant")
    require.NoError(t, err)
    assert.Equal(t, "Test Tenant", tenant.Name)
    assert.Equal(t, "test-tenant", tenant.Slug)
    assert.True(t, tenant.IsActive)
}

func TestTenantService_Create_SlugExists(t *testing.T) {
    mockRepo := new(MockTenantRepository)
    svc := NewTenantService(mockRepo)
    ctx := context.Background()

    existing := &model.Tenant{ID: uuid.New(), Slug: "existing"}
    mockRepo.On("GetBySlug", ctx, "existing").Return(existing, nil)

    _, err := svc.Create(ctx, "New Tenant", "existing")
    assert.Equal(t, ErrTenantSlugExists, err)
}

func TestTenantService_Create_InvalidSlug(t *testing.T) {
    mockRepo := new(MockTenantRepository)
    svc := NewTenantService(mockRepo)
    ctx := context.Background()

    // Empty slug
    _, err := svc.Create(ctx, "Test", "")
    assert.Equal(t, ErrInvalidTenantSlug, err)

    // Too short
    _, err = svc.Create(ctx, "Test", "ab")
    assert.Equal(t, ErrInvalidTenantSlug, err)
}

func TestTenantService_GetByID_Success(t *testing.T) {
    mockRepo := new(MockTenantRepository)
    svc := NewTenantService(mockRepo)
    ctx := context.Background()

    id := uuid.New()
    expected := &model.Tenant{ID: id, Name: "Test"}
    mockRepo.On("GetByID", ctx, id).Return(expected, nil)

    tenant, err := svc.GetByID(ctx, id)
    require.NoError(t, err)
    assert.Equal(t, expected.ID, tenant.ID)
}

func TestTenantService_GetByID_NotFound(t *testing.T) {
    mockRepo := new(MockTenantRepository)
    svc := NewTenantService(mockRepo)
    ctx := context.Background()

    id := uuid.New()
    mockRepo.On("GetByID", ctx, id).Return(nil, gorm.ErrRecordNotFound)

    _, err := svc.GetByID(ctx, id)
    assert.Equal(t, ErrTenantNotFound, err)
}

func TestTenantService_List(t *testing.T) {
    mockRepo := new(MockTenantRepository)
    svc := NewTenantService(mockRepo)
    ctx := context.Background()

    tenants := []model.Tenant{{Name: "A"}, {Name: "B"}}
    mockRepo.On("List", ctx, true).Return(tenants, nil)

    result, err := svc.List(ctx, true)
    require.NoError(t, err)
    assert.Len(t, result, 2)
}
```

## Acceptance Criteria

- [x] `make test` passes
- [x] `make lint` passes
- [x] Slug validation implemented
- [x] Slug uniqueness check implemented
- [x] Proper error types defined
- [x] Unit tests with mocked repository
- [x] Tests cover validation logic and error cases
