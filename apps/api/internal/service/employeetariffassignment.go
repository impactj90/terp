package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

// Sentinel errors for employee tariff assignment operations.
var (
	ErrAssignmentNotFound         = errors.New("tariff assignment not found")
	ErrAssignmentOverlap          = errors.New("overlapping tariff assignment exists for this date range")
	ErrAssignmentInvalidDates     = errors.New("effective_to must be on or after effective_from")
	ErrAssignmentEmployeeNotFound = errors.New("employee not found")
	ErrAssignmentTariffNotFound   = errors.New("tariff not found")
	ErrAssignmentTariffRequired   = errors.New("tariff_id is required")
	ErrAssignmentDateRequired     = errors.New("effective_from is required")
)

// employeeTariffAssignmentRepository defines the interface for assignment data access.
type employeeTariffAssignmentRepository interface {
	Create(ctx context.Context, assignment *model.EmployeeTariffAssignment) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeTariffAssignment, error)
	Update(ctx context.Context, assignment *model.EmployeeTariffAssignment) error
	Delete(ctx context.Context, id uuid.UUID) error
	ListByEmployee(ctx context.Context, employeeID uuid.UUID, activeOnly bool) ([]model.EmployeeTariffAssignment, error)
	GetEffectiveForDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeTariffAssignment, error)
	GetEffectiveForDateBatch(ctx context.Context, employeeIDs []uuid.UUID, date time.Time) (map[uuid.UUID]*model.EmployeeTariffAssignment, error)
	HasOverlap(ctx context.Context, employeeID uuid.UUID, from time.Time, to *time.Time, excludeID *uuid.UUID) (bool, error)
}

// employeeRepositoryForAssignment defines the interface for employee lookup.
type employeeRepositoryForAssignment interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// tariffRepositoryForAssignment defines the interface for tariff lookup.
type tariffRepositoryForAssignment interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
}

// assignmentDayPlanRepository defines the interface for day plan data access used by assignment sync.
type assignmentDayPlanRepository interface {
	GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
	BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error
	DeleteRangeBySource(ctx context.Context, employeeID uuid.UUID, from, to time.Time, source model.EmployeeDayPlanSource) error
}

// recalcServiceForAssignment defines the interface for triggering recalculation after day plan changes.
type recalcServiceForAssignment interface {
	TriggerRecalcRange(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) (*RecalcResult, error)
}

// EmployeeTariffAssignmentService handles business logic for tariff assignments.
type EmployeeTariffAssignmentService struct {
	assignmentRepo employeeTariffAssignmentRepository
	employeeRepo   employeeRepositoryForAssignment
	tariffRepo     tariffRepositoryForAssignment
	dayPlanRepo    assignmentDayPlanRepository
	recalcSvc      recalcServiceForAssignment
}

// NewEmployeeTariffAssignmentService creates a new employee tariff assignment service.
func NewEmployeeTariffAssignmentService(
	assignmentRepo employeeTariffAssignmentRepository,
	employeeRepo employeeRepositoryForAssignment,
	tariffRepo tariffRepositoryForAssignment,
	dayPlanRepo assignmentDayPlanRepository,
) *EmployeeTariffAssignmentService {
	return &EmployeeTariffAssignmentService{
		assignmentRepo: assignmentRepo,
		employeeRepo:   employeeRepo,
		tariffRepo:     tariffRepo,
		dayPlanRepo:    dayPlanRepo,
	}
}

// SetRecalcService sets the recalculation service for triggering daily value recalc after day plan changes.
func (s *EmployeeTariffAssignmentService) SetRecalcService(recalcSvc recalcServiceForAssignment) {
	s.recalcSvc = recalcSvc
}

// CreateEmployeeTariffAssignmentInput represents the input for creating a tariff assignment.
type CreateEmployeeTariffAssignmentInput struct {
	TenantID          uuid.UUID
	EmployeeID        uuid.UUID
	TariffID          uuid.UUID
	EffectiveFrom     time.Time
	EffectiveTo       *time.Time
	OverwriteBehavior model.OverwriteBehavior
	Notes             string
}

// UpdateEmployeeTariffAssignmentInput represents the input for updating a tariff assignment.
type UpdateEmployeeTariffAssignmentInput struct {
	EffectiveFrom     *time.Time
	EffectiveTo       *time.Time
	ClearEffectiveTo  bool
	OverwriteBehavior *model.OverwriteBehavior
	Notes             *string
	IsActive          *bool
}

// EffectiveTariffResult represents the resolved effective tariff for an employee at a date.
type EffectiveTariffResult struct {
	EmployeeID uuid.UUID                       `json:"employee_id"`
	Date       time.Time                       `json:"date"`
	Source     string                          `json:"source"` // "assignment", "default", "none"
	Tariff     *model.Tariff                   `json:"tariff,omitempty"`
	Assignment *model.EmployeeTariffAssignment `json:"assignment,omitempty"`
}

// Create creates a new tariff assignment with validation.
func (s *EmployeeTariffAssignmentService) Create(ctx context.Context, input CreateEmployeeTariffAssignmentInput) (*model.EmployeeTariffAssignment, error) {
	// Validate required fields
	if input.TariffID == uuid.Nil {
		return nil, ErrAssignmentTariffRequired
	}
	if input.EffectiveFrom.IsZero() {
		return nil, ErrAssignmentDateRequired
	}

	// Validate date range
	if input.EffectiveTo != nil && input.EffectiveTo.Before(input.EffectiveFrom) {
		return nil, ErrAssignmentInvalidDates
	}

	// Verify employee exists
	_, err := s.employeeRepo.GetByID(ctx, input.EmployeeID)
	if err != nil {
		return nil, ErrAssignmentEmployeeNotFound
	}

	// Verify tariff exists
	_, err = s.tariffRepo.GetByID(ctx, input.TariffID)
	if err != nil {
		return nil, ErrAssignmentTariffNotFound
	}

	// Check for overlapping assignments
	hasOverlap, err := s.assignmentRepo.HasOverlap(ctx, input.EmployeeID, input.EffectiveFrom, input.EffectiveTo, nil)
	if err != nil {
		return nil, err
	}
	if hasOverlap {
		return nil, ErrAssignmentOverlap
	}

	// Default overwrite behavior
	overwriteBehavior := input.OverwriteBehavior
	if overwriteBehavior == "" {
		overwriteBehavior = model.OverwriteBehaviorPreserveManual
	}

	assignment := &model.EmployeeTariffAssignment{
		TenantID:          input.TenantID,
		EmployeeID:        input.EmployeeID,
		TariffID:          input.TariffID,
		EffectiveFrom:     input.EffectiveFrom,
		EffectiveTo:       input.EffectiveTo,
		OverwriteBehavior: overwriteBehavior,
		Notes:             input.Notes,
		IsActive:          true,
	}

	if err := s.assignmentRepo.Create(ctx, assignment); err != nil {
		return nil, err
	}

	// Re-fetch with preloaded relations
	created, err := s.assignmentRepo.GetByID(ctx, assignment.ID)
	if err != nil {
		return nil, err
	}

	// Sync day plans for the new assignment
	if s.dayPlanRepo != nil {
		if err := s.syncDayPlansForAssignment(ctx, created); err != nil {
			return nil, err
		}
	}

	return created, nil
}

// GetByID retrieves a tariff assignment by ID.
func (s *EmployeeTariffAssignmentService) GetByID(ctx context.Context, id uuid.UUID) (*model.EmployeeTariffAssignment, error) {
	assignment, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrAssignmentNotFound
	}
	return assignment, nil
}

// Update updates a tariff assignment.
func (s *EmployeeTariffAssignmentService) Update(ctx context.Context, assignmentID uuid.UUID, tenantID uuid.UUID, input UpdateEmployeeTariffAssignmentInput) (*model.EmployeeTariffAssignment, error) {
	// Fetch existing assignment
	assignment, err := s.assignmentRepo.GetByID(ctx, assignmentID)
	if err != nil {
		return nil, ErrAssignmentNotFound
	}

	// Verify tenant matches
	if assignment.TenantID != tenantID {
		return nil, ErrAssignmentNotFound
	}

	// Capture old date range for potential resync
	oldEffectiveFrom := assignment.EffectiveFrom
	oldEffectiveTo := assignment.EffectiveTo

	// Apply partial updates
	datesChanged := false

	if input.EffectiveFrom != nil {
		assignment.EffectiveFrom = *input.EffectiveFrom
		datesChanged = true
	}

	if input.ClearEffectiveTo {
		assignment.EffectiveTo = nil
		datesChanged = true
	} else if input.EffectiveTo != nil {
		assignment.EffectiveTo = input.EffectiveTo
		datesChanged = true
	}

	if input.OverwriteBehavior != nil {
		assignment.OverwriteBehavior = *input.OverwriteBehavior
	}

	if input.Notes != nil {
		assignment.Notes = *input.Notes
	}

	if input.IsActive != nil {
		assignment.IsActive = *input.IsActive
	}

	// Validate dates if changed
	if assignment.EffectiveTo != nil && assignment.EffectiveTo.Before(assignment.EffectiveFrom) {
		return nil, ErrAssignmentInvalidDates
	}

	// Check for overlapping assignments if dates changed
	if datesChanged {
		hasOverlap, err := s.assignmentRepo.HasOverlap(ctx, assignment.EmployeeID, assignment.EffectiveFrom, assignment.EffectiveTo, &assignmentID)
		if err != nil {
			return nil, err
		}
		if hasOverlap {
			return nil, ErrAssignmentOverlap
		}
	}

	if err := s.assignmentRepo.Update(ctx, assignment); err != nil {
		return nil, err
	}

	// Re-fetch with preloaded relations
	updated, err := s.assignmentRepo.GetByID(ctx, assignment.ID)
	if err != nil {
		return nil, err
	}

	// Always resync day plans on update — handles both date changes and
	// assignments created before the sync feature was deployed.
	if s.dayPlanRepo != nil {
		if datesChanged {
			// Resync old range back to default tariff first
			if err := s.resyncDateRangeFromDefault(ctx, assignment.EmployeeID, oldEffectiveFrom, oldEffectiveTo); err != nil {
				return nil, err
			}
		}
		// Sync current range from the (possibly updated) assignment
		if err := s.syncDayPlansForAssignment(ctx, updated); err != nil {
			return nil, err
		}
	}

	return updated, nil
}

// Delete deletes a tariff assignment.
func (s *EmployeeTariffAssignmentService) Delete(ctx context.Context, id uuid.UUID) error {
	// Fetch assignment (needed for date range resync)
	assignment, err := s.assignmentRepo.GetByID(ctx, id)
	if err != nil {
		return ErrAssignmentNotFound
	}

	// Capture date range before deletion
	effectiveFrom := assignment.EffectiveFrom
	effectiveTo := assignment.EffectiveTo
	employeeID := assignment.EmployeeID

	if err := s.assignmentRepo.Delete(ctx, id); err != nil {
		return err
	}

	// Resync the cleared range back to default tariff
	if s.dayPlanRepo != nil {
		if err := s.resyncDateRangeFromDefault(ctx, employeeID, effectiveFrom, effectiveTo); err != nil {
			return err
		}
	}

	return nil
}

// ListByEmployee retrieves all tariff assignments for an employee.
func (s *EmployeeTariffAssignmentService) ListByEmployee(ctx context.Context, employeeID uuid.UUID, activeOnly bool) ([]model.EmployeeTariffAssignment, error) {
	return s.assignmentRepo.ListByEmployee(ctx, employeeID, activeOnly)
}

// GetEffectiveTariffBatch resolves effective tariff assignments for multiple employees at a given date.
func (s *EmployeeTariffAssignmentService) GetEffectiveTariffBatch(ctx context.Context, employeeIDs []uuid.UUID, date time.Time) (map[uuid.UUID]*model.EmployeeTariffAssignment, error) {
	return s.assignmentRepo.GetEffectiveForDateBatch(ctx, employeeIDs, date)
}

// GetEffectiveTariff resolves which tariff applies to an employee at a given date.
// Resolution order: (1) active assignment covering the date, (2) employee default tariff_id, (3) none.
func (s *EmployeeTariffAssignmentService) GetEffectiveTariff(ctx context.Context, employeeID uuid.UUID, date time.Time) (*EffectiveTariffResult, error) {
	result := &EffectiveTariffResult{
		EmployeeID: employeeID,
		Date:       date,
	}

	// Step 1: Try to find an active assignment covering the date
	assignment, err := s.assignmentRepo.GetEffectiveForDate(ctx, employeeID, date)
	if err != nil {
		return nil, err
	}
	if assignment != nil {
		result.Source = "assignment"
		result.Tariff = assignment.Tariff
		result.Assignment = assignment
		return result, nil
	}

	// Step 2: Fall back to employee's default tariff_id
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrAssignmentEmployeeNotFound
	}

	if employee.TariffID != nil {
		tariff, err := s.tariffRepo.GetWithDetails(ctx, *employee.TariffID)
		if err != nil {
			return nil, err
		}
		result.Source = "default"
		result.Tariff = tariff
		return result, nil
	}

	// Step 3: No tariff
	result.Source = "none"
	return result, nil
}

// calcSyncWindow calculates the date range to sync day plans for an assignment.
// Unlike getTariffSyncWindow in employee.go (which starts from today for default tariffs),
// this starts from the assignment's effective_from because assignments explicitly target a date range.
// Intersection of: [assignment dates] ∩ [emp entry, emp exit] ∩ [tariff valid] ∩ [_, today+1yr].
func (s *EmployeeTariffAssignmentService) calcSyncWindow(emp *model.Employee, tariff *model.Tariff, assignment *model.EmployeeTariffAssignment) (time.Time, time.Time, bool) {
	today := time.Now().Truncate(24 * time.Hour)

	// Start: max of (assignment.EffectiveFrom, emp.EntryDate, tariff.ValidFrom)
	start := assignment.EffectiveFrom.Truncate(24 * time.Hour)
	entryDate := emp.EntryDate.Truncate(24 * time.Hour)
	if entryDate.After(start) {
		start = entryDate
	}
	if tariff != nil && tariff.ValidFrom != nil {
		vf := tariff.ValidFrom.Truncate(24 * time.Hour)
		if vf.After(start) {
			start = vf
		}
	}

	// End: min of (today+1yr, assignment.EffectiveTo, emp.ExitDate, tariff.ValidTo)
	end := today.AddDate(1, 0, 0)
	if assignment.EffectiveTo != nil {
		et := assignment.EffectiveTo.Truncate(24 * time.Hour)
		if et.Before(end) {
			end = et
		}
	}
	if emp.ExitDate != nil {
		exitDate := emp.ExitDate.Truncate(24 * time.Hour)
		if exitDate.Before(end) {
			end = exitDate
		}
	}
	if tariff != nil && tariff.ValidTo != nil {
		vt := tariff.ValidTo.Truncate(24 * time.Hour)
		if vt.Before(end) {
			end = vt
		}
	}

	if start.After(end) {
		return start, end, false
	}
	return start, end, true
}

// syncDayPlansForAssignment generates day plans for the assignment's scoped window
// and triggers recalculation of daily values for past dates.
func (s *EmployeeTariffAssignmentService) syncDayPlansForAssignment(ctx context.Context, assignment *model.EmployeeTariffAssignment) error {
	emp, err := s.employeeRepo.GetByID(ctx, assignment.EmployeeID)
	if err != nil {
		return err
	}

	tariff, err := s.tariffRepo.GetWithDetails(ctx, assignment.TariffID)
	if err != nil {
		return err
	}

	start, end, ok := s.calcSyncWindow(emp, tariff, assignment)
	if !ok {
		return nil
	}

	// Get existing plans to build skip set (respect OverwriteBehavior)
	existingPlans, err := s.dayPlanRepo.GetForEmployeeDateRange(ctx, emp.ID, start, end)
	if err != nil {
		return err
	}

	skipDates := make(map[string]struct{}, len(existingPlans))
	if assignment.OverwriteBehavior == model.OverwriteBehaviorPreserveManual {
		for _, plan := range existingPlans {
			if plan.Source != model.EmployeeDayPlanSourceTariff {
				skipDates[plan.PlanDate.Format("2006-01-02")] = struct{}{}
			}
		}
	}

	// Delete existing tariff-source plans in range
	if err := s.dayPlanRepo.DeleteRangeBySource(ctx, emp.ID, start, end, model.EmployeeDayPlanSourceTariff); err != nil {
		return err
	}

	// Generate new plans
	plans := make([]model.EmployeeDayPlan, 0, int(end.Sub(start).Hours()/24)+1)
	for date := start; !date.After(end); date = date.AddDate(0, 0, 1) {
		if _, ok := skipDates[date.Format("2006-01-02")]; ok {
			continue
		}

		dayPlanID := tariff.GetDayPlanIDForDate(date)
		if dayPlanID == nil {
			continue
		}

		plans = append(plans, model.EmployeeDayPlan{
			TenantID:   emp.TenantID,
			EmployeeID: emp.ID,
			PlanDate:   date,
			DayPlanID:  dayPlanID,
			Source:     model.EmployeeDayPlanSourceTariff,
		})
	}

	if len(plans) > 0 {
		if err := s.dayPlanRepo.BulkCreate(ctx, plans); err != nil {
			return err
		}
	}

	// Recalculate daily values for the synced range so timesheet reflects new target hours
	s.triggerRecalc(ctx, emp.TenantID, emp.ID, start, end)

	return nil
}

// resyncDateRangeFromDefault clears tariff-source day plans in a date range, then
// re-generates them from the employee's default tariff_id (if any).
func (s *EmployeeTariffAssignmentService) resyncDateRangeFromDefault(ctx context.Context, employeeID uuid.UUID, effectiveFrom time.Time, effectiveTo *time.Time) error {
	emp, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return err
	}

	today := time.Now().Truncate(24 * time.Hour)
	// Start from the assignment's effective_from (not today) to cover past dates
	start := effectiveFrom.Truncate(24 * time.Hour)
	entryDate := emp.EntryDate.Truncate(24 * time.Hour)
	if entryDate.After(start) {
		start = entryDate
	}

	end := today.AddDate(1, 0, 0)
	if effectiveTo != nil {
		et := effectiveTo.Truncate(24 * time.Hour)
		if et.Before(end) {
			end = et
		}
	}
	if emp.ExitDate != nil {
		exitDate := emp.ExitDate.Truncate(24 * time.Hour)
		if exitDate.Before(end) {
			end = exitDate
		}
	}

	if start.After(end) {
		return nil
	}

	// Delete tariff-source plans in range
	if err := s.dayPlanRepo.DeleteRangeBySource(ctx, emp.ID, start, end, model.EmployeeDayPlanSourceTariff); err != nil {
		return err
	}

	// If employee has a default tariff, re-generate plans from it
	if emp.TariffID == nil {
		// Trigger recalc even without default tariff (day plans were deleted)
		s.triggerRecalc(ctx, emp.TenantID, emp.ID, start, end)
		return nil
	}

	tariff, err := s.tariffRepo.GetWithDetails(ctx, *emp.TariffID)
	if err != nil {
		return err
	}

	// Adjust window for tariff validity
	if tariff.ValidFrom != nil {
		vf := tariff.ValidFrom.Truncate(24 * time.Hour)
		if vf.After(start) {
			start = vf
		}
	}
	if tariff.ValidTo != nil {
		vt := tariff.ValidTo.Truncate(24 * time.Hour)
		if vt.Before(end) {
			end = vt
		}
	}
	if start.After(end) {
		return nil
	}

	// Get existing plans to preserve manual ones
	existingPlans, err := s.dayPlanRepo.GetForEmployeeDateRange(ctx, emp.ID, start, end)
	if err != nil {
		return err
	}

	skipDates := make(map[string]struct{}, len(existingPlans))
	for _, plan := range existingPlans {
		if plan.Source != model.EmployeeDayPlanSourceTariff {
			skipDates[plan.PlanDate.Format("2006-01-02")] = struct{}{}
		}
	}

	plans := make([]model.EmployeeDayPlan, 0, int(end.Sub(start).Hours()/24)+1)
	for date := start; !date.After(end); date = date.AddDate(0, 0, 1) {
		if _, ok := skipDates[date.Format("2006-01-02")]; ok {
			continue
		}

		dayPlanID := tariff.GetDayPlanIDForDate(date)
		if dayPlanID == nil {
			continue
		}

		plans = append(plans, model.EmployeeDayPlan{
			TenantID:   emp.TenantID,
			EmployeeID: emp.ID,
			PlanDate:   date,
			DayPlanID:  dayPlanID,
			Source:     model.EmployeeDayPlanSourceTariff,
		})
	}

	if len(plans) > 0 {
		if err := s.dayPlanRepo.BulkCreate(ctx, plans); err != nil {
			return err
		}
	}

	// Recalculate daily values for the resynced range
	s.triggerRecalc(ctx, emp.TenantID, emp.ID, start, end)

	return nil
}

// triggerRecalc triggers recalculation of daily values for past/current dates only.
// Future dates don't have bookings and would generate spurious no-booking errors/notifications.
func (s *EmployeeTariffAssignmentService) triggerRecalc(ctx context.Context, tenantID, employeeID uuid.UUID, from, to time.Time) {
	if s.recalcSvc == nil {
		return
	}
	today := time.Now().Truncate(24 * time.Hour)
	recalcEnd := to
	if recalcEnd.After(today) {
		recalcEnd = today
	}
	if from.After(recalcEnd) {
		return // entire range is in the future, nothing to recalc
	}
	// Recalc is best-effort: don't fail the CRUD operation if recalc has issues
	_, _ = s.recalcSvc.TriggerRecalcRange(ctx, tenantID, employeeID, from, recalcEnd)
}
