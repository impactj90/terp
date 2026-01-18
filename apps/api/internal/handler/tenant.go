package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/service"
)

type TenantHandler struct {
	tenantService *service.TenantService
}

func NewTenantHandler(tenantService *service.TenantService) *TenantHandler {
	return &TenantHandler{tenantService: tenantService}
}

func (h *TenantHandler) List(w http.ResponseWriter, r *http.Request) {
	activeOnly := r.URL.Query().Get("active") == "true"

	tenants, err := h.tenantService.List(r.Context(), activeOnly)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list tenants")
		return
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

	tenant, err := h.tenantService.Create(r.Context(), *req.Name, *req.Slug)
	if err != nil {
		switch err {
		case service.ErrTenantSlugExists:
			respondError(w, http.StatusBadRequest, "Tenant slug already exists")
		case service.ErrInvalidTenantSlug:
			respondError(w, http.StatusBadRequest, "Invalid tenant slug")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create tenant")
		}
		return
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

	if req.Name != "" {
		tenant.Name = req.Name
	}
	// Note: IsActive cannot be reliably detected as "provided" vs "default false"
	// with the current OpenAPI spec design. This will always set IsActive.
	tenant.IsActive = req.IsActive

	if err := h.tenantService.Update(r.Context(), tenant); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update tenant")
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

	if err := h.tenantService.Delete(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete tenant")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
