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

var (
	ErrNotificationNotFound            = errors.New("notification not found")
	ErrNotificationPreferencesNotFound = errors.New("notification preferences not found")
)

// NotificationListFilter defines filters for listing notifications.
type NotificationListFilter struct {
	TenantID uuid.UUID
	UserID   uuid.UUID
	Type     *model.NotificationType
	Unread   *bool
	From     *time.Time
	To       *time.Time
	Limit    int
	Offset   int
}

// NotificationRepository handles notification data access.
type NotificationRepository struct {
	db *DB
}

// NewNotificationRepository creates a new NotificationRepository.
func NewNotificationRepository(db *DB) *NotificationRepository {
	return &NotificationRepository{db: db}
}

// Create inserts a new notification.
func (r *NotificationRepository) Create(ctx context.Context, notification *model.Notification) error {
	return r.db.GORM.WithContext(ctx).Create(notification).Error
}

// List returns notifications matching the filter, ordered by most recent first.
func (r *NotificationRepository) List(ctx context.Context, filter NotificationListFilter) ([]model.Notification, int64, error) {
	query := r.db.GORM.WithContext(ctx).Model(&model.Notification{}).
		Where("tenant_id = ? AND user_id = ?", filter.TenantID, filter.UserID)

	if filter.Type != nil {
		query = query.Where("type = ?", *filter.Type)
	}
	if filter.Unread != nil {
		if *filter.Unread {
			query = query.Where("read_at IS NULL")
		} else {
			query = query.Where("read_at IS NOT NULL")
		}
	}
	if filter.From != nil {
		query = query.Where("created_at >= ?", *filter.From)
	}
	if filter.To != nil {
		query = query.Where("created_at <= ?", *filter.To)
	}

	countQuery := query.Session(&gorm.Session{})
	var total int64
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count notifications: %w", err)
	}

	dataQuery := query.Order("created_at DESC")
	if filter.Limit > 0 {
		dataQuery = dataQuery.Limit(filter.Limit)
	}
	if filter.Offset > 0 {
		dataQuery = dataQuery.Offset(filter.Offset)
	}

	var notifications []model.Notification
	if err := dataQuery.Find(&notifications).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to list notifications: %w", err)
	}

	return notifications, total, nil
}

// MarkRead sets read_at for a notification belonging to the user.
func (r *NotificationRepository) MarkRead(ctx context.Context, tenantID, userID, notificationID uuid.UUID, readAt time.Time) (*model.Notification, error) {
	var notification model.Notification
	err := r.db.GORM.WithContext(ctx).
		First(&notification, "id = ? AND tenant_id = ? AND user_id = ?", notificationID, tenantID, userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotificationNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get notification: %w", err)
	}

	if notification.ReadAt == nil {
		notification.ReadAt = &readAt
		if err := r.db.GORM.WithContext(ctx).Save(&notification).Error; err != nil {
			return nil, fmt.Errorf("failed to update notification: %w", err)
		}
	}

	return &notification, nil
}

// MarkAllRead sets read_at for all unread notifications for a user.
func (r *NotificationRepository) MarkAllRead(ctx context.Context, tenantID, userID uuid.UUID, readAt time.Time) (int64, error) {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.Notification{}).
		Where("tenant_id = ? AND user_id = ? AND read_at IS NULL", tenantID, userID).
		Updates(map[string]any{"read_at": readAt})

	if result.Error != nil {
		return 0, fmt.Errorf("failed to mark notifications as read: %w", result.Error)
	}

	return result.RowsAffected, nil
}

// CountUnread returns the unread notification count for a user.
func (r *NotificationRepository) CountUnread(ctx context.Context, tenantID, userID uuid.UUID) (int64, error) {
	var count int64
	if err := r.db.GORM.WithContext(ctx).
		Model(&model.Notification{}).
		Where("tenant_id = ? AND user_id = ? AND read_at IS NULL", tenantID, userID).
		Count(&count).Error; err != nil {
		return 0, fmt.Errorf("failed to count unread notifications: %w", err)
	}
	return count, nil
}

// NotificationPreferencesRepository handles notification preferences data access.
type NotificationPreferencesRepository struct {
	db *DB
}

// NewNotificationPreferencesRepository creates a new NotificationPreferencesRepository.
func NewNotificationPreferencesRepository(db *DB) *NotificationPreferencesRepository {
	return &NotificationPreferencesRepository{db: db}
}

// GetByUser retrieves preferences for a user.
func (r *NotificationPreferencesRepository) GetByUser(ctx context.Context, tenantID, userID uuid.UUID) (*model.NotificationPreferences, error) {
	var prefs model.NotificationPreferences
	err := r.db.GORM.WithContext(ctx).
		First(&prefs, "tenant_id = ? AND user_id = ?", tenantID, userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotificationPreferencesNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get notification preferences: %w", err)
	}
	return &prefs, nil
}

// Upsert creates or updates preferences for a user.
func (r *NotificationPreferencesRepository) Upsert(ctx context.Context, prefs *model.NotificationPreferences) (*model.NotificationPreferences, error) {
	if err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND user_id = ?", prefs.TenantID, prefs.UserID).
		Assign(prefs).
		FirstOrCreate(prefs).Error; err != nil {
		return nil, fmt.Errorf("failed to upsert notification preferences: %w", err)
	}
	return prefs, nil
}
