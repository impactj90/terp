// Package config provides configuration loading and validation for the application.
package config

import (
	"os"
	"time"

	"github.com/rs/zerolog/log"
)

// Config holds all application configuration.
type Config struct {
	Env         string
	Port        string
	DatabaseURL string
	JWT         JWTConfig
	LogLevel    string
	BaseURL     string
	FrontendURL string
}

// JWTConfig holds JWT configuration.
type JWTConfig struct {
	Secret string
	Expiry time.Duration
}

// Load reads configuration from environment variables.
func Load() *Config {
	cfg := &Config{
		Env:         getEnv("ENV", "development"),
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://dev:dev@localhost:5432/terp?sslmode=disable"),
		JWT: JWTConfig{
			Secret: getEnv("JWT_SECRET", "dev-secret-change-in-production"),
			Expiry: parseDuration(getEnv("JWT_EXPIRY", "24h")),
		},
		LogLevel:    getEnv("LOG_LEVEL", "debug"),
		BaseURL:     getEnv("BASE_URL", "http://localhost:8080"),
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
	}

	// Validate required fields in production
	if cfg.Env == "production" {
		if cfg.JWT.Secret == "dev-secret-change-in-production" {
			log.Fatal().Msg("JWT_SECRET must be changed in production")
		}
	}

	return cfg
}

// IsDevelopment returns true if running in development mode.
func (c *Config) IsDevelopment() bool {
	return c.Env == "development"
}

// IsProduction returns true if running in production mode.
func (c *Config) IsProduction() bool {
	return c.Env == "production"
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func parseDuration(s string) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		log.Warn().Str("value", s).Msg("Invalid duration, using default 24h")
		return 24 * time.Hour
	}
	return d
}
