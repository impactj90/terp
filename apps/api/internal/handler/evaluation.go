package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// EvaluationHandler handles evaluation query endpoints.
type EvaluationHandler struct {
	evalService *service.EvaluationService
}

// NewEvaluationHandler creates a new evaluation handler.
func NewEvaluationHandler(evalService *service.EvaluationService) *EvaluationHandler {
	return &EvaluationHandler{evalService: evalService}
}

// ListDailyValues handles GET /evaluations/daily-values
func (h *EvaluationHandler) ListDailyValues(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusBadRequest, "missing tenant context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	scope, err := scopeFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to determine scope")
		return
	}

	filter := service.EvalDailyValueFilter{
		TenantID:           tenantID,
		From:               from,
		To:                 to,
		EmployeeID:         parseOptionalUUID(r, "employee_id"),
		DepartmentID:       parseOptionalUUID(r, "department_id"),
		HasErrors:          parseOptionalBool(r, "has_errors"),
		IncludeNoBookings:  parseOptionalBoolDefault(r, "include_no_bookings", false),
		ScopeType:          scope.Type,
		ScopeDepartmentIDs: scope.DepartmentIDs,
		ScopeEmployeeIDs:   scope.EmployeeIDs,
		Limit:              parseIntDefault(r, "limit", 50),
		Page:               parseIntDefault(r, "page", 1),
	}

	result, err := h.evalService.ListDailyValues(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list daily values")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// ListBookings handles GET /evaluations/bookings
func (h *EvaluationHandler) ListBookings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusBadRequest, "missing tenant context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	scope, err := scopeFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to determine scope")
		return
	}

	filter := service.EvalBookingFilter{
		TenantID:           tenantID,
		From:               from,
		To:                 to,
		EmployeeID:         parseOptionalUUID(r, "employee_id"),
		DepartmentID:       parseOptionalUUID(r, "department_id"),
		BookingTypeID:      parseOptionalUUID(r, "booking_type_id"),
		ScopeType:          scope.Type,
		ScopeDepartmentIDs: scope.DepartmentIDs,
		ScopeEmployeeIDs:   scope.EmployeeIDs,
		Limit:              parseIntDefault(r, "limit", 50),
		Page:               parseIntDefault(r, "page", 1),
	}

	// Parse optional source filter
	if s := r.URL.Query().Get("source"); s != "" {
		src := model.BookingSource(s)
		filter.Source = &src
	}

	// Parse optional direction filter
	if d := r.URL.Query().Get("direction"); d != "" {
		dir := model.BookingDirection(d)
		filter.Direction = &dir
	}

	result, err := h.evalService.ListBookings(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list bookings")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// ListTerminalBookings handles GET /evaluations/terminal-bookings
func (h *EvaluationHandler) ListTerminalBookings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusBadRequest, "missing tenant context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	scope, err := scopeFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to determine scope")
		return
	}

	filter := service.EvalTerminalBookingFilter{
		TenantID:           tenantID,
		From:               from,
		To:                 to,
		EmployeeID:         parseOptionalUUID(r, "employee_id"),
		DepartmentID:       parseOptionalUUID(r, "department_id"),
		ScopeType:          scope.Type,
		ScopeDepartmentIDs: scope.DepartmentIDs,
		ScopeEmployeeIDs:   scope.EmployeeIDs,
		Limit:              parseIntDefault(r, "limit", 50),
		Page:               parseIntDefault(r, "page", 1),
	}

	result, err := h.evalService.ListTerminalBookings(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list terminal bookings")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// ListLogs handles GET /evaluations/logs
func (h *EvaluationHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusBadRequest, "missing tenant context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	filter := service.EvalLogFilter{
		TenantID:     tenantID,
		From:         from,
		To:           to,
		EmployeeID:   parseOptionalUUID(r, "employee_id"),
		DepartmentID: parseOptionalUUID(r, "department_id"),
		UserID:       parseOptionalUUID(r, "user_id"),
		Limit:        parseIntDefault(r, "limit", 50),
		Page:         parseIntDefault(r, "page", 1),
	}

	if et := r.URL.Query().Get("entity_type"); et != "" {
		filter.EntityType = &et
	}
	if a := r.URL.Query().Get("action"); a != "" {
		filter.Action = &a
	}

	result, err := h.evalService.ListLogs(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list logs")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// ListWorkflowHistory handles GET /evaluations/workflow-history
func (h *EvaluationHandler) ListWorkflowHistory(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusBadRequest, "missing tenant context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	filter := service.EvalWorkflowFilter{
		TenantID:     tenantID,
		From:         from,
		To:           to,
		EmployeeID:   parseOptionalUUID(r, "employee_id"),
		DepartmentID: parseOptionalUUID(r, "department_id"),
		Limit:        parseIntDefault(r, "limit", 50),
		Page:         parseIntDefault(r, "page", 1),
	}

	if et := r.URL.Query().Get("entity_type"); et != "" {
		filter.EntityType = &et
	}
	if a := r.URL.Query().Get("action"); a != "" {
		filter.Action = &a
	}

	result, err := h.evalService.ListWorkflowHistory(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list workflow history")
		return
	}

	respondJSON(w, http.StatusOK, result)
}

// --- Helper functions ---

func parseDateRange(r *http.Request) (time.Time, time.Time, error) {
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	if fromStr == "" || toStr == "" {
		return time.Time{}, time.Time{}, errMissingDateRange
	}

	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		return time.Time{}, time.Time{}, errInvalidDateFormat
	}

	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		return time.Time{}, time.Time{}, errInvalidDateFormat
	}

	if to.Before(from) {
		return time.Time{}, time.Time{}, errDateRangeInvalid
	}

	return from, to, nil
}

func parseOptionalUUID(r *http.Request, key string) *uuid.UUID {
	s := r.URL.Query().Get(key)
	if s == "" {
		return nil
	}
	id, err := uuid.Parse(s)
	if err != nil {
		return nil
	}
	return &id
}

func parseOptionalBool(r *http.Request, key string) *bool {
	s := r.URL.Query().Get(key)
	if s == "" {
		return nil
	}
	v, err := strconv.ParseBool(s)
	if err != nil {
		return nil
	}
	return &v
}

func parseOptionalBoolDefault(r *http.Request, key string, defaultVal bool) bool {
	s := r.URL.Query().Get(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.ParseBool(s)
	if err != nil {
		return defaultVal
	}
	return v
}

func parseIntDefault(r *http.Request, key string, defaultVal int) int {
	s := r.URL.Query().Get(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 1 {
		return defaultVal
	}
	return v
}

// Sentinel errors for date parsing
type evalError string

func (e evalError) Error() string { return string(e) }

const (
	errMissingDateRange  evalError = "from and to query parameters are required"
	errInvalidDateFormat evalError = "invalid date format, expected YYYY-MM-DD"
	errDateRangeInvalid  evalError = "to date must not be before from date"
)
