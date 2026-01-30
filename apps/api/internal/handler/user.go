package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/permissions"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

type UserHandler struct {
	userService  *service.UserService
	auditService *service.AuditLogService
}

func NewUserHandler(userService *service.UserService) *UserHandler {
	return &UserHandler{userService: userService}
}

func (h *UserHandler) SetAuditService(s *service.AuditLogService) { h.auditService = s }

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

// Create handles POST /users
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req models.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateUserInput{}

	if req.TenantID != nil && *req.TenantID != "" {
		tenantID, err := uuid.Parse(req.TenantID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid tenant ID")
			return
		}
		input.TenantID = &tenantID
	}
	if req.Email != nil {
		input.Email = string(*req.Email)
	}
	if req.DisplayName != nil {
		input.DisplayName = *req.DisplayName
	}
	if req.Username != nil && *req.Username != "" {
		username := string(*req.Username)
		input.Username = &username
	}
	if req.Password != "" {
		password := string(req.Password)
		input.Password = &password
	}
	if req.SsoID != nil && *req.SsoID != "" {
		input.SSOID = req.SsoID
	}
	if req.UserGroupID != nil && *req.UserGroupID != "" {
		groupID, err := uuid.Parse(req.UserGroupID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid user group ID")
			return
		}
		input.UserGroupID = &groupID
	}
	if req.EmployeeID != nil && *req.EmployeeID != "" {
		employeeID, err := uuid.Parse(req.EmployeeID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee ID")
			return
		}
		input.EmployeeID = &employeeID
	}
	input.IsActive = &req.IsActive
	input.IsLocked = &req.IsLocked
	if req.DataScopeType != "" {
		scopeType := model.DataScopeType(req.DataScopeType)
		input.DataScopeType = &scopeType
	}

	if len(req.DataScopeTenantIds) > 0 {
		parsed, err := parseStrfmtUUIDs(req.DataScopeTenantIds)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid data_scope_tenant_ids")
			return
		}
		input.DataScopeTenantIDs = parsed
	}
	if len(req.DataScopeDepartmentIds) > 0 {
		parsed, err := parseStrfmtUUIDs(req.DataScopeDepartmentIds)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid data_scope_department_ids")
			return
		}
		input.DataScopeDepartmentIDs = parsed
	}
	if len(req.DataScopeEmployeeIds) > 0 {
		parsed, err := parseStrfmtUUIDs(req.DataScopeEmployeeIds)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid data_scope_employee_ids")
			return
		}
		input.DataScopeEmployeeIDs = parsed
	}

	user, err := h.userService.CreateUser(ctx, input)
	if errors.Is(err, service.ErrUserGroupNotFound) {
		respondError(w, http.StatusBadRequest, "User group not found")
		return
	}
	if errors.Is(err, service.ErrInvalidDataScopeType) {
		respondError(w, http.StatusBadRequest, "Invalid data scope type")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create user")
		return
	}

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(ctx); ok {
			h.auditService.Log(ctx, r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionCreate,
				EntityType: "user",
				EntityID:   user.ID,
				EntityName: user.DisplayName,
			})
		}
	}

	respondJSON(w, http.StatusCreated, mapUserToResponse(user))
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
		DisplayName            *string   `json:"display_name"`
		AvatarURL              *string   `json:"avatar_url"`
		UserGroupID            *string   `json:"user_group_id"`
		Username               *string   `json:"username"`
		EmployeeID             *string   `json:"employee_id"`
		SSOID                  *string   `json:"sso_id"`
		IsActive               *bool     `json:"is_active"`
		IsLocked               *bool     `json:"is_locked"`
		DataScopeType          *string   `json:"data_scope_type"`
		DataScopeTenantIDs     *[]string `json:"data_scope_tenant_ids"`
		DataScopeDepartmentIDs *[]string `json:"data_scope_department_ids"`
		DataScopeEmployeeIDs   *[]string `json:"data_scope_employee_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	updates := make(map[string]any)
	if req.DisplayName != nil {
		if *req.DisplayName == "" {
			respondError(w, http.StatusBadRequest, "Display name cannot be empty")
			return
		}
		updates["display_name"] = *req.DisplayName
	}
	if req.AvatarURL != nil {
		if *req.AvatarURL == "" {
			updates["avatar_url"] = nil
		} else {
			updates["avatar_url"] = *req.AvatarURL
		}
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
	if req.Username != nil {
		updates["username"] = *req.Username
	}
	if req.EmployeeID != nil {
		if *req.EmployeeID == "" {
			updates["employee_id"] = nil
		} else {
			employeeID, err := uuid.Parse(*req.EmployeeID)
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid employee ID")
				return
			}
			updates["employee_id"] = employeeID
		}
	}
	if req.SSOID != nil {
		if *req.SSOID == "" {
			updates["sso_id"] = nil
		} else {
			updates["sso_id"] = *req.SSOID
		}
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if req.IsLocked != nil {
		updates["is_locked"] = *req.IsLocked
	}
	if req.DataScopeType != nil {
		updates["data_scope_type"] = *req.DataScopeType
	}
	if req.DataScopeTenantIDs != nil {
		parsed, err := parseUUIDList(*req.DataScopeTenantIDs)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid data_scope_tenant_ids")
			return
		}
		updates["data_scope_tenant_ids"] = parsed
	}
	if req.DataScopeDepartmentIDs != nil {
		parsed, err := parseUUIDList(*req.DataScopeDepartmentIDs)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid data_scope_department_ids")
			return
		}
		updates["data_scope_department_ids"] = parsed
	}
	if req.DataScopeEmployeeIDs != nil {
		parsed, err := parseUUIDList(*req.DataScopeEmployeeIDs)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid data_scope_employee_ids")
			return
		}
		updates["data_scope_employee_ids"] = parsed
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
	if errors.Is(err, service.ErrInvalidDataScopeType) {
		respondError(w, http.StatusBadRequest, "Invalid data scope type")
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

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(ctx); ok {
			h.auditService.Log(ctx, r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionUpdate,
				EntityType: "user",
				EntityID:   user.ID,
				EntityName: user.DisplayName,
				Changes:    updates,
			})
		}
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

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(ctx); ok {
			h.auditService.Log(ctx, r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionDelete,
				EntityType: "user",
				EntityID:   targetID,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// ChangePassword handles POST /users/{id}/password
func (h *UserHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	currentUser, ok := auth.UserFromContext(ctx)
	if !ok {
		respondError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	targetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	canManage := hasUsersManagePermission(ctx)
	err = h.userService.ChangePassword(ctx, service.ChangePasswordInput{
		RequesterID:        currentUser.ID,
		TargetID:           targetID,
		RequesterRole:      currentUser.Role,
		RequesterCanManage: canManage,
		CurrentPassword:    req.CurrentPassword,
		NewPassword:        req.NewPassword,
	})
	if errors.Is(err, service.ErrPermissionDenied) {
		respondError(w, http.StatusForbidden, "Permission denied")
		return
	}
	if errors.Is(err, service.ErrUserNotFound) {
		respondError(w, http.StatusNotFound, "User not found")
		return
	}
	if errors.Is(err, service.ErrPasswordNotSet) {
		respondError(w, http.StatusBadRequest, "Password not set")
		return
	}
	if errors.Is(err, service.ErrInvalidCurrentPassword) {
		respondError(w, http.StatusBadRequest, "Invalid current password")
		return
	}
	if errors.Is(err, service.ErrPasswordRequired) {
		respondError(w, http.StatusBadRequest, "New password is required")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to change password")
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

func parseUUIDList(values []string) ([]string, error) {
	if values == nil {
		return nil, nil
	}
	parsed := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			return nil, errors.New("empty uuid")
		}
		if _, err := uuid.Parse(value); err != nil {
			return nil, err
		}
		parsed = append(parsed, value)
	}
	return parsed, nil
}

func parseStrfmtUUIDs(values []strfmt.UUID) ([]string, error) {
	parsed := make([]string, 0, len(values))
	for _, v := range values {
		s := v.String()
		if s == "" {
			return nil, errors.New("empty uuid")
		}
		if _, err := uuid.Parse(s); err != nil {
			return nil, err
		}
		parsed = append(parsed, s)
	}
	return parsed, nil
}
