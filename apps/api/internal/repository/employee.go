package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrEmployeeNotFound = errors.New("employee not found")
	ErrCardNotFound     = errors.New("employee card not found")
	ErrContactNotFound  = errors.New("employee contact not found")
)

// EmployeeFilter defines filter criteria for listing employees.
type EmployeeFilter struct {
	TenantID           uuid.UUID
	DepartmentID       *uuid.UUID
	EmployeeGroupID    *uuid.UUID
	WorkflowGroupID    *uuid.UUID
	ActivityGroupID    *uuid.UUID
	IsActive           *bool
	HasExitDate        *bool
	SearchQuery        string
	Offset             int
	Limit              int
	ScopeType          model.DataScopeType
	ScopeDepartmentIDs []uuid.UUID
	ScopeEmployeeIDs   []uuid.UUID
}

// EmployeeRepository handles employee data access.
type EmployeeRepository struct {
	db *DB
}

// NewEmployeeRepository creates a new employee repository.
func NewEmployeeRepository(db *DB) *EmployeeRepository {
	return &EmployeeRepository{db: db}
}

// Create creates a new employee.
func (r *EmployeeRepository) Create(ctx context.Context, emp *model.Employee) error {
	return r.db.GORM.WithContext(ctx).Create(emp).Error
}

// GetByID retrieves an employee by ID.
func (r *EmployeeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	var emp model.Employee
	err := r.db.GORM.WithContext(ctx).
		First(&emp, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee: %w", err)
	}
	return &emp, nil
}

// GetByPersonnelNumber retrieves an employee by tenant ID and personnel number.
func (r *EmployeeRepository) GetByPersonnelNumber(ctx context.Context, tenantID uuid.UUID, personnelNumber string) (*model.Employee, error) {
	var emp model.Employee
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND personnel_number = ?", tenantID, personnelNumber).
		First(&emp).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee by personnel number: %w", err)
	}
	return &emp, nil
}

// GetByPIN retrieves an employee by tenant ID and PIN.
func (r *EmployeeRepository) GetByPIN(ctx context.Context, tenantID uuid.UUID, pin string) (*model.Employee, error) {
	var emp model.Employee
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND pin = ?", tenantID, pin).
		First(&emp).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee by PIN: %w", err)
	}
	return &emp, nil
}

// GetByCardNumber retrieves an employee by an active card number.
func (r *EmployeeRepository) GetByCardNumber(ctx context.Context, tenantID uuid.UUID, cardNumber string) (*model.Employee, error) {
	var emp model.Employee
	err := r.db.GORM.WithContext(ctx).
		Joins("JOIN employee_cards ON employee_cards.employee_id = employees.id").
		Where("employee_cards.tenant_id = ? AND employee_cards.card_number = ? AND employee_cards.is_active = true", tenantID, cardNumber).
		First(&emp).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee by card number: %w", err)
	}
	return &emp, nil
}

// Update updates an employee.
func (r *EmployeeRepository) Update(ctx context.Context, emp *model.Employee) error {
	return r.db.GORM.WithContext(ctx).Save(emp).Error
}

// Delete soft-deletes an employee by ID.
func (r *EmployeeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Employee{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete employee: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrEmployeeNotFound
	}
	return nil
}

// List retrieves employees with filtering and pagination.
func (r *EmployeeRepository) List(ctx context.Context, filter EmployeeFilter) ([]model.Employee, int64, error) {
	var employees []model.Employee
	var total int64

	query := r.db.GORM.WithContext(ctx).Model(&model.Employee{}).Preload("Tariff").Where("tenant_id = ?", filter.TenantID)

	if filter.DepartmentID != nil {
		query = query.Where(
			"(department_id = ? OR id IN (SELECT tm.employee_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.department_id = ?))",
			*filter.DepartmentID, *filter.DepartmentID,
		)
	}
	if filter.EmployeeGroupID != nil {
		query = query.Where("employee_group_id = ?", *filter.EmployeeGroupID)
	}
	if filter.WorkflowGroupID != nil {
		query = query.Where("workflow_group_id = ?", *filter.WorkflowGroupID)
	}
	if filter.ActivityGroupID != nil {
		query = query.Where("activity_group_id = ?", *filter.ActivityGroupID)
	}
	if filter.IsActive != nil {
		query = query.Where("is_active = ?", *filter.IsActive)
	}
	if filter.HasExitDate != nil {
		if *filter.HasExitDate {
			query = query.Where("exit_date IS NOT NULL")
		} else {
			query = query.Where("exit_date IS NULL")
		}
	}
	if filter.SearchQuery != "" {
		search := "%" + strings.ToLower(filter.SearchQuery) + "%"
		query = query.Where(
			"LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(personnel_number) LIKE ? OR LOWER(email) LIKE ?",
			search, search, search, search,
		)
	}
	switch filter.ScopeType {
	case model.DataScopeDepartment:
		if len(filter.ScopeDepartmentIDs) == 0 {
			query = query.Where("1 = 0")
		} else {
			query = query.Where(
				"(department_id IN ? OR id IN (SELECT tm.employee_id FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE t.department_id IN ?))",
				filter.ScopeDepartmentIDs, filter.ScopeDepartmentIDs,
			)
		}
	case model.DataScopeEmployee:
		if len(filter.ScopeEmployeeIDs) == 0 {
			query = query.Where("1 = 0")
		} else {
			query = query.Where("id IN ?", filter.ScopeEmployeeIDs)
		}
	}

	// Count total
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count employees: %w", err)
	}

	// Apply pagination
	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		query = query.Offset(filter.Offset)
	}

	err := query.Order("last_name ASC, first_name ASC").Find(&employees).Error
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list employees: %w", err)
	}
	return employees, total, nil
}

// GetWithDetails retrieves an employee with related data preloaded.
func (r *EmployeeRepository) GetWithDetails(ctx context.Context, id uuid.UUID) (*model.Employee, error) {
	var emp model.Employee
	err := r.db.GORM.WithContext(ctx).
		Preload("Tariff").
		Preload("Department").
		Preload("CostCenter").
		Preload("EmploymentType").
		Preload("EmployeeGroup").
		Preload("WorkflowGroup").
		Preload("ActivityGroup").
		Preload("Contacts").
		Preload("Contacts.ContactKind").
		Preload("Cards", "is_active = ?", true).
		Where("id = ?", id).
		First(&emp).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee with details: %w", err)
	}
	return &emp, nil
}

// NextPIN returns the next available integer PIN for a tenant.
// It scans all numeric PINs and returns max+1 as a string.
func (r *EmployeeRepository) NextPIN(ctx context.Context, tenantID uuid.UUID) (string, error) {
	var maxPIN *int
	err := r.db.GORM.WithContext(ctx).
		Model(&model.Employee{}).
		Where("tenant_id = ? AND pin ~ '^[0-9]+$'", tenantID).
		Select("MAX(pin::integer)").
		Scan(&maxPIN).Error
	if err != nil {
		return "", fmt.Errorf("failed to get next PIN: %w", err)
	}
	if maxPIN == nil {
		return "1", nil
	}
	return fmt.Sprintf("%d", *maxPIN+1), nil
}

// Search performs a quick search for employees.
func (r *EmployeeRepository) Search(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]model.Employee, error) {
	var employees []model.Employee
	search := "%" + strings.ToLower(query) + "%"
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = true", tenantID).
		Where(
			"LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(personnel_number) LIKE ?",
			search, search, search,
		).
		Limit(limit).
		Order("last_name ASC, first_name ASC").
		Find(&employees).Error

	if err != nil {
		return nil, fmt.Errorf("failed to search employees: %w", err)
	}
	return employees, nil
}

// CreateContact creates a new employee contact.
func (r *EmployeeRepository) CreateContact(ctx context.Context, contact *model.EmployeeContact) error {
	return r.db.GORM.WithContext(ctx).Create(contact).Error
}

// GetContactByID retrieves a contact by ID.
func (r *EmployeeRepository) GetContactByID(ctx context.Context, id uuid.UUID) (*model.EmployeeContact, error) {
	var contact model.EmployeeContact
	err := r.db.GORM.WithContext(ctx).Preload("ContactKind").First(&contact, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrContactNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get contact: %w", err)
	}
	return &contact, nil
}

// DeleteContact deletes an employee contact.
func (r *EmployeeRepository) DeleteContact(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.EmployeeContact{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete contact: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrContactNotFound
	}
	return nil
}

// ListContacts retrieves all contacts for an employee.
func (r *EmployeeRepository) ListContacts(ctx context.Context, employeeID uuid.UUID) ([]model.EmployeeContact, error) {
	var contacts []model.EmployeeContact
	err := r.db.GORM.WithContext(ctx).
		Preload("ContactKind").
		Where("employee_id = ?", employeeID).
		Order("is_primary DESC, contact_type ASC").
		Find(&contacts).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list contacts: %w", err)
	}
	return contacts, nil
}

// CreateCard creates a new employee card.
func (r *EmployeeRepository) CreateCard(ctx context.Context, card *model.EmployeeCard) error {
	return r.db.GORM.WithContext(ctx).Create(card).Error
}

// GetCardByID retrieves a card by ID.
func (r *EmployeeRepository) GetCardByID(ctx context.Context, id uuid.UUID) (*model.EmployeeCard, error) {
	var card model.EmployeeCard
	err := r.db.GORM.WithContext(ctx).First(&card, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCardNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get card: %w", err)
	}
	return &card, nil
}

// GetCardByNumber retrieves a card by card number within a tenant.
func (r *EmployeeRepository) GetCardByNumber(ctx context.Context, tenantID uuid.UUID, cardNumber string) (*model.EmployeeCard, error) {
	var card model.EmployeeCard
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND card_number = ?", tenantID, cardNumber).
		First(&card).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCardNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get card by number: %w", err)
	}
	return &card, nil
}

// UpdateCard updates an employee card.
func (r *EmployeeRepository) UpdateCard(ctx context.Context, card *model.EmployeeCard) error {
	return r.db.GORM.WithContext(ctx).Save(card).Error
}

// ListCards retrieves all cards for an employee.
func (r *EmployeeRepository) ListCards(ctx context.Context, employeeID uuid.UUID) ([]model.EmployeeCard, error) {
	var cards []model.EmployeeCard
	err := r.db.GORM.WithContext(ctx).
		Where("employee_id = ?", employeeID).
		Order("is_active DESC, valid_from DESC").
		Find(&cards).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list cards: %w", err)
	}
	return cards, nil
}

// Upsert creates or updates an employee by ID.
func (r *EmployeeRepository) Upsert(ctx context.Context, emp *model.Employee) error {
	return r.db.GORM.WithContext(ctx).Save(emp).Error
}
