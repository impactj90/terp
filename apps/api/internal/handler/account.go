package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type AccountHandler struct {
	accountService *service.AccountService
}

type AccountUsageResponse struct {
	AccountID  uuid.UUID                   `json:"account_id"`
	UsageCount int                         `json:"usage_count"`
	DayPlans   []model.AccountUsageDayPlan `json:"day_plans"`
}

func NewAccountHandler(accountService *service.AccountService) *AccountHandler {
	return &AccountHandler{accountService: accountService}
}

func (h *AccountHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	includeSystem := r.URL.Query().Get("include_system") == "true"
	activeOnly := r.URL.Query().Get("active_only") == "true"

	var activeFilter *bool
	if activeOnly {
		active := true
		activeFilter = &active
	} else if activeStr := r.URL.Query().Get("active"); activeStr != "" {
		active, err := strconv.ParseBool(activeStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid active filter")
			return
		}
		activeFilter = &active
	}

	var accountTypeFilter *model.AccountType
	if accountTypeStr := r.URL.Query().Get("account_type"); accountTypeStr != "" {
		accountType, ok := parseAccountType(accountTypeStr)
		if !ok {
			respondError(w, http.StatusBadRequest, "Invalid account type")
			return
		}
		accountTypeFilter = &accountType
	}

	accounts, err := h.accountService.ListFiltered(r.Context(), tenantID, includeSystem, activeFilter, accountTypeFilter)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list accounts")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"data": accounts})
}

func (h *AccountHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account ID")
		return
	}

	account, err := h.accountService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Account not found")
		return
	}

	respondJSON(w, http.StatusOK, account)
}

func (h *AccountHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Map OpenAPI account type to internal model
	accountType, ok := parseAccountType(*req.AccountType)
	if !ok {
		respondError(w, http.StatusBadRequest, "Invalid account type")
		return
	}

	var description *string
	if req.Description != "" {
		description = &req.Description
	}

	unit := model.AccountUnit(req.Unit)
	if req.Unit == "" {
		unit = model.AccountUnitMinutes
	}

	isPayrollRelevant := false
	if req.IsPayrollRelevant != nil {
		isPayrollRelevant = *req.IsPayrollRelevant
	}

	var payrollCode *string
	if req.PayrollCode != "" {
		payrollCode = &req.PayrollCode
	}

	input := service.CreateAccountInput{
		TenantID:          tenantID,
		Code:              *req.Code,
		Name:              *req.Name,
		Description:       description,
		AccountType:       accountType,
		Unit:              unit,
		YearCarryover:     &req.YearCarryover,
		IsPayrollRelevant: isPayrollRelevant,
		PayrollCode:       payrollCode,
		SortOrder:         int(req.SortOrder),
		IsActive:          true,
	}

	account, err := h.accountService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrAccountCodeRequired:
			respondError(w, http.StatusBadRequest, "Account code is required")
		case service.ErrAccountNameRequired:
			respondError(w, http.StatusBadRequest, "Account name is required")
		case service.ErrAccountTypeRequired:
			respondError(w, http.StatusBadRequest, "Account type is required")
		case service.ErrAccountCodeExists:
			respondError(w, http.StatusBadRequest, "An account with this code already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create account")
		}
		return
	}

	respondJSON(w, http.StatusCreated, account)
}

func (h *AccountHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account ID")
		return
	}

	var req models.UpdateAccountRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateAccountInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.Unit != "" {
		unit := model.AccountUnit(req.Unit)
		input.Unit = &unit
	}
	input.YearCarryover = &req.YearCarryover
	input.IsPayrollRelevant = &req.IsPayrollRelevant
	if req.PayrollCode != "" {
		input.PayrollCode = &req.PayrollCode
	}
	input.SortOrder = func(value int) *int { return &value }(int(req.SortOrder))
	input.IsActive = &req.IsActive

	account, err := h.accountService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrAccountNotFound:
			respondError(w, http.StatusNotFound, "Account not found")
		case service.ErrCannotModifySystemAccount:
			respondError(w, http.StatusForbidden, "Cannot modify system account")
		case service.ErrAccountNameRequired:
			respondError(w, http.StatusBadRequest, "Account name cannot be empty")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update account")
		}
		return
	}

	respondJSON(w, http.StatusOK, account)
}

func (h *AccountHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account ID")
		return
	}

	if err := h.accountService.Delete(r.Context(), id); err != nil {
		switch err {
		case service.ErrAccountNotFound:
			respondError(w, http.StatusNotFound, "Account not found")
		case service.ErrCannotDeleteSystem:
			respondError(w, http.StatusForbidden, "Cannot delete system account")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete account")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Usage returns day plan usage for an account.
func (h *AccountHandler) Usage(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account ID")
		return
	}

	plans, err := h.accountService.GetUsage(r.Context(), tenantID, id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch account usage")
		return
	}

	respondJSON(w, http.StatusOK, AccountUsageResponse{
		AccountID:  id,
		UsageCount: len(plans),
		DayPlans:   plans,
	})
}

// parseAccountType maps API account types to internal model types.
func parseAccountType(apiType string) (model.AccountType, bool) {
	switch apiType {
	case "bonus":
		return model.AccountTypeBonus, true
	case "tracking", "time":
		return model.AccountTypeTracking, true
	case "balance", "vacation", "sick", "deduction":
		return model.AccountTypeBalance, true
	default:
		return "", false
	}
}
