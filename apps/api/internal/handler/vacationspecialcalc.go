package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// VacationSpecialCalcHandler handles vacation special calculation HTTP requests.
type VacationSpecialCalcHandler struct {
	svc          *service.VacationSpecialCalcService
	auditService *service.AuditLogService
}

// NewVacationSpecialCalcHandler creates a new VacationSpecialCalcHandler.
func NewVacationSpecialCalcHandler(svc *service.VacationSpecialCalcService) *VacationSpecialCalcHandler {
	return &VacationSpecialCalcHandler{svc: svc}
}

// SetAuditService sets the audit log service for this handler.
func (h *VacationSpecialCalcHandler) SetAuditService(s *service.AuditLogService) {
	h.auditService = s
}

// List handles GET /vacation-special-calculations
func (h *VacationSpecialCalcHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	activeOnly := r.URL.Query().Get("active_only") == "true"
	filterType := r.URL.Query().Get("type")

	var calcs []model.VacationSpecialCalculation
	var err error

	if filterType != "" {
		calcs, err = h.svc.ListByType(r.Context(), tenantID, filterType)
	} else if activeOnly {
		calcs, err = h.svc.ListActive(r.Context(), tenantID)
	} else {
		calcs, err = h.svc.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list vacation special calculations")
		return
	}

	respondJSON(w, http.StatusOK, vacationSpecialCalcListToResponse(calcs))
}

// Get handles GET /vacation-special-calculations/{id}
func (h *VacationSpecialCalcHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid special calculation ID")
		return
	}

	calc, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleVacationSpecialCalcError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, vacationSpecialCalcToResponse(calc))
}

// Create handles POST /vacation-special-calculations
func (h *VacationSpecialCalcHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateVacationSpecialCalculationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateVacationSpecialCalcInput{
		TenantID:  tenantID,
		Type:      *req.Type,
		Threshold: int(req.Threshold),
		BonusDays: *req.BonusDays,
	}
	if req.Description != "" {
		input.Description = &req.Description
	}

	calc, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleVacationSpecialCalcError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionCreate,
				EntityType: "vacation_special_calculation",
				EntityID:   calc.ID,
			})
		}
	}

	respondJSON(w, http.StatusCreated, vacationSpecialCalcToResponse(calc))
}

// Update handles PATCH /vacation-special-calculations/{id}
func (h *VacationSpecialCalcHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid special calculation ID")
		return
	}

	var req models.UpdateVacationSpecialCalculationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateVacationSpecialCalcInput{}
	if req.Threshold != 0 {
		threshold := int(req.Threshold)
		input.Threshold = &threshold
	}
	if req.BonusDays != 0 {
		input.BonusDays = &req.BonusDays
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive

	calc, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleVacationSpecialCalcError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionUpdate,
				EntityType: "vacation_special_calculation",
				EntityID:   calc.ID,
			})
		}
	}

	respondJSON(w, http.StatusOK, vacationSpecialCalcToResponse(calc))
}

// Delete handles DELETE /vacation-special-calculations/{id}
func (h *VacationSpecialCalcHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid special calculation ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleVacationSpecialCalcError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionDelete,
				EntityType: "vacation_special_calculation",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// vacationSpecialCalcToResponse converts internal model to API response model.
func vacationSpecialCalcToResponse(sc *model.VacationSpecialCalculation) *models.VacationSpecialCalculation {
	id := strfmt.UUID(sc.ID.String())
	tenantID := strfmt.UUID(sc.TenantID.String())
	calcType := string(sc.Type)
	threshold := int64(sc.Threshold)
	bonusDays, _ := sc.BonusDays.Float64()

	resp := &models.VacationSpecialCalculation{
		ID:        &id,
		TenantID:  &tenantID,
		Type:      &calcType,
		Threshold: &threshold,
		BonusDays: &bonusDays,
		IsActive:  sc.IsActive,
		CreatedAt: strfmt.DateTime(sc.CreatedAt),
		UpdatedAt: strfmt.DateTime(sc.UpdatedAt),
	}

	if sc.Description != nil {
		resp.Description = sc.Description
	}

	return resp
}

// vacationSpecialCalcListToResponse converts a list to API response format.
func vacationSpecialCalcListToResponse(calcs []model.VacationSpecialCalculation) models.VacationSpecialCalculationList {
	data := make([]*models.VacationSpecialCalculation, 0, len(calcs))
	for i := range calcs {
		data = append(data, vacationSpecialCalcToResponse(&calcs[i]))
	}
	return models.VacationSpecialCalculationList{Data: data}
}

// handleVacationSpecialCalcError maps service errors to HTTP responses.
func handleVacationSpecialCalcError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrVacationSpecialCalcNotFound:
		respondError(w, http.StatusNotFound, "Vacation special calculation not found")
	case service.ErrVacationSpecialCalcTypeRequired:
		respondError(w, http.StatusBadRequest, "Type is required")
	case service.ErrVacationSpecialCalcTypeInvalid:
		respondError(w, http.StatusBadRequest, "Type must be age, tenure, or disability")
	case service.ErrVacationSpecialCalcBonusRequired:
		respondError(w, http.StatusBadRequest, "Bonus days must be positive")
	case service.ErrVacationSpecialCalcInvalidThreshold:
		respondError(w, http.StatusBadRequest, "Threshold must be 0 for disability type and positive for age/tenure types")
	case service.ErrVacationSpecialCalcDuplicate:
		respondError(w, http.StatusConflict, "A special calculation with this type and threshold already exists")
	case service.ErrVacationSpecialCalcInUse:
		respondError(w, http.StatusConflict, "Vacation special calculation is assigned to calculation groups")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
