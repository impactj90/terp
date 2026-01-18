package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForTeam creates a tenant for use in team tests
func createTestTenantForTeam(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

// createTestEmployeeForTeam creates an employee for use in team tests
func createTestEmployeeForTeam(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "EMP-" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:6],
		FirstName:       "Test",
		LastName:        "Employee",
		IsActive:        true,
	}
	require.NoError(t, empRepo.Create(context.Background(), emp))
	return emp
}

func TestTeamRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{
		TenantID: tenant.ID,
		Name:     "Backend Team",
		IsActive: true,
	}

	err := repo.Create(ctx, team)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, team.ID)
}

func TestTeamRepository_Create_WithDescription(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{
		TenantID:    tenant.ID,
		Name:        "Backend Team",
		Description: "Handles backend development",
		IsActive:    true,
	}

	err := repo.Create(ctx, team)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, "Handles backend development", found.Description)
}

func TestTeamRepository_Create_WithDepartment(t *testing.T) {
	db := testutil.SetupTestDB(t)
	teamRepo := repository.NewTeamRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)

	// Create department
	dept := &model.Department{
		TenantID: tenant.ID,
		Code:     "ENG",
		Name:     "Engineering",
	}
	require.NoError(t, deptRepo.Create(ctx, dept))

	// Create team in department
	team := &model.Team{
		TenantID:     tenant.ID,
		DepartmentID: &dept.ID,
		Name:         "Backend Team",
		IsActive:     true,
	}
	err := teamRepo.Create(ctx, team)
	require.NoError(t, err)

	found, err := teamRepo.GetByID(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, dept.ID, *found.DepartmentID)
}

func TestTeamRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	require.NoError(t, repo.Create(ctx, team))

	found, err := repo.GetByID(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, team.ID, found.ID)
	assert.Equal(t, team.Name, found.Name)
}

func TestTeamRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTeamNotFound)
}

func TestTeamRepository_GetByName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	require.NoError(t, repo.Create(ctx, team))

	found, err := repo.GetByName(ctx, tenant.ID, "Backend Team")
	require.NoError(t, err)
	assert.Equal(t, team.ID, found.ID)
	assert.Equal(t, "Backend Team", found.Name)
}

func TestTeamRepository_GetByName_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	_, err := repo.GetByName(ctx, uuid.New(), "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrTeamNotFound)
}

func TestTeamRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{
		TenantID: tenant.ID,
		Name:     "Original Name",
	}
	require.NoError(t, repo.Create(ctx, team))

	team.Name = "Updated Name"
	err := repo.Update(ctx, team)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestTeamRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{
		TenantID: tenant.ID,
		Name:     "To Delete",
	}
	require.NoError(t, repo.Create(ctx, team))

	err := repo.Delete(ctx, team.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, team.ID)
	assert.ErrorIs(t, err, repository.ErrTeamNotFound)
}

func TestTeamRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTeamNotFound)
}

func TestTeamRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	require.NoError(t, repo.Create(ctx, &model.Team{TenantID: tenant.ID, Name: "Backend Team", IsActive: true}))
	require.NoError(t, repo.Create(ctx, &model.Team{TenantID: tenant.ID, Name: "Frontend Team", IsActive: false}))

	teams, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 2)
}

func TestTeamRepository_List_OrderedByName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	require.NoError(t, repo.Create(ctx, &model.Team{TenantID: tenant.ID, Name: "Zeta Team"}))
	require.NoError(t, repo.Create(ctx, &model.Team{TenantID: tenant.ID, Name: "Alpha Team"}))
	require.NoError(t, repo.Create(ctx, &model.Team{TenantID: tenant.ID, Name: "Beta Team"}))

	teams, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 3)
	assert.Equal(t, "Alpha Team", teams[0].Name)
	assert.Equal(t, "Beta Team", teams[1].Name)
	assert.Equal(t, "Zeta Team", teams[2].Name)
}

func TestTeamRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)

	teams, err := repo.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, teams)
}

func TestTeamRepository_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)

	// Create both as active first
	team1 := &model.Team{TenantID: tenant.ID, Name: "Backend Team", IsActive: true}
	team2 := &model.Team{TenantID: tenant.ID, Name: "Frontend Team", IsActive: true}
	require.NoError(t, repo.Create(ctx, team1))
	require.NoError(t, repo.Create(ctx, team2))

	// Then deactivate the second one via Update
	team2.IsActive = false
	require.NoError(t, repo.Update(ctx, team2))

	teams, err := repo.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 1)
	assert.Equal(t, "Backend Team", teams[0].Name)
}

func TestTeamRepository_ListByDepartment(t *testing.T) {
	db := testutil.SetupTestDB(t)
	teamRepo := repository.NewTeamRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)

	// Create departments
	dept1 := &model.Department{TenantID: tenant.ID, Code: "ENG", Name: "Engineering"}
	dept2 := &model.Department{TenantID: tenant.ID, Code: "HR", Name: "HR"}
	require.NoError(t, deptRepo.Create(ctx, dept1))
	require.NoError(t, deptRepo.Create(ctx, dept2))

	// Create teams in different departments
	require.NoError(t, teamRepo.Create(ctx, &model.Team{TenantID: tenant.ID, DepartmentID: &dept1.ID, Name: "Backend Team"}))
	require.NoError(t, teamRepo.Create(ctx, &model.Team{TenantID: tenant.ID, DepartmentID: &dept1.ID, Name: "Frontend Team"}))
	require.NoError(t, teamRepo.Create(ctx, &model.Team{TenantID: tenant.ID, DepartmentID: &dept2.ID, Name: "HR Team"}))

	teams, err := teamRepo.ListByDepartment(ctx, dept1.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 2)
}

func TestTeamRepository_ListByDepartment_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	teamRepo := repository.NewTeamRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)

	// Create department with no teams
	dept := &model.Department{TenantID: tenant.ID, Code: "ENG", Name: "Engineering"}
	require.NoError(t, deptRepo.Create(ctx, dept))

	teams, err := teamRepo.ListByDepartment(ctx, dept.ID)
	require.NoError(t, err)
	assert.Empty(t, teams)
}

func TestTeamRepository_GetWithMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	// Create employees and add as members
	emp1 := createTestEmployeeForTeam(t, db, tenant.ID)
	emp2 := createTestEmployeeForTeam(t, db, tenant.ID)
	require.NoError(t, repo.AddMember(ctx, team.ID, emp1.ID, model.TeamMemberRoleMember))
	require.NoError(t, repo.AddMember(ctx, team.ID, emp2.ID, model.TeamMemberRoleLead))

	found, err := repo.GetWithMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, team.ID, found.ID)
	assert.Len(t, found.Members, 2)
}

func TestTeamRepository_GetWithMembers_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	_, err := repo.GetWithMembers(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrTeamNotFound)
}

func TestTeamRepository_GetWithMembers_NoMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	found, err := repo.GetWithMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, team.ID, found.ID)
	assert.Empty(t, found.Members)
}

func TestTeamRepository_AddMember(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	emp := createTestEmployeeForTeam(t, db, tenant.ID)
	err := repo.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)

	// Verify member was added
	member, err := repo.GetMember(ctx, team.ID, emp.ID)
	require.NoError(t, err)
	assert.Equal(t, team.ID, member.TeamID)
	assert.Equal(t, emp.ID, member.EmployeeID)
	assert.Equal(t, model.TeamMemberRoleMember, member.Role)
}

func TestTeamRepository_AddMember_WithRole(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	emp := createTestEmployeeForTeam(t, db, tenant.ID)
	err := repo.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)

	member, err := repo.GetMember(ctx, team.ID, emp.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TeamMemberRoleLead, member.Role)
}

func TestTeamRepository_RemoveMember(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	emp := createTestEmployeeForTeam(t, db, tenant.ID)
	require.NoError(t, repo.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember))

	err := repo.RemoveMember(ctx, team.ID, emp.ID)
	require.NoError(t, err)

	// Verify member was removed
	_, err = repo.GetMember(ctx, team.ID, emp.ID)
	assert.ErrorIs(t, err, repository.ErrMemberNotFound)
}

func TestTeamRepository_RemoveMember_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	err := repo.RemoveMember(ctx, team.ID, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMemberNotFound)
}

func TestTeamRepository_GetMember(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	emp := createTestEmployeeForTeam(t, db, tenant.ID)
	require.NoError(t, repo.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleLead))

	member, err := repo.GetMember(ctx, team.ID, emp.ID)
	require.NoError(t, err)
	assert.Equal(t, team.ID, member.TeamID)
	assert.Equal(t, emp.ID, member.EmployeeID)
	assert.Equal(t, model.TeamMemberRoleLead, member.Role)
}

func TestTeamRepository_GetMember_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	_, err := repo.GetMember(ctx, team.ID, uuid.New())
	assert.ErrorIs(t, err, repository.ErrMemberNotFound)
}

func TestTeamRepository_UpdateMemberRole(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	emp := createTestEmployeeForTeam(t, db, tenant.ID)
	require.NoError(t, repo.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember))

	err := repo.UpdateMemberRole(ctx, team.ID, emp.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)

	member, err := repo.GetMember(ctx, team.ID, emp.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TeamMemberRoleLead, member.Role)
}

func TestTeamRepository_UpdateMemberRole_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	err := repo.UpdateMemberRole(ctx, team.ID, uuid.New(), model.TeamMemberRoleLead)
	assert.ErrorIs(t, err, repository.ErrMemberNotFound)
}

func TestTeamRepository_GetMemberTeams(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)

	// Create teams
	team1 := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	team2 := &model.Team{TenantID: tenant.ID, Name: "DevOps Team"}
	team3 := &model.Team{TenantID: tenant.ID, Name: "Frontend Team"}
	require.NoError(t, repo.Create(ctx, team1))
	require.NoError(t, repo.Create(ctx, team2))
	require.NoError(t, repo.Create(ctx, team3))

	// Create employee and add to two teams
	emp := createTestEmployeeForTeam(t, db, tenant.ID)
	require.NoError(t, repo.AddMember(ctx, team1.ID, emp.ID, model.TeamMemberRoleMember))
	require.NoError(t, repo.AddMember(ctx, team2.ID, emp.ID, model.TeamMemberRoleLead))

	teams, err := repo.GetMemberTeams(ctx, emp.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 2)
}

func TestTeamRepository_GetMemberTeams_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	teams, err := repo.GetMemberTeams(ctx, uuid.New())
	require.NoError(t, err)
	assert.Empty(t, teams)
}

func TestTeamRepository_GetMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	// Create employees and add as members
	emp1 := createTestEmployeeForTeam(t, db, tenant.ID)
	emp2 := createTestEmployeeForTeam(t, db, tenant.ID)
	emp3 := createTestEmployeeForTeam(t, db, tenant.ID)
	require.NoError(t, repo.AddMember(ctx, team.ID, emp1.ID, model.TeamMemberRoleMember))
	require.NoError(t, repo.AddMember(ctx, team.ID, emp2.ID, model.TeamMemberRoleLead))
	require.NoError(t, repo.AddMember(ctx, team.ID, emp3.ID, model.TeamMemberRoleDeputy))

	members, err := repo.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Len(t, members, 3)
}

func TestTeamRepository_GetMembers_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	members, err := repo.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Empty(t, members)
}

func TestTeamRepository_Delete_CascadesMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForTeam(t, db)
	team := &model.Team{TenantID: tenant.ID, Name: "Backend Team"}
	require.NoError(t, repo.Create(ctx, team))

	// Create employee and add as member
	emp := createTestEmployeeForTeam(t, db, tenant.ID)
	require.NoError(t, repo.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember))

	// Delete team
	err := repo.Delete(ctx, team.ID)
	require.NoError(t, err)

	// Members should be deleted via cascade
	_, err = repo.GetMember(ctx, team.ID, emp.ID)
	assert.ErrorIs(t, err, repository.ErrMemberNotFound)
}
