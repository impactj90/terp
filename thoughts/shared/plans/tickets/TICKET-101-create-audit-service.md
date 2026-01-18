# TICKET-101: Create Audit Service

**Type**: Service
**Effort**: S
**Sprint**: 25 - Audit Log
**Dependencies**: TICKET-100

## Description

Create the audit service for logging changes.

## Files to Create

- `apps/api/internal/service/audit.go`

## Implementation

```go
package service

import (
    "context"
    "reflect"
    "time"

    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

type AuditService interface {
    Log(ctx context.Context, entry *model.AuditEntry) error
    LogCreate(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, value interface{}) error
    LogUpdate(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, oldValue, newValue interface{}) error
    LogDelete(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, value interface{}) error
    LogAction(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, action model.AuditAction, reason string) error
    GetEntityHistory(ctx context.Context, entityType string, entityID uuid.UUID) ([]model.AuditLog, error)
    Search(ctx context.Context, filter repository.AuditLogFilter, limit, offset int) ([]model.AuditLog, int64, error)
    Cleanup(ctx context.Context, tenantID uuid.UUID, retentionDays int) (int64, error)
}

type auditService struct {
    auditRepo repository.AuditLogRepository
}

func NewAuditService(auditRepo repository.AuditLogRepository) AuditService {
    return &auditService{auditRepo: auditRepo}
}

func (s *auditService) Log(ctx context.Context, entry *model.AuditEntry) error {
    // Extract user info from context if not provided
    if entry.UserID == nil {
        if userID := getUserIDFromContext(ctx); userID != uuid.Nil {
            entry.UserID = &userID
        }
    }
    if entry.IPAddress == "" {
        entry.IPAddress = getIPFromContext(ctx)
    }
    if entry.UserAgent == "" {
        entry.UserAgent = getUserAgentFromContext(ctx)
    }

    return s.auditRepo.CreateFromEntry(ctx, entry)
}

func (s *auditService) LogCreate(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, value interface{}) error {
    entry := &model.AuditEntry{
        TenantID:   tenantID,
        EntityType: entityType,
        EntityID:   entityID,
        Action:     model.AuditActionCreate,
        NewValue:   value,
    }
    return s.Log(ctx, entry)
}

func (s *auditService) LogUpdate(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, oldValue, newValue interface{}) error {
    // Calculate changed fields
    changes := calculateChanges(oldValue, newValue)

    entry := &model.AuditEntry{
        TenantID:   tenantID,
        EntityType: entityType,
        EntityID:   entityID,
        Action:     model.AuditActionUpdate,
        OldValue:   oldValue,
        NewValue:   newValue,
        Metadata:   map[string]interface{}{"changed_fields": changes},
    }
    return s.Log(ctx, entry)
}

func (s *auditService) LogDelete(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, value interface{}) error {
    entry := &model.AuditEntry{
        TenantID:   tenantID,
        EntityType: entityType,
        EntityID:   entityID,
        Action:     model.AuditActionDelete,
        OldValue:   value,
    }
    return s.Log(ctx, entry)
}

func (s *auditService) LogAction(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, action model.AuditAction, reason string) error {
    entry := &model.AuditEntry{
        TenantID:   tenantID,
        EntityType: entityType,
        EntityID:   entityID,
        Action:     action,
        Reason:     reason,
    }
    return s.Log(ctx, entry)
}

func (s *auditService) GetEntityHistory(ctx context.Context, entityType string, entityID uuid.UUID) ([]model.AuditLog, error) {
    return s.auditRepo.ListByEntity(ctx, entityType, entityID)
}

func (s *auditService) Search(ctx context.Context, filter repository.AuditLogFilter, limit, offset int) ([]model.AuditLog, int64, error) {
    return s.auditRepo.List(ctx, filter, limit, offset)
}

func (s *auditService) Cleanup(ctx context.Context, tenantID uuid.UUID, retentionDays int) (int64, error) {
    cutoff := time.Now().AddDate(0, 0, -retentionDays)
    return s.auditRepo.DeleteOlderThan(ctx, tenantID, cutoff)
}

// calculateChanges compares two structs and returns list of changed field names
func calculateChanges(old, new interface{}) []string {
    var changes []string

    oldVal := reflect.ValueOf(old)
    newVal := reflect.ValueOf(new)

    if oldVal.Kind() == reflect.Ptr {
        oldVal = oldVal.Elem()
    }
    if newVal.Kind() == reflect.Ptr {
        newVal = newVal.Elem()
    }

    if oldVal.Kind() != reflect.Struct || newVal.Kind() != reflect.Struct {
        return changes
    }

    for i := 0; i < oldVal.NumField(); i++ {
        field := oldVal.Type().Field(i)
        if !field.IsExported() {
            continue
        }

        oldField := oldVal.Field(i)
        newField := newVal.Field(i)

        if !reflect.DeepEqual(oldField.Interface(), newField.Interface()) {
            changes = append(changes, field.Name)
        }
    }

    return changes
}

// Context helpers (implement based on your context setup)
func getUserIDFromContext(ctx context.Context) uuid.UUID {
    // Extract user ID from context
    return uuid.Nil
}

func getIPFromContext(ctx context.Context) string {
    // Extract IP from context
    return ""
}

func getUserAgentFromContext(ctx context.Context) string {
    // Extract user agent from context
    return ""
}
```

## Unit Tests

**File**: `apps/api/internal/service/audit_test.go`

```go
package service

import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
)

// MockAuditLogRepository for testing
type MockAuditLogRepository struct {
    mock.Mock
}

func (m *MockAuditLogRepository) CreateFromEntry(ctx context.Context, entry *model.AuditEntry) error {
    args := m.Called(ctx, entry)
    return args.Error(0)
}

func (m *MockAuditLogRepository) DeleteOlderThan(ctx context.Context, tenantID uuid.UUID, cutoff time.Time) (int64, error) {
    args := m.Called(ctx, tenantID, cutoff)
    return args.Get(0).(int64), args.Error(1)
}

func TestAuditService_LogCreate_StoresNewValue(t *testing.T) {
    mockRepo := new(MockAuditLogRepository)
    svc := NewAuditService(mockRepo)
    ctx := context.Background()

    tenantID := uuid.New()
    entityID := uuid.New()
    value := &model.Employee{ID: entityID, FirstName: "John"}

    mockRepo.On("CreateFromEntry", ctx, mock.MatchedBy(func(entry *model.AuditEntry) bool {
        return entry.Action == model.AuditActionCreate &&
               entry.EntityID == entityID &&
               entry.TenantID == tenantID
    })).Return(nil)

    err := svc.LogCreate(ctx, tenantID, "employee", entityID, value)
    require.NoError(t, err)
    mockRepo.AssertExpectations(t)
}

func TestAuditService_LogUpdate_StoresOldAndNewValues(t *testing.T) {
    mockRepo := new(MockAuditLogRepository)
    svc := NewAuditService(mockRepo)
    ctx := context.Background()

    oldValue := &model.Employee{FirstName: "John"}
    newValue := &model.Employee{FirstName: "Jane"}

    mockRepo.On("CreateFromEntry", ctx, mock.MatchedBy(func(entry *model.AuditEntry) bool {
        return entry.Action == model.AuditActionUpdate &&
               entry.OldValue != nil &&
               entry.NewValue != nil
    })).Return(nil)

    err := svc.LogUpdate(ctx, uuid.New(), "employee", uuid.New(), oldValue, newValue)
    require.NoError(t, err)
}

func TestAuditService_Cleanup_RemovesOldEntries(t *testing.T) {
    mockRepo := new(MockAuditLogRepository)
    svc := NewAuditService(mockRepo)
    ctx := context.Background()

    tenantID := uuid.New()
    retentionDays := 90

    mockRepo.On("DeleteOlderThan", ctx, tenantID, mock.AnythingOfType("time.Time")).Return(int64(150), nil)

    count, err := svc.Cleanup(ctx, tenantID, retentionDays)
    require.NoError(t, err)
    assert.Equal(t, int64(150), count)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] LogCreate stores new value
- [ ] LogUpdate stores old/new values and changes
- [ ] LogDelete stores deleted value
- [ ] Cleanup removes old entries
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
