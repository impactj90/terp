package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/service"
)

type EmployeeDayPlanHandler struct {
	edpService *service.EmployeeDayPlanService
}

func NewEmployeeDayPlanHandler(edpService *service.EmployeeDayPlanService) *EmployeeDayPlanHandler {
	return &EmployeeDayPlanHandler{edpService: edpService}
}

func (h *EmployeeDayPlanHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	if fromStr == "" || toStr == "" {
		respondError(w, http.StatusBadRequest, "from and to query parameters are required")
		return
	}

	from, err := time.Parse("2006-01-02", fromStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid from date format (expected YYYY-MM-DD)")
		return
	}
	to, err := time.Parse("2006-01-02", toStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid to date format (expected YYYY-MM-DD)")
		return
	}

	input := service.ListEmployeeDayPlansInput{
		TenantID: tenantID,
		From:     from,
		To:       to,
	}

	if empStr := r.URL.Query().Get("employee_id"); empStr != "" {
		empID, err := uuid.Parse(empStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		input.EmployeeID = &empID
	}

	plans, err := h.edpService.List(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrEDPDateRangeReq:
			respondError(w, http.StatusBadRequest, "from and to dates are required")
		case service.ErrEDPDateRangeInvalid:
			respondError(w, http.StatusBadRequest, "from date must not be after to date")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to list employee day plans")
		}
		return
	}

	if plans == nil {
		respondJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": plans})
}

func (h *EmployeeDayPlanHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee day plan ID")
		return
	}

	plan, err := h.edpService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Employee day plan not found")
		return
	}

	respondJSON(w, http.StatusOK, plan)
}

func (h *EmployeeDayPlanHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateEmployeeDayPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateEmployeeDayPlanInput{
		TenantID:   tenantID,
		EmployeeID: uuid.MustParse(req.EmployeeID.String()),
		PlanDate:   time.Time(*req.PlanDate),
		Source:     string(req.Source),
		Notes:      req.Notes,
	}

	if req.DayPlanID.String() != "" && req.DayPlanID.String() != "00000000-0000-0000-0000-000000000000" {
		id := uuid.MustParse(req.DayPlanID.String())
		input.DayPlanID = &id
	}

	if req.ShiftID != nil && req.ShiftID.String() != "" && req.ShiftID.String() != "00000000-0000-0000-0000-000000000000" {
		id := uuid.MustParse(req.ShiftID.String())
		input.ShiftID = &id
	}

	plan, err := h.edpService.Create(r.Context(), input)
	if err != nil {
		handleEDPError(w, err, "Failed to create employee day plan")
		return
	}

	respondJSON(w, http.StatusCreated, plan)
}

func (h *EmployeeDayPlanHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee day plan ID")
		return
	}

	var req models.UpdateEmployeeDayPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateEmployeeDayPlanInput{}

	if req.DayPlanID.String() != "" && req.DayPlanID.String() != "00000000-0000-0000-0000-000000000000" {
		dpID := uuid.MustParse(req.DayPlanID.String())
		input.DayPlanID = &dpID
	}

	if req.ShiftID != nil && req.ShiftID.String() != "" && req.ShiftID.String() != "00000000-0000-0000-0000-000000000000" {
		shiftID := uuid.MustParse(req.ShiftID.String())
		input.ShiftID = &shiftID
	}

	if string(req.Source) != "" {
		src := string(req.Source)
		input.Source = &src
	}

	if req.Notes != "" {
		input.Notes = &req.Notes
	}

	plan, err := h.edpService.Update(r.Context(), id, tenantID, input)
	if err != nil {
		handleEDPError(w, err, "Failed to update employee day plan")
		return
	}

	respondJSON(w, http.StatusOK, plan)
}

func (h *EmployeeDayPlanHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee day plan ID")
		return
	}

	if err := h.edpService.Delete(r.Context(), id); err != nil {
		switch err {
		case service.ErrEmployeeDayPlanNotFound:
			respondError(w, http.StatusNotFound, "Employee day plan not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete employee day plan")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *EmployeeDayPlanHandler) BulkCreate(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.BulkCreateEmployeeDayPlanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	entries := make([]service.BulkCreateEntry, len(req.Plans))
	for i, p := range req.Plans {
		entries[i] = service.BulkCreateEntry{
			EmployeeID: uuid.MustParse(p.EmployeeID.String()),
			PlanDate:   time.Time(*p.PlanDate),
			Source:     string(p.Source),
			Notes:      p.Notes,
		}
		if p.DayPlanID.String() != "" && p.DayPlanID.String() != "00000000-0000-0000-0000-000000000000" {
			id := uuid.MustParse(p.DayPlanID.String())
			entries[i].DayPlanID = &id
		}
		if p.ShiftID != nil && p.ShiftID.String() != "" && p.ShiftID.String() != "00000000-0000-0000-0000-000000000000" {
			id := uuid.MustParse(p.ShiftID.String())
			entries[i].ShiftID = &id
		}
	}

	input := service.BulkCreateInput{
		TenantID: tenantID,
		Entries:  entries,
	}

	plans, err := h.edpService.BulkCreate(r.Context(), input)
	if err != nil {
		handleEDPError(w, err, "Failed to bulk create employee day plans")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"created": len(plans),
	})
}

func (h *EmployeeDayPlanHandler) DeleteRange(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.DeleteRangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.DeleteRangeInput{
		EmployeeID: uuid.MustParse(req.EmployeeID.String()),
		TenantID:   tenantID,
		From:       time.Time(*req.From),
		To:         time.Time(*req.To),
	}

	if err := h.edpService.DeleteRange(r.Context(), input); err != nil {
		handleEDPError(w, err, "Failed to delete employee day plans")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"deleted": true,
	})
}

func handleEDPError(w http.ResponseWriter, err error, defaultMsg string) {
	switch err {
	case service.ErrEmployeeDayPlanNotFound:
		respondError(w, http.StatusNotFound, "Employee day plan not found")
	case service.ErrEDPEmployeeReq:
		respondError(w, http.StatusBadRequest, "employee_id is required")
	case service.ErrEDPPlanDateReq:
		respondError(w, http.StatusBadRequest, "plan_date is required")
	case service.ErrEDPSourceReq:
		respondError(w, http.StatusBadRequest, "source is required")
	case service.ErrEDPInvalidSource:
		respondError(w, http.StatusBadRequest, "Invalid source (must be 'tariff', 'manual', or 'holiday')")
	case service.ErrEDPInvalidDayPlan:
		respondError(w, http.StatusBadRequest, "Invalid day plan reference")
	case service.ErrEDPInvalidEmployee:
		respondError(w, http.StatusBadRequest, "Invalid employee reference")
	case service.ErrEDPInvalidShift:
		respondError(w, http.StatusBadRequest, "Invalid shift reference")
	case service.ErrEDPDateRangeReq:
		respondError(w, http.StatusBadRequest, "from and to dates are required")
	case service.ErrEDPDateRangeInvalid:
		respondError(w, http.StatusBadRequest, "from date must not be after to date")
	default:
		respondError(w, http.StatusInternalServerError, defaultMsg)
	}
}
