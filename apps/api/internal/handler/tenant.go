package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type TenantHandler struct {
	tenantService *service.TenantService
}

func NewTenantHandler(tenantService *service.TenantService) *TenantHandler {
	return &TenantHandler{tenantService: tenantService}
}

func (h *TenantHandler) List(w http.ResponseWriter, r *http.Request) {
	// Return only tenants the authenticated user has access to
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Authentication required")
		return
	}

	tenants, err := h.tenantService.ListForUser(r.Context(), user.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list tenants")
		return
	}

	// Apply optional name filter client-side
	query := r.URL.Query()
	nameFilter := strings.TrimSpace(query.Get("name"))
	if nameFilter != "" {
		filtered := make([]model.Tenant, 0)
		lower := strings.ToLower(nameFilter)
		for _, t := range tenants {
			if strings.Contains(strings.ToLower(t.Name), lower) {
				filtered = append(filtered, t)
			}
		}
		tenants = filtered
	}

	// Apply active filter
	activeParam := strings.TrimSpace(query.Get("active"))
	if activeParam != "" {
		parsed, err := strconv.ParseBool(activeParam)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid active filter")
			return
		}
		filtered := make([]model.Tenant, 0)
		for _, t := range tenants {
			if t.IsActive == parsed {
				filtered = append(filtered, t)
			}
		}
		tenants = filtered
	}

	respondJSON(w, http.StatusOK, tenants)
}

func (h *TenantHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tenant ID")
		return
	}

	tenant, err := h.tenantService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Tenant not found")
		return
	}

	respondJSON(w, http.StatusOK, tenant)
}

func (h *TenantHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateTenantInput{
		Name:                  *req.Name,
		Slug:                  *req.Slug,
		AddressStreet:         *req.AddressStreet,
		AddressZip:            *req.AddressZip,
		AddressCity:           *req.AddressCity,
		AddressCountry:        *req.AddressCountry,
		Phone:                 req.Phone,
		PayrollExportBasePath: req.PayrollExportBasePath,
		Notes:                 req.Notes,
	}
	if req.Email != nil {
		emailValue := req.Email.String()
		input.Email = &emailValue
	}
	if req.VacationBasis != "" {
		vb := model.VacationBasis(req.VacationBasis)
		input.VacationBasis = &vb
	}

	tenant, err := h.tenantService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrTenantSlugExists:
			respondError(w, http.StatusBadRequest, "Tenant slug already exists")
		case service.ErrInvalidTenantSlug:
			respondError(w, http.StatusBadRequest, "Invalid tenant slug")
		case service.ErrInvalidTenantName:
			respondError(w, http.StatusBadRequest, "Invalid tenant name")
		case service.ErrInvalidAddress:
			respondError(w, http.StatusBadRequest, "Invalid tenant address")
		case service.ErrInvalidTenantVacationBasis:
			respondError(w, http.StatusBadRequest, "Invalid vacation basis")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create tenant")
		}
		return
	}

	// Auto-add creating user to the new tenant
	user, ok := auth.UserFromContext(r.Context())
	if ok {
		_ = h.tenantService.AddUserToTenant(r.Context(), user.ID, tenant.ID, "owner")
	}

	respondJSON(w, http.StatusCreated, tenant)
}

func (h *TenantHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tenant ID")
		return
	}

	tenant, err := h.tenantService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Tenant not found")
		return
	}

	var req models.UpdateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateTenantInput{
		Name:                  req.Name,
		AddressStreet:         req.AddressStreet,
		AddressZip:            req.AddressZip,
		AddressCity:           req.AddressCity,
		AddressCountry:        req.AddressCountry,
		Phone:                 req.Phone,
		PayrollExportBasePath: req.PayrollExportBasePath,
		Notes:                 req.Notes,
		IsActive:              req.IsActive,
	}
	if req.Email != nil {
		emailValue := req.Email.String()
		input.Email = &emailValue
	}
	if req.VacationBasis != nil {
		vb := model.VacationBasis(*req.VacationBasis)
		input.VacationBasis = &vb
	}

	if err := h.tenantService.Update(r.Context(), tenant, input); err != nil {
		switch err {
		case service.ErrInvalidTenantName:
			respondError(w, http.StatusBadRequest, "Invalid tenant name")
		case service.ErrInvalidAddress:
			respondError(w, http.StatusBadRequest, "Invalid tenant address")
		case service.ErrInvalidTenantVacationBasis:
			respondError(w, http.StatusBadRequest, "Invalid vacation basis")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update tenant")
		}
		return
	}

	respondJSON(w, http.StatusOK, tenant)
}

func (h *TenantHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tenant ID")
		return
	}

	if err := h.tenantService.Deactivate(r.Context(), id); err != nil {
		switch err {
		case service.ErrTenantNotFound:
			respondError(w, http.StatusNotFound, "Tenant not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to deactivate tenant")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
