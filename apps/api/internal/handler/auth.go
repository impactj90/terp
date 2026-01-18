// Package handler handles all HTTP requests.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	jwtManager  *auth.JWTManager
	authConfig  *auth.Config
	userService *service.UserService
}

// NewAuthHandler creates a new auth handler instance.
func NewAuthHandler(
	config *auth.Config,
	jwtManager *auth.JWTManager,
	userService *service.UserService,
) *AuthHandler {
	return &AuthHandler{
		jwtManager:  jwtManager,
		authConfig:  config,
		userService: userService,
	}
}

// DevLogin handles development-mode authentication.
// GET /auth/dev/login?role=admin|user
func (h *AuthHandler) DevLogin(w http.ResponseWriter, r *http.Request) {
	if !h.authConfig.IsDevMode() {
		respondError(w, http.StatusForbidden, "Dev login not available in production")
		return
	}

	roleStr := r.URL.Query().Get("role")
	if roleStr == "" {
		roleStr = "user"
	}

	devUser, ok := auth.GetDevUser(roleStr)
	if !ok {
		respondJSON(w, http.StatusBadRequest, map[string]any{
			"error":       "bad_request",
			"message":     "invalid role",
			"valid_roles": auth.ValidDevRoles(),
		})
		return
	}

	// Ensure dev user exists in database
	if err := h.userService.UpsertDevUser(r.Context(), devUser.ID, devUser.Email, devUser.DisplayName, model.UserRole(devUser.Role)); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev user to database")
		return
	}

	token, err := h.jwtManager.Generate(devUser.ID, devUser.Email, devUser.DisplayName, devUser.Role)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.authConfig.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(h.authConfig.JWTExpiry.Seconds()),
	})

	respondJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  devUser,
	})
}

// DevUsers lists all available dev users.
// GET /auth/dev/users
func (h *AuthHandler) DevUsers(w http.ResponseWriter, _ *http.Request) {
	if !h.authConfig.IsDevMode() {
		respondError(w, http.StatusForbidden, "Dev users not available in production")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"dev_mode": true,
		"users":    auth.DevUsers,
	})
}

// Login handles credential-based authentication.
// POST /auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// In dev mode, redirect to dev login
	if h.authConfig.IsDevMode() {
		respondJSON(w, http.StatusBadRequest, map[string]any{
			"message": "You are in dev mode, please use /auth/dev/login instead.",
		})
		return
	}

	// TODO: Implement actual authentication logic
	// For now, return not implemented
	respondError(w, http.StatusNotImplemented, "Login not yet implemented. Use dev mode for testing.")
}

// Refresh handles token refresh.
// POST /auth/refresh
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	token, err := h.jwtManager.Generate(user.ID, user.Email, user.DisplayName, user.Role)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.authConfig.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(h.authConfig.JWTExpiry.Seconds()),
	})

	respondJSON(w, http.StatusOK, map[string]any{
		"token": token,
	})
}

// Me returns the current authenticated user.
// GET /auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"user": user,
	})
}

// Logout clears the authentication cookie.
// POST /auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.authConfig.CookieSecure,
	})

	w.WriteHeader(http.StatusNoContent)
}
