package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// Sentinel errors for employee message operations.
var (
	ErrEmployeeMessageSubjectRequired    = errors.New("subject is required")
	ErrEmployeeMessageBodyRequired       = errors.New("body is required")
	ErrEmployeeMessageRecipientsRequired = errors.New("at least one employee_id is required")
	ErrEmployeeMessageNotFound           = errors.New("employee message not found")
)

// notificationServiceForMessages is the subset of NotificationService used by EmployeeMessageService.
type notificationServiceForMessages interface {
	CreateForEmployee(ctx context.Context, tenantID, employeeID uuid.UUID, input CreateNotificationInput) (*model.Notification, error)
}

// EmployeeMessageService handles employee message business logic.
type EmployeeMessageService struct {
	repo                *repository.EmployeeMessageRepository
	notificationService notificationServiceForMessages
}

// NewEmployeeMessageService creates a new EmployeeMessageService.
func NewEmployeeMessageService(
	repo *repository.EmployeeMessageRepository,
	notificationService notificationServiceForMessages,
) *EmployeeMessageService {
	return &EmployeeMessageService{
		repo:                repo,
		notificationService: notificationService,
	}
}

// CreateEmployeeMessageInput defines input for creating a message.
type CreateEmployeeMessageInput struct {
	TenantID    uuid.UUID
	SenderID    uuid.UUID
	Subject     string
	Body        string
	EmployeeIDs []uuid.UUID
}

// SendResult reports the outcome of sending a message.
type SendResult struct {
	MessageID uuid.UUID
	Sent      int64
	Failed    int64
}

// Create creates a new employee message with pending recipients.
func (s *EmployeeMessageService) Create(ctx context.Context, input CreateEmployeeMessageInput) (*model.EmployeeMessage, error) {
	if input.Subject == "" {
		return nil, ErrEmployeeMessageSubjectRequired
	}
	if input.Body == "" {
		return nil, ErrEmployeeMessageBodyRequired
	}
	if len(input.EmployeeIDs) == 0 {
		return nil, ErrEmployeeMessageRecipientsRequired
	}

	msg := &model.EmployeeMessage{
		TenantID: input.TenantID,
		SenderID: input.SenderID,
		Subject:  input.Subject,
		Body:     input.Body,
	}

	// Create recipients with pending status
	recipients := make([]model.EmployeeMessageRecipient, 0, len(input.EmployeeIDs))
	for _, empID := range input.EmployeeIDs {
		recipients = append(recipients, model.EmployeeMessageRecipient{
			EmployeeID: empID,
			Status:     model.RecipientStatusPending,
		})
	}
	msg.Recipients = recipients

	if err := s.repo.Create(ctx, msg); err != nil {
		return nil, err
	}

	return msg, nil
}

// GetByID returns a message by ID.
func (s *EmployeeMessageService) GetByID(ctx context.Context, tenantID, id uuid.UUID) (*model.EmployeeMessage, error) {
	msg, err := s.repo.GetByID(ctx, tenantID, id)
	if errors.Is(err, repository.ErrEmployeeMessageNotFound) {
		return nil, ErrEmployeeMessageNotFound
	}
	return msg, err
}

// EmployeeMessageListParams defines filtering parameters for listing messages.
type EmployeeMessageListParams struct {
	RecipientStatus *model.EmployeeMessageRecipientStatus
	EmployeeID      *uuid.UUID
	Limit           int
	Offset          int
}

// List returns employee messages matching the filters.
func (s *EmployeeMessageService) List(ctx context.Context, tenantID uuid.UUID, params EmployeeMessageListParams) ([]model.EmployeeMessage, int64, error) {
	return s.repo.List(ctx, repository.EmployeeMessageListFilter{
		TenantID:        tenantID,
		RecipientStatus: params.RecipientStatus,
		EmployeeID:      params.EmployeeID,
		Limit:           params.Limit,
		Offset:          params.Offset,
	})
}

// Send delivers the message to all pending recipients by creating notifications.
func (s *EmployeeMessageService) Send(ctx context.Context, tenantID, messageID uuid.UUID) (*SendResult, error) {
	msg, err := s.repo.GetByID(ctx, tenantID, messageID)
	if errors.Is(err, repository.ErrEmployeeMessageNotFound) {
		return nil, ErrEmployeeMessageNotFound
	}
	if err != nil {
		return nil, err
	}

	pendingRecipients, err := s.repo.ListPendingRecipientsByMessage(ctx, msg.ID)
	if err != nil {
		return nil, err
	}

	result := &SendResult{MessageID: msg.ID}

	for i := range pendingRecipients {
		recipient := &pendingRecipients[i]

		_, notifErr := s.notificationService.CreateForEmployee(ctx, tenantID, recipient.EmployeeID, CreateNotificationInput{
			TenantID: tenantID,
			Type:     model.NotificationTypeSystem,
			Title:    msg.Subject,
			Message:  msg.Body,
		})

		now := time.Now()
		if notifErr != nil {
			log.Warn().Err(notifErr).
				Str("message_id", msg.ID.String()).
				Str("employee_id", recipient.EmployeeID.String()).
				Msg("failed to send employee message notification")

			recipient.Status = model.RecipientStatusFailed
			errMsg := notifErr.Error()
			recipient.ErrorMessage = &errMsg
			result.Failed++
		} else {
			recipient.Status = model.RecipientStatusSent
			recipient.SentAt = &now
			result.Sent++
		}

		if updateErr := s.repo.UpdateRecipientStatus(ctx, recipient); updateErr != nil {
			log.Error().Err(updateErr).
				Str("recipient_id", recipient.ID.String()).
				Msg("failed to update recipient status")
		}
	}

	return result, nil
}

// ProcessPendingNotifications is called by the scheduler task to process all pending recipients across all tenants.
func (s *EmployeeMessageService) ProcessPendingNotifications(ctx context.Context) (*SendResult, error) {
	pendingRecipients, err := s.repo.ListPendingRecipients(ctx)
	if err != nil {
		return nil, err
	}

	result := &SendResult{}

	for i := range pendingRecipients {
		recipient := &pendingRecipients[i]

		// Resolve the parent message to get tenant_id and subject/body
		msg, msgErr := s.repo.GetMessageByRecipientID(ctx, recipient.ID)
		if msgErr != nil {
			log.Error().Err(msgErr).
				Str("recipient_id", recipient.ID.String()).
				Msg("failed to resolve message for recipient")
			result.Failed++
			continue
		}

		_, notifErr := s.notificationService.CreateForEmployee(ctx, msg.TenantID, recipient.EmployeeID, CreateNotificationInput{
			TenantID: msg.TenantID,
			Type:     model.NotificationTypeSystem,
			Title:    msg.Subject,
			Message:  msg.Body,
		})

		now := time.Now()
		if notifErr != nil {
			log.Warn().Err(notifErr).
				Str("message_id", msg.ID.String()).
				Str("employee_id", recipient.EmployeeID.String()).
				Msg("failed to send pending employee message notification")

			recipient.Status = model.RecipientStatusFailed
			errMsg := notifErr.Error()
			recipient.ErrorMessage = &errMsg
			result.Failed++
		} else {
			recipient.Status = model.RecipientStatusSent
			recipient.SentAt = &now
			result.Sent++
		}

		if updateErr := s.repo.UpdateRecipientStatus(ctx, recipient); updateErr != nil {
			log.Error().Err(updateErr).
				Str("recipient_id", recipient.ID.String()).
				Msg("failed to update recipient status")
		}
	}

	return result, nil
}
