# TICKET-100: Create Audit Log Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 25 - Audit Log
**Dependencies**: TICKET-099

## Description

Create the AuditLog model and repository.

## Files to Create

- `apps/api/internal/model/auditlog.go`
- `apps/api/internal/repository/auditlog.go`

## Implementation

### Model

```go
package model

import (
    "encoding/json"
    "time"

    "github.com/google/uuid"
)

type AuditAction string

const (
    AuditActionCreate  AuditAction = "create"
    AuditActionUpdate  AuditAction = "update"
    AuditActionDelete  AuditAction = "delete"
    AuditActionApprove AuditAction = "approve"
    AuditActionReject  AuditAction = "reject"
    AuditActionClose   AuditAction = "close"
    AuditActionReopen  AuditAction = "reopen"
)

type AuditLog struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    EntityType string    `gorm:"type:varchar(50);not null" json:"entity_type"`
    EntityID   uuid.UUID `gorm:"type:uuid;not null" json:"entity_id"`

    Action    AuditAction     `gorm:"type:varchar(20);not null" json:"action"`
    Changes   json.RawMessage `gorm:"type:jsonb" json:"changes,omitempty"`
    OldValues json.RawMessage `gorm:"type:jsonb" json:"old_values,omitempty"`
    NewValues json.RawMessage `gorm:"type:jsonb" json:"new_values,omitempty"`

    UserID    *uuid.UUID `gorm:"type:uuid" json:"user_id,omitempty"`
    UserEmail string     `gorm:"type:varchar(255)" json:"user_email,omitempty"`
    IPAddress string     `gorm:"type:inet" json:"ip_address,omitempty"`
    UserAgent string     `gorm:"type:text" json:"user_agent,omitempty"`

    Reason   string          `gorm:"type:text" json:"reason,omitempty"`
    Metadata json.RawMessage `gorm:"type:jsonb" json:"metadata,omitempty"`

    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
}

func (AuditLog) TableName() string {
    return "audit_logs"
}

// AuditEntry is a helper to create audit logs
type AuditEntry struct {
    TenantID   uuid.UUID
    EntityType string
    EntityID   uuid.UUID
    Action     AuditAction
    UserID     *uuid.UUID
    UserEmail  string
    IPAddress  string
    UserAgent  string
    Reason     string
    OldValue   interface{}
    NewValue   interface{}
    Metadata   map[string]interface{}
}

// ToAuditLog converts entry to model
func (e *AuditEntry) ToAuditLog() (*AuditLog, error) {
    log := &AuditLog{
        TenantID:   e.TenantID,
        EntityType: e.EntityType,
        EntityID:   e.EntityID,
        Action:     e.Action,
        UserID:     e.UserID,
        UserEmail:  e.UserEmail,
        IPAddress:  e.IPAddress,
        UserAgent:  e.UserAgent,
        Reason:     e.Reason,
    }

    if e.OldValue != nil {
        data, err := json.Marshal(e.OldValue)
        if err != nil {
            return nil, err
        }
        log.OldValues = data
    }

    if e.NewValue != nil {
        data, err := json.Marshal(e.NewValue)
        if err != nil {
            return nil, err
        }
        log.NewValues = data
    }

    if e.Metadata != nil {
        data, err := json.Marshal(e.Metadata)
        if err != nil {
            return nil, err
        }
        log.Metadata = data
    }

    return log, nil
}
```

### Repository

```go
package repository

import (
    "context"
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type AuditLogFilter struct {
    TenantID   *uuid.UUID
    EntityType *string
    EntityID   *uuid.UUID
    Action     *model.AuditAction
    UserID     *uuid.UUID
    From       *time.Time
    To         *time.Time
}

type AuditLogRepository interface {
    Create(ctx context.Context, log *model.AuditLog) error
    CreateFromEntry(ctx context.Context, entry *model.AuditEntry) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.AuditLog, error)
    List(ctx context.Context, filter AuditLogFilter, limit, offset int) ([]model.AuditLog, int64, error)
    ListByEntity(ctx context.Context, entityType string, entityID uuid.UUID) ([]model.AuditLog, error)
    DeleteOlderThan(ctx context.Context, tenantID uuid.UUID, before time.Time) (int64, error)
}

type auditLogRepository struct {
    db *gorm.DB
}

func NewAuditLogRepository(db *gorm.DB) AuditLogRepository {
    return &auditLogRepository{db: db}
}

func (r *auditLogRepository) Create(ctx context.Context, log *model.AuditLog) error {
    return r.db.WithContext(ctx).Create(log).Error
}

func (r *auditLogRepository) CreateFromEntry(ctx context.Context, entry *model.AuditEntry) error {
    log, err := entry.ToAuditLog()
    if err != nil {
        return err
    }
    return r.Create(ctx, log)
}

func (r *auditLogRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AuditLog, error) {
    var log model.AuditLog
    err := r.db.WithContext(ctx).First(&log, "id = ?", id).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &log, err
}

func (r *auditLogRepository) List(ctx context.Context, filter AuditLogFilter, limit, offset int) ([]model.AuditLog, int64, error) {
    var logs []model.AuditLog
    var total int64

    query := r.db.WithContext(ctx).Model(&model.AuditLog{})

    if filter.TenantID != nil {
        query = query.Where("tenant_id = ?", *filter.TenantID)
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
    if filter.UserID != nil {
        query = query.Where("user_id = ?", *filter.UserID)
    }
    if filter.From != nil {
        query = query.Where("created_at >= ?", *filter.From)
    }
    if filter.To != nil {
        query = query.Where("created_at <= ?", *filter.To)
    }

    if err := query.Count(&total).Error; err != nil {
        return nil, 0, err
    }

    err := query.Order("created_at DESC").
        Limit(limit).
        Offset(offset).
        Find(&logs).Error

    return logs, total, err
}

func (r *auditLogRepository) ListByEntity(ctx context.Context, entityType string, entityID uuid.UUID) ([]model.AuditLog, error) {
    var logs []model.AuditLog
    err := r.db.WithContext(ctx).
        Where("entity_type = ? AND entity_id = ?", entityType, entityID).
        Order("created_at DESC").
        Find(&logs).Error
    return logs, err
}

func (r *auditLogRepository) DeleteOlderThan(ctx context.Context, tenantID uuid.UUID, before time.Time) (int64, error) {
    result := r.db.WithContext(ctx).
        Where("tenant_id = ? AND created_at < ?", tenantID, before).
        Delete(&model.AuditLog{})
    return result.RowsAffected, result.Error
}
```

## Unit Tests

**File**: `apps/api/internal/repository/auditlog_test.go`

```go
package repository

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"terp/apps/api/internal/model"
	"terp/apps/api/internal/testutil"
)

func TestAuditLogRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	entityID := uuid.New()
	userID := uuid.New()

	log := &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "booking",
		EntityID:   entityID,
		Action:     model.AuditActionCreate,
		UserID:     &userID,
		UserEmail:  "user@example.com",
		IPAddress:  "192.168.1.1",
		Reason:     "Created new booking",
	}

	err := repo.Create(ctx, log)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, log.ID)
}

func TestAuditLogRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	entityID := uuid.New()

	log := &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "booking",
		EntityID:   entityID,
		Action:     model.AuditActionUpdate,
		Reason:     "Updated booking",
	}
	repo.Create(ctx, log)

	found, err := repo.GetByID(ctx, log.ID)
	require.NoError(t, err)
	assert.NotNil(t, found)
	assert.Equal(t, log.ID, found.ID)
	assert.Equal(t, "booking", found.EntityType)
	assert.Equal(t, model.AuditActionUpdate, found.Action)
}

func TestAuditLogRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	found, err := repo.GetByID(ctx, uuid.New())
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestAuditLogRepository_CreateFromEntry(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	entityID := uuid.New()
	userID := uuid.New()

	entry := &model.AuditEntry{
		TenantID:   tenantID,
		EntityType: "correction",
		EntityID:   entityID,
		Action:     model.AuditActionApprove,
		UserID:     &userID,
		UserEmail:  "approver@example.com",
		Reason:     "Approved correction",
		OldValue:   map[string]interface{}{"status": "pending"},
		NewValue:   map[string]interface{}{"status": "approved"},
		Metadata:   map[string]interface{}{"notes": "Looks good"},
	}

	err := repo.CreateFromEntry(ctx, entry)
	require.NoError(t, err)

	// Verify the log was created
	filter := AuditLogFilter{
		TenantID:   &tenantID,
		EntityType: testutil.StringPtr("correction"),
		EntityID:   &entityID,
	}
	logs, _, _ := repo.List(ctx, filter, 10, 0)
	require.Len(t, logs, 1)

	log := logs[0]
	assert.Equal(t, model.AuditActionApprove, log.Action)
	assert.NotNil(t, log.OldValues)
	assert.NotNil(t, log.NewValues)
	assert.NotNil(t, log.Metadata)

	// Verify JSON content
	var oldValues map[string]interface{}
	json.Unmarshal(log.OldValues, &oldValues)
	assert.Equal(t, "pending", oldValues["status"])

	var newValues map[string]interface{}
	json.Unmarshal(log.NewValues, &newValues)
	assert.Equal(t, "approved", newValues["status"])
}

func TestAuditLogRepository_List_NoFilters(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create multiple logs
	for i := 0; i < 5; i++ {
		repo.Create(ctx, &model.AuditLog{
			TenantID:   tenantID,
			EntityType: "booking",
			EntityID:   uuid.New(),
			Action:     model.AuditActionCreate,
		})
	}

	logs, total, err := repo.List(ctx, AuditLogFilter{}, 10, 0)
	require.NoError(t, err)
	assert.Len(t, logs, 5)
	assert.Equal(t, int64(5), total)
}

func TestAuditLogRepository_List_FilterByTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenant1 := uuid.New()
	tenant2 := uuid.New()

	// Create logs for tenant1
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenant1,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	})
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenant1,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionUpdate,
	})

	// Create log for tenant2
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenant2,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	})

	filter := AuditLogFilter{
		TenantID: &tenant1,
	}
	logs, total, err := repo.List(ctx, filter, 10, 0)
	require.NoError(t, err)
	assert.Len(t, logs, 2)
	assert.Equal(t, int64(2), total)
}

func TestAuditLogRepository_List_FilterByEntityType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	entityType := "correction"

	// Create logs for different entity types
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "correction",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	})
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	})

	filter := AuditLogFilter{
		EntityType: &entityType,
	}
	logs, total, err := repo.List(ctx, filter, 10, 0)
	require.NoError(t, err)
	assert.Len(t, logs, 1)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, "correction", logs[0].EntityType)
}

func TestAuditLogRepository_List_FilterByAction(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	action := model.AuditActionApprove

	// Create logs with different actions
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "correction",
		EntityID:   uuid.New(),
		Action:     model.AuditActionApprove,
	})
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "correction",
		EntityID:   uuid.New(),
		Action:     model.AuditActionReject,
	})

	filter := AuditLogFilter{
		Action: &action,
	}
	logs, total, err := repo.List(ctx, filter, 10, 0)
	require.NoError(t, err)
	assert.Len(t, logs, 1)
	assert.Equal(t, int64(1), total)
	assert.Equal(t, model.AuditActionApprove, logs[0].Action)
}

func TestAuditLogRepository_List_FilterByTimeRange(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	now := time.Now()
	yesterday := now.Add(-24 * time.Hour)
	tomorrow := now.Add(24 * time.Hour)

	// Create log
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	})

	// Filter with time range that includes the log
	filter := AuditLogFilter{
		From: &yesterday,
		To:   &tomorrow,
	}
	logs, total, err := repo.List(ctx, filter, 10, 0)
	require.NoError(t, err)
	assert.Len(t, logs, 1)
	assert.Equal(t, int64(1), total)

	// Filter with time range that excludes the log
	twoDaysAgo := now.Add(-48 * time.Hour)
	filterExclude := AuditLogFilter{
		From: &twoDaysAgo,
		To:   &yesterday,
	}
	logsExclude, totalExclude, err := repo.List(ctx, filterExclude, 10, 0)
	require.NoError(t, err)
	assert.Len(t, logsExclude, 0)
	assert.Equal(t, int64(0), totalExclude)
}

func TestAuditLogRepository_List_Pagination(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create 10 logs
	for i := 0; i < 10; i++ {
		repo.Create(ctx, &model.AuditLog{
			TenantID:   tenantID,
			EntityType: "booking",
			EntityID:   uuid.New(),
			Action:     model.AuditActionCreate,
		})
		time.Sleep(time.Millisecond) // Ensure different timestamps
	}

	// First page
	logs1, total, err := repo.List(ctx, AuditLogFilter{}, 5, 0)
	require.NoError(t, err)
	assert.Len(t, logs1, 5)
	assert.Equal(t, int64(10), total)

	// Second page
	logs2, total2, err := repo.List(ctx, AuditLogFilter{}, 5, 5)
	require.NoError(t, err)
	assert.Len(t, logs2, 5)
	assert.Equal(t, int64(10), total2)

	// Verify no overlap
	ids1 := make(map[uuid.UUID]bool)
	for _, log := range logs1 {
		ids1[log.ID] = true
	}
	for _, log := range logs2 {
		assert.False(t, ids1[log.ID], "Pages should not overlap")
	}
}

func TestAuditLogRepository_List_OrderByCreatedAtDesc(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create logs with delays to ensure different timestamps
	for i := 0; i < 3; i++ {
		repo.Create(ctx, &model.AuditLog{
			TenantID:   tenantID,
			EntityType: "booking",
			EntityID:   uuid.New(),
			Action:     model.AuditActionCreate,
		})
		time.Sleep(10 * time.Millisecond)
	}

	logs, _, err := repo.List(ctx, AuditLogFilter{}, 10, 0)
	require.NoError(t, err)
	assert.Len(t, logs, 3)

	// Verify ordered by created_at DESC (newest first)
	for i := 0; i < len(logs)-1; i++ {
		assert.True(t, logs[i].CreatedAt.After(logs[i+1].CreatedAt) || logs[i].CreatedAt.Equal(logs[i+1].CreatedAt))
	}
}

func TestAuditLogRepository_ListByEntity(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	entityID := uuid.New()

	// Create logs for specific entity
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "correction",
		EntityID:   entityID,
		Action:     model.AuditActionCreate,
	})
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "correction",
		EntityID:   entityID,
		Action:     model.AuditActionApprove,
	})

	// Create log for different entity
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "correction",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	})

	logs, err := repo.ListByEntity(ctx, "correction", entityID)
	require.NoError(t, err)
	assert.Len(t, logs, 2)

	for _, log := range logs {
		assert.Equal(t, "correction", log.EntityType)
		assert.Equal(t, entityID, log.EntityID)
	}
}

func TestAuditLogRepository_DeleteOlderThan(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	now := time.Now()

	// Create old log
	oldLog := &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	}
	repo.Create(ctx, oldLog)

	// Manually update created_at to be old
	db.Model(oldLog).Update("created_at", now.Add(-365*24*time.Hour))

	// Create recent log
	repo.Create(ctx, &model.AuditLog{
		TenantID:   tenantID,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	})

	// Delete logs older than 90 days
	cutoff := now.Add(-90 * 24 * time.Hour)
	deleted, err := repo.DeleteOlderThan(ctx, tenantID, cutoff)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)

	// Verify old log is deleted and recent log remains
	logs, _, _ := repo.List(ctx, AuditLogFilter{TenantID: &tenantID}, 10, 0)
	assert.Len(t, logs, 1)
}

func TestAuditLogRepository_DeleteOlderThan_OnlyAffectsTenant(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAuditLogRepository(db)
	ctx := context.Background()

	tenant1 := uuid.New()
	tenant2 := uuid.New()
	now := time.Now()

	// Create old logs for both tenants
	oldLog1 := &model.AuditLog{
		TenantID:   tenant1,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	}
	repo.Create(ctx, oldLog1)
	db.Model(oldLog1).Update("created_at", now.Add(-365*24*time.Hour))

	oldLog2 := &model.AuditLog{
		TenantID:   tenant2,
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionCreate,
	}
	repo.Create(ctx, oldLog2)
	db.Model(oldLog2).Update("created_at", now.Add(-365*24*time.Hour))

	// Delete old logs for tenant1 only
	cutoff := now.Add(-90 * 24 * time.Hour)
	deleted, err := repo.DeleteOlderThan(ctx, tenant1, cutoff)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)

	// Verify tenant2's old log still exists
	logs2, _, _ := repo.List(ctx, AuditLogFilter{TenantID: &tenant2}, 10, 0)
	assert.Len(t, logs2, 1)
}

func TestAuditEntry_ToAuditLog(t *testing.T) {
	tenantID := uuid.New()
	entityID := uuid.New()
	userID := uuid.New()

	entry := &model.AuditEntry{
		TenantID:   tenantID,
		EntityType: "monthly_value",
		EntityID:   entityID,
		Action:     model.AuditActionClose,
		UserID:     &userID,
		UserEmail:  "admin@example.com",
		IPAddress:  "10.0.0.1",
		UserAgent:  "Mozilla/5.0",
		Reason:     "Month end closing",
		OldValue:   map[string]interface{}{"is_closed": false},
		NewValue:   map[string]interface{}{"is_closed": true},
		Metadata:   map[string]interface{}{"year": 2024, "month": 6},
	}

	log, err := entry.ToAuditLog()
	require.NoError(t, err)
	assert.NotNil(t, log)

	assert.Equal(t, tenantID, log.TenantID)
	assert.Equal(t, "monthly_value", log.EntityType)
	assert.Equal(t, entityID, log.EntityID)
	assert.Equal(t, model.AuditActionClose, log.Action)
	assert.Equal(t, &userID, log.UserID)
	assert.Equal(t, "admin@example.com", log.UserEmail)
	assert.Equal(t, "10.0.0.1", log.IPAddress)
	assert.Equal(t, "Month end closing", log.Reason)

	// Verify JSON serialization
	var oldValues map[string]interface{}
	err = json.Unmarshal(log.OldValues, &oldValues)
	require.NoError(t, err)
	assert.Equal(t, false, oldValues["is_closed"])

	var newValues map[string]interface{}
	err = json.Unmarshal(log.NewValues, &newValues)
	require.NoError(t, err)
	assert.Equal(t, true, newValues["is_closed"])

	var metadata map[string]interface{}
	err = json.Unmarshal(log.Metadata, &metadata)
	require.NoError(t, err)
	assert.Equal(t, float64(2024), metadata["year"]) // JSON numbers are float64
	assert.Equal(t, float64(6), metadata["month"])
}

func TestAuditEntry_ToAuditLog_NilValues(t *testing.T) {
	entry := &model.AuditEntry{
		TenantID:   uuid.New(),
		EntityType: "booking",
		EntityID:   uuid.New(),
		Action:     model.AuditActionDelete,
		OldValue:   nil,
		NewValue:   nil,
		Metadata:   nil,
	}

	log, err := entry.ToAuditLog()
	require.NoError(t, err)
	assert.NotNil(t, log)
	assert.Nil(t, log.OldValues)
	assert.Nil(t, log.NewValues)
	assert.Nil(t, log.Metadata)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] GetByID returns nil if not found
- [ ] CreateFromEntry uses ToAuditLog helper
- [ ] List filters work correctly (TenantID, EntityType, EntityID, Action, UserID, From, To)
- [ ] List returns total count
- [ ] List orders by created_at DESC
- [ ] List pagination works correctly
- [ ] ListByEntity filters by entity type and ID
- [ ] DeleteOlderThan removes old entries and returns count
- [ ] DeleteOlderThan only affects specified tenant
- [ ] ToAuditLog serializes OldValue, NewValue, Metadata to JSON
- [ ] ToAuditLog handles nil values gracefully
