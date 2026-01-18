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
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

type EmployeeHandler struct {
	employeeService *service.EmployeeService
}

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

	// Parse query parameters
	filter := repository.EmployeeFilter{
		TenantID:    tenantID,
		SearchQuery: r.URL.Query().Get("q"),
		Limit:       50, // Default limit
	}

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
		PIN:                 *req.Pin,
		FirstName:           *req.FirstName,
		LastName:            *req.LastName,
		Email:               string(req.Email),
		Phone:               req.Phone,
		EntryDate:           time.Time(*req.EntryDate),
		WeeklyHours:         req.WeeklyHours,
		VacationDaysPerYear: req.VacationDaysPerYear,
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

	respondJSON(w, http.StatusCreated, emp)
}

func (h *EmployeeHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	var req models.UpdateEmployeeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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

	respondJSON(w, http.StatusOK, emp)
}

func (h *EmployeeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
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
