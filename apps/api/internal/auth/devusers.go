package auth

import (
	"github.com/google/uuid"
)

// DevUser represents a predefined development user.
type DevUser struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Role        string    `json:"role"`
}

// DevUsers contains predefined users for development mode.
// Using deterministic UUIDs for consistency across restarts.
var DevUsers = map[string]DevUser{
	"admin": {
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Email:       "admin@dev.local",
		DisplayName: "Dev Admin",
		Role:        "admin",
	},
	"user": {
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000002"),
		Email:       "user@dev.local",
		DisplayName: "Dev User",
		Role:        "user",
	},
}

// GetDevUser returns a dev user by role.
func GetDevUser(role string) (DevUser, bool) {
	user, ok := DevUsers[role]
	return user, ok
}

// ValidDevRoles returns all valid dev role names.
func ValidDevRoles() []string {
	return []string{"admin", "user"}
}
