package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// createTariffBreakRequest is a local struct matching the inline OpenAPI schema
type createTariffBreakRequest struct {
	BreakType        string `json:"break_type"`
	AfterWorkMinutes int    `json:"after_work_minutes,omitempty"`
	Duration         int    `json:"duration"`
	IsPaid           bool   `json:"is_paid"`
}

type TariffHandler struct {
	tariffService *service.TariffService
}

func NewTariffHandler(tariffService *service.TariffService) *TariffHandler {
	return &TariffHandler{tariffService: tariffService}
}

func (h *TariffHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for active filter
	activeOnly := r.URL.Query().Get("active") == "true"

	var tariffs []any
	var err error

	if activeOnly {
		result, e := h.tariffService.ListActive(r.Context(), tenantID)
		err = e
		for _, t := range result {
			tariffs = append(tariffs, t)
		}
	} else {
		result, e := h.tariffService.List(r.Context(), tenantID)
		err = e
		for _, t := range result {
			tariffs = append(tariffs, t)
		}
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list tariffs")
		return
	}

	// Handle nil slice for consistent JSON output
	if tariffs == nil {
		tariffs = []any{}
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": tariffs})
}

func (h *TariffHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tariff ID")
		return
	}

	tariff, err := h.tariffService.GetDetails(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Tariff not found")
		return
	}

	respondJSON(w, http.StatusOK, tariff)
}

func (h *TariffHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateTariffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateTariffInput{
		TenantID: tenantID,
		Code:     *req.Code,
		Name:     *req.Name,
	}

	// Handle optional fields
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.WeekPlanID != "" {
		id := uuid.MustParse(req.WeekPlanID.String())
		input.WeekPlanID = &id
	}
	if !time.Time(req.ValidFrom).IsZero() {
		t := time.Time(req.ValidFrom)
		input.ValidFrom = &t
	}
	if !time.Time(req.ValidTo).IsZero() {
		t := time.Time(req.ValidTo)
		input.ValidTo = &t
	}

	// ZMI Vacation Fields
	if req.AnnualVacationDays != 0 {
		d := decimal.NewFromFloat(req.AnnualVacationDays)
		input.AnnualVacationDays = &d
	}
	if req.WorkDaysPerWeek != 0 {
		days := int(req.WorkDaysPerWeek)
		input.WorkDaysPerWeek = &days
	}
	if req.VacationBasis != "" {
		input.VacationBasis = model.VacationBasis(req.VacationBasis)
	}

	// ZMI Target Hours Fields
	if req.DailyTargetHours != 0 {
		d := decimal.NewFromFloat(req.DailyTargetHours)
		input.DailyTargetHours = &d
	}
	if req.WeeklyTargetHours != 0 {
		d := decimal.NewFromFloat(req.WeeklyTargetHours)
		input.WeeklyTargetHours = &d
	}
	if req.MonthlyTargetHours != 0 {
		d := decimal.NewFromFloat(req.MonthlyTargetHours)
		input.MonthlyTargetHours = &d
	}
	if req.AnnualTargetHours != 0 {
		d := decimal.NewFromFloat(req.AnnualTargetHours)
		input.AnnualTargetHours = &d
	}

	// ZMI Flextime Fields
	if req.MaxFlextimePerMonth != 0 {
		val := int(req.MaxFlextimePerMonth)
		input.MaxFlextimePerMonth = &val
	}
	if req.UpperLimitAnnual != 0 {
		val := int(req.UpperLimitAnnual)
		input.UpperLimitAnnual = &val
	}
	if req.LowerLimitAnnual != 0 {
		val := int(req.LowerLimitAnnual)
		input.LowerLimitAnnual = &val
	}
	if req.FlextimeThreshold != 0 {
		val := int(req.FlextimeThreshold)
		input.FlextimeThreshold = &val
	}
	if req.CreditType != "" {
		input.CreditType = model.CreditType(req.CreditType)
	}

	// ZMI Rhythm Fields
	if req.RhythmType != "" {
		input.RhythmType = model.RhythmType(req.RhythmType)
	}
	if req.CycleDays != 0 {
		cycleDays := int(req.CycleDays)
		input.CycleDays = &cycleDays
	}
	if !time.Time(req.RhythmStartDate).IsZero() {
		t := time.Time(req.RhythmStartDate)
		input.RhythmStartDate = &t
	}
	if len(req.WeekPlanIds) > 0 {
		input.WeekPlanIDs = make([]uuid.UUID, len(req.WeekPlanIds))
		for i, wpID := range req.WeekPlanIds {
			input.WeekPlanIDs[i] = uuid.MustParse(wpID.String())
		}
	}
	if len(req.DayPlans) > 0 {
		input.DayPlans = make([]service.TariffDayPlanInput, len(req.DayPlans))
		for i, dp := range req.DayPlans {
			input.DayPlans[i] = service.TariffDayPlanInput{
				DayPosition: int(*dp.DayPosition),
			}
			if dp.DayPlanID != nil && *dp.DayPlanID != "" {
				id := uuid.MustParse(dp.DayPlanID.String())
				input.DayPlans[i].DayPlanID = &id
			}
		}
	}

	tariff, err := h.tariffService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrTariffCodeReq:
			respondError(w, http.StatusBadRequest, "Tariff code is required")
		case service.ErrTariffNameReq:
			respondError(w, http.StatusBadRequest, "Tariff name is required")
		case service.ErrTariffCodeExists:
			respondError(w, http.StatusConflict, "A tariff with this code already exists")
		case service.ErrInvalidWeekPlan:
			respondError(w, http.StatusBadRequest, "Invalid week plan reference")
		case service.ErrInvalidVacationBasis:
			respondError(w, http.StatusBadRequest, "Invalid vacation basis")
		case service.ErrInvalidCreditType:
			respondError(w, http.StatusBadRequest, "Invalid credit type")
		case service.ErrInvalidWorkDays:
			respondError(w, http.StatusBadRequest, "Work days per week must be between 1 and 7")
		case service.ErrInvalidRhythmType:
			respondError(w, http.StatusBadRequest, "Invalid rhythm type")
		case service.ErrInvalidCycleDays:
			respondError(w, http.StatusBadRequest, "Cycle days must be between 1 and 365")
		case service.ErrCycleDaysRequired:
			respondError(w, http.StatusBadRequest, "cycle_days is required for x_days rhythm")
		case service.ErrWeekPlansRequired:
			respondError(w, http.StatusBadRequest, "week_plan_ids are required for rolling_weekly rhythm")
		case service.ErrInvalidDayPlan:
			respondError(w, http.StatusBadRequest, "Invalid day plan reference")
		case service.ErrInvalidDayPosition:
			respondError(w, http.StatusBadRequest, "Day position must be between 1 and cycle_days")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create tariff")
		}
		return
	}

	respondJSON(w, http.StatusCreated, tariff)
}

func (h *TariffHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tariff ID")
		return
	}

	var req models.UpdateTariffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert to service input - only set fields that were provided
	input := service.UpdateTariffInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.WeekPlanID != "" {
		weekPlanID := uuid.MustParse(req.WeekPlanID.String())
		input.WeekPlanID = &weekPlanID
	}
	if !time.Time(req.ValidFrom).IsZero() {
		t := time.Time(req.ValidFrom)
		input.ValidFrom = &t
	}
	if !time.Time(req.ValidTo).IsZero() {
		t := time.Time(req.ValidTo)
		input.ValidTo = &t
	}
	// IsActive needs special handling - we always pass it since it's a boolean
	input.IsActive = &req.IsActive

	// ZMI Vacation Fields
	if req.AnnualVacationDays != nil {
		d := decimal.NewFromFloat(*req.AnnualVacationDays)
		input.AnnualVacationDays = &d
	}
	if req.WorkDaysPerWeek != nil {
		days := int(*req.WorkDaysPerWeek)
		input.WorkDaysPerWeek = &days
	}
	if req.VacationBasis != "" {
		vb := model.VacationBasis(req.VacationBasis)
		input.VacationBasis = &vb
	}

	// ZMI Target Hours Fields
	if req.DailyTargetHours != nil {
		d := decimal.NewFromFloat(*req.DailyTargetHours)
		input.DailyTargetHours = &d
	}
	if req.WeeklyTargetHours != nil {
		d := decimal.NewFromFloat(*req.WeeklyTargetHours)
		input.WeeklyTargetHours = &d
	}
	if req.MonthlyTargetHours != nil {
		d := decimal.NewFromFloat(*req.MonthlyTargetHours)
		input.MonthlyTargetHours = &d
	}
	if req.AnnualTargetHours != nil {
		d := decimal.NewFromFloat(*req.AnnualTargetHours)
		input.AnnualTargetHours = &d
	}

	// ZMI Flextime Fields
	if req.MaxFlextimePerMonth != nil {
		val := int(*req.MaxFlextimePerMonth)
		input.MaxFlextimePerMonth = &val
	}
	if req.UpperLimitAnnual != nil {
		val := int(*req.UpperLimitAnnual)
		input.UpperLimitAnnual = &val
	}
	if req.LowerLimitAnnual != nil {
		val := int(*req.LowerLimitAnnual)
		input.LowerLimitAnnual = &val
	}
	if req.FlextimeThreshold != nil {
		val := int(*req.FlextimeThreshold)
		input.FlextimeThreshold = &val
	}
	if req.CreditType != "" {
		ct := model.CreditType(req.CreditType)
		input.CreditType = &ct
	}

	// ZMI Rhythm Fields
	if req.RhythmType != "" {
		rt := model.RhythmType(req.RhythmType)
		input.RhythmType = &rt
	}
	if req.CycleDays != nil {
		cycleDays := int(*req.CycleDays)
		input.CycleDays = &cycleDays
	}
	if req.RhythmStartDate != nil && !time.Time(*req.RhythmStartDate).IsZero() {
		t := time.Time(*req.RhythmStartDate)
		input.RhythmStartDate = &t
	}
	if len(req.WeekPlanIds) > 0 {
		input.WeekPlanIDs = make([]uuid.UUID, len(req.WeekPlanIds))
		for i, wpID := range req.WeekPlanIds {
			input.WeekPlanIDs[i] = uuid.MustParse(wpID.String())
		}
	}
	if len(req.DayPlans) > 0 {
		input.DayPlans = make([]service.TariffDayPlanInput, len(req.DayPlans))
		for i, dp := range req.DayPlans {
			input.DayPlans[i] = service.TariffDayPlanInput{
				DayPosition: int(*dp.DayPosition),
			}
			if dp.DayPlanID != nil && *dp.DayPlanID != "" {
				id := uuid.MustParse(dp.DayPlanID.String())
				input.DayPlans[i].DayPlanID = &id
			}
		}
	}

	tariff, err := h.tariffService.Update(r.Context(), id, tenantID, input)
	if err != nil {
		switch err {
		case service.ErrTariffNotFound:
			respondError(w, http.StatusNotFound, "Tariff not found")
		case service.ErrTariffNameReq:
			respondError(w, http.StatusBadRequest, "Tariff name cannot be empty")
		case service.ErrInvalidWeekPlan:
			respondError(w, http.StatusBadRequest, "Invalid week plan reference")
		case service.ErrInvalidVacationBasis:
			respondError(w, http.StatusBadRequest, "Invalid vacation basis")
		case service.ErrInvalidCreditType:
			respondError(w, http.StatusBadRequest, "Invalid credit type")
		case service.ErrInvalidWorkDays:
			respondError(w, http.StatusBadRequest, "Work days per week must be between 1 and 7")
		case service.ErrInvalidRhythmType:
			respondError(w, http.StatusBadRequest, "Invalid rhythm type")
		case service.ErrInvalidCycleDays:
			respondError(w, http.StatusBadRequest, "Cycle days must be between 1 and 365")
		case service.ErrInvalidDayPlan:
			respondError(w, http.StatusBadRequest, "Invalid day plan reference")
		case service.ErrInvalidDayPosition:
			respondError(w, http.StatusBadRequest, "Day position must be between 1 and cycle_days")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update tariff")
		}
		return
	}

	respondJSON(w, http.StatusOK, tariff)
}

func (h *TariffHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tariff ID")
		return
	}

	if err := h.tariffService.Delete(r.Context(), id); err != nil {
		switch err {
		case service.ErrTariffNotFound:
			respondError(w, http.StatusNotFound, "Tariff not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete tariff")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *TariffHandler) CreateBreak(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	tariffID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tariff ID")
		return
	}

	var req createTariffBreakRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.BreakType == "" {
		respondError(w, http.StatusBadRequest, "break_type is required")
		return
	}
	if req.Duration <= 0 {
		respondError(w, http.StatusBadRequest, "duration is required and must be positive")
		return
	}

	input := service.CreateTariffBreakInput{
		TariffID:  tariffID,
		BreakType: req.BreakType,
		Duration:  req.Duration,
		IsPaid:    req.IsPaid,
	}

	if req.AfterWorkMinutes != 0 {
		afterWork := req.AfterWorkMinutes
		input.AfterWorkMinutes = &afterWork
	}

	tariffBreak, err := h.tariffService.CreateBreak(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrTariffNotFound:
			respondError(w, http.StatusNotFound, "Tariff not found")
		case service.ErrInvalidBreakType:
			respondError(w, http.StatusBadRequest, "Invalid break type")
		case service.ErrBreakDurationReq:
			respondError(w, http.StatusBadRequest, "Break duration must be positive")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create tariff break")
		}
		return
	}

	respondJSON(w, http.StatusCreated, tariffBreak)
}

func (h *TariffHandler) DeleteBreak(w http.ResponseWriter, r *http.Request) {
	tariffIDStr := chi.URLParam(r, "id")
	tariffID, err := uuid.Parse(tariffIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tariff ID")
		return
	}

	breakIDStr := chi.URLParam(r, "breakId")
	breakID, err := uuid.Parse(breakIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid break ID")
		return
	}

	if err := h.tariffService.DeleteBreak(r.Context(), tariffID, breakID); err != nil {
		switch err {
		case service.ErrTariffNotFound:
			respondError(w, http.StatusNotFound, "Tariff not found")
		case service.ErrTariffBreakNotFound:
			respondError(w, http.StatusNotFound, "Tariff break not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete tariff break")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
