package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-openapi/strfmt"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/model"
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

	// Handle optional avatar URL
	if u.AvatarURL != nil {
		avatarURL := strfmt.URI(*u.AvatarURL)
		resp.AvatarURL = &avatarURL
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
