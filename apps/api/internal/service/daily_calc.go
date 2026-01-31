package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

const autoCompleteNotes = "Auto-complete day change"

// bookingRepository defines the interface for booking data access.
type bookingRepository interface {
	GetByEmployeeAndDate(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) ([]model.Booking, error)
	GetByEmployeeAndDateRange(ctx context.Context, tenantID, employeeID uuid.UUID, startDate, endDate time.Time) ([]model.Booking, error)
	UpdateCalculatedTimes(ctx context.Context, updates map[uuid.UUID]int) error
	Create(ctx context.Context, booking *model.Booking) error
}

// employeeDayPlanRepository defines the interface for employee day plan data access.
type employeeDayPlanRepository interface {
	GetForEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeDayPlan, error)
}

// dayPlanLookup defines the interface for day plan lookup used in shift detection.
type dayPlanLookup interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.DayPlan, error)
}

// dailyValueRepository defines the interface for daily value data access.
type dailyValueRepository interface {
	Upsert(ctx context.Context, dv *model.DailyValue) error
	GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error)
}

// holidayLookup defines the interface for holiday date lookups in daily calculation.
// This is a subset of holidayRepository - the full interface is defined in holiday.go.
type holidayLookup interface {
	GetByDate(ctx context.Context, tenantID uuid.UUID, date time.Time) (*model.Holiday, error)
}

// employeeLookup provides employee data for daily calculation.
type employeeLookup interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// absenceDayLookup checks for absence days during daily calculation.
type absenceDayLookup interface {
	GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error)
}

// orderBookingCreator defines the interface for auto order booking creation used by daily calc.
type orderBookingCreator interface {
	CreateAutoBooking(ctx context.Context, tenantID, employeeID, orderID uuid.UUID, activityID *uuid.UUID, date time.Time, minutes int) (*model.OrderBooking, error)
	DeleteAutoBookingsByDate(ctx context.Context, employeeID uuid.UUID, date time.Time) error
}

// settingsLookup provides read-only access to system settings for calculation.
type settingsLookup interface {
	IsRoundingRelativeToPlan(ctx context.Context, tenantID uuid.UUID) (bool, error)
}

// dailyAccountValueWriter defines the interface for writing daily account value postings.
type dailyAccountValueWriter interface {
	Upsert(ctx context.Context, dav *model.DailyAccountValue) error
	DeleteByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) error
}

// DailyCalcService orchestrates daily time calculations.
type DailyCalcService struct {
	bookingRepo         bookingRepository
	empDayPlanRepo      employeeDayPlanRepository
	dayPlanRepo         dayPlanLookup
	dailyValueRepo      dailyValueRepository
	holidayRepo         holidayLookup
	employeeRepo        employeeLookup
	absenceDayRepo      absenceDayLookup
	calc                *calculation.Calculator
	notificationSvc     *NotificationService
	orderBookingSvc     orderBookingCreator
	settingsLookup      settingsLookup
	dailyAccountValRepo dailyAccountValueWriter
}

// NewDailyCalcService creates a new DailyCalcService instance.
func NewDailyCalcService(
	bookingRepo bookingRepository,
	empDayPlanRepo employeeDayPlanRepository,
	dayPlanRepo dayPlanLookup,
	dailyValueRepo dailyValueRepository,
	holidayRepo holidayLookup,
	employeeRepo employeeLookup,
	absenceDayRepo absenceDayLookup,
) *DailyCalcService {
	return &DailyCalcService{
		bookingRepo:    bookingRepo,
		empDayPlanRepo: empDayPlanRepo,
		dayPlanRepo:    dayPlanRepo,
		dailyValueRepo: dailyValueRepo,
		holidayRepo:    holidayRepo,
		employeeRepo:   employeeRepo,
		absenceDayRepo: absenceDayRepo,
		calc:           calculation.NewCalculator(),
	}
}

// SetNotificationService sets the notification service for calculation events.
func (s *DailyCalcService) SetNotificationService(notificationSvc *NotificationService) {
	s.notificationSvc = notificationSvc
}

// SetOrderBookingService sets the order booking service for target_with_order auto-booking.
func (s *DailyCalcService) SetOrderBookingService(orderBookingSvc orderBookingCreator) {
	s.orderBookingSvc = orderBookingSvc
}

// SetSettingsLookup sets the system settings lookup for calculation behavior (e.g., relative rounding).
func (s *DailyCalcService) SetSettingsLookup(lookup settingsLookup) {
	s.settingsLookup = lookup
}

// SetDailyAccountValueRepo sets the daily account value repository for net/cap account postings.
func (s *DailyCalcService) SetDailyAccountValueRepo(repo dailyAccountValueWriter) {
	s.dailyAccountValRepo = repo
}

// resolveTargetHours resolves the effective target hours for a day using the ZMI priority chain:
// 1. Employee master (DailyTargetHours) if day plan has FromEmployeeMaster=true
// 2. RegularHours2 if the day is an absence day
// 3. RegularHours (default)
func (s *DailyCalcService) resolveTargetHours(ctx context.Context, employeeID uuid.UUID, date time.Time, dp *model.DayPlan) int {
	if dp == nil {
		return 0
	}

	var employeeTargetMinutes *int
	if dp.FromEmployeeMaster {
		emp, err := s.employeeRepo.GetByID(ctx, employeeID)
		if err == nil && emp != nil && emp.DailyTargetHours != nil {
			minutes := int(emp.DailyTargetHours.InexactFloat64() * 60)
			employeeTargetMinutes = &minutes
		}
	}

	isAbsenceDay := false
	absence, err := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
	if err == nil && absence != nil && absence.IsApproved() {
		isAbsenceDay = true
	}

	return dp.GetEffectiveRegularHours(isAbsenceDay, employeeTargetMinutes)
}

// CalculateDay performs daily calculation for an employee on a specific date.
// Returns the calculated DailyValue (persisted) or nil if calculation should be skipped.
func (s *DailyCalcService) CalculateDay(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*model.DailyValue, error) {
	// 1. Check for holiday
	holiday, _ := s.holidayRepo.GetByDate(ctx, tenantID, date)
	isHoliday := holiday != nil
	holidayCategory := 0
	if holiday != nil {
		holidayCategory = holiday.Category
	}

	// 2. Get day plan (nil, nil = no plan assigned = off day)
	empDayPlan, err := s.empDayPlanRepo.GetForEmployeeDate(ctx, employeeID, date)
	if err != nil {
		return nil, err
	}

	// 3. Get bookings (include adjacent days based on day change behavior)
	bookings, err := s.loadBookingsForCalculation(ctx, tenantID, employeeID, date, empDayPlan)
	if err != nil {
		return nil, err
	}

	// 4. Handle special cases
	var dailyValue *model.DailyValue

	if empDayPlan == nil || empDayPlan.DayPlanID == nil {
		// Off day - no day plan assigned
		dailyValue = s.handleOffDay(employeeID, date, bookings)
	} else if isHoliday && len(bookings) == 0 {
		// Holiday without bookings - check for absence with priority override
		absence, _ := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
		if absence != nil && absence.IsApproved() && absence.AbsenceType != nil && absence.AbsenceType.Priority > 0 {
			// Absence has priority > 0: use absence credit instead of holiday credit
			dailyValue = s.handleAbsenceCredit(ctx, employeeID, date, empDayPlan, absence)
		} else {
			// No absence or absence priority == 0: use holiday credit (existing behavior)
			dailyValue = s.handleHolidayCredit(ctx, employeeID, date, empDayPlan, holidayCategory)
		}
	} else if len(bookings) == 0 {
		// No bookings, no holiday - apply no-booking behavior
		dailyValue, err = s.handleNoBookings(ctx, employeeID, date, empDayPlan)
		if err != nil {
			return nil, err
		}
		if dailyValue == nil {
			// Skip behavior - don't create/update daily value
			return nil, nil
		}
	} else {
		// Normal calculation with bookings
		dailyValue, err = s.calculateWithBookings(ctx, tenantID, employeeID, date, empDayPlan, bookings, isHoliday)
		if err != nil {
			return nil, err
		}
	}

	// 5. Set tenant and persist
	previousValue, _ := s.dailyValueRepo.GetByEmployeeDate(ctx, employeeID, date)
	dailyValue.TenantID = tenantID
	if err := s.dailyValueRepo.Upsert(ctx, dailyValue); err != nil {
		return nil, err
	}

	// 6. Post daily account values (net/cap) based on the day plan
	s.postDailyAccountValues(ctx, tenantID, employeeID, date, empDayPlan, dailyValue)

	// Notify on newly detected errors
	s.notifyDailyCalcError(ctx, tenantID, employeeID, date, previousValue, dailyValue)

	return dailyValue, nil
}

func (s *DailyCalcService) notifyDailyCalcError(
	ctx context.Context,
	tenantID, employeeID uuid.UUID,
	date time.Time,
	previousValue, currentValue *model.DailyValue,
) {
	if s.notificationSvc == nil || currentValue == nil {
		return
	}

	if !currentValue.HasError {
		return
	}

	if previousValue != nil && previousValue.HasError {
		return
	}

	dateLabel := date.Format("2006-01-02")
	link := fmt.Sprintf("/timesheet?view=day&date=%s", dateLabel)
	_, _ = s.notificationSvc.CreateForEmployee(ctx, tenantID, employeeID, CreateNotificationInput{
		Type:    model.NotificationTypeErrors,
		Title:   "Timesheet error",
		Message: fmt.Sprintf("Calculation error detected on %s.", dateLabel),
		Link:    &link,
	})
}

// postDailyAccountValues posts net time and/or capped time to the configured accounts
// on the day plan. If the day plan has a net_account_id, the daily net time is posted.
// If it has a cap_account_id and a max_net_work_time, any capped minutes are posted.
func (s *DailyCalcService) postDailyAccountValues(
	ctx context.Context,
	tenantID, employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	dailyValue *model.DailyValue,
) {
	if s.dailyAccountValRepo == nil {
		return
	}
	if dailyValue == nil {
		return
	}

	var dayPlan *model.DayPlan
	if empDayPlan != nil {
		dayPlan = empDayPlan.DayPlan
	}
	if dayPlan == nil {
		// No day plan -- clean up any previous postings for this date
		_ = s.dailyAccountValRepo.DeleteByEmployeeDate(ctx, employeeID, date)
		return
	}

	// Post net time to net account
	if dayPlan.NetAccountID != nil {
		dav := &model.DailyAccountValue{
			TenantID:     tenantID,
			EmployeeID:   employeeID,
			AccountID:    *dayPlan.NetAccountID,
			ValueDate:    date,
			ValueMinutes: dailyValue.NetTime,
			Source:       model.DailyAccountValueSourceNetTime,
			DayPlanID:    &dayPlan.ID,
		}
		_ = s.dailyAccountValRepo.Upsert(ctx, dav)
	}

	// Post capped minutes to cap account
	if dayPlan.CapAccountID != nil && dayPlan.MaxNetWorkTime != nil {
		cappedMinutes := 0
		if dailyValue.GrossTime > *dayPlan.MaxNetWorkTime {
			cappedMinutes = dailyValue.GrossTime - *dayPlan.MaxNetWorkTime
		}
		dav := &model.DailyAccountValue{
			TenantID:     tenantID,
			EmployeeID:   employeeID,
			AccountID:    *dayPlan.CapAccountID,
			ValueDate:    date,
			ValueMinutes: cappedMinutes,
			Source:       model.DailyAccountValueSourceCappedTime,
			DayPlanID:    &dayPlan.ID,
		}
		_ = s.dailyAccountValRepo.Upsert(ctx, dav)
	}
}

func (s *DailyCalcService) loadBookingsForCalculation(
	ctx context.Context,
	tenantID, employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
) ([]model.Booking, error) {
	if empDayPlan == nil || empDayPlan.DayPlan == nil {
		return s.bookingRepo.GetByEmployeeAndDate(ctx, tenantID, employeeID, date)
	}

	behavior := empDayPlan.DayPlan.DayChangeBehavior
	if behavior == "" || behavior == model.DayChangeNone {
		return s.bookingRepo.GetByEmployeeAndDate(ctx, tenantID, employeeID, date)
	}

	startDate := date.AddDate(0, 0, -1)
	endDate := date.AddDate(0, 0, 1)
	bookings, err := s.bookingRepo.GetByEmployeeAndDateRange(ctx, tenantID, employeeID, startDate, endDate)
	if err != nil {
		return nil, err
	}

	switch behavior {
	case model.DayChangeAtArrival, model.DayChangeAtDeparture:
		return applyDayChangeBehavior(date, behavior, bookings), nil
	case model.DayChangeAutoComplete:
		return s.applyAutoCompleteDayChange(ctx, tenantID, employeeID, date, bookings)
	default:
		return filterBookingsByDate(bookings, date), nil
	}
}

func (s *DailyCalcService) handleOffDay(employeeID uuid.UUID, date time.Time, bookings []model.Booking) *model.DailyValue {
	now := time.Now()
	dv := &model.DailyValue{
		EmployeeID:   employeeID,
		ValueDate:    date,
		Status:       model.DailyValueStatusCalculated,
		TargetTime:   0, // No target on off days
		CalculatedAt: &now,
		Warnings:     pq.StringArray{"OFF_DAY"},
	}

	if len(bookings) > 0 {
		// Has bookings on an off day - flag as warning
		dv.Warnings = append(dv.Warnings, "BOOKINGS_ON_OFF_DAY")
		dv.BookingCount = len(bookings)
	}

	return dv
}

func (s *DailyCalcService) handleHolidayCredit(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	holidayCategory int,
) *model.DailyValue {
	now := time.Now()
	dv := &model.DailyValue{
		EmployeeID:   employeeID,
		ValueDate:    date,
		Status:       model.DailyValueStatusCalculated,
		CalculatedAt: &now,
		Warnings:     pq.StringArray{"HOLIDAY"},
	}

	targetTime := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = s.resolveTargetHours(ctx, employeeID, date, empDayPlan.DayPlan)
	}
	dv.TargetTime = targetTime

	// ZMI: Use day plan credit for the holiday category.
	// If not configured, credit 0 (per ZMI spec).
	credit := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil && holidayCategory > 0 {
		credit = empDayPlan.DayPlan.GetHolidayCredit(holidayCategory)
	}

	dv.NetTime = credit
	dv.GrossTime = credit
	if credit < targetTime {
		dv.Undertime = targetTime - credit
	}

	return dv
}

// handleAbsenceCredit processes a day where an approved absence overrides a holiday via priority.
// Uses the absence type's portion to calculate credit instead of holiday credit.
func (s *DailyCalcService) handleAbsenceCredit(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	absence *model.AbsenceDay,
) *model.DailyValue {
	now := time.Now()
	dv := &model.DailyValue{
		EmployeeID:   employeeID,
		ValueDate:    date,
		Status:       model.DailyValueStatusCalculated,
		CalculatedAt: &now,
		Warnings:     pq.StringArray{"ABSENCE_ON_HOLIDAY"},
	}

	targetTime := 0
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = s.resolveTargetHours(ctx, employeeID, date, empDayPlan.DayPlan)
	}
	dv.TargetTime = targetTime

	// Use absence credit calculation: regelarbeitszeit * portion * duration
	credit := absence.CalculateCredit(targetTime)
	dv.NetTime = credit
	dv.GrossTime = credit
	if credit < targetTime {
		dv.Undertime = targetTime - credit
	}

	return dv
}

func (s *DailyCalcService) handleNoBookings(
	ctx context.Context,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
) (*model.DailyValue, error) {
	now := time.Now()
	targetTime := 0
	behavior := model.NoBookingError // default
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		targetTime = s.resolveTargetHours(ctx, employeeID, date, empDayPlan.DayPlan)
		behavior = empDayPlan.DayPlan.NoBookingBehavior
	}

	switch behavior {
	case model.NoBookingAdoptTarget:
		// ZMI: Sollzeit übernehmen — credit target time as if worked
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      targetTime,
			GrossTime:    targetTime,
			Warnings:     pq.StringArray{"NO_BOOKINGS_CREDITED"},
			CalculatedAt: &now,
		}, nil

	case model.NoBookingDeductTarget:
		// ZMI: Sollzeit abziehen — subtract target (undertime = target, no bookings)
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      0,
			GrossTime:    0,
			Undertime:    targetTime,
			Warnings:     pq.StringArray{"NO_BOOKINGS_DEDUCTED"},
			CalculatedAt: &now,
		}, nil

	case model.NoBookingVocationalSchool:
		// ZMI: Berufsschule — auto-create absence for past dates
		// TODO: Create absence day of configured type when absence workflow is integrated
		// For now, credit target time (vocational school days count as worked)
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      targetTime,
			GrossTime:    targetTime,
			Warnings:     pq.StringArray{"VOCATIONAL_SCHOOL", "ABSENCE_CREATION_NOT_IMPLEMENTED"},
			CalculatedAt: &now,
		}, nil

	case model.NoBookingTargetWithOrder:
		// ZMI: Sollzeit mit Auftrag — credit target time and create auto order booking
		warnings := pq.StringArray{"NO_BOOKINGS_CREDITED"}
		if s.orderBookingSvc != nil && targetTime > 0 {
			emp, empErr := s.employeeRepo.GetByID(ctx, employeeID)
			if empErr == nil && emp != nil && emp.DefaultOrderID != nil {
				// Delete any previous auto-bookings for this date, then create fresh
				_ = s.orderBookingSvc.DeleteAutoBookingsByDate(ctx, employeeID, date)
				_, obErr := s.orderBookingSvc.CreateAutoBooking(
					ctx,
					emp.TenantID,
					employeeID,
					*emp.DefaultOrderID,
					emp.DefaultActivityID,
					date,
					targetTime,
				)
				if obErr != nil {
					warnings = append(warnings, "ORDER_BOOKING_FAILED")
				} else {
					warnings = append(warnings, "ORDER_BOOKING_CREATED")
				}
			} else {
				warnings = append(warnings, "NO_DEFAULT_ORDER")
			}
		} else if s.orderBookingSvc == nil {
			warnings = append(warnings, "ORDER_BOOKING_NOT_IMPLEMENTED")
		}
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusCalculated,
			TargetTime:   targetTime,
			NetTime:      targetTime,
			GrossTime:    targetTime,
			Warnings:     warnings,
			CalculatedAt: &now,
		}, nil

	case model.NoBookingError:
		fallthrough
	default:
		// ZMI: Keine Auswertung — mark as error
		return &model.DailyValue{
			EmployeeID:   employeeID,
			ValueDate:    date,
			Status:       model.DailyValueStatusError,
			TargetTime:   targetTime,
			NetTime:      0,
			GrossTime:    0,
			Undertime:    targetTime,
			HasError:     true,
			ErrorCodes:   pq.StringArray{"NO_BOOKINGS"},
			CalculatedAt: &now,
		}, nil
	}
}

func applyDayChangeBehavior(
	date time.Time,
	behavior model.DayChangeBehavior,
	bookings []model.Booking,
) []model.Booking {
	prev, current, next := partitionBookingsByDate(bookings, date)
	pairs := pairWorkBookingsAcrossDays(prev, current, next)

	selected := make(map[uuid.UUID]model.Booking, len(current))
	for _, b := range current {
		selected[b.ID] = b
	}

	switch behavior {
	case model.DayChangeAtArrival:
		for _, pair := range pairs {
			if pair.arrival.offset == 0 && pair.departure.offset == 1 {
				selected[pair.departure.booking.ID] = pair.departure.booking
			}
			if pair.arrival.offset == -1 && pair.departure.offset == 0 {
				delete(selected, pair.departure.booking.ID)
			}
		}
	case model.DayChangeAtDeparture:
		for _, pair := range pairs {
			if pair.departure.offset == 0 && pair.arrival.offset == -1 {
				selected[pair.arrival.booking.ID] = pair.arrival.booking
			}
			if pair.departure.offset == 1 && pair.arrival.offset == 0 {
				delete(selected, pair.arrival.booking.ID)
			}
		}
	}

	return sortedBookings(selected)
}

func (s *DailyCalcService) applyAutoCompleteDayChange(
	ctx context.Context,
	tenantID, employeeID uuid.UUID,
	date time.Time,
	bookings []model.Booking,
) ([]model.Booking, error) {
	prev, current, next := partitionBookingsByDate(bookings, date)
	pairs := pairWorkBookingsAcrossDays(prev, current, next)

	selected := make(map[uuid.UUID]model.Booking, len(current))
	for _, b := range current {
		selected[b.ID] = b
	}

	nextDate := date.AddDate(0, 0, 1)
	for _, pair := range pairs {
		if pair.arrival.offset != 0 || pair.departure.offset != 1 {
			continue
		}
		if pair.arrival.booking.BookingType == nil || pair.departure.booking.BookingType == nil {
			return nil, fmt.Errorf("auto-complete day change requires booking types to be loaded")
		}

		goBooking, created, err := s.ensureAutoCompleteBooking(
			ctx,
			tenantID,
			employeeID,
			nextDate,
			pair.departure.booking.BookingType,
			model.BookingDirectionOut,
			bookings,
		)
		if err != nil {
			return nil, err
		}
		if created {
			bookings = append(bookings, goBooking)
			next = append(next, goBooking)
		}

		comeBooking, created, err := s.ensureAutoCompleteBooking(
			ctx,
			tenantID,
			employeeID,
			nextDate,
			pair.arrival.booking.BookingType,
			model.BookingDirectionIn,
			bookings,
		)
		if err != nil {
			return nil, err
		}
		if created {
			bookings = append(bookings, comeBooking)
			next = append(next, comeBooking)
		}

		selected[goBooking.ID] = goBooking
	}

	return sortedBookings(selected), nil
}

func (s *DailyCalcService) ensureAutoCompleteBooking(
	ctx context.Context,
	tenantID, employeeID uuid.UUID,
	date time.Time,
	bookingType *model.BookingType,
	direction model.BookingDirection,
	bookings []model.Booking,
) (model.Booking, bool, error) {
	for _, b := range bookings {
		if !sameDate(b.BookingDate, date) {
			continue
		}
		if b.Source != model.BookingSourceCorrection || b.Notes != autoCompleteNotes || b.EditedTime != 0 {
			continue
		}
		if b.BookingType != nil && b.BookingType.Direction == direction && b.BookingTypeID == bookingType.ID {
			return b, false, nil
		}
	}

	newBooking := model.Booking{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		BookingDate:   date,
		BookingTypeID: bookingType.ID,
		OriginalTime:  0,
		EditedTime:    0,
		Source:        model.BookingSourceCorrection,
		Notes:         autoCompleteNotes,
		BookingType:   bookingType,
	}

	if err := s.bookingRepo.Create(ctx, &newBooking); err != nil {
		return model.Booking{}, false, fmt.Errorf("failed to create auto-complete booking: %w", err)
	}

	return newBooking, true, nil
}

type crossDayBooking struct {
	booking model.Booking
	offset  int
	absTime int
}

type crossDayPair struct {
	arrival   crossDayBooking
	departure crossDayBooking
}

func pairWorkBookingsAcrossDays(prev, current, next []model.Booking) []crossDayPair {
	workBookings := make([]crossDayBooking, 0)
	appendWork := func(bookings []model.Booking, offset int) {
		for _, b := range bookings {
			if isBreakBooking(b) {
				continue
			}
			direction := bookingDirection(b)
			if direction != model.BookingDirectionIn && direction != model.BookingDirectionOut {
				continue
			}
			workBookings = append(workBookings, crossDayBooking{
				booking: b,
				offset:  offset,
				absTime: offset*1440 + b.EditedTime,
			})
		}
	}

	appendWork(prev, -1)
	appendWork(current, 0)
	appendWork(next, 1)

	sort.Slice(workBookings, func(i, j int) bool {
		if workBookings[i].absTime == workBookings[j].absTime {
			return workBookings[i].booking.ID.String() < workBookings[j].booking.ID.String()
		}
		return workBookings[i].absTime < workBookings[j].absTime
	})

	pairs := make([]crossDayPair, 0)
	openArrivals := make([]crossDayBooking, 0)

	for _, b := range workBookings {
		if bookingDirection(b.booking) == model.BookingDirectionIn {
			openArrivals = append(openArrivals, b)
			continue
		}
		if len(openArrivals) == 0 {
			continue
		}
		arrival := openArrivals[0]
		openArrivals = openArrivals[1:]
		pairs = append(pairs, crossDayPair{
			arrival:   arrival,
			departure: b,
		})
	}

	return pairs
}

func partitionBookingsByDate(bookings []model.Booking, date time.Time) (prev, current, next []model.Booking) {
	prevDate := date.AddDate(0, 0, -1)
	nextDate := date.AddDate(0, 0, 1)

	for _, b := range bookings {
		switch {
		case sameDate(b.BookingDate, prevDate):
			prev = append(prev, b)
		case sameDate(b.BookingDate, date):
			current = append(current, b)
		case sameDate(b.BookingDate, nextDate):
			next = append(next, b)
		}
	}
	return prev, current, next
}

func filterBookingsByDate(bookings []model.Booking, date time.Time) []model.Booking {
	selected := make(map[uuid.UUID]model.Booking, 0)
	for _, b := range bookings {
		if sameDate(b.BookingDate, date) {
			selected[b.ID] = b
		}
	}
	return sortedBookings(selected)
}

func sortedBookings(selected map[uuid.UUID]model.Booking) []model.Booking {
	result := make([]model.Booking, 0, len(selected))
	for _, b := range selected {
		result = append(result, b)
	}
	sort.Slice(result, func(i, j int) bool {
		di, dj := result[i].BookingDate, result[j].BookingDate
		if di.Equal(dj) {
			if result[i].EditedTime == result[j].EditedTime {
				return result[i].ID.String() < result[j].ID.String()
			}
			return result[i].EditedTime < result[j].EditedTime
		}
		return di.Before(dj)
	})
	return result
}

func sameDate(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

func isBreakBooking(b model.Booking) bool {
	if b.BookingType == nil {
		return false
	}
	return isBreakBookingType(b.BookingType.Code)
}

func isBreakBookingType(code string) bool {
	switch strings.ToUpper(code) {
	case "P1", "P2", "BREAK_START", "BREAK_END":
		return true
	default:
		return false
	}
}

func bookingDirection(b model.Booking) model.BookingDirection {
	if b.BookingType != nil && b.BookingType.Direction == model.BookingDirectionOut {
		return model.BookingDirectionOut
	}
	return model.BookingDirectionIn
}

type shiftDetectionLoader struct {
	ctx   context.Context
	repo  dayPlanLookup
	cache map[uuid.UUID]*model.DayPlan
}

func (l *shiftDetectionLoader) LoadShiftDetectionInput(id uuid.UUID) *calculation.ShiftDetectionInput {
	plan := l.loadPlan(id)
	if plan == nil {
		return nil
	}
	return buildShiftDetectionInput(plan)
}

func (l *shiftDetectionLoader) loadPlan(id uuid.UUID) *model.DayPlan {
	if l.repo == nil {
		return nil
	}
	if plan, ok := l.cache[id]; ok {
		return plan
	}
	plan, err := l.repo.GetByID(l.ctx, id)
	if err != nil {
		return nil
	}
	if l.cache != nil {
		l.cache[id] = plan
	}
	return plan
}

func buildShiftDetectionInput(plan *model.DayPlan) *calculation.ShiftDetectionInput {
	if plan == nil {
		return nil
	}
	return &calculation.ShiftDetectionInput{
		PlanID:             plan.ID,
		PlanCode:           plan.Code,
		ArriveFrom:         plan.ShiftDetectArriveFrom,
		ArriveTo:           plan.ShiftDetectArriveTo,
		DepartFrom:         plan.ShiftDetectDepartFrom,
		DepartTo:           plan.ShiftDetectDepartTo,
		AlternativePlanIDs: plan.GetAlternativePlanIDs(),
	}
}

func findFirstLastWorkBookings(bookings []model.Booking) (firstCome, lastGo *int) {
	for _, b := range bookings {
		if isBreakBooking(b) {
			continue
		}
		switch bookingDirection(b) {
		case model.BookingDirectionIn:
			if firstCome == nil || b.EditedTime < *firstCome {
				t := b.EditedTime
				firstCome = &t
			}
		case model.BookingDirectionOut:
			if lastGo == nil || b.EditedTime > *lastGo {
				t := b.EditedTime
				lastGo = &t
			}
		}
	}
	return firstCome, lastGo
}

func (s *DailyCalcService) calculateWithBookings(
	ctx context.Context,
	tenantID uuid.UUID,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	bookings []model.Booking,
	isHoliday bool,
) (*model.DailyValue, error) {
	dayPlan := empDayPlan.DayPlan
	var shiftResult *calculation.ShiftDetectionResult

	if dayPlan != nil && dayPlan.HasShiftDetection() {
		firstCome, lastGo := findFirstLastWorkBookings(bookings)
		loader := &shiftDetectionLoader{
			ctx:   ctx,
			repo:  s.dayPlanRepo,
			cache: make(map[uuid.UUID]*model.DayPlan),
		}
		detector := calculation.NewShiftDetector(loader)
		result := detector.DetectShift(buildShiftDetectionInput(dayPlan), firstCome, lastGo)
		shiftResult = &result

		if !result.IsOriginalPlan && result.MatchedPlanID != uuid.Nil && s.dayPlanRepo != nil {
			matchedPlan, err := s.dayPlanRepo.GetWithDetails(ctx, result.MatchedPlanID)
			if err != nil {
				return nil, err
			}
			if matchedPlan != nil {
				empDayPlan = &model.EmployeeDayPlan{
					ID:         empDayPlan.ID,
					TenantID:   empDayPlan.TenantID,
					EmployeeID: empDayPlan.EmployeeID,
					PlanDate:   empDayPlan.PlanDate,
					DayPlanID:  &matchedPlan.ID,
					DayPlan:    matchedPlan,
				}
				dayPlan = matchedPlan
			}
		}
	}

	// Build calculation input
	input := s.buildCalcInput(ctx, tenantID, employeeID, date, empDayPlan, bookings)

	// Run calculation
	result := s.calc.Calculate(input)

	// Apply shift detection errors
	if shiftResult != nil && shiftResult.HasError {
		result.ErrorCodes = append(result.ErrorCodes, shiftResult.ErrorCode)
		result.HasError = true
	}

	// Add holiday warning if applicable
	if isHoliday {
		result.Warnings = append(result.Warnings, "WORKED_ON_HOLIDAY")
	}

	// Convert to DailyValue
	dailyValue := s.resultToDailyValue(employeeID, date, result)

	// Update booking calculated times
	if len(result.CalculatedTimes) > 0 {
		if err := s.bookingRepo.UpdateCalculatedTimes(ctx, result.CalculatedTimes); err != nil {
			return nil, err
		}
	}

	return dailyValue, nil
}

func (s *DailyCalcService) buildCalcInput(
	ctx context.Context,
	tenantID uuid.UUID,
	employeeID uuid.UUID,
	date time.Time,
	empDayPlan *model.EmployeeDayPlan,
	bookings []model.Booking,
) calculation.CalculationInput {
	input := calculation.CalculationInput{
		EmployeeID: employeeID,
		Date:       date,
		Bookings:   make([]calculation.BookingInput, 0, len(bookings)),
	}

	// Convert day plan
	if empDayPlan != nil && empDayPlan.DayPlan != nil {
		dp := empDayPlan.DayPlan
		tolerance := calculation.ToleranceConfig{
			ComePlus:  dp.ToleranceComePlus,
			ComeMinus: dp.ToleranceComeMinus,
			GoPlus:    dp.ToleranceGoPlus,
			GoMinus:   dp.ToleranceGoMinus,
		}
		variableWorkTime := dp.VariableWorkTime

		switch dp.PlanType {
		case model.PlanTypeFlextime:
			// ZMI: flextime ignores Come+ and Go-; variable work time not applicable
			tolerance.ComePlus = 0
			tolerance.GoMinus = 0
			variableWorkTime = false
		case model.PlanTypeFixed:
			// ZMI: Come- only applies to fixed plans if variable work time is enabled
			if !dp.VariableWorkTime {
				tolerance.ComeMinus = 0
			}
		}

		// Resolve target hours using ZMI priority chain
		regularHours := s.resolveTargetHours(ctx, employeeID, date, dp)

		// Check system setting for relative rounding
		roundRelativeToPlan := false
		if s.settingsLookup != nil {
			if relRounding, err := s.settingsLookup.IsRoundingRelativeToPlan(ctx, tenantID); err == nil {
				roundRelativeToPlan = relRounding
			}
		}

		input.DayPlan = calculation.DayPlanInput{
			PlanType:            dp.PlanType,
			RegularHours:        regularHours,
			ComeFrom:            dp.ComeFrom,
			ComeTo:              dp.ComeTo,
			GoFrom:              dp.GoFrom,
			GoTo:                dp.GoTo,
			CoreStart:           dp.CoreStart,
			CoreEnd:             dp.CoreEnd,
			MinWorkTime:         dp.MinWorkTime,
			MaxNetWorkTime:      dp.MaxNetWorkTime,
			VariableWorkTime:    variableWorkTime,
			RoundAllBookings:    dp.RoundAllBookings,
			RoundRelativeToPlan: roundRelativeToPlan,
			Tolerance:           tolerance,
		}

		// Rounding - come
		if dp.RoundingComeType != nil {
			roundingType := calculation.RoundingType(*dp.RoundingComeType)
			config := &calculation.RoundingConfig{
				Type: roundingType,
			}
			// For interval-based rounding, use interval
			if dp.RoundingComeInterval != nil {
				config.Interval = *dp.RoundingComeInterval
			}
			// For add/subtract rounding, use add value
			if dp.RoundingComeAddValue != nil {
				config.AddValue = *dp.RoundingComeAddValue
			}
			input.DayPlan.RoundingCome = config
		}

		// Rounding - go
		if dp.RoundingGoType != nil {
			roundingType := calculation.RoundingType(*dp.RoundingGoType)
			config := &calculation.RoundingConfig{
				Type: roundingType,
			}
			// For interval-based rounding, use interval
			if dp.RoundingGoInterval != nil {
				config.Interval = *dp.RoundingGoInterval
			}
			// For add/subtract rounding, use add value
			if dp.RoundingGoAddValue != nil {
				config.AddValue = *dp.RoundingGoAddValue
			}
			input.DayPlan.RoundingGo = config
		}

		// Breaks
		for _, b := range dp.Breaks {
			input.DayPlan.Breaks = append(input.DayPlan.Breaks, calculation.BreakConfig{
				Type:              calculation.BreakType(b.BreakType),
				StartTime:         b.StartTime,
				EndTime:           b.EndTime,
				Duration:          b.Duration,
				AfterWorkMinutes:  b.AfterWorkMinutes,
				AutoDeduct:        b.AutoDeduct,
				IsPaid:            b.IsPaid,
				MinutesDifference: b.MinutesDifference,
			})
		}
	}

	// Convert bookings
	for _, b := range bookings {
		category := calculation.CategoryWork
		if b.BookingType != nil && isBreakBookingType(b.BookingType.Code) {
			category = calculation.CategoryBreak
		}

		direction := calculation.DirectionIn
		if b.BookingType != nil && b.BookingType.Direction == model.BookingDirectionOut {
			direction = calculation.DirectionOut
		}

		input.Bookings = append(input.Bookings, calculation.BookingInput{
			ID:        b.ID,
			Time:      b.EffectiveTime(),
			Direction: direction,
			Category:  category,
			PairID:    b.PairID,
		})
	}

	return input
}

func (s *DailyCalcService) resultToDailyValue(employeeID uuid.UUID, date time.Time, result calculation.CalculationResult) *model.DailyValue {
	now := time.Now()
	return &model.DailyValue{
		EmployeeID:         employeeID,
		ValueDate:          date,
		Status:             statusFromError(result.HasError),
		GrossTime:          result.GrossTime,
		NetTime:            result.NetTime,
		TargetTime:         result.TargetTime,
		Overtime:           result.Overtime,
		Undertime:          result.Undertime,
		BreakTime:          result.BreakTime,
		HasError:           result.HasError,
		ErrorCodes:         result.ErrorCodes,
		Warnings:           result.Warnings,
		FirstCome:          result.FirstCome,
		LastGo:             result.LastGo,
		BookingCount:       result.BookingCount,
		CalculatedAt:       &now,
		CalculationVersion: 1,
	}
}

func statusFromError(hasError bool) model.DailyValueStatus {
	if hasError {
		return model.DailyValueStatusError
	}
	return model.DailyValueStatusCalculated
}

// RecalculateRange recalculates daily values for a date range.
func (s *DailyCalcService) RecalculateRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (int, error) {
	count := 0
	for date := from; !date.After(to); date = date.AddDate(0, 0, 1) {
		_, err := s.CalculateDay(ctx, tenantID, employeeID, date)
		if err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}
