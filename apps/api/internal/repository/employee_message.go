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
	ErrEmployeeMessageNotFound = errors.New("employee message not found")
)

// EmployeeMessageListFilter defines filters for listing employee messages.
type EmployeeMessageListFilter struct {
	TenantID        uuid.UUID
	RecipientStatus *model.EmployeeMessageRecipientStatus
	EmployeeID      *uuid.UUID // filter to messages for a specific employee
	Limit           int
	Offset          int
}

// EmployeeMessageRepository handles employee message data access.
type EmployeeMessageRepository struct {
	db *DB
}

// NewEmployeeMessageRepository creates a new EmployeeMessageRepository.
func NewEmployeeMessageRepository(db *DB) *EmployeeMessageRepository {
	return &EmployeeMessageRepository{db: db}
}

// Create creates a new employee message with its recipients.
func (r *EmployeeMessageRepository) Create(ctx context.Context, msg *model.EmployeeMessage) error {
	return r.db.GORM.WithContext(ctx).Create(msg).Error
}

// GetByID retrieves an employee message by ID with recipients.
func (r *EmployeeMessageRepository) GetByID(ctx context.Context, tenantID, id uuid.UUID) (*model.EmployeeMessage, error) {
	var msg model.EmployeeMessage
	err := r.db.GORM.WithContext(ctx).
		Preload("Recipients").
		First(&msg, "id = ? AND tenant_id = ?", id, tenantID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get employee message: %w", err)
	}
	return &msg, nil
}

// List returns employee messages matching the filter.
func (r *EmployeeMessageRepository) List(ctx context.Context, filter EmployeeMessageListFilter) ([]model.EmployeeMessage, int64, error) {
	db := r.db.GORM.WithContext(ctx)

	// Use a subquery approach for filtered queries to avoid DISTINCT issues
	if filter.EmployeeID != nil || filter.RecipientStatus != nil {
		return r.listFiltered(db, filter)
	}

	// Simple case: no joins needed
	query := db.Model(&model.EmployeeMessage{}).
		Where("tenant_id = ?", filter.TenantID)

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count employee messages: %w", err)
	}

	dataQuery := query.Order("created_at DESC")
	if filter.Limit > 0 {
		dataQuery = dataQuery.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		dataQuery = dataQuery.Offset(filter.Offset)
	}

	var messages []model.EmployeeMessage
	if err := dataQuery.Preload("Recipients").Find(&messages).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to list employee messages: %w", err)
	}

	return messages, total, nil
}

// listFiltered returns messages matching join-based filters using a subquery for IDs.
func (r *EmployeeMessageRepository) listFiltered(db *gorm.DB, filter EmployeeMessageListFilter) ([]model.EmployeeMessage, int64, error) {
	// Build a subquery that selects message IDs matching the filter
	sub := db.Model(&model.EmployeeMessageRecipient{}).
		Select("DISTINCT message_id")

	if filter.EmployeeID != nil {
		sub = sub.Where("employee_id = ?", *filter.EmployeeID)
	}
	if filter.RecipientStatus != nil {
		sub = sub.Where("status = ?", *filter.RecipientStatus)
	}

	// Count
	var total int64
	if err := db.Model(&model.EmployeeMessage{}).
		Where("tenant_id = ? AND id IN (?)", filter.TenantID, sub).
		Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count employee messages: %w", err)
	}

	// Data
	dataQuery := db.Where("tenant_id = ? AND id IN (?)", filter.TenantID, sub).
		Order("created_at DESC")
	if filter.Limit > 0 {
		dataQuery = dataQuery.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		dataQuery = dataQuery.Offset(filter.Offset)
	}

	var messages []model.EmployeeMessage
	if err := dataQuery.Preload("Recipients").Find(&messages).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to list employee messages: %w", err)
	}

	return messages, total, nil
}

// ListPendingRecipients returns all recipients with status=pending, across all tenants.
// Used by the scheduler task.
func (r *EmployeeMessageRepository) ListPendingRecipients(ctx context.Context) ([]model.EmployeeMessageRecipient, error) {
	var recipients []model.EmployeeMessageRecipient
	err := r.db.GORM.WithContext(ctx).
		Where("status = ?", model.RecipientStatusPending).
		Find(&recipients).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list pending recipients: %w", err)
	}
	return recipients, nil
}

// ListPendingRecipientsByMessage returns pending recipients for a specific message.
func (r *EmployeeMessageRepository) ListPendingRecipientsByMessage(ctx context.Context, messageID uuid.UUID) ([]model.EmployeeMessageRecipient, error) {
	var recipients []model.EmployeeMessageRecipient
	err := r.db.GORM.WithContext(ctx).
		Where("message_id = ? AND status = ?", messageID, model.RecipientStatusPending).
		Find(&recipients).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list pending recipients for message: %w", err)
	}
	return recipients, nil
}

// UpdateRecipientStatus updates the status of a recipient.
func (r *EmployeeMessageRepository) UpdateRecipientStatus(ctx context.Context, recipient *model.EmployeeMessageRecipient) error {
	return r.db.GORM.WithContext(ctx).Save(recipient).Error
}

// GetMessageByRecipientID looks up the parent message for a recipient.
func (r *EmployeeMessageRepository) GetMessageByRecipientID(ctx context.Context, recipientID uuid.UUID) (*model.EmployeeMessage, error) {
	var recipient model.EmployeeMessageRecipient
	err := r.db.GORM.WithContext(ctx).First(&recipient, "id = ?", recipientID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get recipient: %w", err)
	}

	var msg model.EmployeeMessage
	err = r.db.GORM.WithContext(ctx).First(&msg, "id = ?", recipient.MessageID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrEmployeeMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get message: %w", err)
	}
	return &msg, nil
}
