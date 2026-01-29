package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type AccountGroupHandler struct {
	svc *service.AccountGroupService
}

func NewAccountGroupHandler(svc *service.AccountGroupService) *AccountGroupHandler {
	return &AccountGroupHandler{svc: svc}
}

func (h *AccountGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	groups, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list account groups")
		return
	}

	data := make([]*models.AccountGroup, 0, len(groups))
	for i := range groups {
		data = append(data, accountGroupToResponse(&groups[i]))
	}

	respondJSON(w, http.StatusOK, models.AccountGroupList{Data: data})
}

func (h *AccountGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	g, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Account group not found")
		return
	}

	respondJSON(w, http.StatusOK, accountGroupToResponse(g))
}

func (h *AccountGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateAccountGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateAccountGroupInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
		SortOrder:   int(req.SortOrder),
	}

	g, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleAccountGroupError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, accountGroupToResponse(g))
}

func (h *AccountGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	var req models.UpdateAccountGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateAccountGroupInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.SortOrder = func(v int) *int { return &v }(int(req.SortOrder))
	input.IsActive = &req.IsActive

	g, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleAccountGroupError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, accountGroupToResponse(g))
}

func (h *AccountGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleAccountGroupError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func accountGroupToResponse(g *model.AccountGroup) *models.AccountGroup {
	id := strfmt.UUID(g.ID.String())
	tenantID := strfmt.UUID(g.TenantID.String())

	resp := &models.AccountGroup{
		ID:          &id,
		TenantID:    tenantID,
		Code:        &g.Code,
		Name:        &g.Name,
		Description: g.Description,
		SortOrder:   int64(g.SortOrder),
		IsActive:    g.IsActive,
		CreatedAt:   strfmt.DateTime(g.CreatedAt),
		UpdatedAt:   strfmt.DateTime(g.UpdatedAt),
	}

	return resp
}

func handleAccountGroupError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrAccountGroupNotFound:
		respondError(w, http.StatusNotFound, "Account group not found")
	case service.ErrAccountGroupCodeRequired:
		respondError(w, http.StatusBadRequest, "Group code is required")
	case service.ErrAccountGroupNameRequired:
		respondError(w, http.StatusBadRequest, "Group name is required")
	case service.ErrAccountGroupCodeExists:
		respondError(w, http.StatusConflict, "A group with this code already exists for this tenant")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
