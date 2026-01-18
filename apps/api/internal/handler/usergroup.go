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

type UserGroupHandler struct {
	userGroupService *service.UserGroupService
}

func NewUserGroupHandler(userGroupService *service.UserGroupService) *UserGroupHandler {
	return &UserGroupHandler{userGroupService: userGroupService}
}

func (h *UserGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	groups, err := h.userGroupService.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list user groups")
		return
	}
	respondJSON(w, http.StatusOK, groups)
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

	respondJSON(w, http.StatusOK, ug)
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
		Description: req.Description,
		Permissions: permissions,
	}

	ug, err := h.userGroupService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrUserGroupNameRequired:
			respondError(w, http.StatusBadRequest, "User group name is required")
		case service.ErrUserGroupNameExists:
			respondError(w, http.StatusBadRequest, "A user group with this name already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create user group")
		}
		return
	}

	respondJSON(w, http.StatusCreated, ug)
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
	if req.Description != "" {
		input.Description = &req.Description
	}
	if len(req.PermissionIds) > 0 {
		var permissions []string
		for _, pid := range req.PermissionIds {
			permissions = append(permissions, pid.String())
		}
		input.Permissions = &permissions
	}

	ug, err := h.userGroupService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrUserGroupNotFound:
			respondError(w, http.StatusNotFound, "User group not found")
		case service.ErrUserGroupNameRequired:
			respondError(w, http.StatusBadRequest, "User group name cannot be empty")
		case service.ErrUserGroupNameExists:
			respondError(w, http.StatusBadRequest, "A user group with this name already exists")
		case service.ErrCannotModifySystemGroup:
			respondError(w, http.StatusForbidden, "Cannot modify system group")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update user group")
		}
		return
	}

	respondJSON(w, http.StatusOK, ug)
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

	w.WriteHeader(http.StatusNoContent)
}
