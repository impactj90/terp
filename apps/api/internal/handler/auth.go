// Package handler handles all HTTP requests.
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	jwtManager         *auth.JWTManager
	authConfig         *auth.Config
	userService        *service.UserService
	tenantService      *service.TenantService
	employeeService    *service.EmployeeService
	bookingTypeService *service.BookingTypeService
	absenceService     *service.AbsenceService
}

// NewAuthHandler creates a new auth handler instance.
func NewAuthHandler(
	config *auth.Config,
	jwtManager *auth.JWTManager,
	userService *service.UserService,
	tenantService *service.TenantService,
	employeeService *service.EmployeeService,
	bookingTypeService *service.BookingTypeService,
	absenceService *service.AbsenceService,
) *AuthHandler {
	return &AuthHandler{
		jwtManager:         jwtManager,
		authConfig:         config,
		userService:        userService,
		tenantService:      tenantService,
		employeeService:    employeeService,
		bookingTypeService: bookingTypeService,
		absenceService:     absenceService,
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

	// Ensure dev tenant exists in database
	devTenant := auth.GetDevTenant()
	if err := h.tenantService.UpsertDevTenant(r.Context(), devTenant.ID, devTenant.Name, devTenant.Slug); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev tenant to database")
		return
	}

	// Ensure dev user exists in database
	if err := h.userService.UpsertDevUser(r.Context(), devUser.ID, devUser.Email, devUser.DisplayName, model.UserRole(devUser.Role)); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev user to database")
		return
	}

	// Create all dev employees (idempotent)
	for _, devEmp := range auth.GetDevEmployees() {
		emp := &model.Employee{
			TenantID:            devTenant.ID,
			PersonnelNumber:     devEmp.PersonnelNumber,
			PIN:                 devEmp.PIN,
			FirstName:           devEmp.FirstName,
			LastName:            devEmp.LastName,
			Email:               devEmp.Email,
			EntryDate:           devEmp.EntryDate,
			WeeklyHours:         decimal.NewFromFloat(devEmp.WeeklyHours),
			VacationDaysPerYear: decimal.NewFromFloat(devEmp.VacationDays),
			IsActive:            true,
		}
		emp.ID = devEmp.ID
		if err := h.employeeService.UpsertDevEmployee(r.Context(), emp); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev employees to database")
			return
		}
	}

	// Link user to their employee record if mapped
	if empID, ok := auth.GetDevEmployeeForUser(devUser.ID); ok {
		if err := h.userService.LinkUserToEmployee(r.Context(), devUser.ID, empID); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to link user to employee")
			return
		}
	}

	// Create all dev booking types (system-level, idempotent)
	for _, devBT := range auth.GetDevBookingTypes() {
		desc := devBT.Description
		bt := &model.BookingType{
			ID:          devBT.ID,
			TenantID:    nil, // System-level
			Code:        devBT.Code,
			Name:        devBT.Name,
			Description: &desc,
			Direction:   model.BookingDirection(devBT.Direction),
			IsSystem:    true,
			IsActive:    devBT.IsActive,
		}
		if err := h.bookingTypeService.UpsertDevBookingType(r.Context(), bt); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev booking types to database")
			return
		}
	}

	// Create all dev absence types (system-level, idempotent)
	for _, devAT := range auth.GetDevAbsenceTypes() {
		desc := devAT.Description
		at := &model.AbsenceType{
			ID:              devAT.ID,
			TenantID:        nil, // System-level
			Code:            devAT.Code,
			Name:            devAT.Name,
			Description:     &desc,
			Category:        model.AbsenceCategory(devAT.Category),
			Portion:         model.AbsencePortion(devAT.Portion),
			DeductsVacation: devAT.DeductsVacation,
			Color:           devAT.Color,
			SortOrder:       devAT.SortOrder,
			IsSystem:        true,
			IsActive:        true,
		}
		if err := h.absenceService.UpsertDevAbsenceType(r.Context(), at); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev absence types to database")
			return
		}
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
		"token":  token,
		"user":   devUser,
		"tenant": devTenant,
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
	ctxUser, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	// Fetch full user from database to include employee_id
	user, err := h.userService.GetByID(r.Context(), ctxUser.ID)
	if err != nil {
		// Fall back to context user if DB lookup fails
		respondJSON(w, http.StatusOK, ctxUser)
		return
	}

	// Return User directly (not wrapped) per OpenAPI spec
	respondJSON(w, http.StatusOK, user)
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
