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

// VacationCalcGroupHandler handles vacation calculation group HTTP requests.
type VacationCalcGroupHandler struct {
	svc          *service.VacationCalcGroupService
	auditService *service.AuditLogService
}

// NewVacationCalcGroupHandler creates a new VacationCalcGroupHandler.
func NewVacationCalcGroupHandler(svc *service.VacationCalcGroupService) *VacationCalcGroupHandler {
	return &VacationCalcGroupHandler{svc: svc}
}

// SetAuditService sets the audit log service for this handler.
func (h *VacationCalcGroupHandler) SetAuditService(s *service.AuditLogService) {
	h.auditService = s
}

// List handles GET /vacation-calculation-groups
func (h *VacationCalcGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	activeOnly := r.URL.Query().Get("active_only") == "true"

	var groups []model.VacationCalculationGroup
	var err error

	if activeOnly {
		groups, err = h.svc.ListActive(r.Context(), tenantID)
	} else {
		groups, err = h.svc.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list vacation calculation groups")
		return
	}

	respondJSON(w, http.StatusOK, vacationCalcGroupListToResponse(groups))
}

// Get handles GET /vacation-calculation-groups/{id}
func (h *VacationCalcGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid calculation group ID")
		return
	}

	group, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleVacationCalcGroupError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, vacationCalcGroupToResponse(group))
}

// Create handles POST /vacation-calculation-groups
func (h *VacationCalcGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateVacationCalculationGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateVacationCalcGroupInput{
		TenantID: tenantID,
		Code:     *req.Code,
		Name:     *req.Name,
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.Basis != nil {
		input.Basis = *req.Basis
	}

	// Parse special_calculation_ids
	for _, sid := range req.SpecialCalculationIds {
		parsed, err := uuid.Parse(sid.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid special calculation ID")
			return
		}
		input.SpecialCalculationIDs = append(input.SpecialCalculationIDs, parsed)
	}

	group, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleVacationCalcGroupError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionCreate,
				EntityType: "vacation_calculation_group",
				EntityID:   group.ID,
			})
		}
	}

	respondJSON(w, http.StatusCreated, vacationCalcGroupToResponse(group))
}

// Update handles PATCH /vacation-calculation-groups/{id}
func (h *VacationCalcGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid calculation group ID")
		return
	}

	var req models.UpdateVacationCalculationGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateVacationCalcGroupInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.Basis != "" {
		input.Basis = &req.Basis
	}
	input.IsActive = &req.IsActive

	// Parse special_calculation_ids if provided
	if req.SpecialCalculationIds != nil {
		ids := make([]uuid.UUID, 0, len(req.SpecialCalculationIds))
		for _, sid := range req.SpecialCalculationIds {
			parsed, parseErr := uuid.Parse(sid.String())
			if parseErr != nil {
				respondError(w, http.StatusBadRequest, "Invalid special calculation ID")
				return
			}
			ids = append(ids, parsed)
		}
		input.SpecialCalculationIDs = &ids
	}

	group, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleVacationCalcGroupError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionUpdate,
				EntityType: "vacation_calculation_group",
				EntityID:   group.ID,
			})
		}
	}

	respondJSON(w, http.StatusOK, vacationCalcGroupToResponse(group))
}

// Delete handles DELETE /vacation-calculation-groups/{id}
func (h *VacationCalcGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid calculation group ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleVacationCalcGroupError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionDelete,
				EntityType: "vacation_calculation_group",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// vacationCalcGroupToResponse converts internal model to API response model.
func vacationCalcGroupToResponse(g *model.VacationCalculationGroup) *models.VacationCalculationGroup {
	id := strfmt.UUID(g.ID.String())
	tenantID := strfmt.UUID(g.TenantID.String())
	basis := string(g.Basis)

	resp := &models.VacationCalculationGroup{
		ID:        &id,
		TenantID:  &tenantID,
		Code:      &g.Code,
		Name:      &g.Name,
		Basis:     &basis,
		IsActive:  g.IsActive,
		CreatedAt: strfmt.DateTime(g.CreatedAt),
		UpdatedAt: strfmt.DateTime(g.UpdatedAt),
	}

	if g.Description != nil {
		resp.Description = g.Description
	}

	// Map special calculations to summary
	resp.SpecialCalculations = make([]*models.VacationSpecialCalculationSummary, 0, len(g.SpecialCalculations))
	for _, sc := range g.SpecialCalculations {
		scID := strfmt.UUID(sc.ID.String())
		scType := string(sc.Type)
		threshold := int64(sc.Threshold)
		bonusDays, _ := sc.BonusDays.Float64()
		resp.SpecialCalculations = append(resp.SpecialCalculations, &models.VacationSpecialCalculationSummary{
			ID:        &scID,
			Type:      &scType,
			Threshold: &threshold,
			BonusDays: &bonusDays,
		})
	}

	return resp
}

// vacationCalcGroupListToResponse converts a list to API response format.
func vacationCalcGroupListToResponse(groups []model.VacationCalculationGroup) models.VacationCalculationGroupList {
	data := make([]*models.VacationCalculationGroup, 0, len(groups))
	for i := range groups {
		data = append(data, vacationCalcGroupToResponse(&groups[i]))
	}
	return models.VacationCalculationGroupList{Data: data}
}

// handleVacationCalcGroupError maps service errors to HTTP responses.
func handleVacationCalcGroupError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrVacationCalcGroupNotFound:
		respondError(w, http.StatusNotFound, "Vacation calculation group not found")
	case service.ErrVacationCalcGroupCodeRequired:
		respondError(w, http.StatusBadRequest, "Code is required")
	case service.ErrVacationCalcGroupNameRequired:
		respondError(w, http.StatusBadRequest, "Name is required")
	case service.ErrVacationCalcGroupInvalidBasis:
		respondError(w, http.StatusBadRequest, "Basis must be calendar_year or entry_date")
	case service.ErrVacationCalcGroupCodeExists:
		respondError(w, http.StatusConflict, "A calculation group with this code already exists")
	case service.ErrVacationCalcGroupInUse:
		respondError(w, http.StatusConflict, "Calculation group is assigned to employment types")
	case service.ErrSpecialCalcNotFound:
		respondError(w, http.StatusBadRequest, "One or more special calculation IDs not found")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
