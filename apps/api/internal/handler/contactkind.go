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

type ContactKindHandler struct {
	svc *service.ContactKindService
}

func NewContactKindHandler(svc *service.ContactKindService) *ContactKindHandler {
	return &ContactKindHandler{svc: svc}
}

func (h *ContactKindHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for contact_type_id filter
	if ctIDStr := r.URL.Query().Get("contact_type_id"); ctIDStr != "" {
		ctID, err := uuid.Parse(ctIDStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid contact_type_id")
			return
		}
		kinds, err := h.svc.ListByContactType(r.Context(), tenantID, ctID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list contact kinds")
			return
		}
		respondJSON(w, http.StatusOK, contactKindListToResponse(kinds))
		return
	}

	// Check for active filter
	if activeStr := r.URL.Query().Get("active"); activeStr == "true" {
		kinds, err := h.svc.ListActive(r.Context(), tenantID)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to list contact kinds")
			return
		}
		respondJSON(w, http.StatusOK, contactKindListToResponse(kinds))
		return
	}

	kinds, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list contact kinds")
		return
	}
	respondJSON(w, http.StatusOK, contactKindListToResponse(kinds))
}

func (h *ContactKindHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid contact kind ID")
		return
	}

	ck, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Contact kind not found")
		return
	}

	respondJSON(w, http.StatusOK, contactKindToResponse(ck))
}

func (h *ContactKindHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateContactKindRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctID, err := uuid.Parse(req.ContactTypeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid contact type ID")
		return
	}

	input := service.CreateContactKindInput{
		TenantID:      tenantID,
		ContactTypeID: ctID,
		Code:          *req.Code,
		Label:         *req.Label,
	}
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	ck, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleContactKindError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, contactKindToResponse(ck))
}

func (h *ContactKindHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid contact kind ID")
		return
	}

	var req models.UpdateContactKindRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateContactKindInput{}
	if req.Label != "" {
		input.Label = &req.Label
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	ck, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleContactKindError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, contactKindToResponse(ck))
}

func (h *ContactKindHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid contact kind ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleContactKindError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func contactKindToResponse(ck *model.ContactKind) *models.ContactKind {
	id := strfmt.UUID(ck.ID.String())
	tenantID := strfmt.UUID(ck.TenantID.String())
	ctID := strfmt.UUID(ck.ContactTypeID.String())

	return &models.ContactKind{
		ID:            &id,
		TenantID:      &tenantID,
		ContactTypeID: &ctID,
		Code:          &ck.Code,
		Label:         &ck.Label,
		IsActive:      ck.IsActive,
		SortOrder:     int64(ck.SortOrder),
		CreatedAt:     strfmt.DateTime(ck.CreatedAt),
		UpdatedAt:     strfmt.DateTime(ck.UpdatedAt),
	}
}

func contactKindListToResponse(kinds []model.ContactKind) models.ContactKindList {
	data := make([]*models.ContactKind, 0, len(kinds))
	for i := range kinds {
		data = append(data, contactKindToResponse(&kinds[i]))
	}
	return models.ContactKindList{Data: data}
}

func handleContactKindError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrContactKindNotFound:
		respondError(w, http.StatusNotFound, "Contact kind not found")
	case service.ErrContactKindCodeRequired:
		respondError(w, http.StatusBadRequest, "Contact kind code is required")
	case service.ErrContactKindLabelReq:
		respondError(w, http.StatusBadRequest, "Contact kind label is required")
	case service.ErrContactKindCodeExists:
		respondError(w, http.StatusConflict, "A contact kind with this code already exists")
	case service.ErrContactKindTypeIDReq:
		respondError(w, http.StatusBadRequest, "Contact type ID is required")
	case service.ErrContactKindTypeNotFound:
		respondError(w, http.StatusBadRequest, "Contact type not found")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
