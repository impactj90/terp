package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrCorrectionMessageNotFound = errors.New("correction message not found")

// CorrectionMessageRepository handles correction message data access.
type CorrectionMessageRepository struct {
	db *DB
}

// NewCorrectionMessageRepository creates a new correction message repository.
func NewCorrectionMessageRepository(db *DB) *CorrectionMessageRepository {
	return &CorrectionMessageRepository{db: db}
}

// Create creates a new correction message entry.
func (r *CorrectionMessageRepository) Create(ctx context.Context, cm *model.CorrectionMessage) error {
	return r.db.GORM.WithContext(ctx).Create(cm).Error
}

// CreateBatch creates multiple correction message entries in a single transaction.
func (r *CorrectionMessageRepository) CreateBatch(ctx context.Context, messages []model.CorrectionMessage) error {
	return r.db.GORM.WithContext(ctx).Create(&messages).Error
}

// GetByID retrieves a correction message by ID.
func (r *CorrectionMessageRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.CorrectionMessage, error) {
	var cm model.CorrectionMessage
	err := r.db.GORM.WithContext(ctx).First(&cm, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCorrectionMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get correction message: %w", err)
	}
	return &cm, nil
}

// GetByCode retrieves a correction message by tenant and code.
func (r *CorrectionMessageRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.CorrectionMessage, error) {
	var cm model.CorrectionMessage
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&cm).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrCorrectionMessageNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get correction message by code: %w", err)
	}
	return &cm, nil
}

// Update updates a correction message.
func (r *CorrectionMessageRepository) Update(ctx context.Context, cm *model.CorrectionMessage) error {
	return r.db.GORM.WithContext(ctx).Save(cm).Error
}

// List retrieves correction messages for a tenant with optional filtering.
func (r *CorrectionMessageRepository) List(ctx context.Context, tenantID uuid.UUID, filter model.CorrectionMessageFilter) ([]model.CorrectionMessage, error) {
	var messages []model.CorrectionMessage
	q := r.db.GORM.WithContext(ctx).Where("tenant_id = ?", tenantID)

	if filter.Severity != nil {
		q = q.Where("severity = ?", *filter.Severity)
	}
	if filter.IsActive != nil {
		q = q.Where("is_active = ?", *filter.IsActive)
	}
	if filter.Code != nil {
		q = q.Where("code = ?", *filter.Code)
	}

	err := q.Order("severity ASC, code ASC").Find(&messages).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list correction messages: %w", err)
	}
	return messages, nil
}

// ListAsMap retrieves all active correction messages for a tenant as a map keyed by code.
func (r *CorrectionMessageRepository) ListAsMap(ctx context.Context, tenantID uuid.UUID) (map[string]*model.CorrectionMessage, error) {
	var messages []model.CorrectionMessage
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_active = true", tenantID).
		Find(&messages).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list correction messages: %w", err)
	}

	result := make(map[string]*model.CorrectionMessage, len(messages))
	for i := range messages {
		result[messages[i].Code] = &messages[i]
	}
	return result, nil
}

// CountByTenant returns the number of correction messages for a tenant.
func (r *CorrectionMessageRepository) CountByTenant(ctx context.Context, tenantID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.GORM.WithContext(ctx).
		Model(&model.CorrectionMessage{}).
		Where("tenant_id = ?", tenantID).
		Count(&count).Error
	return count, err
}
