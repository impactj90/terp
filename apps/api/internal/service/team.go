package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrTeamNotFound     = errors.New("team not found")
	ErrTeamNameRequired = errors.New("team name is required")
	ErrTeamNameExists   = errors.New("team name already exists")
	ErrMemberNotFound   = errors.New("team member not found")
	ErrMemberExists     = errors.New("employee is already a team member")
	ErrInvalidRole      = errors.New("invalid team member role")
)

// teamRepository defines the interface for team data access.
type teamRepository interface {
	Create(ctx context.Context, team *model.Team) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Team, error)
	GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Team, error)
	Update(ctx context.Context, team *model.Team) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error)
	ListByDepartment(ctx context.Context, departmentID uuid.UUID) ([]model.Team, error)
	GetWithMembers(ctx context.Context, id uuid.UUID) (*model.Team, error)
	AddMember(ctx context.Context, teamID, employeeID uuid.UUID, role model.TeamMemberRole) error
	RemoveMember(ctx context.Context, teamID, employeeID uuid.UUID) error
	GetMember(ctx context.Context, teamID, employeeID uuid.UUID) (*model.TeamMember, error)
	UpdateMemberRole(ctx context.Context, teamID, employeeID uuid.UUID, role model.TeamMemberRole) error
	GetMemberTeams(ctx context.Context, employeeID uuid.UUID) ([]model.Team, error)
	GetMembers(ctx context.Context, teamID uuid.UUID) ([]model.TeamMember, error)
	Upsert(ctx context.Context, team *model.Team) error
	UpsertMember(ctx context.Context, member *model.TeamMember) error
}

type TeamService struct {
	teamRepo teamRepository
}

func NewTeamService(teamRepo teamRepository) *TeamService {
	return &TeamService{teamRepo: teamRepo}
}

// CreateTeamInput represents the input for creating a team.
type CreateTeamInput struct {
	TenantID         uuid.UUID
	Name             string
	Description      string
	DepartmentID     *uuid.UUID
	LeaderEmployeeID *uuid.UUID
}

// Create creates a new team with validation.
func (s *TeamService) Create(ctx context.Context, input CreateTeamInput) (*model.Team, error) {
	// Validate required fields
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrTeamNameRequired
	}

	// Check for existing team with same name for this tenant
	existing, err := s.teamRepo.GetByName(ctx, input.TenantID, name)
	if err == nil && existing != nil {
		return nil, ErrTeamNameExists
	}

	team := &model.Team{
		TenantID:         input.TenantID,
		Name:             name,
		Description:      strings.TrimSpace(input.Description),
		DepartmentID:     input.DepartmentID,
		LeaderEmployeeID: input.LeaderEmployeeID,
		IsActive:         true,
	}

	if err := s.teamRepo.Create(ctx, team); err != nil {
		return nil, err
	}

	return team, nil
}

// GetByID retrieves a team by ID.
func (s *TeamService) GetByID(ctx context.Context, id uuid.UUID) (*model.Team, error) {
	team, err := s.teamRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTeamNotFound
	}
	return team, nil
}

// GetByName retrieves a team by tenant ID and name.
func (s *TeamService) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Team, error) {
	team, err := s.teamRepo.GetByName(ctx, tenantID, name)
	if err != nil {
		return nil, ErrTeamNotFound
	}
	return team, nil
}

// UpdateTeamInput represents the input for updating a team.
type UpdateTeamInput struct {
	Name             *string
	Description      *string
	DepartmentID     *uuid.UUID
	LeaderEmployeeID *uuid.UUID
	IsActive         *bool
	ClearDepartment  bool // If true, sets DepartmentID to nil
	ClearLeader      bool // If true, sets LeaderEmployeeID to nil
}

// Update updates a team.
func (s *TeamService) Update(ctx context.Context, id uuid.UUID, input UpdateTeamInput) (*model.Team, error) {
	team, err := s.teamRepo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrTeamNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrTeamNameRequired
		}
		// Check if the new name conflicts with another team
		if name != team.Name {
			existing, err := s.teamRepo.GetByName(ctx, team.TenantID, name)
			if err == nil && existing != nil {
				return nil, ErrTeamNameExists
			}
		}
		team.Name = name
	}
	if input.Description != nil {
		team.Description = strings.TrimSpace(*input.Description)
	}
	if input.IsActive != nil {
		team.IsActive = *input.IsActive
	}

	// Handle department ID changes
	if input.ClearDepartment {
		team.DepartmentID = nil
	} else if input.DepartmentID != nil {
		team.DepartmentID = input.DepartmentID
	}

	// Handle leader ID changes
	if input.ClearLeader {
		team.LeaderEmployeeID = nil
	} else if input.LeaderEmployeeID != nil {
		team.LeaderEmployeeID = input.LeaderEmployeeID
	}

	if err := s.teamRepo.Update(ctx, team); err != nil {
		return nil, err
	}

	return team, nil
}

// Delete deletes a team by ID.
func (s *TeamService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.teamRepo.GetByID(ctx, id)
	if err != nil {
		return ErrTeamNotFound
	}

	return s.teamRepo.Delete(ctx, id)
}

// List retrieves all teams for a tenant.
func (s *TeamService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error) {
	return s.teamRepo.List(ctx, tenantID)
}

// ListActive retrieves all active teams for a tenant.
func (s *TeamService) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error) {
	return s.teamRepo.ListActive(ctx, tenantID)
}

// ListByDepartment retrieves all teams for a department.
func (s *TeamService) ListByDepartment(ctx context.Context, departmentID uuid.UUID) ([]model.Team, error) {
	return s.teamRepo.ListByDepartment(ctx, departmentID)
}

// GetWithMembers retrieves a team with its members preloaded.
func (s *TeamService) GetWithMembers(ctx context.Context, id uuid.UUID) (*model.Team, error) {
	team, err := s.teamRepo.GetWithMembers(ctx, id)
	if err != nil {
		return nil, ErrTeamNotFound
	}
	return team, nil
}

// ValidateTeamMemberRole checks if the given role is valid.
func ValidateTeamMemberRole(role string) (model.TeamMemberRole, error) {
	switch model.TeamMemberRole(role) {
	case model.TeamMemberRoleMember, model.TeamMemberRoleLead, model.TeamMemberRoleDeputy:
		return model.TeamMemberRole(role), nil
	default:
		return "", ErrInvalidRole
	}
}

// AddMember adds an employee to a team and returns the created member.
func (s *TeamService) AddMember(ctx context.Context, teamID, employeeID uuid.UUID, role model.TeamMemberRole) (*model.TeamMember, error) {
	// Verify team exists
	_, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil {
		return nil, ErrTeamNotFound
	}

	// Check if member already exists
	_, err = s.teamRepo.GetMember(ctx, teamID, employeeID)
	if err == nil {
		return nil, ErrMemberExists
	}

	if err := s.teamRepo.AddMember(ctx, teamID, employeeID, role); err != nil {
		return nil, err
	}

	// Return the created member
	return s.teamRepo.GetMember(ctx, teamID, employeeID)
}

// RemoveMember removes an employee from a team.
func (s *TeamService) RemoveMember(ctx context.Context, teamID, employeeID uuid.UUID) error {
	// Verify team exists
	_, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil {
		return ErrTeamNotFound
	}

	err = s.teamRepo.RemoveMember(ctx, teamID, employeeID)
	if err != nil {
		return ErrMemberNotFound
	}
	return nil
}

// UpdateMemberRole updates a team member's role and returns the updated member.
func (s *TeamService) UpdateMemberRole(ctx context.Context, teamID, employeeID uuid.UUID, role model.TeamMemberRole) (*model.TeamMember, error) {
	// Verify team exists
	_, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil {
		return nil, ErrTeamNotFound
	}

	err = s.teamRepo.UpdateMemberRole(ctx, teamID, employeeID, role)
	if err != nil {
		return nil, ErrMemberNotFound
	}

	// Return the updated member
	return s.teamRepo.GetMember(ctx, teamID, employeeID)
}

// GetMemberTeams retrieves all teams for an employee.
func (s *TeamService) GetMemberTeams(ctx context.Context, employeeID uuid.UUID) ([]model.Team, error) {
	return s.teamRepo.GetMemberTeams(ctx, employeeID)
}

// GetMembers retrieves all members of a team.
func (s *TeamService) GetMembers(ctx context.Context, teamID uuid.UUID) ([]model.TeamMember, error) {
	// Verify team exists
	_, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil {
		return nil, ErrTeamNotFound
	}

	return s.teamRepo.GetMembers(ctx, teamID)
}

// UpsertDevTeam creates or updates a team for dev mode seeding.
func (s *TeamService) UpsertDevTeam(ctx context.Context, team *model.Team) error {
	return s.teamRepo.Upsert(ctx, team)
}

// UpsertDevTeamMember creates or updates a team member for dev mode seeding.
func (s *TeamService) UpsertDevTeamMember(ctx context.Context, member *model.TeamMember) error {
	return s.teamRepo.UpsertMember(ctx, member)
}
