package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

// AuditLogHandler handles audit log HTTP endpoints.
type AuditLogHandler struct {
	auditService *service.AuditLogService
}

// NewAuditLogHandler creates a new audit log handler.
func NewAuditLogHandler(auditService *service.AuditLogService) *AuditLogHandler {
	return &AuditLogHandler{auditService: auditService}
}

// List handles GET /audit-logs
func (h *AuditLogHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filter := repository.AuditLogFilter{
		TenantID: tenantID,
		Limit:    50,
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			filter.Limit = l
		}
	}

	if userIDStr := r.URL.Query().Get("user_id"); userIDStr != "" {
		if uid, err := uuid.Parse(userIDStr); err == nil {
			filter.UserID = &uid
		}
	}

	if entityType := r.URL.Query().Get("entity_type"); entityType != "" {
		filter.EntityType = &entityType
	}

	if entityIDStr := r.URL.Query().Get("entity_id"); entityIDStr != "" {
		if eid, err := uuid.Parse(entityIDStr); err == nil {
			filter.EntityID = &eid
		}
	}

	if action := r.URL.Query().Get("action"); action != "" {
		filter.Action = &action
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		if t, err := time.Parse(time.RFC3339, fromStr); err == nil {
			filter.From = &t
		}
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		if t, err := time.Parse(time.RFC3339, toStr); err == nil {
			filter.To = &t
		}
	}

	if cursorStr := r.URL.Query().Get("cursor"); cursorStr != "" {
		if cid, err := uuid.Parse(cursorStr); err == nil {
			filter.Cursor = &cid
		}
	}

	logs, total, err := h.auditService.List(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list audit logs")
		return
	}

	data := make([]*models.AuditLog, 0, len(logs))
	for i := range logs {
		data = append(data, mapAuditLogToResponse(&logs[i]))
	}

	respondJSON(w, http.StatusOK, &models.AuditLogList{
		Data: data,
		Meta: &models.PaginationMeta{
			Total: total,
			Limit: int64(filter.Limit),
		},
	})
}

// GetByID handles GET /audit-logs/{id}
func (h *AuditLogHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid audit log ID")
		return
	}

	log, err := h.auditService.GetByID(r.Context(), id)
	if errors.Is(err, repository.ErrAuditLogNotFound) {
		respondError(w, http.StatusNotFound, "Audit log not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get audit log")
		return
	}

	respondJSON(w, http.StatusOK, mapAuditLogToResponse(log))
}

func mapAuditLogToResponse(l *model.AuditLog) *models.AuditLog {
	id := strfmt.UUID(l.ID.String())
	tenantID := strfmt.UUID(l.TenantID.String())
	entityID := strfmt.UUID(l.EntityID.String())
	action := string(l.Action)
	entityType := l.EntityType
	performedAt := strfmt.DateTime(l.PerformedAt)

	resp := &models.AuditLog{
		ID:          &id,
		TenantID:    &tenantID,
		EntityID:    &entityID,
		Action:      &action,
		EntityType:  &entityType,
		PerformedAt: &performedAt,
	}

	if l.UserID != nil {
		uid := strfmt.UUID(l.UserID.String())
		resp.UserID = &uid
	}
	if l.EntityName != nil {
		resp.EntityName = l.EntityName
	}
	if l.IPAddress != nil {
		resp.IPAddress = l.IPAddress
	}
	if l.UserAgent != nil {
		resp.UserAgent = l.UserAgent
	}
	if len(l.Changes) > 0 {
		var changes any
		if err := json.Unmarshal(l.Changes, &changes); err == nil {
			resp.Changes = changes
		}
	}
	if len(l.Metadata) > 0 {
		var metadata any
		if err := json.Unmarshal(l.Metadata, &metadata); err == nil {
			resp.Metadata = metadata
		}
	}

	if l.User != nil {
		uid := strfmt.UUID(l.User.ID.String())
		dn := l.User.DisplayName
		resp.User.ID = &uid
		resp.User.DisplayName = &dn
		if l.User.AvatarURL != nil {
			resp.User.AvatarURL = strfmt.URI(*l.User.AvatarURL)
		}
	}

	return resp
}
