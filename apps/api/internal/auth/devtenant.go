package auth

import (
	"github.com/google/uuid"
)

// DevTenant represents a predefined development tenant.
type DevTenant struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
}

// DefaultDevTenant is the predefined tenant for development mode.
// Using deterministic UUID for consistency across restarts.
var DefaultDevTenant = DevTenant{
	ID:   uuid.MustParse("00000000-0000-0000-0000-000000000100"),
	Name: "Dev Company",
	Slug: "dev-company",
}

// GetDevTenant returns the default dev tenant.
func GetDevTenant() DevTenant {
	return DefaultDevTenant
}
