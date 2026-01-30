package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// SystemSettingsHandler handles system settings HTTP requests.
type SystemSettingsHandler struct {
	svc          *service.SystemSettingsService
	auditService *service.AuditLogService
}

// NewSystemSettingsHandler creates a new SystemSettingsHandler.
func NewSystemSettingsHandler(svc *service.SystemSettingsService) *SystemSettingsHandler {
	return &SystemSettingsHandler{svc: svc}
}

// SetAuditService sets the audit log service for this handler.
func (h *SystemSettingsHandler) SetAuditService(s *service.AuditLogService) {
	h.auditService = s
}

// GetSettings handles GET /system-settings
func (h *SystemSettingsHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	settings, err := h.svc.Get(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get system settings")
		return
	}

	respondJSON(w, http.StatusOK, mapSystemSettingsToResponse(settings))
}

// UpdateSettings handles PUT /system-settings
func (h *SystemSettingsHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.UpdateSystemSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateSystemSettingsInput{}

	// Map boolean fields (use pointer nil to detect presence)
	if req.RoundingRelativeToPlan {
		v := req.RoundingRelativeToPlan
		input.RoundingRelativeToPlan = &v
	}
	if req.ErrorListEnabled {
		v := req.ErrorListEnabled
		input.ErrorListEnabled = &v
	}
	if req.AutoFillOrderEndBookings {
		v := req.AutoFillOrderEndBookings
		input.AutoFillOrderEndBookings = &v
	}
	if req.FollowUpEntriesEnabled {
		v := req.FollowUpEntriesEnabled
		input.FollowUpEntriesEnabled = &v
	}
	if req.ProxyEnabled {
		v := req.ProxyEnabled
		input.ProxyEnabled = &v
	}
	if req.ServerAliveEnabled {
		v := req.ServerAliveEnabled
		input.ServerAliveEnabled = &v
	}
	if req.ServerAliveNotifyAdmins {
		v := req.ServerAliveNotifyAdmins
		input.ServerAliveNotifyAdmins = &v
	}
	if req.TrackedErrorCodes != nil {
		input.TrackedErrorCodes = req.TrackedErrorCodes
	}

	// Map optional integer fields
	if req.BirthdayWindowDaysBefore != nil {
		v := int(*req.BirthdayWindowDaysBefore)
		input.BirthdayWindowDaysBefore = &v
	}
	if req.BirthdayWindowDaysAfter != nil {
		v := int(*req.BirthdayWindowDaysAfter)
		input.BirthdayWindowDaysAfter = &v
	}
	if req.ProxyHost != nil {
		input.ProxyHost = req.ProxyHost
	}
	if req.ProxyPort != nil {
		v := int(*req.ProxyPort)
		input.ProxyPort = &v
	}
	if req.ProxyUsername != nil {
		input.ProxyUsername = req.ProxyUsername
	}
	if req.ProxyPassword != nil {
		input.ProxyPassword = req.ProxyPassword
	}
	if req.ServerAliveExpectedCompletionTime != nil {
		v := int(*req.ServerAliveExpectedCompletionTime)
		input.ServerAliveExpectedCompletionTime = &v
	}
	if req.ServerAliveThresholdMinutes != nil {
		v := int(*req.ServerAliveThresholdMinutes)
		input.ServerAliveThresholdMinutes = &v
	}

	settings, err := h.svc.Update(r.Context(), tenantID, input)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInvalidBirthdayWindow):
			respondError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrInvalidServerAliveTime):
			respondError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrInvalidServerAliveThreshold):
			respondError(w, http.StatusBadRequest, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update system settings")
		}
		return
	}

	// Audit log
	if h.auditService != nil {
		h.auditService.Log(r.Context(), r, service.LogEntry{
			TenantID:   tenantID,
			Action:     model.AuditActionUpdate,
			EntityType: "system_settings",
			EntityID:   settings.ID,
		})
	}

	respondJSON(w, http.StatusOK, mapSystemSettingsToResponse(settings))
}

// CleanupDeleteBookings handles POST /system-settings/cleanup/delete-bookings
func (h *SystemSettingsHandler) CleanupDeleteBookings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CleanupDeleteBookingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CleanupDateRangeInput{
		DateFrom:    time.Time(*req.DateFrom),
		DateTo:      time.Time(*req.DateTo),
		EmployeeIDs: parseUUIDs(req.EmployeeIds),
		Confirm:     req.Confirm,
	}

	result, err := h.svc.DeleteBookings(r.Context(), tenantID, input)
	if err != nil {
		handleCleanupError(w, err)
		return
	}

	// Audit log for confirmed operations
	if !result.Preview && h.auditService != nil {
		h.auditService.Log(r.Context(), r, service.LogEntry{
			TenantID:   tenantID,
			Action:     model.AuditActionCleanup,
			EntityType: "bookings",
			EntityID:   tenantID, // tenant-level operation
		})
	}

	respondJSON(w, http.StatusOK, mapCleanupResult(result))
}

// CleanupDeleteBookingData handles POST /system-settings/cleanup/delete-booking-data
func (h *SystemSettingsHandler) CleanupDeleteBookingData(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CleanupDeleteBookingDataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CleanupDateRangeInput{
		DateFrom:    time.Time(*req.DateFrom),
		DateTo:      time.Time(*req.DateTo),
		EmployeeIDs: parseUUIDs(req.EmployeeIds),
		Confirm:     req.Confirm,
	}

	result, err := h.svc.DeleteBookingData(r.Context(), tenantID, input)
	if err != nil {
		handleCleanupError(w, err)
		return
	}

	if !result.Preview && h.auditService != nil {
		h.auditService.Log(r.Context(), r, service.LogEntry{
			TenantID:   tenantID,
			Action:     model.AuditActionCleanup,
			EntityType: "booking_data",
			EntityID:   tenantID,
		})
	}

	respondJSON(w, http.StatusOK, mapCleanupResult(result))
}

// CleanupReReadBookings handles POST /system-settings/cleanup/re-read-bookings
func (h *SystemSettingsHandler) CleanupReReadBookings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CleanupReReadBookingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CleanupDateRangeInput{
		DateFrom:    time.Time(*req.DateFrom),
		DateTo:      time.Time(*req.DateTo),
		EmployeeIDs: parseUUIDs(req.EmployeeIds),
		Confirm:     req.Confirm,
	}

	result, err := h.svc.ReReadBookings(r.Context(), tenantID, input)
	if err != nil {
		handleCleanupError(w, err)
		return
	}

	if !result.Preview && h.auditService != nil {
		h.auditService.Log(r.Context(), r, service.LogEntry{
			TenantID:   tenantID,
			Action:     model.AuditActionCleanup,
			EntityType: "bookings_reread",
			EntityID:   tenantID,
		})
	}

	respondJSON(w, http.StatusOK, mapCleanupResult(result))
}

// CleanupMarkDeleteOrders handles POST /system-settings/cleanup/mark-delete-orders
func (h *SystemSettingsHandler) CleanupMarkDeleteOrders(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CleanupMarkDeleteOrdersRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CleanupOrdersInput{
		OrderIDs: parseUUIDs(req.OrderIds),
		Confirm:  req.Confirm,
	}

	result, err := h.svc.MarkDeleteOrders(r.Context(), tenantID, input)
	if err != nil {
		handleCleanupError(w, err)
		return
	}

	if !result.Preview && h.auditService != nil {
		h.auditService.Log(r.Context(), r, service.LogEntry{
			TenantID:   tenantID,
			Action:     model.AuditActionCleanup,
			EntityType: "orders",
			EntityID:   tenantID,
		})
	}

	respondJSON(w, http.StatusOK, mapCleanupResult(result))
}

// --- Helpers ---

func handleCleanupError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidDateRange):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrDateRangeTooLarge):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, service.ErrCleanupNoOrderIDs):
		respondError(w, http.StatusBadRequest, err.Error())
	default:
		respondError(w, http.StatusInternalServerError, "Cleanup operation failed")
	}
}

func parseUUIDs(ids []strfmt.UUID) []uuid.UUID {
	result := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		parsed, err := uuid.Parse(id.String())
		if err == nil {
			result = append(result, parsed)
		}
	}
	return result
}

func mapSystemSettingsToResponse(s *model.SystemSettings) *models.SystemSettings {
	id := strfmt.UUID(s.ID.String())
	tenantID := strfmt.UUID(s.TenantID.String())
	createdAt := strfmt.DateTime(s.CreatedAt)
	updatedAt := strfmt.DateTime(s.UpdatedAt)

	resp := &models.SystemSettings{
		ID:                       &id,
		TenantID:                 &tenantID,
		RoundingRelativeToPlan:   s.RoundingRelativeToPlan,
		ErrorListEnabled:         s.ErrorListEnabled,
		TrackedErrorCodes:        s.TrackedErrorCodes,
		AutoFillOrderEndBookings: s.AutoFillOrderEndBookings,
		FollowUpEntriesEnabled:   s.FollowUpEntriesEnabled,
		ProxyEnabled:             s.ProxyEnabled,
		ServerAliveEnabled:       s.ServerAliveEnabled,
		ServerAliveNotifyAdmins:  s.ServerAliveNotifyAdmins,
		CreatedAt:                createdAt,
		UpdatedAt:                updatedAt,
	}

	before := int64(s.BirthdayWindowDaysBefore)
	resp.BirthdayWindowDaysBefore = &before
	after := int64(s.BirthdayWindowDaysAfter)
	resp.BirthdayWindowDaysAfter = &after

	if s.ProxyHost != nil {
		resp.ProxyHost = s.ProxyHost
	}
	if s.ProxyPort != nil {
		port := int64(*s.ProxyPort)
		resp.ProxyPort = &port
	}
	if s.ProxyUsername != nil {
		resp.ProxyUsername = s.ProxyUsername
	}
	if s.ServerAliveExpectedCompletionTime != nil {
		v := int64(*s.ServerAliveExpectedCompletionTime)
		resp.ServerAliveExpectedCompletionTime = &v
	}
	if s.ServerAliveThresholdMinutes != nil {
		v := int64(*s.ServerAliveThresholdMinutes)
		resp.ServerAliveThresholdMinutes = &v
	}

	return resp
}

func mapCleanupResult(r *service.CleanupResult) *models.CleanupResult {
	op := r.Operation
	count := r.AffectedCount
	now := strfmt.DateTime(time.Now())

	resp := &models.CleanupResult{
		Operation:     &op,
		AffectedCount: &count,
		Preview:       r.Preview,
		PerformedAt:   now,
	}

	if r.Details != nil {
		resp.Details = r.Details
	}

	return resp
}
