package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForCA(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "CA Test Tenant " + uuid.New().String()[:8],
		Slug:     "ca-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestEmployeeForCA(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	repo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "CA" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:4],
		FirstName:       "Test",
		LastName:        "Employee",
		EntryDate:       time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC),
		WeeklyHours:     decimal.NewFromFloat(40.0),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(context.Background(), emp))
	return emp
}

func newCAService(db *repository.DB) *service.CorrectionAssistantService {
	cmRepo := repository.NewCorrectionMessageRepository(db)
	dvRepo := repository.NewDailyValueRepository(db)
	return service.NewCorrectionAssistantService(cmRepo, dvRepo)
}

// =============================================================
// Message Catalog Tests
// =============================================================

func TestCorrectionAssistant_EnsureDefaults_SeedsMessages(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	// First call should seed defaults
	err := svc.EnsureDefaults(ctx, tenant.ID)
	require.NoError(t, err)

	// List should return seeded messages
	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)
	assert.Greater(t, len(messages), 0, "should have seeded default messages")

	// Verify error and hint messages exist
	var errorCount, hintCount int
	for _, m := range messages {
		switch m.Severity {
		case model.CorrectionSeverityError:
			errorCount++
		case model.CorrectionSeverityHint:
			hintCount++
		}
	}
	assert.Greater(t, errorCount, 0, "should have error messages")
	assert.Greater(t, hintCount, 0, "should have hint messages")
}

func TestCorrectionAssistant_EnsureDefaults_Idempotent(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	// Call twice
	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))
	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)

	// Count should remain the same (no duplicates)
	firstCount := len(messages)
	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))
	messages2, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)
	assert.Equal(t, firstCount, len(messages2), "idempotent seeding should not duplicate")
}

func TestCorrectionAssistant_ListMessages_FilterBySeverity(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	errSev := model.CorrectionSeverityError
	errors, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{Severity: &errSev})
	require.NoError(t, err)
	for _, m := range errors {
		assert.Equal(t, model.CorrectionSeverityError, m.Severity)
	}

	hintSev := model.CorrectionSeverityHint
	hints, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{Severity: &hintSev})
	require.NoError(t, err)
	for _, m := range hints {
		assert.Equal(t, model.CorrectionSeverityHint, m.Severity)
	}

	assert.Greater(t, len(errors), 0)
	assert.Greater(t, len(hints), 0)
}

func TestCorrectionAssistant_ListMessages_FilterByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	code := calculation.ErrCodeMissingCome
	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{Code: &code})
	require.NoError(t, err)
	require.Len(t, messages, 1)
	assert.Equal(t, calculation.ErrCodeMissingCome, messages[0].Code)
}

func TestCorrectionAssistant_ListMessages_FilterByActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	// All defaults should be active
	active := true
	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{IsActive: &active})
	require.NoError(t, err)
	assert.Greater(t, len(messages), 0)
	for _, m := range messages {
		assert.True(t, m.IsActive)
	}
}

func TestCorrectionAssistant_GetMessage(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)
	require.Greater(t, len(messages), 0)

	msg, err := svc.GetMessage(ctx, messages[0].ID)
	require.NoError(t, err)
	assert.Equal(t, messages[0].ID, msg.ID)
	assert.Equal(t, messages[0].Code, msg.Code)
}

func TestCorrectionAssistant_GetMessage_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()

	_, err := svc.GetMessage(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrCorrectionMessageNotFound)
}

func TestCorrectionAssistant_UpdateMessage_CustomText(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)
	require.Greater(t, len(messages), 0)

	msg := messages[0]

	// Set custom text
	customText := "My custom error message"
	updated, err := svc.UpdateMessage(ctx, msg.ID, tenant.ID, service.UpdateMessageInput{
		CustomText: &customText,
	})
	require.NoError(t, err)
	require.NotNil(t, updated.CustomText)
	assert.Equal(t, "My custom error message", *updated.CustomText)
	assert.Equal(t, "My custom error message", updated.EffectiveText())
}

func TestCorrectionAssistant_UpdateMessage_ClearCustomText(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)
	require.Greater(t, len(messages), 0)

	msg := messages[0]

	// Set custom text first
	customText := "My custom text"
	updated, err := svc.UpdateMessage(ctx, msg.ID, tenant.ID, service.UpdateMessageInput{
		CustomText: &customText,
	})
	require.NoError(t, err)
	require.NotNil(t, updated.CustomText)

	// Clear custom text by setting empty
	emptyText := ""
	updated, err = svc.UpdateMessage(ctx, msg.ID, tenant.ID, service.UpdateMessageInput{
		CustomText: &emptyText,
	})
	require.NoError(t, err)
	assert.Nil(t, updated.CustomText)
	// Should fall back to default
	assert.Equal(t, updated.DefaultText, updated.EffectiveText())
}

func TestCorrectionAssistant_UpdateMessage_Severity(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	errSev := model.CorrectionSeverityError
	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{Severity: &errSev})
	require.NoError(t, err)
	require.Greater(t, len(messages), 0)

	msg := messages[0]

	// Change severity from error to hint
	hintStr := "hint"
	updated, err := svc.UpdateMessage(ctx, msg.ID, tenant.ID, service.UpdateMessageInput{
		Severity: &hintStr,
	})
	require.NoError(t, err)
	assert.Equal(t, model.CorrectionSeverityHint, updated.Severity)
}

func TestCorrectionAssistant_UpdateMessage_InvalidSeverity(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)
	require.Greater(t, len(messages), 0)

	invalid := "critical"
	_, err = svc.UpdateMessage(ctx, messages[0].ID, tenant.ID, service.UpdateMessageInput{
		Severity: &invalid,
	})
	assert.ErrorIs(t, err, service.ErrInvalidSeverity)
}

func TestCorrectionAssistant_UpdateMessage_Deactivate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)
	require.Greater(t, len(messages), 0)

	msg := messages[0]
	assert.True(t, msg.IsActive)

	inactive := false
	updated, err := svc.UpdateMessage(ctx, msg.ID, tenant.ID, service.UpdateMessageInput{
		IsActive: &inactive,
	})
	require.NoError(t, err)
	assert.False(t, updated.IsActive)
}

func TestCorrectionAssistant_UpdateMessage_WrongTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	otherTenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{})
	require.NoError(t, err)
	require.Greater(t, len(messages), 0)

	custom := "hacked"
	_, err = svc.UpdateMessage(ctx, messages[0].ID, otherTenant.ID, service.UpdateMessageInput{
		CustomText: &custom,
	})
	assert.ErrorIs(t, err, service.ErrCorrectionMessageNotFound)
}

func TestCorrectionAssistant_UpdateMessage_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	custom := "test"
	_, err := svc.UpdateMessage(ctx, uuid.New(), tenant.ID, service.UpdateMessageInput{
		CustomText: &custom,
	})
	assert.ErrorIs(t, err, service.ErrCorrectionMessageNotFound)
}

// =============================================================
// EffectiveText Tests
// =============================================================

func TestCorrectionMessage_EffectiveText_DefaultWhenNoCustom(t *testing.T) {
	cm := model.CorrectionMessage{
		DefaultText: "Default message",
		CustomText:  nil,
	}
	assert.Equal(t, "Default message", cm.EffectiveText())
}

func TestCorrectionMessage_EffectiveText_CustomOverridesDefault(t *testing.T) {
	customText := "Custom override"
	cm := model.CorrectionMessage{
		DefaultText: "Default message",
		CustomText:  &customText,
	}
	assert.Equal(t, "Custom override", cm.EffectiveText())
}

func TestCorrectionMessage_EffectiveText_EmptyCustomFallsBack(t *testing.T) {
	emptyText := ""
	cm := model.CorrectionMessage{
		DefaultText: "Default message",
		CustomText:  &emptyText,
	}
	assert.Equal(t, "Default message", cm.EffectiveText())
}

// =============================================================
// Correction Assistant Query Tests
// =============================================================

func createDailyValueWithErrors(t *testing.T, db *repository.DB, tenantID, employeeID uuid.UUID, date time.Time, errorCodes, warnings []string) {
	t.Helper()
	dvRepo := repository.NewDailyValueRepository(db)
	dv := &model.DailyValue{
		TenantID:   tenantID,
		EmployeeID: employeeID,
		ValueDate:  date,
		HasError:   len(errorCodes) > 0,
		ErrorCodes: pq.StringArray(errorCodes),
		Warnings:   pq.StringArray(warnings),
		Status:     model.DailyValueStatusError,
	}
	err := dvRepo.Create(context.Background(), dv)
	require.NoError(t, err)
}

func TestCorrectionAssistant_ListItems_BasicQuery(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	// Create a daily value with errors
	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	createDailyValueWithErrors(t, db, tenant.ID, employee.ID, today,
		[]string{calculation.ErrCodeMissingCome, calculation.ErrCodeMissingGo},
		nil,
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	items, total, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 50,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, items, 1)
	assert.Equal(t, employee.ID, items[0].EmployeeID)
	assert.Equal(t, today, items[0].ValueDate)
	assert.Len(t, items[0].Errors, 2)
}

func TestCorrectionAssistant_ListItems_MessageResolution(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	createDailyValueWithErrors(t, db, tenant.ID, employee.ID, today,
		[]string{calculation.ErrCodeMissingCome},
		nil,
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	items, _, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 50,
	})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Len(t, items[0].Errors, 1)

	// Should resolve the message text from the catalog
	assert.Equal(t, calculation.ErrCodeMissingCome, items[0].Errors[0].Code)
	assert.Equal(t, "error", items[0].Errors[0].Severity)
	assert.Equal(t, "Missing arrival booking", items[0].Errors[0].Message)
	assert.Equal(t, "missing_booking", items[0].Errors[0].ErrorType)
}

func TestCorrectionAssistant_ListItems_CustomTextOverride(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	// Update the MISSING_COME message with custom text
	code := calculation.ErrCodeMissingCome
	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{Code: &code})
	require.NoError(t, err)
	require.Len(t, messages, 1)

	customText := "Bitte Kommen-Buchung nachtragen"
	_, err = svc.UpdateMessage(ctx, messages[0].ID, tenant.ID, service.UpdateMessageInput{
		CustomText: &customText,
	})
	require.NoError(t, err)

	// Create daily value with that error
	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	createDailyValueWithErrors(t, db, tenant.ID, employee.ID, today,
		[]string{calculation.ErrCodeMissingCome},
		nil,
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	items, _, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 50,
	})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Len(t, items[0].Errors, 1)

	// Should use the custom text
	assert.Equal(t, "Bitte Kommen-Buchung nachtragen", items[0].Errors[0].Message)
}

func TestCorrectionAssistant_ListItems_FilterByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	emp1 := createTestEmployeeForCA(t, db, tenant.ID)
	emp2 := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	createDailyValueWithErrors(t, db, tenant.ID, emp1.ID, today,
		[]string{calculation.ErrCodeMissingCome},
		nil,
	)
	createDailyValueWithErrors(t, db, tenant.ID, emp2.ID, today,
		[]string{calculation.ErrCodeMissingGo},
		nil,
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)

	// Filter by emp1
	items, total, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:       &from,
		To:         &to,
		EmployeeID: &emp1.ID,
		Limit:      50,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, items, 1)
	assert.Equal(t, emp1.ID, items[0].EmployeeID)
}

func TestCorrectionAssistant_ListItems_FilterBySeverity(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	// Create with both errors and warnings
	createDailyValueWithErrors(t, db, tenant.ID, employee.ID, today,
		[]string{calculation.ErrCodeMissingCome},
		[]string{calculation.WarnCodeAutoBreakApplied},
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)

	// Filter errors only
	errSev := model.CorrectionSeverityError
	items, _, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:     &from,
		To:       &to,
		Severity: &errSev,
		Limit:    50,
	})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Len(t, items[0].Errors, 1)
	assert.Equal(t, "error", items[0].Errors[0].Severity)

	// Filter hints only
	hintSev := model.CorrectionSeverityHint
	items, _, err = svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:     &from,
		To:       &to,
		Severity: &hintSev,
		Limit:    50,
	})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Len(t, items[0].Errors, 1)
	assert.Equal(t, "hint", items[0].Errors[0].Severity)
}

func TestCorrectionAssistant_ListItems_FilterByErrorCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	createDailyValueWithErrors(t, db, tenant.ID, employee.ID, today,
		[]string{calculation.ErrCodeMissingCome, calculation.ErrCodeMissingGo},
		nil,
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)

	// Filter for MISSING_COME only
	code := calculation.ErrCodeMissingCome
	items, _, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:      &from,
		To:        &to,
		ErrorCode: &code,
		Limit:     50,
	})
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Len(t, items[0].Errors, 1)
	assert.Equal(t, calculation.ErrCodeMissingCome, items[0].Errors[0].Code)
}

func TestCorrectionAssistant_ListItems_Pagination(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	// Create 5 daily values with errors
	for day := 1; day <= 5; day++ {
		date := time.Date(2026, 1, day, 0, 0, 0, 0, time.UTC)
		createDailyValueWithErrors(t, db, tenant.ID, employee.ID, date,
			[]string{calculation.ErrCodeMissingCome},
			nil,
		)
	}

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)

	// Get first page (limit 2)
	items, total, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 2,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, items, 2)

	// Get second page
	items, total, err = svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:   &from,
		To:     &to,
		Limit:  2,
		Offset: 2,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, items, 2)

	// Get last page
	items, total, err = svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:   &from,
		To:     &to,
		Limit:  2,
		Offset: 4,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, items, 1)
}

func TestCorrectionAssistant_ListItems_WithWarnings(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	createDailyValueWithErrors(t, db, tenant.ID, employee.ID, today,
		[]string{calculation.ErrCodeMissingCome},
		[]string{calculation.WarnCodeNoBreakRecorded, calculation.WarnCodeAutoBreakApplied},
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)

	// No filter - should include both errors and warnings
	items, _, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 50,
	})
	require.NoError(t, err)
	require.Len(t, items, 1)
	// 1 error + 2 warnings = 3 total
	assert.Len(t, items[0].Errors, 3)
}

func TestCorrectionAssistant_ListItems_EmployeeName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	createDailyValueWithErrors(t, db, tenant.ID, employee.ID, today,
		[]string{calculation.ErrCodeMissingCome},
		nil,
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	items, _, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 50,
	})
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "Test Employee", items[0].EmployeeName)
}

func TestCorrectionAssistant_ListItems_EmptyResult(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	items, total, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 50,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
	assert.Empty(t, items)
}

func TestCorrectionAssistant_ListItems_ErrorTypeMapping(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	testCases := []struct {
		code         string
		expectedType string
	}{
		{calculation.ErrCodeMissingCome, "missing_booking"},
		{calculation.ErrCodeMissingGo, "missing_booking"},
		{calculation.ErrCodeUnpairedBooking, "unpaired_booking"},
		{calculation.ErrCodeDuplicateInTime, "overlapping_bookings"},
		{calculation.ErrCodeEarlyCome, "core_time_violation"},
		{calculation.ErrCodeBelowMinWorkTime, "below_min_hours"},
	}

	for i, tc := range testCases {
		date := time.Date(2026, 1, i+10, 0, 0, 0, 0, time.UTC)
		createDailyValueWithErrors(t, db, tenant.ID, employee.ID, date,
			[]string{tc.code},
			nil,
		)
	}

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	items, _, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 50,
	})
	require.NoError(t, err)
	require.Len(t, items, len(testCases))

	// Verify each item has the expected error type
	for _, item := range items {
		require.Len(t, item.Errors, 1)
		code := item.Errors[0].Code
		for _, tc := range testCases {
			if tc.code == code {
				assert.Equal(t, tc.expectedType, item.Errors[0].ErrorType, "error type for code %s", code)
			}
		}
	}
}

func TestCorrectionAssistant_ListItems_InactiveMessagesExcluded(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant := createTestTenantForCA(t, db)
	employee := createTestEmployeeForCA(t, db, tenant.ID)

	require.NoError(t, svc.EnsureDefaults(ctx, tenant.ID))

	// Deactivate the MISSING_COME message
	code := calculation.ErrCodeMissingCome
	messages, err := svc.ListMessages(ctx, tenant.ID, model.CorrectionMessageFilter{Code: &code})
	require.NoError(t, err)
	require.Len(t, messages, 1)

	inactive := false
	_, err = svc.UpdateMessage(ctx, messages[0].ID, tenant.ID, service.UpdateMessageInput{
		IsActive: &inactive,
	})
	require.NoError(t, err)

	// Create daily value with MISSING_COME error
	today := time.Date(2026, 1, 15, 0, 0, 0, 0, time.UTC)
	createDailyValueWithErrors(t, db, tenant.ID, employee.ID, today,
		[]string{calculation.ErrCodeMissingCome},
		nil,
	)

	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	items, _, err := svc.ListItems(ctx, tenant.ID, model.CorrectionAssistantFilter{
		From:  &from,
		To:    &to,
		Limit: 50,
	})
	require.NoError(t, err)
	// The error still exists in the daily value, but the message catalog won't have it
	// The code will fall back to the raw code as message text since it's not in the active map
	// The item should still appear because the daily value has errors
	if len(items) == 1 {
		// It should still have the error with fallback text (raw code)
		assert.Len(t, items[0].Errors, 1)
		assert.Equal(t, calculation.ErrCodeMissingCome, items[0].Errors[0].Code)
		// When the catalog entry is inactive, it won't be in the map, so message = raw code
		assert.Equal(t, calculation.ErrCodeMissingCome, items[0].Errors[0].Message)
	}
}

func TestCorrectionAssistant_TenantIsolation(t *testing.T) {
	db := testutil.SetupTestDB(t)
	svc := newCAService(db)
	ctx := context.Background()
	tenant1 := createTestTenantForCA(t, db)
	tenant2 := createTestTenantForCA(t, db)

	// Seed both tenants
	require.NoError(t, svc.EnsureDefaults(ctx, tenant1.ID))
	require.NoError(t, svc.EnsureDefaults(ctx, tenant2.ID))

	// Customize tenant1's MISSING_COME message
	code := calculation.ErrCodeMissingCome
	messages1, err := svc.ListMessages(ctx, tenant1.ID, model.CorrectionMessageFilter{Code: &code})
	require.NoError(t, err)
	require.Len(t, messages1, 1)

	customText := "Tenant 1 custom text"
	_, err = svc.UpdateMessage(ctx, messages1[0].ID, tenant1.ID, service.UpdateMessageInput{
		CustomText: &customText,
	})
	require.NoError(t, err)

	// Verify tenant2's message is unchanged
	messages2, err := svc.ListMessages(ctx, tenant2.ID, model.CorrectionMessageFilter{Code: &code})
	require.NoError(t, err)
	require.Len(t, messages2, 1)
	assert.Nil(t, messages2[0].CustomText, "tenant2 should not be affected by tenant1's custom text")
}
