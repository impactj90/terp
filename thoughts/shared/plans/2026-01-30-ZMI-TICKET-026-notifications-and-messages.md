# Implementation Plan: ZMI-TICKET-026 - Employee Messages and Notifications

## Overview

Implement a message system for sending messages/notifications to employees with delivery status tracking. Messages are created by users (senders), targeted at one or more employees (recipients), and can be sent manually or via the scheduler's existing `send_notifications` task type. Each recipient has independent delivery status tracking (pending/sent/failed).

This is **distinct** from the existing in-app notification system (`notifications` table) which handles system-generated notifications. The new `employee_messages` / `employee_message_recipients` tables model a user-initiated message workflow with explicit send semantics. When a message is "sent" to a recipient, an in-app notification is created for that employee's linked user account.

## Success Criteria

- Messages can be created with a sender (user), message text, and one or more employee recipients.
- Messages can be sent manually (via API endpoint) or automatically (via scheduler task).
- Each recipient has independent status tracking: `pending` -> `sent` or `failed`.
- The scheduler's `send_notifications` placeholder is replaced with a real handler that processes all pending recipients.
- OpenAPI spec documents all new endpoints, schemas, and status values.
- All new code follows existing codebase patterns exactly.
- Tests cover status transitions and scheduler integration.

## Design Decisions

1. **Separate entity from existing notifications**: The existing `notifications` table is for system-generated in-app notifications (read/unread). The new `employee_messages` + `employee_message_recipients` tables model a distinct concept: user-initiated messages with send workflow.

2. **Many-to-many recipient model**: One message can target multiple employees. Each recipient row tracks independent delivery status. This follows the ticket's "Recipients (employees)" plural framing.

3. **"Sent" = in-app notification created**: When a recipient is "sent", the system creates an in-app `Notification` for the employee's linked user account via the existing `NotificationService.CreateForEmployee()`. If the employee has no linked user account, the status becomes `failed` with an error message.

4. **Permission reuse**: Use existing `notifications.manage` permission since this is a sub-feature of the notifications domain.

5. **Scheduler integration**: Replace the `PlaceholderTaskHandler` for `send_notifications` with a real `SendNotificationsTaskHandler` that queries all pending recipients and attempts delivery.

## What We're NOT Doing

- Mobile push notification infrastructure (FCM, APNs) - out of scope per ticket.
- Modifying the existing `Notification` or `NotificationPreferences` models.
- Email delivery - messages are delivered as in-app notifications only.
- Message editing or deletion after creation.
- Rich text or attachments in messages.

---

## Phase 1: Database Migration

### Overview
Create the `employee_messages` and `employee_message_recipients` tables.

### Files to Create

#### 1. Migration Up
**File**: `db/migrations/000068_create_employee_messages.up.sql`

```sql
-- =============================================================
-- Create employee_messages and employee_message_recipients tables
-- ZMI-TICKET-026: Employee Messages and Notifications
-- =============================================================

CREATE TABLE employee_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_employee_messages_tenant ON employee_messages(tenant_id);
CREATE INDEX idx_employee_messages_sender ON employee_messages(sender_id);
CREATE INDEX idx_employee_messages_tenant_created ON employee_messages(tenant_id, created_at DESC);

CREATE TRIGGER update_employee_messages_updated_at
    BEFORE UPDATE ON employee_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_messages IS 'Messages created by users to be sent to employees (ZMI-TICKET-026).';

CREATE TABLE employee_message_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES employee_messages(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_emr_message ON employee_message_recipients(message_id);
CREATE INDEX idx_emr_employee ON employee_message_recipients(employee_id);
CREATE INDEX idx_emr_status ON employee_message_recipients(status);
CREATE INDEX idx_emr_pending ON employee_message_recipients(status) WHERE status = 'pending';

CREATE TRIGGER update_employee_message_recipients_updated_at
    BEFORE UPDATE ON employee_message_recipients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE employee_message_recipients IS 'Per-recipient delivery status for employee messages.';
COMMENT ON COLUMN employee_message_recipients.status IS 'Delivery status: pending, sent, or failed.';
```

#### 2. Migration Down
**File**: `db/migrations/000068_create_employee_messages.down.sql`

```sql
DROP TABLE IF EXISTS employee_message_recipients;
DROP TABLE IF EXISTS employee_messages;
```

### Verification

```bash
cd /home/tolga/projects/terp && make migrate-up
```

Verify the tables exist:
```bash
cd /home/tolga/projects/terp && docker compose -f docker/docker-compose.yml exec db psql -U postgres -d terp -c "\dt employee_message*"
```

---

## Phase 2: OpenAPI Spec

### Overview
Define the OpenAPI schemas and path definitions for employee messages.

### Files to Create

#### 1. Schema File
**File**: `api/schemas/employee-messages.yaml`

```yaml
# Employee message schemas (ZMI-TICKET-026)

EmployeeMessageRecipient:
  type: object
  required:
    - id
    - message_id
    - employee_id
    - status
    - created_at
    - updated_at
  properties:
    id:
      type: string
      format: uuid
    message_id:
      type: string
      format: uuid
    employee_id:
      type: string
      format: uuid
    status:
      type: string
      enum:
        - pending
        - sent
        - failed
    sent_at:
      type: string
      format: date-time
      x-nullable: true
    error_message:
      type: string
      x-nullable: true
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

EmployeeMessage:
  type: object
  required:
    - id
    - tenant_id
    - sender_id
    - subject
    - body
    - created_at
    - updated_at
    - recipients
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    sender_id:
      type: string
      format: uuid
    subject:
      type: string
      example: "Schedule change notification"
    body:
      type: string
      example: "Your shift has been updated for next week."
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time
    recipients:
      type: array
      items:
        $ref: '#/EmployeeMessageRecipient'

EmployeeMessageList:
  type: object
  required:
    - data
    - total
  properties:
    data:
      type: array
      items:
        $ref: '#/EmployeeMessage'
    total:
      type: integer
      format: int64

CreateEmployeeMessageRequest:
  type: object
  required:
    - subject
    - body
    - employee_ids
  properties:
    subject:
      type: string
      minLength: 1
      maxLength: 255
    body:
      type: string
      minLength: 1
    employee_ids:
      type: array
      items:
        type: string
        format: uuid
      minItems: 1

SendEmployeeMessageResponse:
  type: object
  required:
    - message_id
    - sent
    - failed
  properties:
    message_id:
      type: string
      format: uuid
    sent:
      type: integer
      format: int64
      description: Number of recipients successfully sent
    failed:
      type: integer
      format: int64
      description: Number of recipients that failed
```

#### 2. Paths File
**File**: `api/paths/employee-messages.yaml`

```yaml
# Employee message endpoints (ZMI-TICKET-026)

/employee-messages:
  get:
    tags:
      - Employee Messages
    summary: List employee messages
    operationId: listEmployeeMessages
    parameters:
      - name: status
        in: query
        type: string
        enum:
          - pending
          - sent
          - failed
        description: Filter by recipient status (returns messages that have at least one recipient with this status)
      - name: limit
        in: query
        type: integer
        default: 20
        minimum: 1
        maximum: 100
      - name: offset
        in: query
        type: integer
        minimum: 0
        default: 0
    responses:
      200:
        description: List of employee messages
        schema:
          $ref: '../schemas/employee-messages.yaml#/EmployeeMessageList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      403:
        $ref: '../responses/errors.yaml#/Forbidden'
  post:
    tags:
      - Employee Messages
    summary: Create a new employee message
    operationId: createEmployeeMessage
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/employee-messages.yaml#/CreateEmployeeMessageRequest'
    responses:
      201:
        description: Created employee message
        schema:
          $ref: '../schemas/employee-messages.yaml#/EmployeeMessage'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      403:
        $ref: '../responses/errors.yaml#/Forbidden'

/employee-messages/{id}:
  get:
    tags:
      - Employee Messages
    summary: Get an employee message by ID
    operationId: getEmployeeMessage
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Employee message
        schema:
          $ref: '../schemas/employee-messages.yaml#/EmployeeMessage'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      403:
        $ref: '../responses/errors.yaml#/Forbidden'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/employee-messages/{id}/send:
  post:
    tags:
      - Employee Messages
    summary: Send an employee message (deliver to all pending recipients)
    operationId: sendEmployeeMessage
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Send result
        schema:
          $ref: '../schemas/employee-messages.yaml#/SendEmployeeMessageResponse'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      403:
        $ref: '../responses/errors.yaml#/Forbidden'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/employees/{id}/messages:
  get:
    tags:
      - Employee Messages
    summary: List messages for a specific employee
    operationId: listEmployeeMessagesForEmployee
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
        description: Employee ID
      - name: limit
        in: query
        type: integer
        default: 20
        minimum: 1
        maximum: 100
      - name: offset
        in: query
        type: integer
        minimum: 0
        default: 0
    responses:
      200:
        description: List of messages for the employee
        schema:
          $ref: '../schemas/employee-messages.yaml#/EmployeeMessageList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      403:
        $ref: '../responses/errors.yaml#/Forbidden'
```

#### 3. Update Root Spec
**File**: `api/openapi.yaml` (modify)

Add to the `tags:` section:
```yaml
  - name: Employee Messages
    description: Employee message creation and delivery
```

Add to the `paths:` section (after the existing employee routes):
```yaml
  # Employee Messages
  /employee-messages:
    $ref: 'paths/employee-messages.yaml#/~1employee-messages'
  /employee-messages/{id}:
    $ref: 'paths/employee-messages.yaml#/~1employee-messages~1{id}'
  /employee-messages/{id}/send:
    $ref: 'paths/employee-messages.yaml#/~1employee-messages~1{id}~1send'
  /employees/{id}/messages:
    $ref: 'paths/employee-messages.yaml#/~1employees~1{id}~1messages'
```

Add to the `definitions:` section:
```yaml
  # Employee Messages
  EmployeeMessage:
    $ref: 'schemas/employee-messages.yaml#/EmployeeMessage'
  EmployeeMessageRecipient:
    $ref: 'schemas/employee-messages.yaml#/EmployeeMessageRecipient'
  EmployeeMessageList:
    $ref: 'schemas/employee-messages.yaml#/EmployeeMessageList'
  CreateEmployeeMessageRequest:
    $ref: 'schemas/employee-messages.yaml#/CreateEmployeeMessageRequest'
  SendEmployeeMessageResponse:
    $ref: 'schemas/employee-messages.yaml#/SendEmployeeMessageResponse'
```

### Verification

```bash
cd /home/tolga/projects/terp && make swagger-bundle
```

Then generate models:
```bash
cd /home/tolga/projects/terp && make generate
```

Confirm generated files exist:
```bash
ls /home/tolga/projects/terp/apps/api/gen/models/employee_message*.go
```

---

## Phase 3: Models and Repository

### Overview
Create domain models and repository for employee messages.

### Files to Create

#### 1. Domain Model
**File**: `apps/api/internal/model/employee_message.go`

```go
package model

import (
    "time"
    "github.com/google/uuid"
)

// EmployeeMessageRecipientStatus represents delivery status.
type EmployeeMessageRecipientStatus string

const (
    RecipientStatusPending EmployeeMessageRecipientStatus = "pending"
    RecipientStatusSent    EmployeeMessageRecipientStatus = "sent"
    RecipientStatusFailed  EmployeeMessageRecipientStatus = "failed"
)

// EmployeeMessage represents a message created by a user to be sent to employees.
type EmployeeMessage struct {
    ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID  uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    SenderID  uuid.UUID `gorm:"type:uuid;not null" json:"sender_id"`
    Subject   string    `gorm:"type:varchar(255);not null" json:"subject"`
    Body      string    `gorm:"type:text;not null" json:"body"`
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Recipients []EmployeeMessageRecipient `gorm:"foreignKey:MessageID" json:"recipients,omitempty"`
}

func (EmployeeMessage) TableName() string { return "employee_messages" }

// EmployeeMessageRecipient represents a recipient of an employee message with delivery status.
type EmployeeMessageRecipient struct {
    ID           uuid.UUID                      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    MessageID    uuid.UUID                      `gorm:"type:uuid;not null;index" json:"message_id"`
    EmployeeID   uuid.UUID                      `gorm:"type:uuid;not null;index" json:"employee_id"`
    Status       EmployeeMessageRecipientStatus `gorm:"type:varchar(20);not null;default:'pending'" json:"status"`
    SentAt       *time.Time                     `gorm:"type:timestamptz" json:"sent_at,omitempty"`
    ErrorMessage *string                        `gorm:"type:text" json:"error_message,omitempty"`
    CreatedAt    time.Time                      `gorm:"default:now()" json:"created_at"`
    UpdatedAt    time.Time                      `gorm:"default:now()" json:"updated_at"`
}

func (EmployeeMessageRecipient) TableName() string { return "employee_message_recipients" }
```

#### 2. Repository
**File**: `apps/api/internal/repository/employee_message.go`

```go
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
    TenantID       uuid.UUID
    RecipientStatus *model.EmployeeMessageRecipientStatus
    EmployeeID     *uuid.UUID   // filter to messages for a specific employee
    Limit          int
    Offset         int
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
    query := r.db.GORM.WithContext(ctx).Model(&model.EmployeeMessage{}).
        Where("employee_messages.tenant_id = ?", filter.TenantID)

    if filter.EmployeeID != nil {
        query = query.Joins("JOIN employee_message_recipients emr ON emr.message_id = employee_messages.id").
            Where("emr.employee_id = ?", *filter.EmployeeID)
    }

    if filter.RecipientStatus != nil {
        if filter.EmployeeID == nil {
            query = query.Joins("JOIN employee_message_recipients emr ON emr.message_id = employee_messages.id")
        }
        query = query.Where("emr.status = ?", *filter.RecipientStatus)
    }

    // Deduplicate when joining
    if filter.EmployeeID != nil || filter.RecipientStatus != nil {
        query = query.Distinct("employee_messages.*")
    }

    countQuery := query.Session(&gorm.Session{})
    var total int64
    if err := countQuery.Count(&total).Error; err != nil {
        return nil, 0, fmt.Errorf("failed to count employee messages: %w", err)
    }

    dataQuery := query.Order("employee_messages.created_at DESC")
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
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 4: Service Layer

### Overview
Create the employee message service with create, list, get, and send logic.

### Files to Create

#### 1. Service
**File**: `apps/api/internal/service/employee_message.go`

```go
package service

import (
    "context"
    "errors"
    "strings"
    "time"

    "github.com/google/uuid"
    "github.com/rs/zerolog/log"

    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/repository"
)

var (
    ErrEmployeeMessageNotFound     = errors.New("employee message not found")
    ErrEmployeeMessageSubjectEmpty = errors.New("message subject is required")
    ErrEmployeeMessageBodyEmpty    = errors.New("message body is required")
    ErrEmployeeMessageNoRecipients = errors.New("at least one recipient is required")
)

// employeeMessageRepository defines the interface for employee message data access.
type employeeMessageRepository interface {
    Create(ctx context.Context, msg *model.EmployeeMessage) error
    GetByID(ctx context.Context, tenantID, id uuid.UUID) (*model.EmployeeMessage, error)
    List(ctx context.Context, filter repository.EmployeeMessageListFilter) ([]model.EmployeeMessage, int64, error)
    ListPendingRecipients(ctx context.Context) ([]model.EmployeeMessageRecipient, error)
    ListPendingRecipientsByMessage(ctx context.Context, messageID uuid.UUID) ([]model.EmployeeMessageRecipient, error)
    UpdateRecipientStatus(ctx context.Context, recipient *model.EmployeeMessageRecipient) error
    GetMessageByRecipientID(ctx context.Context, recipientID uuid.UUID) (*model.EmployeeMessage, error)
}

// employeeMessageNotificationService defines the interface for creating notifications.
type employeeMessageNotificationService interface {
    CreateForEmployee(ctx context.Context, tenantID, employeeID uuid.UUID, input CreateNotificationInput) (*model.Notification, error)
}

// EmployeeMessageService provides business logic for employee messages.
type EmployeeMessageService struct {
    msgRepo             employeeMessageRepository
    notificationService employeeMessageNotificationService
}

// NewEmployeeMessageService creates a new EmployeeMessageService.
func NewEmployeeMessageService(msgRepo employeeMessageRepository) *EmployeeMessageService {
    return &EmployeeMessageService{msgRepo: msgRepo}
}

// SetNotificationService wires the notification service for message delivery.
func (s *EmployeeMessageService) SetNotificationService(ns employeeMessageNotificationService) {
    s.notificationService = ns
}

// CreateEmployeeMessageInput represents the input for creating a message.
type CreateEmployeeMessageInput struct {
    TenantID    uuid.UUID
    SenderID    uuid.UUID
    Subject     string
    Body        string
    EmployeeIDs []uuid.UUID
}

// Create creates a new employee message with recipients in pending status.
func (s *EmployeeMessageService) Create(ctx context.Context, input CreateEmployeeMessageInput) (*model.EmployeeMessage, error) {
    subject := strings.TrimSpace(input.Subject)
    if subject == "" {
        return nil, ErrEmployeeMessageSubjectEmpty
    }
    body := strings.TrimSpace(input.Body)
    if body == "" {
        return nil, ErrEmployeeMessageBodyEmpty
    }
    if len(input.EmployeeIDs) == 0 {
        return nil, ErrEmployeeMessageNoRecipients
    }

    recipients := make([]model.EmployeeMessageRecipient, len(input.EmployeeIDs))
    for i, empID := range input.EmployeeIDs {
        recipients[i] = model.EmployeeMessageRecipient{
            EmployeeID: empID,
            Status:     model.RecipientStatusPending,
        }
    }

    msg := &model.EmployeeMessage{
        TenantID:   input.TenantID,
        SenderID:   input.SenderID,
        Subject:    subject,
        Body:       body,
        Recipients: recipients,
    }

    if err := s.msgRepo.Create(ctx, msg); err != nil {
        return nil, err
    }

    // Re-fetch with recipients to get populated IDs
    return s.msgRepo.GetByID(ctx, input.TenantID, msg.ID)
}

// GetByID retrieves an employee message by ID.
func (s *EmployeeMessageService) GetByID(ctx context.Context, tenantID, id uuid.UUID) (*model.EmployeeMessage, error) {
    msg, err := s.msgRepo.GetByID(ctx, tenantID, id)
    if err != nil {
        return nil, ErrEmployeeMessageNotFound
    }
    return msg, nil
}

// EmployeeMessageListParams defines filters for listing messages.
type EmployeeMessageListParams struct {
    RecipientStatus *model.EmployeeMessageRecipientStatus
    EmployeeID      *uuid.UUID
    Limit           int
    Offset          int
}

// List retrieves employee messages with optional filtering.
func (s *EmployeeMessageService) List(ctx context.Context, tenantID uuid.UUID, params EmployeeMessageListParams) ([]model.EmployeeMessage, int64, error) {
    return s.msgRepo.List(ctx, repository.EmployeeMessageListFilter{
        TenantID:        tenantID,
        RecipientStatus: params.RecipientStatus,
        EmployeeID:      params.EmployeeID,
        Limit:           params.Limit,
        Offset:          params.Offset,
    })
}

// SendResult holds the result of a send operation.
type SendResult struct {
    MessageID uuid.UUID
    Sent      int64
    Failed    int64
}

// SendMessage sends a specific message to all its pending recipients.
func (s *EmployeeMessageService) SendMessage(ctx context.Context, tenantID, messageID uuid.UUID) (*SendResult, error) {
    msg, err := s.msgRepo.GetByID(ctx, tenantID, messageID)
    if err != nil {
        return nil, ErrEmployeeMessageNotFound
    }

    pending, err := s.msgRepo.ListPendingRecipientsByMessage(ctx, msg.ID)
    if err != nil {
        return nil, err
    }

    result := &SendResult{MessageID: msg.ID}
    for i := range pending {
        if err := s.deliverToRecipient(ctx, msg, &pending[i]); err != nil {
            result.Failed++
        } else {
            result.Sent++
        }
    }

    return result, nil
}

// SendAllPending sends all pending message recipients across all tenants.
// Used by the scheduler task.
func (s *EmployeeMessageService) SendAllPending(ctx context.Context) (int64, int64, error) {
    pending, err := s.msgRepo.ListPendingRecipients(ctx)
    if err != nil {
        return 0, 0, err
    }

    var sent, failed int64
    for i := range pending {
        recipient := &pending[i]

        // Look up the parent message for tenant context
        msg, err := s.msgRepo.GetMessageByRecipientID(ctx, recipient.ID)
        if err != nil {
            log.Warn().Err(err).Str("recipient_id", recipient.ID.String()).Msg("failed to find parent message for recipient")
            s.markRecipientFailed(ctx, recipient, "parent message not found")
            failed++
            continue
        }

        if err := s.deliverToRecipient(ctx, msg, recipient); err != nil {
            failed++
        } else {
            sent++
        }
    }

    return sent, failed, nil
}

// deliverToRecipient attempts to deliver a message to a single recipient
// by creating an in-app notification for the employee's linked user.
func (s *EmployeeMessageService) deliverToRecipient(ctx context.Context, msg *model.EmployeeMessage, recipient *model.EmployeeMessageRecipient) error {
    if s.notificationService == nil {
        s.markRecipientFailed(ctx, recipient, "notification service not configured")
        return errors.New("notification service not configured")
    }

    notification, err := s.notificationService.CreateForEmployee(ctx, msg.TenantID, recipient.EmployeeID, CreateNotificationInput{
        TenantID: msg.TenantID,
        Type:     model.NotificationTypeSystem,
        Title:    msg.Subject,
        Message:  msg.Body,
    })
    if err != nil {
        errMsg := err.Error()
        s.markRecipientFailed(ctx, recipient, errMsg)
        return err
    }

    // CreateForEmployee returns nil if employee has no linked user
    if notification == nil {
        s.markRecipientFailed(ctx, recipient, "employee has no linked user account")
        return errors.New("employee has no linked user account")
    }

    // Mark as sent
    now := time.Now()
    recipient.Status = model.RecipientStatusSent
    recipient.SentAt = &now
    if err := s.msgRepo.UpdateRecipientStatus(ctx, recipient); err != nil {
        log.Error().Err(err).Str("recipient_id", recipient.ID.String()).Msg("failed to update recipient status to sent")
        return err
    }

    return nil
}

func (s *EmployeeMessageService) markRecipientFailed(ctx context.Context, recipient *model.EmployeeMessageRecipient, errMsg string) {
    recipient.Status = model.RecipientStatusFailed
    recipient.ErrorMessage = &errMsg
    if err := s.msgRepo.UpdateRecipientStatus(ctx, recipient); err != nil {
        log.Error().Err(err).Str("recipient_id", recipient.ID.String()).Msg("failed to update recipient status to failed")
    }
}
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

---

## Phase 5: Handler Layer and Route Registration

### Overview
Create the HTTP handler for employee messages and register routes.

### Files to Create/Modify

#### 1. Handler
**File**: `apps/api/internal/handler/employee_message.go`

```go
package handler

import (
    "encoding/json"
    "net/http"
    "strconv"

    "github.com/go-chi/chi/v5"
    "github.com/go-openapi/strfmt"
    "github.com/google/uuid"

    "github.com/tolga/terp/gen/models"
    "github.com/tolga/terp/internal/auth"
    "github.com/tolga/terp/internal/middleware"
    "github.com/tolga/terp/internal/model"
    "github.com/tolga/terp/internal/service"
)

// EmployeeMessageHandler handles employee message HTTP requests.
type EmployeeMessageHandler struct {
    msgService *service.EmployeeMessageService
}

// NewEmployeeMessageHandler creates a new EmployeeMessageHandler.
func NewEmployeeMessageHandler(msgService *service.EmployeeMessageService) *EmployeeMessageHandler {
    return &EmployeeMessageHandler{msgService: msgService}
}

// List handles GET /employee-messages
func (h *EmployeeMessageHandler) List(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    params := service.EmployeeMessageListParams{
        Limit:  20,
        Offset: 0,
    }

    if statusStr := r.URL.Query().Get("status"); statusStr != "" {
        status := model.EmployeeMessageRecipientStatus(statusStr)
        switch status {
        case model.RecipientStatusPending, model.RecipientStatusSent, model.RecipientStatusFailed:
            params.RecipientStatus = &status
        default:
            respondError(w, http.StatusBadRequest, "Invalid status value")
            return
        }
    }

    if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
        limit, err := strconv.Atoi(limitStr)
        if err != nil || limit <= 0 || limit > 100 {
            respondError(w, http.StatusBadRequest, "Invalid limit")
            return
        }
        params.Limit = limit
    }

    if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
        offset, err := strconv.Atoi(offsetStr)
        if err != nil || offset < 0 {
            respondError(w, http.StatusBadRequest, "Invalid offset")
            return
        }
        params.Offset = offset
    }

    messages, total, err := h.msgService.List(r.Context(), tenantID, params)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to list messages")
        return
    }

    response := models.EmployeeMessageList{
        Data: make([]*models.EmployeeMessage, 0, len(messages)),
    }
    for i := range messages {
        response.Data = append(response.Data, h.messageToResponse(&messages[i]))
    }
    response.Total = &total

    respondJSON(w, http.StatusOK, response)
}

// Create handles POST /employee-messages
func (h *EmployeeMessageHandler) Create(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    user, ok := auth.UserFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "User required")
        return
    }

    var req models.CreateEmployeeMessageRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        respondError(w, http.StatusBadRequest, "Invalid request body")
        return
    }

    if err := req.Validate(nil); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    employeeIDs := make([]uuid.UUID, 0, len(req.EmployeeIds))
    for _, idStr := range req.EmployeeIds {
        id, err := uuid.Parse(string(idStr))
        if err != nil {
            respondError(w, http.StatusBadRequest, "Invalid employee ID: "+string(idStr))
            return
        }
        employeeIDs = append(employeeIDs, id)
    }

    msg, err := h.msgService.Create(r.Context(), service.CreateEmployeeMessageInput{
        TenantID:    tenantID,
        SenderID:    user.ID,
        Subject:     *req.Subject,
        Body:        *req.Body,
        EmployeeIDs: employeeIDs,
    })
    if err != nil {
        switch err {
        case service.ErrEmployeeMessageSubjectEmpty,
            service.ErrEmployeeMessageBodyEmpty,
            service.ErrEmployeeMessageNoRecipients:
            respondError(w, http.StatusBadRequest, err.Error())
        default:
            respondError(w, http.StatusInternalServerError, "Failed to create message")
        }
        return
    }

    respondJSON(w, http.StatusCreated, h.messageToResponse(msg))
}

// GetByID handles GET /employee-messages/{id}
func (h *EmployeeMessageHandler) GetByID(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid message ID")
        return
    }

    msg, err := h.msgService.GetByID(r.Context(), tenantID, id)
    if err != nil {
        switch err {
        case service.ErrEmployeeMessageNotFound:
            respondError(w, http.StatusNotFound, "Message not found")
        default:
            respondError(w, http.StatusInternalServerError, "Failed to get message")
        }
        return
    }

    respondJSON(w, http.StatusOK, h.messageToResponse(msg))
}

// Send handles POST /employee-messages/{id}/send
func (h *EmployeeMessageHandler) Send(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid message ID")
        return
    }

    result, err := h.msgService.SendMessage(r.Context(), tenantID, id)
    if err != nil {
        switch err {
        case service.ErrEmployeeMessageNotFound:
            respondError(w, http.StatusNotFound, "Message not found")
        default:
            respondError(w, http.StatusInternalServerError, "Failed to send message")
        }
        return
    }

    msgID := strfmt.UUID(result.MessageID.String())
    respondJSON(w, http.StatusOK, models.SendEmployeeMessageResponse{
        MessageID: &msgID,
        Sent:      &result.Sent,
        Failed:    &result.Failed,
    })
}

// ListForEmployee handles GET /employees/{id}/messages
func (h *EmployeeMessageHandler) ListForEmployee(w http.ResponseWriter, r *http.Request) {
    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    idStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(idStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid employee ID")
        return
    }

    params := service.EmployeeMessageListParams{
        EmployeeID: &employeeID,
        Limit:      20,
        Offset:     0,
    }

    if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
        limit, err := strconv.Atoi(limitStr)
        if err != nil || limit <= 0 || limit > 100 {
            respondError(w, http.StatusBadRequest, "Invalid limit")
            return
        }
        params.Limit = limit
    }

    if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
        offset, err := strconv.Atoi(offsetStr)
        if err != nil || offset < 0 {
            respondError(w, http.StatusBadRequest, "Invalid offset")
            return
        }
        params.Offset = offset
    }

    messages, total, err := h.msgService.List(r.Context(), tenantID, params)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to list messages")
        return
    }

    response := models.EmployeeMessageList{
        Data: make([]*models.EmployeeMessage, 0, len(messages)),
    }
    for i := range messages {
        response.Data = append(response.Data, h.messageToResponse(&messages[i]))
    }
    response.Total = &total

    respondJSON(w, http.StatusOK, response)
}

// messageToResponse converts a domain model to the generated response model.
func (h *EmployeeMessageHandler) messageToResponse(msg *model.EmployeeMessage) *models.EmployeeMessage {
    id := strfmt.UUID(msg.ID.String())
    tenantID := strfmt.UUID(msg.TenantID.String())
    senderID := strfmt.UUID(msg.SenderID.String())
    createdAt := strfmt.DateTime(msg.CreatedAt)
    updatedAt := strfmt.DateTime(msg.UpdatedAt)

    recipients := make([]*models.EmployeeMessageRecipient, 0, len(msg.Recipients))
    for i := range msg.Recipients {
        recipients = append(recipients, h.recipientToResponse(&msg.Recipients[i]))
    }

    return &models.EmployeeMessage{
        ID:         &id,
        TenantID:   &tenantID,
        SenderID:   &senderID,
        Subject:    &msg.Subject,
        Body:       &msg.Body,
        CreatedAt:  &createdAt,
        UpdatedAt:  &updatedAt,
        Recipients: recipients,
    }
}

func (h *EmployeeMessageHandler) recipientToResponse(r *model.EmployeeMessageRecipient) *models.EmployeeMessageRecipient {
    id := strfmt.UUID(r.ID.String())
    msgID := strfmt.UUID(r.MessageID.String())
    empID := strfmt.UUID(r.EmployeeID.String())
    status := string(r.Status)
    createdAt := strfmt.DateTime(r.CreatedAt)
    updatedAt := strfmt.DateTime(r.UpdatedAt)

    resp := &models.EmployeeMessageRecipient{
        ID:         &id,
        MessageID:  &msgID,
        EmployeeID: &empID,
        Status:     &status,
        CreatedAt:  &createdAt,
        UpdatedAt:  &updatedAt,
    }

    if r.SentAt != nil {
        value := strfmt.DateTime(*r.SentAt)
        resp.SentAt = &value
    }
    if r.ErrorMessage != nil {
        resp.ErrorMessage = r.ErrorMessage
    }

    return resp
}
```

#### 2. Route Registration
**File**: `apps/api/internal/handler/routes.go` (modify - add at end of file)

Add the following function:

```go
// RegisterEmployeeMessageRoutes registers employee message routes.
func RegisterEmployeeMessageRoutes(r chi.Router, h *EmployeeMessageHandler, authz *middleware.AuthorizationMiddleware) {
    permManage := permissions.ID("notifications.manage").String()
    r.Route("/employee-messages", func(r chi.Router) {
        if authz == nil {
            r.Get("/", h.List)
            r.Post("/", h.Create)
            r.Get("/{id}", h.GetByID)
            r.Post("/{id}/send", h.Send)
            return
        }

        r.With(authz.RequirePermission(permManage)).Get("/", h.List)
        r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
        r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetByID)
        r.With(authz.RequirePermission(permManage)).Post("/{id}/send", h.Send)
    })

    // Employee-scoped messages
    if authz == nil {
        r.Get("/employees/{id}/messages", h.ListForEmployee)
    } else {
        r.With(authz.RequirePermission(permManage)).Get("/employees/{id}/messages", h.ListForEmployee)
    }
}
```

#### 3. Wiring in main.go
**File**: `apps/api/cmd/server/main.go` (modify)

Add the following in the repository initialization section (after the existing notification repos, around line 86):
```go
employeeMessageRepo := repository.NewEmployeeMessageRepository(db)
```

Add the following in the service initialization section (after notificationService, around line 122):
```go
employeeMessageService := service.NewEmployeeMessageService(employeeMessageRepo)
employeeMessageService.SetNotificationService(notificationService)
```

Add the following in the handler initialization section (after notificationHandler, around line 243):
```go
employeeMessageHandler := handler.NewEmployeeMessageHandler(employeeMessageService)
```

Add the following in the tenant-scoped route group (after `RegisterNotificationRoutes`, around line 416):
```go
handler.RegisterEmployeeMessageRoutes(r, employeeMessageHandler, authzMiddleware)
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./cmd/server/...
```

---

## Phase 6: Scheduler Integration

### Overview
Replace the placeholder `send_notifications` task handler with a real implementation that processes all pending message recipients.

### Files to Create/Modify

#### 1. Task Handler
**File**: `apps/api/internal/service/scheduler_tasks.go` (modify)

Add the following `SendNotificationsTaskHandler` (add above the `PlaceholderTaskHandler` section at the bottom of the file):

```go
// --- Send Notifications Task ---

// employeeMessageServiceForScheduler defines the interface for the scheduler to send pending messages.
type employeeMessageServiceForScheduler interface {
    SendAllPending(ctx context.Context) (int64, int64, error)
}

// SendNotificationsTaskHandler handles the send_notifications task type.
type SendNotificationsTaskHandler struct {
    msgService employeeMessageServiceForScheduler
}

// NewSendNotificationsTaskHandler creates a new SendNotificationsTaskHandler.
func NewSendNotificationsTaskHandler(msgService employeeMessageServiceForScheduler) *SendNotificationsTaskHandler {
    return &SendNotificationsTaskHandler{msgService: msgService}
}

// Execute sends all pending employee messages.
func (h *SendNotificationsTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, _ json.RawMessage) (json.RawMessage, error) {
    log.Info().
        Str("tenant_id", tenantID.String()).
        Msg("executing send_notifications task")

    sent, failed, err := h.msgService.SendAllPending(ctx)
    if err != nil {
        return nil, fmt.Errorf("send_notifications failed: %w", err)
    }

    data, _ := json.Marshal(map[string]interface{}{
        "sent":   sent,
        "failed": failed,
    })
    return data, nil
}
```

#### 2. Update Catalog Description
**File**: `apps/api/internal/service/scheduler_catalog.go` (modify)

Change the `send_notifications` entry description from:
```go
Description: "Sends pending notifications (placeholder - logs execution only).",
```
to:
```go
Description: "Sends all pending employee messages to their recipients as in-app notifications.",
```

#### 3. Replace Placeholder in main.go
**File**: `apps/api/cmd/server/main.go` (modify)

Change the handler registration (line 300) from:
```go
schedulerExecutor.RegisterHandler(model.TaskTypeSendNotifications, service.NewPlaceholderTaskHandler("send_notifications"))
```
to:
```go
schedulerExecutor.RegisterHandler(model.TaskTypeSendNotifications, service.NewSendNotificationsTaskHandler(employeeMessageService))
```

**Important**: Ensure `employeeMessageService` is created before this line. Move its initialization to before the scheduler executor registration block if needed. The new init order should be:
1. `employeeMessageRepo` (repository creation)
2. `employeeMessageService` (service creation)
3. `employeeMessageService.SetNotificationService(notificationService)` (wire notification service)
4. `schedulerExecutor.RegisterHandler(model.TaskTypeSendNotifications, service.NewSendNotificationsTaskHandler(employeeMessageService))`

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go build ./cmd/server/...
```

---

## Phase 7: Tests

### Overview
Write service-level tests covering message creation, sending, status transitions, and scheduler integration.

### Files to Create

#### 1. Service Tests
**File**: `apps/api/internal/service/employee_message_test.go`

The test file should contain the following test cases, each using the integration test pattern from the codebase (real DB via `testutil.SetupTestDB`, creating tenants/employees/users as needed):

**Helper functions:**
- `createTestTenantForMessageService(t, db)` - creates a test tenant
- `createTestUserForMessageService(t, db, tenantID)` - creates a test user
- `createTestEmployeeForMessageService(t, db, tenantID)` - creates a test employee
- `createTestEmployeeWithUser(t, db, tenantID)` - creates an employee AND links a user to it

**Test cases:**

1. `TestEmployeeMessageService_Create_Success` - Create a message with valid input. Verify message fields, recipients in pending status.

2. `TestEmployeeMessageService_Create_EmptySubject` - Create with empty subject returns `ErrEmployeeMessageSubjectEmpty`.

3. `TestEmployeeMessageService_Create_EmptyBody` - Create with empty body returns `ErrEmployeeMessageBodyEmpty`.

4. `TestEmployeeMessageService_Create_NoRecipients` - Create with no employee IDs returns `ErrEmployeeMessageNoRecipients`.

5. `TestEmployeeMessageService_GetByID_Success` - Create then get by ID. Verify returned message matches.

6. `TestEmployeeMessageService_GetByID_NotFound` - Get by random UUID returns `ErrEmployeeMessageNotFound`.

7. `TestEmployeeMessageService_SendMessage_Success` - Create a message to an employee that has a linked user account. Call SendMessage. Verify recipient status changes from `pending` to `sent`, and `sent_at` is populated.

8. `TestEmployeeMessageService_SendMessage_NoLinkedUser` - Create a message to an employee without a linked user. Call SendMessage. Verify recipient status changes to `failed` with error message "employee has no linked user account".

9. `TestEmployeeMessageService_SendMessage_NotFound` - Call SendMessage with random UUID returns `ErrEmployeeMessageNotFound`.

10. `TestEmployeeMessageService_SendMessage_MultipleRecipients` - Create a message to two employees: one with a linked user, one without. Call SendMessage. Verify first recipient is `sent`, second is `failed`. Verify `SendResult.Sent=1, Failed=1`.

11. `TestEmployeeMessageService_List` - Create multiple messages. List with default params. Verify all returned.

12. `TestEmployeeMessageService_List_FilterByStatus` - Create a message and send it. List with `status=sent` filter. Verify message appears.

13. `TestEmployeeMessageService_SendAllPending` - Create two messages with pending recipients. Call SendAllPending. Verify all eligible recipients are processed.

**Pattern to follow** (from `activity_test.go`):
```go
func TestEmployeeMessageService_Create_Success(t *testing.T) {
    db := testutil.SetupTestDB(t)
    msgRepo := repository.NewEmployeeMessageRepository(db)
    msgService := service.NewEmployeeMessageService(msgRepo)
    // Wire notification service for send tests
    notifRepo := repository.NewNotificationRepository(db)
    notifPrefsRepo := repository.NewNotificationPreferencesRepository(db)
    userRepo := repository.NewUserRepository(db)
    notifService := service.NewNotificationService(notifRepo, notifPrefsRepo, userRepo)
    msgService.SetNotificationService(notifService)
    ctx := context.Background()

    tenant := createTestTenantForMessageService(t, db)
    sender := createTestUserForMessageService(t, db, tenant.ID)
    employee := createTestEmployeeForMessageService(t, db, tenant.ID)

    input := service.CreateEmployeeMessageInput{
        TenantID:    tenant.ID,
        SenderID:    sender.ID,
        Subject:     "Test Message",
        Body:        "Hello, employee!",
        EmployeeIDs: []uuid.UUID{employee.ID},
    }

    msg, err := msgService.Create(ctx, input)
    require.NoError(t, err)
    assert.Equal(t, "Test Message", msg.Subject)
    assert.Equal(t, "Hello, employee!", msg.Body)
    assert.Len(t, msg.Recipients, 1)
    assert.Equal(t, model.RecipientStatusPending, msg.Recipients[0].Status)
}
```

### Verification

```bash
cd /home/tolga/projects/terp/apps/api && go test -v -run TestEmployeeMessage ./internal/service/...
```

---

## Verification Steps

### Full Build Verification
```bash
cd /home/tolga/projects/terp/apps/api && go build ./...
```

### Migration
```bash
cd /home/tolga/projects/terp && make migrate-up
```

### OpenAPI Bundle + Generate
```bash
cd /home/tolga/projects/terp && make swagger-bundle && make generate
```

### All Tests
```bash
cd /home/tolga/projects/terp && make test
```

### Lint
```bash
cd /home/tolga/projects/terp && make lint
```

### Manual Verification

After starting the dev server (`make dev`):

1. **Create a message**:
```bash
curl -X POST http://localhost:8080/api/v1/employee-messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>" \
  -d '{"subject":"Test","body":"Hello","employee_ids":["<employee-uuid>"]}'
```
Expect: 201 with message in `pending` status.

2. **Send the message**:
```bash
curl -X POST http://localhost:8080/api/v1/employee-messages/<msg-id>/send \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>"
```
Expect: 200 with `sent` and `failed` counts.

3. **List messages**:
```bash
curl http://localhost:8080/api/v1/employee-messages \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>"
```
Expect: 200 with messages and recipient statuses.

4. **List messages for employee** (personnel master context):
```bash
curl http://localhost:8080/api/v1/employees/<emp-id>/messages \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>"
```
Expect: 200 with messages targeted at that employee.

5. **Verify scheduler task catalog** shows updated description:
```bash
curl http://localhost:8080/api/v1/scheduler/task-catalog \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>"
```
Expect: `send_notifications` entry with updated description (no longer "placeholder").

---

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-026-notifications-and-messages.md`
- Research: `thoughts/shared/research/2026-01-30-ZMI-TICKET-026-notifications-and-messages.md`
- Existing notification system: `apps/api/internal/model/notification.go`, `apps/api/internal/service/notification.go`
- Scheduler system: `apps/api/internal/service/scheduler_tasks.go`, `apps/api/internal/service/scheduler_executor.go`
- Permissions: `apps/api/internal/permissions/permissions.go` (reuses `notifications.manage`)
- Route registration pattern: `apps/api/internal/handler/routes.go`
- Wiring: `apps/api/cmd/server/main.go`
