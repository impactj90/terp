package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrBatchReferenceRequired = errors.New("batch_reference is required")
	ErrTerminalIDRequired     = errors.New("terminal_id is required")
	ErrNoBookingsProvided     = errors.New("at least one booking is required")
	ErrImportBatchNotFound    = errors.New("import batch not found")
)

// --- Interfaces ---

type importBatchRepoForService interface {
	Create(ctx context.Context, batch *model.ImportBatch) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.ImportBatch, error)
	GetByReference(ctx context.Context, tenantID uuid.UUID, reference string) (*model.ImportBatch, error)
	Update(ctx context.Context, batch *model.ImportBatch) error
	List(ctx context.Context, filter repository.ImportBatchFilter) ([]model.ImportBatch, int64, error)
}

type rawTerminalBookingRepoForService interface {
	Create(ctx context.Context, booking *model.RawTerminalBooking) error
	CreateBatch(ctx context.Context, bookings []model.RawTerminalBooking) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.RawTerminalBooking, error)
	Update(ctx context.Context, booking *model.RawTerminalBooking) error
	List(ctx context.Context, filter repository.RawTerminalBookingFilter) ([]model.RawTerminalBooking, int64, error)
	CountByBatch(ctx context.Context, batchID uuid.UUID) (total, processed, failed int64, err error)
}

type employeeRepoForTerminal interface {
	GetByPIN(ctx context.Context, tenantID uuid.UUID, pin string) (*model.Employee, error)
}

type bookingTypeRepoForTerminal interface {
	GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.BookingType, error)
}

// --- Service ---

// TerminalService handles terminal integration and raw booking import logic.
type TerminalService struct {
	batchRepo       importBatchRepoForService
	rawBookingRepo  rawTerminalBookingRepoForService
	employeeRepo    employeeRepoForTerminal
	bookingTypeRepo bookingTypeRepoForTerminal
}

// NewTerminalService creates a new TerminalService.
func NewTerminalService(
	batchRepo importBatchRepoForService,
	rawBookingRepo rawTerminalBookingRepoForService,
	employeeRepo employeeRepoForTerminal,
	bookingTypeRepo bookingTypeRepoForTerminal,
) *TerminalService {
	return &TerminalService{
		batchRepo:       batchRepo,
		rawBookingRepo:  rawBookingRepo,
		employeeRepo:    employeeRepo,
		bookingTypeRepo: bookingTypeRepo,
	}
}

// --- Import Input ---

// RawBookingInput represents a single raw booking from a terminal import request.
type RawBookingInput struct {
	EmployeePIN    string    `json:"employee_pin"`
	RawTimestamp   time.Time `json:"raw_timestamp"`
	RawBookingCode string    `json:"raw_booking_code"`
}

// TriggerImportInput is the input for triggering a terminal booking import.
type TriggerImportInput struct {
	TenantID       uuid.UUID
	BatchReference string
	TerminalID     string
	Bookings       []RawBookingInput
}

// TriggerImportResult is the result of a triggered terminal import.
type TriggerImportResult struct {
	Batch        *model.ImportBatch
	WasDuplicate bool
	Message      string
}

// --- List Raw Bookings ---

// ListRawBookingsFilter defines filters for listing raw terminal bookings.
type ListRawBookingsFilter struct {
	TenantID      uuid.UUID
	From          *time.Time
	To            *time.Time
	TerminalID    *string
	EmployeeID    *uuid.UUID
	ImportBatchID *uuid.UUID
	Status        *model.RawBookingStatus
	Limit         int
	Offset        int
}

// ListRawBookings returns raw terminal bookings matching the given filter.
func (s *TerminalService) ListRawBookings(ctx context.Context, filter ListRawBookingsFilter) ([]model.RawTerminalBooking, int64, error) {
	repoFilter := repository.RawTerminalBookingFilter{
		TenantID:      filter.TenantID,
		From:          filter.From,
		To:            filter.To,
		TerminalID:    filter.TerminalID,
		EmployeeID:    filter.EmployeeID,
		ImportBatchID: filter.ImportBatchID,
		Status:        filter.Status,
		Limit:         filter.Limit,
		Offset:        filter.Offset,
	}
	return s.rawBookingRepo.List(ctx, repoFilter)
}

// --- List Import Batches ---

// ListImportBatchesFilter defines filters for listing import batches.
type ListImportBatchesFilter struct {
	TenantID   uuid.UUID
	Status     *model.ImportBatchStatus
	TerminalID *string
	Limit      int
	Offset     int
}

// ListImportBatches returns import batches matching the given filter.
func (s *TerminalService) ListImportBatches(ctx context.Context, filter ListImportBatchesFilter) ([]model.ImportBatch, int64, error) {
	repoFilter := repository.ImportBatchFilter{
		TenantID:   filter.TenantID,
		Status:     filter.Status,
		TerminalID: filter.TerminalID,
		Limit:      filter.Limit,
		Offset:     filter.Offset,
	}
	return s.batchRepo.List(ctx, repoFilter)
}

// --- Get Import Batch ---

// GetImportBatch retrieves a single import batch by ID.
func (s *TerminalService) GetImportBatch(ctx context.Context, id uuid.UUID) (*model.ImportBatch, error) {
	batch, err := s.batchRepo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrImportBatchNotFound) {
			return nil, ErrImportBatchNotFound
		}
		return nil, err
	}
	return batch, nil
}

// --- Trigger Import (Idempotent) ---

// TriggerImport processes a terminal booking import request.
// It is idempotent: if a batch with the same reference already exists, it returns the existing batch.
func (s *TerminalService) TriggerImport(ctx context.Context, input TriggerImportInput) (*TriggerImportResult, error) {
	// Validate input
	if strings.TrimSpace(input.BatchReference) == "" {
		return nil, ErrBatchReferenceRequired
	}
	if strings.TrimSpace(input.TerminalID) == "" {
		return nil, ErrTerminalIDRequired
	}
	if len(input.Bookings) == 0 {
		return nil, ErrNoBookingsProvided
	}

	// Idempotency check: look for existing batch with same reference
	existing, err := s.batchRepo.GetByReference(ctx, input.TenantID, input.BatchReference)
	if err == nil && existing != nil {
		// Batch already exists - return it without re-importing
		return &TriggerImportResult{
			Batch:        existing,
			WasDuplicate: true,
			Message:      fmt.Sprintf("Batch '%s' already imported (%d records)", input.BatchReference, existing.RecordsTotal),
		}, nil
	}
	if err != nil && !errors.Is(err, repository.ErrImportBatchNotFound) {
		return nil, fmt.Errorf("checking existing batch: %w", err)
	}

	// Create new import batch
	now := time.Now()
	terminalID := input.TerminalID
	batch := &model.ImportBatch{
		TenantID:       input.TenantID,
		BatchReference: input.BatchReference,
		Source:         "terminal",
		TerminalID:     &terminalID,
		Status:         model.ImportBatchStatusProcessing,
		RecordsTotal:   len(input.Bookings),
		StartedAt:      &now,
	}
	if err := s.batchRepo.Create(ctx, batch); err != nil {
		return nil, fmt.Errorf("creating import batch: %w", err)
	}

	// Process raw bookings
	rawBookings := make([]model.RawTerminalBooking, 0, len(input.Bookings))
	for _, b := range input.Bookings {
		booking := model.RawTerminalBooking{
			TenantID:       input.TenantID,
			ImportBatchID:  batch.ID,
			TerminalID:     input.TerminalID,
			EmployeePIN:    b.EmployeePIN,
			RawTimestamp:   b.RawTimestamp,
			RawBookingCode: b.RawBookingCode,
			BookingDate:    time.Date(b.RawTimestamp.Year(), b.RawTimestamp.Month(), b.RawTimestamp.Day(), 0, 0, 0, 0, b.RawTimestamp.Location()),
			Status:         model.RawBookingStatusPending,
		}

		// Try to resolve employee by PIN
		if s.employeeRepo != nil {
			emp, empErr := s.employeeRepo.GetByPIN(ctx, input.TenantID, b.EmployeePIN)
			if empErr == nil && emp != nil {
				booking.EmployeeID = &emp.ID
			} else {
				log.Debug().Str("pin", b.EmployeePIN).Msg("employee not found for PIN")
			}
		}

		// Try to resolve booking type by code
		if s.bookingTypeRepo != nil {
			tenantID := input.TenantID
			bt, btErr := s.bookingTypeRepo.GetByCode(ctx, &tenantID, b.RawBookingCode)
			if btErr == nil && bt != nil {
				booking.BookingTypeID = &bt.ID
			}
		}

		rawBookings = append(rawBookings, booking)
	}

	// Batch insert raw bookings
	if err := s.rawBookingRepo.CreateBatch(ctx, rawBookings); err != nil {
		// Mark batch as failed
		batch.Status = model.ImportBatchStatusFailed
		errMsg := err.Error()
		batch.ErrorMessage = &errMsg
		completedAt := time.Now()
		batch.CompletedAt = &completedAt
		_ = s.batchRepo.Update(ctx, batch)
		return nil, fmt.Errorf("inserting raw bookings: %w", err)
	}

	// Mark batch as completed
	batch.Status = model.ImportBatchStatusCompleted
	batch.RecordsImported = len(rawBookings)
	completedAt := time.Now()
	batch.CompletedAt = &completedAt
	if err := s.batchRepo.Update(ctx, batch); err != nil {
		log.Error().Err(err).Str("batch_id", batch.ID.String()).Msg("failed to update batch status")
	}

	return &TriggerImportResult{
		Batch:        batch,
		WasDuplicate: false,
		Message:      fmt.Sprintf("Successfully imported %d records from terminal '%s'", len(rawBookings), input.TerminalID),
	}, nil
}
