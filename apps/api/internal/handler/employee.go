package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

type EmployeeHandler struct {
	employeeService *service.EmployeeService
	auditService    *service.AuditLogService
}

func (h *EmployeeHandler) SetAuditService(s *service.AuditLogService) { h.auditService = s }

var errEmployeeScopeDenied = errors.New("employee access denied by scope")

func NewEmployeeHandler(employeeService *service.EmployeeService) *EmployeeHandler {
	return &EmployeeHandler{employeeService: employeeService}
}

// EmployeeList represents the response format for listing employees.
type EmployeeList struct {
	Data  []model.Employee `json:"data"`
	Total int64            `json:"total"`
}

// EmployeeContactList represents the response format for listing employee contacts.
type EmployeeContactList struct {
	Data []model.EmployeeContact `json:"data"`
}

// EmployeeCardList represents the response format for listing employee cards.
type EmployeeCardList struct {
	Data []model.EmployeeCard `json:"data"`
}

func (h *EmployeeHandler) List(w http.ResponseWriter, r *http.Request) {
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

	// Parse query parameters
	filter := repository.EmployeeFilter{
		TenantID:    tenantID,
		SearchQuery: r.URL.Query().Get("q"),
		Limit:       50, // Default limit
	}
	filter.ScopeType = scope.Type
	filter.ScopeDepartmentIDs = scope.DepartmentIDs
	filter.ScopeEmployeeIDs = scope.EmployeeIDs

	// Parse pagination
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 {
			filter.Limit = limit
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if offset, err := strconv.Atoi(offsetStr); err == nil && offset >= 0 {
			filter.Offset = offset
		}
	}

	// Parse is_active filter
	if activeStr := r.URL.Query().Get("is_active"); activeStr != "" {
		isActive := activeStr == "true"
		filter.IsActive = &isActive
	}

	// Parse department_id filter
	if deptIDStr := r.URL.Query().Get("department_id"); deptIDStr != "" {
		if deptID, err := uuid.Parse(deptIDStr); err == nil {
			filter.DepartmentID = &deptID
		}
	}

	employees, total, err := h.employeeService.List(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list employees")
		return
	}

	response := EmployeeList{
		Data:  employees,
		Total: total,
	}
	respondJSON(w, http.StatusOK, response)
}

func (h *EmployeeHandler) Search(w http.ResponseWriter, r *http.Request) {
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

	query := r.URL.Query().Get("q")
	if query == "" {
		respondError(w, http.StatusBadRequest, "Search query is required")
		return
	}

	employees, err := h.employeeService.Search(r.Context(), tenantID, query)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to search employees")
		return
	}

	if scope.Type == model.DataScopeDepartment || scope.Type == model.DataScopeEmployee {
		filtered := make([]model.Employee, 0, len(employees))
		for i := range employees {
			emp := employees[i]
			if scope.AllowsEmployee(&emp) {
				filtered = append(filtered, emp)
			}
		}
		employees = filtered
	}

	respondJSON(w, http.StatusOK, employees)
}

func (h *EmployeeHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	emp, err := h.employeeService.GetDetails(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Employee not found")
		return
	}

	scope, err := scopeFromContext(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load access scope")
		return
	}
	if !scope.AllowsEmployee(emp) {
		respondError(w, http.StatusForbidden, "Permission denied")
		return
	}

	respondJSON(w, http.StatusOK, emp)
}

func (h *EmployeeHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateEmployeeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateEmployeeInput{
		TenantID:            tenantID,
		PersonnelNumber:     *req.PersonnelNumber,
		PIN:                 req.Pin, // PIN is optional; service auto-assigns if empty
		FirstName:           *req.FirstName,
		LastName:            *req.LastName,
		Email:               string(req.Email),
		Phone:               req.Phone,
		EntryDate:           time.Time(*req.EntryDate),
		WeeklyHours:         req.WeeklyHours,
		VacationDaysPerYear: req.VacationDaysPerYear,
		// Extended fields
		ExitReason:     req.ExitReason,
		Notes:          req.Notes,
		AddressStreet:  req.AddressStreet,
		AddressZip:     req.AddressZip,
		AddressCity:    req.AddressCity,
		AddressCountry: req.AddressCountry,
		Gender:         req.Gender,
		Nationality:    req.Nationality,
		Religion:       req.Religion,
		MaritalStatus:  req.MaritalStatus,
		BirthPlace:     req.BirthPlace,
		BirthCountry:   req.BirthCountry,
		RoomNumber:     req.RoomNumber,
		PhotoURL:       req.PhotoURL,
		DisabilityFlag: req.DisabilityFlag,
	}

	// Handle optional birth_date
	if !time.Time(req.BirthDate).IsZero() {
		bd := time.Time(req.BirthDate)
		input.BirthDate = &bd
	}

	// Handle optional department_id
	if req.DepartmentID != "" {
		deptID, err := uuid.Parse(req.DepartmentID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid department ID")
			return
		}
		input.DepartmentID = &deptID
	}

	// Handle optional cost_center_id
	if req.CostCenterID != "" {
		ccID, err := uuid.Parse(req.CostCenterID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid cost center ID")
			return
		}
		input.CostCenterID = &ccID
	}

	// Handle optional employment_type_id
	if req.EmploymentTypeID != "" {
		etID, err := uuid.Parse(req.EmploymentTypeID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employment type ID")
			return
		}
		input.EmploymentTypeID = &etID
	}
	// Handle optional tariff_id
	if req.TariffID != nil {
		tariffID, err := uuid.Parse(req.TariffID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid tariff ID")
			return
		}
		input.TariffID = &tariffID
	}
	// Handle optional group IDs
	if req.EmployeeGroupID != "" {
		id, err := uuid.Parse(req.EmployeeGroupID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee group ID")
			return
		}
		input.EmployeeGroupID = &id
	}
	if req.WorkflowGroupID != "" {
		id, err := uuid.Parse(req.WorkflowGroupID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid workflow group ID")
			return
		}
		input.WorkflowGroupID = &id
	}
	if req.ActivityGroupID != "" {
		id, err := uuid.Parse(req.ActivityGroupID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid activity group ID")
			return
		}
		input.ActivityGroupID = &id
	}
	// Handle optional decimal fields
	if req.PartTimePercent != 0 {
		input.PartTimePercent = &req.PartTimePercent
	}
	if req.DailyTargetHours != 0 {
		input.DailyTargetHours = &req.DailyTargetHours
	}
	if req.WeeklyTargetHours != 0 {
		input.WeeklyTargetHours = &req.WeeklyTargetHours
	}
	if req.MonthlyTargetHours != 0 {
		input.MonthlyTargetHours = &req.MonthlyTargetHours
	}
	if req.AnnualTargetHours != 0 {
		input.AnnualTargetHours = &req.AnnualTargetHours
	}
	if req.WorkDaysPerWeek != 0 {
		input.WorkDaysPerWeek = &req.WorkDaysPerWeek
	}

	emp, err := h.employeeService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrPersonnelNumberRequired:
			respondError(w, http.StatusBadRequest, "Personnel number is required")
		case service.ErrPINRequired:
			respondError(w, http.StatusBadRequest, "PIN is required")
		case service.ErrFirstNameRequired:
			respondError(w, http.StatusBadRequest, "First name is required")
		case service.ErrLastNameRequired:
			respondError(w, http.StatusBadRequest, "Last name is required")
		case service.ErrPersonnelNumberExists:
			respondError(w, http.StatusBadRequest, "Personnel number already exists")
		case service.ErrPINExists:
			respondError(w, http.StatusBadRequest, "PIN already exists")
		case service.ErrInvalidEntryDate:
			respondError(w, http.StatusBadRequest, "Entry date cannot be more than 6 months in the future")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create employee")
		}
		return
	}

	if h.auditService != nil {
		h.auditService.Log(r.Context(), r, service.LogEntry{
			TenantID:   tenantID,
			Action:     model.AuditActionCreate,
			EntityType: "employee",
			EntityID:   emp.ID,
			EntityName: emp.FirstName + " " + emp.LastName,
		})
	}

	respondJSON(w, http.StatusCreated, emp)
}

func (h *EmployeeHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	if _, err := h.ensureEmployeeScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errEmployeeScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var req models.UpdateEmployeeRequest
	if err := json.Unmarshal(body, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert to service input - only set fields that were provided
	input := service.UpdateEmployeeInput{}
	if req.FirstName != "" {
		input.FirstName = &req.FirstName
	}
	if req.LastName != "" {
		input.LastName = &req.LastName
	}
	if req.Email != "" {
		email := string(req.Email)
		input.Email = &email
	}
	if req.Phone != "" {
		input.Phone = &req.Phone
	}
	if !time.Time(req.ExitDate).IsZero() {
		exitDate := time.Time(req.ExitDate)
		input.ExitDate = &exitDate
	}
	// Handle department_id
	if req.DepartmentID != "" {
		deptID, err := uuid.Parse(req.DepartmentID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid department ID")
			return
		}
		input.DepartmentID = &deptID
	}
	// Handle cost_center_id
	if req.CostCenterID != "" {
		ccID, err := uuid.Parse(req.CostCenterID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid cost center ID")
			return
		}
		input.CostCenterID = &ccID
	}
	// Handle employment_type_id
	if req.EmploymentTypeID != "" {
		etID, err := uuid.Parse(req.EmploymentTypeID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employment type ID")
			return
		}
		input.EmploymentTypeID = &etID
	}
	if req.WeeklyHours > 0 {
		input.WeeklyHours = &req.WeeklyHours
	}
	if req.VacationDaysPerYear > 0 {
		input.VacationDaysPerYear = &req.VacationDaysPerYear
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if rawTariff, ok := raw["tariff_id"]; ok {
		if string(rawTariff) == "null" {
			input.ClearTariffID = true
		} else if req.TariffID != nil {
			tariffID, err := uuid.Parse(req.TariffID.String())
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid tariff ID")
				return
			}
			input.TariffID = &tariffID
		} else {
			respondError(w, http.StatusBadRequest, "Invalid tariff ID")
			return
		}
	}

	// Extended fields - only set if provided in the request body
	if _, ok := raw["exit_reason"]; ok {
		input.ExitReason = &req.ExitReason
	}
	if _, ok := raw["notes"]; ok {
		input.Notes = &req.Notes
	}
	if _, ok := raw["address_street"]; ok {
		input.AddressStreet = &req.AddressStreet
	}
	if _, ok := raw["address_zip"]; ok {
		input.AddressZip = &req.AddressZip
	}
	if _, ok := raw["address_city"]; ok {
		input.AddressCity = &req.AddressCity
	}
	if _, ok := raw["address_country"]; ok {
		input.AddressCountry = &req.AddressCountry
	}
	if _, ok := raw["birth_date"]; ok {
		if !time.Time(req.BirthDate).IsZero() {
			bd := time.Time(req.BirthDate)
			input.BirthDate = &bd
		} else {
			input.ClearBirthDate = true
		}
	}
	if _, ok := raw["gender"]; ok {
		input.Gender = &req.Gender
	}
	if _, ok := raw["nationality"]; ok {
		input.Nationality = &req.Nationality
	}
	if _, ok := raw["religion"]; ok {
		input.Religion = &req.Religion
	}
	if _, ok := raw["marital_status"]; ok {
		input.MaritalStatus = &req.MaritalStatus
	}
	if _, ok := raw["birth_place"]; ok {
		input.BirthPlace = &req.BirthPlace
	}
	if _, ok := raw["birth_country"]; ok {
		input.BirthCountry = &req.BirthCountry
	}
	if _, ok := raw["room_number"]; ok {
		input.RoomNumber = &req.RoomNumber
	}
	if _, ok := raw["photo_url"]; ok {
		input.PhotoURL = &req.PhotoURL
	}
	if _, ok := raw["disability_flag"]; ok {
		input.DisabilityFlag = &req.DisabilityFlag
	}
	if _, ok := raw["part_time_percent"]; ok {
		input.PartTimePercent = &req.PartTimePercent
	}
	if _, ok := raw["daily_target_hours"]; ok {
		input.DailyTargetHours = &req.DailyTargetHours
	}
	if _, ok := raw["weekly_target_hours"]; ok {
		input.WeeklyTargetHours = &req.WeeklyTargetHours
	}
	if _, ok := raw["monthly_target_hours"]; ok {
		input.MonthlyTargetHours = &req.MonthlyTargetHours
	}
	if _, ok := raw["annual_target_hours"]; ok {
		input.AnnualTargetHours = &req.AnnualTargetHours
	}
	if _, ok := raw["work_days_per_week"]; ok {
		input.WorkDaysPerWeek = &req.WorkDaysPerWeek
	}

	// Handle group FK fields with explicit null support
	if rawVal, ok := raw["employee_group_id"]; ok {
		if string(rawVal) == "null" {
			input.ClearEmployeeGroupID = true
		} else if req.EmployeeGroupID != nil {
			gid, err := uuid.Parse(req.EmployeeGroupID.String())
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid employee group ID")
				return
			}
			input.EmployeeGroupID = &gid
		}
	}
	if rawVal, ok := raw["workflow_group_id"]; ok {
		if string(rawVal) == "null" {
			input.ClearWorkflowGroupID = true
		} else if req.WorkflowGroupID != nil {
			gid, err := uuid.Parse(req.WorkflowGroupID.String())
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid workflow group ID")
				return
			}
			input.WorkflowGroupID = &gid
		}
	}
	if rawVal, ok := raw["activity_group_id"]; ok {
		if string(rawVal) == "null" {
			input.ClearActivityGroupID = true
		} else if req.ActivityGroupID != nil {
			gid, err := uuid.Parse(req.ActivityGroupID.String())
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid activity group ID")
				return
			}
			input.ActivityGroupID = &gid
		}
	}

	emp, err := h.employeeService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		case service.ErrFirstNameRequired:
			respondError(w, http.StatusBadRequest, "First name cannot be empty")
		case service.ErrLastNameRequired:
			respondError(w, http.StatusBadRequest, "Last name cannot be empty")
		case service.ErrExitBeforeEntry:
			respondError(w, http.StatusBadRequest, "Exit date cannot be before entry date")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update employee")
		}
		return
	}

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionUpdate,
				EntityType: "employee",
				EntityID:   emp.ID,
				EntityName: emp.FirstName + " " + emp.LastName,
			})
		}
	}

	respondJSON(w, http.StatusOK, emp)
}

func (h *EmployeeHandler) BulkAssignTariff(w http.ResponseWriter, r *http.Request) {
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

	body, err := io.ReadAll(r.Body)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var req models.BulkTariffAssignmentRequest
	if err := json.Unmarshal(body, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	rawTariff, hasTariff := raw["tariff_id"]
	if !hasTariff {
		respondError(w, http.StatusBadRequest, "tariff_id is required")
		return
	}

	input := service.BulkAssignTariffInput{
		TenantID: tenantID,
	}

	if string(rawTariff) == "null" {
		input.ClearTariff = true
	} else if req.TariffID != nil {
		tariffID, err := uuid.Parse(req.TariffID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid tariff ID")
			return
		}
		input.TariffID = &tariffID
	} else {
		respondError(w, http.StatusBadRequest, "Invalid tariff ID")
		return
	}

	if len(req.EmployeeIds) > 0 {
		input.EmployeeIDs = make([]uuid.UUID, 0, len(req.EmployeeIds))
		for _, id := range req.EmployeeIds {
			parsed, err := uuid.Parse(id.String())
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid employee ID")
				return
			}
			if scope.Type == model.DataScopeEmployee && !scope.AllowsEmployeeID(parsed) {
				respondError(w, http.StatusForbidden, "Permission denied")
				return
			}
			if scope.Type == model.DataScopeDepartment {
				emp, err := h.employeeService.GetByID(r.Context(), parsed)
				if err != nil {
					respondError(w, http.StatusNotFound, "Employee not found")
					return
				}
				if !scope.AllowsEmployee(emp) {
					respondError(w, http.StatusForbidden, "Permission denied")
					return
				}
			}
			input.EmployeeIDs = append(input.EmployeeIDs, parsed)
		}
	} else if req.Filter != nil {
		var rawFilter map[string]json.RawMessage
		if rawFilterMessage, ok := raw["filter"]; ok && len(rawFilterMessage) > 0 {
			if err := json.Unmarshal(rawFilterMessage, &rawFilter); err != nil {
				respondError(w, http.StatusBadRequest, "Invalid filter")
				return
			}
		}

		filter := repository.EmployeeFilter{
			TenantID: tenantID,
		}
		filter.ScopeType = scope.Type
		filter.ScopeDepartmentIDs = scope.DepartmentIDs
		filter.ScopeEmployeeIDs = scope.EmployeeIDs
		if _, ok := rawFilter["q"]; ok {
			filter.SearchQuery = req.Filter.Q
		}
		if _, ok := rawFilter["department_id"]; ok && req.Filter.DepartmentID != "" {
			deptID, err := uuid.Parse(req.Filter.DepartmentID.String())
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid department ID")
				return
			}
			filter.DepartmentID = &deptID
		}
		if rawValue, ok := rawFilter["is_active"]; ok {
			var isActive bool
			if err := json.Unmarshal(rawValue, &isActive); err != nil {
				respondError(w, http.StatusBadRequest, "Invalid is_active filter")
				return
			}
			filter.IsActive = &isActive
		}
		input.Filter = &filter
	} else {
		respondError(w, http.StatusBadRequest, "employee_ids or filter is required")
		return
	}

	updated, skipped, err := h.employeeService.BulkAssignTariff(r.Context(), input)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to bulk assign tariff")
		return
	}

	updatedCount := int64(updated)
	skippedCount := int64(skipped)
	respondJSON(w, http.StatusOK, models.BulkTariffAssignmentResponse{
		Updated: &updatedCount,
		Skipped: &skippedCount,
	})
}

func (h *EmployeeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	if _, err := h.ensureEmployeeScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errEmployeeScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	if err := h.employeeService.Deactivate(r.Context(), id); err != nil {
		switch err {
		case service.ErrEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to deactivate employee")
		}
		return
	}

	if h.auditService != nil {
		if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tenantID,
				Action:     model.AuditActionDelete,
				EntityType: "employee",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// Contact handlers

func (h *EmployeeHandler) ListContacts(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	if _, err := h.ensureEmployeeScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errEmployeeScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	contacts, err := h.employeeService.ListContacts(r.Context(), id)
	if err != nil {
		switch err {
		case service.ErrEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to list contacts")
		}
		return
	}

	response := EmployeeContactList{Data: contacts}
	respondJSON(w, http.StatusOK, response)
}

func (h *EmployeeHandler) AddContact(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	if _, err := h.ensureEmployeeScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errEmployeeScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	var req models.CreateEmployeeContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateContactInput{
		EmployeeID:  id,
		ContactType: *req.ContactType,
		Value:       *req.Value,
		Label:       req.Label,
	}
	if req.IsPrimary != nil {
		input.IsPrimary = *req.IsPrimary
	}

	contact, err := h.employeeService.AddContact(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		case service.ErrContactTypeRequired:
			respondError(w, http.StatusBadRequest, "Contact type is required")
		case service.ErrContactValueRequired:
			respondError(w, http.StatusBadRequest, "Contact value is required")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to add contact")
		}
		return
	}

	respondJSON(w, http.StatusCreated, contact)
}

func (h *EmployeeHandler) RemoveContact(w http.ResponseWriter, r *http.Request) {
	contactIDStr := chi.URLParam(r, "contactId")
	contactID, err := uuid.Parse(contactIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid contact ID")
		return
	}

	contact, err := h.employeeService.GetContactByID(r.Context(), contactID)
	if err != nil {
		switch err {
		case service.ErrContactNotFound:
			respondError(w, http.StatusNotFound, "Contact not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to load contact")
		}
		return
	}

	if _, err := h.ensureEmployeeScope(r.Context(), contact.EmployeeID); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errEmployeeScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	if err := h.employeeService.RemoveContact(r.Context(), contactID); err != nil {
		switch err {
		case service.ErrContactNotFound:
			respondError(w, http.StatusNotFound, "Contact not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to remove contact")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Card handlers

func (h *EmployeeHandler) ListCards(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	if _, err := h.ensureEmployeeScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errEmployeeScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	cards, err := h.employeeService.ListCards(r.Context(), id)
	if err != nil {
		switch err {
		case service.ErrEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to list cards")
		}
		return
	}

	response := EmployeeCardList{Data: cards}
	respondJSON(w, http.StatusOK, response)
}

func (h *EmployeeHandler) AddCard(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	if _, err := h.ensureEmployeeScope(r.Context(), id); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errEmployeeScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	var req models.CreateEmployeeCardRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateCardInput{
		TenantID:   tenantID,
		EmployeeID: id,
		CardNumber: *req.CardNumber,
		ValidFrom:  time.Time(*req.ValidFrom),
	}

	// Handle optional card type
	if req.CardType != nil {
		input.CardType = *req.CardType
	}

	// Handle optional valid_to date
	if !time.Time(req.ValidTo).IsZero() {
		validTo := time.Time(req.ValidTo)
		input.ValidTo = &validTo
	}

	card, err := h.employeeService.AddCard(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrEmployeeNotFound:
			respondError(w, http.StatusNotFound, "Employee not found")
		case service.ErrCardNumberRequired:
			respondError(w, http.StatusBadRequest, "Card number is required")
		case service.ErrCardNumberExists:
			respondError(w, http.StatusBadRequest, "Card number already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to add card")
		}
		return
	}

	respondJSON(w, http.StatusCreated, card)
}

func (h *EmployeeHandler) DeactivateCard(w http.ResponseWriter, r *http.Request) {
	cardIDStr := chi.URLParam(r, "cardId")
	cardID, err := uuid.Parse(cardIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid card ID")
		return
	}

	card, err := h.employeeService.GetCardByID(r.Context(), cardID)
	if err != nil {
		switch err {
		case service.ErrCardNotFound:
			respondError(w, http.StatusNotFound, "Card not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to load card")
		}
		return
	}

	if _, err := h.ensureEmployeeScope(r.Context(), card.EmployeeID); err != nil {
		if errors.Is(err, service.ErrEmployeeNotFound) {
			respondError(w, http.StatusNotFound, "Employee not found")
			return
		}
		if errors.Is(err, errEmployeeScopeDenied) {
			respondError(w, http.StatusForbidden, "Permission denied")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to verify access")
		return
	}

	// Simple inline struct - no generated model for this
	var req struct {
		Reason string `json:"reason,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Allow empty body for deactivation
		req.Reason = ""
	}

	if err := h.employeeService.DeactivateCard(r.Context(), cardID, req.Reason); err != nil {
		switch err {
		case service.ErrCardNotFound:
			respondError(w, http.StatusNotFound, "Card not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to deactivate card")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *EmployeeHandler) ensureEmployeeScope(ctx context.Context, employeeID uuid.UUID) (*model.Employee, error) {
	emp, err := h.employeeService.GetByID(ctx, employeeID)
	if err != nil {
		return nil, err
	}

	scope, err := scopeFromContext(ctx)
	if err != nil {
		return nil, err
	}
	if tenantID, ok := middleware.TenantFromContext(ctx); ok {
		if !scope.AllowsTenant(tenantID) {
			return nil, errEmployeeScopeDenied
		}
	}
	if !scope.AllowsEmployee(emp) {
		return nil, errEmployeeScopeDenied
	}

	return emp, nil
}
