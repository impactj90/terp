package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrTeamNotFound   = errors.New("team not found")
	ErrMemberNotFound = errors.New("team member not found")
)

// TeamRepository handles team data access.
type TeamRepository struct {
	db *DB
}

// NewTeamRepository creates a new team repository.
func NewTeamRepository(db *DB) *TeamRepository {
	return &TeamRepository{db: db}
}

// Create creates a new team.
func (r *TeamRepository) Create(ctx context.Context, team *model.Team) error {
	return r.db.GORM.WithContext(ctx).
		Select("TenantID", "DepartmentID", "Name", "Description", "LeaderEmployeeID", "IsActive").
		Create(team).Error
}

// GetByID retrieves a team by ID.
func (r *TeamRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Team, error) {
	var team model.Team
	err := r.db.GORM.WithContext(ctx).
		First(&team, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTeamNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get team: %w", err)
	}
	return &team, nil
}

// GetByName retrieves a team by tenant ID and name.
func (r *TeamRepository) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Team, error) {
	var team model.Team
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND name = ?", tenantID, name).
		First(&team).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTeamNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get team by name: %w", err)
	}
	return &team, nil
}

// Update updates a team.
func (r *TeamRepository) Update(ctx context.Context, team *model.Team) error {
	return r.db.GORM.WithContext(ctx).Save(team).Error
}

// Delete deletes a team by ID.
func (r *TeamRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Team{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete team: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrTeamNotFound
	}
	return nil
}

// List retrieves all teams for a tenant.
func (r *TeamRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error) {
	var teams []model.Team
	err := r.db.GORM.WithContext(ctx).
		Preload("Department").
		Preload("Leader").
		Where("tenant_id = ?", tenantID).
		Order("name ASC").
		Find(&teams).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list teams: %w", err)
	}
	if err := r.populateMemberCounts(ctx, teams); err != nil {
		return nil, err
	}
	return teams, nil
}

// ListActive retrieves all active teams for a tenant.
func (r *TeamRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Team, error) {
	var teams []model.Team
	err := r.db.GORM.WithContext(ctx).
		Preload("Department").
		Preload("Leader").
		Where("tenant_id = ? AND is_active = ?", tenantID, true).
		Order("name ASC").
		Find(&teams).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list active teams: %w", err)
	}
	if err := r.populateMemberCounts(ctx, teams); err != nil {
		return nil, err
	}
	return teams, nil
}

// ListByDepartment retrieves all teams for a department.
func (r *TeamRepository) ListByDepartment(ctx context.Context, departmentID uuid.UUID) ([]model.Team, error) {
	var teams []model.Team
	err := r.db.GORM.WithContext(ctx).
		Preload("Department").
		Preload("Leader").
		Where("department_id = ?", departmentID).
		Order("name ASC").
		Find(&teams).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list teams by department: %w", err)
	}
	if err := r.populateMemberCounts(ctx, teams); err != nil {
		return nil, err
	}
	return teams, nil
}

// populateMemberCounts fills in the MemberCount field for a slice of teams.
func (r *TeamRepository) populateMemberCounts(ctx context.Context, teams []model.Team) error {
	if len(teams) == 0 {
		return nil
	}

	// Collect team IDs
	teamIDs := make([]uuid.UUID, len(teams))
	for i, t := range teams {
		teamIDs[i] = t.ID
	}

	// Query member counts
	type countResult struct {
		TeamID uuid.UUID
		Count  int
	}
	var counts []countResult
	err := r.db.GORM.WithContext(ctx).
		Model(&model.TeamMember{}).
		Select("team_id, COUNT(*) as count").
		Where("team_id IN ?", teamIDs).
		Group("team_id").
		Scan(&counts).Error
	if err != nil {
		return fmt.Errorf("failed to get member counts: %w", err)
	}

	// Build lookup map
	countMap := make(map[uuid.UUID]int, len(counts))
	for _, c := range counts {
		countMap[c.TeamID] = c.Count
	}

	// Populate teams
	for i := range teams {
		teams[i].MemberCount = countMap[teams[i].ID]
	}

	return nil
}

// GetWithMembers retrieves a team with its members preloaded.
func (r *TeamRepository) GetWithMembers(ctx context.Context, id uuid.UUID) (*model.Team, error) {
	var team model.Team
	err := r.db.GORM.WithContext(ctx).
		Preload("Department").
		Preload("Leader").
		Preload("Members").
		Preload("Members.Employee").
		Preload("Members.Employee.Department").
		First(&team, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrTeamNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get team with members: %w", err)
	}
	return &team, nil
}

// AddMember adds a member to a team.
func (r *TeamRepository) AddMember(ctx context.Context, teamID, employeeID uuid.UUID, role model.TeamMemberRole) error {
	member := &model.TeamMember{
		TeamID:     teamID,
		EmployeeID: employeeID,
		Role:       role,
	}
	return r.db.GORM.WithContext(ctx).Create(member).Error
}

// RemoveMember removes a member from a team.
func (r *TeamRepository) RemoveMember(ctx context.Context, teamID, employeeID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).
		Delete(&model.TeamMember{}, "team_id = ? AND employee_id = ?", teamID, employeeID)
	if result.Error != nil {
		return fmt.Errorf("failed to remove team member: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMemberNotFound
	}
	return nil
}

// GetMember retrieves a team member.
func (r *TeamRepository) GetMember(ctx context.Context, teamID, employeeID uuid.UUID) (*model.TeamMember, error) {
	var member model.TeamMember
	err := r.db.GORM.WithContext(ctx).
		Where("team_id = ? AND employee_id = ?", teamID, employeeID).
		First(&member).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrMemberNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get team member: %w", err)
	}
	return &member, nil
}

// UpdateMemberRole updates a team member's role.
func (r *TeamRepository) UpdateMemberRole(ctx context.Context, teamID, employeeID uuid.UUID, role model.TeamMemberRole) error {
	result := r.db.GORM.WithContext(ctx).
		Model(&model.TeamMember{}).
		Where("team_id = ? AND employee_id = ?", teamID, employeeID).
		Update("role", role)
	if result.Error != nil {
		return fmt.Errorf("failed to update member role: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrMemberNotFound
	}
	return nil
}

// GetMemberTeams retrieves all teams for an employee.
func (r *TeamRepository) GetMemberTeams(ctx context.Context, employeeID uuid.UUID) ([]model.Team, error) {
	var teams []model.Team
	err := r.db.GORM.WithContext(ctx).
		Joins("JOIN team_members ON team_members.team_id = teams.id").
		Where("team_members.employee_id = ?", employeeID).
		Order("teams.name ASC").
		Find(&teams).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get member teams: %w", err)
	}
	return teams, nil
}

// GetMembers retrieves all members of a team.
func (r *TeamRepository) GetMembers(ctx context.Context, teamID uuid.UUID) ([]model.TeamMember, error) {
	var members []model.TeamMember
	err := r.db.GORM.WithContext(ctx).
		Where("team_id = ?", teamID).
		Order("joined_at ASC").
		Find(&members).Error

	if err != nil {
		return nil, fmt.Errorf("failed to get team members: %w", err)
	}
	return members, nil
}
