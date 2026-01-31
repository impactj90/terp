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

type DayPlanHandler struct {
	dayPlanService *service.DayPlanService
}

func NewDayPlanHandler(dayPlanService *service.DayPlanService) *DayPlanHandler {
	return &DayPlanHandler{dayPlanService: dayPlanService}
}

func (h *DayPlanHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for filters
	activeOnly := r.URL.Query().Get("active") == "true"
	planType := r.URL.Query().Get("plan_type")

	var plans []model.DayPlan
	var err error

	if activeOnly {
		plans, err = h.dayPlanService.ListActive(r.Context(), tenantID)
	} else if planType != "" {
		plans, err = h.dayPlanService.ListByPlanType(r.Context(), tenantID, model.PlanType(planType))
	} else {
		plans, err = h.dayPlanService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list day plans")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": plans})
}

func (h *DayPlanHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid day plan ID")
		return
	}

	plan, err := h.dayPlanService.GetDetails(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Day plan not found")
		return
	}

	respondJSON(w, http.StatusOK, plan)
}

func (h *DayPlanHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateDayPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateDayPlanInput{
		TenantID:           tenantID,
		Code:               *req.Code,
		Name:               *req.Name,
		PlanType:           model.PlanType(*req.PlanType),
		RegularHours:       int(*req.RegularHours),
		ToleranceComePlus:  int(req.ToleranceComePlus),
		ToleranceComeMinus: int(req.ToleranceComeMinus),
		ToleranceGoPlus:    int(req.ToleranceGoPlus),
		ToleranceGoMinus:   int(req.ToleranceGoMinus),
	}

	// Handle optional fields
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.ComeFrom != 0 {
		v := int(req.ComeFrom)
		input.ComeFrom = &v
	}
	if req.ComeTo != 0 {
		v := int(req.ComeTo)
		input.ComeTo = &v
	}
	if req.GoFrom != 0 {
		v := int(req.GoFrom)
		input.GoFrom = &v
	}
	if req.GoTo != 0 {
		v := int(req.GoTo)
		input.GoTo = &v
	}
	if req.CoreStart != 0 {
		v := int(req.CoreStart)
		input.CoreStart = &v
	}
	if req.CoreEnd != 0 {
		v := int(req.CoreEnd)
		input.CoreEnd = &v
	}
	if req.RoundingComeType != "" {
		rt := model.RoundingType(req.RoundingComeType)
		input.RoundingComeType = &rt
	}
	if req.RoundingComeInterval != 0 {
		v := int(req.RoundingComeInterval)
		input.RoundingComeInterval = &v
	}
	if req.RoundingGoType != "" {
		rt := model.RoundingType(req.RoundingGoType)
		input.RoundingGoType = &rt
	}
	if req.RoundingGoInterval != 0 {
		v := int(req.RoundingGoInterval)
		input.RoundingGoInterval = &v
	}
	if req.MinWorkTime != 0 {
		v := int(req.MinWorkTime)
		input.MinWorkTime = &v
	}
	if req.MaxNetWorkTime != 0 {
		v := int(req.MaxNetWorkTime)
		input.MaxNetWorkTime = &v
	}
	if req.NetAccountID.String() != "" && req.NetAccountID.String() != "00000000-0000-0000-0000-000000000000" {
		id, err := uuid.Parse(req.NetAccountID.String())
		if err == nil {
			input.NetAccountID = &id
		}
	}
	if req.CapAccountID.String() != "" && req.CapAccountID.String() != "00000000-0000-0000-0000-000000000000" {
		id, err := uuid.Parse(req.CapAccountID.String())
		if err == nil {
			input.CapAccountID = &id
		}
	}

	plan, err := h.dayPlanService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrDayPlanCodeRequired:
			respondError(w, http.StatusBadRequest, "Day plan code is required")
		case service.ErrDayPlanCodeReserved:
			respondError(w, http.StatusBadRequest, "Day plan code is reserved")
		case service.ErrDayPlanNameRequired:
			respondError(w, http.StatusBadRequest, "Day plan name is required")
		case service.ErrDayPlanCodeExists:
			respondError(w, http.StatusConflict, "A day plan with this code already exists")
		case service.ErrInvalidTimeRange:
			respondError(w, http.StatusBadRequest, "Invalid time range")
		case service.ErrInvalidRegularHours:
			respondError(w, http.StatusBadRequest, "Regular hours must be positive")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create day plan")
		}
		return
	}

	respondJSON(w, http.StatusCreated, plan)
}

func (h *DayPlanHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid day plan ID")
		return
	}

	var req models.UpdateDayPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert to service input - only set fields that were provided
	input := service.UpdateDayPlanInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.PlanType != "" {
		pt := model.PlanType(req.PlanType)
		input.PlanType = &pt
	}
	if req.ComeFrom != 0 {
		v := int(req.ComeFrom)
		input.ComeFrom = &v
	}
	if req.ComeTo != 0 {
		v := int(req.ComeTo)
		input.ComeTo = &v
	}
	if req.GoFrom != 0 {
		v := int(req.GoFrom)
		input.GoFrom = &v
	}
	if req.GoTo != 0 {
		v := int(req.GoTo)
		input.GoTo = &v
	}
	if req.CoreStart != 0 {
		v := int(req.CoreStart)
		input.CoreStart = &v
	}
	if req.CoreEnd != 0 {
		v := int(req.CoreEnd)
		input.CoreEnd = &v
	}
	if req.RegularHours != 0 {
		v := int(req.RegularHours)
		input.RegularHours = &v
	}
	if req.ToleranceComePlus != 0 {
		v := int(req.ToleranceComePlus)
		input.ToleranceComePlus = &v
	}
	if req.ToleranceComeMinus != 0 {
		v := int(req.ToleranceComeMinus)
		input.ToleranceComeMinus = &v
	}
	if req.ToleranceGoPlus != 0 {
		v := int(req.ToleranceGoPlus)
		input.ToleranceGoPlus = &v
	}
	if req.ToleranceGoMinus != 0 {
		v := int(req.ToleranceGoMinus)
		input.ToleranceGoMinus = &v
	}
	if req.RoundingComeType != "" {
		rt := model.RoundingType(req.RoundingComeType)
		input.RoundingComeType = &rt
	}
	if req.RoundingComeInterval != 0 {
		v := int(req.RoundingComeInterval)
		input.RoundingComeInterval = &v
	}
	if req.RoundingGoType != "" {
		rt := model.RoundingType(req.RoundingGoType)
		input.RoundingGoType = &rt
	}
	if req.RoundingGoInterval != 0 {
		v := int(req.RoundingGoInterval)
		input.RoundingGoInterval = &v
	}
	if req.MinWorkTime != 0 {
		v := int(req.MinWorkTime)
		input.MinWorkTime = &v
	}
	if req.MaxNetWorkTime != 0 {
		v := int(req.MaxNetWorkTime)
		input.MaxNetWorkTime = &v
	}
	if req.NetAccountID.String() != "" && req.NetAccountID.String() != "00000000-0000-0000-0000-000000000000" {
		id, err := uuid.Parse(req.NetAccountID.String())
		if err == nil {
			input.NetAccountID = &id
			input.SetNetAccountID = true
		}
	}
	if req.CapAccountID.String() != "" && req.CapAccountID.String() != "00000000-0000-0000-0000-000000000000" {
		id, err := uuid.Parse(req.CapAccountID.String())
		if err == nil {
			input.CapAccountID = &id
			input.SetCapAccountID = true
		}
	}
	// IsActive needs special handling - we always pass it since it's a boolean
	input.IsActive = &req.IsActive

	plan, err := h.dayPlanService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrDayPlanNotFound:
			respondError(w, http.StatusNotFound, "Day plan not found")
		case service.ErrDayPlanNameRequired:
			respondError(w, http.StatusBadRequest, "Day plan name cannot be empty")
		case service.ErrInvalidTimeRange:
			respondError(w, http.StatusBadRequest, "Invalid time range")
		case service.ErrInvalidRegularHours:
			respondError(w, http.StatusBadRequest, "Regular hours must be positive")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update day plan")
		}
		return
	}

	respondJSON(w, http.StatusOK, plan)
}

func (h *DayPlanHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid day plan ID")
		return
	}

	if err := h.dayPlanService.Delete(r.Context(), id); err != nil {
		switch err {
		case service.ErrDayPlanNotFound:
			respondError(w, http.StatusNotFound, "Day plan not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete day plan")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *DayPlanHandler) Copy(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid day plan ID")
		return
	}

	var req models.CopyDayPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	plan, err := h.dayPlanService.Copy(r.Context(), id, *req.NewCode, *req.NewName)
	if err != nil {
		switch err {
		case service.ErrDayPlanNotFound:
			respondError(w, http.StatusNotFound, "Day plan not found")
		case service.ErrDayPlanCodeRequired:
			respondError(w, http.StatusBadRequest, "New code is required")
		case service.ErrDayPlanCodeReserved:
			respondError(w, http.StatusBadRequest, "Day plan code is reserved")
		case service.ErrDayPlanNameRequired:
			respondError(w, http.StatusBadRequest, "New name is required")
		case service.ErrDayPlanCodeExists:
			respondError(w, http.StatusConflict, "A day plan with the new code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to copy day plan")
		}
		return
	}

	respondJSON(w, http.StatusCreated, plan)
}

func (h *DayPlanHandler) AddBreak(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	planID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid day plan ID")
		return
	}

	var req models.CreateDayPlanBreakRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateBreakInput{
		BreakType: model.BreakType(*req.BreakType),
		Duration:  int(*req.Duration),
	}

	// Handle optional fields
	if req.StartTime != 0 {
		v := int(req.StartTime)
		input.StartTime = &v
	}
	if req.EndTime != 0 {
		v := int(req.EndTime)
		input.EndTime = &v
	}
	if req.AfterWorkMinutes != 0 {
		v := int(req.AfterWorkMinutes)
		input.AfterWorkMinutes = &v
	}
	// Handle boolean defaults
	if req.AutoDeduct != nil {
		input.AutoDeduct = *req.AutoDeduct
	} else {
		input.AutoDeduct = true // Default from spec
	}
	if req.IsPaid != nil {
		input.IsPaid = *req.IsPaid
	}
	if req.MinutesDifference != nil {
		input.MinutesDifference = *req.MinutesDifference
	}

	b, err := h.dayPlanService.AddBreak(r.Context(), planID, input)
	if err != nil {
		switch err {
		case service.ErrDayPlanNotFound:
			respondError(w, http.StatusNotFound, "Day plan not found")
		case service.ErrInvalidBreakConfig:
			respondError(w, http.StatusBadRequest, "Invalid break configuration")
		case service.ErrInvalidTimeRange:
			respondError(w, http.StatusBadRequest, "Invalid time range for break")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to add break")
		}
		return
	}

	respondJSON(w, http.StatusCreated, b)
}

func (h *DayPlanHandler) DeleteBreak(w http.ResponseWriter, r *http.Request) {
	breakIDStr := chi.URLParam(r, "breakId")
	breakID, err := uuid.Parse(breakIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid break ID")
		return
	}

	if err := h.dayPlanService.DeleteBreak(r.Context(), breakID); err != nil {
		switch err {
		case service.ErrDayPlanBreakNotFound:
			respondError(w, http.StatusNotFound, "Break not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete break")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *DayPlanHandler) AddBonus(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	planID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid day plan ID")
		return
	}

	var req models.CreateDayPlanBonusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	accountID, err := uuid.Parse(req.AccountID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account ID")
		return
	}

	input := service.CreateBonusInput{
		AccountID:       accountID,
		TimeFrom:        int(*req.TimeFrom),
		TimeTo:          int(*req.TimeTo),
		CalculationType: model.CalculationType(*req.CalculationType),
		ValueMinutes:    int(*req.ValueMinutes),
	}

	// Handle optional fields
	if req.MinWorkMinutes != 0 {
		v := int(req.MinWorkMinutes)
		input.MinWorkMinutes = &v
	}
	if req.AppliesOnHoliday != nil {
		input.AppliesOnHoliday = *req.AppliesOnHoliday
	}

	b, err := h.dayPlanService.AddBonus(r.Context(), planID, input)
	if err != nil {
		switch err {
		case service.ErrDayPlanNotFound:
			respondError(w, http.StatusNotFound, "Day plan not found")
		case service.ErrInvalidTimeRange:
			respondError(w, http.StatusBadRequest, "Invalid time range for bonus")
		case service.ErrInvalidBreakConfig:
			respondError(w, http.StatusBadRequest, "Invalid bonus configuration")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to add bonus")
		}
		return
	}

	respondJSON(w, http.StatusCreated, b)
}

func (h *DayPlanHandler) DeleteBonus(w http.ResponseWriter, r *http.Request) {
	bonusIDStr := chi.URLParam(r, "bonusId")
	bonusID, err := uuid.Parse(bonusIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid bonus ID")
		return
	}

	if err := h.dayPlanService.DeleteBonus(r.Context(), bonusID); err != nil {
		switch err {
		case service.ErrDayPlanBonusNotFound:
			respondError(w, http.StatusNotFound, "Bonus not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete bonus")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
