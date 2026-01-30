package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrOrderNotFound     = errors.New("order not found")
	ErrOrderCodeRequired = errors.New("order code is required")
	ErrOrderNameRequired = errors.New("order name is required")
	ErrOrderCodeExists   = errors.New("order code already exists")
)

// orderRepository defines the interface for order data access.
type orderRepository interface {
	Create(ctx context.Context, o *model.Order) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Order, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.Order, error)
	Update(ctx context.Context, o *model.Order) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Order, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Order, error)
	ListByStatus(ctx context.Context, tenantID uuid.UUID, status model.OrderStatus) ([]model.Order, error)
}

// OrderService provides business logic for orders.
type OrderService struct {
	orderRepo orderRepository
}

// NewOrderService creates a new OrderService.
func NewOrderService(orderRepo orderRepository) *OrderService {
	return &OrderService{orderRepo: orderRepo}
}

// CreateOrderInput represents the input for creating an order.
type CreateOrderInput struct {
	TenantID           uuid.UUID
	Code               string
	Name               string
	Description        string
	Status             string
	Customer           string
	CostCenterID       *uuid.UUID
	BillingRatePerHour *decimal.Decimal
	ValidFrom          *string
	ValidTo            *string
}

// Create creates a new order with validation.
func (s *OrderService) Create(ctx context.Context, input CreateOrderInput) (*model.Order, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrOrderCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrOrderNameRequired
	}

	existing, err := s.orderRepo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrOrderCodeExists
	}

	status := model.OrderStatusActive
	if input.Status != "" {
		status = model.OrderStatus(input.Status)
	}

	o := &model.Order{
		TenantID:           input.TenantID,
		Code:               code,
		Name:               name,
		Description:        strings.TrimSpace(input.Description),
		Status:             status,
		Customer:           strings.TrimSpace(input.Customer),
		CostCenterID:       input.CostCenterID,
		BillingRatePerHour: input.BillingRatePerHour,
		IsActive:           true,
	}

	if input.ValidFrom != nil {
		t, err := parseDate(*input.ValidFrom)
		if err == nil {
			o.ValidFrom = &t
		}
	}
	if input.ValidTo != nil {
		t, err := parseDate(*input.ValidTo)
		if err == nil {
			o.ValidTo = &t
		}
	}

	if err := s.orderRepo.Create(ctx, o); err != nil {
		return nil, err
	}

	return s.orderRepo.GetByID(ctx, o.ID)
}

// GetByID retrieves an order by ID.
func (s *OrderService) GetByID(ctx context.Context, id uuid.UUID) (*model.Order, error) {
	o, err := s.orderRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrOrderNotFound
	}
	return o, nil
}

// UpdateOrderInput represents the input for updating an order.
type UpdateOrderInput struct {
	Code               *string
	Name               *string
	Description        *string
	Status             *string
	Customer           *string
	CostCenterID       *uuid.UUID
	BillingRatePerHour *decimal.Decimal
	ValidFrom          *string
	ValidTo            *string
	IsActive           *bool
}

// Update updates an order.
func (s *OrderService) Update(ctx context.Context, id uuid.UUID, input UpdateOrderInput) (*model.Order, error) {
	o, err := s.orderRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrOrderNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrOrderCodeRequired
		}
		if code != o.Code {
			existing, err := s.orderRepo.GetByCode(ctx, o.TenantID, code)
			if err == nil && existing != nil {
				return nil, ErrOrderCodeExists
			}
		}
		o.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrOrderNameRequired
		}
		o.Name = name
	}
	if input.Description != nil {
		o.Description = strings.TrimSpace(*input.Description)
	}
	if input.Status != nil {
		o.Status = model.OrderStatus(*input.Status)
	}
	if input.Customer != nil {
		o.Customer = strings.TrimSpace(*input.Customer)
	}
	if input.CostCenterID != nil {
		o.CostCenterID = input.CostCenterID
	}
	if input.BillingRatePerHour != nil {
		o.BillingRatePerHour = input.BillingRatePerHour
	}
	if input.ValidFrom != nil {
		t, err := parseDate(*input.ValidFrom)
		if err == nil {
			o.ValidFrom = &t
		}
	}
	if input.ValidTo != nil {
		t, err := parseDate(*input.ValidTo)
		if err == nil {
			o.ValidTo = &t
		}
	}
	if input.IsActive != nil {
		o.IsActive = *input.IsActive
	}

	if err := s.orderRepo.Update(ctx, o); err != nil {
		return nil, err
	}

	return s.orderRepo.GetByID(ctx, o.ID)
}

// Delete deletes an order by ID.
func (s *OrderService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.orderRepo.GetByID(ctx, id)
	if err != nil {
		return ErrOrderNotFound
	}
	return s.orderRepo.Delete(ctx, id)
}

// List retrieves all orders for a tenant.
func (s *OrderService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Order, error) {
	return s.orderRepo.List(ctx, tenantID)
}

// ListActive retrieves all active orders for a tenant.
func (s *OrderService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Order, error) {
	return s.orderRepo.ListActive(ctx, tenantID)
}

// ListByStatus retrieves orders for a tenant filtered by status.
func (s *OrderService) ListByStatus(ctx context.Context, tenantID uuid.UUID, status model.OrderStatus) ([]model.Order, error) {
	return s.orderRepo.ListByStatus(ctx, tenantID, status)
}
