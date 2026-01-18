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

type DepartmentHandler struct {
	departmentService *service.DepartmentService
}

func NewDepartmentHandler(departmentService *service.DepartmentService) *DepartmentHandler {
	return &DepartmentHandler{departmentService: departmentService}
}

// DepartmentList represents the response format for listing departments.
type DepartmentList struct {
	Data []model.Department `json:"data"`
}

func (h *DepartmentHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for active filter (per OpenAPI spec)
	active := r.URL.Query().Get("active") == "true"

	// Check for parent_id filter (per OpenAPI spec)
	parentIDStr := r.URL.Query().Get("parent_id")

	var departments []model.Department
	var err error
	if active {
		departments, err = h.departmentService.ListActive(r.Context(), tenantID)
	} else {
		departments, err = h.departmentService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list departments")
		return
	}

	// Filter by parent_id if provided
	if parentIDStr != "" {
		parentID, parseErr := uuid.Parse(parentIDStr)
		if parseErr != nil {
			respondError(w, http.StatusBadRequest, "Invalid parent ID")
			return
		}
		filtered := make([]model.Department, 0)
		for _, d := range departments {
			if d.ParentID != nil && *d.ParentID == parentID {
				filtered = append(filtered, d)
			}
		}
		departments = filtered
	}

	// Return DepartmentList wrapper per OpenAPI spec
	response := DepartmentList{
		Data: departments,
	}
	respondJSON(w, http.StatusOK, response)
}

func (h *DepartmentHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid department ID")
		return
	}

	dept, err := h.departmentService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Department not found")
		return
	}

	respondJSON(w, http.StatusOK, dept)
}

func (h *DepartmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateDepartmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateDepartmentInput{
		TenantID:    tenantID,
		Code:        *req.Code,
		Name:        *req.Name,
		Description: req.Description,
	}

	// Handle optional parent_id
	if req.ParentID != "" {
		parentID, err := uuid.Parse(req.ParentID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid parent ID")
			return
		}
		input.ParentID = &parentID
	}

	// Handle optional manager_id
	if req.ManagerID != "" {
		managerID, err := uuid.Parse(req.ManagerID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid manager ID")
			return
		}
		input.ManagerEmployeeID = &managerID
	}

	dept, err := h.departmentService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrDepartmentCodeRequired:
			respondError(w, http.StatusBadRequest, "Department code is required")
		case service.ErrDepartmentNameRequired:
			respondError(w, http.StatusBadRequest, "Department name is required")
		case service.ErrDepartmentCodeExists:
			respondError(w, http.StatusBadRequest, "A department with this code already exists")
		case service.ErrParentNotFound:
			respondError(w, http.StatusBadRequest, "Parent department not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create department")
		}
		return
	}

	respondJSON(w, http.StatusCreated, dept)
}

func (h *DepartmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid department ID")
		return
	}

	var req models.UpdateDepartmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Convert to service input - only set fields that were provided
	input := service.UpdateDepartmentInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	// Handle parent_id - note: setting to empty string could mean "clear parent"
	if req.ParentID != "" {
		parentID, err := uuid.Parse(req.ParentID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid parent ID")
			return
		}
		input.ParentID = &parentID
	}
	// Handle manager_id
	if req.ManagerID != "" {
		managerID, err := uuid.Parse(req.ManagerID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid manager ID")
			return
		}
		input.ManagerEmployeeID = &managerID
	}
	// Note: IsActive cannot be reliably detected as "provided" vs "default false"
	// with the current OpenAPI spec design. Consider using x-nullable in spec.
	input.IsActive = &req.IsActive

	dept, err := h.departmentService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrDepartmentNotFound:
			respondError(w, http.StatusNotFound, "Department not found")
		case service.ErrDepartmentCodeRequired:
			respondError(w, http.StatusBadRequest, "Department code cannot be empty")
		case service.ErrDepartmentNameRequired:
			respondError(w, http.StatusBadRequest, "Department name cannot be empty")
		case service.ErrDepartmentCodeExists:
			respondError(w, http.StatusBadRequest, "A department with this code already exists")
		case service.ErrCircularReference:
			respondError(w, http.StatusBadRequest, "Cannot set parent: would create circular reference")
		case service.ErrParentNotFound:
			respondError(w, http.StatusBadRequest, "Parent department not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update department")
		}
		return
	}

	respondJSON(w, http.StatusOK, dept)
}

func (h *DepartmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid department ID")
		return
	}

	if err := h.departmentService.Delete(r.Context(), id); err != nil {
		switch err {
		case service.ErrDepartmentNotFound:
			respondError(w, http.StatusNotFound, "Department not found")
		case service.ErrCannotDeleteWithChildren:
			respondError(w, http.StatusBadRequest, "Cannot delete department with children")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete department")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *DepartmentHandler) GetTree(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	hierarchy, err := h.departmentService.GetHierarchy(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get department hierarchy")
		return
	}

	respondJSON(w, http.StatusOK, hierarchy)
}
