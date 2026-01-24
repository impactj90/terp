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

// --- Test Helpers ---

func createTestTenantForAbsenceDay(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestEmployeeForAbsenceDay(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
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

func createTestAbsenceTypeForAbsenceDay(t *testing.T, db *repository.DB, tenantID *uuid.UUID, code string) *model.AbsenceType {
	t.Helper()
	repo := repository.NewAbsenceTypeRepository(db)
	at := &model.AbsenceType{
		TenantID: tenantID,
		Code:     code,
		Name:     "Test " + code,
		Category: model.AbsenceCategoryVacation,
		Portion:  model.AbsencePortionFull,
		IsActive: true,
	}
	require.NoError(t, repo.Create(context.Background(), at))
	return at
}

func createTestUserForAbsenceDay(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.User {
	t.Helper()
	repo := repository.NewUserRepository(db)
	user := &model.User{
		TenantID:    &tenantID,
		Email:       uuid.New().String()[:8] + "@test.com",
		DisplayName: "Test User",
		Role:        model.RoleUser,
		IsActive:    true,
	}
	require.NoError(t, repo.Create(context.Background(), user))
	return user
}

// --- Repository Tests ---

func TestAbsenceDayRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}

	err := repo.Create(ctx, ad)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, ad.ID)
}

func TestAbsenceDayRepository_Create_HalfDay(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	period := model.HalfDayPeriodMorning
	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromFloat(0.5),
		HalfDayPeriod: &period,
		Status:        model.AbsenceStatusPending,
	}

	err := repo.Create(ctx, ad)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, ad.ID)

	// Verify half day fields stored correctly
	found, err := repo.GetByID(ctx, ad.ID)
	require.NoError(t, err)
	assert.True(t, found.Duration.Equal(decimal.NewFromFloat(0.5)))
	require.NotNil(t, found.HalfDayPeriod)
	assert.Equal(t, model.HalfDayPeriodMorning, *found.HalfDayPeriod)
}

func TestAbsenceDayRepository_CreateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	var days []model.AbsenceDay
	baseDate := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	for i := range 5 {
		days = append(days, model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: absType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		})
	}

	err := repo.CreateRange(ctx, days)
	require.NoError(t, err)

	// Verify all created
	found, err := repo.GetByEmployeeDateRange(ctx, emp.ID, baseDate, baseDate.AddDate(0, 0, 4))
	require.NoError(t, err)
	assert.Len(t, found, 5)
}

func TestAbsenceDayRepository_CreateRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	err := repo.CreateRange(ctx, []model.AbsenceDay{})
	require.NoError(t, err)
}

func TestAbsenceDayRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "K"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, ad))

	found, err := repo.GetByID(ctx, ad.ID)
	require.NoError(t, err)
	assert.Equal(t, ad.ID, found.ID)
	assert.Equal(t, model.AbsenceStatusApproved, found.Status)
	// Verify AbsenceType is preloaded
	require.NotNil(t, found.AbsenceType)
	assert.Equal(t, absType.ID, found.AbsenceType.ID)
}

func TestAbsenceDayRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAbsenceDayNotFound)
}

func TestAbsenceDayRepository_GetByEmployeeDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)
	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, ad))

	found, err := repo.GetByEmployeeDate(ctx, emp.ID, date)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, ad.ID, found.ID)
	// Verify AbsenceType is preloaded
	require.NotNil(t, found.AbsenceType)
}

func TestAbsenceDayRepository_GetByEmployeeDate_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)

	date := time.Date(2026, 3, 15, 0, 0, 0, 0, time.UTC)

	// Should return nil, nil when not found
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, date)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestAbsenceDayRepository_GetByEmployeeDate_IgnoresCancelled(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	date := time.Date(2026, 1, 25, 0, 0, 0, 0, time.UTC)

	// Create a cancelled absence
	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusCancelled,
	}
	require.NoError(t, repo.Create(ctx, ad))

	// Should not find the cancelled absence
	found, err := repo.GetByEmployeeDate(ctx, emp.ID, date)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestAbsenceDayRepository_GetByEmployeeDateRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	baseDate := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)

	// Create absences for 5 consecutive days
	for i := range 5 {
		ad := &model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: absType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		}
		require.NoError(t, repo.Create(ctx, ad))
	}

	// Query for 3 days (day 1-3)
	from := baseDate.AddDate(0, 0, 1)
	to := baseDate.AddDate(0, 0, 3)
	days, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Len(t, days, 3)

	// Verify ordering by date ASC
	assert.True(t, days[0].AbsenceDate.Before(days[1].AbsenceDate))
	assert.True(t, days[1].AbsenceDate.Before(days[2].AbsenceDate))

	// Verify AbsenceType is preloaded
	for _, d := range days {
		require.NotNil(t, d.AbsenceType)
	}
}

func TestAbsenceDayRepository_GetByEmployeeDateRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)

	from := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 4, 30, 0, 0, 0, 0, time.UTC)

	days, err := repo.GetByEmployeeDateRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
	assert.Empty(t, days)
}

func TestAbsenceDayRepository_GetByEmployeeDateRange_IncludesAllStatuses(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	baseDate := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	statuses := []model.AbsenceStatus{
		model.AbsenceStatusPending,
		model.AbsenceStatusApproved,
		model.AbsenceStatusRejected,
		model.AbsenceStatusCancelled,
	}

	for i, status := range statuses {
		ad := &model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: absType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        status,
		}
		require.NoError(t, repo.Create(ctx, ad))
	}

	days, err := repo.GetByEmployeeDateRange(ctx, emp.ID, baseDate, baseDate.AddDate(0, 0, 3))
	require.NoError(t, err)
	assert.Len(t, days, 4) // All statuses included
}

func TestAbsenceDayRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	require.NoError(t, repo.Create(ctx, ad))

	// Approve the absence using a real user
	approver := createTestUserForAbsenceDay(t, db, tenant.ID)
	now := time.Now()
	ad.Status = model.AbsenceStatusApproved
	ad.ApprovedBy = &approver.ID
	ad.ApprovedAt = &now
	err := repo.Update(ctx, ad)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, ad.ID)
	require.NoError(t, err)
	assert.Equal(t, model.AbsenceStatusApproved, found.Status)
	require.NotNil(t, found.ApprovedBy)
	assert.Equal(t, approver.ID, *found.ApprovedBy)
	require.NotNil(t, found.ApprovedAt)
}

func TestAbsenceDayRepository_Update_Rejection(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 21, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	require.NoError(t, repo.Create(ctx, ad))

	// Reject the absence
	reason := "Insufficient staff coverage"
	ad.Status = model.AbsenceStatusRejected
	ad.RejectionReason = &reason
	err := repo.Update(ctx, ad)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, ad.ID)
	require.NoError(t, err)
	assert.Equal(t, model.AbsenceStatusRejected, found.Status)
	require.NotNil(t, found.RejectionReason)
	assert.Equal(t, "Insufficient staff coverage", *found.RejectionReason)
}

func TestAbsenceDayRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	ad := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   time.Date(2026, 1, 20, 0, 0, 0, 0, time.UTC),
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	require.NoError(t, repo.Create(ctx, ad))

	err := repo.Delete(ctx, ad.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, ad.ID)
	assert.ErrorIs(t, err, repository.ErrAbsenceDayNotFound)
}

func TestAbsenceDayRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAbsenceDayNotFound)
}

func TestAbsenceDayRepository_DeleteRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	baseDate := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	// Create absences for 5 days
	for i := range 5 {
		ad := &model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: absType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		}
		require.NoError(t, repo.Create(ctx, ad))
	}

	// Delete days 1-3 (inclusive)
	from := baseDate.AddDate(0, 0, 1)
	to := baseDate.AddDate(0, 0, 3)
	err := repo.DeleteRange(ctx, emp.ID, from, to)
	require.NoError(t, err)

	// Verify only 2 remain (day 0 and day 4)
	remaining, err := repo.GetByEmployeeDateRange(ctx, emp.ID, baseDate, baseDate.AddDate(0, 0, 4))
	require.NoError(t, err)
	assert.Len(t, remaining, 2)
}

func TestAbsenceDayRepository_DeleteRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)

	// Should not error when nothing to delete
	from := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 7, 31, 0, 0, 0, 0, time.UTC)
	err := repo.DeleteRange(ctx, emp.ID, from, to)
	require.NoError(t, err)
}

func TestAbsenceDayRepository_CountByTypeInRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	vacationType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])
	illnessType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "K"+uuid.New().String()[:4])

	baseDate := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	// Create 3 approved vacation days (2 full + 1 half = 2.5)
	for i := range 2 {
		ad := &model.AbsenceDay{
			TenantID:      tenant.ID,
			EmployeeID:    emp.ID,
			AbsenceDate:   baseDate.AddDate(0, 0, i),
			AbsenceTypeID: vacationType.ID,
			Duration:      decimal.NewFromInt(1),
			Status:        model.AbsenceStatusApproved,
		}
		require.NoError(t, repo.Create(ctx, ad))
	}
	halfDay := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   baseDate.AddDate(0, 0, 2),
		AbsenceTypeID: vacationType.ID,
		Duration:      decimal.NewFromFloat(0.5),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, halfDay))

	// Create 1 pending vacation day (should NOT be counted)
	pendingDay := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   baseDate.AddDate(0, 0, 3),
		AbsenceTypeID: vacationType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	require.NoError(t, repo.Create(ctx, pendingDay))

	// Create 1 illness day (different type, should NOT be counted)
	illnessDay := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   baseDate.AddDate(0, 0, 4),
		AbsenceTypeID: illnessType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, illnessDay))

	// Count vacation days in range
	from := baseDate
	to := baseDate.AddDate(0, 0, 10)
	count, err := repo.CountByTypeInRange(ctx, emp.ID, vacationType.ID, from, to)
	require.NoError(t, err)
	assert.True(t, count.Equal(decimal.NewFromFloat(2.5)), "expected 2.5, got %s", count.String())
}

func TestAbsenceDayRepository_CountByTypeInRange_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	from := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 8, 31, 0, 0, 0, 0, time.UTC)

	count, err := repo.CountByTypeInRange(ctx, emp.ID, absType.ID, from, to)
	require.NoError(t, err)
	assert.True(t, count.Equal(decimal.Zero))
}

func TestAbsenceDayRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	date := time.Date(2026, 1, 28, 0, 0, 0, 0, time.UTC)

	// Create first non-cancelled absence
	ad1 := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	require.NoError(t, repo.Create(ctx, ad1))

	// Second non-cancelled absence on same date should fail (unique constraint)
	ad2 := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusPending,
	}
	err := repo.Create(ctx, ad2)
	assert.Error(t, err)
}

func TestAbsenceDayRepository_UniqueConstraint_CancelledAllowed(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceDayRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceDay(t, db)
	emp := createTestEmployeeForAbsenceDay(t, db, tenant.ID)
	absType := createTestAbsenceTypeForAbsenceDay(t, db, &tenant.ID, "U"+uuid.New().String()[:4])

	date := time.Date(2026, 1, 29, 0, 0, 0, 0, time.UTC)

	// Create a cancelled absence
	cancelled := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusCancelled,
	}
	require.NoError(t, repo.Create(ctx, cancelled))

	// New non-cancelled absence on same date should succeed
	active := &model.AbsenceDay{
		TenantID:      tenant.ID,
		EmployeeID:    emp.ID,
		AbsenceDate:   date,
		AbsenceTypeID: absType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
	}
	err := repo.Create(ctx, active)
	require.NoError(t, err)
}

// --- Model Unit Tests (no DB) ---

func TestAbsenceDay_IsFullDay(t *testing.T) {
	ad := &model.AbsenceDay{Duration: decimal.NewFromInt(1)}
	assert.True(t, ad.IsFullDay())

	ad.Duration = decimal.NewFromFloat(0.5)
	assert.False(t, ad.IsFullDay())
}

func TestAbsenceDay_IsHalfDay(t *testing.T) {
	ad := &model.AbsenceDay{Duration: decimal.NewFromFloat(0.5)}
	assert.True(t, ad.IsHalfDay())

	ad.Duration = decimal.NewFromInt(1)
	assert.False(t, ad.IsHalfDay())
}

func TestAbsenceDay_IsApproved(t *testing.T) {
	ad := &model.AbsenceDay{Status: model.AbsenceStatusApproved}
	assert.True(t, ad.IsApproved())

	ad.Status = model.AbsenceStatusPending
	assert.False(t, ad.IsApproved())
}

func TestAbsenceDay_IsCancelled(t *testing.T) {
	ad := &model.AbsenceDay{Status: model.AbsenceStatusCancelled}
	assert.True(t, ad.IsCancelled())

	ad.Status = model.AbsenceStatusApproved
	assert.False(t, ad.IsCancelled())
}

func TestAbsenceDay_CalculateCredit(t *testing.T) {
	tests := []struct {
		name             string
		portion          model.AbsencePortion
		duration         decimal.Decimal
		regelarbeitszeit int
		expected         int
	}{
		{"full day, full portion, 8h", model.AbsencePortionFull, decimal.NewFromInt(1), 480, 480},
		{"half day, full portion, 8h", model.AbsencePortionFull, decimal.NewFromFloat(0.5), 480, 240},
		{"full day, half portion, 8h", model.AbsencePortionHalf, decimal.NewFromInt(1), 480, 240},
		{"half day, half portion, 8h", model.AbsencePortionHalf, decimal.NewFromFloat(0.5), 480, 120},
		{"full day, no portion, 8h", model.AbsencePortionNone, decimal.NewFromInt(1), 480, 0},
		{"full day, full portion, 7.5h", model.AbsencePortionFull, decimal.NewFromInt(1), 450, 450},
		{"half day, full portion, 7.5h", model.AbsencePortionFull, decimal.NewFromFloat(0.5), 450, 225},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ad := &model.AbsenceDay{
				Duration:    tt.duration,
				AbsenceType: &model.AbsenceType{Portion: tt.portion},
			}
			assert.Equal(t, tt.expected, ad.CalculateCredit(tt.regelarbeitszeit))
		})
	}
}

func TestAbsenceDay_CalculateCredit_NilAbsenceType(t *testing.T) {
	ad := &model.AbsenceDay{
		Duration:    decimal.NewFromInt(1),
		AbsenceType: nil,
	}
	assert.Equal(t, 0, ad.CalculateCredit(480))
}
