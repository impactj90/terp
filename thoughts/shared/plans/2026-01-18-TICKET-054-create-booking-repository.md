# Create Booking Repository Implementation Plan

## Overview

Implement the Booking repository at `apps/api/internal/repository/booking.go` following the existing codebase patterns. The repository provides CRUD operations, date-based queries, pairing functionality, and bulk updates for the Booking model.

## Current State Analysis

- **Model**: `apps/api/internal/model/booking.go` - Booking model exists with all fields (ID, TenantID, EmployeeID, BookingDate, BookingTypeID, OriginalTime, EditedTime, CalculatedTime, PairID, Source, etc.)
- **Migration**: `db/migrations/000022_create_bookings.up.sql` - Table exists with all indexes
- **Repository Pattern**: 14 existing repositories use concrete structs (no interfaces), `*DB` wrapper, and standard CRUD patterns

### Key Discoveries:
- Codebase uses `*DB` wrapper struct, not raw `*gorm.DB` (`apps/api/internal/repository/db.go:15-19`)
- Error variables pattern: `var ErrXxxNotFound = errors.New("xxx not found")` (`apps/api/internal/repository/employee.go:15-19`)
- Filter structs for list operations with TenantID, optional filters, and pagination (`apps/api/internal/repository/employee.go:22-29`)
- Transaction support via `db.GORM.WithContext(ctx).Transaction(fn)` for bulk operations

## Desired End State

A fully functional `BookingRepository` with:
1. Standard CRUD operations (Create, GetByID, Update, Delete)
2. List with filtering (tenant, employee, date range, booking direction)
3. Employee-date lookup for finding all bookings on a specific date
4. Unpaired bookings query (for matching come/go pairs)
5. Pairing functionality (link two bookings together)
6. Bulk update of calculated times (transactional)
7. Comprehensive test coverage

### Verification:
- All tests pass: `cd apps/api && go test -v ./internal/repository/... -run TestBooking`
- Linting passes: `make lint`

## What We're NOT Doing

- Service layer (TICKET-055)
- Handler layer (TICKET-056)
- OpenAPI spec updates (separate ticket)
- Integration with terminal/API booking sources

## Implementation Approach

Follow the established repository pattern from `employee.go` and `dayplan.go`:
1. Define error variables for domain errors
2. Define filter struct for list queries
3. Implement concrete struct with `*DB` field
4. Implement all methods with context propagation

## Phase 1: Core Repository Implementation

### Overview
Create the booking repository with all required methods.

### Changes Required:

#### 1. Create Repository File
**File**: `apps/api/internal/repository/booking.go`
**Changes**: Create new file with complete repository implementation

```go
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrBookingNotFound = errors.New("booking not found")
)

// BookingFilter defines filter criteria for listing bookings.
type BookingFilter struct {
	TenantID    uuid.UUID
	EmployeeID  *uuid.UUID
	StartDate   *time.Time
	EndDate     *time.Time
	Direction   *model.BookingDirection // filter by booking type direction
	Source      *model.BookingSource
	HasPair     *bool // nil = all, true = only paired, false = only unpaired
	Offset      int
	Limit       int
}

// BookingRepository handles booking data access.
type BookingRepository struct {
	db *DB
}

// NewBookingRepository creates a new booking repository.
func NewBookingRepository(db *DB) *BookingRepository {
	return &BookingRepository{db: db}
}

// Create creates a new booking.
func (r *BookingRepository) Create(ctx context.Context, booking *model.Booking) error {
	return r.db.GORM.WithContext(ctx).Create(booking).Error
}

// GetByID retrieves a booking by ID.
func (r *BookingRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Booking, error) {
	var booking model.Booking
	err := r.db.GORM.WithContext(ctx).
		First(&booking, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking: %w", err)
	}
	return &booking, nil
}

// GetWithDetails retrieves a booking with related data preloaded.
func (r *BookingRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Booking, error) {
	var booking model.Booking
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Preload("BookingType").
		Preload("Pair").
		Where("id = ?", id).
		First(&booking).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking with details: %w", err)
	}
	return &booking, nil
}

// Update updates a booking.
func (r *BookingRepository) Update(ctx context.Context, booking *model.Booking) error {
	return r.db.GORM.WithContext(ctx).Save(booking).Error
}

// Delete deletes a booking by ID.
func (r *BookingRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Booking{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete booking: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingNotFound
	}
	return nil
}

// List retrieves bookings with filtering and pagination.
func (r *BookingRepository) List(ctx context.Context, filter BookingFilter) ([]model.Booking, int64, error) {
	var bookings []model.Booking
	var total int64

	query := r.db.GORM.WithContext(ctx).Model(&model.Booking{}).Where("tenant_id = ?", filter.TenantID)

	if filter.EmployeeID != nil {
		query = query.Where("employee_id = ?", *filter.EmployeeID)
	}
	if filter.StartDate != nil {
		query = query.Where("booking_date >= ?", *filter.StartDate)
	}
	if filter.EndDate != nil {
		query = query.Where("booking_date <= ?", *filter.EndDate)
	}
	if filter.Direction != nil {
		query = query.Joins("JOIN booking_types ON booking_types.id = bookings.booking_type_id").
			Where("booking_types.direction = ?", *filter.Direction)
	}
	if filter.Source != nil {
		query = query.Where("source = ?", *filter.Source)
	}
	if filter.HasPair != nil {
		if *filter.HasPair {
			query = query.Where("pair_id IS NOT NULL")
		} else {
			query = query.Where("pair_id IS NULL")
		}
	}

	// Count total
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count bookings: %w", err)
	}

	// Apply pagination
	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		query = query.Offset(filter.Offset)
	}

	err := query.Order("booking_date DESC, edited_time DESC").Find(&bookings).Error
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list bookings: %w", err)
	}
	return bookings, total, nil
}

// GetByEmployeeAndDate retrieves all bookings for an employee on a specific date.
func (r *BookingRepository) GetByEmployeeAndDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error) {
	var bookings []model.Booking
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND employee_id = ? AND booking_date = ?", tenantID, employeeID, date).
		Preload("BookingType").
		Order("edited_time ASC").
		Find(&bookings).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get bookings by employee and date: %w", err)
	}
	return bookings, nil
}

// GetByDateRange retrieves all bookings within a date range for a tenant.
func (r *BookingRepository) GetByDateRange(ctx context.Context, tenantID uuid.UUID, startDate, endDate time.Time) ([]model.Booking, error) {
	var bookings []model.Booking
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND booking_date >= ? AND booking_date <= ?", tenantID, startDate, endDate).
		Order("employee_id ASC, booking_date ASC, edited_time ASC").
		Find(&bookings).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get bookings by date range: %w", err)
	}
	return bookings, nil
}

// GetUnpaired retrieves unpaired bookings of a specific direction for an employee on a date.
func (r *BookingRepository) GetUnpaired(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, direction model.BookingDirection) ([]model.Booking, error) {
	var bookings []model.Booking
	err := r.db.GORM.WithContext(ctx).
		Joins("JOIN booking_types ON booking_types.id = bookings.booking_type_id").
		Where("bookings.tenant_id = ? AND bookings.employee_id = ? AND bookings.booking_date = ?", tenantID, employeeID, date).
		Where("booking_types.direction = ?", direction).
		Where("bookings.pair_id IS NULL").
		Order("bookings.edited_time ASC").
		Find(&bookings).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get unpaired bookings: %w", err)
	}
	return bookings, nil
}

// SetPair links two bookings as a pair.
func (r *BookingRepository) SetPair(ctx context.Context, bookingID1, bookingID2 uuid.UUID) error {
	pairID := uuid.New()
	return r.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Update first booking
		result := tx.Model(&model.Booking{}).Where("id = ?", bookingID1).Update("pair_id", pairID)
		if result.Error != nil {
			return fmt.Errorf("failed to update first booking pair: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrBookingNotFound
		}

		// Update second booking
		result = tx.Model(&model.Booking{}).Where("id = ?", bookingID2).Update("pair_id", pairID)
		if result.Error != nil {
			return fmt.Errorf("failed to update second booking pair: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrBookingNotFound
		}

		return nil
	})
}

// ClearPair removes the pair link from bookings sharing the same pair_id.
func (r *BookingRepository) ClearPair(ctx context.Context, pairID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.Booking{}).
		Where("pair_id = ?", pairID).
		Update("pair_id", nil)

	if result.Error != nil {
		return fmt.Errorf("failed to clear pair: %w", result.Error)
	}
	return nil
}

// UpdateCalculatedTimes bulk updates calculated_time for multiple bookings within a transaction.
func (r *BookingRepository) UpdateCalculatedTimes(ctx context.Context, updates map[uuid.UUID]int) error {
	if len(updates) == 0 {
		return nil
	}

	return r.db.GORM.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for bookingID, calculatedTime := range updates {
			result := tx.Model(&model.Booking{}).
				Where("id = ?", bookingID).
				Update("calculated_time", calculatedTime)

			if result.Error != nil {
				return fmt.Errorf("failed to update calculated time for booking %s: %w", bookingID, result.Error)
			}
			if result.RowsAffected == 0 {
				return fmt.Errorf("booking %s: %w", bookingID, ErrBookingNotFound)
			}
		}
		return nil
	})
}

// ClearCalculatedTime removes calculated_time for a booking.
func (r *BookingRepository) ClearCalculatedTime(ctx context.Context, bookingID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.Booking{}).
		Where("id = ?", bookingID).
		Update("calculated_time", nil)

	if result.Error != nil {
		return fmt.Errorf("failed to clear calculated time: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingNotFound
	}
	return nil
}
```

### Success Criteria:

#### Automated Verification:
- [x] File compiles: `cd apps/api && go build ./...`
- [x] Linting passes: `make lint`

---

## Phase 2: Test Implementation

### Overview
Create comprehensive tests for all repository methods following existing test patterns.

### Changes Required:

#### 1. Create Test File
**File**: `apps/api/internal/repository/booking_test.go`
**Changes**: Create new test file with comprehensive test coverage

```go
package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForBooking creates a tenant for use in booking tests.
func createTestTenantForBooking(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

// createTestEmployee creates an employee for booking tests.
func createTestEmployee(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	repo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "E" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:4],
		FirstName:       "Test",
		LastName:        "Employee",
		EntryDate:       time.Now(),
		WeeklyHours:     decimal.NewFromFloat(40.0),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(context.Background(), emp))
	return emp
}

// createTestBookingType creates a booking type for tests.
func createTestBookingType(t *testing.T, db *repository.DB, tenantID *uuid.UUID, direction model.BookingDirection) *model.BookingType {
	t.Helper()
	repo := repository.NewBookingTypeRepository(db)
	bt := &model.BookingType{
		TenantID:  tenantID,
		Code:      "T" + uuid.New().String()[:6],
		Name:      "Test Type",
		Direction: direction,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(context.Background(), bt))
	return bt
}

func TestBookingRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480, // 08:00
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}

	err := repo.Create(ctx, booking)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, booking.ID)
}

func TestBookingRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	found, err := repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Equal(t, booking.ID, found.ID)
	assert.Equal(t, 480, found.OriginalTime)
}

func TestBookingRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_GetWithDetails(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	found, err := repo.GetWithDetails(ctx, booking.ID)
	require.NoError(t, err)
	assert.NotNil(t, found.Employee)
	assert.NotNil(t, found.BookingType)
	assert.Equal(t, emp.ID, found.Employee.ID)
	assert.Equal(t, bt.ID, found.BookingType.ID)
}

func TestBookingRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	booking.EditedTime = 490 // Edit to 08:10
	booking.Notes = "Updated"
	err := repo.Update(ctx, booking)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Equal(t, 490, found.EditedTime)
	assert.Equal(t, "Updated", found.Notes)
}

func TestBookingRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   time.Now().Truncate(24 * time.Hour),
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	err := repo.Delete(ctx, booking.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, booking.ID)
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	for i := range 3 {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   today,
			BookingTypeID: bt.ID,
			OriginalTime:  480 + i*60,
			EditedTime:    480 + i*60,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	filter := repository.BookingFilter{
		TenantID: tenant.ID,
		Limit:    10,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Len(t, bookings, 3)
}

func TestBookingRepository_List_FilterByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp1 := createTestEmployee(t, db, tenant.ID)
	emp2 := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	for _, empID := range []uuid.UUID{emp1.ID, emp1.ID, emp2.ID} {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    empID,
			BookingDate:   today,
			BookingTypeID: bt.ID,
			OriginalTime:  480,
			EditedTime:    480,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	filter := repository.BookingFilter{
		TenantID:   tenant.ID,
		EmployeeID: &emp1.ID,
		Limit:      10,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, bookings, 2)
}

func TestBookingRepository_List_FilterByDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	yesterday := today.AddDate(0, 0, -1)
	tomorrow := today.AddDate(0, 0, 1)

	for _, date := range []time.Time{yesterday, today, tomorrow} {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   date,
			BookingTypeID: bt.ID,
			OriginalTime:  480,
			EditedTime:    480,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	filter := repository.BookingFilter{
		TenantID:  tenant.ID,
		StartDate: &yesterday,
		EndDate:   &today,
		Limit:     10,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, bookings, 2)
}

func TestBookingRepository_List_FilterByPairStatus(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	btIn := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)
	btOut := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionOut)

	today := time.Now().Truncate(24 * time.Hour)

	// Create unpaired booking
	unpairedBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, unpairedBooking))

	// Create paired bookings
	pairedIn := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  540,
		EditedTime:    540,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, pairedIn))

	pairedOut := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btOut.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, pairedOut))

	require.NoError(t, repo.SetPair(ctx, pairedIn.ID, pairedOut.ID))

	// Filter unpaired only
	hasPair := false
	filter := repository.BookingFilter{
		TenantID: tenant.ID,
		HasPair:  &hasPair,
		Limit:    10,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Len(t, bookings, 1)

	// Filter paired only
	hasPair = true
	filter.HasPair = &hasPair
	bookings, total, err = repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, bookings, 2)
}

func TestBookingRepository_List_WithPagination(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	for i := range 5 {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   today,
			BookingTypeID: bt.ID,
			OriginalTime:  480 + i*60,
			EditedTime:    480 + i*60,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	filter := repository.BookingFilter{
		TenantID: tenant.ID,
		Limit:    2,
		Offset:   0,
	}
	bookings, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, bookings, 2)

	// Second page
	filter.Offset = 2
	bookings, total, err = repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, bookings, 2)
}

func TestBookingRepository_GetByEmployeeAndDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	yesterday := today.AddDate(0, 0, -1)

	// Create bookings for today
	for i := range 2 {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   today,
			BookingTypeID: bt.ID,
			OriginalTime:  480 + i*60,
			EditedTime:    480 + i*60,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	// Create booking for yesterday
	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   yesterday,
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	bookings, err := repo.GetByEmployeeAndDate(ctx, tenant.ID, emp.ID, today)
	require.NoError(t, err)
	assert.Len(t, bookings, 2)
	// Verify ordering by time
	assert.True(t, bookings[0].EditedTime < bookings[1].EditedTime)
}

func TestBookingRepository_GetByDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)
	for i := range 5 {
		booking := &model.Booking{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			BookingDate:   today.AddDate(0, 0, i-2), // -2 to +2 days
			BookingTypeID: bt.ID,
			OriginalTime:  480,
			EditedTime:    480,
			Source:        model.BookingSourceWeb,
		}
		require.NoError(t, repo.Create(ctx, booking))
	}

	startDate := today.AddDate(0, 0, -1)
	endDate := today.AddDate(0, 0, 1)
	bookings, err := repo.GetByDateRange(ctx, tenant.ID, startDate, endDate)
	require.NoError(t, err)
	assert.Len(t, bookings, 3)
}

func TestBookingRepository_GetUnpaired(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	btIn := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)
	btOut := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionOut)

	today := time.Now().Truncate(24 * time.Hour)

	// Create unpaired in booking
	unpairedIn := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, unpairedIn))

	// Create paired bookings
	pairedIn := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  540,
		EditedTime:    540,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, pairedIn))

	pairedOut := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btOut.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, pairedOut))

	require.NoError(t, repo.SetPair(ctx, pairedIn.ID, pairedOut.ID))

	// Get unpaired "in" bookings
	bookings, err := repo.GetUnpaired(ctx, tenant.ID, emp.ID, today, model.BookingDirectionIn)
	require.NoError(t, err)
	assert.Len(t, bookings, 1)
	assert.Equal(t, unpairedIn.ID, bookings[0].ID)

	// Get unpaired "out" bookings - should be empty
	bookings, err = repo.GetUnpaired(ctx, tenant.ID, emp.ID, today, model.BookingDirectionOut)
	require.NoError(t, err)
	assert.Empty(t, bookings)
}

func TestBookingRepository_SetPair(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	btIn := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)
	btOut := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionOut)

	today := time.Now().Truncate(24 * time.Hour)

	comeBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, comeBooking))

	goBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btOut.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, goBooking))

	err := repo.SetPair(ctx, comeBooking.ID, goBooking.ID)
	require.NoError(t, err)

	// Verify both have same pair_id
	come, err := repo.GetByID(ctx, comeBooking.ID)
	require.NoError(t, err)
	go_, err := repo.GetByID(ctx, goBooking.ID)
	require.NoError(t, err)

	assert.NotNil(t, come.PairID)
	assert.NotNil(t, go_.PairID)
	assert.Equal(t, *come.PairID, *go_.PairID)
}

func TestBookingRepository_SetPair_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	err := repo.SetPair(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_ClearPair(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	btIn := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)
	btOut := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionOut)

	today := time.Now().Truncate(24 * time.Hour)

	comeBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btIn.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, comeBooking))

	goBooking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: btOut.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, goBooking))

	require.NoError(t, repo.SetPair(ctx, comeBooking.ID, goBooking.ID))

	// Get pair ID
	come, err := repo.GetByID(ctx, comeBooking.ID)
	require.NoError(t, err)
	pairID := *come.PairID

	// Clear pair
	err = repo.ClearPair(ctx, pairID)
	require.NoError(t, err)

	// Verify both are now unpaired
	come, err = repo.GetByID(ctx, comeBooking.ID)
	require.NoError(t, err)
	go_, err := repo.GetByID(ctx, goBooking.ID)
	require.NoError(t, err)

	assert.Nil(t, come.PairID)
	assert.Nil(t, go_.PairID)
}

func TestBookingRepository_UpdateCalculatedTimes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)

	booking1 := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking1))

	booking2 := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: bt.ID,
		OriginalTime:  1020,
		EditedTime:    1020,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking2))

	updates := map[uuid.UUID]int{
		booking1.ID: 485, // Rounded to 08:05
		booking2.ID: 1015, // Rounded to 16:55
	}

	err := repo.UpdateCalculatedTimes(ctx, updates)
	require.NoError(t, err)

	// Verify updates
	b1, err := repo.GetByID(ctx, booking1.ID)
	require.NoError(t, err)
	assert.NotNil(t, b1.CalculatedTime)
	assert.Equal(t, 485, *b1.CalculatedTime)

	b2, err := repo.GetByID(ctx, booking2.ID)
	require.NoError(t, err)
	assert.NotNil(t, b2.CalculatedTime)
	assert.Equal(t, 1015, *b2.CalculatedTime)
}

func TestBookingRepository_UpdateCalculatedTimes_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	// Should not error with empty map
	err := repo.UpdateCalculatedTimes(ctx, map[uuid.UUID]int{})
	require.NoError(t, err)
}

func TestBookingRepository_UpdateCalculatedTimes_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	updates := map[uuid.UUID]int{
		uuid.New(): 480,
	}

	err := repo.UpdateCalculatedTimes(ctx, updates)
	assert.ErrorContains(t, err, "not found")
}

func TestBookingRepository_ClearCalculatedTime(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	// Set calculated time
	updates := map[uuid.UUID]int{booking.ID: 485}
	require.NoError(t, repo.UpdateCalculatedTimes(ctx, updates))

	// Verify it's set
	b, err := repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.NotNil(t, b.CalculatedTime)

	// Clear it
	err = repo.ClearCalculatedTime(ctx, booking.ID)
	require.NoError(t, err)

	// Verify it's cleared
	b, err = repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Nil(t, b.CalculatedTime)
}

func TestBookingRepository_ClearCalculatedTime_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	err := repo.ClearCalculatedTime(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrBookingNotFound)
}

func TestBookingRepository_EffectiveTime(t *testing.T) {
	// Test the model's EffectiveTime method through repository
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForBooking(t, db)
	emp := createTestEmployee(t, db, tenant.ID)
	bt := createTestBookingType(t, db, &tenant.ID, model.BookingDirectionIn)

	today := time.Now().Truncate(24 * time.Hour)

	booking := &model.Booking{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		BookingDate:   today,
		BookingTypeID: bt.ID,
		OriginalTime:  480,
		EditedTime:    485,
		Source:        model.BookingSourceWeb,
	}
	require.NoError(t, repo.Create(ctx, booking))

	// Without calculated time, should return edited time
	b, err := repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Equal(t, 485, b.EffectiveTime())

	// Set calculated time
	updates := map[uuid.UUID]int{booking.ID: 490}
	require.NoError(t, repo.UpdateCalculatedTimes(ctx, updates))

	// With calculated time, should return calculated time
	b, err = repo.GetByID(ctx, booking.ID)
	require.NoError(t, err)
	assert.Equal(t, 490, b.EffectiveTime())
}
```

### Success Criteria:

#### Automated Verification:
- [x] All tests pass: `cd apps/api && go test -v ./internal/repository/... -run TestBooking`
- [x] No race conditions: `cd apps/api && go test -race ./internal/repository/... -run TestBooking`
- [x] Linting passes: `make lint`

---

## Testing Strategy

### Unit Tests:
All methods have dedicated test cases covering:
- Happy path
- Not found scenarios
- Edge cases (empty inputs, pagination)

### Key Test Scenarios:
1. **CRUD Operations**: Create, GetByID, GetWithDetails, Update, Delete
2. **List Filtering**: By tenant, employee, date range, direction, pair status, with pagination
3. **Date Queries**: GetByEmployeeAndDate, GetByDateRange
4. **Pairing**: GetUnpaired, SetPair, ClearPair
5. **Calculated Times**: UpdateCalculatedTimes (bulk), ClearCalculatedTime
6. **Model Methods**: EffectiveTime integration test

### Manual Testing Steps:
1. Run tests with database: `make dev && cd apps/api && go test -v ./internal/repository/... -run TestBooking`
2. Verify no test pollution between runs

## References

- Research document: `thoughts/shared/research/2026-01-18-TICKET-054-create-booking-repository.md`
- Reference implementation: `apps/api/internal/repository/employee.go`
- Model: `apps/api/internal/model/booking.go`
- Test patterns: `apps/api/internal/repository/employee_test.go`
