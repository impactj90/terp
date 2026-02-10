package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/access"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// NotificationService handles notification logic.
type NotificationService struct {
	notificationRepo *repository.NotificationRepository
	preferencesRepo  *repository.NotificationPreferencesRepository
	userRepo         notificationUserRepository
	employeeRepo     notificationEmployeeRepository
	streamHub        *NotificationStreamHub
}

type notificationUserRepository interface {
	ListByTenant(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]model.User, error)
	GetByEmployeeID(ctx context.Context, tenantID, employeeID uuid.UUID) (*model.User, error)
}

type notificationEmployeeRepository interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.Employee, error)
}

// NewNotificationService creates a new NotificationService.
func NewNotificationService(
	notificationRepo *repository.NotificationRepository,
	preferencesRepo *repository.NotificationPreferencesRepository,
	userRepo notificationUserRepository,
	employeeRepo notificationEmployeeRepository,
) *NotificationService {
	return &NotificationService{
		notificationRepo: notificationRepo,
		preferencesRepo:  preferencesRepo,
		userRepo:         userRepo,
		employeeRepo:     employeeRepo,
	}
}

// SetStreamHub attaches a stream hub for real-time events.
func (s *NotificationService) SetStreamHub(hub *NotificationStreamHub) {
	s.streamHub = hub
}

// NotificationListParams defines filters for listing notifications.
type NotificationListParams struct {
	Type   *model.NotificationType
	Unread *bool
	From   *time.Time
	To     *time.Time
	Limit  int
	Offset int
}

// CreateNotificationInput defines input for creating notifications.
type CreateNotificationInput struct {
	TenantID uuid.UUID
	UserID   uuid.UUID
	Type     model.NotificationType
	Title    string
	Message  string
	Link     *string
}

// ListForUser returns notifications for a user with unread count.
func (s *NotificationService) ListForUser(
	ctx context.Context,
	tenantID, userID uuid.UUID,
	params NotificationListParams,
) ([]model.Notification, int64, int64, error) {
	notifications, total, err := s.notificationRepo.List(ctx, repository.NotificationListFilter{
		TenantID: tenantID,
		UserID:   userID,
		Type:     params.Type,
		Unread:   params.Unread,
		From:     params.From,
		To:       params.To,
		Limit:    params.Limit,
		Offset:   params.Offset,
	})
	if err != nil {
		return nil, 0, 0, err
	}

	unreadCount, err := s.notificationRepo.CountUnread(ctx, tenantID, userID)
	if err != nil {
		return nil, 0, 0, err
	}

	return notifications, total, unreadCount, nil
}

// Create creates a notification for a user, respecting preferences.
func (s *NotificationService) Create(ctx context.Context, input CreateNotificationInput) (*model.Notification, error) {
	prefs, err := s.getOrCreatePreferences(ctx, input.TenantID, input.UserID)
	if err != nil {
		return nil, err
	}

	if !prefs.AllowsType(input.Type) {
		return nil, nil
	}

	notification := &model.Notification{
		TenantID: input.TenantID,
		UserID:   input.UserID,
		Type:     input.Type,
		Title:    input.Title,
		Message:  input.Message,
		Link:     input.Link,
	}

	if err := s.notificationRepo.Create(ctx, notification); err != nil {
		return nil, err
	}

	s.publishEvent(notification.UserID, "notification.created", notification)

	return notification, nil
}

// CreateForTenantAdmins creates notifications for all admin users in the tenant.
func (s *NotificationService) CreateForTenantAdmins(ctx context.Context, tenantID uuid.UUID, input CreateNotificationInput) ([]model.Notification, error) {
	if s.userRepo == nil {
		return nil, errors.New("user repository not configured")
	}

	users, err := s.userRepo.ListByTenant(ctx, tenantID, false)
	if err != nil {
		return nil, err
	}

	var created []model.Notification
	for i := range users {
		user := users[i]
		if !user.IsAdmin() {
			continue
		}
		createdNotification, err := s.Create(ctx, CreateNotificationInput{
			TenantID: tenantID,
			UserID:   user.ID,
			Type:     input.Type,
			Title:    input.Title,
			Message:  input.Message,
			Link:     input.Link,
		})
		if err != nil {
			return nil, err
		}
		if createdNotification != nil {
			created = append(created, *createdNotification)
		}
	}

	return created, nil
}

// CreateForScopedAdmins creates notifications for users who hold the given permission
// and whose DataScope covers the given employee.
// Users in an IsAdmin group or whose UserGroup.Permissions includes permissionID are considered.
// DataScope filtering further restricts delivery based on department/employee scope.
func (s *NotificationService) CreateForScopedAdmins(ctx context.Context, tenantID, employeeID uuid.UUID, permissionID string, input CreateNotificationInput) ([]model.Notification, error) {
	if s.userRepo == nil {
		return nil, errors.New("user repository not configured")
	}
	if s.employeeRepo == nil {
		return nil, errors.New("employee repository not configured")
	}

	employee, err := s.employeeRepo.GetByID(ctx, employeeID)
	if err != nil {
		return nil, fmt.Errorf("load employee for scoped notification: %w", err)
	}

	users, err := s.userRepo.ListByTenant(ctx, tenantID, false)
	if err != nil {
		return nil, err
	}

	var created []model.Notification
	for i := range users {
		user := users[i]

		// Check permission via UserGroup (IsAdmin groups pass all checks)
		if user.UserGroup == nil || !user.UserGroup.HasPermission(permissionID) {
			continue
		}

		scope, err := access.ScopeFromUser(&user)
		if err != nil {
			continue
		}
		if !scope.AllowsEmployee(employee) {
			continue
		}

		createdNotification, err := s.Create(ctx, CreateNotificationInput{
			TenantID: tenantID,
			UserID:   user.ID,
			Type:     input.Type,
			Title:    input.Title,
			Message:  input.Message,
			Link:     input.Link,
		})
		if err != nil {
			return nil, err
		}
		if createdNotification != nil {
			created = append(created, *createdNotification)
		}
	}

	return created, nil
}

// CreateForEmployee creates a notification for the user associated with an employee.
func (s *NotificationService) CreateForEmployee(ctx context.Context, tenantID, employeeID uuid.UUID, input CreateNotificationInput) (*model.Notification, error) {
	if s.userRepo == nil {
		return nil, errors.New("user repository not configured")
	}

	user, err := s.userRepo.GetByEmployeeID(ctx, tenantID, employeeID)
	if errors.Is(err, repository.ErrUserNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return s.Create(ctx, CreateNotificationInput{
		TenantID: tenantID,
		UserID:   user.ID,
		Type:     input.Type,
		Title:    input.Title,
		Message:  input.Message,
		Link:     input.Link,
	})
}

// MarkRead marks a notification as read for a user.
func (s *NotificationService) MarkRead(ctx context.Context, tenantID, userID, notificationID uuid.UUID) (*model.Notification, error) {
	now := time.Now()
	notification, err := s.notificationRepo.MarkRead(ctx, tenantID, userID, notificationID, now)
	if err != nil {
		return nil, err
	}

	s.publishEvent(userID, "notification.read", map[string]any{
		"id":      notification.ID,
		"read_at": notification.ReadAt,
	})

	return notification, nil
}

// MarkAllRead marks all notifications as read for a user.
func (s *NotificationService) MarkAllRead(ctx context.Context, tenantID, userID uuid.UUID) (int64, error) {
	now := time.Now()
	count, err := s.notificationRepo.MarkAllRead(ctx, tenantID, userID, now)
	if err != nil {
		return 0, err
	}

	if count > 0 {
		s.publishEvent(userID, "notification.read_all", map[string]any{
			"read_at": now,
		})
	}

	return count, nil
}

// GetPreferences returns notification preferences for a user.
func (s *NotificationService) GetPreferences(ctx context.Context, tenantID, userID uuid.UUID) (*model.NotificationPreferences, error) {
	return s.getOrCreatePreferences(ctx, tenantID, userID)
}

// UpdatePreferences updates notification preferences for a user.
func (s *NotificationService) UpdatePreferences(ctx context.Context, tenantID, userID uuid.UUID, prefs model.NotificationPreferences) (*model.NotificationPreferences, error) {
	prefs.TenantID = tenantID
	prefs.UserID = userID
	return s.preferencesRepo.Upsert(ctx, &prefs)
}

func (s *NotificationService) getOrCreatePreferences(ctx context.Context, tenantID, userID uuid.UUID) (*model.NotificationPreferences, error) {
	prefs, err := s.preferencesRepo.GetByUser(ctx, tenantID, userID)
	if err == nil {
		return prefs, nil
	}
	if !errors.Is(err, repository.ErrNotificationPreferencesNotFound) {
		return nil, err
	}

	defaults := &model.NotificationPreferences{
		TenantID:         tenantID,
		UserID:           userID,
		ApprovalsEnabled: true,
		ErrorsEnabled:    true,
		RemindersEnabled: true,
		SystemEnabled:    true,
	}

	return s.preferencesRepo.Upsert(ctx, defaults)
}

func (s *NotificationService) publishEvent(userID uuid.UUID, event string, payload any) {
	if s.streamHub == nil {
		return
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return
	}

	s.streamHub.Publish(userID, NotificationStreamEvent{
		Event: event,
		Data:  data,
	})
}
