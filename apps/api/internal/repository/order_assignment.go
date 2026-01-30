package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrOrderAssignmentNotFound = errors.New("order assignment not found")
)

// OrderAssignmentRepository handles order assignment data access.
type OrderAssignmentRepository struct {
	db *DB
}

// NewOrderAssignmentRepository creates a new order assignment repository.
func NewOrderAssignmentRepository(db *DB) *OrderAssignmentRepository {
	return &OrderAssignmentRepository{db: db}
}

// Create creates a new order assignment.
func (r *OrderAssignmentRepository) Create(ctx context.Context, a *model.OrderAssignment) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "OrderID", "EmployeeID", "Role", "ValidFrom", "ValidTo", "IsActive").
		Create(a).Error
}

// GetByID retrieves an order assignment by ID.
func (r *OrderAssignmentRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.OrderAssignment, error) {
	var a model.OrderAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Order").
		Preload("Employee").
		First(&a, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrOrderAssignmentNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get order assignment: %w", err)
	}
	return &a, nil
}

// Update updates an order assignment.
func (r *OrderAssignmentRepository) Update(ctx context.Context, a *model.OrderAssignment) error {
	return r.db.GORM.WithContext(ctx).Save(a).Error
}

// Delete deletes an order assignment by ID.
func (r *OrderAssignmentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.OrderAssignment{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete order assignment: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrOrderAssignmentNotFound
	}
	return nil
}

// List retrieves all order assignments for a tenant.
func (r *OrderAssignmentRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.OrderAssignment, error) {
	var assignments []model.OrderAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Order").
		Preload("Employee").
		Where("tenant_id = ?", tenantID).
		Order("created_at DESC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list order assignments: %w", err)
	}
	return assignments, nil
}

// ListByOrder retrieves all order assignments for a specific order.
func (r *OrderAssignmentRepository) ListByOrder(ctx context.Context, orderID uuid.UUID) ([]model.OrderAssignment, error) {
	var assignments []model.OrderAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Employee").
		Where("order_id = ?", orderID).
		Order("role ASC, created_at DESC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list order assignments by order: %w", err)
	}
	return assignments, nil
}

// ListByEmployee retrieves all order assignments for a specific employee.
func (r *OrderAssignmentRepository) ListByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.OrderAssignment, error) {
	var assignments []model.OrderAssignment
	err := r.db.GORM.WithContext(ctx).
		Preload("Order").
		Where("employee_id = ?", employeeID).
		Order("created_at DESC").
		Find(&assignments).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list order assignments by employee: %w", err)
	}
	return assignments, nil
}
