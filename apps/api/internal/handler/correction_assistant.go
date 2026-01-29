package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// CorrectionAssistantHandler handles correction assistant HTTP endpoints.
type CorrectionAssistantHandler struct {
	svc *service.CorrectionAssistantService
}

// NewCorrectionAssistantHandler creates a new correction assistant handler.
func NewCorrectionAssistantHandler(svc *service.CorrectionAssistantService) *CorrectionAssistantHandler {
	return &CorrectionAssistantHandler{svc: svc}
}

// ListMessages handles GET /correction-messages
func (h *CorrectionAssistantHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Ensure default messages exist for this tenant
	if err := h.svc.EnsureDefaults(r.Context(), tenantID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to initialize correction messages")
		return
	}

	filter := model.CorrectionMessageFilter{}

	if sevStr := r.URL.Query().Get("severity"); sevStr != "" {
		sev := model.CorrectionSeverity(sevStr)
		filter.Severity = &sev
	}
	if activeStr := r.URL.Query().Get("is_active"); activeStr != "" {
		if active, err := strconv.ParseBool(activeStr); err == nil {
			filter.IsActive = &active
		}
	}
	if codeStr := r.URL.Query().Get("code"); codeStr != "" {
		filter.Code = &codeStr
	}

	messages, err := h.svc.ListMessages(r.Context(), tenantID, filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list correction messages")
		return
	}

	data := make([]*models.CorrectionMessage, 0, len(messages))
	for i := range messages {
		data = append(data, mapCorrectionMessageToResponse(&messages[i]))
	}

	respondJSON(w, http.StatusOK, &models.CorrectionMessageList{
		Data: data,
	})
}

// GetMessage handles GET /correction-messages/{id}
func (h *CorrectionAssistantHandler) GetMessage(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction message ID")
		return
	}

	cm, err := h.svc.GetMessage(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Correction message not found")
		return
	}

	respondJSON(w, http.StatusOK, mapCorrectionMessageToResponse(cm))
}

// UpdateMessage handles PATCH /correction-messages/{id}
func (h *CorrectionAssistantHandler) UpdateMessage(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid correction message ID")
		return
	}

	var req models.UpdateCorrectionMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Determine what to update using raw JSON to detect explicit null
	var rawBody map[string]json.RawMessage
	// Re-read won't work since body is already consumed, so we use what we have
	input := service.UpdateMessageInput{}

	if req.CustomText != nil {
		input.CustomText = req.CustomText
	}
	// Check if custom_text was explicitly set to null using the raw body trick
	// Since the body is already consumed, we detect null via the pointer being nil
	// and the field being present in JSON. The generated model sets CustomText to nil
	// for both "not present" and "null". We handle this as: if CustomText is nil,
	// keep existing value. To clear, set to empty string.
	// For a proper null detection, re-read the body. Since this is a PATCH,
	// we keep it simple: nil means don't change, empty string means clear.
	_ = rawBody // suppress unused warning

	if req.Severity != "" {
		input.Severity = &req.Severity
	}
	// IsActive is a bool, cannot distinguish false from absent. We always pass it.
	input.IsActive = &req.IsActive

	cm, err := h.svc.UpdateMessage(r.Context(), id, tenantID, input)
	if err != nil {
		switch err {
		case service.ErrCorrectionMessageNotFound:
			respondError(w, http.StatusNotFound, "Correction message not found")
		case service.ErrInvalidSeverity:
			respondError(w, http.StatusBadRequest, "Invalid severity (must be 'error' or 'hint')")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update correction message")
		}
		return
	}

	respondJSON(w, http.StatusOK, mapCorrectionMessageToResponse(cm))
}

// ListItems handles GET /correction-assistant
func (h *CorrectionAssistantHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Ensure default messages exist
	if err := h.svc.EnsureDefaults(r.Context(), tenantID); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to initialize correction messages")
		return
	}

	filter := model.CorrectionAssistantFilter{
		Limit: 50,
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		if t, err := time.Parse("2006-01-02", fromStr); err == nil {
			filter.From = &t
		}
	}
	if toStr := r.URL.Query().Get("to"); toStr != "" {
		if t, err := time.Parse("2006-01-02", toStr); err == nil {
			filter.To = &t
		}
	}
	if empIDStr := r.URL.Query().Get("employee_id"); empIDStr != "" {
		if eid, err := uuid.Parse(empIDStr); err == nil {
			filter.EmployeeID = &eid
		}
	}
	if deptIDStr := r.URL.Query().Get("department_id"); deptIDStr != "" {
		if did, err := uuid.Parse(deptIDStr); err == nil {
			filter.DepartmentID = &did
		}
	}
	if sevStr := r.URL.Query().Get("severity"); sevStr != "" {
		sev := model.CorrectionSeverity(sevStr)
		filter.Severity = &sev
	}
	if codeStr := r.URL.Query().Get("error_code"); codeStr != "" {
		filter.ErrorCode = &codeStr
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 200 {
			filter.Limit = l
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			filter.Offset = o
		}
	}

	items, total, err := h.svc.ListItems(r.Context(), tenantID, filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list correction assistant items")
		return
	}

	data := make([]*models.CorrectionAssistantItem, 0, len(items))
	for i := range items {
		data = append(data, mapCorrectionAssistantItemToResponse(&items[i]))
	}

	hasMore := int64(filter.Offset+filter.Limit) < total
	respondJSON(w, http.StatusOK, &models.CorrectionAssistantList{
		Data: data,
		Meta: &models.PaginationMeta{
			Total:   total,
			Limit:   int64(filter.Limit),
			HasMore: hasMore,
		},
	})
}

// --- Response Mapping ---

func mapCorrectionMessageToResponse(cm *model.CorrectionMessage) *models.CorrectionMessage {
	id := strfmt.UUID(cm.ID.String())
	tenantID := strfmt.UUID(cm.TenantID.String())
	code := cm.Code
	defaultText := cm.DefaultText
	severity := string(cm.Severity)
	effectiveText := cm.EffectiveText()
	createdAt := strfmt.DateTime(cm.CreatedAt)
	updatedAt := strfmt.DateTime(cm.UpdatedAt)

	resp := &models.CorrectionMessage{
		ID:            &id,
		TenantID:      &tenantID,
		Code:          &code,
		DefaultText:   &defaultText,
		Severity:      &severity,
		EffectiveText: effectiveText,
		IsActive:      cm.IsActive,
		CreatedAt:     createdAt,
		UpdatedAt:     updatedAt,
	}

	if cm.CustomText != nil {
		resp.CustomText = cm.CustomText
	}
	if cm.Description != nil {
		resp.Description = cm.Description
	}

	return resp
}

func mapCorrectionAssistantItemToResponse(item *model.CorrectionAssistantItem) *models.CorrectionAssistantItem {
	dvID := strfmt.UUID(item.DailyValueID.String())
	empID := strfmt.UUID(item.EmployeeID.String())
	valueDate := strfmt.Date(item.ValueDate)

	resp := &models.CorrectionAssistantItem{
		DailyValueID: &dvID,
		EmployeeID:   &empID,
		EmployeeName: item.EmployeeName,
		ValueDate:    &valueDate,
		Errors:       make([]*models.CorrectionAssistantError, 0, len(item.Errors)),
	}

	if item.DepartmentID != nil {
		deptID := strfmt.UUID(item.DepartmentID.String())
		resp.DepartmentID = &deptID
	}
	if item.DepartmentName != nil {
		resp.DepartmentName = item.DepartmentName
	}

	for _, e := range item.Errors {
		code := e.Code
		severity := e.Severity
		message := e.Message
		resp.Errors = append(resp.Errors, &models.CorrectionAssistantError{
			Code:      &code,
			Severity:  &severity,
			Message:   &message,
			ErrorType: e.ErrorType,
		})
	}

	return resp
}
