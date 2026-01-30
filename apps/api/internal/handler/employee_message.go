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
	employeeMessageService *service.EmployeeMessageService
}

// NewEmployeeMessageHandler creates a new EmployeeMessageHandler.
func NewEmployeeMessageHandler(employeeMessageService *service.EmployeeMessageService) *EmployeeMessageHandler {
	return &EmployeeMessageHandler{employeeMessageService: employeeMessageService}
}

// List lists employee messages for the tenant.
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

	if v := r.URL.Query().Get("limit"); v != "" {
		if limit, err := strconv.Atoi(v); err == nil && limit > 0 && limit <= 100 {
			params.Limit = limit
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if offset, err := strconv.Atoi(v); err == nil && offset >= 0 {
			params.Offset = offset
		}
	}
	if v := r.URL.Query().Get("status"); v != "" {
		status := model.EmployeeMessageRecipientStatus(v)
		params.RecipientStatus = &status
	}

	messages, total, err := h.employeeMessageService.List(r.Context(), tenantID, params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list employee messages")
		return
	}

	respondJSON(w, http.StatusOK, mapEmployeeMessageListToResponse(messages, total))
}

// Get retrieves an employee message by ID.
func (h *EmployeeMessageHandler) Get(w http.ResponseWriter, r *http.Request) {
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

	msg, err := h.employeeMessageService.GetByID(r.Context(), tenantID, id)
	if err != nil {
		if err == service.ErrEmployeeMessageNotFound {
			respondError(w, http.StatusNotFound, "Employee message not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get employee message")
		return
	}

	respondJSON(w, http.StatusOK, mapEmployeeMessageToResponse(msg))
}

// Create creates a new employee message.
func (h *EmployeeMessageHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	user, userOk := auth.UserFromContext(r.Context())
	if !userOk || user == nil {
		respondError(w, http.StatusUnauthorized, "Authentication required")
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
	for _, eid := range req.EmployeeIds {
		parsed, err := uuid.Parse(eid.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee ID: "+eid.String())
			return
		}
		employeeIDs = append(employeeIDs, parsed)
	}

	input := service.CreateEmployeeMessageInput{
		TenantID:    tenantID,
		SenderID:    user.ID,
		Subject:     *req.Subject,
		Body:        *req.Body,
		EmployeeIDs: employeeIDs,
	}

	msg, err := h.employeeMessageService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrEmployeeMessageSubjectRequired:
			respondError(w, http.StatusBadRequest, "Subject is required")
		case service.ErrEmployeeMessageBodyRequired:
			respondError(w, http.StatusBadRequest, "Body is required")
		case service.ErrEmployeeMessageRecipientsRequired:
			respondError(w, http.StatusBadRequest, "At least one employee_id is required")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create employee message")
		}
		return
	}

	respondJSON(w, http.StatusCreated, mapEmployeeMessageToResponse(msg))
}

// Send triggers delivery of a message to all pending recipients.
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

	result, err := h.employeeMessageService.Send(r.Context(), tenantID, id)
	if err != nil {
		if err == service.ErrEmployeeMessageNotFound {
			respondError(w, http.StatusNotFound, "Employee message not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to send employee message")
		return
	}

	msgID := strfmt.UUID(result.MessageID.String())
	respondJSON(w, http.StatusOK, &models.SendEmployeeMessageResponse{
		MessageID: &msgID,
		Sent:      &result.Sent,
		Failed:    &result.Failed,
	})
}

// ListForEmployee lists messages for a specific employee.
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

	if v := r.URL.Query().Get("limit"); v != "" {
		if limit, err := strconv.Atoi(v); err == nil && limit > 0 && limit <= 100 {
			params.Limit = limit
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if offset, err := strconv.Atoi(v); err == nil && offset >= 0 {
			params.Offset = offset
		}
	}

	messages, total, err := h.employeeMessageService.List(r.Context(), tenantID, params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list employee messages")
		return
	}

	respondJSON(w, http.StatusOK, mapEmployeeMessageListToResponse(messages, total))
}

// --- Response mapping helpers ---

func mapEmployeeMessageToResponse(msg *model.EmployeeMessage) *models.EmployeeMessage {
	id := strfmt.UUID(msg.ID.String())
	tenantID := strfmt.UUID(msg.TenantID.String())
	senderID := strfmt.UUID(msg.SenderID.String())
	createdAt := strfmt.DateTime(msg.CreatedAt)
	updatedAt := strfmt.DateTime(msg.UpdatedAt)

	recipients := make([]*models.EmployeeMessageRecipient, 0, len(msg.Recipients))
	for i := range msg.Recipients {
		recipients = append(recipients, mapEmployeeMessageRecipientToResponse(&msg.Recipients[i]))
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

func mapEmployeeMessageRecipientToResponse(r *model.EmployeeMessageRecipient) *models.EmployeeMessageRecipient {
	id := strfmt.UUID(r.ID.String())
	messageID := strfmt.UUID(r.MessageID.String())
	employeeID := strfmt.UUID(r.EmployeeID.String())
	status := string(r.Status)
	createdAt := strfmt.DateTime(r.CreatedAt)
	updatedAt := strfmt.DateTime(r.UpdatedAt)

	resp := &models.EmployeeMessageRecipient{
		ID:         &id,
		MessageID:  &messageID,
		EmployeeID: &employeeID,
		Status:     &status,
		CreatedAt:  &createdAt,
		UpdatedAt:  &updatedAt,
	}

	if r.SentAt != nil {
		sentAt := strfmt.DateTime(*r.SentAt)
		resp.SentAt = &sentAt
	}
	if r.ErrorMessage != nil {
		resp.ErrorMessage = r.ErrorMessage
	}

	return resp
}

func mapEmployeeMessageListToResponse(messages []model.EmployeeMessage, total int64) *models.EmployeeMessageList {
	data := make([]*models.EmployeeMessage, 0, len(messages))
	for i := range messages {
		data = append(data, mapEmployeeMessageToResponse(&messages[i]))
	}
	return &models.EmployeeMessageList{
		Data:  data,
		Total: &total,
	}
}
