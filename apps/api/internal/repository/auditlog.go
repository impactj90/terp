package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAuditLogNotFound = errors.New("audit log not found")

// AuditLogFilter defines filter criteria for listing audit logs.
type AuditLogFilter struct {
	TenantID   uuid.UUID
	UserID     *uuid.UUID
	EntityType *string
	EntityID   *uuid.UUID
	Action     *string
	From       *time.Time
	To         *time.Time
	Limit      int
	Cursor     *uuid.UUID
}

// AuditLogRepository handles audit log data access.
type AuditLogRepository struct {
	db *DB
}

// NewAuditLogRepository creates a new audit log repository.
func NewAuditLogRepository(db *DB) *AuditLogRepository {
	return &AuditLogRepository{db: db}
}

// Create creates a new audit log entry.
func (r *AuditLogRepository) Create(ctx context.Context, log *model.AuditLog) error {
	return r.db.GORM.WithContext(ctx).Create(log).Error
}

// GetByID retrieves an audit log by ID.
func (r *AuditLogRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AuditLog, error) {
	var log model.AuditLog
	err := r.db.GORM.WithContext(ctx).
		Preload("User").
		First(&log, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAuditLogNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get audit log: %w", err)
	}
	return &log, nil
}

// List retrieves audit logs with filtering and pagination.
func (r *AuditLogRepository) List(ctx context.Context, filter AuditLogFilter) ([]model.AuditLog, int64, error) {
	var logs []model.AuditLog
	var total int64

	query := r.db.GORM.WithContext(ctx).Model(&model.AuditLog{}).
		Preload("User").
		Where("tenant_id = ?", filter.TenantID)

	if filter.UserID != nil {
		query = query.Where("user_id = ?", *filter.UserID)
	}
	if filter.EntityType != nil {
		query = query.Where("entity_type = ?", *filter.EntityType)
	}
	if filter.EntityID != nil {
		query = query.Where("entity_id = ?", *filter.EntityID)
	}
	if filter.Action != nil {
		query = query.Where("action = ?", *filter.Action)
	}
	if filter.From != nil {
		query = query.Where("performed_at >= ?", *filter.From)
	}
	if filter.To != nil {
		query = query.Where("performed_at <= ?", *filter.To)
	}
	if filter.Cursor != nil {
		query = query.Where("id > ?", *filter.Cursor)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count audit logs: %w", err)
	}

	if filter.Limit > 0 {
		query = query.Limit(filter.Limit)
	}

	err := query.Order("performed_at DESC").Find(&logs).Error
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list audit logs: %w", err)
	}
	return logs, total, nil
}
