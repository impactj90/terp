package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

// Absence service errors.
var (
	ErrAbsenceNotFound      = errors.New("absence not found")
	ErrAbsenceNotPending    = errors.New("absence is not in pending status")
	ErrInvalidAbsenceType   = errors.New("invalid absence type")
	ErrAbsenceTypeInactive  = errors.New("absence type is inactive")
	ErrAbsenceAlreadyExists = errors.New("absence already exists on date")
	ErrInvalidAbsenceDates  = errors.New("from date must be before or equal to to date")
	ErrNoAbsenceDaysCreated = errors.New("no valid absence days in range (all dates skipped)")
	ErrAbsenceTypeNotFound  = errors.New("absence type not found")
	ErrCannotModifySystem   = errors.New("cannot modify system absence type")
	ErrAbsenceCodeExists    = errors.New("absence type code already exists")
	ErrInvalidCodePrefix    = errors.New("code prefix must match category: U for vacation, K for illness, S for special")
	ErrInvalidPortion       = errors.New("portion must be 0 (none), 1 (full), or 2 (half)")
	ErrAbsenceNotApproved   = errors.New("absence is not in approved status")
)

// absenceDayRepositoryForService defines the interface for absence day data access.
type absenceDayRepositoryForService interface {
	Create(ctx context.Context, ad *model.AbsenceDay) error
	CreateRange(ctx context.Context, days []model.AbsenceDay) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error)
	GetByEmployeeDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.AbsenceDay, error)
	GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
	ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error)
	ListAll(ctx context.Context, tenantID uuid.UUID, opts model.AbsenceListOptions) ([]model.AbsenceDay, error)
	Update(ctx context.Context, ad *model.AbsenceDay) error
	Delete(ctx context.Context, id uuid.UUID) error
	DeleteRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) error
}

// absenceTypeRepositoryForService defines the interface for absence type validation.
type absenceTypeRepositoryForService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceType, error)
	List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error)
	Create(ctx context.Context, at *model.AbsenceType) error
	Update(ctx context.Context, at *model.AbsenceType) error
	Delete(ctx context.Context, id uuid.UUID) error
	Upsert(ctx context.Context, at *model.AbsenceType) error
}

// holidayRepositoryForAbsence defines the interface for holiday lookups.
type holidayRepositoryForAbsence interface {
	GetByDateRange(ctx context.Context, tenantID uuid.UUID, from, to time.Time, departmentID *uuid.UUID) ([]model.Holiday, error)
}

// empDayPlanRepositoryForAbsence defines the interface for employee day plan lookups.
type empDayPlanRepositoryForAbsence interface {
	GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
}

// recalcServiceForAbsence defines the interface for triggering recalculation.
type recalcServiceForAbsence interface {
	TriggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time) (*RecalcResult, error)
	TriggerRecalcRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (*RecalcResult, error)
}

// vacationRecalculator defines the interface for recalculating vacation taken.
type vacationRecalculator interface {
	RecalculateTaken(ctx context.Context, employeeID uuid.UUID, year int) error
}

// AbsenceService handles absence business logic.
type AbsenceService struct {
	absenceDayRepo  absenceDayRepositoryForService
	absenceTypeRepo absenceTypeRepositoryForService
	holidayRepo     holidayRepositoryForAbsence
	empDayPlanRepo  empDayPlanRepositoryForAbsence
	recalcSvc       recalcServiceForAbsence
	notificationSvc *NotificationService
	vacationSvc     vacationRecalculator
}

// NewAbsenceService creates a new AbsenceService instance.
func NewAbsenceService(
	absenceDayRepo absenceDayRepositoryForService,
	absenceTypeRepo absenceTypeRepositoryForService,
	holidayRepo holidayRepositoryForAbsence,
	empDayPlanRepo empDayPlanRepositoryForAbsence,
	recalcSvc recalcServiceForAbsence,
) *AbsenceService {
	return &AbsenceService{
		absenceDayRepo:  absenceDayRepo,
		absenceTypeRepo: absenceTypeRepo,
		holidayRepo:     holidayRepo,
		empDayPlanRepo:  empDayPlanRepo,
		recalcSvc:       recalcSvc,
	}
}

// SetNotificationService sets the notification service for absence events.
func (s *AbsenceService) SetNotificationService(notificationSvc *NotificationService) {
	s.notificationSvc = notificationSvc
}

// SetVacationService sets the vacation service for recalculating taken vacation.
func (s *AbsenceService) SetVacationService(vacSvc vacationRecalculator) {
	s.vacationSvc = vacSvc
}

// CreateAbsenceRangeInput represents the input for creating absences over a date range.
type CreateAbsenceRangeInput struct {
	TenantID      uuid.UUID
	EmployeeID    uuid.UUID
	AbsenceTypeID uuid.UUID
	FromDate      time.Time
	ToDate        time.Time
	Duration      decimal.Decimal      // 1.00 = full day, 0.50 = half day
	HalfDayPeriod *model.HalfDayPeriod // Required when Duration = 0.5
	Status        model.AbsenceStatus  // Typically "pending" or "approved" for admin
	Notes         *string
	CreatedBy     *uuid.UUID
}

// CreateAbsenceRangeResult contains the result of a range creation.
type CreateAbsenceRangeResult struct {
	CreatedDays  []model.AbsenceDay
	SkippedDates []time.Time // Dates skipped (weekends, off-days, existing absences)
}

// ListTypes retrieves all absence types for a tenant, including system types.
func (s *AbsenceService) ListTypes(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error) {
	return s.absenceTypeRepo.List(ctx, tenantID, true)
}

// GetByID retrieves an absence day by ID.
func (s *AbsenceService) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}
	return ad, nil
}

// ListByEmployee retrieves all absence days for an employee.
func (s *AbsenceService) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.AbsenceDay, error) {
	return s.absenceDayRepo.ListByEmployee(ctx, employeeID)
}

// GetByEmployeeDateRange retrieves absence days for an employee within a date range.
func (s *AbsenceService) GetByEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error) {
	if from.After(to) {
		return nil, ErrInvalidAbsenceDates
	}
	return s.absenceDayRepo.GetByEmployeeDateRange(ctx, employeeID, from, to)
}

// ListAll returns filtered absences for a tenant, with Employee and AbsenceType preloaded.
func (s *AbsenceService) ListAll(ctx context.Context, tenantID uuid.UUID, opts model.AbsenceListOptions) ([]model.AbsenceDay, error) {
	return s.absenceDayRepo.ListAll(ctx, tenantID, opts)
}

// triggerVacationRecalc triggers vacation balance recalculation for the year of the given date.
func (s *AbsenceService) triggerVacationRecalc(ctx context.Context, employeeID uuid.UUID, date time.Time) {
	if s.vacationSvc == nil {
		return
	}
	_ = s.vacationSvc.RecalculateTaken(ctx, employeeID, date.Year())
}

// Approve transitions an absence from pending to approved.
// Sets status=approved, approved_by, approved_at=now.
// Triggers recalculation for the affected date and vacation balance.
func (s *AbsenceService) Approve(ctx context.Context, id, approvedBy uuid.UUID) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}

	if ad.Status != model.AbsenceStatusPending {
		return nil, ErrAbsenceNotPending
	}

	now := time.Now()
	ad.Status = model.AbsenceStatusApproved
	ad.ApprovedBy = &approvedBy
	ad.ApprovedAt = &now

	if err := s.absenceDayRepo.Update(ctx, ad); err != nil {
		return nil, err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, ad.TenantID, ad.EmployeeID, ad.AbsenceDate)

	// Recalculate vacation taken (weighted by day plan)
	s.triggerVacationRecalc(ctx, ad.EmployeeID, ad.AbsenceDate)

	// Notify employee about approval
	s.notifyAbsenceDecision(ctx, ad, model.AbsenceStatusApproved)

	return ad, nil
}

// Cancel transitions an absence from approved to cancelled.
// This is the reverse of Approve: it removes the absence from vacation calculations.
// Triggers recalculation for the affected date and vacation balance.
func (s *AbsenceService) Cancel(ctx context.Context, id uuid.UUID) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}

	if ad.Status != model.AbsenceStatusApproved {
		return nil, ErrAbsenceNotApproved
	}

	ad.Status = model.AbsenceStatusCancelled

	if err := s.absenceDayRepo.Update(ctx, ad); err != nil {
		return nil, err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, ad.TenantID, ad.EmployeeID, ad.AbsenceDate)

	// Recalculate vacation taken (absence removed from approved set)
	s.triggerVacationRecalc(ctx, ad.EmployeeID, ad.AbsenceDate)

	return ad, nil
}

// Reject transitions an absence from pending to rejected.
// Sets status=rejected, rejection_reason=reason.
// Triggers recalculation for the affected date.
func (s *AbsenceService) Reject(ctx context.Context, id uuid.UUID, reason string) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}

	if ad.Status != model.AbsenceStatusPending {
		return nil, ErrAbsenceNotPending
	}

	ad.Status = model.AbsenceStatusRejected
	if reason != "" {
		ad.RejectionReason = &reason
	}

	if err := s.absenceDayRepo.Update(ctx, ad); err != nil {
		return nil, err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, ad.TenantID, ad.EmployeeID, ad.AbsenceDate)

	// Notify employee about rejection
	s.notifyAbsenceDecision(ctx, ad, model.AbsenceStatusRejected)

	return ad, nil
}

// Delete deletes a single absence day by ID and triggers recalculation.
// If the deleted absence was approved, also triggers vacation balance recalculation.
func (s *AbsenceService) Delete(ctx context.Context, id uuid.UUID) error {
	// Get the absence to know the employee/date for recalc
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return ErrAbsenceNotFound
	}

	// Store values for recalc before deletion
	tenantID := ad.TenantID
	employeeID := ad.EmployeeID
	absenceDate := ad.AbsenceDate
	wasApproved := ad.Status == model.AbsenceStatusApproved

	// Delete the absence day
	if err := s.absenceDayRepo.Delete(ctx, id); err != nil {
		return err
	}

	// Trigger recalculation for the affected date
	_, _ = s.recalcSvc.TriggerRecalc(ctx, tenantID, employeeID, absenceDate)

	// If the deleted absence was approved, recalculate vacation balance
	if wasApproved {
		s.triggerVacationRecalc(ctx, employeeID, absenceDate)
	}

	return nil
}

// UpdateAbsenceInput defines the input for updating an absence day.
type UpdateAbsenceInput struct {
	Duration      *decimal.Decimal
	HalfDayPeriod *model.HalfDayPeriod
	Notes         *string
}

// Update modifies a pending absence day's editable fields.
// Only pending absences can be updated (approved/rejected cannot).
func (s *AbsenceService) Update(ctx context.Context, id uuid.UUID, input UpdateAbsenceInput) (*model.AbsenceDay, error) {
	ad, err := s.absenceDayRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceNotFound
	}

	// Only pending absences can be edited
	if ad.Status != model.AbsenceStatusPending {
		return nil, ErrAbsenceNotPending
	}

	// Apply updates
	if input.Duration != nil {
		ad.Duration = *input.Duration
	}
	if input.HalfDayPeriod != nil {
		ad.HalfDayPeriod = input.HalfDayPeriod
	}
	if input.Notes != nil {
		ad.Notes = input.Notes
	}

	if err := s.absenceDayRepo.Update(ctx, ad); err != nil {
		return nil, err
	}

	// Trigger recalculation in case duration changed
	_, _ = s.recalcSvc.TriggerRecalc(ctx, ad.TenantID, ad.EmployeeID, ad.AbsenceDate)

	return ad, nil
}

// DeleteRange deletes all absence days for an employee within a date range and triggers recalculation.
func (s *AbsenceService) DeleteRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) error {
	if from.After(to) {
		return ErrInvalidAbsenceDates
	}

	// Delete all absence days in the range
	if err := s.absenceDayRepo.DeleteRange(ctx, employeeID, from, to); err != nil {
		return err
	}

	// Trigger recalculation for the affected range
	_, _ = s.recalcSvc.TriggerRecalcRange(ctx, tenantID, employeeID, from, to)

	return nil
}

// CreateRange creates absence days for a date range, skipping weekends and off-days.
// Holidays are NOT skipped — absences can be created on holidays per ZMI spec.
// Dates with existing absences are also skipped (not an error).
// Returns the created days and all skipped dates.
func (s *AbsenceService) CreateRange(ctx context.Context, input CreateAbsenceRangeInput) (*CreateAbsenceRangeResult, error) {
	// Validate date range
	if input.FromDate.After(input.ToDate) {
		return nil, ErrInvalidAbsenceDates
	}

	// Validate absence type exists and is active
	absenceType, err := s.absenceTypeRepo.GetByID(ctx, input.AbsenceTypeID)
	if err != nil {
		return nil, ErrInvalidAbsenceType
	}
	if !absenceType.IsActive {
		return nil, ErrAbsenceTypeInactive
	}
	// Validate absence type is accessible by tenant (system types have nil TenantID)
	if absenceType.TenantID != nil && *absenceType.TenantID != input.TenantID {
		return nil, ErrInvalidAbsenceType
	}

	// NOTE: Holiday fetch removed — holidays no longer block absence creation.
	// Priority resolution happens in daily calculation (CalculateDay).

	// Batch-fetch day plans for the range
	dayPlans, err := s.empDayPlanRepo.GetForEmployeeDateRange(ctx, input.EmployeeID, input.FromDate, input.ToDate)
	if err != nil {
		return nil, err
	}
	dayPlanMap := buildDayPlanMap(dayPlans)

	// Iterate through each date in the range
	var daysToCreate []model.AbsenceDay
	var skippedDates []time.Time

	current := normalizeDate(input.FromDate)
	toDate := normalizeDate(input.ToDate)
	for !current.After(toDate) {
		// Check if date should be skipped (weekend/off-day)
		skip, _ := s.shouldSkipDate(current, dayPlanMap)
		if skip {
			skippedDates = append(skippedDates, current)
			current = current.AddDate(0, 0, 1)
			continue
		}

		// Check if absence already exists on this date
		existing, err := s.absenceDayRepo.GetByEmployeeDate(ctx, input.EmployeeID, current)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			skippedDates = append(skippedDates, current)
			current = current.AddDate(0, 0, 1)
			continue
		}

		// Build absence day record
		ad := model.AbsenceDay{
			TenantID:      input.TenantID,
			EmployeeID:    input.EmployeeID,
			AbsenceDate:   current,
			AbsenceTypeID: input.AbsenceTypeID,
			Duration:      input.Duration,
			HalfDayPeriod: input.HalfDayPeriod,
			Status:        input.Status,
			Notes:         input.Notes,
			CreatedBy:     input.CreatedBy,
		}
		daysToCreate = append(daysToCreate, ad)

		current = current.AddDate(0, 0, 1)
	}

	// Check that at least one day was created
	if len(daysToCreate) == 0 {
		return nil, ErrNoAbsenceDaysCreated
	}

	// Batch-create all absence days
	if err := s.absenceDayRepo.CreateRange(ctx, daysToCreate); err != nil {
		return nil, err
	}

	// Trigger recalculation for the affected range
	_, _ = s.recalcSvc.TriggerRecalcRange(ctx, input.TenantID, input.EmployeeID, input.FromDate, input.ToDate)

	// Notify admins about pending absence requests
	if input.Status == model.AbsenceStatusPending {
		s.notifyPendingAbsence(ctx, input, absenceType)
	}

	return &CreateAbsenceRangeResult{
		CreatedDays:  daysToCreate,
		SkippedDates: skippedDates,
	}, nil
}

func (s *AbsenceService) notifyPendingAbsence(ctx context.Context, input CreateAbsenceRangeInput, absenceType *model.AbsenceType) {
	if s.notificationSvc == nil {
		return
	}

	fromDate := normalizeDate(input.FromDate)
	toDate := normalizeDate(input.ToDate)
	dateLabel := fromDate.Format("2006-01-02")
	if !fromDate.Equal(toDate) {
		dateLabel = fmt.Sprintf("%s to %s", fromDate.Format("2006-01-02"), toDate.Format("2006-01-02"))
	}

	absenceTypeName := "Absence"
	if absenceType != nil && absenceType.Name != "" {
		absenceTypeName = absenceType.Name
	}

	link := "/admin/approvals"
	_, _ = s.notificationSvc.CreateForTenantAdmins(ctx, input.TenantID, CreateNotificationInput{
		Type:    model.NotificationTypeReminders,
		Title:   "Absence approval required",
		Message: fmt.Sprintf("%s request for %s is pending approval.", absenceTypeName, dateLabel),
		Link:    &link,
	})
}

func (s *AbsenceService) notifyAbsenceDecision(ctx context.Context, absence *model.AbsenceDay, status model.AbsenceStatus) {
	if s.notificationSvc == nil || absence == nil {
		return
	}

	absenceTypeName := "Absence"
	if absence.AbsenceType != nil && absence.AbsenceType.Name != "" {
		absenceTypeName = absence.AbsenceType.Name
	}

	dateLabel := normalizeDate(absence.AbsenceDate).Format("2006-01-02")
	link := "/absences"

	var title string
	var message string
	if status == model.AbsenceStatusApproved {
		title = "Absence approved"
		message = fmt.Sprintf("%s on %s was approved.", absenceTypeName, dateLabel)
	} else if status == model.AbsenceStatusRejected {
		title = "Absence rejected"
		message = fmt.Sprintf("%s on %s was rejected.", absenceTypeName, dateLabel)
		if absence.RejectionReason != nil && *absence.RejectionReason != "" {
			message = fmt.Sprintf("%s (Reason: %s)", message, *absence.RejectionReason)
		}
	} else {
		return
	}

	_, _ = s.notificationSvc.CreateForEmployee(ctx, absence.TenantID, absence.EmployeeID, CreateNotificationInput{
		Type:    model.NotificationTypeApprovals,
		Title:   title,
		Message: message,
		Link:    &link,
	})
}

// buildHolidaySet creates a set of holiday dates for O(1) lookup.
func buildHolidaySet(holidays []model.Holiday) map[time.Time]bool {
	set := make(map[time.Time]bool, len(holidays))
	for _, h := range holidays {
		date := normalizeDate(h.HolidayDate)
		set[date] = true
	}
	return set
}

// buildDayPlanMap creates a map from date to day plan for O(1) lookup.
func buildDayPlanMap(plans []model.EmployeeDayPlan) map[time.Time]*model.EmployeeDayPlan {
	m := make(map[time.Time]*model.EmployeeDayPlan, len(plans))
	for i := range plans {
		date := normalizeDate(plans[i].PlanDate)
		m[date] = &plans[i]
	}
	return m
}

// skipReason describes why a date was skipped during absence range creation.
type skipReason string

const (
	skipReasonWeekend  skipReason = "weekend"
	skipReasonHoliday  skipReason = "holiday"
	skipReasonOffDay   skipReason = "off_day"
	skipReasonNoPlan   skipReason = "no_plan"
	skipReasonExisting skipReason = "existing_absence"
)

// shouldSkipDate determines whether to skip creating an absence on this date.
// Skips: weekends, off-days (no plan or DayPlanID == nil).
// Does NOT skip holidays — absences are allowed on holidays per ZMI spec (Section 18.2).
// Priority-based resolution between holiday and absence happens in daily calculation.
func (s *AbsenceService) shouldSkipDate(
	date time.Time,
	dayPlanMap map[time.Time]*model.EmployeeDayPlan,
) (bool, skipReason) {
	normalized := normalizeDate(date)

	// Skip weekends
	weekday := normalized.Weekday()
	if weekday == time.Saturday || weekday == time.Sunday {
		return true, skipReasonWeekend
	}

	// NOTE: Holidays are NOT skipped. Per ZMI spec (Section 18.2),
	// absences may be created on holidays. Priority-based resolution
	// happens in daily calculation (CalculateDay).

	// Skip off-days: no plan record means no scheduled work
	plan, exists := dayPlanMap[normalized]
	if !exists {
		return true, skipReasonNoPlan
	}
	// Explicit off day: plan exists but DayPlanID is nil
	if plan.DayPlanID == nil {
		return true, skipReasonOffDay
	}

	return false, ""
}

// CreateAutoAbsenceByCode creates an absence day automatically by looking up the absence type by code.
// Used by daily calculation for vocational school auto-absence creation.
// Idempotent: returns the existing absence if one already exists for the date.
func (s *AbsenceService) CreateAutoAbsenceByCode(ctx context.Context, tenantID, employeeID uuid.UUID, date time.Time, absenceTypeCode string) (*model.AbsenceDay, error) {
	// 1. Idempotency check: return existing absence if present
	existing, err := s.absenceDayRepo.GetByEmployeeDate(ctx, employeeID, date)
	if err != nil {
		return nil, fmt.Errorf("check existing absence: %w", err)
	}
	if existing != nil {
		return existing, nil
	}

	// 2. Look up absence type by code
	absenceType, err := s.absenceTypeRepo.GetByCode(ctx, tenantID, absenceTypeCode)
	if err != nil {
		return nil, fmt.Errorf("absence type %q not found: %w", absenceTypeCode, err)
	}

	// 3. Create the absence day with approved status
	now := time.Now()
	notes := "Auto-created by vocational school day plan"
	ad := &model.AbsenceDay{
		TenantID:      tenantID,
		EmployeeID:    employeeID,
		AbsenceDate:   normalizeDate(date),
		AbsenceTypeID: absenceType.ID,
		Duration:      decimal.NewFromInt(1),
		Status:        model.AbsenceStatusApproved,
		ApprovedAt:    &now,
		Notes:         &notes,
	}

	if err := s.absenceDayRepo.Create(ctx, ad); err != nil {
		return nil, fmt.Errorf("create auto absence: %w", err)
	}

	ad.AbsenceType = absenceType
	return ad, nil
}

// normalizeDate strips time components, keeping only the date at midnight UTC.
func normalizeDate(d time.Time) time.Time {
	return time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
}

// UpsertDevAbsenceType ensures a dev absence type exists in the database as a system type.
func (s *AbsenceService) UpsertDevAbsenceType(ctx context.Context, at *model.AbsenceType) error {
	return s.absenceTypeRepo.Upsert(ctx, at)
}

// GetTypeByID retrieves an absence type by ID.
func (s *AbsenceService) GetTypeByID(ctx context.Context, tenantID, id uuid.UUID) (*model.AbsenceType, error) {
	at, err := s.absenceTypeRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAbsenceTypeNotFound
	}
	// Verify access: type must be a system type (nil tenant) or belong to this tenant
	if at.TenantID != nil && *at.TenantID != tenantID {
		return nil, ErrAbsenceTypeNotFound
	}
	return at, nil
}

// ValidateAbsenceType validates portion and code prefix per category.
func ValidateAbsenceType(at *model.AbsenceType) error {
	// Validate portion value
	if at.Portion != model.AbsencePortionNone &&
		at.Portion != model.AbsencePortionFull &&
		at.Portion != model.AbsencePortionHalf {
		return ErrInvalidPortion
	}

	// Validate code prefix per category
	code := strings.TrimSpace(at.Code)
	if code == "" {
		return errors.New("absence type code is required")
	}
	prefix := strings.ToUpper(code[:1])
	switch at.Category {
	case model.AbsenceCategoryVacation:
		if prefix != "U" {
			return fmt.Errorf("%w: vacation types must start with U, got %q", ErrInvalidCodePrefix, code)
		}
	case model.AbsenceCategoryIllness:
		if prefix != "K" {
			return fmt.Errorf("%w: illness types must start with K, got %q", ErrInvalidCodePrefix, code)
		}
	case model.AbsenceCategorySpecial:
		if prefix != "S" {
			return fmt.Errorf("%w: special types must start with S, got %q", ErrInvalidCodePrefix, code)
		}
	case model.AbsenceCategoryUnpaid:
		// Unpaid types use U prefix per ZMI convention (e.g., UU)
		if prefix != "U" {
			return fmt.Errorf("%w: unpaid types must start with U, got %q", ErrInvalidCodePrefix, code)
		}
	}
	return nil
}

// CreateType creates a new tenant-specific absence type.
func (s *AbsenceService) CreateType(ctx context.Context, at *model.AbsenceType) (*model.AbsenceType, error) {
	if err := ValidateAbsenceType(at); err != nil {
		return nil, err
	}

	// Check if code already exists for this tenant
	existing, err := s.absenceTypeRepo.GetByCode(ctx, *at.TenantID, at.Code)
	if err == nil && existing != nil {
		// Code exists - check if it's a tenant-specific override or duplicate
		if existing.TenantID != nil && *existing.TenantID == *at.TenantID {
			return nil, ErrAbsenceCodeExists
		}
	}

	// Force tenant-specific, not system
	at.IsSystem = false

	if err := s.absenceTypeRepo.Create(ctx, at); err != nil {
		return nil, err
	}
	return at, nil
}

// UpdateType updates an existing absence type (cannot update system types).
func (s *AbsenceService) UpdateType(ctx context.Context, at *model.AbsenceType) (*model.AbsenceType, error) {
	existing, err := s.absenceTypeRepo.GetByID(ctx, at.ID)
	if err != nil {
		return nil, ErrAbsenceTypeNotFound
	}

	// Cannot modify system types
	if existing.IsSystem {
		return nil, ErrCannotModifySystem
	}

	// Verify ownership
	if existing.TenantID == nil || *existing.TenantID != *at.TenantID {
		return nil, ErrAbsenceTypeNotFound
	}

	// Preserve immutable fields
	at.IsSystem = existing.IsSystem
	at.CreatedAt = existing.CreatedAt

	if err := ValidateAbsenceType(at); err != nil {
		return nil, err
	}

	if err := s.absenceTypeRepo.Update(ctx, at); err != nil {
		return nil, err
	}
	return at, nil
}

// DeleteType deletes an absence type (cannot delete system types).
func (s *AbsenceService) DeleteType(ctx context.Context, tenantID, id uuid.UUID) error {
	existing, err := s.absenceTypeRepo.GetByID(ctx, id)
	if err != nil {
		return ErrAbsenceTypeNotFound
	}

	// Cannot delete system types
	if existing.IsSystem {
		return ErrCannotModifySystem
	}

	// Verify ownership
	if existing.TenantID == nil || *existing.TenantID != tenantID {
		return ErrAbsenceTypeNotFound
	}

	return s.absenceTypeRepo.Delete(ctx, id)
}
