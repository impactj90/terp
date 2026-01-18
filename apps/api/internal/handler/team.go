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

type TeamHandler struct {
	teamService *service.TeamService
}

func NewTeamHandler(teamService *service.TeamService) *TeamHandler {
	return &TeamHandler{teamService: teamService}
}

// TeamList represents the response format for listing teams.
type TeamList struct {
	Items      []model.Team `json:"items"`
	NextCursor string       `json:"next_cursor,omitempty"`
}

func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	// Check for is_active filter (per OpenAPI spec)
	isActive := r.URL.Query().Get("is_active") == "true"

	// Check for department_id filter
	departmentIDStr := r.URL.Query().Get("department_id")

	var teams []model.Team
	var err error

	if departmentIDStr != "" {
		departmentID, parseErr := uuid.Parse(departmentIDStr)
		if parseErr != nil {
			respondError(w, http.StatusBadRequest, "Invalid department ID")
			return
		}
		teams, err = h.teamService.ListByDepartment(r.Context(), departmentID)
	} else if isActive {
		teams, err = h.teamService.ListActive(r.Context(), tenantID)
	} else {
		teams, err = h.teamService.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list teams")
		return
	}

	// Return TeamList wrapper per OpenAPI spec
	response := TeamList{
		Items: teams,
	}
	respondJSON(w, http.StatusOK, response)
}

func (h *TeamHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	// Check for include_members query param per OpenAPI spec
	includeMembers := r.URL.Query().Get("include_members") == "true"

	var team *model.Team
	if includeMembers {
		team, err = h.teamService.GetWithMembers(r.Context(), id)
	} else {
		team, err = h.teamService.GetByID(r.Context(), id)
	}

	if err != nil {
		respondError(w, http.StatusNotFound, "Team not found")
		return
	}

	respondJSON(w, http.StatusOK, team)
}

func (h *TeamHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateTeamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate using generated validation
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateTeamInput{
		TenantID:    tenantID,
		Name:        *req.Name,
		Description: req.Description,
	}

	// Handle optional department_id
	if req.DepartmentID != "" {
		departmentID, err := uuid.Parse(req.DepartmentID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid department ID")
			return
		}
		input.DepartmentID = &departmentID
	}

	// Handle optional leader_employee_id
	if req.LeaderEmployeeID != "" {
		leaderID, err := uuid.Parse(req.LeaderEmployeeID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid leader employee ID")
			return
		}
		input.LeaderEmployeeID = &leaderID
	}

	team, err := h.teamService.Create(r.Context(), input)
	if err != nil {
		switch err {
		case service.ErrTeamNameRequired:
			respondError(w, http.StatusBadRequest, "Team name is required")
		case service.ErrTeamNameExists:
			respondError(w, http.StatusBadRequest, "A team with this name already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to create team")
		}
		return
	}

	respondJSON(w, http.StatusCreated, team)
}

func (h *TeamHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	var req models.UpdateTeamRequest
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
	input := service.UpdateTeamInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	// Handle department_id
	if req.DepartmentID != "" {
		departmentID, err := uuid.Parse(req.DepartmentID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid department ID")
			return
		}
		input.DepartmentID = &departmentID
	}
	// Handle leader_employee_id
	if req.LeaderEmployeeID != "" {
		leaderID, err := uuid.Parse(req.LeaderEmployeeID.String())
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid leader employee ID")
			return
		}
		input.LeaderEmployeeID = &leaderID
	}
	// Note: IsActive cannot be reliably detected as "provided" vs "default false"
	// with the current OpenAPI spec design.
	input.IsActive = &req.IsActive

	team, err := h.teamService.Update(r.Context(), id, input)
	if err != nil {
		switch err {
		case service.ErrTeamNotFound:
			respondError(w, http.StatusNotFound, "Team not found")
		case service.ErrTeamNameRequired:
			respondError(w, http.StatusBadRequest, "Team name cannot be empty")
		case service.ErrTeamNameExists:
			respondError(w, http.StatusBadRequest, "A team with this name already exists")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update team")
		}
		return
	}

	respondJSON(w, http.StatusOK, team)
}

func (h *TeamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	if err := h.teamService.Delete(r.Context(), id); err != nil {
		switch err {
		case service.ErrTeamNotFound:
			respondError(w, http.StatusNotFound, "Team not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to delete team")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *TeamHandler) GetWithMembers(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	team, err := h.teamService.GetWithMembers(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Team not found")
		return
	}

	respondJSON(w, http.StatusOK, team)
}

// TeamMemberList represents the response format for listing team members.
type TeamMemberList struct {
	Items []model.TeamMember `json:"items"`
}

func (h *TeamHandler) GetMembers(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	members, err := h.teamService.GetMembers(r.Context(), id)
	if err != nil {
		switch err {
		case service.ErrTeamNotFound:
			respondError(w, http.StatusNotFound, "Team not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to get team members")
		}
		return
	}

	// Return wrapper per OpenAPI spec
	response := TeamMemberList{
		Items: members,
	}
	respondJSON(w, http.StatusOK, response)
}

func (h *TeamHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	teamID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	var req models.AddTeamMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	employeeID, err := uuid.Parse(req.EmployeeID.String())
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	// Default to member role if not specified
	roleStr := string(req.Role)
	if roleStr == "" {
		roleStr = "member"
	}

	role, err := service.ValidateTeamMemberRole(roleStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid role. Must be one of: member, lead, deputy")
		return
	}

	member, err := h.teamService.AddMember(r.Context(), teamID, employeeID, role)
	if err != nil {
		switch err {
		case service.ErrTeamNotFound:
			respondError(w, http.StatusNotFound, "Team not found")
		case service.ErrMemberExists:
			respondError(w, http.StatusConflict, "Employee is already a team member")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to add team member")
		}
		return
	}

	// Return TeamMember body per OpenAPI spec
	respondJSON(w, http.StatusCreated, member)
}

func (h *TeamHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	teamID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	// Use employee_id path param per OpenAPI spec
	employeeIDStr := chi.URLParam(r, "employee_id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	if err := h.teamService.RemoveMember(r.Context(), teamID, employeeID); err != nil {
		switch err {
		case service.ErrTeamNotFound:
			respondError(w, http.StatusNotFound, "Team not found")
		case service.ErrMemberNotFound:
			respondError(w, http.StatusNotFound, "Team member not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to remove team member")
		}
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *TeamHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	teamID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid team ID")
		return
	}

	// Use employee_id path param per OpenAPI spec
	employeeIDStr := chi.URLParam(r, "employee_id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	var req models.UpdateTeamMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	role, err := service.ValidateTeamMemberRole(string(*req.Role))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid role. Must be one of: member, lead, deputy")
		return
	}

	member, err := h.teamService.UpdateMemberRole(r.Context(), teamID, employeeID, role)
	if err != nil {
		switch err {
		case service.ErrTeamNotFound:
			respondError(w, http.StatusNotFound, "Team not found")
		case service.ErrMemberNotFound:
			respondError(w, http.StatusNotFound, "Team member not found")
		default:
			respondError(w, http.StatusInternalServerError, "Failed to update member role")
		}
		return
	}

	// Return TeamMember body per OpenAPI spec
	respondJSON(w, http.StatusOK, member)
}

// GetEmployeeTeams returns all teams for a specific employee.
func (h *TeamHandler) GetEmployeeTeams(w http.ResponseWriter, r *http.Request) {
	employeeIDStr := chi.URLParam(r, "employee_id")
	employeeID, err := uuid.Parse(employeeIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid employee ID")
		return
	}

	teams, err := h.teamService.GetMemberTeams(r.Context(), employeeID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to get employee teams")
		return
	}

	// Return TeamList wrapper per OpenAPI spec
	response := TeamList{
		Items: teams,
	}
	respondJSON(w, http.StatusOK, response)
}
