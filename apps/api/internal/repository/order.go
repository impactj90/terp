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
	ErrOrderNotFound = errors.New("order not found")
)

// OrderRepository handles order data access.
type OrderRepository struct {
	db *DB
}

// NewOrderRepository creates a new order repository.
func NewOrderRepository(db *DB) *OrderRepository {
	return &OrderRepository{db: db}
}

// Create creates a new order.
func (r *OrderRepository) Create(ctx context.Context, o *model.Order) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "Code", "Name", "Description", "Status", "Customer", "CostCenterID", "BillingRatePerHour", "ValidFrom", "ValidTo", "IsActive").
		Create(o).Error
}

// GetByID retrieves an order by ID.
func (r *OrderRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Order, error) {
	var o model.Order
	err := r.db.GORM.WithContext(ctx).
		Preload("CostCenter").
		First(&o, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrOrderNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get order: %w", err)
	}
	return &o, nil
}

// GetByCode retrieves an order by tenant ID and code.
func (r *OrderRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Order, error) {
	var o model.Order
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&o).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrOrderNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get order by code: %w", err)
	}
	return &o, nil
}

// Update updates an order.
func (r *OrderRepository) Update(ctx context.Context, o *model.Order) error {
	return r.db.GORM.WithContext(ctx).Save(o).Error
}

// Delete deletes an order by ID.
func (r *OrderRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Order{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete order: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrOrderNotFound
	}
	return nil
}

// List retrieves all orders for a tenant.
func (r *OrderRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Order, error) {
	var orders []model.Order
	err := r.db.GORM.WithContext(ctx).
		Preload("CostCenter").
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&orders).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list orders: %w", err)
	}
	return orders, nil
}

// ListActive retrieves all active orders for a tenant.
func (r *OrderRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Order, error) {
	var orders []model.Order
	err := r.db.GORM.WithContext(ctx).
		Preload("CostCenter").
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("code ASC").
		Find(&orders).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active orders: %w", err)
	}
	return orders, nil
}

// ListByStatus retrieves orders for a tenant filtered by status.
func (r *OrderRepository) ListByStatus(ctx context.Context, tenantID uuid.UUID, status model.OrderStatus) ([]model.Order, error) {
	var orders []model.Order
	err := r.db.GORM.WithContext(ctx).
		Preload("CostCenter").
		Where("tenant_id = ? AND status = ?", tenantID, status).
		Order("code ASC").
		Find(&orders).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list orders by status: %w", err)
	}
	return orders, nil
}
