package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrTenantNotFound    = errors.New("tenant not found")
	ErrTenantSlugExists  = errors.New("tenant slug already exists")
	ErrInvalidTenantSlug = errors.New("invalid tenant slug")
)

// tenantRepository defines the interface for tenant data access.
// This interface is satisfied by repository.TenantRepository.
type tenantRepository interface {
	Create(ctx context.Context, tenant *model.Tenant) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error)
	GetBySlug(ctx context.Context, slug string) (*model.Tenant, error)
	Update(ctx context.Context, tenant *model.Tenant) error
	List(ctx context.Context, activeOnly bool) ([]model.Tenant, error)
	Delete(ctx context.Context, id uuid.UUID) error
	Upsert(ctx context.Context, tenant *model.Tenant) error
}

type TenantService struct {
	tenantRepo tenantRepository
}

func NewTenantService(tenantRepo tenantRepository) *TenantService {
	return &TenantService{tenantRepo: tenantRepo}
}

// Create creates a new tenant with validation.
func (s *TenantService) Create(ctx context.Context, name, slug string) (*model.Tenant, error) {
	// Validate slug
	slug = strings.ToLower(strings.TrimSpace(slug))
	if slug == "" || len(slug) < 3 {
		return nil, ErrInvalidTenantSlug
	}

	// Check slug uniqueness
	existing, err := s.tenantRepo.GetBySlug(ctx, slug)
	if err == nil && existing != nil {
		return nil, ErrTenantSlugExists
	}

	tenant := &model.Tenant{
		Name:     strings.TrimSpace(name),
		Slug:     slug,
		IsActive: true,
	}

	if err := s.tenantRepo.Create(ctx, tenant); err != nil {
		return nil, err
	}

	return tenant, nil
}

// GetByID retrieves a tenant by ID.
func (s *TenantService) GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error) {
	tenant, err := s.tenantRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTenantNotFound
	}
	return tenant, nil
}

// GetBySlug retrieves a tenant by slug.
func (s *TenantService) GetBySlug(ctx context.Context, slug string) (*model.Tenant, error) {
	tenant, err := s.tenantRepo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, ErrTenantNotFound
	}
	return tenant, nil
}

// Update updates a tenant.
func (s *TenantService) Update(ctx context.Context, tenant *model.Tenant) error {
	return s.tenantRepo.Update(ctx, tenant)
}

// List retrieves tenants with optional active-only filtering.
func (s *TenantService) List(ctx context.Context, activeOnly bool) ([]model.Tenant, error) {
	return s.tenantRepo.List(ctx, activeOnly)
}

// Delete deletes a tenant by ID.
func (s *TenantService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.tenantRepo.Delete(ctx, id)
}

// UpsertDevTenant ensures a dev tenant exists in the database.
func (s *TenantService) UpsertDevTenant(ctx context.Context, id uuid.UUID, name, slug string) error {
	tenant := &model.Tenant{
		ID:       id,
		Name:     name,
		Slug:     slug,
		IsActive: true,
	}
	return s.tenantRepo.Upsert(ctx, tenant)
}
