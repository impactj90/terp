package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-openapi/strfmt"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/permissions"
)

func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]any{
		"error":   http.StatusText(status),
		"message": message,
		"status":  status,
	})
}

func mapUserToResponse(u *model.User) *models.User {
	id := strfmt.UUID(u.ID.String())
	email := strfmt.Email(u.Email)
	createdAt := strfmt.DateTime(u.CreatedAt)
	updatedAt := strfmt.DateTime(u.UpdatedAt)
	role := string(u.Role)

	resp := &models.User{
		ID:          &id,
		Email:       &email,
		DisplayName: &u.DisplayName,
		Role:        &role,
		CreatedAt:   &createdAt,
		UpdatedAt:   updatedAt,
	}

	if u.TenantID != nil {
		tenantID := strfmt.UUID(u.TenantID.String())
		resp.TenantID = &tenantID
	}
	if u.Username != nil {
		resp.Username = u.Username
	}

	// Handle optional avatar URL
	if u.AvatarURL != nil {
		avatarURL := strfmt.URI(*u.AvatarURL)
		resp.AvatarURL = &avatarURL
	}
	if u.EmployeeID != nil {
		employeeID := strfmt.UUID(u.EmployeeID.String())
		resp.EmployeeID = &employeeID
	}
	if u.UserGroupID != nil {
		groupID := strfmt.UUID(u.UserGroupID.String())
		resp.UserGroupID = &groupID
	}
	if u.SSOID != nil {
		resp.SsoID = u.SSOID
	}

	resp.IsActive = u.IsActive
	resp.IsLocked = u.IsLocked

	if u.DataScopeType != "" {
		resp.DataScopeType = string(u.DataScopeType)
	}
	if len(u.DataScopeTenantIDs) > 0 {
		ids := make([]strfmt.UUID, 0, len(u.DataScopeTenantIDs))
		for _, id := range u.DataScopeTenantIDs {
			ids = append(ids, strfmt.UUID(id))
		}
		resp.DataScopeTenantIds = ids
	}
	if len(u.DataScopeDepartmentIDs) > 0 {
		ids := make([]strfmt.UUID, 0, len(u.DataScopeDepartmentIDs))
		for _, id := range u.DataScopeDepartmentIDs {
			ids = append(ids, strfmt.UUID(id))
		}
		resp.DataScopeDepartmentIds = ids
	}
	if len(u.DataScopeEmployeeIDs) > 0 {
		ids := make([]strfmt.UUID, 0, len(u.DataScopeEmployeeIDs))
		for _, id := range u.DataScopeEmployeeIDs {
			ids = append(ids, strfmt.UUID(id))
		}
		resp.DataScopeEmployeeIds = ids
	}

	return resp
}

func mapUsersToResponse(users []model.User) []*models.User {
	result := make([]*models.User, len(users))
	for i, u := range users {
		result[i] = mapUserToResponse(&u)
	}
	return result
}

func mapUserGroupToResponse(ug *model.UserGroup) *models.UserGroup {
	id := strfmt.UUID(ug.ID.String())
	name := ug.Name
	code := ug.Code
	createdAt := strfmt.DateTime(ug.CreatedAt)
	updatedAt := strfmt.DateTime(ug.UpdatedAt)

	resp := &models.UserGroup{
		ID:        &id,
		Name:      &name,
		Code:      &code,
		IsActive:  ug.IsActive,
		IsSystem:  ug.IsSystem,
		IsAdmin:   ug.IsAdmin,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}

	if ug.TenantID != nil {
		tenantID := strfmt.UUID(ug.TenantID.String())
		resp.TenantID = &tenantID
	}

	if ug.Description != "" {
		desc := ug.Description
		resp.Description = &desc
	}

	var permissionIDs []string
	if err := json.Unmarshal(ug.Permissions, &permissionIDs); err == nil {
		resp.Permissions = make([]*models.Permission, 0, len(permissionIDs))
		for _, pid := range permissionIDs {
			perm, ok := permissions.Lookup(pid)
			if !ok {
				continue
			}
			permID := strfmt.UUID(perm.ID.String())
			resource := perm.Resource
			action := perm.Action
			description := perm.Description
			resp.Permissions = append(resp.Permissions, &models.Permission{
				ID:          &permID,
				Resource:    &resource,
				Action:      &action,
				Description: &description,
			})
		}
	}

	return resp
}
