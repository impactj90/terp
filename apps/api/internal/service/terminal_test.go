package service_test

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
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForTerminalService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func createTestEmployeeForTerminal(t *testing.T, db *repository.DB, tenantID uuid.UUID, pin string) *model.Employee {
	t.Helper()
	repo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "E" + uuid.New().String()[:8],
		PIN:             pin,
		FirstName:       "Terminal",
		LastName:        "Worker",
		EntryDate:       time.Now(),
		WeeklyHours:     decimal.NewFromFloat(40.0),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(context.Background(), emp))
	return emp
}

func createTestBookingTypeForTerminal(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string) *model.BookingType {
	t.Helper()
	repo := repository.NewBookingTypeRepository(db)
	bt := &model.BookingType{
		TenantID:  &tenantID,
		Code:      code,
		Name:      "Terminal Type " + code,
		Direction: model.BookingDirectionIn,
		Category:  model.BookingCategoryWork,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(context.Background(), bt))
	return bt
}

func newTerminalService(db *repository.DB) *service.TerminalService {
	batchRepo := repository.NewImportBatchRepository(db)
	rawBookingRepo := repository.NewRawTerminalBookingRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	bookingTypeRepo := repository.NewBookingTypeRepository(db)
	return service.NewTerminalService(batchRepo, rawBookingRepo, employeeRepo, bookingTypeRepo)
}

func TestTerminalService_TriggerImport_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)
	_ = createTestEmployeeForTerminal(t, db, tenant.ID, "1234")

	input := service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-" + uuid.New().String()[:8],
		TerminalID:     "T100",
		Bookings: []service.RawBookingInput{
			{
				EmployeePIN:    "1234",
				RawTimestamp:   time.Now(),
				RawBookingCode: "A1",
			},
			{
				EmployeePIN:    "9999",
				RawTimestamp:   time.Now(),
				RawBookingCode: "A2",
			},
		},
	}

	result, err := svc.TriggerImport(ctx, input)
	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.NotNil(t, result.Batch)
	assert.False(t, result.WasDuplicate)
	assert.Equal(t, string(model.ImportBatchStatusCompleted), string(result.Batch.Status))
	assert.Equal(t, 2, result.Batch.RecordsTotal)
	assert.Equal(t, 2, result.Batch.RecordsImported)
}

func TestTerminalService_TriggerImport_Idempotent(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)

	batchRef := "BATCH-IDEMPOTENT-" + uuid.New().String()[:8]
	input := service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: batchRef,
		TerminalID:     "T100",
		Bookings: []service.RawBookingInput{
			{
				EmployeePIN:    "5555",
				RawTimestamp:   time.Now(),
				RawBookingCode: "A1",
			},
		},
	}

	// First import
	result1, err := svc.TriggerImport(ctx, input)
	require.NoError(t, err)
	assert.False(t, result1.WasDuplicate)

	// Second import with same batch reference -- should be idempotent
	result2, err := svc.TriggerImport(ctx, input)
	require.NoError(t, err)
	assert.True(t, result2.WasDuplicate)
	assert.Equal(t, result1.Batch.ID, result2.Batch.ID)
}

func TestTerminalService_TriggerImport_EmptyBatchReference(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)

	input := service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "",
		TerminalID:     "T100",
		Bookings: []service.RawBookingInput{
			{EmployeePIN: "1234", RawTimestamp: time.Now(), RawBookingCode: "A1"},
		},
	}

	_, err := svc.TriggerImport(ctx, input)
	assert.ErrorIs(t, err, service.ErrBatchReferenceRequired)
}

func TestTerminalService_TriggerImport_EmptyTerminalID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)

	input := service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-" + uuid.New().String()[:8],
		TerminalID:     "",
		Bookings: []service.RawBookingInput{
			{EmployeePIN: "1234", RawTimestamp: time.Now(), RawBookingCode: "A1"},
		},
	}

	_, err := svc.TriggerImport(ctx, input)
	assert.ErrorIs(t, err, service.ErrTerminalIDRequired)
}

func TestTerminalService_TriggerImport_NoBookings(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)

	input := service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-" + uuid.New().String()[:8],
		TerminalID:     "T100",
		Bookings:       []service.RawBookingInput{},
	}

	_, err := svc.TriggerImport(ctx, input)
	assert.ErrorIs(t, err, service.ErrNoBookingsProvided)
}

func TestTerminalService_TriggerImport_ResolvesEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)
	emp := createTestEmployeeForTerminal(t, db, tenant.ID, "7777")

	input := service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-RESOLVE-" + uuid.New().String()[:8],
		TerminalID:     "T200",
		Bookings: []service.RawBookingInput{
			{
				EmployeePIN:    "7777",
				RawTimestamp:   time.Now(),
				RawBookingCode: "A1",
			},
		},
	}

	result, err := svc.TriggerImport(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, 1, result.Batch.RecordsImported)

	// Check the raw booking was linked to employee
	rawBookingRepo := repository.NewRawTerminalBookingRepository(db)
	bookings, _, err := rawBookingRepo.List(ctx, repository.RawTerminalBookingFilter{
		TenantID:      tenant.ID,
		ImportBatchID: &result.Batch.ID,
		Limit:         10,
	})
	require.NoError(t, err)
	require.Len(t, bookings, 1)
	require.NotNil(t, bookings[0].EmployeeID)
	assert.Equal(t, emp.ID, *bookings[0].EmployeeID)
}

func TestTerminalService_TriggerImport_ResolvesBookingType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)
	bt := createTestBookingTypeForTerminal(t, db, tenant.ID, "A1")

	input := service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-BTRESOLVE-" + uuid.New().String()[:8],
		TerminalID:     "T300",
		Bookings: []service.RawBookingInput{
			{
				EmployeePIN:    "8888",
				RawTimestamp:   time.Now(),
				RawBookingCode: "A1",
			},
		},
	}

	result, err := svc.TriggerImport(ctx, input)
	require.NoError(t, err)

	// Check the raw booking was linked to booking type
	rawBookingRepo := repository.NewRawTerminalBookingRepository(db)
	bookings, _, err := rawBookingRepo.List(ctx, repository.RawTerminalBookingFilter{
		TenantID:      tenant.ID,
		ImportBatchID: &result.Batch.ID,
		Limit:         10,
	})
	require.NoError(t, err)
	require.Len(t, bookings, 1)
	require.NotNil(t, bookings[0].BookingTypeID)
	assert.Equal(t, bt.ID, *bookings[0].BookingTypeID)
}

func TestTerminalService_ListRawBookings(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)

	input := service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-LIST-" + uuid.New().String()[:8],
		TerminalID:     "T400",
		Bookings: []service.RawBookingInput{
			{EmployeePIN: "1111", RawTimestamp: time.Now(), RawBookingCode: "A1"},
			{EmployeePIN: "2222", RawTimestamp: time.Now(), RawBookingCode: "A2"},
			{EmployeePIN: "3333", RawTimestamp: time.Now(), RawBookingCode: "P1"},
		},
	}
	_, err := svc.TriggerImport(ctx, input)
	require.NoError(t, err)

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	bookings, total, err := svc.ListRawBookings(ctx, service.ListRawBookingsFilter{
		TenantID: tenant.ID,
		From:     &today,
		To:       &today,
		Limit:    50,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Len(t, bookings, 3)
}

func TestTerminalService_ListRawBookings_FilterByTerminal(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)

	// Import from terminal T500
	_, err := svc.TriggerImport(ctx, service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-T500-" + uuid.New().String()[:8],
		TerminalID:     "T500",
		Bookings:       []service.RawBookingInput{{EmployeePIN: "1111", RawTimestamp: time.Now(), RawBookingCode: "A1"}},
	})
	require.NoError(t, err)

	// Import from terminal T600
	_, err = svc.TriggerImport(ctx, service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-T600-" + uuid.New().String()[:8],
		TerminalID:     "T600",
		Bookings:       []service.RawBookingInput{{EmployeePIN: "2222", RawTimestamp: time.Now(), RawBookingCode: "A1"}},
	})
	require.NoError(t, err)

	// Filter by T500 only
	terminalID := "T500"
	bookings, total, err := svc.ListRawBookings(ctx, service.ListRawBookingsFilter{
		TenantID:   tenant.ID,
		TerminalID: &terminalID,
		Limit:      50,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Len(t, bookings, 1)
}

func TestTerminalService_ListImportBatches(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)

	// Create two import batches
	_, err := svc.TriggerImport(ctx, service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-A-" + uuid.New().String()[:8],
		TerminalID:     "T700",
		Bookings:       []service.RawBookingInput{{EmployeePIN: "1111", RawTimestamp: time.Now(), RawBookingCode: "A1"}},
	})
	require.NoError(t, err)

	_, err = svc.TriggerImport(ctx, service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-B-" + uuid.New().String()[:8],
		TerminalID:     "T700",
		Bookings:       []service.RawBookingInput{{EmployeePIN: "2222", RawTimestamp: time.Now(), RawBookingCode: "A2"}},
	})
	require.NoError(t, err)

	batches, total, err := svc.ListImportBatches(ctx, service.ListImportBatchesFilter{
		TenantID: tenant.ID,
		Limit:    50,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	assert.Len(t, batches, 2)
}

func TestTerminalService_GetImportBatch_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	tenant := createTestTenantForTerminalService(t, db)

	result, err := svc.TriggerImport(ctx, service.TriggerImportInput{
		TenantID:       tenant.ID,
		BatchReference: "BATCH-GET-" + uuid.New().String()[:8],
		TerminalID:     "T800",
		Bookings:       []service.RawBookingInput{{EmployeePIN: "1111", RawTimestamp: time.Now(), RawBookingCode: "A1"}},
	})
	require.NoError(t, err)

	batch, err := svc.GetImportBatch(ctx, result.Batch.ID)
	require.NoError(t, err)
	assert.Equal(t, result.Batch.ID, batch.ID)
	assert.Equal(t, result.Batch.BatchReference, batch.BatchReference)
}

func TestTerminalService_GetImportBatch_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newTerminalService(db)
	ctx := context.Background()

	_, err := svc.GetImportBatch(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrImportBatchNotFound)
}
