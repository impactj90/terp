package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/service"
)

type HolidayHandler struct {
	holidayService *service.HolidayService
}

func NewHolidayHandler(holidayService *service.HolidayService) *HolidayHandler {
	return &HolidayHandler{holidayService: holidayService}
}

func (h *HolidayHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var departmentID *uuid.UUID
	if departmentStr := r.URL.Query().Get("department_id"); departmentStr != "" {
		parsed, err := uuid.Parse(departmentStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid department_id parameter")
			return
		}
		departmentID = &parsed
	}

	// Check for year filter
	if yearStr := r.URL.Query().Get("year"); yearStr != "" {
		year, err := strconv.Atoi(yearStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid year parameter")
			return
		}
		holidays, err := h.holidayService.ListByYear(r.Context(), tenantID, year, departmentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list holidays")
			return
		}
		respondJSON(w, http.StatusOK, holidays)
		return
	}

	// Check for date range filter
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	if fromStr != "" && toStr != "" {
		from, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date format (use YYYY-MM-DD)")
			return
		}
		to, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date format (use YYYY-MM-DD)")
			return
		}
		holidays, err := h.holidayService.ListByDateRange(r.Context(), tenantID, from, to, departmentID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list holidays")
			return
		}
		respondJSON(w, http.StatusOK, holidays)
		return
	}

	// Default: list current year
	holidays, err := h.holidayService.ListByYear(r.Context(), tenantID, time.Now().Year(), departmentID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list holidays")
		return
	}
	respondJSON(w, http.StatusOK, holidays)
}

func (h *HolidayHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid holiday ID")
		return
	}

	holiday, err := h.holidayService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Holiday not found")
		return
	}

	respondJSON(w, http.StatusOK, holiday)
}

func (h *HolidayHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateHolidayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert strfmt.Date to time.Time
	holidayDate := time.Time(*req.HolidayDate)

	appliesToAll := true
	if req.AppliesToAll != nil {
		appliesToAll = *req.AppliesToAll
	}

	category := 0
	if req.Category != nil {
		category = int(*req.Category)
	}

	// Convert department ID if provided
	var departmentID *uuid.UUID
	if req.DepartmentID != "" {
		parsed, err := uuid.Parse(req.DepartmentID.String())
		if err == nil {
			departmentID = &parsed
		}
	}

	input := service.CreateHolidayInput{
		TenantID:     tenantID,
		HolidayDate:  holidayDate,
		Name:         *req.Name,
		Category:     category,
		AppliesToAll: appliesToAll,
		DepartmentID: departmentID,
	}

	holiday, err := h.holidayService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrHolidayNameRequired:
			respondError(w, http.StatusBadRequest, "Holiday name is required")
		case service.ErrHolidayDateRequired:
			respondError(w, http.StatusBadRequest, "Holiday date is required")
		case service.ErrHolidayCategoryInvalid:
			respondError(w, http.StatusBadRequest, "Holiday category must be 1, 2, or 3")
		case service.ErrHolidayAlreadyExists:
			respondError(w, http.StatusBadRequest, "A holiday already exists on this date")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create holiday")
		}
		return
	}

	respondJSON(w, http.StatusCreated, holiday)
}

func (h *HolidayHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid holiday ID")
		return
	}

	var req models.UpdateHolidayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateHolidayInput{}

	if req.Name != "" {
		input.Name = &req.Name
	}

	if req.Category != 0 {
		category := int(req.Category)
		input.Category = &category
	}

	// Note: Bool fields cannot be reliably detected as "provided" vs "default false"
	input.AppliesToAll = &req.AppliesToAll

	// Convert department ID if provided
	if req.DepartmentID != "" {
		parsed, err := uuid.Parse(req.DepartmentID.String())
		if err == nil {
			input.DepartmentID = &parsed
		}
	}

	// Convert holiday date if provided
	if req.HolidayDate.String() != "" && req.HolidayDate.String() != "0001-01-01" {
		holidayDate := time.Time(req.HolidayDate)
		input.HolidayDate = &holidayDate
	}

	holiday, err := h.holidayService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrHolidayNotFound:
			respondError(w, http.StatusNotFound, "Holiday not found")
		case service.ErrHolidayNameRequired:
			respondError(w, http.StatusBadRequest, "Holiday name cannot be empty")
		case service.ErrHolidayCategoryInvalid:
			respondError(w, http.StatusBadRequest, "Holiday category must be 1, 2, or 3")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update holiday")
		}
		return
	}

	respondJSON(w, http.StatusOK, holiday)
}

func (h *HolidayHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid holiday ID")
		return
	}

	if err := h.holidayService.Delete(r.Context(), id); err != nil {
		if err == service.ErrHolidayNotFound {
			respondError(w, http.StatusNotFound, "Holiday not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to delete holiday")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *HolidayHandler) Generate(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.GenerateHolidaysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.GenerateHolidayInput{
		TenantID:     tenantID,
		Year:         int(*req.Year),
		State:        *req.State,
		SkipExisting: true,
	}
	if req.SkipExisting != nil {
		input.SkipExisting = *req.SkipExisting
	}

	holidays, err := h.holidayService.GenerateForYearState(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrHolidayYearInvalid:
			respondError(w, http.StatusBadRequest, "Invalid year")
		case service.ErrHolidayStateInvalid:
			respondError(w, http.StatusBadRequest, "Invalid state")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to generate holidays")
		}
		return
	}

	respondJSON(w, http.StatusCreated, holidays)
}

func (h *HolidayHandler) Copy(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CopyHolidaysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	overrides := make([]service.HolidayCategoryOverride, 0, len(req.CategoryOverrides))
	for _, override := range req.CategoryOverrides {
		if override == nil {
			continue
		}
		if override.Month == nil || override.Day == nil || override.Category == nil {
			continue
		}
		overrides = append(overrides, service.HolidayCategoryOverride{
			Month:    int(*override.Month),
			Day:      int(*override.Day),
			Category: int(*override.Category),
		})
	}

	input := service.CopyHolidayInput{
		TenantID:          tenantID,
		SourceYear:        int(*req.SourceYear),
		TargetYear:        int(*req.TargetYear),
		CategoryOverrides: overrides,
		SkipExisting:      true,
	}
	if req.SkipExisting != nil {
		input.SkipExisting = *req.SkipExisting
	}

	holidays, err := h.holidayService.CopyFromYear(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrHolidayYearInvalid:
			respondError(w, http.StatusBadRequest, "Invalid year")
		case service.ErrHolidayCopySameYear:
			respondError(w, http.StatusBadRequest, "Source and target year must differ")
		case service.ErrHolidayNoSourceYear:
			respondError(w, http.StatusNotFound, "No holidays found for source year")
		case service.ErrHolidayOverrideInvalid:
			respondError(w, http.StatusBadRequest, "Invalid category override")
		case service.ErrHolidayCategoryInvalid:
			respondError(w, http.StatusBadRequest, "Holiday category must be 1, 2, or 3")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to copy holidays")
		}
		return
	}

	respondJSON(w, http.StatusCreated, holidays)
}
