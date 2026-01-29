package service

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// AuditLogService handles audit log business logic.
type AuditLogService struct {
	repo *repository.AuditLogRepository
}

// NewAuditLogService creates a new audit log service.
func NewAuditLogService(repo *repository.AuditLogRepository) *AuditLogService {
	return &AuditLogService{repo: repo}
}

// LogEntry describes a single audit event to be recorded.
type LogEntry struct {
	TenantID   uuid.UUID
	Action     model.AuditAction
	EntityType string
	EntityID   uuid.UUID
	EntityName string
	Changes    any
	Metadata   any
}

// Log writes an audit log entry, extracting user identity and request metadata
// from the context and HTTP request. Errors are intentionally swallowed so
// audit logging never blocks the main request flow.
func (s *AuditLogService) Log(ctx context.Context, r *http.Request, entry LogEntry) {
	log := &model.AuditLog{
		TenantID:    entry.TenantID,
		Action:      entry.Action,
		EntityType:  entry.EntityType,
		EntityID:    entry.EntityID,
		PerformedAt: time.Now(),
	}

	if entry.EntityName != "" {
		log.EntityName = &entry.EntityName
	}

	if ctxUser, ok := auth.UserFromContext(ctx); ok {
		log.UserID = &ctxUser.ID
	}

	if r != nil {
		ip := r.RemoteAddr
		log.IPAddress = &ip
		ua := r.UserAgent()
		if ua != "" {
			log.UserAgent = &ua
		}
	}

	if entry.Changes != nil {
		if data, err := json.Marshal(entry.Changes); err == nil {
			log.Changes = data
		}
	}
	if entry.Metadata != nil {
		if data, err := json.Marshal(entry.Metadata); err == nil {
			log.Metadata = data
		}
	}

	_ = s.repo.Create(ctx, log)
}

// List retrieves audit logs with filtering.
func (s *AuditLogService) List(ctx context.Context, filter repository.AuditLogFilter) ([]model.AuditLog, int64, error) {
	return s.repo.List(ctx, filter)
}

// GetByID retrieves a single audit log by ID.
func (s *AuditLogService) GetByID(ctx context.Context, id uuid.UUID) (*model.AuditLog, error) {
	return s.repo.GetByID(ctx, id)
}
