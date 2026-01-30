package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrImportBatchNotFound       = errors.New("import batch not found")
	ErrRawTerminalBookingNotFound = errors.New("raw terminal booking not found")
)

// --- Import Batch Repository ---

// ImportBatchRepository provides data access for import batches.
type ImportBatchRepository struct {
	db *DB
}

// NewImportBatchRepository creates a new ImportBatchRepository.
func NewImportBatchRepository(db *DB) *ImportBatchRepository {
	return &ImportBatchRepository{db: db}
}

// ImportBatchFilter defines filtering options for listing import batches.
type ImportBatchFilter struct {
	TenantID   uuid.UUID
	Status     *model.ImportBatchStatus
	TerminalID *string
	Limit      int
	Offset     int
}

// Create inserts a new import batch record.
func (r *ImportBatchRepository) Create(ctx context.Context, batch *model.ImportBatch) error {
	return r.db.GORM.WithContext(ctx).Create(batch).Error
}

// GetByID retrieves an import batch by its ID.
func (r *ImportBatchRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ImportBatch, error) {
	var batch model.ImportBatch
	err := r.db.GORM.WithContext(ctx).Where("id = ?", id).First(&batch).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrImportBatchNotFound
		}
		return nil, err
	}
	return &batch, nil
}

// GetByReference retrieves an import batch by tenant and batch reference (for idempotency checks).
func (r *ImportBatchRepository) GetByReference(ctx context.Context, tenantID uuid.UUID, reference string) (*model.ImportBatch, error) {
	var batch model.ImportBatch
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND batch_reference = ?", tenantID, reference).
		First(&batch).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrImportBatchNotFound
		}
		return nil, err
	}
	return &batch, nil
}

// Update saves changes to an existing import batch.
func (r *ImportBatchRepository) Update(ctx context.Context, batch *model.ImportBatch) error {
	return r.db.GORM.WithContext(ctx).Save(batch).Error
}

// List returns import batches matching the given filter.
func (r *ImportBatchRepository) List(ctx context.Context, filter ImportBatchFilter) ([]model.ImportBatch, int64, error) {
	query := r.db.GORM.WithContext(ctx).Model(&model.ImportBatch{}).
		Where("tenant_id = ?", filter.TenantID)

	if filter.Status != nil {
		query = query.Where("status = ?", *filter.Status)
	}
	if filter.TerminalID != nil {
		query = query.Where("terminal_id = ?", *filter.TerminalID)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var batches []model.ImportBatch
	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		query = query.Offset(filter.Offset)
	}
	err := query.Order("created_at DESC").Find(&batches).Error
	return batches, total, err
}

// --- Raw Terminal Booking Repository ---

// RawTerminalBookingRepository provides data access for raw terminal bookings.
type RawTerminalBookingRepository struct {
	db *DB
}

// NewRawTerminalBookingRepository creates a new RawTerminalBookingRepository.
func NewRawTerminalBookingRepository(db *DB) *RawTerminalBookingRepository {
	return &RawTerminalBookingRepository{db: db}
}

// RawTerminalBookingFilter defines filtering options for listing raw terminal bookings.
type RawTerminalBookingFilter struct {
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

// Create inserts a new raw terminal booking record.
func (r *RawTerminalBookingRepository) Create(ctx context.Context, booking *model.RawTerminalBooking) error {
	return r.db.GORM.WithContext(ctx).Create(booking).Error
}

// CreateBatch inserts multiple raw terminal booking records in a single operation.
func (r *RawTerminalBookingRepository) CreateBatch(ctx context.Context, bookings []model.RawTerminalBooking) error {
	if len(bookings) == 0 {
		return nil
	}
	return r.db.GORM.WithContext(ctx).Create(&bookings).Error
}

// GetByID retrieves a raw terminal booking by its ID, preloading Employee and BookingType.
func (r *RawTerminalBookingRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.RawTerminalBooking, error) {
	var booking model.RawTerminalBooking
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("BookingType").
		Where("id = ?", id).First(&booking).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRawTerminalBookingNotFound
		}
		return nil, err
	}
	return &booking, nil
}

// Update saves changes to an existing raw terminal booking.
func (r *RawTerminalBookingRepository) Update(ctx context.Context, booking *model.RawTerminalBooking) error {
	return r.db.GORM.WithContext(ctx).Save(booking).Error
}

// List returns raw terminal bookings matching the given filter.
func (r *RawTerminalBookingRepository) List(ctx context.Context, filter RawTerminalBookingFilter) ([]model.RawTerminalBooking, int64, error) {
	query := r.db.GORM.WithContext(ctx).Model(&model.RawTerminalBooking{}).
		Where("tenant_id = ?", filter.TenantID)

	if filter.From != nil {
		query = query.Where("booking_date >= ?", *filter.From)
	}
	if filter.To != nil {
		query = query.Where("booking_date <= ?", *filter.To)
	}
	if filter.TerminalID != nil {
		query = query.Where("terminal_id = ?", *filter.TerminalID)
	}
	if filter.EmployeeID != nil {
		query = query.Where("employee_id = ?", *filter.EmployeeID)
	}
	if filter.ImportBatchID != nil {
		query = query.Where("import_batch_id = ?", *filter.ImportBatchID)
	}
	if filter.Status != nil {
		query = query.Where("status = ?", *filter.Status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var bookings []model.RawTerminalBooking
	listQuery := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", filter.TenantID).
		Preload("Employee").
		Preload("BookingType")

	// Apply same filters to list query
	if filter.From != nil {
		listQuery = listQuery.Where("booking_date >= ?", *filter.From)
	}
	if filter.To != nil {
		listQuery = listQuery.Where("booking_date <= ?", *filter.To)
	}
	if filter.TerminalID != nil {
		listQuery = listQuery.Where("terminal_id = ?", *filter.TerminalID)
	}
	if filter.EmployeeID != nil {
		listQuery = listQuery.Where("employee_id = ?", *filter.EmployeeID)
	}
	if filter.ImportBatchID != nil {
		listQuery = listQuery.Where("import_batch_id = ?", *filter.ImportBatchID)
	}
	if filter.Status != nil {
		listQuery = listQuery.Where("status = ?", *filter.Status)
	}

	if filter.Limit > 0 {
		listQuery = listQuery.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		listQuery = listQuery.Offset(filter.Offset)
	}

	err := listQuery.Order("raw_timestamp DESC").Find(&bookings).Error
	return bookings, total, err
}

// CountByBatch returns total, processed, and failed counts for a given batch.
func (r *RawTerminalBookingRepository) CountByBatch(ctx context.Context, batchID uuid.UUID) (total, processed, failed int64, err error) {
	var results []struct {
		Status model.RawBookingStatus
		Count  int64
	}
	err = r.db.GORM.WithContext(ctx).
		Model(&model.RawTerminalBooking{}).
		Select("status, count(*) as count").
		Where("import_batch_id = ?", batchID).
		Group("status").
		Scan(&results).Error
	if err != nil {
		return 0, 0, 0, err
	}

	for _, r := range results {
		total += r.Count
		switch r.Status {
		case model.RawBookingStatusProcessed:
			processed += r.Count
		case model.RawBookingStatusFailed:
			failed += r.Count
		}
	}
	return total, processed, failed, nil
}
