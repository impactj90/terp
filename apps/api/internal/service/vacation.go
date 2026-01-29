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

// VacationService handles vacation balance business logic.
type VacationService struct {
	vacationBalanceRepo vacationBalanceRepoForVacation
	absenceDayRepo      absenceDayRepoForVacation
	absenceTypeRepo     absenceTypeRepoForVacation
	employeeRepo        employeeRepoForVacation
	tenantRepo          tenantRepoForVacation
	tariffRepo          tariffRepoForVacation
	defaultMaxCarryover decimal.Decimal // 0 = unlimited
}

// NewVacationService creates a new VacationService instance.
func NewVacationService(
	vacationBalanceRepo vacationBalanceRepoForVacation,
	absenceDayRepo absenceDayRepoForVacation,
	absenceTypeRepo absenceTypeRepoForVacation,
	employeeRepo employeeRepoForVacation,
	tenantRepo tenantRepoForVacation,
	tariffRepo tariffRepoForVacation,
	defaultMaxCarryover decimal.Decimal,
) *VacationService {
	return &VacationService{
		vacationBalanceRepo: vacationBalanceRepo,
		absenceDayRepo:      absenceDayRepo,
		absenceTypeRepo:     absenceTypeRepo,
		employeeRepo:        employeeRepo,
		tenantRepo:          tenantRepo,
		tariffRepo:          tariffRepo,
		defaultMaxCarryover: defaultMaxCarryover,
	}
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

	basis := s.resolveVacationBasis(ctx, employee)

	// Build calculation input with available fields and sensible defaults
	input := calculation.VacationCalcInput{
		EntryDate:           employee.EntryDate,
		ExitDate:            employee.ExitDate,
		WeeklyHours:         employee.WeeklyHours,
		BaseVacationDays:    employee.VacationDaysPerYear,
		StandardWeeklyHours: decimal.NewFromInt(40), // Default until tariff ZMI fields available
		Basis:               basis,
		Year:                year,
		ReferenceDate:       time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC),
		// BirthDate, HasDisability, SpecialCalcs: zero values (no bonuses applied)
	}

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

func (s *VacationService) resolveVacationBasis(ctx context.Context, employee *model.Employee) calculation.VacationBasis {
	basis := model.VacationBasisCalendarYear
	if s.tenantRepo != nil {
		if tenant, err := s.tenantRepo.GetByID(ctx, employee.TenantID); err == nil && tenant != nil {
			basis = tenant.GetVacationBasis()
		}
	}
	if employee.TariffID != nil && s.tariffRepo != nil {
		if tariff, err := s.tariffRepo.GetByID(ctx, *employee.TariffID); err == nil && tariff != nil {
			basis = tariff.GetVacationBasis()
		}
	}
	return calculation.VacationBasis(basis)
}

// RecalculateTaken recalculates the vacation days taken for an employee in a year.
// It sums approved absence days from all absence types where DeductsVacation = true.
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

	// Sum vacation days taken across all vacation-deducting types for the year
	yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

	totalTaken := decimal.Zero
	for _, vt := range vacationTypes {
		count, err := s.absenceDayRepo.CountByTypeInRange(ctx, employeeID, vt.ID, yearStart, yearEnd)
		if err != nil {
			return err
		}
		totalTaken = totalTaken.Add(count)
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

// CarryoverFromPreviousYear carries over remaining vacation from the previous year.
// The year parameter is the TARGET year (receiving the carryover).
// Respects the configured defaultMaxCarryover (0 = unlimited).
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

	// Calculate carryover amount (capped by max)
	available := prevBalance.Available()
	carryover := calculation.CalculateCarryover(available, s.defaultMaxCarryover)

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
