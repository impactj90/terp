package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/permissions"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

type UserHandler struct {
	userService *service.UserService
}

func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

// List handles GET /users
func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	params := repository.ListUsersParams{
		Query: r.URL.Query().Get("search"),
		Limit: 20,
	}

	if limit := r.URL.Query().Get("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil && l > 0 && l <= 100 {
			params.Limit = l
		}
	}

	users, total, err := h.userService.List(ctx, params)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list users")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"data": mapUsersToResponse(users),
		"meta": map[string]any{
			"total": total,
			"limit": params.Limit,
		},
	})
}

// GetByID handles GET /users/{id}
func (h *UserHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	user, err := h.userService.GetByID(ctx, id)
	if errors.Is(err, service.ErrUserNotFound) {
		respondError(w, http.StatusNotFound, "User not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get user")
		return
	}

	respondJSON(w, http.StatusOK, mapUserToResponse(user))
}

// Update handles PATCH /users/{id}
func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	currentUser, _ := auth.UserFromContext(ctx)

	targetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req struct {
		DisplayName string  `json:"display_name"`
		AvatarURL   *string `json:"avatar_url"`
		UserGroupID *string `json:"user_group_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	updates := make(map[string]any)
	if req.DisplayName != "" {
		updates["display_name"] = req.DisplayName
	}
	if req.AvatarURL != nil {
		updates["avatar_url"] = *req.AvatarURL
	}
	if req.UserGroupID != nil {
		if *req.UserGroupID == "" {
			updates["user_group_id"] = nil
		} else {
			groupID, err := uuid.Parse(*req.UserGroupID)
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid user group ID")
				return
			}
			updates["user_group_id"] = groupID
		}
	}

	canManage := hasUsersManagePermission(ctx)
	user, err := h.userService.Update(ctx, currentUser.ID, targetID, currentUser.Role, canManage, updates)
	if errors.Is(err, service.ErrPermissionDenied) {
		respondError(w, http.StatusForbidden, "Permission denied")
		return
	}
	if errors.Is(err, service.ErrUserGroupNotFound) {
		respondError(w, http.StatusBadRequest, "User group not found")
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		respondError(w, http.StatusNotFound, "User not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update user")
		return
	}

	respondJSON(w, http.StatusOK, mapUserToResponse(user))
}

// Delete handles DELETE /users/{id} (admin only)
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	currentUser, _ := auth.UserFromContext(ctx)

	targetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	canManage := hasUsersManagePermission(ctx)
	err = h.userService.Delete(ctx, currentUser.ID, targetID, currentUser.Role, canManage)
	if errors.Is(err, service.ErrPermissionDenied) {
		respondError(w, http.StatusForbidden, "Only admins can delete users")
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		respondError(w, http.StatusNotFound, "User not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete user")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func hasUsersManagePermission(ctx context.Context) bool {
	checker, ok := middleware.PermissionCheckerFromContext(ctx)
	if !ok {
		return false
	}
	return checker.Has(permissions.ID("users.manage").String())
}
