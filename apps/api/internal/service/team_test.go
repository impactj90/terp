package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForTeamService(t *testing.T, db *repository.DB) *model.Tenant {
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func createTestEmployeeForTeamService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "EMP-" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:6],
		FirstName:       "Test",
		LastName:        "Employee",
		IsActive:        true,
	}
	err := empRepo.Create(context.Background(), emp)
	require.NoError(t, err)
	return emp
}

func TestTeamService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID:    tenant.ID,
		Name:        "Backend Team",
		Description: "Handles backend development",
	}

	team, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "Backend Team", team.Name)
	assert.Equal(t, "Handles backend development", team.Description)
	assert.Equal(t, tenant.ID, team.TenantID)
	assert.True(t, team.IsActive)
	assert.Nil(t, team.DepartmentID)
}

func TestTeamService_Create_WithDepartment(t *testing.T) {
	db := testutil.SetupTestDB(t)
	teamRepo := repository.NewTeamRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	svc := service.NewTeamService(teamRepo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	// Create department
	dept := &model.Department{
		TenantID: tenant.ID,
		Code:     "ENG",
		Name:     "Engineering",
	}
	require.NoError(t, deptRepo.Create(ctx, dept))

	input := service.CreateTeamInput{
		TenantID:     tenant.ID,
		Name:         "Backend Team",
		DepartmentID: &dept.ID,
	}

	team, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.NotNil(t, team.DepartmentID)
	assert.Equal(t, dept.ID, *team.DepartmentID)
}

func TestTeamService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrTeamNameRequired)
}

func TestTeamService_Create_DuplicateName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrTeamNameExists)
}

func TestTeamService_Create_TrimsWhitespace(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID:    tenant.ID,
		Name:        "  Backend Team  ",
		Description: "  Description  ",
	}

	team, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "Backend Team", team.Name)
	assert.Equal(t, "Description", team.Description)
}

func TestTeamService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "Backend Team", found.Name)
}

func TestTeamService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamService_GetByName_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	found, err := svc.GetByName(ctx, tenant.ID, "Backend Team")
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestTeamService_GetByName_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	_, err := svc.GetByName(ctx, tenant.ID, "NONEXISTENT")
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Original Name",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	newName := "Updated Name"
	newDesc := "New description"
	isActive := false
	updateInput := service.UpdateTeamInput{
		Name:        &newName,
		Description: &newDesc,
		IsActive:    &isActive,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.Equal(t, "New description", updated.Description)
	assert.False(t, updated.IsActive)
}

func TestTeamService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateTeamInput{
		Name: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamService_Update_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emptyName := "   "
	updateInput := service.UpdateTeamInput{
		Name: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrTeamNameRequired)
}

func TestTeamService_Update_DuplicateName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	// Create first team
	input1 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	_, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create second team
	input2 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Frontend Team",
	}
	created2, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	// Try to update second team with first team's name
	conflictingName := "Backend Team"
	updateInput := service.UpdateTeamInput{
		Name: &conflictingName,
	}

	_, err = svc.Update(ctx, created2.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrTeamNameExists)
}

func TestTeamService_Update_SameName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Update with the same name should work
	sameName := "Backend Team"
	updateInput := service.UpdateTeamInput{
		Name: &sameName,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Backend Team", updated.Name)
}

func TestTeamService_Update_ClearDepartment(t *testing.T) {
	db := testutil.SetupTestDB(t)
	teamRepo := repository.NewTeamRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	svc := service.NewTeamService(teamRepo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	// Create department
	dept := &model.Department{
		TenantID: tenant.ID,
		Code:     "ENG",
		Name:     "Engineering",
	}
	require.NoError(t, deptRepo.Create(ctx, dept))

	// Create team with department
	input := service.CreateTeamInput{
		TenantID:     tenant.ID,
		Name:         "Backend Team",
		DepartmentID: &dept.ID,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)
	require.NotNil(t, created.DepartmentID)

	// Clear department
	updateInput := service.UpdateTeamInput{
		ClearDepartment: true,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Nil(t, updated.DepartmentID)
}

func TestTeamService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "To Delete",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	names := []string{"Alpha Team", "Beta Team", "Gamma Team"}
	for _, name := range names {
		input := service.CreateTeamInput{
			TenantID: tenant.ID,
			Name:     name,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	teams, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 3)
}

func TestTeamService_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	teams, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Empty(t, teams)
}

func TestTeamService_ListActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	// Create active team
	input1 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Active Team",
	}
	active, err := svc.Create(ctx, input1)
	require.NoError(t, err)

	// Create and deactivate a team
	input2 := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Inactive Team",
	}
	inactive, err := svc.Create(ctx, input2)
	require.NoError(t, err)

	isActive := false
	_, err = svc.Update(ctx, inactive.ID, service.UpdateTeamInput{IsActive: &isActive})
	require.NoError(t, err)

	teams, err := svc.ListActive(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 1)
	assert.Equal(t, active.Name, teams[0].Name)
}

func TestTeamService_ListByDepartment(t *testing.T) {
	db := testutil.SetupTestDB(t)
	teamRepo := repository.NewTeamRepository(db)
	deptRepo := repository.NewDepartmentRepository(db)
	svc := service.NewTeamService(teamRepo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	// Create departments
	dept1 := &model.Department{TenantID: tenant.ID, Code: "ENG", Name: "Engineering"}
	dept2 := &model.Department{TenantID: tenant.ID, Code: "HR", Name: "HR"}
	require.NoError(t, deptRepo.Create(ctx, dept1))
	require.NoError(t, deptRepo.Create(ctx, dept2))

	// Create teams in different departments
	_, err := svc.Create(ctx, service.CreateTeamInput{TenantID: tenant.ID, Name: "Backend", DepartmentID: &dept1.ID})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateTeamInput{TenantID: tenant.ID, Name: "Frontend", DepartmentID: &dept1.ID})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateTeamInput{TenantID: tenant.ID, Name: "HR Team", DepartmentID: &dept2.ID})
	require.NoError(t, err)

	teams, err := svc.ListByDepartment(ctx, dept1.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 2)
}

func TestTeamService_GetWithMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Create employees and add as members
	emp1 := createTestEmployeeForTeamService(t, db, tenant.ID)
	emp2 := createTestEmployeeForTeamService(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, created.ID, emp1.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)
	_, err = svc.AddMember(ctx, created.ID, emp2.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)

	team, err := svc.GetWithMembers(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, team.ID)
	assert.Len(t, team.Members, 2)
}

func TestTeamService_AddMember_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamService(t, db, tenant.ID)
	member, err := svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)
	assert.Equal(t, emp.ID, member.EmployeeID)
	assert.Equal(t, model.TeamMemberRoleMember, member.Role)

	members, err := svc.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Len(t, members, 1)
	assert.Equal(t, emp.ID, members[0].EmployeeID)
	assert.Equal(t, model.TeamMemberRoleMember, members[0].Role)
}

func TestTeamService_AddMember_TeamNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	_, err := svc.AddMember(ctx, uuid.New(), uuid.New(), model.TeamMemberRoleMember)
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamService_AddMember_AlreadyMember(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamService(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)

	// Try to add same member again
	_, err = svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleLead)
	assert.ErrorIs(t, err, service.ErrMemberExists)
}

func TestTeamService_RemoveMember_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamService(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)

	err = svc.RemoveMember(ctx, team.ID, emp.ID)
	require.NoError(t, err)

	members, err := svc.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Empty(t, members)
}

func TestTeamService_RemoveMember_TeamNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	err := svc.RemoveMember(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamService_RemoveMember_MemberNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	err = svc.RemoveMember(ctx, team.ID, uuid.New())
	assert.ErrorIs(t, err, service.ErrMemberNotFound)
}

func TestTeamService_UpdateMemberRole_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	emp := createTestEmployeeForTeamService(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)

	updatedMember, err := svc.UpdateMemberRole(ctx, team.ID, emp.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)
	assert.Equal(t, model.TeamMemberRoleLead, updatedMember.Role)

	members, err := svc.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Equal(t, model.TeamMemberRoleLead, members[0].Role)
}

func TestTeamService_UpdateMemberRole_TeamNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	_, err := svc.UpdateMemberRole(ctx, uuid.New(), uuid.New(), model.TeamMemberRoleLead)
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestTeamService_UpdateMemberRole_MemberNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	_, err = svc.UpdateMemberRole(ctx, team.ID, uuid.New(), model.TeamMemberRoleLead)
	assert.ErrorIs(t, err, service.ErrMemberNotFound)
}

func TestTeamService_GetMemberTeams(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	// Create teams
	team1, err := svc.Create(ctx, service.CreateTeamInput{TenantID: tenant.ID, Name: "Backend Team"})
	require.NoError(t, err)
	team2, err := svc.Create(ctx, service.CreateTeamInput{TenantID: tenant.ID, Name: "DevOps Team"})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateTeamInput{TenantID: tenant.ID, Name: "Frontend Team"})
	require.NoError(t, err)

	// Create an employee and add to two teams
	emp := createTestEmployeeForTeamService(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team1.ID, emp.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)
	_, err = svc.AddMember(ctx, team2.ID, emp.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)

	teams, err := svc.GetMemberTeams(ctx, emp.ID)
	require.NoError(t, err)
	assert.Len(t, teams, 2)
}

func TestTeamService_GetMemberTeams_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	teams, err := svc.GetMemberTeams(ctx, uuid.New())
	require.NoError(t, err)
	assert.Empty(t, teams)
}

func TestTeamService_GetMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	tenant := createTestTenantForTeamService(t, db)

	input := service.CreateTeamInput{
		TenantID: tenant.ID,
		Name:     "Backend Team",
	}
	team, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Create employees and add as members
	emp1 := createTestEmployeeForTeamService(t, db, tenant.ID)
	emp2 := createTestEmployeeForTeamService(t, db, tenant.ID)
	_, err = svc.AddMember(ctx, team.ID, emp1.ID, model.TeamMemberRoleMember)
	require.NoError(t, err)
	_, err = svc.AddMember(ctx, team.ID, emp2.ID, model.TeamMemberRoleLead)
	require.NoError(t, err)

	members, err := svc.GetMembers(ctx, team.ID)
	require.NoError(t, err)
	assert.Len(t, members, 2)
}

func TestTeamService_GetMembers_TeamNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewTeamRepository(db)
	svc := service.NewTeamService(repo)
	ctx := context.Background()

	_, err := svc.GetMembers(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrTeamNotFound)
}

func TestValidateTeamMemberRole_Valid(t *testing.T) {
	validRoles := []string{"member", "lead", "deputy"}
	for _, role := range validRoles {
		result, err := service.ValidateTeamMemberRole(role)
		require.NoError(t, err)
		assert.Equal(t, model.TeamMemberRole(role), result)
	}
}

func TestValidateTeamMemberRole_Invalid(t *testing.T) {
	_, err := service.ValidateTeamMemberRole("invalid")
	assert.ErrorIs(t, err, service.ErrInvalidRole)
}
