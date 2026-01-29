package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrEmployeeNotFound          = errors.New("employee not found")
	ErrPersonnelNumberRequired   = errors.New("personnel number is required")
	ErrPINRequired               = errors.New("PIN is required")
	ErrFirstNameRequired         = errors.New("first name is required")
	ErrLastNameRequired          = errors.New("last name is required")
	ErrPersonnelNumberExists     = errors.New("personnel number already exists")
	ErrPINExists                 = errors.New("PIN already exists")
	ErrCardNumberExists          = errors.New("card number already exists")
	ErrInvalidEntryDate          = errors.New("entry date cannot be more than 6 months in the future")
	ErrExitBeforeEntry           = errors.New("exit date cannot be before entry date")
	ErrContactNotFound           = errors.New("contact not found")
	ErrCardNotFound              = errors.New("card not found")
	ErrContactTypeRequired       = errors.New("contact type is required")
	ErrContactValueRequired      = errors.New("contact value is required")
	ErrCardNumberRequired        = errors.New("card number is required")
	ErrEmployeeHasActiveBookings = errors.New("cannot deactivate employee with active bookings")
	ErrTariffSyncUnavailable     = errors.New("tariff sync repositories not configured")
)

// employeeRepository defines the interface for employee data access.
type employeeRepository interface {
	Create(ctx context.Context, emp *model.Employee) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
	GetByPersonnelNumber(ctx context.Context, tenantID uuid.UUID, personnelNumber string) (*model.Employee, error)
	GetByPIN(ctx context.Context, tenantID uuid.UUID, pin string) (*model.Employee, error)
	Update(ctx context.Context, emp *model.Employee) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error)
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Employee, error)
	Search(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]model.Employee, error)
	CreateContact(ctx context.Context, contact *model.EmployeeContact) error
	GetContactByID(ctx context.Context, id uuid.UUID) (*model.EmployeeContact, error)
	DeleteContact(ctx context.Context, id uuid.UUID) error
	ListContacts(ctx context.Context, employeeID uuid.UUID) ([]model.EmployeeContact, error)
	CreateCard(ctx context.Context, card *model.EmployeeCard) error
	GetCardByID(ctx context.Context, id uuid.UUID) (*model.EmployeeCard, error)
	GetCardByNumber(ctx context.Context, tenantID uuid.UUID, cardNumber string) (*model.EmployeeCard, error)
	UpdateCard(ctx context.Context, card *model.EmployeeCard) error
	ListCards(ctx context.Context, employeeID uuid.UUID) ([]model.EmployeeCard, error)
	Upsert(ctx context.Context, emp *model.Employee) error
}

type employeeTariffRepository interface {
	GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Tariff, error)
}

type employeeTariffDayPlanRepository interface {
	GetForEmployeeDateRange(ctx context.Context, employeeID uuid.UUID, from, to time.Time) ([]model.EmployeeDayPlan, error)
	BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error
	DeleteRangeBySource(ctx context.Context, employeeID uuid.UUID, from, to time.Time, source model.EmployeeDayPlanSource) error
}

type EmployeeService struct {
	employeeRepo        employeeRepository
	tariffRepo          employeeTariffRepository
	employeeDayPlanRepo employeeTariffDayPlanRepository
}

func NewEmployeeService(
	employeeRepo employeeRepository,
	tariffRepo employeeTariffRepository,
	employeeDayPlanRepo employeeTariffDayPlanRepository,
) *EmployeeService {
	return &EmployeeService{
		employeeRepo:        employeeRepo,
		tariffRepo:          tariffRepo,
		employeeDayPlanRepo: employeeDayPlanRepo,
	}
}

// CreateEmployeeInput represents the input for creating an employee.
type CreateEmployeeInput struct {
	TenantID            uuid.UUID
	PersonnelNumber     string
	PIN                 string
	FirstName           string
	LastName            string
	Email               string
	Phone               string
	EntryDate           time.Time
	DepartmentID        *uuid.UUID
	CostCenterID        *uuid.UUID
	EmploymentTypeID    *uuid.UUID
	TariffID            *uuid.UUID
	WeeklyHours         float64
	VacationDaysPerYear float64
}

// Create creates a new employee with validation.
func (s *EmployeeService) Create(ctx context.Context, input CreateEmployeeInput) (*model.Employee, error) {
	// Validate required fields
	personnelNumber := strings.TrimSpace(input.PersonnelNumber)
	if personnelNumber == "" {
		return nil, ErrPersonnelNumberRequired
	}
	pin := strings.TrimSpace(input.PIN)
	if pin == "" {
		return nil, ErrPINRequired
	}
	firstName := strings.TrimSpace(input.FirstName)
	if firstName == "" {
		return nil, ErrFirstNameRequired
	}
	lastName := strings.TrimSpace(input.LastName)
	if lastName == "" {
		return nil, ErrLastNameRequired
	}

	// Validate entry date (not more than 6 months in future)
	if input.EntryDate.After(time.Now().AddDate(0, 6, 0)) {
		return nil, ErrInvalidEntryDate
	}

	// Check personnel number uniqueness
	existing, err := s.employeeRepo.GetByPersonnelNumber(ctx, input.TenantID, personnelNumber)
	if err == nil && existing != nil {
		return nil, ErrPersonnelNumberExists
	}

	// Check PIN uniqueness
	existing, err = s.employeeRepo.GetByPIN(ctx, input.TenantID, pin)
	if err == nil && existing != nil {
		return nil, ErrPINExists
	}

	emp := &model.Employee{
		TenantID:         input.TenantID,
		PersonnelNumber:  personnelNumber,
		PIN:              pin,
		FirstName:        firstName,
		LastName:         lastName,
		Email:            strings.TrimSpace(input.Email),
		Phone:            strings.TrimSpace(input.Phone),
		EntryDate:        input.EntryDate,
		DepartmentID:     input.DepartmentID,
		CostCenterID:     input.CostCenterID,
		EmploymentTypeID: input.EmploymentTypeID,
		TariffID:         input.TariffID,
		IsActive:         true,
	}

	if input.WeeklyHours > 0 {
		emp.WeeklyHours = decimal.NewFromFloat(input.WeeklyHours)
	}
	if input.VacationDaysPerYear > 0 {
		emp.VacationDaysPerYear = decimal.NewFromFloat(input.VacationDaysPerYear)
	}

	if err := s.employeeRepo.Create(ctx, emp); err != nil {
		return nil, err
	}

	if input.TariffID != nil {
		if err := s.syncEmployeeDayPlansForTariff(ctx, emp, *input.TariffID); err != nil {
			return nil, err
		}
	}

	return emp, nil
}

// GetByID retrieves an employee by ID.
func (s *EmployeeService) GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	emp, err := s.employeeRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}
	return emp, nil
}

// GetDetails retrieves an employee with all related data.
func (s *EmployeeService) GetDetails(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	emp, err := s.employeeRepo.GetWithDetails(ctx, id)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}
	return emp, nil
}

// UpdateEmployeeInput represents the input for updating an employee.
type UpdateEmployeeInput struct {
	FirstName           *string
	LastName            *string
	Email               *string
	Phone               *string
	ExitDate            *time.Time
	DepartmentID        *uuid.UUID
	CostCenterID        *uuid.UUID
	EmploymentTypeID    *uuid.UUID
	TariffID            *uuid.UUID
	WeeklyHours         *float64
	VacationDaysPerYear *float64
	IsActive            *bool
	ClearDepartmentID   bool
	ClearCostCenterID   bool
	ClearEmploymentType bool
	ClearTariffID       bool
}

// BulkAssignTariffInput represents the input for bulk tariff assignment.
type BulkAssignTariffInput struct {
	TenantID    uuid.UUID
	EmployeeIDs []uuid.UUID
	Filter      *repository.EmployeeFilter
	TariffID    *uuid.UUID
	ClearTariff bool
}

// Update updates an employee.
func (s *EmployeeService) Update(ctx context.Context, id uuid.UUID, input UpdateEmployeeInput) (*model.Employee, error) {
	emp, err := s.employeeRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}
	oldTariffID := emp.TariffID

	if input.FirstName != nil {
		firstName := strings.TrimSpace(*input.FirstName)
		if firstName == "" {
			return nil, ErrFirstNameRequired
		}
		emp.FirstName = firstName
	}
	if input.LastName != nil {
		lastName := strings.TrimSpace(*input.LastName)
		if lastName == "" {
			return nil, ErrLastNameRequired
		}
		emp.LastName = lastName
	}
	if input.Email != nil {
		emp.Email = strings.TrimSpace(*input.Email)
	}
	if input.Phone != nil {
		emp.Phone = strings.TrimSpace(*input.Phone)
	}
	if input.ExitDate != nil {
		if input.ExitDate.Before(emp.EntryDate) {
			return nil, ErrExitBeforeEntry
		}
		emp.ExitDate = input.ExitDate
	}
	if input.ClearDepartmentID {
		emp.DepartmentID = nil
	} else if input.DepartmentID != nil {
		emp.DepartmentID = input.DepartmentID
	}
	if input.ClearCostCenterID {
		emp.CostCenterID = nil
	} else if input.CostCenterID != nil {
		emp.CostCenterID = input.CostCenterID
	}
	if input.ClearEmploymentType {
		emp.EmploymentTypeID = nil
	} else if input.EmploymentTypeID != nil {
		emp.EmploymentTypeID = input.EmploymentTypeID
	}
	if input.ClearTariffID {
		emp.TariffID = nil
	} else if input.TariffID != nil {
		emp.TariffID = input.TariffID
	}
	if input.WeeklyHours != nil {
		emp.WeeklyHours = decimal.NewFromFloat(*input.WeeklyHours)
	}
	if input.VacationDaysPerYear != nil {
		emp.VacationDaysPerYear = decimal.NewFromFloat(*input.VacationDaysPerYear)
	}
	if input.IsActive != nil {
		emp.IsActive = *input.IsActive
	}

	if err := s.employeeRepo.Update(ctx, emp); err != nil {
		return nil, err
	}

	tariffChanged := input.TariffID != nil && (oldTariffID == nil || *oldTariffID != *input.TariffID)
	tariffCleared := input.ClearTariffID && oldTariffID != nil

	if tariffChanged || tariffCleared {
		if oldTariffID != nil {
			if err := s.clearTariffDayPlans(ctx, emp, *oldTariffID); err != nil {
				return nil, err
			}
		}
	}

	if tariffChanged {
		if err := s.syncEmployeeDayPlansForTariff(ctx, emp, *input.TariffID); err != nil {
			return nil, err
		}
	}

	return emp, nil
}

// BulkAssignTariff assigns or clears tariffs for a set of employees.
func (s *EmployeeService) BulkAssignTariff(ctx context.Context, input BulkAssignTariffInput) (int, int, error) {
	var employees []model.Employee
	updated := 0
	skipped := 0

	if len(input.EmployeeIDs) > 0 {
		for _, id := range input.EmployeeIDs {
			emp, err := s.employeeRepo.GetByID(ctx, id)
			if err != nil || emp == nil {
				skipped++
				continue
			}
			if emp.TenantID != input.TenantID {
				skipped++
				continue
			}
			employees = append(employees, *emp)
		}
	} else if input.Filter != nil {
		filter := *input.Filter
		filter.TenantID = input.TenantID
		filter.Offset = 0
		filter.Limit = 0
		var err error
		employees, _, err = s.employeeRepo.List(ctx, filter)
		if err != nil {
			return 0, 0, err
		}
	} else {
		return 0, 0, errors.New("employee_ids or filter is required")
	}

	for _, emp := range employees {
		updateInput := UpdateEmployeeInput{
			TariffID:      input.TariffID,
			ClearTariffID: input.ClearTariff,
		}
		if _, err := s.Update(ctx, emp.ID, updateInput); err != nil {
			skipped++
			continue
		}
		updated++
	}

	return updated, skipped, nil
}

func (s *EmployeeService) syncEmployeeDayPlansForTariff(ctx context.Context, emp *model.Employee, tariffID uuid.UUID) error {
	if s.tariffRepo == nil || s.employeeDayPlanRepo == nil {
		return ErrTariffSyncUnavailable
	}

	tariff, err := s.tariffRepo.GetWithDetails(ctx, tariffID)
	if err != nil {
		return err
	}

	start, end, ok := s.getTariffSyncWindow(emp, tariff)
	if !ok {
		return nil
	}

	existingPlans, err := s.employeeDayPlanRepo.GetForEmployeeDateRange(ctx, emp.ID, start, end)
	if err != nil {
		return err
	}

	skipDates := make(map[string]struct{}, len(existingPlans))
	for _, plan := range existingPlans {
		if plan.Source != model.EmployeeDayPlanSourceTariff {
			skipDates[plan.PlanDate.Format("2006-01-02")] = struct{}{}
		}
	}

	if err := s.employeeDayPlanRepo.DeleteRangeBySource(ctx, emp.ID, start, end, model.EmployeeDayPlanSourceTariff); err != nil {
		return err
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

	if err := s.employeeDayPlanRepo.BulkCreate(ctx, plans); err != nil {
		return err
	}

	return nil
}

func (s *EmployeeService) clearTariffDayPlans(ctx context.Context, emp *model.Employee, tariffID uuid.UUID) error {
	if s.tariffRepo == nil || s.employeeDayPlanRepo == nil {
		return ErrTariffSyncUnavailable
	}

	tariff, err := s.tariffRepo.GetWithDetails(ctx, tariffID)
	if err != nil {
		return err
	}

	start, end, ok := s.getTariffSyncWindow(emp, tariff)
	if !ok {
		return nil
	}

	return s.employeeDayPlanRepo.DeleteRangeBySource(ctx, emp.ID, start, end, model.EmployeeDayPlanSourceTariff)
}

func (s *EmployeeService) getTariffSyncWindow(emp *model.Employee, tariff *model.Tariff) (time.Time, time.Time, bool) {
	today := time.Now().Truncate(24 * time.Hour)
	start := maxDate(today, emp.EntryDate.Truncate(24*time.Hour))
	if tariff != nil && tariff.ValidFrom != nil {
		validFrom := tariff.ValidFrom.Truncate(24 * time.Hour)
		if validFrom.After(start) {
			start = validFrom
		}
	}

	end := today.AddDate(1, 0, 0)
	if emp.ExitDate != nil {
		exitDate := emp.ExitDate.Truncate(24 * time.Hour)
		if exitDate.Before(end) {
			end = exitDate
		}
	}
	if tariff != nil && tariff.ValidTo != nil {
		validTo := tariff.ValidTo.Truncate(24 * time.Hour)
		if validTo.Before(end) {
			end = validTo
		}
	}

	if start.After(end) {
		return start, end, false
	}

	return start, end, true
}

func maxDate(left, right time.Time) time.Time {
	if left.After(right) {
		return left
	}
	return right
}

// Deactivate deactivates an employee and sets exit date if not set.
func (s *EmployeeService) Deactivate(ctx context.Context, id uuid.UUID) error {
	emp, err := s.employeeRepo.GetByID(ctx, id)
	if err != nil {
		return ErrEmployeeNotFound
	}

	emp.IsActive = false
	now := time.Now()
	if emp.ExitDate == nil {
		emp.ExitDate = &now
	}

	return s.employeeRepo.Update(ctx, emp)
}

// Delete soft-deletes an employee.
func (s *EmployeeService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.employeeRepo.GetByID(ctx, id)
	if err != nil {
		return ErrEmployeeNotFound
	}

	return s.employeeRepo.Delete(ctx, id)
}

// List retrieves employees with filtering and pagination.
func (s *EmployeeService) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
	return s.employeeRepo.List(ctx, filter)
}

// Search performs a quick search for employees.
func (s *EmployeeService) Search(ctx context.Context, tenantID uuid.UUID, query string) ([]model.Employee, error) {
	return s.employeeRepo.Search(ctx, tenantID, query, 20)
}

// CreateContactInput represents the input for creating a contact.
type CreateContactInput struct {
	EmployeeID  uuid.UUID
	ContactType string
	Value       string
	Label       string
	IsPrimary   bool
}

// AddContact adds a contact to an employee.
func (s *EmployeeService) AddContact(ctx context.Context, input CreateContactInput) (*model.EmployeeContact, error) {
	// Verify employee exists
	_, err := s.employeeRepo.GetByID(ctx, input.EmployeeID)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}

	contactType := strings.TrimSpace(input.ContactType)
	if contactType == "" {
		return nil, ErrContactTypeRequired
	}
	value := strings.TrimSpace(input.Value)
	if value == "" {
		return nil, ErrContactValueRequired
	}

	contact := &model.EmployeeContact{
		EmployeeID:  input.EmployeeID,
		ContactType: contactType,
		Value:       value,
		Label:       strings.TrimSpace(input.Label),
		IsPrimary:   input.IsPrimary,
	}

	if err := s.employeeRepo.CreateContact(ctx, contact); err != nil {
		return nil, err
	}

	return contact, nil
}

// RemoveContact removes a contact from an employee.
func (s *EmployeeService) RemoveContact(ctx context.Context, contactID uuid.UUID) error {
	_, err := s.employeeRepo.GetContactByID(ctx, contactID)
	if err != nil {
		return ErrContactNotFound
	}

	return s.employeeRepo.DeleteContact(ctx, contactID)
}

// ListContacts retrieves all contacts for an employee.
func (s *EmployeeService) ListContacts(ctx context.Context, employeeID uuid.UUID) ([]model.EmployeeContact, error) {
	// Verify employee exists
	_, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}

	return s.employeeRepo.ListContacts(ctx, employeeID)
}

// CreateCardInput represents the input for creating a card.
type CreateCardInput struct {
	TenantID   uuid.UUID
	EmployeeID uuid.UUID
	CardNumber string
	CardType   string
	ValidFrom  time.Time
	ValidTo    *time.Time
}

// AddCard adds a card to an employee.
func (s *EmployeeService) AddCard(ctx context.Context, input CreateCardInput) (*model.EmployeeCard, error) {
	// Verify employee exists
	_, err := s.employeeRepo.GetByID(ctx, input.EmployeeID)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}

	cardNumber := strings.TrimSpace(input.CardNumber)
	if cardNumber == "" {
		return nil, ErrCardNumberRequired
	}

	// Check card number uniqueness
	existing, err := s.employeeRepo.GetCardByNumber(ctx, input.TenantID, cardNumber)
	if err == nil && existing != nil {
		return nil, ErrCardNumberExists
	}

	cardType := strings.TrimSpace(input.CardType)
	if cardType == "" {
		cardType = "rfid"
	}

	card := &model.EmployeeCard{
		TenantID:   input.TenantID,
		EmployeeID: input.EmployeeID,
		CardNumber: cardNumber,
		CardType:   cardType,
		ValidFrom:  input.ValidFrom,
		ValidTo:    input.ValidTo,
		IsActive:   true,
	}

	if err := s.employeeRepo.CreateCard(ctx, card); err != nil {
		return nil, err
	}

	return card, nil
}

// DeactivateCard deactivates a card with a reason.
func (s *EmployeeService) DeactivateCard(ctx context.Context, cardID uuid.UUID, reason string) error {
	card, err := s.employeeRepo.GetCardByID(ctx, cardID)
	if err != nil {
		return ErrCardNotFound
	}

	now := time.Now()
	card.IsActive = false
	card.DeactivatedAt = &now
	card.DeactivationReason = strings.TrimSpace(reason)

	return s.employeeRepo.UpdateCard(ctx, card)
}

// ListCards retrieves all cards for an employee.
func (s *EmployeeService) ListCards(ctx context.Context, employeeID uuid.UUID) ([]model.EmployeeCard, error) {
	// Verify employee exists
	_, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, ErrEmployeeNotFound
	}

	return s.employeeRepo.ListCards(ctx, employeeID)
}

// UpsertDevEmployee creates or updates a dev employee.
func (s *EmployeeService) UpsertDevEmployee(ctx context.Context, emp *model.Employee) error {
	return s.employeeRepo.Upsert(ctx, emp)
}
