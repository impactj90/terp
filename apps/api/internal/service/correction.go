package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// Correction service errors.
var (
	ErrCorrectionNotFound    = errors.New("correction not found")
	ErrCorrectionNotPending  = errors.New("correction is not in pending status")
	ErrCorrectionIsApproved  = errors.New("cannot delete approved corrections")
)

type correctionRepo interface {
	List(ctx context.Context, filter repository.CorrectionFilter) ([]model.Correction, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error)
	Create(ctx context.Context, c *model.Correction) error
	Update(ctx context.Context, c *model.Correction) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// CorrectionService handles correction business logic.
type CorrectionService struct {
	repo correctionRepo
}

// NewCorrectionService creates a new CorrectionService.
func NewCorrectionService(repo correctionRepo) *CorrectionService {
	return &CorrectionService{repo: repo}
}

// List returns corrections matching the given filter.
func (s *CorrectionService) List(ctx context.Context, filter repository.CorrectionFilter) ([]model.Correction, error) {
	return s.repo.List(ctx, filter)
}

// GetByID returns a correction by ID.
func (s *CorrectionService) GetByID(ctx context.Context, id uuid.UUID) (*model.Correction, error) {
	c, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrCorrectionNotFound) {
			return nil, ErrCorrectionNotFound
		}
		return nil, fmt.Errorf("failed to get correction: %w", err)
	}
	return c, nil
}

// CreateCorrectionInput represents input for creating a correction.
type CreateCorrectionInput struct {
	TenantID       uuid.UUID
	EmployeeID     uuid.UUID
	CorrectionDate time.Time
	CorrectionType string
	AccountID      *uuid.UUID
	ValueMinutes   int
	Reason         string
	CreatedBy      *uuid.UUID
}

// Create creates a new correction with pending status.
func (s *CorrectionService) Create(ctx context.Context, input CreateCorrectionInput) (*model.Correction, error) {
	c := &model.Correction{
		TenantID:       input.TenantID,
		EmployeeID:     input.EmployeeID,
		CorrectionDate: input.CorrectionDate,
		CorrectionType: input.CorrectionType,
		AccountID:      input.AccountID,
		ValueMinutes:   input.ValueMinutes,
		Reason:         input.Reason,
		Status:         "pending",
		CreatedBy:      input.CreatedBy,
	}

	if err := s.repo.Create(ctx, c); err != nil {
		return nil, fmt.Errorf("failed to create correction: %w", err)
	}

	return c, nil
}

// UpdateCorrectionInput represents input for updating a correction.
type UpdateCorrectionInput struct {
	ValueMinutes *int
	Reason       *string
}

// Update updates a correction. Only pending corrections can be updated.
func (s *CorrectionService) Update(ctx context.Context, id uuid.UUID, input UpdateCorrectionInput) (*model.Correction, error) {
	c, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrCorrectionNotFound) {
			return nil, ErrCorrectionNotFound
		}
		return nil, fmt.Errorf("failed to get correction: %w", err)
	}

	if c.Status != "pending" {
		return nil, ErrCorrectionNotPending
	}

	if input.ValueMinutes != nil {
		c.ValueMinutes = *input.ValueMinutes
	}
	if input.Reason != nil {
		c.Reason = *input.Reason
	}

	if err := s.repo.Update(ctx, c); err != nil {
		return nil, fmt.Errorf("failed to update correction: %w", err)
	}

	return c, nil
}

// Delete deletes a correction. Cannot delete approved corrections.
func (s *CorrectionService) Delete(ctx context.Context, id uuid.UUID) error {
	c, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrCorrectionNotFound) {
			return ErrCorrectionNotFound
		}
		return fmt.Errorf("failed to get correction: %w", err)
	}

	if c.Status == "approved" {
		return ErrCorrectionIsApproved
	}

	if err := s.repo.Delete(ctx, id); err != nil {
		if errors.Is(err, repository.ErrCorrectionNotFound) {
			return ErrCorrectionNotFound
		}
		return fmt.Errorf("failed to delete correction: %w", err)
	}
	return nil
}

// Approve approves a pending correction.
func (s *CorrectionService) Approve(ctx context.Context, id uuid.UUID, approvedBy uuid.UUID) (*model.Correction, error) {
	c, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrCorrectionNotFound) {
			return nil, ErrCorrectionNotFound
		}
		return nil, fmt.Errorf("failed to get correction: %w", err)
	}

	if c.Status != "pending" {
		return nil, ErrCorrectionNotPending
	}

	now := time.Now()
	c.Status = "approved"
	c.ApprovedBy = &approvedBy
	c.ApprovedAt = &now

	if err := s.repo.Update(ctx, c); err != nil {
		return nil, fmt.Errorf("failed to approve correction: %w", err)
	}

	return c, nil
}

// Reject rejects a pending correction.
func (s *CorrectionService) Reject(ctx context.Context, id uuid.UUID, rejectedBy uuid.UUID) (*model.Correction, error) {
	c, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrCorrectionNotFound) {
			return nil, ErrCorrectionNotFound
		}
		return nil, fmt.Errorf("failed to get correction: %w", err)
	}

	if c.Status != "pending" {
		return nil, ErrCorrectionNotPending
	}

	now := time.Now()
	c.Status = "rejected"
	c.ApprovedBy = &rejectedBy
	c.ApprovedAt = &now

	if err := s.repo.Update(ctx, c); err != nil {
		return nil, fmt.Errorf("failed to reject correction: %w", err)
	}

	return c, nil
}
