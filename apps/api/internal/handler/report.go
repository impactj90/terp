package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// ReportHandler handles report HTTP requests.
type ReportHandler struct {
	svc *service.ReportService
}

// NewReportHandler creates a new ReportHandler.
func NewReportHandler(svc *service.ReportService) *ReportHandler {
	return &ReportHandler{svc: svc}
}

// List handles GET /reports
func (h *ReportHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filter := service.ReportListFilter{
		TenantID: tenantID,
	}

	if rt := r.URL.Query().Get("report_type"); rt != "" {
		filter.ReportType = &rt
	}
	if st := r.URL.Query().Get("status"); st != "" {
		filter.Status = &st
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		l, err := strconv.Atoi(limitStr)
		if err == nil {
			filter.Limit = l
		}
	}
	if cursor := r.URL.Query().Get("cursor"); cursor != "" {
		parsed, err := uuid.Parse(cursor)
		if err == nil {
			filter.Cursor = &parsed
		}
	}

	reports, hasMore, err := h.svc.List(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list reports")
		return
	}

	data := make([]*models.Report, 0, len(reports))
	for i := range reports {
		data = append(data, mapReportToResponse(&reports[i]))
	}

	nextCursor := ""
	if hasMore && len(reports) > 0 {
		nextCursor = reports[len(reports)-1].ID.String()
	}

	respondJSON(w, http.StatusOK, models.ReportList{
		Data: data,
		Meta: &models.PaginationMeta{
			HasMore:    hasMore,
			NextCursor: nextCursor,
		},
	})
}

// Get handles GET /reports/{id}
func (h *ReportHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid report ID")
		return
	}

	report, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleReportError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, mapReportToResponse(report))
}

// Generate handles POST /reports
func (h *ReportHandler) Generate(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.GenerateReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.GenerateReportInput{
		TenantID:   tenantID,
		ReportType: *req.ReportType,
		Format:     *req.Format,
		Name:       req.Name,
	}

	// Parse parameters
	if req.Parameters != nil {
		if req.Parameters.FromDate.String() != "0001-01-01" {
			fd := req.Parameters.FromDate.String()
			input.FromDate = &fd
		}
		if req.Parameters.ToDate.String() != "0001-01-01" {
			td := req.Parameters.ToDate.String()
			input.ToDate = &td
		}
		for _, eid := range req.Parameters.EmployeeIds {
			parsed, err := uuid.Parse(eid.String())
			if err == nil {
				input.EmployeeIDs = append(input.EmployeeIDs, parsed)
			}
		}
		for _, did := range req.Parameters.DepartmentIds {
			parsed, err := uuid.Parse(did.String())
			if err == nil {
				input.DepartmentIDs = append(input.DepartmentIDs, parsed)
			}
		}
		for _, ccid := range req.Parameters.CostCenterIds {
			parsed, err := uuid.Parse(ccid.String())
			if err == nil {
				input.CostCenterIDs = append(input.CostCenterIDs, parsed)
			}
		}
		for _, tid := range req.Parameters.TeamIds {
			parsed, err := uuid.Parse(tid.String())
			if err == nil {
				input.TeamIDs = append(input.TeamIDs, parsed)
			}
		}
	}

	// Get current user
	if u, ok := auth.UserFromContext(r.Context()); ok {
		input.CreatedBy = &u.ID
	}

	report, err := h.svc.Generate(r.Context(), input)
	if err != nil {
		handleReportError(w, err)
		return
	}

	respondJSON(w, http.StatusAccepted, mapReportToResponse(report))
}

// Delete handles DELETE /reports/{id}
func (h *ReportHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid report ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleReportError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Download handles GET /reports/{id}/download
func (h *ReportHandler) Download(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid report ID")
		return
	}

	content, contentType, filename, err := h.svc.GetDownloadContent(r.Context(), id)
	if err != nil {
		handleReportError(w, err)
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(content)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

// --- Response mapping ---

func mapReportToResponse(report *reportModel) *models.Report {
	id := strfmt.UUID(report.ID.String())
	tenantID := strfmt.UUID(report.TenantID.String())
	reportType := string(report.ReportType)
	status := string(report.Status)

	resp := &models.Report{
		ID:          &id,
		TenantID:    &tenantID,
		ReportType:  &reportType,
		Name:        report.Name,
		Status:      &status,
		Format:      string(report.Format),
		RequestedAt: strfmt.DateTime(report.RequestedAt),
		CreatedAt:   strfmt.DateTime(report.CreatedAt),
		UpdatedAt:   strfmt.DateTime(report.UpdatedAt),
	}

	if report.Description != nil {
		resp.Description = report.Description
	}
	if report.FileSize != nil {
		fs := int64(*report.FileSize)
		resp.FileSize = &fs
	}
	if report.RowCount != nil {
		rc := int64(*report.RowCount)
		resp.RowCount = &rc
	}
	if report.ErrorMessage != nil {
		resp.ErrorMessage = report.ErrorMessage
	}
	if report.StartedAt != nil {
		s := strfmt.DateTime(*report.StartedAt)
		resp.StartedAt = &s
	}
	if report.CompletedAt != nil {
		c := strfmt.DateTime(*report.CompletedAt)
		resp.CompletedAt = &c
	}
	if report.CreatedBy != nil {
		cb := strfmt.UUID(report.CreatedBy.String())
		resp.CreatedBy = &cb
	}

	// Map parameters
	if report.Parameters != nil {
		var params models.ReportParameters
		_ = json.Unmarshal(report.Parameters, &params)
		resp.Parameters = &params
	}

	return resp
}

// reportModel is a type alias to avoid import confusion with generated models.
type reportModel = model.Report

func handleReportError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrReportNotFound:
		respondError(w, http.StatusNotFound, "Report not found")
	case service.ErrReportTypeRequired:
		respondError(w, http.StatusBadRequest, "Report type is required")
	case service.ErrReportTypeInvalid:
		respondError(w, http.StatusBadRequest, "Invalid report type")
	case service.ErrReportFormatRequired:
		respondError(w, http.StatusBadRequest, "Report format is required")
	case service.ErrReportFormatInvalid:
		respondError(w, http.StatusBadRequest, "Invalid report format")
	case service.ErrReportDateRangeNeeded:
		respondError(w, http.StatusBadRequest, "from_date and to_date are required for this report type")
	case service.ErrReportNotReady:
		respondError(w, http.StatusConflict, "Report is not ready for download")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
