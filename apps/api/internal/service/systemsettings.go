package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrSystemSettingsNotFound      = errors.New("system settings not found")
	ErrInvalidBirthdayWindow       = errors.New("birthday window must be 0-90 days")
	ErrInvalidServerAliveTime      = errors.New("server alive expected completion time must be 0-1439 minutes")
	ErrInvalidServerAliveThreshold = errors.New("server alive threshold must be greater than 0")
	ErrInvalidDateRange            = errors.New("date_from must not be after date_to")
	ErrDateRangeTooLarge           = errors.New("date range must not exceed 366 days")
	ErrCleanupNoOrderIDs           = errors.New("at least one order_id is required")
)

// SystemSettingsLookup provides read-only access to system settings.
type SystemSettingsLookup interface {
	IsRoundingRelativeToPlan(ctx context.Context, tenantID uuid.UUID) (bool, error)
}

// systemSettingsRepository defines the interface for system settings data access.
type systemSettingsRepository interface {
	GetByTenantID(ctx context.Context, tenantID uuid.UUID) (*model.SystemSettings, error)
	Create(ctx context.Context, settings *model.SystemSettings) error
	Update(ctx context.Context, settings *model.SystemSettings) error
	GetOrCreate(ctx context.Context, tenantID uuid.UUID) (*model.SystemSettings, error)
}

// systemSettingsBookingRepo defines the booking repository interface for cleanup operations.
type systemSettingsBookingRepo interface {
	DeleteByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error)
	CountByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error)
}

// systemSettingsDailyValueRepo defines the daily value repository interface for cleanup operations.
type systemSettingsDailyValueRepo interface {
	DeleteByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error)
	CountByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error)
}

// systemSettingsEDPRepo defines the employee day plan repository interface for cleanup operations.
type systemSettingsEDPRepo interface {
	DeleteByDateRange(ctx context.Context, tenantID uuid.UUID, dateFrom, dateTo time.Time, employeeIDs []uuid.UUID) (int64, error)
}

// systemSettingsOrderRepo defines the order repository interface for cleanup operations.
type systemSettingsOrderRepo interface {
	BulkDelete(ctx context.Context, tenantID uuid.UUID, orderIDs []uuid.UUID) (int64, error)
	CountByIDs(ctx context.Context, tenantID uuid.UUID, orderIDs []uuid.UUID) (int64, error)
}

// systemSettingsRecalcService defines the recalc service interface for re-read operations.
type systemSettingsRecalcService interface {
	TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error)
	TriggerRecalcBatch(ctx context.Context, tenantID uuid.UUID, employeeIDs []uuid.UUID, from, to time.Time) *RecalcResult
}

// SystemSettingsService handles business logic for system settings and cleanup operations.
type SystemSettingsService struct {
	settingsRepo   systemSettingsRepository
	bookingRepo    systemSettingsBookingRepo
	dailyValueRepo systemSettingsDailyValueRepo
	edpRepo        systemSettingsEDPRepo
	orderRepo      systemSettingsOrderRepo
	recalcService  systemSettingsRecalcService
}

// NewSystemSettingsService creates a new SystemSettingsService.
func NewSystemSettingsService(
	settingsRepo systemSettingsRepository,
	bookingRepo systemSettingsBookingRepo,
	dailyValueRepo systemSettingsDailyValueRepo,
	edpRepo systemSettingsEDPRepo,
	orderRepo systemSettingsOrderRepo,
	recalcService systemSettingsRecalcService,
) *SystemSettingsService {
	return &SystemSettingsService{
		settingsRepo:   settingsRepo,
		bookingRepo:    bookingRepo,
		dailyValueRepo: dailyValueRepo,
		edpRepo:        edpRepo,
		orderRepo:      orderRepo,
		recalcService:  recalcService,
	}
}

// Get retrieves the system settings for a tenant, creating defaults if none exist.
func (s *SystemSettingsService) Get(ctx context.Context, tenantID uuid.UUID) (*model.SystemSettings, error) {
	return s.settingsRepo.GetOrCreate(ctx, tenantID)
}

// IsRoundingRelativeToPlan checks if rounding relative to plan is enabled for a tenant.
// Implements SystemSettingsLookup interface.
func (s *SystemSettingsService) IsRoundingRelativeToPlan(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	settings, err := s.settingsRepo.GetOrCreate(ctx, tenantID)
	if err != nil {
		return false, err
	}
	return settings.RoundingRelativeToPlan, nil
}

// UpdateSystemSettingsInput represents the input for updating system settings.
type UpdateSystemSettingsInput struct {
	RoundingRelativeToPlan            *bool
	ErrorListEnabled                  *bool
	TrackedErrorCodes                 []string
	AutoFillOrderEndBookings          *bool
	BirthdayWindowDaysBefore          *int
	BirthdayWindowDaysAfter           *int
	FollowUpEntriesEnabled            *bool
	ProxyHost                         *string
	ProxyPort                         *int
	ProxyUsername                     *string
	ProxyPassword                     *string
	ProxyEnabled                      *bool
	ServerAliveEnabled                *bool
	ServerAliveExpectedCompletionTime *int
	ServerAliveThresholdMinutes       *int
	ServerAliveNotifyAdmins           *bool
}

// Update updates system settings with validation.
func (s *SystemSettingsService) Update(ctx context.Context, tenantID uuid.UUID, input UpdateSystemSettingsInput) (*model.SystemSettings, error) {
	settings, err := s.settingsRepo.GetOrCreate(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	// Validate and apply changes
	if input.RoundingRelativeToPlan != nil {
		settings.RoundingRelativeToPlan = *input.RoundingRelativeToPlan
	}
	if input.ErrorListEnabled != nil {
		settings.ErrorListEnabled = *input.ErrorListEnabled
	}
	if input.TrackedErrorCodes != nil {
		settings.TrackedErrorCodes = pq.StringArray(input.TrackedErrorCodes)
	}
	if input.AutoFillOrderEndBookings != nil {
		settings.AutoFillOrderEndBookings = *input.AutoFillOrderEndBookings
	}
	if input.BirthdayWindowDaysBefore != nil {
		if *input.BirthdayWindowDaysBefore < 0 || *input.BirthdayWindowDaysBefore > 90 {
			return nil, ErrInvalidBirthdayWindow
		}
		settings.BirthdayWindowDaysBefore = *input.BirthdayWindowDaysBefore
	}
	if input.BirthdayWindowDaysAfter != nil {
		if *input.BirthdayWindowDaysAfter < 0 || *input.BirthdayWindowDaysAfter > 90 {
			return nil, ErrInvalidBirthdayWindow
		}
		settings.BirthdayWindowDaysAfter = *input.BirthdayWindowDaysAfter
	}
	if input.FollowUpEntriesEnabled != nil {
		settings.FollowUpEntriesEnabled = *input.FollowUpEntriesEnabled
	}
	if input.ProxyHost != nil {
		settings.ProxyHost = input.ProxyHost
	}
	if input.ProxyPort != nil {
		settings.ProxyPort = input.ProxyPort
	}
	if input.ProxyUsername != nil {
		settings.ProxyUsername = input.ProxyUsername
	}
	if input.ProxyPassword != nil {
		settings.ProxyPassword = input.ProxyPassword
	}
	if input.ProxyEnabled != nil {
		settings.ProxyEnabled = *input.ProxyEnabled
	}
	if input.ServerAliveEnabled != nil {
		settings.ServerAliveEnabled = *input.ServerAliveEnabled
	}
	if input.ServerAliveExpectedCompletionTime != nil {
		if *input.ServerAliveExpectedCompletionTime < 0 || *input.ServerAliveExpectedCompletionTime > 1439 {
			return nil, ErrInvalidServerAliveTime
		}
		settings.ServerAliveExpectedCompletionTime = input.ServerAliveExpectedCompletionTime
	}
	if input.ServerAliveThresholdMinutes != nil {
		if *input.ServerAliveThresholdMinutes <= 0 {
			return nil, ErrInvalidServerAliveThreshold
		}
		settings.ServerAliveThresholdMinutes = input.ServerAliveThresholdMinutes
	}
	if input.ServerAliveNotifyAdmins != nil {
		settings.ServerAliveNotifyAdmins = *input.ServerAliveNotifyAdmins
	}

	if err := s.settingsRepo.Update(ctx, settings); err != nil {
		return nil, err
	}
	return settings, nil
}

// CleanupDateRangeInput represents the input for date-range-based cleanup operations.
type CleanupDateRangeInput struct {
	DateFrom    time.Time
	DateTo      time.Time
	EmployeeIDs []uuid.UUID
	Confirm     bool // false = preview only
}

// CleanupOrdersInput represents the input for order-based cleanup operations.
type CleanupOrdersInput struct {
	OrderIDs []uuid.UUID
	Confirm  bool
}

// CleanupResult represents the outcome of a cleanup operation.
type CleanupResult struct {
	Operation     string
	AffectedCount int64
	Preview       bool
	Details       map[string]any
}

// validateDateRange validates cleanup date range constraints.
func validateDateRange(input CleanupDateRangeInput) error {
	if input.DateFrom.After(input.DateTo) {
		return ErrInvalidDateRange
	}
	daysDiff := input.DateTo.Sub(input.DateFrom).Hours() / 24
	if daysDiff > 366 {
		return ErrDateRangeTooLarge
	}
	return nil
}

// DeleteBookings deletes bookings in a date range.
func (s *SystemSettingsService) DeleteBookings(ctx context.Context, tenantID uuid.UUID, input CleanupDateRangeInput) (*CleanupResult, error) {
	if err := validateDateRange(input); err != nil {
		return nil, err
	}

	// Preview mode: just count
	if !input.Confirm {
		count, err := s.bookingRepo.CountByDateRange(ctx, tenantID, input.DateFrom, input.DateTo, input.EmployeeIDs)
		if err != nil {
			return nil, err
		}
		return &CleanupResult{
			Operation:     "delete_bookings",
			AffectedCount: count,
			Preview:       true,
		}, nil
	}

	// Execute
	count, err := s.bookingRepo.DeleteByDateRange(ctx, tenantID, input.DateFrom, input.DateTo, input.EmployeeIDs)
	if err != nil {
		return nil, err
	}
	return &CleanupResult{
		Operation:     "delete_bookings",
		AffectedCount: count,
		Preview:       false,
	}, nil
}

// DeleteBookingData deletes bookings, daily values, and employee day plans in a date range.
func (s *SystemSettingsService) DeleteBookingData(ctx context.Context, tenantID uuid.UUID, input CleanupDateRangeInput) (*CleanupResult, error) {
	if err := validateDateRange(input); err != nil {
		return nil, err
	}

	// Preview mode: count bookings (primary metric)
	if !input.Confirm {
		bookingCount, err := s.bookingRepo.CountByDateRange(ctx, tenantID, input.DateFrom, input.DateTo, input.EmployeeIDs)
		if err != nil {
			return nil, err
		}
		dvCount, err := s.dailyValueRepo.CountByDateRange(ctx, tenantID, input.DateFrom, input.DateTo, input.EmployeeIDs)
		if err != nil {
			return nil, err
		}
		return &CleanupResult{
			Operation:     "delete_booking_data",
			AffectedCount: bookingCount + dvCount,
			Preview:       true,
			Details: map[string]any{
				"bookings":     bookingCount,
				"daily_values": dvCount,
			},
		}, nil
	}

	// Execute all three deletions
	bookingCount, err := s.bookingRepo.DeleteByDateRange(ctx, tenantID, input.DateFrom, input.DateTo, input.EmployeeIDs)
	if err != nil {
		return nil, err
	}
	dvCount, err := s.dailyValueRepo.DeleteByDateRange(ctx, tenantID, input.DateFrom, input.DateTo, input.EmployeeIDs)
	if err != nil {
		return nil, err
	}
	edpCount, err := s.edpRepo.DeleteByDateRange(ctx, tenantID, input.DateFrom, input.DateTo, input.EmployeeIDs)
	if err != nil {
		return nil, err
	}

	return &CleanupResult{
		Operation:     "delete_booking_data",
		AffectedCount: bookingCount + dvCount + edpCount,
		Preview:       false,
		Details: map[string]any{
			"bookings":           bookingCount,
			"daily_values":       dvCount,
			"employee_day_plans": edpCount,
		},
	}, nil
}

// ReReadBookings re-triggers calculation for bookings in a date range.
func (s *SystemSettingsService) ReReadBookings(ctx context.Context, tenantID uuid.UUID, input CleanupDateRangeInput) (*CleanupResult, error) {
	if err := validateDateRange(input); err != nil {
		return nil, err
	}

	// Preview mode: count bookings that would be recalculated
	if !input.Confirm {
		count, err := s.bookingRepo.CountByDateRange(ctx, tenantID, input.DateFrom, input.DateTo, input.EmployeeIDs)
		if err != nil {
			return nil, err
		}
		return &CleanupResult{
			Operation:     "re_read_bookings",
			AffectedCount: count,
			Preview:       true,
		}, nil
	}

	// Execute recalculation
	var recalcResult *RecalcResult
	if len(input.EmployeeIDs) > 0 {
		recalcResult = s.recalcService.TriggerRecalcBatch(ctx, tenantID, input.EmployeeIDs, input.DateFrom, input.DateTo)
	} else {
		var err error
		recalcResult, err = s.recalcService.TriggerRecalcAll(ctx, tenantID, input.DateFrom, input.DateTo)
		if err != nil {
			return nil, err
		}
	}

	return &CleanupResult{
		Operation:     "re_read_bookings",
		AffectedCount: int64(recalcResult.ProcessedDays),
		Preview:       false,
		Details: map[string]any{
			"processed_days": recalcResult.ProcessedDays,
			"failed_days":    recalcResult.FailedDays,
		},
	}, nil
}

// MarkDeleteOrders deletes orders by IDs.
func (s *SystemSettingsService) MarkDeleteOrders(ctx context.Context, tenantID uuid.UUID, input CleanupOrdersInput) (*CleanupResult, error) {
	if len(input.OrderIDs) == 0 {
		return nil, ErrCleanupNoOrderIDs
	}

	// Preview mode: count matching orders
	if !input.Confirm {
		count, err := s.orderRepo.CountByIDs(ctx, tenantID, input.OrderIDs)
		if err != nil {
			return nil, err
		}
		return &CleanupResult{
			Operation:     "mark_delete_orders",
			AffectedCount: count,
			Preview:       true,
		}, nil
	}

	// Execute
	count, err := s.orderRepo.BulkDelete(ctx, tenantID, input.OrderIDs)
	if err != nil {
		return nil, err
	}
	return &CleanupResult{
		Operation:     "mark_delete_orders",
		AffectedCount: count,
		Preview:       false,
	}, nil
}
