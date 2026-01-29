package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type WeekPlanHandler struct {
	weekPlanService *service.WeekPlanService
}

func NewWeekPlanHandler(weekPlanService *service.WeekPlanService) *WeekPlanHandler {
	return &WeekPlanHandler{weekPlanService: weekPlanService}
}

func (h *WeekPlanHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for active filter
	activeOnly := r.URL.Query().Get("active") == "true"

	var plans []model.WeekPlan
	var err error

	if activeOnly {
		plans, err = h.weekPlanService.ListActive(r.Context(), tenantID)
	} else {
		plans, err = h.weekPlanService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list week plans")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": plans})
}

func (h *WeekPlanHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid week plan ID")
		return
	}

	plan, err := h.weekPlanService.GetDetails(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Week plan not found")
		return
	}

	respondJSON(w, http.StatusOK, plan)
}

func (h *WeekPlanHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateWeekPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateWeekPlanInput{
		TenantID: tenantID,
		Code:     *req.Code,
		Name:     *req.Name,
	}

	// Handle optional fields
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.MondayDayPlanID != "" {
		id := uuid.MustParse(req.MondayDayPlanID.String())
		input.MondayDayPlanID = &id
	}
	if req.TuesdayDayPlanID != "" {
		id := uuid.MustParse(req.TuesdayDayPlanID.String())
		input.TuesdayDayPlanID = &id
	}
	if req.WednesdayDayPlanID != "" {
		id := uuid.MustParse(req.WednesdayDayPlanID.String())
		input.WednesdayDayPlanID = &id
	}
	if req.ThursdayDayPlanID != "" {
		id := uuid.MustParse(req.ThursdayDayPlanID.String())
		input.ThursdayDayPlanID = &id
	}
	if req.FridayDayPlanID != "" {
		id := uuid.MustParse(req.FridayDayPlanID.String())
		input.FridayDayPlanID = &id
	}
	if req.SaturdayDayPlanID != "" {
		id := uuid.MustParse(req.SaturdayDayPlanID.String())
		input.SaturdayDayPlanID = &id
	}
	if req.SundayDayPlanID != "" {
		id := uuid.MustParse(req.SundayDayPlanID.String())
		input.SundayDayPlanID = &id
	}

	plan, err := h.weekPlanService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrWeekPlanCodeReq:
			respondError(w, http.StatusBadRequest, "Week plan code is required")
		case service.ErrWeekPlanNameReq:
			respondError(w, http.StatusBadRequest, "Week plan name is required")
		case service.ErrWeekPlanCodeExists:
			respondError(w, http.StatusConflict, "A week plan with this code already exists")
		case service.ErrInvalidDayPlan:
			respondError(w, http.StatusBadRequest, "Invalid day plan reference")
		case service.ErrWeekPlanIncomplete:
			respondError(w, http.StatusBadRequest, "Week plan must have a day plan assigned for all 7 days")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create week plan")
		}
		return
	}

	respondJSON(w, http.StatusCreated, plan)
}

func (h *WeekPlanHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid week plan ID")
		return
	}

	var req models.UpdateWeekPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert to service input - only set fields that were provided
	input := service.UpdateWeekPlanInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.MondayDayPlanID != "" {
		dayPlanID := uuid.MustParse(req.MondayDayPlanID.String())
		input.MondayDayPlanID = &dayPlanID
	}
	if req.TuesdayDayPlanID != "" {
		dayPlanID := uuid.MustParse(req.TuesdayDayPlanID.String())
		input.TuesdayDayPlanID = &dayPlanID
	}
	if req.WednesdayDayPlanID != "" {
		dayPlanID := uuid.MustParse(req.WednesdayDayPlanID.String())
		input.WednesdayDayPlanID = &dayPlanID
	}
	if req.ThursdayDayPlanID != "" {
		dayPlanID := uuid.MustParse(req.ThursdayDayPlanID.String())
		input.ThursdayDayPlanID = &dayPlanID
	}
	if req.FridayDayPlanID != "" {
		dayPlanID := uuid.MustParse(req.FridayDayPlanID.String())
		input.FridayDayPlanID = &dayPlanID
	}
	if req.SaturdayDayPlanID != "" {
		dayPlanID := uuid.MustParse(req.SaturdayDayPlanID.String())
		input.SaturdayDayPlanID = &dayPlanID
	}
	if req.SundayDayPlanID != "" {
		dayPlanID := uuid.MustParse(req.SundayDayPlanID.String())
		input.SundayDayPlanID = &dayPlanID
	}
	// IsActive needs special handling - we always pass it since it's a boolean
	input.IsActive = &req.IsActive

	plan, err := h.weekPlanService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrWeekPlanNotFound:
			respondError(w, http.StatusNotFound, "Week plan not found")
		case service.ErrWeekPlanNameReq:
			respondError(w, http.StatusBadRequest, "Week plan name cannot be empty")
		case service.ErrInvalidDayPlan:
			respondError(w, http.StatusBadRequest, "Invalid day plan reference")
		case service.ErrWeekPlanIncomplete:
			respondError(w, http.StatusBadRequest, "Week plan must have a day plan assigned for all 7 days")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update week plan")
		}
		return
	}

	respondJSON(w, http.StatusOK, plan)
}

func (h *WeekPlanHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid week plan ID")
		return
	}

	if err := h.weekPlanService.Delete(r.Context(), id); err != nil {
		switch err {
		case service.ErrWeekPlanNotFound:
			respondError(w, http.StatusNotFound, "Week plan not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete week plan")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
