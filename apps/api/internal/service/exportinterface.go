package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrExportInterfaceNotFound       = errors.New("export interface not found")
	ErrExportInterfaceNameRequired   = errors.New("export interface name is required")
	ErrExportInterfaceNumberRequired = errors.New("export interface number is required")
	ErrExportInterfaceNumberExists   = errors.New("export interface number already exists")
	ErrExportInterfaceInUse          = errors.New("export interface has generated exports")
	ErrExportInterfaceNoAccounts     = errors.New("no account IDs provided")
)

// exportInterfaceRepository defines the interface for export interface data access.
type exportInterfaceRepository interface {
	Create(ctx context.Context, ei *model.ExportInterface) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error)
	GetByNumber(ctx context.Context, tenantID uuid.UUID, number int) (*model.ExportInterface, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error)
	Update(ctx context.Context, ei *model.ExportInterface) error
	Delete(ctx context.Context, id uuid.UUID) error
	SetAccounts(ctx context.Context, interfaceID uuid.UUID, accountIDs []uuid.UUID) ([]model.ExportInterfaceAccount, error)
	ListAccounts(ctx context.Context, interfaceID uuid.UUID) ([]model.ExportInterfaceAccount, error)
	CountExportUsages(ctx context.Context, interfaceID uuid.UUID) (int64, error)
}

// CreateExportInterfaceInput represents the input for creating an export interface.
type CreateExportInterfaceInput struct {
	TenantID        uuid.UUID
	InterfaceNumber int
	Name            string
	MandantNumber   *string
	ExportScript    *string
	ExportPath      *string
	OutputFilename  *string
}

// UpdateExportInterfaceInput represents the input for updating an export interface.
type UpdateExportInterfaceInput struct {
	InterfaceNumber *int
	Name            *string
	MandantNumber   *string
	ExportScript    *string
	ExportPath      *string
	OutputFilename  *string
	IsActive        *bool
}

// ExportInterfaceService handles business logic for export interfaces.
type ExportInterfaceService struct {
	repo exportInterfaceRepository
}

// NewExportInterfaceService creates a new ExportInterfaceService.
func NewExportInterfaceService(repo exportInterfaceRepository) *ExportInterfaceService {
	return &ExportInterfaceService{repo: repo}
}

// Create creates a new export interface with validation.
func (s *ExportInterfaceService) Create(ctx context.Context, input CreateExportInterfaceInput) (*model.ExportInterface, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrExportInterfaceNameRequired
	}

	if input.InterfaceNumber <= 0 {
		return nil, ErrExportInterfaceNumberRequired
	}

	// Check uniqueness of interface_number within tenant
	existing, err := s.repo.GetByNumber(ctx, input.TenantID, input.InterfaceNumber)
	if err == nil && existing != nil {
		return nil, ErrExportInterfaceNumberExists
	}

	ei := &model.ExportInterface{
		TenantID:        input.TenantID,
		InterfaceNumber: input.InterfaceNumber,
		Name:            name,
		MandantNumber:   input.MandantNumber,
		ExportScript:    input.ExportScript,
		ExportPath:      input.ExportPath,
		OutputFilename:  input.OutputFilename,
		IsActive:        true,
	}

	if err := s.repo.Create(ctx, ei); err != nil {
		return nil, err
	}

	return ei, nil
}

// GetByID retrieves an export interface by ID.
func (s *ExportInterfaceService) GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error) {
	ei, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrExportInterfaceNotFound
	}
	return ei, nil
}

// List retrieves all export interfaces for a tenant.
func (s *ExportInterfaceService) List(ctx context.Context, tenantID uuid.UUID, activeOnly bool) ([]model.ExportInterface, error) {
	if activeOnly {
		return s.repo.ListActive(ctx, tenantID)
	}
	return s.repo.List(ctx, tenantID)
}

// Update updates an export interface.
func (s *ExportInterfaceService) Update(ctx context.Context, id uuid.UUID, input UpdateExportInterfaceInput) (*model.ExportInterface, error) {
	ei, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrExportInterfaceNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrExportInterfaceNameRequired
		}
		ei.Name = name
	}

	if input.InterfaceNumber != nil {
		if *input.InterfaceNumber <= 0 {
			return nil, ErrExportInterfaceNumberRequired
		}
		// Check uniqueness if changed
		if *input.InterfaceNumber != ei.InterfaceNumber {
			existing, checkErr := s.repo.GetByNumber(ctx, ei.TenantID, *input.InterfaceNumber)
			if checkErr == nil && existing != nil {
				return nil, ErrExportInterfaceNumberExists
			}
			ei.InterfaceNumber = *input.InterfaceNumber
		}
	}

	if input.MandantNumber != nil {
		ei.MandantNumber = input.MandantNumber
	}
	if input.ExportScript != nil {
		ei.ExportScript = input.ExportScript
	}
	if input.ExportPath != nil {
		ei.ExportPath = input.ExportPath
	}
	if input.OutputFilename != nil {
		ei.OutputFilename = input.OutputFilename
	}
	if input.IsActive != nil {
		ei.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, ei); err != nil {
		return nil, err
	}

	// Re-fetch to include accounts
	return s.repo.GetByID(ctx, id)
}

// Delete deletes an export interface.
func (s *ExportInterfaceService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrExportInterfaceNotFound
	}

	count, err := s.repo.CountExportUsages(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return ErrExportInterfaceInUse
	}

	return s.repo.Delete(ctx, id)
}

// SetAccounts sets accounts for an export interface (bulk replace).
func (s *ExportInterfaceService) SetAccounts(ctx context.Context, id uuid.UUID, accountIDs []uuid.UUID) ([]model.ExportInterfaceAccount, error) {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrExportInterfaceNotFound
	}

	return s.repo.SetAccounts(ctx, id, accountIDs)
}

// ListAccounts retrieves accounts for an export interface.
func (s *ExportInterfaceService) ListAccounts(ctx context.Context, id uuid.UUID) ([]model.ExportInterfaceAccount, error) {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrExportInterfaceNotFound
	}

	return s.repo.ListAccounts(ctx, id)
}
