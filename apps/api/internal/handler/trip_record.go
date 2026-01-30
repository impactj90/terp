package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type TripRecordHandler struct {
	svc *service.TripRecordService
}

func NewTripRecordHandler(svc *service.TripRecordService) *TripRecordHandler {
	return &TripRecordHandler{svc: svc}
}

func (h *TripRecordHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	records, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list trip records")
		return
	}
	respondJSON(w, http.StatusOK, tripRecordListToResponse(records))
}

func (h *TripRecordHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid trip record ID")
		return
	}

	tr, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Trip record not found")
		return
	}

	respondJSON(w, http.StatusOK, tripRecordToResponse(tr))
}

func (h *TripRecordHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateTripRecordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	vehicleID, err := uuid.Parse(req.VehicleID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vehicle ID")
		return
	}

	tripDate, err := time.Parse("2006-01-02", req.TripDate.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid trip date")
		return
	}

	input := service.CreateTripRecordInput{
		TenantID:  tenantID,
		VehicleID: vehicleID,
		TripDate:  tripDate,
		Notes:     req.Notes,
	}

	if req.RouteID.String() != "" {
		rid, err := uuid.Parse(req.RouteID.String())
		if err == nil && rid != uuid.Nil {
			input.RouteID = &rid
		}
	}
	if req.StartMileage != 0 {
		input.StartMileage = &req.StartMileage
	}
	if req.EndMileage != 0 {
		input.EndMileage = &req.EndMileage
	}
	if req.DistanceKm != 0 {
		input.DistanceKm = &req.DistanceKm
	}

	tr, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleTripRecordError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, tripRecordToResponse(tr))
}

func (h *TripRecordHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid trip record ID")
		return
	}

	var req models.UpdateTripRecordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateTripRecordInput{}
	if req.RouteID.String() != "" {
		rid, err := uuid.Parse(req.RouteID.String())
		if err == nil && rid != uuid.Nil {
			input.RouteID = &rid
		}
	}
	if req.TripDate.String() != "" {
		td, err := time.Parse("2006-01-02", req.TripDate.String())
		if err == nil {
			input.TripDate = &td
		}
	}
	if req.StartMileage != 0 {
		input.StartMileage = &req.StartMileage
	}
	if req.EndMileage != 0 {
		input.EndMileage = &req.EndMileage
	}
	if req.DistanceKm != 0 {
		input.DistanceKm = &req.DistanceKm
	}
	if req.Notes != "" {
		input.Notes = &req.Notes
	}

	tr, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleTripRecordError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, tripRecordToResponse(tr))
}

func (h *TripRecordHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid trip record ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleTripRecordError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func tripRecordToResponse(tr *model.TripRecord) *models.TripRecord {
	id := strfmt.UUID(tr.ID.String())
	tenantID := strfmt.UUID(tr.TenantID.String())
	vehicleID := strfmt.UUID(tr.VehicleID.String())
	tripDate := strfmt.Date(tr.TripDate)
	startMileage, _ := tr.StartMileage.Float64()
	endMileage, _ := tr.EndMileage.Float64()
	distKm, _ := tr.DistanceKm.Float64()

	resp := &models.TripRecord{
		ID:           &id,
		TenantID:     &tenantID,
		VehicleID:    &vehicleID,
		TripDate:     &tripDate,
		StartMileage: &startMileage,
		EndMileage:   &endMileage,
		DistanceKm:   &distKm,
		Notes:        &tr.Notes,
		CreatedAt:    strfmt.DateTime(tr.CreatedAt),
		UpdatedAt:    strfmt.DateTime(tr.UpdatedAt),
	}

	if tr.RouteID != nil {
		routeID := strfmt.UUID(tr.RouteID.String())
		resp.RouteID = &routeID
	}

	return resp
}

func tripRecordListToResponse(records []model.TripRecord) models.TripRecordList {
	data := make([]*models.TripRecord, 0, len(records))
	for i := range records {
		data = append(data, tripRecordToResponse(&records[i]))
	}
	return models.TripRecordList{Data: data}
}

func handleTripRecordError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrTripRecordNotFound:
		respondError(w, http.StatusNotFound, "Trip record not found")
	case service.ErrTripRecordVehicleRequired:
		respondError(w, http.StatusBadRequest, "Vehicle is required for trip record")
	case service.ErrTripRecordDateRequired:
		respondError(w, http.StatusBadRequest, "Trip date is required")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
