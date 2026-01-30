package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// --- Mock DailyValue Repository ---

type mockDailyValueRepoForEval struct {
	values []model.DailyValue
	err    error
}

func (m *mockDailyValueRepoForEval) ListAll(_ context.Context, _ uuid.UUID, _ model.DailyValueListOptions) ([]model.DailyValue, error) {
	return m.values, m.err
}

// --- Mock Booking Repository ---

type mockBookingRepoForEval struct {
	bookings []model.Booking
	total    int64
	err      error
}

func (m *mockBookingRepoForEval) List(_ context.Context, _ repository.BookingFilter) ([]model.Booking, int64, error) {
	return m.bookings, m.total, m.err
}

// --- Mock AuditLog Repository ---

type mockAuditLogRepoForEval struct {
	logs  []model.AuditLog
	total int64
	err   error
}

func (m *mockAuditLogRepoForEval) List(_ context.Context, _ repository.AuditLogFilter) ([]model.AuditLog, int64, error) {
	return m.logs, m.total, m.err
}

// Helper to build the evaluation service using real repository types.
// Since the EvaluationService takes concrete repo types, we test via integration or use
// the actual service methods with real data. For unit tests, we test the mapper functions.

func TestMapDailyValueToEval(t *testing.T) {
	dvID := uuid.New()
	empID := uuid.New()
	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	firstCome := 480 // 08:00
	lastGo := 1020   // 17:00

	dv := &model.DailyValue{
		ID:           dvID,
		EmployeeID:   empID,
		ValueDate:    date,
		Status:       model.DailyValueStatusCalculated,
		TargetTime:   480,
		GrossTime:    540,
		NetTime:      510,
		BreakTime:    30,
		Overtime:     30,
		Undertime:    0,
		BookingCount: 4,
		HasError:     false,
		FirstCome:    &firstCome,
		LastGo:       &lastGo,
		Employee: &model.Employee{
			ID:              empID,
			PersonnelNumber: "E001",
			FirstName:       "John",
			LastName:        "Doe",
			IsActive:        true,
		},
	}

	result := mapDailyValueToEval(dv)

	assert.Equal(t, dvID.String(), result.ID.String())
	assert.Equal(t, empID.String(), result.EmployeeID.String())
	assert.Equal(t, "calculated", result.Status)
	assert.Equal(t, int64(480), result.TargetMinutes)
	assert.Equal(t, int64(540), result.GrossMinutes)
	assert.Equal(t, int64(510), result.NetMinutes)
	assert.Equal(t, int64(30), result.BreakMinutes)
	assert.Equal(t, int64(30), result.OvertimeMinutes)
	assert.Equal(t, int64(0), result.UndertimeMinutes)
	assert.Equal(t, int64(30), result.BalanceMinutes) // 30 - 0 = 30
	assert.Equal(t, int64(4), result.BookingCount)
	assert.False(t, result.HasErrors)
	require.NotNil(t, result.FirstCome)
	assert.Equal(t, "08:00", *result.FirstCome)
	require.NotNil(t, result.LastGo)
	assert.Equal(t, "17:00", *result.LastGo)
	require.NotNil(t, result.Employee)
	assert.Equal(t, "John", *result.Employee.FirstName)
	assert.Equal(t, "Doe", *result.Employee.LastName)
}

func TestMapDailyValueToEval_NoEmployee(t *testing.T) {
	dvID := uuid.New()
	empID := uuid.New()
	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	dv := &model.DailyValue{
		ID:         dvID,
		EmployeeID: empID,
		ValueDate:  date,
		Status:     model.DailyValueStatusPending,
	}

	result := mapDailyValueToEval(dv)

	assert.Equal(t, dvID.String(), result.ID.String())
	assert.Nil(t, result.Employee)
	assert.Nil(t, result.FirstCome)
	assert.Nil(t, result.LastGo)
}

func TestMapBookingToEval(t *testing.T) {
	bookingID := uuid.New()
	empID := uuid.New()
	btID := uuid.New()
	pairID := uuid.New()
	termID := uuid.New()
	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	calcTime := 481

	b := &model.Booking{
		ID:             bookingID,
		EmployeeID:     empID,
		BookingDate:    date,
		BookingTypeID:  btID,
		OriginalTime:   480,
		EditedTime:     481,
		CalculatedTime: &calcTime,
		Source:         model.BookingSourceTerminal,
		PairID:         &pairID,
		TerminalID:     &termID,
		Notes:          "test note",
		CreatedAt:      date,
		Employee: &model.Employee{
			ID:              empID,
			PersonnelNumber: "E001",
			FirstName:       "John",
			LastName:        "Doe",
			IsActive:        true,
		},
		BookingType: &model.BookingType{
			ID:        btID,
			Code:      "K",
			Name:      "Kommen",
			Direction: model.BookingDirectionIn,
		},
	}

	result := mapBookingToEval(b)

	assert.Equal(t, bookingID.String(), result.ID.String())
	assert.Equal(t, empID.String(), result.EmployeeID.String())
	assert.Equal(t, btID.String(), result.BookingTypeID.String())
	assert.Equal(t, int64(480), result.OriginalTime)
	assert.Equal(t, int64(481), *result.EditedTime)
	assert.Equal(t, "08:01", result.TimeString)
	assert.Equal(t, "terminal", result.Source)
	require.NotNil(t, result.CalculatedTime)
	assert.Equal(t, int64(481), *result.CalculatedTime)
	require.NotNil(t, result.PairID)
	assert.Equal(t, pairID.String(), result.PairID.String())
	require.NotNil(t, result.TerminalID)
	assert.Equal(t, termID.String(), result.TerminalID.String())
	require.NotNil(t, result.Notes)
	assert.Equal(t, "test note", *result.Notes)
	require.NotNil(t, result.Employee)
	assert.Equal(t, "John", *result.Employee.FirstName)
	require.NotNil(t, result.BookingType)
	assert.Equal(t, "K", *result.BookingType.Code)
	assert.Equal(t, "in", *result.BookingType.Direction)
}

func TestMapBookingToEval_NilOptionalFields(t *testing.T) {
	bookingID := uuid.New()
	empID := uuid.New()
	btID := uuid.New()
	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	b := &model.Booking{
		ID:            bookingID,
		EmployeeID:    empID,
		BookingDate:   date,
		BookingTypeID: btID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
		CreatedAt:     date,
	}

	result := mapBookingToEval(b)

	assert.Nil(t, result.CalculatedTime)
	assert.Nil(t, result.PairID)
	assert.Nil(t, result.TerminalID)
	assert.Nil(t, result.Notes)
	assert.Nil(t, result.Employee)
	assert.Nil(t, result.BookingType)
}

func TestMapTerminalBookingToEval(t *testing.T) {
	bookingID := uuid.New()
	empID := uuid.New()
	btID := uuid.New()
	termID := uuid.New()
	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	b := &model.Booking{
		ID:            bookingID,
		EmployeeID:    empID,
		BookingDate:   date,
		BookingTypeID: btID,
		OriginalTime:  480,
		EditedTime:    485,
		Source:        model.BookingSourceTerminal,
		TerminalID:    &termID,
		CreatedAt:     date,
		Employee: &model.Employee{
			ID:              empID,
			PersonnelNumber: "E001",
			FirstName:       "John",
			LastName:        "Doe",
			IsActive:        true,
		},
		BookingType: &model.BookingType{
			ID:        btID,
			Code:      "K",
			Name:      "Kommen",
			Direction: model.BookingDirectionIn,
		},
	}

	result := mapTerminalBookingToEval(b)

	assert.Equal(t, bookingID.String(), result.ID.String())
	assert.Equal(t, empID.String(), result.EmployeeID.String())
	assert.Equal(t, int64(480), *result.OriginalTime)
	assert.Equal(t, "08:00", result.OriginalTimeString)
	assert.Equal(t, int64(485), *result.EditedTime)
	assert.Equal(t, "08:05", result.EditedTimeString)
	assert.True(t, result.WasEdited)
	require.NotNil(t, result.TerminalID)
	assert.Equal(t, termID.String(), result.TerminalID.String())
	require.NotNil(t, result.Employee)
	require.NotNil(t, result.BookingType)
}

func TestMapTerminalBookingToEval_NotEdited(t *testing.T) {
	bookingID := uuid.New()
	empID := uuid.New()
	btID := uuid.New()
	date := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)

	b := &model.Booking{
		ID:            bookingID,
		EmployeeID:    empID,
		BookingDate:   date,
		BookingTypeID: btID,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceTerminal,
		CreatedAt:     date,
	}

	result := mapTerminalBookingToEval(b)

	assert.False(t, result.WasEdited)
	assert.Equal(t, "08:00", result.OriginalTimeString)
	assert.Equal(t, "08:00", result.EditedTimeString)
}

func TestMapAuditLogToLogEntry(t *testing.T) {
	logID := uuid.New()
	entityID := uuid.New()
	userID := uuid.New()
	performedAt := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	entityName := "Test Booking"

	l := &model.AuditLog{
		ID:          logID,
		Action:      model.AuditActionCreate,
		EntityType:  "booking",
		EntityID:    entityID,
		EntityName:  &entityName,
		Changes:     []byte(`{"field":"value"}`),
		UserID:      &userID,
		PerformedAt: performedAt,
		User: &model.User{
			ID:          userID,
			DisplayName: "Admin User",
		},
	}

	result := mapAuditLogToLogEntry(l)

	assert.Equal(t, logID.String(), result.ID.String())
	assert.Equal(t, "create", *result.Action)
	assert.Equal(t, "booking", *result.EntityType)
	assert.Equal(t, entityID.String(), result.EntityID.String())
	require.NotNil(t, result.EntityName)
	assert.Equal(t, "Test Booking", *result.EntityName)
	assert.NotNil(t, result.Changes)
	require.NotNil(t, result.UserID)
	assert.Equal(t, userID.String(), result.UserID.String())
	require.NotNil(t, result.User)
	assert.Equal(t, "Admin User", *result.User.DisplayName)
}

func TestMapAuditLogToLogEntry_NilOptional(t *testing.T) {
	logID := uuid.New()
	entityID := uuid.New()
	performedAt := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)

	l := &model.AuditLog{
		ID:          logID,
		Action:      model.AuditActionUpdate,
		EntityType:  "absence",
		EntityID:    entityID,
		PerformedAt: performedAt,
	}

	result := mapAuditLogToLogEntry(l)

	assert.Nil(t, result.EntityName)
	assert.Nil(t, result.Changes)
	assert.Nil(t, result.UserID)
	assert.Nil(t, result.User)
}

func TestMapAuditLogToWorkflowEntry(t *testing.T) {
	logID := uuid.New()
	entityID := uuid.New()
	userID := uuid.New()
	performedAt := time.Date(2026, 1, 15, 10, 30, 0, 0, time.UTC)
	entityName := "Absence Request"

	l := &model.AuditLog{
		ID:          logID,
		Action:      model.AuditActionApprove,
		EntityType:  "absence",
		EntityID:    entityID,
		EntityName:  &entityName,
		Metadata:    []byte(`{"approver":"admin"}`),
		UserID:      &userID,
		PerformedAt: performedAt,
		User: &model.User{
			ID:          userID,
			DisplayName: "Manager",
		},
	}

	result := mapAuditLogToWorkflowEntry(l)

	assert.Equal(t, logID.String(), result.ID.String())
	assert.Equal(t, "approve", *result.Action)
	assert.Equal(t, "absence", *result.EntityType)
	assert.Equal(t, entityID.String(), result.EntityID.String())
	require.NotNil(t, result.EntityName)
	assert.Equal(t, "Absence Request", *result.EntityName)
	assert.NotNil(t, result.Metadata)
	require.NotNil(t, result.UserID)
	assert.Equal(t, userID.String(), result.UserID.String())
	require.NotNil(t, result.User)
	assert.Equal(t, "Manager", *result.User.DisplayName)
}

func TestMapEmployeeToSummary(t *testing.T) {
	empID := uuid.New()
	emp := &model.Employee{
		ID:              empID,
		PersonnelNumber: "E001",
		FirstName:       "Jane",
		LastName:        "Smith",
		IsActive:        true,
	}

	result := mapEmployeeToSummary(emp)

	assert.Equal(t, empID.String(), result.ID.String())
	assert.Equal(t, "E001", *result.PersonnelNumber)
	assert.Equal(t, "Jane", *result.FirstName)
	assert.Equal(t, "Smith", *result.LastName)
	assert.True(t, result.IsActive)
}

func TestMapBookingTypeToSummary(t *testing.T) {
	btID := uuid.New()
	bt := &model.BookingType{
		ID:        btID,
		Code:      "K",
		Name:      "Kommen",
		Direction: model.BookingDirectionIn,
	}

	result := mapBookingTypeToSummary(bt)

	assert.Equal(t, btID.String(), result.ID.String())
	assert.Equal(t, "K", *result.Code)
	assert.Equal(t, "Kommen", *result.Name)
	assert.Equal(t, "in", *result.Direction)
}

func TestMapUserToSummary(t *testing.T) {
	userID := uuid.New()
	u := &model.User{
		ID:          userID,
		DisplayName: "Test User",
	}

	result := mapUserToSummary(u)

	assert.Equal(t, userID.String(), result.ID.String())
	assert.Equal(t, "Test User", *result.DisplayName)
}
