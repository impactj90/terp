package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// Daily value service errors.
var (
	ErrDailyValueNotFound      = errors.New("daily value not found")
	ErrDailyValueHasErrors     = errors.New("daily value has errors")
	ErrDailyValueNotApprovable = errors.New("daily value is not approvable")
)

type dailyValueRepositoryForService interface {
	GetByID(ctx context.Context, id uuid.UUID) (*model.DailyValue, error)
	ListAll(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error)
	Update(ctx context.Context, dv *model.DailyValue) error
}

// DailyValueService handles daily value list/approval logic.
type DailyValueService struct {
	repo            dailyValueRepositoryForService
	notificationSvc *NotificationService
}

// NewDailyValueService creates a new DailyValueService.
func NewDailyValueService(repo dailyValueRepositoryForService) *DailyValueService {
	return &DailyValueService{repo: repo}
}

// SetNotificationService sets the notification service for daily value events.
func (s *DailyValueService) SetNotificationService(notificationSvc *NotificationService) {
	s.notificationSvc = notificationSvc
}

// ListAll returns daily values matching filters for a tenant.
func (s *DailyValueService) ListAll(ctx context.Context, tenantID uuid.UUID, opts model.DailyValueListOptions) ([]model.DailyValue, error) {
	return s.repo.ListAll(ctx, tenantID, opts)
}

// GetByID returns a daily value for a tenant.
func (s *DailyValueService) GetByID(ctx context.Context, tenantID, id uuid.UUID) (*model.DailyValue, error) {
	dv, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrDailyValueNotFound) {
			return nil, ErrDailyValueNotFound
		}
		return nil, fmt.Errorf("failed to get daily value: %w", err)
	}
	if dv.TenantID != tenantID {
		return nil, ErrDailyValueNotFound
	}
	return dv, nil
}

// Approve marks a daily value as approved.
// Returns ErrDailyValueHasErrors if the daily value has errors.
func (s *DailyValueService) Approve(ctx context.Context, tenantID, id uuid.UUID) (*model.DailyValue, error) {
	dv, err := s.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	if dv.HasError || dv.Status == model.DailyValueStatusError {
		return nil, ErrDailyValueHasErrors
	}
	if dv.Status == model.DailyValueStatusApproved {
		return nil, ErrDailyValueNotApprovable
	}

	dv.Status = model.DailyValueStatusApproved
	if err := s.repo.Update(ctx, dv); err != nil {
		return nil, err
	}

	s.notifyTimesheetApproved(ctx, dv)

	return dv, nil
}

func (s *DailyValueService) notifyTimesheetApproved(ctx context.Context, dv *model.DailyValue) {
	if s.notificationSvc == nil || dv == nil {
		return
	}

	dateLabel := dv.ValueDate.Format("2006-01-02")
	link := fmt.Sprintf("/timesheet?view=day&date=%s", dateLabel)
	_, _ = s.notificationSvc.CreateForEmployee(ctx, dv.TenantID, dv.EmployeeID, CreateNotificationInput{
		Type:    model.NotificationTypeApprovals,
		Title:   "Timesheet approved",
		Message: fmt.Sprintf("Your timesheet for %s was approved.", dateLabel),
		Link:    &link,
	})
}
