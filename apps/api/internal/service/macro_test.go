package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createMacroTestTenant(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	ctx := context.Background()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Macro Test Tenant " + uuid.New().String()[:8],
		Slug:     "macro-test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(ctx, tenant)
	require.NoError(t, err)
	return tenant
}

func createMacroTestTariff(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Tariff {
	t.Helper()
	ctx := context.Background()
	tariffRepo := repository.NewTariffRepository(db)
	tariff := &model.Tariff{
		TenantID: tenantID,
		Name:     "Test Tariff " + uuid.New().String()[:8],
		Code:     "T" + uuid.New().String()[:6],
	}
	err := tariffRepo.Create(ctx, tariff)
	require.NoError(t, err)
	return tariff
}

// --- Create Macro Tests ---

func TestMacroService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	input := service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "Weekly Reset",
		MacroType:  "weekly",
		ActionType: "log_message",
	}

	macro, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "Weekly Reset", macro.Name)
	assert.Equal(t, model.MacroTypeWeekly, macro.MacroType)
	assert.Equal(t, model.MacroActionLogMessage, macro.ActionType)
	assert.True(t, macro.IsActive)
}

func TestMacroService_Create_MonthlyType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	input := service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "Monthly Balance Carry Forward",
		MacroType:  "monthly",
		ActionType: "carry_forward_balance",
	}

	macro, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, model.MacroTypeMonthly, macro.MacroType)
	assert.Equal(t, model.MacroActionCarryForwardBalance, macro.ActionType)
}

func TestMacroService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	input := service.CreateMacroInput{
		TenantID:   uuid.New(),
		Name:       "",
		MacroType:  "weekly",
		ActionType: "log_message",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrMacroNameReq)
}

func TestMacroService_Create_InvalidMacroType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	input := service.CreateMacroInput{
		TenantID:   uuid.New(),
		Name:       "Invalid Type",
		MacroType:  "yearly",
		ActionType: "log_message",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidMacroType)
}

func TestMacroService_Create_InvalidActionType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	input := service.CreateMacroInput{
		TenantID:   uuid.New(),
		Name:       "Bad Action",
		MacroType:  "weekly",
		ActionType: "send_email",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidActionType)
}

func TestMacroService_Create_DuplicateName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	name := "Duplicate Name " + uuid.New().String()[:8]
	input := service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       name,
		MacroType:  "weekly",
		ActionType: "log_message",
	}

	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create with same name
	_, err = svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrMacroNameExists)
}

func TestMacroService_Create_AllActionTypes(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	actionTypes := []string{
		"log_message",
		"recalculate_target_hours",
		"reset_flextime",
		"carry_forward_balance",
	}

	for _, at := range actionTypes {
		input := service.CreateMacroInput{
			TenantID:   tenant.ID,
			Name:       "Macro " + at + " " + uuid.New().String()[:4],
			MacroType:  "weekly",
			ActionType: at,
		}
		macro, err := svc.Create(ctx, input)
		require.NoError(t, err, "failed for action type: %s", at)
		assert.Equal(t, model.MacroActionType(at), macro.ActionType)
	}
}

// --- Get / List / Update / Delete Tests ---

func TestMacroService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	created, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "Get Test " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, tenant.ID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestMacroService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, service.ErrMacroNotFound)
}

func TestMacroService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	for i := 0; i < 3; i++ {
		_, err := svc.Create(ctx, service.CreateMacroInput{
			TenantID:   tenant.ID,
			Name:       "List Test " + uuid.New().String()[:4],
			MacroType:  "weekly",
			ActionType: "log_message",
		})
		require.NoError(t, err)
	}

	macros, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, macros, 3)
}

func TestMacroService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	created, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "Update Test " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	newName := "Updated Name"
	inactive := false
	updated, err := svc.Update(ctx, tenant.ID, created.ID, service.UpdateMacroInput{
		Name:     &newName,
		IsActive: &inactive,
	})
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	assert.False(t, updated.IsActive)
}

func TestMacroService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	created, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "Delete Test " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, tenant.ID, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, tenant.ID, created.ID)
	assert.ErrorIs(t, err, service.ErrMacroNotFound)
}

func TestMacroService_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	err := svc.Delete(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, service.ErrMacroNotFound)
}

// --- Assignment Tests ---

func TestMacroService_CreateAssignment_WithTariff(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "Assign Test " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	assignment, err := svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 1, // Monday
	})
	require.NoError(t, err)
	assert.Equal(t, macro.ID, assignment.MacroID)
	assert.NotNil(t, assignment.TariffID)
	assert.Equal(t, tariff.ID, *assignment.TariffID)
	assert.Nil(t, assignment.EmployeeID)
	assert.Equal(t, 1, assignment.ExecutionDay)
	assert.True(t, assignment.IsActive)
}

func TestMacroService_CreateAssignment_MissingTarget(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "NoTarget " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		ExecutionDay: 1,
	})
	assert.ErrorIs(t, err, service.ErrAssignmentTargetReq)
}

func TestMacroService_CreateAssignment_BothTargets(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "BothTarget " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	tariffID := uuid.New()
	employeeID := uuid.New()
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariffID,
		EmployeeID:   &employeeID,
		ExecutionDay: 1,
	})
	assert.ErrorIs(t, err, service.ErrAssignmentTargetBoth)
}

func TestMacroService_CreateAssignment_InvalidWeeklyDay(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "InvalidWeekDay " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Day 7 is invalid for weekly (must be 0-6)
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 7,
	})
	assert.ErrorIs(t, err, service.ErrInvalidExecutionDay)

	// Day -1 is also invalid
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: -1,
	})
	assert.ErrorIs(t, err, service.ErrInvalidExecutionDay)
}

func TestMacroService_CreateAssignment_ValidWeeklyDayBounds(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "ValidWeekDay " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Day 0 (Sunday) is valid
	a0, err := svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 0,
	})
	require.NoError(t, err)
	assert.Equal(t, 0, a0.ExecutionDay)

	// Day 6 (Saturday) is valid
	a6, err := svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 6,
	})
	require.NoError(t, err)
	assert.Equal(t, 6, a6.ExecutionDay)
}

func TestMacroService_CreateAssignment_InvalidMonthlyDay(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "InvalidMonthDay " + uuid.New().String()[:4],
		MacroType:  "monthly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Day 0 is invalid for monthly (must be 1-31)
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 0,
	})
	assert.ErrorIs(t, err, service.ErrInvalidExecutionDay)

	// Day 32 is also invalid
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 32,
	})
	assert.ErrorIs(t, err, service.ErrInvalidExecutionDay)
}

func TestMacroService_CreateAssignment_ValidMonthlyDayBounds(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "ValidMonthDay " + uuid.New().String()[:4],
		MacroType:  "monthly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Day 1 is valid
	a1, err := svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 1,
	})
	require.NoError(t, err)
	assert.Equal(t, 1, a1.ExecutionDay)

	// Day 31 is valid
	a31, err := svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 31,
	})
	require.NoError(t, err)
	assert.Equal(t, 31, a31.ExecutionDay)
}

func TestMacroService_ListAssignments(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "ListAssign " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	for i := 0; i < 3; i++ {
		_, err := svc.CreateAssignment(ctx, service.CreateAssignmentInput{
			TenantID:     tenant.ID,
			MacroID:      macro.ID,
			TariffID:     &tariff.ID,
			ExecutionDay: i,
		})
		require.NoError(t, err)
	}

	assignments, err := svc.ListAssignments(ctx, tenant.ID, macro.ID)
	require.NoError(t, err)
	assert.Len(t, assignments, 3)
}

func TestMacroService_UpdateAssignment(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "UpdAssign " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	assignment, err := svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 1,
	})
	require.NoError(t, err)

	newDay := 5
	inactive := false
	updated, err := svc.UpdateAssignment(ctx, tenant.ID, macro.ID, assignment.ID, service.UpdateAssignmentInput{
		ExecutionDay: &newDay,
		IsActive:     &inactive,
	})
	require.NoError(t, err)
	assert.Equal(t, 5, updated.ExecutionDay)
	assert.False(t, updated.IsActive)
}

func TestMacroService_DeleteAssignment(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "DelAssign " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	assignment, err := svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 2,
	})
	require.NoError(t, err)

	err = svc.DeleteAssignment(ctx, tenant.ID, macro.ID, assignment.ID)
	require.NoError(t, err)

	// Verify assignment list is empty
	assignments, err := svc.ListAssignments(ctx, tenant.ID, macro.ID)
	require.NoError(t, err)
	assert.Len(t, assignments, 0)
}

// --- Execution Tests ---

func TestMacroService_TriggerExecution_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "Execute " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	exec, err := svc.TriggerExecution(ctx, tenant.ID, macro.ID, nil)
	require.NoError(t, err)
	assert.Equal(t, model.MacroExecutionStatusCompleted, exec.Status)
	assert.Equal(t, model.MacroTriggerTypeManual, exec.TriggerType)
	assert.NotNil(t, exec.StartedAt)
	assert.NotNil(t, exec.CompletedAt)
}

func TestMacroService_TriggerExecution_InactiveMacro(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "Inactive " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Deactivate macro
	inactive := false
	_, err = svc.Update(ctx, tenant.ID, macro.ID, service.UpdateMacroInput{
		IsActive: &inactive,
	})
	require.NoError(t, err)

	_, err = svc.TriggerExecution(ctx, tenant.ID, macro.ID, nil)
	assert.ErrorIs(t, err, service.ErrMacroInactive)
}

func TestMacroService_ListExecutions(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "ExecList " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Trigger 3 executions
	for i := 0; i < 3; i++ {
		_, err := svc.TriggerExecution(ctx, tenant.ID, macro.ID, nil)
		require.NoError(t, err)
	}

	executions, err := svc.ListExecutions(ctx, tenant.ID, macro.ID, 10)
	require.NoError(t, err)
	assert.Len(t, executions, 3)
}

func TestMacroService_GetExecution(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "GetExec " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	exec, err := svc.TriggerExecution(ctx, tenant.ID, macro.ID, nil)
	require.NoError(t, err)

	found, err := svc.GetExecution(ctx, exec.ID)
	require.NoError(t, err)
	assert.Equal(t, exec.ID, found.ID)
}

// --- ExecuteDueMacros Tests ---

func TestMacroService_ExecuteDueMacros_WeeklyMatch(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "WeeklyDue " + uuid.New().String()[:4],
		MacroType:  "weekly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Assign for Monday (day 1)
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 1, // Monday
	})
	require.NoError(t, err)

	// Monday Jan 27 2025 is a Monday
	monday := time.Date(2025, 1, 27, 12, 0, 0, 0, time.UTC) // Monday
	executed, failed, err := svc.ExecuteDueMacros(ctx, tenant.ID, monday)
	require.NoError(t, err)
	assert.Equal(t, 1, executed)
	assert.Equal(t, 0, failed)

	// Tuesday should NOT match
	tuesday := time.Date(2025, 1, 28, 12, 0, 0, 0, time.UTC) // Tuesday
	executed, failed, err = svc.ExecuteDueMacros(ctx, tenant.ID, tuesday)
	require.NoError(t, err)
	assert.Equal(t, 0, executed)
	assert.Equal(t, 0, failed)
}

func TestMacroService_ExecuteDueMacros_MonthlyMatch(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "MonthlyDue " + uuid.New().String()[:4],
		MacroType:  "monthly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Assign for day 15
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 15,
	})
	require.NoError(t, err)

	// January 15 should match
	jan15 := time.Date(2025, 1, 15, 12, 0, 0, 0, time.UTC)
	executed, failed, err := svc.ExecuteDueMacros(ctx, tenant.ID, jan15)
	require.NoError(t, err)
	assert.Equal(t, 1, executed)
	assert.Equal(t, 0, failed)

	// January 14 should NOT match
	jan14 := time.Date(2025, 1, 14, 12, 0, 0, 0, time.UTC)
	executed, failed, err = svc.ExecuteDueMacros(ctx, tenant.ID, jan14)
	require.NoError(t, err)
	assert.Equal(t, 0, executed)
	assert.Equal(t, 0, failed)
}

func TestMacroService_ExecuteDueMacros_MonthlyFallbackFebruary(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "MonthlyFallback " + uuid.New().String()[:4],
		MacroType:  "monthly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Assign for day 31 (should fall back to last day of month)
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 31,
	})
	require.NoError(t, err)

	// February 28 in non-leap year (2025) -- should execute (fallback from 31 to 28)
	feb28 := time.Date(2025, 2, 28, 12, 0, 0, 0, time.UTC)
	executed, failed, err := svc.ExecuteDueMacros(ctx, tenant.ID, feb28)
	require.NoError(t, err)
	assert.Equal(t, 1, executed, "day 31 monthly should fall back to Feb 28")
	assert.Equal(t, 0, failed)

	// February 27 should NOT match (not the last day)
	feb27 := time.Date(2025, 2, 27, 12, 0, 0, 0, time.UTC)
	executed, _, err = svc.ExecuteDueMacros(ctx, tenant.ID, feb27)
	require.NoError(t, err)
	assert.Equal(t, 0, executed)
}

func TestMacroService_ExecuteDueMacros_MonthlyFallbackApril(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "MonthlyFallbackApril " + uuid.New().String()[:4],
		MacroType:  "monthly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Assign for day 31 (April has 30 days -> fallback to 30)
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 31,
	})
	require.NoError(t, err)

	// April 30 should match (fallback from 31 to 30)
	apr30 := time.Date(2025, 4, 30, 12, 0, 0, 0, time.UTC)
	executed, failed, err := svc.ExecuteDueMacros(ctx, tenant.ID, apr30)
	require.NoError(t, err)
	assert.Equal(t, 1, executed, "day 31 monthly should fall back to Apr 30")
	assert.Equal(t, 0, failed)
}

func TestMacroService_ExecuteDueMacros_MonthlyExactDay31(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "MonthlyExact31 " + uuid.New().String()[:4],
		MacroType:  "monthly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Assign for day 31
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 31,
	})
	require.NoError(t, err)

	// January 31 has 31 days -- should match exactly
	jan31 := time.Date(2025, 1, 31, 12, 0, 0, 0, time.UTC)
	executed, _, err := svc.ExecuteDueMacros(ctx, tenant.ID, jan31)
	require.NoError(t, err)
	assert.Equal(t, 1, executed, "day 31 monthly should execute on Jan 31")
}

func TestMacroService_ExecuteDueMacros_LeapYearFebruary(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewMacroRepository(db)
	svc := service.NewMacroService(repo)
	ctx := context.Background()

	tenant := createMacroTestTenant(t, db)
	tariff := createMacroTestTariff(t, db, tenant.ID)

	macro, err := svc.Create(ctx, service.CreateMacroInput{
		TenantID:   tenant.ID,
		Name:       "LeapFeb " + uuid.New().String()[:4],
		MacroType:  "monthly",
		ActionType: "log_message",
	})
	require.NoError(t, err)

	// Assign for day 31 (leap year Feb has 29 days)
	_, err = svc.CreateAssignment(ctx, service.CreateAssignmentInput{
		TenantID:     tenant.ID,
		MacroID:      macro.ID,
		TariffID:     &tariff.ID,
		ExecutionDay: 31,
	})
	require.NoError(t, err)

	// 2024 is a leap year, Feb 29
	feb29 := time.Date(2024, 2, 29, 12, 0, 0, 0, time.UTC)
	executed, _, err := svc.ExecuteDueMacros(ctx, tenant.ID, feb29)
	require.NoError(t, err)
	assert.Equal(t, 1, executed, "day 31 monthly should fall back to Feb 29 in leap year")
}
