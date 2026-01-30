package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrTripRecordNotFound        = errors.New("trip record not found")
	ErrTripRecordVehicleRequired = errors.New("trip record vehicle is required")
	ErrTripRecordDateRequired    = errors.New("trip record date is required")
)

// tripRecordRepository defines the interface for trip record data access.
type tripRecordRepository interface {
	Create(ctx context.Context, tr *model.TripRecord) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.TripRecord, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.TripRecord, error)
	ListByVehicle(ctx context.Context, tenantID uuid.UUID, vehicleID uuid.UUID) ([]model.TripRecord, error)
	Update(ctx context.Context, tr *model.TripRecord) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type TripRecordService struct {
	repo tripRecordRepository
}

func NewTripRecordService(repo tripRecordRepository) *TripRecordService {
	return &TripRecordService{repo: repo}
}

// CreateTripRecordInput represents the input for creating a trip record.
type CreateTripRecordInput struct {
	TenantID     uuid.UUID
	VehicleID    uuid.UUID
	RouteID      *uuid.UUID
	TripDate     time.Time
	StartMileage *float64
	EndMileage   *float64
	DistanceKm   *float64
	Notes        string
}

// Create creates a new trip record with validation.
func (s *TripRecordService) Create(ctx context.Context, input CreateTripRecordInput) (*model.TripRecord, error) {
	if input.VehicleID == uuid.Nil {
		return nil, ErrTripRecordVehicleRequired
	}
	if input.TripDate.IsZero() {
		return nil, ErrTripRecordDateRequired
	}

	tr := &model.TripRecord{
		TenantID:  input.TenantID,
		VehicleID: input.VehicleID,
		RouteID:   input.RouteID,
		TripDate:  input.TripDate,
		Notes:     strings.TrimSpace(input.Notes),
	}
	if input.StartMileage != nil {
		tr.StartMileage = decimal.NewFromFloat(*input.StartMileage)
	}
	if input.EndMileage != nil {
		tr.EndMileage = decimal.NewFromFloat(*input.EndMileage)
	}
	if input.DistanceKm != nil {
		tr.DistanceKm = decimal.NewFromFloat(*input.DistanceKm)
	}

	if err := s.repo.Create(ctx, tr); err != nil {
		return nil, err
	}
	return tr, nil
}

// GetByID retrieves a trip record by ID.
func (s *TripRecordService) GetByID(ctx context.Context, id uuid.UUID) (*model.TripRecord, error) {
	tr, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTripRecordNotFound
	}
	return tr, nil
}

// UpdateTripRecordInput represents the input for updating a trip record.
type UpdateTripRecordInput struct {
	RouteID      *uuid.UUID
	TripDate     *time.Time
	StartMileage *float64
	EndMileage   *float64
	DistanceKm   *float64
	Notes        *string
}

// Update updates a trip record.
func (s *TripRecordService) Update(ctx context.Context, id uuid.UUID, input UpdateTripRecordInput) (*model.TripRecord, error) {
	tr, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTripRecordNotFound
	}

	if input.RouteID != nil {
		tr.RouteID = input.RouteID
	}
	if input.TripDate != nil {
		if input.TripDate.IsZero() {
			return nil, ErrTripRecordDateRequired
		}
		tr.TripDate = *input.TripDate
	}
	if input.StartMileage != nil {
		tr.StartMileage = decimal.NewFromFloat(*input.StartMileage)
	}
	if input.EndMileage != nil {
		tr.EndMileage = decimal.NewFromFloat(*input.EndMileage)
	}
	if input.DistanceKm != nil {
		tr.DistanceKm = decimal.NewFromFloat(*input.DistanceKm)
	}
	if input.Notes != nil {
		tr.Notes = strings.TrimSpace(*input.Notes)
	}

	if err := s.repo.Update(ctx, tr); err != nil {
		return nil, err
	}
	return tr, nil
}

// Delete deletes a trip record by ID.
func (s *TripRecordService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrTripRecordNotFound
	}

	return s.repo.Delete(ctx, id)
}

// List retrieves all trip records for a tenant.
func (s *TripRecordService) List(ctx context.Context, tenantID uuid.UUID) ([]model.TripRecord, error) {
	return s.repo.List(ctx, tenantID)
}
