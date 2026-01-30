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

var (
	ErrCarryoverPreviewEmployeeNotFound = errors.New("employee not found for carryover preview")
	ErrCarryoverPreviewTariffNotFound   = errors.New("employee has no tariff assigned")
	ErrCarryoverPreviewNoCappingGroup   = errors.New("tariff has no capping rule group assigned")
	ErrCarryoverPreviewYearRequired     = errors.New("year is required for carryover preview")
)

// carryoverEmployeeRepository defines the interface for employee lookup.
type carryoverEmployeeRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// carryoverTariffRepository defines the interface for tariff lookup.
type carryoverTariffRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
}

// carryoverBalanceRepository defines the interface for vacation balance lookup.
type carryoverBalanceRepository interface {
	GetByEmployeeYear(ctx context.Context, employeeID uuid.UUID, year int) (*model.VacationBalance, error)
}

// VacationCarryoverService handles carryover preview calculations.
type VacationCarryoverService struct {
	employeeRepo     carryoverEmployeeRepository
	tariffRepo       carryoverTariffRepository
	balanceRepo      carryoverBalanceRepository
	cappingGroupRepo vacationCappingRuleGroupRepository
	exceptionRepo    employeeCappingExceptionRepository
}

// NewVacationCarryoverService creates a new VacationCarryoverService.
func NewVacationCarryoverService(
	employeeRepo carryoverEmployeeRepository,
	tariffRepo carryoverTariffRepository,
	balanceRepo carryoverBalanceRepository,
	cappingGroupRepo vacationCappingRuleGroupRepository,
	exceptionRepo employeeCappingExceptionRepository,
) *VacationCarryoverService {
	return &VacationCarryoverService{
		employeeRepo:     employeeRepo,
		tariffRepo:       tariffRepo,
		balanceRepo:      balanceRepo,
		cappingGroupRepo: cappingGroupRepo,
		exceptionRepo:    exceptionRepo,
	}
}

// CarryoverPreviewResult holds the preview result.
type CarryoverPreviewResult struct {
	EmployeeID      uuid.UUID
	Year            int
	AvailableDays   decimal.Decimal
	CappedCarryover decimal.Decimal
	ForfeitedDays   decimal.Decimal
	RulesApplied    []CarryoverRuleApplication
	HasException    bool
}

// CarryoverRuleApplication describes a single rule's application in the preview.
type CarryoverRuleApplication struct {
	RuleID          uuid.UUID
	RuleName        string
	RuleType        string
	CapValue        decimal.Decimal
	Applied         bool
	ExceptionActive bool
}

// PreviewCarryover calculates how carryover would work for an employee/year.
func (s *VacationCarryoverService) PreviewCarryover(ctx context.Context, employeeID uuid.UUID, year int) (*CarryoverPreviewResult, error) {
	if year == 0 {
		return nil, ErrCarryoverPreviewYearRequired
	}

	// Get employee
	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrCarryoverPreviewEmployeeNotFound
	}

	// Get tariff
	if employee.TariffID == nil {
		return nil, ErrCarryoverPreviewTariffNotFound
	}
	tariff, err := s.tariffRepo.GetByID(ctx, *employee.TariffID)
	if err != nil {
		return nil, ErrCarryoverPreviewTariffNotFound
	}

	// Get capping rule group from tariff
	if tariff.VacationCappingRuleGroupID == nil {
		return nil, ErrCarryoverPreviewNoCappingGroup
	}
	cappingGroup, err := s.cappingGroupRepo.GetByID(ctx, *tariff.VacationCappingRuleGroupID)
	if err != nil {
		return nil, ErrCarryoverPreviewNoCappingGroup
	}

	// Get vacation balance for the year
	balance, err := s.balanceRepo.GetByEmployeeYear(ctx, employeeID, year)
	var availableDays decimal.Decimal
	if err != nil || balance == nil {
		// No balance record: assume 0 available
		availableDays = decimal.Zero
	} else {
		// Available = entitlement + carryover + adjustments - taken
		availableDays = balance.Entitlement.Add(balance.Carryover).Add(balance.Adjustments).Sub(balance.Taken)
	}

	// Get employee exceptions
	exceptions, err := s.exceptionRepo.ListActiveByEmployee(ctx, employeeID, &year)
	if err != nil {
		exceptions = nil // proceed without exceptions on error
	}

	// Build calculation input
	calcInput := calculation.CarryoverInput{
		AvailableDays: availableDays,
		Year:          year,
		ReferenceDate: time.Now(),
		CappingRules:  make([]calculation.CappingRuleInput, 0, len(cappingGroup.CappingRules)),
		Exceptions:    make([]calculation.CappingExceptionInput, 0, len(exceptions)),
	}

	for _, rule := range cappingGroup.CappingRules {
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

	// Calculate
	calcOutput := calculation.CalculateCarryoverWithCapping(calcInput)

	// Build result
	result := &CarryoverPreviewResult{
		EmployeeID:      employeeID,
		Year:            year,
		AvailableDays:   calcOutput.AvailableDays,
		CappedCarryover: calcOutput.CappedCarryover,
		ForfeitedDays:   calcOutput.ForfeitedDays,
		HasException:    calcOutput.HasException,
		RulesApplied:    make([]CarryoverRuleApplication, 0, len(calcOutput.RulesApplied)),
	}

	for _, ra := range calcOutput.RulesApplied {
		ruleID, _ := uuid.Parse(ra.RuleID)
		result.RulesApplied = append(result.RulesApplied, CarryoverRuleApplication{
			RuleID:          ruleID,
			RuleName:        ra.RuleName,
			RuleType:        ra.RuleType,
			CapValue:        ra.CapValue,
			Applied:         ra.Applied,
			ExceptionActive: ra.ExceptionActive,
		})
	}

	return result, nil
}
