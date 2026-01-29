package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/service"
)

// GroupHandler handles HTTP requests for employee, workflow, and activity groups.
type GroupHandler struct {
	groupService *service.GroupService
}

func NewGroupHandler(groupService *service.GroupService) *GroupHandler {
	return &GroupHandler{groupService: groupService}
}

// --- Employee Groups ---

func (h *GroupHandler) ListEmployeeGroups(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	groups, err := h.groupService.ListEmployeeGroups(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list employee groups")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": groups})
}

func (h *GroupHandler) GetEmployeeGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	g, err := h.groupService.GetEmployeeGroup(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Employee group not found")
		return
	}
	respondJSON(w, http.StatusOK, g)
}

func (h *GroupHandler) CreateEmployeeGroup(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	var req models.CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	input := service.CreateGroupInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
		IsActive:    true,
	}
	g, err := h.groupService.CreateEmployeeGroup(r.Context(), input)
	if err != nil {
		handleGroupError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, g)
}

func (h *GroupHandler) UpdateEmployeeGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	var req models.UpdateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	input := buildUpdateGroupInput(&req)
	g, err := h.groupService.UpdateEmployeeGroup(r.Context(), id, input)
	if err != nil {
		handleGroupError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, g)
}

func (h *GroupHandler) DeleteEmployeeGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	if err := h.groupService.DeleteEmployeeGroup(r.Context(), id); err != nil {
		handleGroupError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Workflow Groups ---

func (h *GroupHandler) ListWorkflowGroups(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	groups, err := h.groupService.ListWorkflowGroups(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list workflow groups")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": groups})
}

func (h *GroupHandler) GetWorkflowGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	g, err := h.groupService.GetWorkflowGroup(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Workflow group not found")
		return
	}
	respondJSON(w, http.StatusOK, g)
}

func (h *GroupHandler) CreateWorkflowGroup(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	var req models.CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	input := service.CreateGroupInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
		IsActive:    true,
	}
	g, err := h.groupService.CreateWorkflowGroup(r.Context(), input)
	if err != nil {
		handleGroupError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, g)
}

func (h *GroupHandler) UpdateWorkflowGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	var req models.UpdateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	input := buildUpdateGroupInput(&req)
	g, err := h.groupService.UpdateWorkflowGroup(r.Context(), id, input)
	if err != nil {
		handleGroupError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, g)
}

func (h *GroupHandler) DeleteWorkflowGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	if err := h.groupService.DeleteWorkflowGroup(r.Context(), id); err != nil {
		handleGroupError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Activity Groups ---

func (h *GroupHandler) ListActivityGroups(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	groups, err := h.groupService.ListActivityGroups(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list activity groups")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": groups})
}

func (h *GroupHandler) GetActivityGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	g, err := h.groupService.GetActivityGroup(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Activity group not found")
		return
	}
	respondJSON(w, http.StatusOK, g)
}

func (h *GroupHandler) CreateActivityGroup(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	var req models.CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	input := service.CreateGroupInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
		IsActive:    true,
	}
	g, err := h.groupService.CreateActivityGroup(r.Context(), input)
	if err != nil {
		handleGroupError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, g)
}

func (h *GroupHandler) UpdateActivityGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	var req models.UpdateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	input := buildUpdateGroupInput(&req)
	g, err := h.groupService.UpdateActivityGroup(r.Context(), id, input)
	if err != nil {
		handleGroupError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, g)
}

func (h *GroupHandler) DeleteActivityGroup(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}
	if err := h.groupService.DeleteActivityGroup(r.Context(), id); err != nil {
		handleGroupError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Helpers ---

func buildUpdateGroupInput(req *models.UpdateGroupRequest) service.UpdateGroupInput {
	input := service.UpdateGroupInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive
	return input
}

func handleGroupError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrGroupNotFound:
		respondError(w, http.StatusNotFound, "Group not found")
	case service.ErrGroupCodeRequired:
		respondError(w, http.StatusBadRequest, "Group code is required")
	case service.ErrGroupNameRequired:
		respondError(w, http.StatusBadRequest, "Group name is required")
	case service.ErrGroupCodeExists:
		respondError(w, http.StatusBadRequest, "A group with this code already exists for this tenant")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
