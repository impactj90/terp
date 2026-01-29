package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// DailyValueHandler handles daily value list/approval requests.
type DailyValueHandler struct {
	dailyValueService *service.DailyValueService
	employeeService   *service.EmployeeService
}

var errDailyValueScopeDenied = errors.New("employee access denied by scope")

// NewDailyValueHandler creates a new DailyValueHandler instance.
func NewDailyValueHandler(dailyValueService *service.DailyValueService, employeeService *service.EmployeeService) *DailyValueHandler {
	return &DailyValueHandler{dailyValueService: dailyValueService, employeeService: employeeService}
}

// ListAll handles GET /daily-values
func (h *DailyValueHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	scope, err := scopeFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load access scope")
		return
	}
	if !scope.AllowsTenant(tenantID) {
		respondError(w, http.StatusForbidden, "Permission denied")
		return
	}

	opts := model.DailyValueListOptions{
		ScopeType:          scope.Type,
		ScopeDepartmentIDs: scope.DepartmentIDs,
		ScopeEmployeeIDs:   scope.EmployeeIDs,
	}

	if empIDStr := r.URL.Query().Get("employee_id"); empIDStr != "" {
		empID, err := uuid.Parse(empIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		if err := h.ensureEmployeeScope(r.Context(), empID); err != nil {
			if errors.Is(err, service.ErrEmployeeNotFound) {
				respondError(w, http.StatusNotFound, "Employee not found")
				return
			}
			if errors.Is(err, errDailyValueScopeDenied) {
				respondError(w, http.StatusForbidden, "Permission denied")
				return
			}
			respondError(w, http.StatusInternalServerError, "Failed to verify access")
			return
		}
		opts.EmployeeID = &empID
	}

	if statusStr := r.URL.Query().Get("status"); statusStr != "" {
		status := model.DailyValueStatus(statusStr)
		switch status {
		case model.DailyValueStatusPending,
			model.DailyValueStatusCalculated,
			model.DailyValueStatusError,
			model.DailyValueStatusApproved:
			opts.Status = &status
		default:
			respondError(w, http.StatusBadRequest, "Invalid status")
			return
		}
	}

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		from, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid from date format, expected YYYY-MM-DD")
			return
		}
		opts.From = &from
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		to, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid to date format, expected YYYY-MM-DD")
			return
		}
		opts.To = &to
	}

	if hasErrorsStr := r.URL.Query().Get("has_errors"); hasErrorsStr != "" {
		hasErrors, err := strconv.ParseBool(hasErrorsStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid has_errors value")
			return
		}
		opts.HasErrors = &hasErrors
	}

	values, err := h.dailyValueService.ListAll(r.Context(), tenantID, opts)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list daily values")
		return
	}

	response := models.DailyValueList{
		Data: make([]*models.DailyValue, 0, len(values)),
	}
	for i := range values {
		response.Data = append(response.Data, h.dailyValueToResponse(&values[i]))
	}

	respondJSON(w, http.StatusOK, response)
}

// Get handles GET /daily-values/{id}
func (h *DailyValueHandler) Get(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid daily value ID")
		return
	}

	dv, err := h.dailyValueService.GetByID(r.Context(), tenantID, id)
	if err != nil {
		switch err {
		case service.ErrDailyValueNotFound:
			respondError(w, http.StatusNotFound, "Daily value not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to get daily value")
		}
		return
	}

	if err := h.ensureEmployeeScope(r.Context(), dv.EmployeeID); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errDailyValueScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	respondJSON(w, http.StatusOK, h.dailyValueToResponse(dv))
}

// Approve handles POST /daily-values/{id}/approve
func (h *DailyValueHandler) Approve(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid daily value ID")
		return
	}

	existing, err := h.dailyValueService.GetByID(r.Context(), tenantID, id)
	if err != nil {
		switch err {
		case service.ErrDailyValueNotFound:
			respondError(w, http.StatusNotFound, "Daily value not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to get daily value")
		}
		return
	}
	if err := h.ensureEmployeeScope(r.Context(), existing.EmployeeID); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errDailyValueScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	dv, err := h.dailyValueService.Approve(r.Context(), tenantID, id)
	if err != nil {
		switch err {
		case service.ErrDailyValueNotFound:
			respondError(w, http.StatusNotFound, "Daily value not found")
		case service.ErrDailyValueHasErrors:
			respondError(w, http.StatusBadRequest, "Daily value has errors")
		case service.ErrDailyValueNotApprovable:
			respondError(w, http.StatusBadRequest, "Daily value is not approvable")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to approve daily value")
		}
		return
	}

	respondJSON(w, http.StatusOK, h.dailyValueToResponse(dv))
}

func (h *DailyValueHandler) dailyValueToResponse(dv *model.DailyValue) *models.DailyValue {
	if dv == nil {
		return nil
	}

	id := strfmt.UUID(dv.ID.String())
	tenantID := strfmt.UUID(dv.TenantID.String())
	employeeID := strfmt.UUID(dv.EmployeeID.String())
	valueDate := strfmt.Date(dv.ValueDate)
	status := string(dv.Status)
	if status == "" {
		if dv.HasError {
			status = string(model.DailyValueStatusError)
		} else {
			status = string(model.DailyValueStatusCalculated)
		}
	}
	balance := int64(dv.Balance())

	resp := &models.DailyValue{
		ID:               &id,
		TenantID:         &tenantID,
		EmployeeID:       &employeeID,
		ValueDate:        &valueDate,
		Status:           &status,
		GrossMinutes:     int64(dv.GrossTime),
		NetMinutes:       int64(dv.NetTime),
		TargetMinutes:    int64(dv.TargetTime),
		OvertimeMinutes:  int64(dv.Overtime),
		UndertimeMinutes: int64(dv.Undertime),
		BreakMinutes:     int64(dv.BreakTime),
		BalanceMinutes:   balance,
		HasErrors:        dv.HasError,
		CreatedAt:        strfmt.DateTime(dv.CreatedAt),
		UpdatedAt:        strfmt.DateTime(dv.UpdatedAt),
	}

	if dv.CalculatedAt != nil {
		calculatedAt := strfmt.DateTime(*dv.CalculatedAt)
		resp.CalculatedAt = &calculatedAt
	}

	if dv.Employee != nil {
		empID := strfmt.UUID(dv.Employee.ID.String())
		resp.Employee.ID = &empID
		resp.Employee.FirstName = &dv.Employee.FirstName
		resp.Employee.LastName = &dv.Employee.LastName
		resp.Employee.PersonnelNumber = &dv.Employee.PersonnelNumber
		resp.Employee.IsActive = dv.Employee.IsActive
		if dv.Employee.DepartmentID != nil {
			deptID := strfmt.UUID(dv.Employee.DepartmentID.String())
			resp.Employee.DepartmentID = &deptID
		}
		if dv.Employee.TariffID != nil {
			tariffID := strfmt.UUID(dv.Employee.TariffID.String())
			resp.Employee.TariffID = &tariffID
		}
	}

	return resp
}

func (h *DailyValueHandler) ensureEmployeeScope(ctx context.Context, employeeID uuid.UUID) error {
	emp, err := h.employeeService.GetByID(ctx, employeeID)
	if err != nil {
		return err
	}

	scope, err := scopeFromContext(ctx)
	if err != nil {
		return err
	}
	if tenantID, ok := middleware.TenantFromContext(ctx); ok {
		if !scope.AllowsTenant(tenantID) {
			return errDailyValueScopeDenied
		}
	}
	if !scope.AllowsEmployee(emp) {
		return errDailyValueScopeDenied
	}
	return nil
}
