package service_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/permissions"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

// --- test helpers ---

func setupNotificationTestData(t *testing.T, db *repository.DB) (tenantID uuid.UUID, deptID uuid.UUID, empID uuid.UUID) {
	t.Helper()
	ctx := context.Background()

	// Tenant
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{Name: "Notif Tenant " + uuid.New().String()[:8], Slug: "nt-" + uuid.New().String()[:8], IsActive: true}
	require.NoError(t, tenantRepo.Create(ctx, tenant))

	// Department
	deptRepo := repository.NewDepartmentRepository(db)
	dept := &model.Department{TenantID: tenant.ID, Name: "Engineering"}
	require.NoError(t, deptRepo.Create(ctx, dept))

	// Employee in that department
	empRepo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		FirstName:       "Test",
		LastName:        "Worker",
		PersonnelNumber: uuid.New().String()[:6],
		PIN:             uuid.New().String()[:8],
		DepartmentID:    &dept.ID,
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	require.NoError(t, empRepo.Create(ctx, emp))

	return tenant.ID, dept.ID, emp.ID
}

func createUserGroupWithPermissions(t *testing.T, db *repository.DB, tenantID *uuid.UUID, code string, isAdmin bool, permIDs []uuid.UUID) *model.UserGroup {
	t.Helper()
	permsJSON, err := json.Marshal(permIDs)
	require.NoError(t, err)

	ug := &model.UserGroup{
		TenantID:    tenantID,
		Name:        code + "-" + uuid.New().String()[:8],
		Code:        code + "-" + uuid.New().String()[:8],
		Permissions: permsJSON,
		IsAdmin:     isAdmin,
		IsActive:    true,
	}
	err = db.GORM.Create(ug).Error
	require.NoError(t, err)
	return ug
}

func createUserInGroup(t *testing.T, db *repository.DB, tenantID uuid.UUID, groupID uuid.UUID, scopeType model.DataScopeType, scopeDeptIDs []string) *model.User {
	t.Helper()
	user := &model.User{
		TenantID:               &tenantID,
		UserGroupID:            &groupID,
		Email:                  "user-" + uuid.New().String()[:8] + "@test.com",
		DisplayName:            "Test User",
		Role:                   model.RoleUser,
		IsActive:               true,
		DataScopeType:          scopeType,
		DataScopeDepartmentIDs: pq.StringArray(scopeDeptIDs),
	}
	err := repository.NewUserRepository(db).Create(context.Background(), user)
	require.NoError(t, err)
	return user
}

func newNotificationService(db *repository.DB) *service.NotificationService {
	return service.NewNotificationService(
		repository.NewNotificationRepository(db),
		repository.NewNotificationPreferencesRepository(db),
		repository.NewUserRepository(db),
		repository.NewEmployeeRepository(db),
	)
}

// --- tests ---

func TestCreateForScopedAdmins_AdminGroupScopeAll_ReceivesNotification(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	tenantID, _, empID := setupNotificationTestData(t, db)

	// Admin group (IsAdmin=true), scope all
	adminGroup := createUserGroupWithPermissions(t, db, &tenantID, "ADM", true, nil)
	createUserInGroup(t, db, tenantID, adminGroup.ID, model.DataScopeAll, nil)

	svc := newNotificationService(db)
	permID := permissions.ID("absences.approve").String()

	created, err := svc.CreateForScopedAdmins(ctx, tenantID, empID, permID, service.CreateNotificationInput{
		Type:    model.NotificationTypeReminders,
		Title:   "Test",
		Message: "test",
	})

	require.NoError(t, err)
	assert.Len(t, created, 1)
}

func TestCreateForScopedAdmins_PermissionGroup_MatchingDepartment_ReceivesNotification(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	tenantID, deptID, empID := setupNotificationTestData(t, db)

	// Group with absences.approve permission, scoped to the employee's department
	approvePermID := permissions.ID("absences.approve")
	group := createUserGroupWithPermissions(t, db, &tenantID, "SUP", false, []uuid.UUID{approvePermID})
	createUserInGroup(t, db, tenantID, group.ID, model.DataScopeDepartment, []string{deptID.String()})

	svc := newNotificationService(db)

	created, err := svc.CreateForScopedAdmins(ctx, tenantID, empID, approvePermID.String(), service.CreateNotificationInput{
		Type:    model.NotificationTypeReminders,
		Title:   "Test",
		Message: "test",
	})

	require.NoError(t, err)
	assert.Len(t, created, 1)
}

func TestCreateForScopedAdmins_PermissionGroup_DifferentDepartment_NoNotification(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	tenantID, _, empID := setupNotificationTestData(t, db)

	otherDeptID := uuid.New() // department the employee is NOT in

	approvePermID := permissions.ID("absences.approve")
	group := createUserGroupWithPermissions(t, db, &tenantID, "SUP", false, []uuid.UUID{approvePermID})
	createUserInGroup(t, db, tenantID, group.ID, model.DataScopeDepartment, []string{otherDeptID.String()})

	svc := newNotificationService(db)

	created, err := svc.CreateForScopedAdmins(ctx, tenantID, empID, approvePermID.String(), service.CreateNotificationInput{
		Type:    model.NotificationTypeReminders,
		Title:   "Test",
		Message: "test",
	})

	require.NoError(t, err)
	assert.Len(t, created, 0)
}

func TestCreateForScopedAdmins_NoPermission_NoNotification(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	tenantID, _, empID := setupNotificationTestData(t, db)

	// Group with only absences.request (no approve)
	requestPermID := permissions.ID("absences.request")
	group := createUserGroupWithPermissions(t, db, &tenantID, "EMP", false, []uuid.UUID{requestPermID})
	createUserInGroup(t, db, tenantID, group.ID, model.DataScopeAll, nil)

	svc := newNotificationService(db)

	created, err := svc.CreateForScopedAdmins(ctx, tenantID, empID, permissions.ID("absences.approve").String(), service.CreateNotificationInput{
		Type:    model.NotificationTypeReminders,
		Title:   "Test",
		Message: "test",
	})

	require.NoError(t, err)
	assert.Len(t, created, 0)
}

func TestCreateForScopedAdmins_NoUserGroup_NoNotification(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	tenantID, _, empID := setupNotificationTestData(t, db)

	// User with no group assigned
	user := &model.User{
		TenantID:      &tenantID,
		Email:         "nogroup-" + uuid.New().String()[:8] + "@test.com",
		DisplayName:   "No Group User",
		Role:          model.RoleAdmin,
		IsActive:      true,
		DataScopeType: model.DataScopeAll,
	}
	require.NoError(t, repository.NewUserRepository(db).Create(ctx, user))

	svc := newNotificationService(db)

	created, err := svc.CreateForScopedAdmins(ctx, tenantID, empID, permissions.ID("absences.approve").String(), service.CreateNotificationInput{
		Type:    model.NotificationTypeReminders,
		Title:   "Test",
		Message: "test",
	})

	require.NoError(t, err)
	assert.Len(t, created, 0)
}

func TestCreateForScopedAdmins_MixedUsers_OnlyMatchingReceive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	ctx := context.Background()
	tenantID, deptID, empID := setupNotificationTestData(t, db)

	approvePermID := permissions.ID("absences.approve")
	otherDeptID := uuid.New()

	// User 1: Admin group, scope all → should receive
	adminGroup := createUserGroupWithPermissions(t, db, &tenantID, "ADM", true, nil)
	createUserInGroup(t, db, tenantID, adminGroup.ID, model.DataScopeAll, nil)

	// User 2: Supervisor group with approve perm, matching dept → should receive
	supGroup := createUserGroupWithPermissions(t, db, &tenantID, "SUP", false, []uuid.UUID{approvePermID})
	createUserInGroup(t, db, tenantID, supGroup.ID, model.DataScopeDepartment, []string{deptID.String()})

	// User 3: Supervisor group with approve perm, wrong dept → should NOT receive
	createUserInGroup(t, db, tenantID, supGroup.ID, model.DataScopeDepartment, []string{otherDeptID.String()})

	// User 4: Employee group, no approve perm → should NOT receive
	empGroup := createUserGroupWithPermissions(t, db, &tenantID, "EMP", false, []uuid.UUID{permissions.ID("absences.request")})
	createUserInGroup(t, db, tenantID, empGroup.ID, model.DataScopeAll, nil)

	svc := newNotificationService(db)

	created, err := svc.CreateForScopedAdmins(ctx, tenantID, empID, approvePermID.String(), service.CreateNotificationInput{
		Type:    model.NotificationTypeReminders,
		Title:   "Test",
		Message: "test",
	})

	require.NoError(t, err)
	assert.Len(t, created, 2, "only admin + matching supervisor should receive notifications")
}
