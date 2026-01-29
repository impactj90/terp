package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type UserGroupHandler struct {
	userGroupService *service.UserGroupService
	auditService     *service.AuditLogService
}

func NewUserGroupHandler(userGroupService *service.UserGroupService) *UserGroupHandler {
	return &UserGroupHandler{userGroupService: userGroupService}
}

func (h *UserGroupHandler) SetAuditService(s *service.AuditLogService) { h.auditService = s }

func (h *UserGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var activeFilter *bool
	if activeParam := r.URL.Query().Get("active"); activeParam != "" {
		activeValue, err := strconv.ParseBool(activeParam)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid active filter")
			return
		}
		activeFilter = &activeValue
	}

	groups, err := h.userGroupService.List(r.Context(), tenantID, activeFilter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list user groups")
		return
	}

	result := make([]*models.UserGroup, 0, len(groups))
	for i := range groups {
		result = append(result, mapUserGroupToResponse(&groups[i]))
	}

	respondJSON(w, http.StatusOK, &models.UserGroupList{Data: result})
}

func (h *UserGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user group ID")
		return
	}

	ug, err := h.userGroupService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "User group not found")
		return
	}

	respondJSON(w, http.StatusOK, mapUserGroupToResponse(ug))
}

func (h *UserGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateUserGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert permission UUIDs to strings
	var permissions []string
	for _, pid := range req.PermissionIds {
		permissions = append(permissions, pid.String())
	}

	input := service.CreateUserGroupInput{
		TenantID:    tenantID,
		Name:        *req.Name,
		Code:        *req.Code,
		Description: req.Description,
		Permissions: permissions,
		IsAdmin:     req.IsAdmin,
		IsActive:    true,
	}

	ug, err := h.userGroupService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrInvalidPermissionID:
			respondError(w, http.StatusBadRequest, "Invalid permission ID")
		case service.ErrUserGroupNameRequired:
			respondError(w, http.StatusBadRequest, "User group name is required")
		case service.ErrUserGroupNameExists:
			respondError(w, http.StatusBadRequest, "A user group with this name already exists")
		case service.ErrUserGroupCodeRequired:
			respondError(w, http.StatusBadRequest, "User group code is required")
		case service.ErrUserGroupCodeExists:
			respondError(w, http.StatusConflict, "User group code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create user group")
		}
		return
	}

	if h.auditService != nil {
		h.auditService.Log(r.Context(), r, service.LogEntry{
			TenantID:   tenantID,
			Action:     model.AuditActionCreate,
			EntityType: "user_group",
			EntityID:   ug.ID,
			EntityName: ug.Name,
		})
	}

	respondJSON(w, http.StatusCreated, mapUserGroupToResponse(ug))
}

func (h *UserGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user group ID")
		return
	}

	var req models.UpdateUserGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateUserGroupInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.PermissionIds != nil {
		var permissions []string
		for _, pid := range req.PermissionIds {
			permissions = append(permissions, pid.String())
		}
		input.Permissions = &permissions
	}
	// Note: IsAdmin/IsActive cannot be reliably detected as "provided" vs "default false"
	// with the current OpenAPI spec design.
	input.IsAdmin = &req.IsAdmin
	input.IsActive = &req.IsActive

	ug, err := h.userGroupService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrInvalidPermissionID:
			respondError(w, http.StatusBadRequest, "Invalid permission ID")
		case service.ErrUserGroupNotFound:
			respondError(w, http.StatusNotFound, "User group not found")
		case service.ErrUserGroupNameRequired:
			respondError(w, http.StatusBadRequest, "User group name cannot be empty")
		case service.ErrUserGroupNameExists:
			respondError(w, http.StatusBadRequest, "A user group with this name already exists")
		case service.ErrUserGroupCodeRequired:
			respondError(w, http.StatusBadRequest, "User group code cannot be empty")
		case service.ErrUserGroupCodeExists:
			respondError(w, http.StatusConflict, "User group code already exists")
		case service.ErrCannotModifySystemGroup:
			respondError(w, http.StatusForbidden, "Cannot modify system group")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update user group")
		}
		return
	}

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionUpdate,
				EntityType: "user_group",
				EntityID:   ug.ID,
				EntityName: ug.Name,
			})
		}
	}

	respondJSON(w, http.StatusOK, mapUserGroupToResponse(ug))
}

func (h *UserGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user group ID")
		return
	}

	if err := h.userGroupService.Delete(r.Context(), id); err != nil {
		switch err {
		case service.ErrUserGroupNotFound:
			respondError(w, http.StatusNotFound, "User group not found")
		case service.ErrCannotDeleteSystemGroup:
			respondError(w, http.StatusForbidden, "Cannot delete system group")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete user group")
		}
		return
	}

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionDelete,
				EntityType: "user_group",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
