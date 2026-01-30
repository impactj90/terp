package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// --- Alive Check Task ---

// AliveCheckTaskHandler handles the alive_check task type.
type AliveCheckTaskHandler struct{}

// NewAliveCheckTaskHandler creates a new AliveCheckTaskHandler.
func NewAliveCheckTaskHandler() *AliveCheckTaskHandler {
	return &AliveCheckTaskHandler{}
}

// Execute runs the alive check task.
func (h *AliveCheckTaskHandler) Execute(_ context.Context, tenantID uuid.UUID, _ json.RawMessage) (json.RawMessage, error) {
	result := map[string]interface{}{
		"status":    "alive",
		"tenant_id": tenantID.String(),
		"checked_at": time.Now().UTC().Format(time.RFC3339),
	}
	data, _ := json.Marshal(result)
	return data, nil
}

// --- Calculate Days Task ---

// recalcServiceForScheduler defines the interface for daily recalculation.
type recalcServiceForScheduler interface {
	TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error)
}

// CalculateDaysTaskHandler handles the calculate_days task type.
type CalculateDaysTaskHandler struct {
	recalcService recalcServiceForScheduler
}

// NewCalculateDaysTaskHandler creates a new CalculateDaysTaskHandler.
func NewCalculateDaysTaskHandler(recalcService recalcServiceForScheduler) *CalculateDaysTaskHandler {
	return &CalculateDaysTaskHandler{recalcService: recalcService}
}

// Execute runs the calculate days task.
func (h *CalculateDaysTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error) {
	var config struct {
		DateRange string `json:"date_range"`
	}
	if len(params) > 0 {
		_ = json.Unmarshal(params, &config)
	}
	if config.DateRange == "" {
		config.DateRange = "yesterday"
	}

	now := time.Now()
	var from, to time.Time

	switch config.DateRange {
	case "yesterday":
		yesterday := now.AddDate(0, 0, -1)
		from = time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, now.Location())
		to = from
	case "today":
		from = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		to = from
	case "last_7_days":
		to = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		from = to.AddDate(0, 0, -6)
	case "current_month":
		from = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		to = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	default:
		return nil, fmt.Errorf("unknown date_range: %s", config.DateRange)
	}

	log.Info().
		Str("tenant_id", tenantID.String()).
		Str("date_range", config.DateRange).
		Time("from", from).
		Time("to", to).
		Msg("executing calculate_days task")

	result, err := h.recalcService.TriggerRecalcAll(ctx, tenantID, from, to)
	if err != nil {
		return nil, fmt.Errorf("calculate_days failed: %w", err)
	}

	data, _ := json.Marshal(map[string]interface{}{
		"date_range":     config.DateRange,
		"from":           from.Format("2006-01-02"),
		"to":             to.Format("2006-01-02"),
		"processed_days": result.ProcessedDays,
		"failed_days":    result.FailedDays,
	})
	return data, nil
}

// --- Calculate Months Task ---

// monthlyCalcServiceForScheduler defines the interface for monthly batch calculation.
type monthlyCalcServiceForScheduler interface {
	CalculateMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, year, month int) *MonthlyCalcResult
}

// employeeRepoForScheduler defines the interface for looking up employees.
type employeeRepoForScheduler interface {
	List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
}

// CalculateMonthsTaskHandler handles the calculate_months task type.
type CalculateMonthsTaskHandler struct {
	monthlyCalcService monthlyCalcServiceForScheduler
	employeeRepo       employeeRepoForScheduler
}

// NewCalculateMonthsTaskHandler creates a new CalculateMonthsTaskHandler.
func NewCalculateMonthsTaskHandler(monthlyCalcService monthlyCalcServiceForScheduler, employeeRepo employeeRepoForScheduler) *CalculateMonthsTaskHandler {
	return &CalculateMonthsTaskHandler{
		monthlyCalcService: monthlyCalcService,
		employeeRepo:       employeeRepo,
	}
}

// Execute runs the calculate months task.
func (h *CalculateMonthsTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error) {
	var config struct {
		Year  int `json:"year"`
		Month int `json:"month"`
	}
	if len(params) > 0 {
		_ = json.Unmarshal(params, &config)
	}

	now := time.Now()
	if config.Year == 0 {
		config.Year = now.Year()
	}
	if config.Month == 0 {
		// Default: previous month
		prev := now.AddDate(0, -1, 0)
		config.Month = int(prev.Month())
		config.Year = prev.Year()
	}

	log.Info().
		Str("tenant_id", tenantID.String()).
		Int("year", config.Year).
		Int("month", config.Month).
		Msg("executing calculate_months task")

	// Get all active employees for the tenant
	isActive := true
	filter := repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	}
	employees, _, err := h.employeeRepo.List(ctx, filter)
	if err != nil {
		return nil, fmt.Errorf("calculate_months: failed to list employees: %w", err)
	}

	employeeIDs := make([]uuid.UUID, len(employees))
	for i, emp := range employees {
		employeeIDs[i] = emp.ID
	}

	result := h.monthlyCalcService.CalculateMonthBatch(ctx, employeeIDs, config.Year, config.Month)

	data, _ := json.Marshal(map[string]interface{}{
		"year":             config.Year,
		"month":            config.Month,
		"processed_months": result.ProcessedMonths,
		"skipped_months":   result.SkippedMonths,
		"failed_months":    result.FailedMonths,
	})
	return data, nil
}

// --- Send Notifications Task ---

// sendNotificationsServiceForScheduler defines the interface for the employee message service.
type sendNotificationsServiceForScheduler interface {
	ProcessPendingNotifications(ctx context.Context) (*SendResult, error)
}

// SendNotificationsTaskHandler handles the send_notifications task type.
type SendNotificationsTaskHandler struct {
	employeeMessageService sendNotificationsServiceForScheduler
}

// NewSendNotificationsTaskHandler creates a new SendNotificationsTaskHandler.
func NewSendNotificationsTaskHandler(employeeMessageService sendNotificationsServiceForScheduler) *SendNotificationsTaskHandler {
	return &SendNotificationsTaskHandler{employeeMessageService: employeeMessageService}
}

// Execute runs the send_notifications task - processes all pending employee message recipients.
func (h *SendNotificationsTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, _ json.RawMessage) (json.RawMessage, error) {
	log.Info().
		Str("tenant_id", tenantID.String()).
		Msg("executing send_notifications task")

	result, err := h.employeeMessageService.ProcessPendingNotifications(ctx)
	if err != nil {
		return nil, fmt.Errorf("send_notifications failed: %w", err)
	}

	data, _ := json.Marshal(map[string]interface{}{
		"sent":   result.Sent,
		"failed": result.Failed,
	})
	return data, nil
}

// --- Terminal Import Task ---

// terminalImportServiceForScheduler defines the interface for the terminal import service.
type terminalImportServiceForScheduler interface {
	ListRawBookings(ctx context.Context, filter ListRawBookingsFilter) ([]model.RawTerminalBooking, int64, error)
}

// TerminalImportTaskHandler handles the terminal_import task type.
type TerminalImportTaskHandler struct {
	terminalService terminalImportServiceForScheduler
}

// NewTerminalImportTaskHandler creates a new TerminalImportTaskHandler.
func NewTerminalImportTaskHandler(terminalService terminalImportServiceForScheduler) *TerminalImportTaskHandler {
	return &TerminalImportTaskHandler{terminalService: terminalService}
}

// Execute runs the terminal_import task - processes pending raw terminal bookings.
func (h *TerminalImportTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, _ json.RawMessage) (json.RawMessage, error) {
	log.Info().
		Str("tenant_id", tenantID.String()).
		Msg("executing terminal_import task")

	pending := model.RawBookingStatusPending
	bookings, total, err := h.terminalService.ListRawBookings(ctx, ListRawBookingsFilter{
		TenantID: tenantID,
		Status:   &pending,
		Limit:    1000,
	})
	if err != nil {
		return nil, fmt.Errorf("terminal_import: failed to list pending bookings: %w", err)
	}

	data, _ := json.Marshal(map[string]interface{}{
		"status":          "completed",
		"pending_total":   total,
		"fetched":         len(bookings),
		"message":         "Terminal import task executed (processing placeholder)",
	})
	return data, nil
}

// --- Placeholder Task Handlers ---

// PlaceholderTaskHandler is a no-op handler for not-yet-implemented tasks.
type PlaceholderTaskHandler struct {
	taskName string
}

// NewPlaceholderTaskHandler creates a new PlaceholderTaskHandler.
func NewPlaceholderTaskHandler(taskName string) *PlaceholderTaskHandler {
	return &PlaceholderTaskHandler{taskName: taskName}
}

// Execute logs that the task ran as a placeholder.
func (h *PlaceholderTaskHandler) Execute(_ context.Context, tenantID uuid.UUID, _ json.RawMessage) (json.RawMessage, error) {
	log.Info().
		Str("tenant_id", tenantID.String()).
		Str("task", h.taskName).
		Msg("placeholder task executed (no-op)")

	data, _ := json.Marshal(map[string]interface{}{
		"status":  "placeholder",
		"message": fmt.Sprintf("%s task executed as placeholder", h.taskName),
	})
	return data, nil
}
