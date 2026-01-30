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

type ContactTypeHandler struct {
	svc *service.ContactTypeService
}

func NewContactTypeHandler(svc *service.ContactTypeService) *ContactTypeHandler {
	return &ContactTypeHandler{svc: svc}
}

func (h *ContactTypeHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for active filter
	if activeStr := r.URL.Query().Get("active"); activeStr == "true" {
		types, err := h.svc.ListActive(r.Context(), tenantID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list contact types")
			return
		}
		respondJSON(w, http.StatusOK, contactTypeListToResponse(types))
		return
	}

	types, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list contact types")
		return
	}
	respondJSON(w, http.StatusOK, contactTypeListToResponse(types))
}

func (h *ContactTypeHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid contact type ID")
		return
	}

	ct, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Contact type not found")
		return
	}

	respondJSON(w, http.StatusOK, contactTypeToResponse(ct))
}

func (h *ContactTypeHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateContactTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateContactTypeInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		DataType:    *req.DataType,
		Description: req.Description,
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	ct, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleContactTypeError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, contactTypeToResponse(ct))
}

func (h *ContactTypeHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid contact type ID")
		return
	}

	var req models.UpdateContactTypeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateContactTypeInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	ct, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleContactTypeError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, contactTypeToResponse(ct))
}

func (h *ContactTypeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid contact type ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleContactTypeError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func contactTypeToResponse(ct *model.ContactType) *models.ContactType {
	id := strfmt.UUID(ct.ID.String())
	tenantID := strfmt.UUID(ct.TenantID.String())

	return &models.ContactType{
		ID:          &id,
		TenantID:    &tenantID,
		Code:        &ct.Code,
		Name:        &ct.Name,
		DataType:    &ct.DataType,
		Description: &ct.Description,
		IsActive:    ct.IsActive,
		SortOrder:   int64(ct.SortOrder),
		CreatedAt:   strfmt.DateTime(ct.CreatedAt),
		UpdatedAt:   strfmt.DateTime(ct.UpdatedAt),
	}
}

func contactTypeListToResponse(types []model.ContactType) models.ContactTypeList {
	data := make([]*models.ContactType, 0, len(types))
	for i := range types {
		data = append(data, contactTypeToResponse(&types[i]))
	}
	return models.ContactTypeList{Data: data}
}

func handleContactTypeError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrContactTypeNotFound:
		respondError(w, http.StatusNotFound, "Contact type not found")
	case service.ErrContactTypeCodeRequired:
		respondError(w, http.StatusBadRequest, "Contact type code is required")
	case service.ErrContactTypeNameRequired:
		respondError(w, http.StatusBadRequest, "Contact type name is required")
	case service.ErrContactTypeCodeExists:
		respondError(w, http.StatusConflict, "A contact type with this code already exists")
	case service.ErrContactTypeInvalidData:
		respondError(w, http.StatusBadRequest, "Invalid data type: must be text, email, phone, or url")
	case service.ErrContactTypeDataTypeReq:
		respondError(w, http.StatusBadRequest, "Contact type data_type is required")
	case service.ErrContactTypeInUse:
		respondError(w, http.StatusConflict, "Contact type is in use by contact kinds and cannot be deleted")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
