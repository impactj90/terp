package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrBookingReasonNotFound         = errors.New("booking reason not found")
	ErrBookingReasonCodeReq          = errors.New("booking reason code is required")
	ErrBookingReasonLabelReq         = errors.New("booking reason label is required")
	ErrBookingReasonCodeExists       = errors.New("booking reason code already exists for this booking type")
	ErrBookingReasonTypeIDReq        = errors.New("booking type ID is required")
	ErrBookingReasonInvalidRefTime   = errors.New("invalid reference_time: must be plan_start, plan_end, or booking_time")
	ErrBookingReasonOffsetWithoutRef = errors.New("offset_minutes requires reference_time to be set")
	ErrBookingReasonRefWithoutOffset = errors.New("reference_time requires offset_minutes to be set")
)

// bookingReasonRepository defines the interface for booking reason data access.
type bookingReasonRepository interface {
	Create(ctx context.Context, br *model.BookingReason) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.BookingReason, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID, code string) (*model.BookingReason, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingReason, error)
	ListByBookingType(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID) ([]model.BookingReason, error)
	Update(ctx context.Context, br *model.BookingReason) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type BookingReasonService struct {
	repo bookingReasonRepository
}

func NewBookingReasonService(repo bookingReasonRepository) *BookingReasonService {
	return &BookingReasonService{repo: repo}
}

// CreateBookingReasonInput represents the input for creating a booking reason.
type CreateBookingReasonInput struct {
	TenantID                uuid.UUID
	BookingTypeID           uuid.UUID
	Code                    string
	Label                   string
	SortOrder               *int
	ReferenceTime           *string
	OffsetMinutes           *int
	AdjustmentBookingTypeID *uuid.UUID
}

// Create creates a new booking reason with validation.
func (s *BookingReasonService) Create(ctx context.Context, input CreateBookingReasonInput) (*model.BookingReason, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrBookingReasonCodeReq
	}
	label := strings.TrimSpace(input.Label)
	if label == "" {
		return nil, ErrBookingReasonLabelReq
	}
	if input.BookingTypeID == uuid.Nil {
		return nil, ErrBookingReasonTypeIDReq
	}

	// Check uniqueness within tenant + booking type
	existing, err := s.repo.GetByCode(ctx, input.TenantID, input.BookingTypeID, code)
	if err == nil && existing != nil {
		return nil, ErrBookingReasonCodeExists
	}

	// Validate adjustment config consistency
	if err := validateAdjustmentConfig(input.ReferenceTime, input.OffsetMinutes); err != nil {
		return nil, err
	}

	br := &model.BookingReason{
		TenantID:                input.TenantID,
		BookingTypeID:           input.BookingTypeID,
		Code:                    code,
		Label:                   label,
		IsActive:                true,
		ReferenceTime:           input.ReferenceTime,
		OffsetMinutes:           input.OffsetMinutes,
		AdjustmentBookingTypeID: input.AdjustmentBookingTypeID,
	}
	if input.SortOrder != nil {
		br.SortOrder = *input.SortOrder
	}

	if err := s.repo.Create(ctx, br); err != nil {
		return nil, err
	}
	return br, nil
}

// GetByID retrieves a booking reason by ID.
func (s *BookingReasonService) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingReason, error) {
	br, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingReasonNotFound
	}
	return br, nil
}

// UpdateBookingReasonInput represents the input for updating a booking reason.
type UpdateBookingReasonInput struct {
	Label                   *string
	IsActive                *bool
	SortOrder               *int
	ReferenceTime           *string
	OffsetMinutes           *int
	AdjustmentBookingTypeID *uuid.UUID
	// ClearAdjustment signals that adjustment config should be removed entirely.
	ClearAdjustment bool
}

// Update updates a booking reason.
func (s *BookingReasonService) Update(ctx context.Context, id uuid.UUID, input UpdateBookingReasonInput) (*model.BookingReason, error) {
	br, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingReasonNotFound
	}

	if input.Label != nil {
		label := strings.TrimSpace(*input.Label)
		if label == "" {
			return nil, ErrBookingReasonLabelReq
		}
		br.Label = label
	}
	if input.IsActive != nil {
		br.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		br.SortOrder = *input.SortOrder
	}

	// Handle adjustment config updates
	if input.ClearAdjustment {
		br.ReferenceTime = nil
		br.OffsetMinutes = nil
		br.AdjustmentBookingTypeID = nil
	} else {
		if input.ReferenceTime != nil {
			br.ReferenceTime = input.ReferenceTime
		}
		if input.OffsetMinutes != nil {
			br.OffsetMinutes = input.OffsetMinutes
		}
		if input.AdjustmentBookingTypeID != nil {
			br.AdjustmentBookingTypeID = input.AdjustmentBookingTypeID
		}
		// Validate final state consistency
		if err := validateAdjustmentConfig(br.ReferenceTime, br.OffsetMinutes); err != nil {
			return nil, err
		}
	}

	if err := s.repo.Update(ctx, br); err != nil {
		return nil, err
	}
	return br, nil
}

// Delete deletes a booking reason by ID.
func (s *BookingReasonService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrBookingReasonNotFound
	}
	return s.repo.Delete(ctx, id)
}

// List retrieves all booking reasons for a tenant.
func (s *BookingReasonService) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingReason, error) {
	return s.repo.List(ctx, tenantID)
}

// ListByBookingType retrieves booking reasons for a specific booking type.
func (s *BookingReasonService) ListByBookingType(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID) ([]model.BookingReason, error) {
	return s.repo.ListByBookingType(ctx, tenantID, bookingTypeID)
}

// validateAdjustmentConfig checks that reference_time and offset_minutes are consistent.
// Both must be set together, or both must be nil.
func validateAdjustmentConfig(referenceTime *string, offsetMinutes *int) error {
	if referenceTime != nil && offsetMinutes == nil {
		return ErrBookingReasonRefWithoutOffset
	}
	if offsetMinutes != nil && referenceTime == nil {
		return ErrBookingReasonOffsetWithoutRef
	}
	if referenceTime != nil {
		switch *referenceTime {
		case model.ReferenceTimePlanStart, model.ReferenceTimePlanEnd, model.ReferenceTimeBookingTime:
			// valid
		default:
			return ErrBookingReasonInvalidRefTime
		}
	}
	return nil
}
