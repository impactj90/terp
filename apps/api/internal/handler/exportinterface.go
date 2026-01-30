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

// ExportInterfaceHandler handles export interface HTTP requests.
type ExportInterfaceHandler struct {
	svc          *service.ExportInterfaceService
	auditService *service.AuditLogService
}

// NewExportInterfaceHandler creates a new ExportInterfaceHandler.
func NewExportInterfaceHandler(svc *service.ExportInterfaceService) *ExportInterfaceHandler {
	return &ExportInterfaceHandler{svc: svc}
}

// SetAuditService sets the audit log service for this handler.
func (h *ExportInterfaceHandler) SetAuditService(s *service.AuditLogService) {
	h.auditService = s
}

// List handles GET /export-interfaces
func (h *ExportInterfaceHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	activeOnly := r.URL.Query().Get("active_only") == "true"

	interfaces, err := h.svc.List(r.Context(), tenantID, activeOnly)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list export interfaces")
		return
	}

	respondJSON(w, http.StatusOK, exportInterfaceListToResponse(interfaces))
}

// Get handles GET /export-interfaces/{id}
func (h *ExportInterfaceHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export interface ID")
		return
	}

	ei, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		handleExportInterfaceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, exportInterfaceToResponse(ei))
}

// Create handles POST /export-interfaces
func (h *ExportInterfaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateExportInterfaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateExportInterfaceInput{
		TenantID:        tenantID,
		InterfaceNumber: int(*req.InterfaceNumber),
		Name:            *req.Name,
	}
	if req.MandantNumber != "" {
		input.MandantNumber = &req.MandantNumber
	}
	if req.ExportScript != "" {
		input.ExportScript = &req.ExportScript
	}
	if req.ExportPath != "" {
		input.ExportPath = &req.ExportPath
	}
	if req.OutputFilename != "" {
		input.OutputFilename = &req.OutputFilename
	}

	ei, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleExportInterfaceError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionCreate,
				EntityType: "export_interface",
				EntityID:   ei.ID,
			})
		}
	}

	respondJSON(w, http.StatusCreated, exportInterfaceToResponse(ei))
}

// Update handles PATCH /export-interfaces/{id}
func (h *ExportInterfaceHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export interface ID")
		return
	}

	var req models.UpdateExportInterfaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateExportInterfaceInput{}
	if req.InterfaceNumber != 0 {
		num := int(req.InterfaceNumber)
		input.InterfaceNumber = &num
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.MandantNumber != "" {
		input.MandantNumber = &req.MandantNumber
	}
	if req.ExportScript != "" {
		input.ExportScript = &req.ExportScript
	}
	if req.ExportPath != "" {
		input.ExportPath = &req.ExportPath
	}
	if req.OutputFilename != "" {
		input.OutputFilename = &req.OutputFilename
	}
	input.IsActive = &req.IsActive

	ei, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleExportInterfaceError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionUpdate,
				EntityType: "export_interface",
				EntityID:   ei.ID,
			})
		}
	}

	respondJSON(w, http.StatusOK, exportInterfaceToResponse(ei))
}

// Delete handles DELETE /export-interfaces/{id}
func (h *ExportInterfaceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export interface ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleExportInterfaceError(w, err)
		return
	}

	// Audit log
	if h.auditService != nil {
		if tid, ok := middleware.TenantFromContext(r.Context()); ok {
			h.auditService.Log(r.Context(), r, service.LogEntry{
				TenantID:   tid,
				Action:     model.AuditActionDelete,
				EntityType: "export_interface",
				EntityID:   id,
			})
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// SetAccounts handles PUT /export-interfaces/{id}/accounts
func (h *ExportInterfaceHandler) SetAccounts(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export interface ID")
		return
	}

	var req models.SetExportInterfaceAccountsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	accountIDs := make([]uuid.UUID, len(req.AccountIds))
	for i, aid := range req.AccountIds {
		parsed, err := uuid.Parse(aid.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid account ID")
			return
		}
		accountIDs[i] = parsed
	}

	accounts, err := h.svc.SetAccounts(r.Context(), id, accountIDs)
	if err != nil {
		handleExportInterfaceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"data": exportInterfaceAccountsToResponse(accounts),
	})
}

// ListAccounts handles GET /export-interfaces/{id}/accounts
func (h *ExportInterfaceHandler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid export interface ID")
		return
	}

	accounts, err := h.svc.ListAccounts(r.Context(), id)
	if err != nil {
		handleExportInterfaceError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"data": exportInterfaceAccountsToResponse(accounts),
	})
}

// --- Response mapping ---

func exportInterfaceToResponse(ei *model.ExportInterface) *models.ExportInterface {
	id := strfmt.UUID(ei.ID.String())
	tenantID := strfmt.UUID(ei.TenantID.String())
	number := int64(ei.InterfaceNumber)

	resp := &models.ExportInterface{
		ID:              &id,
		TenantID:        &tenantID,
		InterfaceNumber: &number,
		Name:            &ei.Name,
		IsActive:        ei.IsActive,
		CreatedAt:       strfmt.DateTime(ei.CreatedAt),
		UpdatedAt:       strfmt.DateTime(ei.UpdatedAt),
	}

	if ei.MandantNumber != nil {
		resp.MandantNumber = ei.MandantNumber
	}
	if ei.ExportScript != nil {
		resp.ExportScript = ei.ExportScript
	}
	if ei.ExportPath != nil {
		resp.ExportPath = ei.ExportPath
	}
	if ei.OutputFilename != nil {
		resp.OutputFilename = ei.OutputFilename
	}

	if len(ei.Accounts) > 0 {
		resp.Accounts = exportInterfaceAccountsToResponse(ei.Accounts)
	}

	return resp
}

func exportInterfaceListToResponse(interfaces []model.ExportInterface) *models.ExportInterfaceList {
	data := make([]*models.ExportInterface, 0, len(interfaces))
	for i := range interfaces {
		data = append(data, exportInterfaceToResponse(&interfaces[i]))
	}
	return &models.ExportInterfaceList{Data: data}
}

func exportInterfaceAccountsToResponse(accounts []model.ExportInterfaceAccount) []*models.ExportInterfaceAccount {
	result := make([]*models.ExportInterfaceAccount, 0, len(accounts))
	for _, a := range accounts {
		accountID := strfmt.UUID(a.AccountID.String())
		resp := &models.ExportInterfaceAccount{
			AccountID: &accountID,
			SortOrder: int64(a.SortOrder),
		}
		if a.Account != nil {
			resp.AccountCode = a.Account.Code
			resp.AccountName = a.Account.Name
			if a.Account.PayrollCode != nil {
				resp.PayrollCode = a.Account.PayrollCode
			}
		}
		result = append(result, resp)
	}
	return result
}

func handleExportInterfaceError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrExportInterfaceNotFound:
		respondError(w, http.StatusNotFound, "Export interface not found")
	case service.ErrExportInterfaceNameRequired:
		respondError(w, http.StatusBadRequest, "Name is required")
	case service.ErrExportInterfaceNumberRequired:
		respondError(w, http.StatusBadRequest, "Interface number is required and must be positive")
	case service.ErrExportInterfaceNumberExists:
		respondError(w, http.StatusConflict, "An interface with this number already exists")
	case service.ErrExportInterfaceInUse:
		respondError(w, http.StatusConflict, "Interface has generated exports and cannot be deleted")
	case service.ErrExportInterfaceNoAccounts:
		respondError(w, http.StatusBadRequest, "No account IDs provided")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
