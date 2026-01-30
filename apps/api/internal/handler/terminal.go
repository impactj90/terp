package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// TerminalHandler handles HTTP requests for terminal booking operations.
type TerminalHandler struct {
	terminalService *service.TerminalService
}

// NewTerminalHandler creates a new TerminalHandler.
func NewTerminalHandler(terminalService *service.TerminalService) *TerminalHandler {
	return &TerminalHandler{
		terminalService: terminalService,
	}
}

// ListRawBookings handles GET /terminal-bookings
func (h *TerminalHandler) ListRawBookings(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filter := service.ListRawBookingsFilter{
		TenantID: tenantID,
		Limit:    50,
	}

	// Parse from date (required)
	fromStr := r.URL.Query().Get("from")
	if fromStr != "" {
		t, err := time.Parse("2006-01-02", fromStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid 'from' date format, expected YYYY-MM-DD")
			return
		}
		filter.From = &t
	}

	// Parse to date (required)
	toStr := r.URL.Query().Get("to")
	if toStr != "" {
		t, err := time.Parse("2006-01-02", toStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid 'to' date format, expected YYYY-MM-DD")
			return
		}
		filter.To = &t
	}

	// Optional: terminal_id
	if tid := r.URL.Query().Get("terminal_id"); tid != "" {
		filter.TerminalID = &tid
	}

	// Optional: employee_id
	if eidStr := r.URL.Query().Get("employee_id"); eidStr != "" {
		eid, err := uuid.Parse(eidStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid employee_id")
			return
		}
		filter.EmployeeID = &eid
	}

	// Optional: status
	if st := r.URL.Query().Get("status"); st != "" {
		status := model.RawBookingStatus(st)
		filter.Status = &status
	}

	// Optional: import_batch_id
	if bidStr := r.URL.Query().Get("import_batch_id"); bidStr != "" {
		bid, err := uuid.Parse(bidStr)
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid import_batch_id")
			return
		}
		filter.ImportBatchID = &bid
	}

	// Pagination
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 250 {
			filter.Limit = limit
		}
	}
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
			filter.Offset = (page - 1) * filter.Limit
		}
	}

	bookings, total, err := h.terminalService.ListRawBookings(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list terminal bookings")
		return
	}

	data := make([]*models.RawTerminalBooking, 0, len(bookings))
	for i := range bookings {
		data = append(data, h.mapRawBookingToResponse(&bookings[i]))
	}

	hasMore := int64(filter.Offset+filter.Limit) < total
	response := &models.RawTerminalBookingList{
		Data: data,
		Meta: &models.PaginationMeta{
			Total:   total,
			Limit:   int64(filter.Limit),
			HasMore: hasMore,
		},
	}
	respondJSON(w, http.StatusOK, response)
}

// TriggerImport handles POST /terminal-bookings/import
func (h *TerminalHandler) TriggerImport(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.TriggerTerminalImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Build service input
	bookingInputs := make([]service.RawBookingInput, 0, len(req.Bookings))
	for _, b := range req.Bookings {
		if b == nil {
			continue
		}
		ts := time.Time(*b.RawTimestamp)
		bookingInputs = append(bookingInputs, service.RawBookingInput{
			EmployeePIN:    *b.EmployeePin,
			RawTimestamp:   ts,
			RawBookingCode: *b.RawBookingCode,
		})
	}

	input := service.TriggerImportInput{
		TenantID:       tenantID,
		BatchReference: *req.BatchReference,
		TerminalID:     *req.TerminalID,
		Bookings:       bookingInputs,
	}

	result, err := h.terminalService.TriggerImport(r.Context(), input)
	if err != nil {
		if errors.Is(err, service.ErrBatchReferenceRequired) ||
			errors.Is(err, service.ErrTerminalIDRequired) ||
			errors.Is(err, service.ErrNoBookingsProvided) {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to process terminal import")
		return
	}

	response := &models.TriggerTerminalImportResponse{
		Batch:        h.mapImportBatchToResponse(result.Batch),
		Message:      result.Message,
		WasDuplicate: result.WasDuplicate,
	}

	status := http.StatusOK
	if result.WasDuplicate {
		status = http.StatusOK // Idempotent -- same response for duplicate
	}
	respondJSON(w, status, response)
}

// ListImportBatches handles GET /import-batches
func (h *TerminalHandler) ListImportBatches(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	filter := service.ListImportBatchesFilter{
		TenantID: tenantID,
		Limit:    50,
	}

	// Optional: status
	if st := r.URL.Query().Get("status"); st != "" {
		status := model.ImportBatchStatus(st)
		filter.Status = &status
	}

	// Optional: terminal_id
	if tid := r.URL.Query().Get("terminal_id"); tid != "" {
		filter.TerminalID = &tid
	}

	// Pagination
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if limit, err := strconv.Atoi(limitStr); err == nil && limit > 0 && limit <= 250 {
			filter.Limit = limit
		}
	}
	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if page, err := strconv.Atoi(pageStr); err == nil && page > 0 {
			filter.Offset = (page - 1) * filter.Limit
		}
	}

	batches, total, err := h.terminalService.ListImportBatches(r.Context(), filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list import batches")
		return
	}

	data := make([]*models.ImportBatch, 0, len(batches))
	for i := range batches {
		data = append(data, h.mapImportBatchToResponse(&batches[i]))
	}

	hasMore := int64(filter.Offset+filter.Limit) < total
	response := &models.ImportBatchList{
		Data: data,
		Meta: &models.PaginationMeta{
			Total:   total,
			Limit:   int64(filter.Limit),
			HasMore: hasMore,
		},
	}
	respondJSON(w, http.StatusOK, response)
}

// GetImportBatch handles GET /import-batches/{id}
func (h *TerminalHandler) GetImportBatch(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}
	_ = tenantID // used for tenant context; scoping is done at repo layer

	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid batch ID")
		return
	}

	batch, err := h.terminalService.GetImportBatch(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrImportBatchNotFound) {
			respondError(w, http.StatusNotFound, "Import batch not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "Failed to get import batch")
		return
	}

	respondJSON(w, http.StatusOK, h.mapImportBatchToResponse(batch))
}

// --- Response mapping helpers ---

func (h *TerminalHandler) mapRawBookingToResponse(b *model.RawTerminalBooking) *models.RawTerminalBooking {
	id := strfmt.UUID(b.ID.String())
	tenantID := strfmt.UUID(b.TenantID.String())
	batchID := strfmt.UUID(b.ImportBatchID.String())
	pin := b.EmployeePIN
	rawCode := b.RawBookingCode
	rawTS := strfmt.DateTime(b.RawTimestamp)
	bookingDate := strfmt.Date(b.BookingDate)
	status := string(b.Status)
	terminalID := b.TerminalID

	resp := &models.RawTerminalBooking{
		ID:             &id,
		TenantID:       &tenantID,
		ImportBatchID:  &batchID,
		TerminalID:     &terminalID,
		EmployeePin:    &pin,
		RawTimestamp:   &rawTS,
		RawBookingCode: &rawCode,
		BookingDate:    &bookingDate,
		Status:         &status,
		CreatedAt:      strfmt.DateTime(b.CreatedAt),
		UpdatedAt:      strfmt.DateTime(b.UpdatedAt),
	}

	if b.EmployeeID != nil {
		empID := strfmt.UUID(b.EmployeeID.String())
		resp.EmployeeID = &empID
	}
	if b.BookingTypeID != nil {
		btID := strfmt.UUID(b.BookingTypeID.String())
		resp.BookingTypeID = &btID
	}
	if b.ProcessedBookingID != nil {
		pbID := strfmt.UUID(b.ProcessedBookingID.String())
		resp.ProcessedBookingID = &pbID
	}
	if b.ErrorMessage != nil {
		resp.ErrorMessage = b.ErrorMessage
	}

	// Map employee summary if preloaded
	if b.Employee != nil {
		empID := strfmt.UUID(b.Employee.ID.String())
		fn := b.Employee.FirstName
		ln := b.Employee.LastName
		pn := b.Employee.PersonnelNumber
		resp.Employee = &models.EmployeeSummary{
			ID:              &empID,
			FirstName:       &fn,
			LastName:        &ln,
			PersonnelNumber: &pn,
			IsActive:        b.Employee.IsActive,
		}
		if b.Employee.DepartmentID != nil {
			depID := strfmt.UUID(b.Employee.DepartmentID.String())
			resp.Employee.DepartmentID = &depID
		}
	}

	// Map booking type summary if preloaded
	if b.BookingType != nil {
		btID := strfmt.UUID(b.BookingType.ID.String())
		code := b.BookingType.Code
		name := b.BookingType.Name
		dir := string(b.BookingType.Direction)
		resp.BookingType = &models.BookingTypeSummary{
			ID:        &btID,
			Code:      &code,
			Name:      &name,
			Direction: &dir,
		}
	}

	return resp
}

func (h *TerminalHandler) mapImportBatchToResponse(b *model.ImportBatch) *models.ImportBatch {
	id := strfmt.UUID(b.ID.String())
	tenantID := strfmt.UUID(b.TenantID.String())
	ref := b.BatchReference
	source := b.Source
	status := string(b.Status)

	resp := &models.ImportBatch{
		ID:              &id,
		TenantID:        &tenantID,
		BatchReference:  &ref,
		Source:          &source,
		Status:          &status,
		RecordsTotal:    int64(b.RecordsTotal),
		RecordsImported: int64(b.RecordsImported),
		RecordsFailed:   int64(b.RecordsFailed),
		CreatedAt:       strfmt.DateTime(b.CreatedAt),
		UpdatedAt:       strfmt.DateTime(b.UpdatedAt),
	}

	if b.TerminalID != nil {
		resp.TerminalID = b.TerminalID
	}
	if b.ErrorMessage != nil {
		resp.ErrorMessage = b.ErrorMessage
	}
	if b.StartedAt != nil {
		dt := strfmt.DateTime(*b.StartedAt)
		resp.StartedAt = &dt
	}
	if b.CompletedAt != nil {
		dt := strfmt.DateTime(*b.CompletedAt)
		resp.CompletedAt = &dt
	}

	return resp
}
