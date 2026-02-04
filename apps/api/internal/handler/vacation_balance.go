package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

// VacationBalanceHandler handles vacation balance CRUD requests.
type VacationBalanceHandler struct {
	balanceService  *service.VacationBalanceService
	vacationService *service.VacationService
	employeeService *service.EmployeeService
}

// NewVacationBalanceHandler creates a new VacationBalanceHandler.
func NewVacationBalanceHandler(
	balanceService *service.VacationBalanceService,
	vacationService *service.VacationService,
	employeeService *service.EmployeeService,
) *VacationBalanceHandler {
	return &VacationBalanceHandler{
		balanceService:  balanceService,
		vacationService: vacationService,
		employeeService: employeeService,
	}
}

// List handles GET /vacation-balances
func (h *VacationBalanceHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filter := repository.VacationBalanceFilter{
		TenantID: tenantID,
	}

	if empIDStr := r.URL.Query().Get("employee_id"); empIDStr != "" {
		empID, err := uuid.Parse(empIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		filter.EmployeeID = &empID
	}

	if yearStr := r.URL.Query().Get("year"); yearStr != "" {
		year, err := strconv.Atoi(yearStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid year")
			return
		}
		filter.Year = &year
	}

	if deptIDStr := r.URL.Query().Get("department_id"); deptIDStr != "" {
		deptID, err := uuid.Parse(deptIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid department_id")
			return
		}
		filter.DepartmentID = &deptID
	}

	balances, err := h.balanceService.List(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list vacation balances")
		return
	}

	data := make([]*models.VacationBalance, 0, len(balances))
	for i := range balances {
		data = append(data, h.balanceToResponse(&balances[i]))
	}

	respondJSON(w, http.StatusOK, &models.VacationBalanceList{Data: data})
}

// Get handles GET /vacation-balances/{id}
func (h *VacationBalanceHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vacation balance ID")
		return
	}

	vb, err := h.balanceService.GetByID(r.Context(), id)
	if err != nil {
		if err == service.ErrVacationBalanceNotFound {
			respondError(w, http.StatusNotFound, "Vacation balance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get vacation balance")
		return
	}

	respondJSON(w, http.StatusOK, h.balanceToResponse(vb))
}

// Create handles POST /vacation-balances
func (h *VacationBalanceHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateVacationBalanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	employeeID, err := uuid.Parse(req.EmployeeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee_id")
		return
	}

	entitlement := decimal.NewFromFloat(*req.BaseEntitlement)
	entitlement = entitlement.Add(decimal.NewFromFloat(req.AdditionalEntitlement))

	input := service.CreateVacationBalanceInput{
		TenantID:    tenantID,
		EmployeeID:  employeeID,
		Year:        int(*req.Year),
		Entitlement: entitlement,
		Carryover:   decimal.NewFromFloat(req.CarryoverFromPrevious),
		Adjustments: decimal.NewFromFloat(req.ManualAdjustment),
	}

	if !time.Time(req.CarryoverExpiresAt).IsZero() {
		t := time.Time(req.CarryoverExpiresAt)
		input.CarryoverExpiresAt = &t
	}

	vb, err := h.balanceService.Create(r.Context(), input)
	if err != nil {
		if err == service.ErrVacationBalanceAlreadyExists {
			respondError(w, http.StatusConflict, "Vacation balance already exists for this employee and year")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to create vacation balance")
		return
	}

	respondJSON(w, http.StatusCreated, h.balanceToResponse(vb))
}

// Update handles PATCH /vacation-balances/{id}
func (h *VacationBalanceHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vacation balance ID")
		return
	}

	var req models.UpdateVacationBalanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	entitlement := decimal.NewFromFloat(req.BaseEntitlement).Add(decimal.NewFromFloat(req.AdditionalEntitlement))
	carryover := decimal.NewFromFloat(req.CarryoverFromPrevious)
	adjustment := decimal.NewFromFloat(req.ManualAdjustment)

	input := service.UpdateVacationBalanceInput{
		Entitlement: &entitlement,
		Carryover:   &carryover,
		Adjustments: &adjustment,
	}
	if !time.Time(req.CarryoverExpiresAt).IsZero() {
		t := time.Time(req.CarryoverExpiresAt)
		input.CarryoverExpiresAt = &t
	}

	vb, err := h.balanceService.Update(r.Context(), id, input)
	if err != nil {
		if err == service.ErrVacationBalanceNotFound {
			respondError(w, http.StatusNotFound, "Vacation balance not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to update vacation balance")
		return
	}

	respondJSON(w, http.StatusOK, h.balanceToResponse(vb))
}

// Initialize handles POST /vacation-balances/initialize
func (h *VacationBalanceHandler) Initialize(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req struct {
		Year      *int  `json:"year"`
		Carryover *bool `json:"carryover"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Year == nil {
		respondError(w, http.StatusBadRequest, "year is required")
		return
	}

	carryover := true
	if req.Carryover != nil {
		carryover = *req.Carryover
	}

	// Get all active employees for tenant
	isActive := true
	employees, _, err := h.employeeService.List(r.Context(), repository.EmployeeFilter{
		TenantID: tenantID,
		IsActive: &isActive,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list employees")
		return
	}

	createdCount := 0
	for _, emp := range employees {
		if carryover {
			_ = h.vacationService.CarryoverFromPreviousYear(r.Context(), emp.ID, *req.Year)
		}
		_, err := h.vacationService.InitializeYear(r.Context(), emp.ID, *req.Year)
		if err == nil {
			createdCount++
		}
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"message":       "Vacation balances initialized",
		"created_count": createdCount,
	})
}

// balanceToResponse converts internal VacationBalance to API response model.
func (h *VacationBalanceHandler) balanceToResponse(vb *model.VacationBalance) *models.VacationBalance {
	id := strfmt.UUID(vb.ID.String())
	tenantID := strfmt.UUID(vb.TenantID.String())
	employeeID := strfmt.UUID(vb.EmployeeID.String())
	year := int64(vb.Year)

	resp := &models.VacationBalance{
		ID:                    &id,
		TenantID:              &tenantID,
		EmployeeID:            &employeeID,
		Year:                  &year,
		BaseEntitlement:       vb.Entitlement.InexactFloat64(),
		CarryoverFromPrevious: vb.Carryover.InexactFloat64(),
		ManualAdjustment:      vb.Adjustments.InexactFloat64(),
		UsedDays:              vb.Taken.InexactFloat64(),
		TotalEntitlement:      vb.Total().InexactFloat64(),
		RemainingDays:         vb.Available().InexactFloat64(),
		CreatedAt:             strfmt.DateTime(vb.CreatedAt),
		UpdatedAt:             strfmt.DateTime(vb.UpdatedAt),
	}

	if vb.CarryoverExpiresAt != nil {
		d := strfmt.Date(*vb.CarryoverExpiresAt)
		resp.CarryoverExpiresAt = &d
	}

	if vb.Employee != nil {
		empID := strfmt.UUID(vb.Employee.ID.String())
		fn := vb.Employee.FirstName
		ln := vb.Employee.LastName
		pn := vb.Employee.PersonnelNumber
		resp.Employee.ID = &empID
		resp.Employee.FirstName = &fn
		resp.Employee.LastName = &ln
		resp.Employee.PersonnelNumber = &pn
		resp.Employee.IsActive = vb.Employee.IsActive
		if vb.Employee.DepartmentID != nil {
			depID := strfmt.UUID(vb.Employee.DepartmentID.String())
			resp.Employee.DepartmentID = &depID
		}
	}

	return resp
}
