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

type AccountHandler struct {
	accountService *service.AccountService
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

	// Check for include_system filter
	includeSystem := r.URL.Query().Get("include_system") == "true"
	// Check for active_only filter
	activeOnly := r.URL.Query().Get("active_only") == "true"

	var accounts []model.Account
	var err error

	if includeSystem {
		accounts, err = h.accountService.ListWithSystem(r.Context(), tenantID)
	} else if activeOnly {
		accounts, err = h.accountService.ListActive(r.Context(), tenantID)
	} else {
		accounts, err = h.accountService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list accounts")
		return
	}
	respondJSON(w, http.StatusOK, accounts)
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
	accountType := mapAccountType(*req.AccountType)

	input := service.CreateAccountInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		AccountType: accountType,
		Unit:        model.AccountUnitMinutes, // Default
		IsActive:    true,
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
	input.IsActive = &req.IsActive

	account, err := h.accountService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrAccountNotFound:
			respondError(w, http.StatusNotFound, "Account not found")
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

// mapAccountType maps OpenAPI account types to internal model types
func mapAccountType(apiType string) model.AccountType {
	switch apiType {
	case "bonus":
		return model.AccountTypeBonus
	case "time", "tracking":
		return model.AccountTypeTracking
	case "vacation", "sick", "deduction", "balance":
		return model.AccountTypeBalance
	default:
		return model.AccountTypeTracking
	}
}
