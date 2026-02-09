package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrTenantNotFound             = errors.New("tenant not found")
	ErrTenantSlugExists           = errors.New("tenant slug already exists")
	ErrInvalidTenantSlug          = errors.New("invalid tenant slug")
	ErrInvalidTenantName          = errors.New("invalid tenant name")
	ErrInvalidAddress             = errors.New("invalid tenant address")
	ErrInvalidTenantVacationBasis = errors.New("invalid tenant vacation basis")
)

// tenantRepository defines the interface for tenant data access.
// This interface is satisfied by repository.TenantRepository.
type tenantRepository interface {
	Create(ctx context.Context, tenant *model.Tenant) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error)
	GetBySlug(ctx context.Context, slug string) (*model.Tenant, error)
	Update(ctx context.Context, tenant *model.Tenant) error
	List(ctx context.Context, filters repository.TenantListFilters) ([]model.Tenant, error)
	Delete(ctx context.Context, id uuid.UUID) error
	Upsert(ctx context.Context, tenant *model.Tenant) error
}

// userTenantRepository defines the interface for user-tenant association data access.
type userTenantRepository interface {
	ListTenantsForUser(ctx context.Context, userID uuid.UUID) ([]model.Tenant, error)
	AddUserToTenant(ctx context.Context, userID, tenantID uuid.UUID, role string) error
}

type TenantService struct {
	tenantRepo     tenantRepository
	userTenantRepo userTenantRepository
}

func NewTenantService(tenantRepo tenantRepository, userTenantRepo userTenantRepository) *TenantService {
	return &TenantService{tenantRepo: tenantRepo, userTenantRepo: userTenantRepo}
}

type CreateTenantInput struct {
	Name                  string
	Slug                  string
	AddressStreet         string
	AddressZip            string
	AddressCity           string
	AddressCountry        string
	Phone                 *string
	Email                 *string
	PayrollExportBasePath *string
	Notes                 *string
	VacationBasis         *model.VacationBasis
}

type UpdateTenantInput struct {
	Name                  *string
	AddressStreet         *string
	AddressZip            *string
	AddressCity           *string
	AddressCountry        *string
	Phone                 *string
	Email                 *string
	PayrollExportBasePath *string
	Notes                 *string
	VacationBasis         *model.VacationBasis
	IsActive              *bool
}

// Create creates a new tenant with validation.
func (s *TenantService) Create(ctx context.Context, input CreateTenantInput) (*model.Tenant, error) {
	// Validate slug
	slug := strings.ToLower(strings.TrimSpace(input.Slug))
	if slug == "" || len(slug) < 3 {
		return nil, ErrInvalidTenantSlug
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrInvalidTenantName
	}

	addressStreet := strings.TrimSpace(input.AddressStreet)
	addressZip := strings.TrimSpace(input.AddressZip)
	addressCity := strings.TrimSpace(input.AddressCity)
	addressCountry := strings.TrimSpace(input.AddressCountry)
	if addressStreet == "" || addressZip == "" || addressCity == "" || addressCountry == "" {
		return nil, ErrInvalidAddress
	}

	// Check slug uniqueness
	existing, err := s.tenantRepo.GetBySlug(ctx, slug)
	if err == nil && existing != nil {
		return nil, ErrTenantSlugExists
	}

	var vacationBasis model.VacationBasis
	if input.VacationBasis != nil && *input.VacationBasis != "" {
		vacationBasis = *input.VacationBasis
	} else {
		vacationBasis = model.VacationBasisCalendarYear
	}
	if vacationBasis != model.VacationBasisCalendarYear && vacationBasis != model.VacationBasisEntryDate {
		return nil, ErrInvalidTenantVacationBasis
	}

	tenant := &model.Tenant{
		Name:                  name,
		Slug:                  slug,
		AddressStreet:         stringPointer(addressStreet),
		AddressZip:            stringPointer(addressZip),
		AddressCity:           stringPointer(addressCity),
		AddressCountry:        stringPointer(addressCountry),
		Phone:                 normalizeOptionalString(input.Phone),
		Email:                 normalizeOptionalString(input.Email),
		PayrollExportBasePath: normalizeOptionalString(input.PayrollExportBasePath),
		Notes:                 normalizeOptionalString(input.Notes),
		VacationBasis:         vacationBasis,
		IsActive:              true,
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

// Update applies changes to a tenant.
func (s *TenantService) Update(ctx context.Context, tenant *model.Tenant, input UpdateTenantInput) error {
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return ErrInvalidTenantName
		}
		tenant.Name = name
	}
	if input.AddressStreet != nil {
		addressStreet := strings.TrimSpace(*input.AddressStreet)
		if addressStreet == "" {
			return ErrInvalidAddress
		}
		tenant.AddressStreet = stringPointer(addressStreet)
	}
	if input.AddressZip != nil {
		addressZip := strings.TrimSpace(*input.AddressZip)
		if addressZip == "" {
			return ErrInvalidAddress
		}
		tenant.AddressZip = stringPointer(addressZip)
	}
	if input.AddressCity != nil {
		addressCity := strings.TrimSpace(*input.AddressCity)
		if addressCity == "" {
			return ErrInvalidAddress
		}
		tenant.AddressCity = stringPointer(addressCity)
	}
	if input.AddressCountry != nil {
		addressCountry := strings.TrimSpace(*input.AddressCountry)
		if addressCountry == "" {
			return ErrInvalidAddress
		}
		tenant.AddressCountry = stringPointer(addressCountry)
	}
	if input.Phone != nil {
		tenant.Phone = normalizeOptionalString(input.Phone)
	}
	if input.Email != nil {
		tenant.Email = normalizeOptionalString(input.Email)
	}
	if input.PayrollExportBasePath != nil {
		tenant.PayrollExportBasePath = normalizeOptionalString(input.PayrollExportBasePath)
	}
	if input.Notes != nil {
		tenant.Notes = normalizeOptionalString(input.Notes)
	}
	if input.VacationBasis != nil {
		if *input.VacationBasis != model.VacationBasisCalendarYear &&
			*input.VacationBasis != model.VacationBasisEntryDate {
			return ErrInvalidTenantVacationBasis
		}
		tenant.VacationBasis = *input.VacationBasis
	}
	if input.IsActive != nil {
		tenant.IsActive = *input.IsActive
	}

	return s.tenantRepo.Update(ctx, tenant)
}

// List retrieves tenants with optional filters.
func (s *TenantService) List(ctx context.Context, filters repository.TenantListFilters) ([]model.Tenant, error) {
	return s.tenantRepo.List(ctx, filters)
}

// Deactivate sets a tenant to inactive.
func (s *TenantService) Deactivate(ctx context.Context, id uuid.UUID) error {
	tenant, err := s.tenantRepo.GetByID(ctx, id)
	if err != nil {
		return ErrTenantNotFound
	}
	tenant.IsActive = false
	return s.tenantRepo.Update(ctx, tenant)
}

// UpsertDevTenant ensures a dev tenant exists in the database.
func (s *TenantService) UpsertDevTenant(ctx context.Context, id uuid.UUID, name, slug string) error {
	tenant := &model.Tenant{
		ID:             id,
		Name:           name,
		Slug:           slug,
		AddressStreet:  stringPointer("Main Street 1"),
		AddressZip:     stringPointer("00000"),
		AddressCity:    stringPointer("Dev City"),
		AddressCountry: stringPointer("DE"),
		VacationBasis:  model.VacationBasisCalendarYear,
		IsActive:       true,
	}
	return s.tenantRepo.Upsert(ctx, tenant)
}

// ListForUser returns only tenants the user has access to.
func (s *TenantService) ListForUser(ctx context.Context, userID uuid.UUID) ([]model.Tenant, error) {
	return s.userTenantRepo.ListTenantsForUser(ctx, userID)
}

// AddUserToTenant creates a user-tenant association (idempotent).
func (s *TenantService) AddUserToTenant(ctx context.Context, userID, tenantID uuid.UUID, role string) error {
	return s.userTenantRepo.AddUserToTenant(ctx, userID, tenantID, role)
}

func stringPointer(value string) *string {
	return &value
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
