package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

// NotificationHandler handles notification-related HTTP requests.
type NotificationHandler struct {
	notificationService *service.NotificationService
	streamHub           *service.NotificationStreamHub
}

// NewNotificationHandler creates a new NotificationHandler instance.
func NewNotificationHandler(notificationService *service.NotificationService, streamHub *service.NotificationStreamHub) *NotificationHandler {
	return &NotificationHandler{
		notificationService: notificationService,
		streamHub:           streamHub,
	}
}

// List handles GET /notifications
func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
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

	params := service.NotificationListParams{
		Limit:  20,
		Offset: 0,
	}

	if typeStr := r.URL.Query().Get("type"); typeStr != "" {
		notificationType := model.NotificationType(typeStr)
		switch notificationType {
		case model.NotificationTypeApprovals,
			model.NotificationTypeErrors,
			model.NotificationTypeReminders,
			model.NotificationTypeSystem:
			params.Type = &notificationType
		default:
			respondError(w, http.StatusBadRequest, "Invalid notification type")
			return
		}
	}

	if unreadStr := r.URL.Query().Get("unread"); unreadStr != "" {
		unread, err := strconv.ParseBool(unreadStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid unread value")
			return
		}
		params.Unread = &unread
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		from, err := time.Parse(time.RFC3339, fromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date format, expected RFC3339")
			return
		}
		params.From = &from
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		to, err := time.Parse(time.RFC3339, toStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date format, expected RFC3339")
			return
		}
		params.To = &to
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

	notifications, total, unreadCount, err := h.notificationService.ListForUser(r.Context(), tenantID, user.ID, params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list notifications")
		return
	}

	response := models.NotificationList{
		Data: make([]*models.Notification, 0, len(notifications)),
	}
	for i := range notifications {
		response.Data = append(response.Data, h.notificationToResponse(&notifications[i]))
	}
	response.Total = &total
	response.UnreadCount = &unreadCount

	respondJSON(w, http.StatusOK, response)
}

// MarkRead handles POST /notifications/{id}/read
func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
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

	idStr := chi.URLParam(r, "id")
	notificationID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid notification ID")
		return
	}

	notification, err := h.notificationService.MarkRead(r.Context(), tenantID, user.ID, notificationID)
	if err != nil {
		switch err {
		case repository.ErrNotificationNotFound:
			respondError(w, http.StatusNotFound, "Notification not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to mark notification as read")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.notificationToResponse(notification))
}

// MarkAllRead handles POST /notifications/read-all
func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
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

	count, err := h.notificationService.MarkAllRead(r.Context(), tenantID, user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to mark notifications as read")
		return
	}

	response := models.MarkNotificationsReadResponse{
		Count: &count,
	}
	respondJSON(w, http.StatusOK, response)
}

// GetPreferences handles GET /notification-preferences
func (h *NotificationHandler) GetPreferences(w http.ResponseWriter, r *http.Request) {
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

	prefs, err := h.notificationService.GetPreferences(r.Context(), tenantID, user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load notification preferences")
		return
	}

	respondJSON(w, http.StatusOK, h.preferencesToResponse(prefs))
}

// UpdatePreferences handles PUT /notification-preferences
func (h *NotificationHandler) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
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

	var req models.UpdateNotificationPreferencesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.ApprovalsEnabled == nil || req.ErrorsEnabled == nil || req.RemindersEnabled == nil || req.SystemEnabled == nil {
		respondError(w, http.StatusBadRequest, "All preference fields are required")
		return
	}

	prefs, err := h.notificationService.UpdatePreferences(r.Context(), tenantID, user.ID, model.NotificationPreferences{
		ApprovalsEnabled: *req.ApprovalsEnabled,
		ErrorsEnabled:    *req.ErrorsEnabled,
		RemindersEnabled: *req.RemindersEnabled,
		SystemEnabled:    *req.SystemEnabled,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update notification preferences")
		return
	}

	respondJSON(w, http.StatusOK, h.preferencesToResponse(prefs))
}

// Stream handles GET /notifications/stream
func (h *NotificationHandler) Stream(w http.ResponseWriter, r *http.Request) {
	_, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "User required")
		return
	}

	if h.streamHub == nil {
		respondError(w, http.StatusInternalServerError, "Notification stream unavailable")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		respondError(w, http.StatusInternalServerError, "Streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	client := h.streamHub.Subscribe(user.ID)
	defer h.streamHub.Unsubscribe(user.ID, client)

	heartbeat := time.NewTicker(10 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-client.Events:
			if !ok {
				return
			}
			_, _ = fmt.Fprintf(w, "event: %s\n", event.Event)
			_, _ = fmt.Fprintf(w, "data: %s\n\n", event.Data)
			flusher.Flush()
		case <-heartbeat.C:
			_, _ = fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func (h *NotificationHandler) notificationToResponse(notification *model.Notification) *models.Notification {
	id := strfmt.UUID(notification.ID.String())
	tenantID := strfmt.UUID(notification.TenantID.String())
	userID := strfmt.UUID(notification.UserID.String())
	createdAt := strfmt.DateTime(notification.CreatedAt)
	updatedAt := strfmt.DateTime(notification.UpdatedAt)
	notificationType := string(notification.Type)
	title := notification.Title
	message := notification.Message

	var readAt *strfmt.DateTime
	if notification.ReadAt != nil {
		value := strfmt.DateTime(*notification.ReadAt)
		readAt = &value
	}

	return &models.Notification{
		ID:        &id,
		TenantID:  &tenantID,
		UserID:    &userID,
		Type:      &notificationType,
		Title:     &title,
		Message:   &message,
		Link:      notification.Link,
		ReadAt:    readAt,
		CreatedAt: &createdAt,
		UpdatedAt: &updatedAt,
	}
}

func (h *NotificationHandler) preferencesToResponse(prefs *model.NotificationPreferences) *models.NotificationPreferences {
	id := strfmt.UUID(prefs.ID.String())
	tenantID := strfmt.UUID(prefs.TenantID.String())
	userID := strfmt.UUID(prefs.UserID.String())
	createdAt := strfmt.DateTime(prefs.CreatedAt)
	updatedAt := strfmt.DateTime(prefs.UpdatedAt)
	approvalsEnabled := prefs.ApprovalsEnabled
	errorsEnabled := prefs.ErrorsEnabled
	remindersEnabled := prefs.RemindersEnabled
	systemEnabled := prefs.SystemEnabled

	return &models.NotificationPreferences{
		ID:               &id,
		TenantID:         &tenantID,
		UserID:           &userID,
		ApprovalsEnabled: &approvalsEnabled,
		ErrorsEnabled:    &errorsEnabled,
		RemindersEnabled: &remindersEnabled,
		SystemEnabled:    &systemEnabled,
		CreatedAt:        &createdAt,
		UpdatedAt:        &updatedAt,
	}
}
