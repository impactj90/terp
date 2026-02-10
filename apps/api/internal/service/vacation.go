package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/calculation"
	"github.com/tolga/terp/internal/model"
)

// Vacation service errors.
var (
	ErrVacationBalanceNotFound = errors.New("vacation balance not found")
	ErrInvalidYear             = errors.New("invalid year")
)

// vacationBalanceRepoForVacation defines the interface for vacation balance data access.
type vacationBalanceRepoForVacation interface {
	GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
	Upsert(ctx context.Context, balance *model.VacationBalance) error
	UpdateTaken(ctx context.Context, employeeID uuid.UUID, year int, taken decimal.Decimal) error
}

// absenceDayRepoForVacation defines the interface for absence day counting.
type absenceDayRepoForVacation interface {
	CountByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) (decimal.Decimal, error)
	ListApprovedByTypeInRange(ctx context.Context, employeeID, typeID uuid.UUID, from, to time.Time) ([]model.AbsenceDay, error)
}

// absenceTypeRepoForVacation defines the interface for absence type lookups.
type absenceTypeRepoForVacation interface {
	List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error)
}

// tenantRepoForVacation defines the interface for tenant data access.
type tenantRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tenant, error)
}

// tariffRepoForVacation defines the interface for tariff data access.
type tariffRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
}

// employeeRepoForVacation defines the interface for employee data.
type employeeRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// employmentTypeRepoForVacation defines the interface for employment type data.
type employmentTypeRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.EmploymentType, error)
}

// vacationCalcGroupRepoForVacation defines the interface for vacation calc group data.
type vacationCalcGroupRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCalculationGroup, error)
}

// empDayPlanRepoForVacation provides day plan lookup for vacation deduction weighting.
type empDayPlanRepoForVacation interface {
	GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
}

// tariffAssignmentRepoForVacation resolves the active tariff assignment for an employee.
type tariffAssignmentRepoForVacation interface {
	GetEffectiveForDate(ctx context.Context, employeeID uuid.UUID, date time.Time) (*model.EmployeeTariffAssignment, error)
}

// cappingGroupRepoForVacation provides capping rule group lookup for carryover capping.
type cappingGroupRepoForVacation interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.VacationCappingRuleGroup, error)
}

// exceptionRepoForVacation provides employee capping exception lookup.
type exceptionRepoForVacation interface {
	ListActiveByEmployee(ctx context.Context, employeeID uuid.UUID, year *int) ([]model.EmployeeCappingException, error)
}

// PreviewEntitlementInput represents input for entitlement preview.
type PreviewEntitlementInput struct {
	EmployeeID          uuid.UUID
	Year                int
	CalcGroupIDOverride *uuid.UUID // Optional: override the employee's default group
}

// PreviewEntitlementOutput contains the preview result.
type PreviewEntitlementOutput struct {
	EmployeeID          uuid.UUID
	EmployeeName        string
	Year                int
	Basis               string
	CalcGroupID         *uuid.UUID
	CalcGroupName       *string
	CalcOutput          calculation.VacationCalcOutput
	WeeklyHours         decimal.Decimal
	StandardWeeklyHours decimal.Decimal
	PartTimeFactor      decimal.Decimal
}

// VacationService handles vacation balance business logic.
type VacationService struct {
	vacationBalanceRepo   vacationBalanceRepoForVacation
	absenceDayRepo        absenceDayRepoForVacation
	absenceTypeRepo       absenceTypeRepoForVacation
	employeeRepo          employeeRepoForVacation
	tenantRepo            tenantRepoForVacation
	tariffRepo            tariffRepoForVacation
	employmentTypeRepo    employmentTypeRepoForVacation
	vacationCalcGroupRepo vacationCalcGroupRepoForVacation
	empDayPlanRepo        empDayPlanRepoForVacation
	tariffAssignmentRepo  tariffAssignmentRepoForVacation
	cappingGroupRepo      cappingGroupRepoForVacation
	exceptionRepo         exceptionRepoForVacation
	defaultMaxCarryover   decimal.Decimal // 0 = unlimited
}

// NewVacationService creates a new VacationService instance.
func NewVacationService(
	vacationBalanceRepo vacationBalanceRepoForVacation,
	absenceDayRepo absenceDayRepoForVacation,
	absenceTypeRepo absenceTypeRepoForVacation,
	employeeRepo employeeRepoForVacation,
	tenantRepo tenantRepoForVacation,
	tariffRepo tariffRepoForVacation,
	employmentTypeRepo employmentTypeRepoForVacation,
	vacationCalcGroupRepo vacationCalcGroupRepoForVacation,
	defaultMaxCarryover decimal.Decimal,
) *VacationService {
	return &VacationService{
		vacationBalanceRepo:   vacationBalanceRepo,
		absenceDayRepo:        absenceDayRepo,
		absenceTypeRepo:       absenceTypeRepo,
		employeeRepo:          employeeRepo,
		tenantRepo:            tenantRepo,
		tariffRepo:            tariffRepo,
		employmentTypeRepo:    employmentTypeRepo,
		vacationCalcGroupRepo: vacationCalcGroupRepo,
		defaultMaxCarryover:   defaultMaxCarryover,
	}
}

// SetEmpDayPlanRepo sets the employee day plan repository for vacation deduction weighting.
func (s *VacationService) SetEmpDayPlanRepo(repo empDayPlanRepoForVacation) {
	s.empDayPlanRepo = repo
}

// SetTariffAssignmentRepo sets the tariff assignment repository for resolving effective tariffs.
func (s *VacationService) SetTariffAssignmentRepo(repo tariffAssignmentRepoForVacation) {
	s.tariffAssignmentRepo = repo
}

// SetCappingGroupRepo sets the capping rule group repository for carryover capping.
func (s *VacationService) SetCappingGroupRepo(repo cappingGroupRepoForVacation) {
	s.cappingGroupRepo = repo
}

// SetExceptionRepo sets the employee capping exception repository.
func (s *VacationService) SetExceptionRepo(repo exceptionRepoForVacation) {
	s.exceptionRepo = repo
}

// GetBalance retrieves the vacation balance for an employee and year.
// Returns ErrVacationBalanceNotFound if no balance has been initialized.
func (s *VacationService) GetBalance(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	if year < 1900 || year > 2200 {
		return nil, ErrInvalidYear
	}

	balance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return nil, err
	}
	if balance == nil {
		return nil, ErrVacationBalanceNotFound
	}

	return balance, nil
}

// InitializeYear calculates and stores the vacation entitlement for a year.
// Uses the employee's VacationDaysPerYear, WeeklyHours, EntryDate, and ExitDate
// to compute pro-rated and part-time adjusted entitlement.
// This is idempotent: calling multiple times recalculates the entitlement.
func (s *VacationService) InitializeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error) {
	if year < 1900 || year > 2200 {
		return nil, ErrInvalidYear
	}

	// Get employee data
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}

	// Resolve calculation group from employment type
	calcGroup := s.resolveCalcGroup(ctx, employee)

	// Build full calculation input
	input := s.buildCalcInput(ctx, employee, year, calcGroup)

	// Calculate entitlement
	output := calculation.CalculateVacation(input)

	// Get existing balance to preserve carryover, adjustments, and taken
	existing, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return nil, err
	}

	var balance model.VacationBalance
	if existing != nil {
		balance = *existing
		balance.Entitlement = output.TotalEntitlement
	} else {
		balance = model.VacationBalance{
			TenantID:    employee.TenantID,
			EmployeeID:  employeeID,
			Year:        year,
			Entitlement: output.TotalEntitlement,
		}
	}

	// Upsert the balance
	if err := s.vacationBalanceRepo.Upsert(ctx, &balance); err != nil {
		return nil, err
	}

	return &balance, nil
}

// PreviewEntitlement calculates a vacation entitlement preview without persisting.
func (s *VacationService) PreviewEntitlement(ctx context.Context, input PreviewEntitlementInput) (*PreviewEntitlementOutput, error) {
	if input.Year < 1900 || input.Year > 2200 {
		return nil, ErrInvalidYear
	}

	// Load employee
	employee, err := s.employeeRepo.GetByID(ctx, input.EmployeeID)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}

	// Determine calc group
	var calcGroup *model.VacationCalculationGroup
	if input.CalcGroupIDOverride != nil {
		if s.vacationCalcGroupRepo != nil {
			group, err := s.vacationCalcGroupRepo.GetByID(ctx, *input.CalcGroupIDOverride)
			if err == nil {
				calcGroup = group
			}
		}
	} else {
		calcGroup = s.resolveCalcGroup(ctx, employee)
	}

	// Build calculation input
	calcInput := s.buildCalcInput(ctx, employee, input.Year, calcGroup)

	// Run calculation
	calcOutput := calculation.CalculateVacation(calcInput)

	// Build output
	output := &PreviewEntitlementOutput{
		EmployeeID:          employee.ID,
		EmployeeName:        employee.FullName(),
		Year:                input.Year,
		Basis:               string(calcInput.Basis),
		CalcOutput:          calcOutput,
		WeeklyHours:         calcInput.WeeklyHours,
		StandardWeeklyHours: calcInput.StandardWeeklyHours,
	}

	// Compute part-time factor
	if calcInput.StandardWeeklyHours.IsPositive() {
		output.PartTimeFactor = calcInput.WeeklyHours.Div(calcInput.StandardWeeklyHours)
	} else {
		output.PartTimeFactor = decimal.NewFromInt(1)
	}

	if calcGroup != nil {
		output.CalcGroupID = &calcGroup.ID
		output.CalcGroupName = &calcGroup.Name
	}

	return output, nil
}

// resolveCalcGroup resolves the vacation calculation group for an employee.
// Resolution order:
//  1. Employee's employment type -> vacation_calc_group_id
//  2. Returns nil if no group is configured (fallback to default behavior)
func (s *VacationService) resolveCalcGroup(ctx context.Context, employee *model.Employee) *model.VacationCalculationGroup {
	if employee.EmploymentTypeID == nil {
		return nil
	}
	if s.employmentTypeRepo == nil {
		return nil
	}

	empType, err := s.employmentTypeRepo.GetByID(ctx, *employee.EmploymentTypeID)
	if err != nil || empType == nil {
		return nil
	}

	if empType.VacationCalcGroupID == nil {
		return nil
	}
	if s.vacationCalcGroupRepo == nil {
		return nil
	}

	group, err := s.vacationCalcGroupRepo.GetByID(ctx, *empType.VacationCalcGroupID)
	if err != nil {
		return nil
	}

	return group
}

// resolveTariff resolves the effective tariff for an employee in a given year.
// Resolution order: (1) active tariff assignment, (2) employee.TariffID fallback.
func (s *VacationService) resolveTariff(ctx context.Context, employee *model.Employee, year int) *model.Tariff {
	var tariff *model.Tariff
	if s.tariffAssignmentRepo != nil {
		// Use end-of-year for past years so mid-year assignments are found.
		// For current/future years, use today so not-yet-started assignments are excluded.
		refDate := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)
		if now := time.Now(); refDate.After(now) {
			refDate = now
		}
		if assignment, err := s.tariffAssignmentRepo.GetEffectiveForDate(ctx, employee.ID, refDate); err == nil && assignment != nil {
			tariff = assignment.Tariff
		}
	}
	if tariff == nil && employee.TariffID != nil && s.tariffRepo != nil {
		t, err := s.tariffRepo.GetByID(ctx, *employee.TariffID)
		if err == nil && t != nil {
			tariff = t
		}
	}
	return tariff
}

// buildCalcInput constructs the VacationCalcInput from employee, tariff, and optional calc group.
func (s *VacationService) buildCalcInput(
	ctx context.Context,
	employee *model.Employee,
	year int,
	calcGroup *model.VacationCalculationGroup,
) calculation.VacationCalcInput {
	input := calculation.VacationCalcInput{
		EntryDate:        employee.EntryDate,
		ExitDate:         employee.ExitDate,
		WeeklyHours:      employee.WeeklyHours,
		BaseVacationDays: employee.VacationDaysPerYear,
		HasDisability:    employee.DisabilityFlag,
		Year:             year,
	}

	// Set BirthDate
	if employee.BirthDate != nil {
		input.BirthDate = *employee.BirthDate
	}

	// Resolve tariff
	tariff := s.resolveTariff(ctx, employee, year)

	// Apply tariff values (StandardWeeklyHours and BaseVacationDays)
	input.StandardWeeklyHours = decimal.NewFromInt(40)
	if tariff != nil {
		if tariff.WeeklyTargetHours != nil && tariff.WeeklyTargetHours.IsPositive() {
			input.StandardWeeklyHours = *tariff.WeeklyTargetHours
		}
		if tariff.AnnualVacationDays != nil && tariff.AnnualVacationDays.IsPositive() {
			input.BaseVacationDays = *tariff.AnnualVacationDays
		}
	}

	// Resolve basis
	if calcGroup != nil {
		input.Basis = calculation.VacationBasis(calcGroup.Basis)
	} else {
		input.Basis = s.resolveVacationBasisFromTariff(ctx, employee, tariff)
	}

	// Set reference date based on basis
	if input.Basis == calculation.VacationBasisEntryDate {
		input.ReferenceDate = time.Date(year, employee.EntryDate.Month(), employee.EntryDate.Day(), 0, 0, 0, 0, time.UTC)
	} else {
		input.ReferenceDate = time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	}

	// Build special calcs from group
	if calcGroup != nil {
		for _, sc := range calcGroup.SpecialCalculations {
			input.SpecialCalcs = append(input.SpecialCalcs, calculation.VacationSpecialCalc{
				Type:      calculation.SpecialCalcType(sc.Type),
				Threshold: sc.Threshold,
				BonusDays: sc.BonusDays,
			})
		}
	}

	return input
}

func (s *VacationService) resolveVacationBasisFromTariff(ctx context.Context, employee *model.Employee, tariff *model.Tariff) calculation.VacationBasis {
	basis := model.VacationBasisCalendarYear
	if s.tenantRepo != nil {
		if tenant, err := s.tenantRepo.GetByID(ctx, employee.TenantID); err == nil && tenant != nil {
			basis = tenant.GetVacationBasis()
		}
	}
	if tariff != nil {
		basis = tariff.GetVacationBasis()
	}
	return calculation.VacationBasis(basis)
}

// RecalculateTaken recalculates the vacation days taken for an employee in a year.
// It sums day-plan-weighted deductions from all approved absence days of vacation-deducting types.
// For each absence day: deduction = day_plan.vacation_deduction * absence.duration.
// If no day plan exists for a date, defaults to 1.0 * duration.
func (s *VacationService) RecalculateTaken(ctx context.Context, employeeID uuid.UUID, year int) error {
	if year < 1900 || year > 2200 {
		return ErrInvalidYear
	}

	// Get employee for tenant ID
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return ErrEmployeeNotFound
	}

	// Get all absence types that deduct vacation
	allTypes, err := s.absenceTypeRepo.List(ctx, employee.TenantID, true)
	if err != nil {
		return err
	}

	// Filter to types that deduct vacation
	var vacationTypes []model.AbsenceType
	for _, at := range allTypes {
		if at.DeductsVacation {
			vacationTypes = append(vacationTypes, at)
		}
	}

	// Sum weighted vacation deductions across all vacation-deducting types for the year
	yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

	// Batch-fetch day plans for the year to avoid N+1 queries
	dayPlanMap := make(map[time.Time]decimal.Decimal) // date -> vacation_deduction
	if s.empDayPlanRepo != nil {
		plans, err := s.empDayPlanRepo.GetForEmployeeDateRange(ctx, employeeID, yearStart, yearEnd)
		if err == nil {
			for _, edp := range plans {
				date := time.Date(edp.PlanDate.Year(), edp.PlanDate.Month(), edp.PlanDate.Day(), 0, 0, 0, 0, time.UTC)
				if edp.DayPlan != nil {
					dayPlanMap[date] = edp.DayPlan.VacationDeduction
				}
			}
		}
	}

	totalTaken := decimal.Zero
	defaultDeduction := decimal.NewFromInt(1) // default when no day plan

	for _, vt := range vacationTypes {
		days, err := s.absenceDayRepo.ListApprovedByTypeInRange(ctx, employeeID, vt.ID, yearStart, yearEnd)
		if err != nil {
			return err
		}
		for _, day := range days {
			date := time.Date(day.AbsenceDate.Year(), day.AbsenceDate.Month(), day.AbsenceDate.Day(), 0, 0, 0, 0, time.UTC)
			vacDeduction := defaultDeduction
			if vd, ok := dayPlanMap[date]; ok {
				vacDeduction = vd
			}
			// deduction = vacation_deduction * duration
			totalTaken = totalTaken.Add(vacDeduction.Mul(day.Duration))
		}
	}

	// Update the taken value
	return s.vacationBalanceRepo.UpdateTaken(ctx, employeeID, year, totalTaken)
}

// AdjustBalance adds a manual adjustment to the vacation balance.
// The adjustment is accumulated (added to existing Adjustments), not replaced.
// A positive value adds days; a negative value deducts days.
func (s *VacationService) AdjustBalance(ctx context.Context, employeeID uuid.UUID, year int, adjustment decimal.Decimal, notes string) error {
	if year < 1900 || year > 2200 {
		return ErrInvalidYear
	}

	// Get existing balance
	balance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return err
	}
	if balance == nil {
		return ErrVacationBalanceNotFound
	}

	// Accumulate adjustment
	balance.Adjustments = balance.Adjustments.Add(adjustment)

	// Upsert with updated adjustments
	return s.vacationBalanceRepo.Upsert(ctx, balance)
}

// calculateCappedCarryover applies tariff capping rules to carryover if available,
// falling back to the simple defaultMaxCarryover calculation.
func (s *VacationService) calculateCappedCarryover(ctx context.Context, employee *model.Employee, prevYear int, available decimal.Decimal) decimal.Decimal {
	// Try advanced capping if repos are available
	tariff := s.resolveTariff(ctx, employee, prevYear)
	if tariff != nil && tariff.VacationCappingRuleGroupID != nil && s.cappingGroupRepo != nil {
		group, err := s.cappingGroupRepo.GetByID(ctx, *tariff.VacationCappingRuleGroupID)
		if err == nil && group != nil {
			// Build CarryoverInput
			calcInput := calculation.CarryoverInput{
				AvailableDays: available,
				Year:          prevYear,
				ReferenceDate: time.Now(),
				CappingRules:  make([]calculation.CappingRuleInput, 0, len(group.CappingRules)),
				Exceptions:    make([]calculation.CappingExceptionInput, 0),
			}

			for _, rule := range group.CappingRules {
				if !rule.IsActive {
					continue
				}
				calcInput.CappingRules = append(calcInput.CappingRules, calculation.CappingRuleInput{
					RuleID:      rule.ID.String(),
					RuleName:    rule.Name,
					RuleType:    string(rule.RuleType),
					CutoffMonth: rule.CutoffMonth,
					CutoffDay:   rule.CutoffDay,
					CapValue:    rule.CapValue,
				})
			}

			// Load employee exceptions if repo is available
			if s.exceptionRepo != nil {
				year := prevYear
				exceptions, err := s.exceptionRepo.ListActiveByEmployee(ctx, employee.ID, &year)
				if err == nil {
					for _, exc := range exceptions {
						excInput := calculation.CappingExceptionInput{
							CappingRuleID: exc.CappingRuleID.String(),
							ExemptionType: string(exc.ExemptionType),
						}
						if exc.RetainDays != nil {
							rd := *exc.RetainDays
							excInput.RetainDays = &rd
						}
						calcInput.Exceptions = append(calcInput.Exceptions, excInput)
					}
				}
			}

			output := calculation.CalculateCarryoverWithCapping(calcInput)
			return output.CappedCarryover
		}
	}

	// Fallback: simple carryover with defaultMaxCarryover
	return calculation.CalculateCarryover(available, s.defaultMaxCarryover)
}

// CarryoverFromPreviousYear carries over remaining vacation from the previous year.
// The year parameter is the TARGET year (receiving the carryover).
// Respects tariff capping rules when available, falling back to defaultMaxCarryover (0 = unlimited).
func (s *VacationService) CarryoverFromPreviousYear(ctx context.Context, employeeID uuid.UUID, year int) error {
	if year < 1901 || year > 2200 {
		return ErrInvalidYear
	}

	// Get employee for tenant ID
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return ErrEmployeeNotFound
	}

	// Get previous year's balance
	prevBalance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year-1)
	if err != nil {
		return err
	}
	if prevBalance == nil {
		// No previous year balance - nothing to carry over
		return nil
	}

	// Calculate carryover amount (capped by tariff capping rules or defaultMaxCarryover)
	available := prevBalance.Available()
	carryover := s.calculateCappedCarryover(ctx, employee, year-1, available)

	if carryover.IsZero() {
		return nil
	}

	// Get or create current year balance
	currentBalance, err := s.vacationBalanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	if err != nil {
		return err
	}
	if currentBalance == nil {
		currentBalance = &model.VacationBalance{
			TenantID:   employee.TenantID,
			EmployeeID: employeeID,
			Year:       year,
		}
	}

	// Set carryover (replaces, not accumulates -- carryover is a one-time year-start operation)
	currentBalance.Carryover = carryover

	return s.vacationBalanceRepo.Upsert(ctx, currentBalance)
}
