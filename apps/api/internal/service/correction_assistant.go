package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

var (
	ErrCorrectionMessageNotFound = errors.New("correction message not found")
	ErrInvalidSeverity           = errors.New("invalid severity (must be 'error' or 'hint')")
)

// correctionMessageRepository defines the interface for correction message data access.
type correctionMessageRepository interface {
	Create(ctx context.Context, cm *model.CorrectionMessage) error
	CreateBatch(ctx context.Context, messages []model.CorrectionMessage) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.CorrectionMessage, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CorrectionMessage, error)
	Update(ctx context.Context, cm *model.CorrectionMessage) error
	List(ctx context.Context, tenantID uuid.UUID, filter model.CorrectionMessageFilter) ([]model.CorrectionMessage, error)
	ListAsMap(ctx context.Context, tenantID uuid.UUID) (map[string]*model.CorrectionMessage, error)
	CountByTenant(ctx context.Context, tenantID uuid.UUID) (int64, error)
}

// dailyValueQueryRepository defines the read methods needed from daily values.
type dailyValueQueryRepository interface {
	ListAll(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error)
}

// CorrectionAssistantService handles correction message catalog and assistant queries.
type CorrectionAssistantService struct {
	cmRepo correctionMessageRepository
	dvRepo dailyValueQueryRepository
}

// NewCorrectionAssistantService creates a new correction assistant service.
func NewCorrectionAssistantService(
	cmRepo correctionMessageRepository,
	dvRepo dailyValueQueryRepository,
) *CorrectionAssistantService {
	return &CorrectionAssistantService{
		cmRepo: cmRepo,
		dvRepo: dvRepo,
	}
}

// --- Catalog Management ---

// ListMessages returns all correction messages for a tenant.
func (s *CorrectionAssistantService) ListMessages(ctx context.Context, tenantID uuid.UUID, filter model.CorrectionMessageFilter) ([]model.CorrectionMessage, error) {
	return s.cmRepo.List(ctx, tenantID, filter)
}

// GetMessage returns a correction message by ID.
func (s *CorrectionAssistantService) GetMessage(ctx context.Context, id uuid.UUID) (*model.CorrectionMessage, error) {
	cm, err := s.cmRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrCorrectionMessageNotFound
	}
	return cm, nil
}

// UpdateMessageInput represents the input for updating a correction message.
type UpdateMessageInput struct {
	CustomText  *string
	ClearCustom bool
	Severity    *string
	IsActive    *bool
}

// UpdateMessage updates a correction message's custom text, severity, or active status.
func (s *CorrectionAssistantService) UpdateMessage(ctx context.Context, id uuid.UUID, tenantID uuid.UUID, input UpdateMessageInput) (*model.CorrectionMessage, error) {
	cm, err := s.cmRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrCorrectionMessageNotFound
	}

	// Verify tenant ownership
	if cm.TenantID != tenantID {
		return nil, ErrCorrectionMessageNotFound
	}

	if input.ClearCustom {
		cm.CustomText = nil
	} else if input.CustomText != nil {
		text := strings.TrimSpace(*input.CustomText)
		if text == "" {
			cm.CustomText = nil
		} else {
			cm.CustomText = &text
		}
	}

	if input.Severity != nil {
		sev := model.CorrectionSeverity(*input.Severity)
		if sev != model.CorrectionSeverityError && sev != model.CorrectionSeverityHint {
			return nil, ErrInvalidSeverity
		}
		cm.Severity = sev
	}

	if input.IsActive != nil {
		cm.IsActive = *input.IsActive
	}

	if err := s.cmRepo.Update(ctx, cm); err != nil {
		return nil, err
	}
	return cm, nil
}

// EnsureDefaults seeds default correction messages for a tenant if none exist.
func (s *CorrectionAssistantService) EnsureDefaults(ctx context.Context, tenantID uuid.UUID) error {
	count, err := s.cmRepo.CountByTenant(ctx, tenantID)
	if err != nil {
		return err
	}
	if count > 0 {
		return nil // Already seeded
	}

	defaults := defaultCorrectionMessages(tenantID)
	return s.cmRepo.CreateBatch(ctx, defaults)
}

// --- Correction Assistant Query ---

// ListItems returns correction assistant items (daily values with errors, joined with messages).
func (s *CorrectionAssistantService) ListItems(ctx context.Context, tenantID uuid.UUID, filter model.CorrectionAssistantFilter) ([]model.CorrectionAssistantItem, int64, error) {
	// Apply default date range: previous month + current month
	from, to := s.defaultDateRange(filter.From, filter.To)

	// Load message catalog for resolution
	messageMap, err := s.cmRepo.ListAsMap(ctx, tenantID)
	if err != nil {
		return nil, 0, err
	}

	// Build daily value query
	hasErrors := true
	opts := model.DailyValueListOptions{
		From:      from,
		To:        to,
		HasErrors: &hasErrors,
	}
	if filter.EmployeeID != nil {
		opts.EmployeeID = filter.EmployeeID
	}
	if filter.DepartmentID != nil {
		opts.ScopeType = model.DataScopeDepartment
		opts.ScopeDepartmentIDs = []uuid.UUID{*filter.DepartmentID}
	}

	// Query daily values with errors
	dailyValues, err := s.dvRepo.ListAll(ctx, tenantID, opts)
	if err != nil {
		return nil, 0, err
	}

	// Build correction assistant items
	var items []model.CorrectionAssistantItem
	for _, dv := range dailyValues {
		dvErrors := s.buildErrors(dv.ErrorCodes, dv.Warnings, messageMap, filter.Severity, filter.ErrorCode)
		if len(dvErrors) == 0 {
			continue // All errors filtered out
		}

		item := model.CorrectionAssistantItem{
			DailyValueID: dv.ID,
			EmployeeID:   dv.EmployeeID,
			ValueDate:    dv.ValueDate,
			Errors:       dvErrors,
		}

		// Resolve employee name and department
		if dv.Employee != nil {
			item.EmployeeName = dv.Employee.FirstName + " " + dv.Employee.LastName
			if dv.Employee.DepartmentID != nil {
				item.DepartmentID = dv.Employee.DepartmentID
			}
			if dv.Employee.Department != nil {
				name := dv.Employee.Department.Name
				item.DepartmentName = &name
			}
		}

		items = append(items, item)
	}

	total := int64(len(items))

	// Apply pagination
	if filter.Offset > 0 && filter.Offset < len(items) {
		items = items[filter.Offset:]
	} else if filter.Offset >= len(items) {
		items = nil
	}
	if filter.Limit > 0 && filter.Limit < len(items) {
		items = items[:filter.Limit]
	}

	return items, total, nil
}

// defaultDateRange returns the default date range (previous month + current month)
// when no explicit range is provided.
func (s *CorrectionAssistantService) defaultDateRange(from, to *time.Time) (*time.Time, *time.Time) {
	if from != nil && to != nil {
		return from, to
	}

	now := time.Now()

	if from == nil {
		// First day of previous month
		prevMonth := now.AddDate(0, -1, 0)
		firstDay := time.Date(prevMonth.Year(), prevMonth.Month(), 1, 0, 0, 0, 0, time.UTC)
		from = &firstDay
	}

	if to == nil {
		// Last day of current month
		nextMonth := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.UTC)
		lastDay := nextMonth.AddDate(0, 0, -1)
		to = &lastDay
	}

	return from, to
}

// buildErrors builds correction assistant error entries from raw error codes and warnings,
// resolving message text from the catalog and applying severity/code filters.
func (s *CorrectionAssistantService) buildErrors(
	errorCodes []string,
	warnings []string,
	messageMap map[string]*model.CorrectionMessage,
	severityFilter *model.CorrectionSeverity,
	codeFilter *string,
) []model.CorrectionAssistantError {
	var result []model.CorrectionAssistantError

	// Process error codes
	for _, code := range errorCodes {
		severity := "error"
		if severityFilter != nil && string(*severityFilter) != severity {
			continue
		}
		if codeFilter != nil && *codeFilter != code {
			continue
		}

		msg := s.resolveMessage(code, severity, messageMap)
		result = append(result, msg)
	}

	// Process warnings as "hint" severity
	for _, code := range warnings {
		severity := "hint"
		if severityFilter != nil && string(*severityFilter) != severity {
			continue
		}
		if codeFilter != nil && *codeFilter != code {
			continue
		}

		msg := s.resolveMessage(code, severity, messageMap)
		result = append(result, msg)
	}

	return result
}

// resolveMessage resolves a single error code to a CorrectionAssistantError
// using the message catalog.
func (s *CorrectionAssistantService) resolveMessage(code, severity string, messageMap map[string]*model.CorrectionMessage) model.CorrectionAssistantError {
	message := code // Fallback to raw code
	if cm, ok := messageMap[code]; ok {
		message = cm.EffectiveText()
		// Use catalog severity if available
		severity = string(cm.Severity)
	}

	return model.CorrectionAssistantError{
		Code:      code,
		Severity:  severity,
		Message:   message,
		ErrorType: mapCorrectionErrorType(code),
	}
}

// mapCorrectionErrorType maps a raw error code to the DailyError error_type enum.
// Mirrors the logic in handler/booking.go mapDailyErrorType().
func mapCorrectionErrorType(code string) string {
	switch code {
	case calculation.ErrCodeMissingCome, calculation.ErrCodeMissingGo, calculation.ErrCodeNoBookings:
		return "missing_booking"
	case calculation.ErrCodeUnpairedBooking:
		return "unpaired_booking"
	case calculation.ErrCodeDuplicateInTime:
		return "overlapping_bookings"
	case calculation.ErrCodeEarlyCome, calculation.ErrCodeLateCome, calculation.ErrCodeEarlyGo,
		calculation.ErrCodeLateGo, calculation.ErrCodeMissedCoreStart, calculation.ErrCodeMissedCoreEnd:
		return "core_time_violation"
	case calculation.ErrCodeBelowMinWorkTime:
		return "below_min_hours"
	case calculation.WarnCodeNoBreakRecorded, calculation.WarnCodeShortBreak,
		calculation.WarnCodeManualBreak, calculation.WarnCodeAutoBreakApplied:
		return "break_violation"
	case calculation.WarnCodeMaxTimeReached:
		return "exceeds_max_hours"
	default:
		return "invalid_sequence"
	}
}

// defaultCorrectionMessages returns the default correction message entries for seeding.
func defaultCorrectionMessages(tenantID uuid.UUID) []model.CorrectionMessage {
	return []model.CorrectionMessage{
		// Error codes
		{TenantID: tenantID, Code: calculation.ErrCodeMissingCome, DefaultText: "Missing arrival booking", Severity: model.CorrectionSeverityError, Description: strPtr("No arrival booking found for this work day")},
		{TenantID: tenantID, Code: calculation.ErrCodeMissingGo, DefaultText: "Missing departure booking", Severity: model.CorrectionSeverityError, Description: strPtr("No departure booking found for this work day")},
		{TenantID: tenantID, Code: calculation.ErrCodeUnpairedBooking, DefaultText: "Unpaired booking", Severity: model.CorrectionSeverityError, Description: strPtr("A booking exists without a matching pair")},
		{TenantID: tenantID, Code: calculation.ErrCodeEarlyCome, DefaultText: "Arrival before allowed window", Severity: model.CorrectionSeverityError, Description: strPtr("Employee arrived before the allowed time window")},
		{TenantID: tenantID, Code: calculation.ErrCodeLateCome, DefaultText: "Arrival after allowed window", Severity: model.CorrectionSeverityError, Description: strPtr("Employee arrived after the allowed time window")},
		{TenantID: tenantID, Code: calculation.ErrCodeEarlyGo, DefaultText: "Departure before allowed window", Severity: model.CorrectionSeverityError, Description: strPtr("Employee departed before the allowed time window")},
		{TenantID: tenantID, Code: calculation.ErrCodeLateGo, DefaultText: "Departure after allowed window", Severity: model.CorrectionSeverityError, Description: strPtr("Employee departed after the allowed time window")},
		{TenantID: tenantID, Code: calculation.ErrCodeMissedCoreStart, DefaultText: "Missed core hours start", Severity: model.CorrectionSeverityError, Description: strPtr("Employee arrived after mandatory core hours started")},
		{TenantID: tenantID, Code: calculation.ErrCodeMissedCoreEnd, DefaultText: "Missed core hours end", Severity: model.CorrectionSeverityError, Description: strPtr("Employee departed before mandatory core hours ended")},
		{TenantID: tenantID, Code: calculation.ErrCodeBelowMinWorkTime, DefaultText: "Below minimum work time", Severity: model.CorrectionSeverityError, Description: strPtr("Actual work time is below the required minimum")},
		{TenantID: tenantID, Code: calculation.ErrCodeNoBookings, DefaultText: "No bookings for the day", Severity: model.CorrectionSeverityError, Description: strPtr("No bookings exist for an active work day")},
		{TenantID: tenantID, Code: calculation.ErrCodeInvalidTime, DefaultText: "Invalid time value", Severity: model.CorrectionSeverityError, Description: strPtr("A booking has a time value outside the valid range")},
		{TenantID: tenantID, Code: calculation.ErrCodeDuplicateInTime, DefaultText: "Duplicate arrival time", Severity: model.CorrectionSeverityError, Description: strPtr("Multiple arrival bookings at the same time")},
		{TenantID: tenantID, Code: calculation.ErrCodeNoMatchingShift, DefaultText: "No matching time plan found", Severity: model.CorrectionSeverityError, Description: strPtr("No day plan matches the booking times for shift detection")},
		// Warning codes (mapped to "hint" severity)
		{TenantID: tenantID, Code: calculation.WarnCodeCrossMidnight, DefaultText: "Shift spans midnight", Severity: model.CorrectionSeverityHint, Description: strPtr("The work shift crosses midnight into the next day")},
		{TenantID: tenantID, Code: calculation.WarnCodeMaxTimeReached, DefaultText: "Maximum work time reached", Severity: model.CorrectionSeverityHint, Description: strPtr("Net time was capped at the maximum allowed")},
		{TenantID: tenantID, Code: calculation.WarnCodeManualBreak, DefaultText: "Manual break booking exists", Severity: model.CorrectionSeverityHint, Description: strPtr("Break bookings exist; automatic break deduction was skipped")},
		{TenantID: tenantID, Code: calculation.WarnCodeNoBreakRecorded, DefaultText: "No break booking recorded", Severity: model.CorrectionSeverityHint, Description: strPtr("No break was booked although a break is required")},
		{TenantID: tenantID, Code: calculation.WarnCodeShortBreak, DefaultText: "Break duration too short", Severity: model.CorrectionSeverityHint, Description: strPtr("Recorded break is shorter than the required minimum")},
		{TenantID: tenantID, Code: calculation.WarnCodeAutoBreakApplied, DefaultText: "Automatic break applied", Severity: model.CorrectionSeverityHint, Description: strPtr("Break was automatically deducted per day plan rules")},
		{TenantID: tenantID, Code: calculation.WarnCodeMonthlyCap, DefaultText: "Monthly cap reached", Severity: model.CorrectionSeverityHint, Description: strPtr("Flextime credit was capped at the monthly maximum")},
		{TenantID: tenantID, Code: calculation.WarnCodeFlextimeCapped, DefaultText: "Flextime balance capped", Severity: model.CorrectionSeverityHint, Description: strPtr("Flextime balance was limited by positive or negative cap")},
		{TenantID: tenantID, Code: calculation.WarnCodeBelowThreshold, DefaultText: "Below threshold", Severity: model.CorrectionSeverityHint, Description: strPtr("Overtime is below the configured threshold and was forfeited")},
		{TenantID: tenantID, Code: calculation.WarnCodeNoCarryover, DefaultText: "No carryover", Severity: model.CorrectionSeverityHint, Description: strPtr("Account credit type resets to zero with no carryover")},
	}
}

func strPtr(s string) *string {
	return &s
}
