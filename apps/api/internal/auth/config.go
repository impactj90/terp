package auth

import (
	"fmt"
	"time"
)

// Config holds authentication configuration.
type Config struct {
	DevMode bool // True when in development mode

	// JWT settings
	JWTSecret    []byte
	JWTExpiry    time.Duration
	JWTIssuer    string
	CookieSecure bool
	FrontendURL  string
}

// IsDevMode returns true if running in development mode.
func (c *Config) IsDevMode() bool {
	return c.DevMode
}

// Validate checks if the config is valid.
func (c *Config) Validate() error {
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("JWT secret must be at least 32 bytes")
	}
	return nil
}
