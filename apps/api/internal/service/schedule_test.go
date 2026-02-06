package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"gorm.io/datatypes"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

// --- Mock Schedule Repository ---

type mockScheduleRepo struct {
	mock.Mock
}

func (m *mockScheduleRepo) Create(ctx context.Context, s *model.Schedule) error {
	args := m.Called(ctx, s)
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockScheduleRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.Schedule, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Schedule), args.Error(1)
}

func (m *mockScheduleRepo) GetByTenantAndID(ctx context.Context, tenantID, id uuid.UUID) (*model.Schedule, error) {
	args := m.Called(ctx, tenantID, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Schedule), args.Error(1)
}

func (m *mockScheduleRepo) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Schedule, error) {
	args := m.Called(ctx, tenantID, name)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.Schedule), args.Error(1)
}

func (m *mockScheduleRepo) List(ctx context.Context, tenantID uuid.UUID) ([]model.Schedule, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.Schedule), args.Error(1)
}

func (m *mockScheduleRepo) ListEnabled(ctx context.Context, tenantID uuid.UUID) ([]model.Schedule, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.Schedule), args.Error(1)
}

func (m *mockScheduleRepo) ListDueSchedules(ctx context.Context, now time.Time) ([]model.Schedule, error) {
	args := m.Called(ctx, now)
	return args.Get(0).([]model.Schedule), args.Error(1)
}

func (m *mockScheduleRepo) Update(ctx context.Context, s *model.Schedule) error {
	args := m.Called(ctx, s)
	return args.Error(0)
}

func (m *mockScheduleRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockScheduleRepo) UpdateNextRunAt(ctx context.Context, id uuid.UUID, lastRun, nextRun *time.Time) error {
	args := m.Called(ctx, id, lastRun, nextRun)
	return args.Error(0)
}

func (m *mockScheduleRepo) CreateTask(ctx context.Context, task *model.ScheduleTask) error {
	args := m.Called(ctx, task)
	if task.ID == uuid.Nil {
		task.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockScheduleRepo) GetTaskByID(ctx context.Context, id uuid.UUID) (*model.ScheduleTask, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.ScheduleTask), args.Error(1)
}

func (m *mockScheduleRepo) ListTasks(ctx context.Context, scheduleID uuid.UUID) ([]model.ScheduleTask, error) {
	args := m.Called(ctx, scheduleID)
	return args.Get(0).([]model.ScheduleTask), args.Error(1)
}

func (m *mockScheduleRepo) UpdateTask(ctx context.Context, task *model.ScheduleTask) error {
	args := m.Called(ctx, task)
	return args.Error(0)
}

func (m *mockScheduleRepo) DeleteTask(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockScheduleRepo) CreateExecution(ctx context.Context, exec *model.ScheduleExecution) error {
	args := m.Called(ctx, exec)
	if exec.ID == uuid.Nil {
		exec.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockScheduleRepo) GetExecutionByID(ctx context.Context, id uuid.UUID) (*model.ScheduleExecution, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.ScheduleExecution), args.Error(1)
}

func (m *mockScheduleRepo) ListExecutions(ctx context.Context, scheduleID uuid.UUID, limit int) ([]model.ScheduleExecution, error) {
	args := m.Called(ctx, scheduleID, limit)
	return args.Get(0).([]model.ScheduleExecution), args.Error(1)
}

func (m *mockScheduleRepo) UpdateExecution(ctx context.Context, exec *model.ScheduleExecution) error {
	args := m.Called(ctx, exec)
	return args.Error(0)
}

func (m *mockScheduleRepo) CreateTaskExecution(ctx context.Context, te *model.ScheduleTaskExecution) error {
	args := m.Called(ctx, te)
	if te.ID == uuid.Nil {
		te.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockScheduleRepo) UpdateTaskExecution(ctx context.Context, te *model.ScheduleTaskExecution) error {
	args := m.Called(ctx, te)
	return args.Error(0)
}

// --- Mock Task Executor ---

type mockTaskExecutor struct {
	mock.Mock
}

func (m *mockTaskExecutor) Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error) {
	args := m.Called(ctx, tenantID, params)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(json.RawMessage), args.Error(1)
}

// --- Mock Recalc Service ---

type mockRecalcService struct {
	mock.Mock
}

func (m *mockRecalcService) TriggerRecalcAll(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (*RecalcResult, error) {
	args := m.Called(ctx, tenantID, from, to)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*RecalcResult), args.Error(1)
}

// --- Mock Monthly Calc Service ---

type mockMonthlyCalcService struct {
	mock.Mock
}

func (m *mockMonthlyCalcService) CalculateMonthBatch(ctx context.Context, employeeIDs []uuid.UUID, year, month int) *MonthlyCalcResult {
	args := m.Called(ctx, employeeIDs, year, month)
	return args.Get(0).(*MonthlyCalcResult)
}

// --- Mock Employee Repo ---

type mockEmployeeRepo struct {
	mock.Mock
}

func (m *mockEmployeeRepo) List(ctx context.Context, filter repository.EmployeeFilter) ([]model.Employee, int64, error) {
	args := m.Called(ctx, filter)
	return args.Get(0).([]model.Employee), args.Get(1).(int64), args.Error(2)
}

// =============================================================================
// ScheduleService Tests
// =============================================================================

func TestScheduleService_Create_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByName", ctx, tenantID, "Daily Recalc").Return(nil, repository.ErrScheduleNotFound)
	repo.On("Create", ctx, mock.AnythingOfType("*model.Schedule")).Return(nil).Run(func(args mock.Arguments) {
		s := args.Get(1).(*model.Schedule)
		s.ID = scheduleID
	})
	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:         scheduleID,
		TenantID:   tenantID,
		Name:       "Daily Recalc",
		TimingType: model.TimingTypeDaily,
		IsEnabled:  true,
	}, nil)

	result, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:     tenantID,
		Name:         "Daily Recalc",
		TimingType:   "daily",
		TimingConfig: json.RawMessage(`{"time":"02:00"}`),
	})

	require.NoError(t, err)
	assert.Equal(t, scheduleID, result.ID)
	assert.Equal(t, "Daily Recalc", result.Name)
	assert.Equal(t, model.TimingTypeDaily, result.TimingType)
	repo.AssertExpectations(t)
}

func TestScheduleService_Create_EmptyName(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	_, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:   uuid.New(),
		Name:       "",
		TimingType: "daily",
	})

	assert.ErrorIs(t, err, ErrScheduleNameRequired)
}

func TestScheduleService_Create_WhitespaceOnlyName(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	_, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:   uuid.New(),
		Name:       "   ",
		TimingType: "daily",
	})

	assert.ErrorIs(t, err, ErrScheduleNameRequired)
}

func TestScheduleService_Create_MissingTimingType(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	_, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:   uuid.New(),
		Name:       "Test Schedule",
		TimingType: "",
	})

	assert.ErrorIs(t, err, ErrScheduleTimingRequired)
}

func TestScheduleService_Create_InvalidTimingType(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	_, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:   uuid.New(),
		Name:       "Test Schedule",
		TimingType: "invalid_type",
	})

	assert.ErrorIs(t, err, ErrScheduleInvalidTiming)
}

func TestScheduleService_Create_DuplicateName(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()

	repo.On("GetByName", ctx, tenantID, "Existing Schedule").Return(&model.Schedule{
		ID:   uuid.New(),
		Name: "Existing Schedule",
	}, nil)

	_, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:   tenantID,
		Name:       "Existing Schedule",
		TimingType: "daily",
	})

	assert.ErrorIs(t, err, ErrScheduleNameConflict)
}

func TestScheduleService_Create_WithTasks(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByName", ctx, tenantID, "With Tasks").Return(nil, repository.ErrScheduleNotFound)
	repo.On("Create", ctx, mock.AnythingOfType("*model.Schedule")).Return(nil).Run(func(args mock.Arguments) {
		s := args.Get(1).(*model.Schedule)
		s.ID = scheduleID
	})
	repo.On("CreateTask", ctx, mock.AnythingOfType("*model.ScheduleTask")).Return(nil)
	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:       scheduleID,
		TenantID: tenantID,
		Name:     "With Tasks",
	}, nil)

	result, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:   tenantID,
		Name:       "With Tasks",
		TimingType: "daily",
		Tasks: []CreateScheduleTaskInput{
			{TaskType: "calculate_days", SortOrder: 1},
			{TaskType: "alive_check", SortOrder: 2},
		},
	})

	require.NoError(t, err)
	assert.Equal(t, "With Tasks", result.Name)
	// CreateTask should be called twice
	repo.AssertNumberOfCalls(t, "CreateTask", 2)
}

func TestScheduleService_Create_InvalidTaskSkipped(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByName", ctx, tenantID, "Skip Invalid").Return(nil, repository.ErrScheduleNotFound)
	repo.On("Create", ctx, mock.AnythingOfType("*model.Schedule")).Return(nil).Run(func(args mock.Arguments) {
		s := args.Get(1).(*model.Schedule)
		s.ID = scheduleID
	})
	repo.On("CreateTask", ctx, mock.AnythingOfType("*model.ScheduleTask")).Return(nil)
	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:       scheduleID,
		TenantID: tenantID,
		Name:     "Skip Invalid",
	}, nil)

	_, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:   tenantID,
		Name:       "Skip Invalid",
		TimingType: "manual",
		Tasks: []CreateScheduleTaskInput{
			{TaskType: "calculate_days", SortOrder: 1},
			{TaskType: "nonexistent_task", SortOrder: 2}, // should be skipped
		},
	})

	require.NoError(t, err)
	// Only one task created (valid one), the invalid one is skipped
	repo.AssertNumberOfCalls(t, "CreateTask", 1)
}

func TestScheduleService_Create_ManualNoNextRun(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByName", ctx, tenantID, "Manual Schedule").Return(nil, repository.ErrScheduleNotFound)
	repo.On("Create", ctx, mock.AnythingOfType("*model.Schedule")).Return(nil).Run(func(args mock.Arguments) {
		s := args.Get(1).(*model.Schedule)
		s.ID = scheduleID
		// Verify manual schedule has no next_run_at
		assert.Nil(t, s.NextRunAt)
	})
	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:         scheduleID,
		TenantID:   tenantID,
		Name:       "Manual Schedule",
		TimingType: model.TimingTypeManual,
	}, nil)

	result, err := svc.Create(ctx, CreateScheduleInput{
		TenantID:   tenantID,
		Name:       "Manual Schedule",
		TimingType: "manual",
	})

	require.NoError(t, err)
	assert.Equal(t, model.TimingTypeManual, result.TimingType)
}

func TestScheduleService_GetByID_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:       scheduleID,
		TenantID: tenantID,
		Name:     "Test Schedule",
	}, nil)

	result, err := svc.GetByID(ctx, tenantID, scheduleID)
	require.NoError(t, err)
	assert.Equal(t, scheduleID, result.ID)
}

func TestScheduleService_GetByID_NotFound(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(nil, repository.ErrScheduleNotFound)

	_, err := svc.GetByID(ctx, tenantID, scheduleID)
	assert.ErrorIs(t, err, ErrScheduleNotFound)
}

func TestScheduleService_List(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()

	repo.On("List", ctx, tenantID).Return([]model.Schedule{
		{ID: uuid.New(), Name: "Schedule A"},
		{ID: uuid.New(), Name: "Schedule B"},
	}, nil)

	results, err := svc.List(ctx, tenantID)
	require.NoError(t, err)
	assert.Len(t, results, 2)
}

func TestScheduleService_Update_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:           scheduleID,
		TenantID:     tenantID,
		Name:         "Old Name",
		TimingType:   model.TimingTypeDaily,
		TimingConfig: datatypes.JSON(`{"time":"02:00"}`),
		IsEnabled:    true,
	}, nil)
	repo.On("GetByName", ctx, tenantID, "New Name").Return(nil, repository.ErrScheduleNotFound)
	repo.On("Update", ctx, mock.AnythingOfType("*model.Schedule")).Return(nil)

	newName := "New Name"
	result, err := svc.Update(ctx, tenantID, scheduleID, UpdateScheduleInput{
		Name: &newName,
	})

	require.NoError(t, err)
	assert.Equal(t, "New Name", result.Name)
}

func TestScheduleService_Update_NotFound(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(nil, repository.ErrScheduleNotFound)

	newName := "Updated"
	_, err := svc.Update(ctx, tenantID, scheduleID, UpdateScheduleInput{Name: &newName})
	assert.ErrorIs(t, err, ErrScheduleNotFound)
}

func TestScheduleService_Update_EmptyName(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:       scheduleID,
		TenantID: tenantID,
		Name:     "Old Name",
	}, nil)

	emptyName := "  "
	_, err := svc.Update(ctx, tenantID, scheduleID, UpdateScheduleInput{Name: &emptyName})
	assert.ErrorIs(t, err, ErrScheduleNameRequired)
}

func TestScheduleService_Update_InvalidTimingType(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:       scheduleID,
		TenantID: tenantID,
		Name:     "Test",
	}, nil)

	invalidType := "bad_type"
	_, err := svc.Update(ctx, tenantID, scheduleID, UpdateScheduleInput{TimingType: &invalidType})
	assert.ErrorIs(t, err, ErrScheduleInvalidTiming)
}

func TestScheduleService_Update_DisableClearsNextRun(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	now := time.Now()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:           scheduleID,
		TenantID:     tenantID,
		Name:         "Disable Me",
		TimingType:   model.TimingTypeDaily,
		TimingConfig: datatypes.JSON(`{"time":"02:00"}`),
		IsEnabled:    true,
		NextRunAt:    &now,
	}, nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.Schedule")).Return(nil).Run(func(args mock.Arguments) {
		s := args.Get(1).(*model.Schedule)
		assert.Nil(t, s.NextRunAt, "disabled schedule should have nil NextRunAt")
		assert.False(t, s.IsEnabled)
	})

	disabled := false
	result, err := svc.Update(ctx, tenantID, scheduleID, UpdateScheduleInput{
		IsEnabled: &disabled,
	})

	require.NoError(t, err)
	assert.False(t, result.IsEnabled)
}

func TestScheduleService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("Delete", ctx, scheduleID).Return(nil)

	err := svc.Delete(ctx, tenantID, scheduleID)
	require.NoError(t, err)
}

func TestScheduleService_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(nil, repository.ErrScheduleNotFound)

	err := svc.Delete(ctx, tenantID, scheduleID)
	assert.ErrorIs(t, err, ErrScheduleNotFound)
}

// =============================================================================
// Task Management Tests
// =============================================================================

func TestScheduleService_AddTask_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("CreateTask", ctx, mock.AnythingOfType("*model.ScheduleTask")).Return(nil)

	task, err := svc.AddTask(ctx, tenantID, scheduleID, CreateScheduleTaskInput{
		TaskType:   "calculate_days",
		SortOrder:  1,
		Parameters: json.RawMessage(`{"date_range":"yesterday"}`),
	})

	require.NoError(t, err)
	assert.Equal(t, model.TaskTypeCalculateDays, task.TaskType)
	assert.Equal(t, 1, task.SortOrder)
}

func TestScheduleService_AddTask_InvalidType(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)

	_, err := svc.AddTask(ctx, tenantID, scheduleID, CreateScheduleTaskInput{
		TaskType: "invalid_task",
	})

	assert.ErrorIs(t, err, ErrScheduleInvalidTaskType)
}

func TestScheduleService_AddTask_ScheduleNotFound(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(nil, repository.ErrScheduleNotFound)

	_, err := svc.AddTask(ctx, tenantID, scheduleID, CreateScheduleTaskInput{
		TaskType: "alive_check",
	})

	assert.ErrorIs(t, err, ErrScheduleNotFound)
}

func TestScheduleService_UpdateTask_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	taskID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("GetTaskByID", ctx, taskID).Return(&model.ScheduleTask{
		ID:         taskID,
		ScheduleID: scheduleID,
		TaskType:   model.TaskTypeCalculateDays,
		SortOrder:  1,
		IsEnabled:  true,
	}, nil)
	repo.On("UpdateTask", ctx, mock.AnythingOfType("*model.ScheduleTask")).Return(nil)

	newOrder := 5
	task, err := svc.UpdateTask(ctx, tenantID, scheduleID, taskID, UpdateScheduleTaskInput{
		SortOrder: &newOrder,
	})

	require.NoError(t, err)
	assert.Equal(t, 5, task.SortOrder)
}

func TestScheduleService_UpdateTask_InvalidTaskType(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	taskID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("GetTaskByID", ctx, taskID).Return(&model.ScheduleTask{
		ID:         taskID,
		ScheduleID: scheduleID,
	}, nil)

	badType := "invalid"
	_, err := svc.UpdateTask(ctx, tenantID, scheduleID, taskID, UpdateScheduleTaskInput{
		TaskType: &badType,
	})

	assert.ErrorIs(t, err, ErrScheduleInvalidTaskType)
}

func TestScheduleService_UpdateTask_WrongSchedule(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	otherScheduleID := uuid.New()
	taskID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("GetTaskByID", ctx, taskID).Return(&model.ScheduleTask{
		ID:         taskID,
		ScheduleID: otherScheduleID, // belongs to another schedule
	}, nil)

	newOrder := 1
	_, err := svc.UpdateTask(ctx, tenantID, scheduleID, taskID, UpdateScheduleTaskInput{
		SortOrder: &newOrder,
	})

	assert.ErrorIs(t, err, ErrScheduleTaskNotFound)
}

func TestScheduleService_RemoveTask_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	taskID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("GetTaskByID", ctx, taskID).Return(&model.ScheduleTask{
		ID:         taskID,
		ScheduleID: scheduleID,
	}, nil)
	repo.On("DeleteTask", ctx, taskID).Return(nil)

	err := svc.RemoveTask(ctx, tenantID, scheduleID, taskID)
	require.NoError(t, err)
}

func TestScheduleService_RemoveTask_WrongSchedule(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	taskID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("GetTaskByID", ctx, taskID).Return(&model.ScheduleTask{
		ID:         taskID,
		ScheduleID: uuid.New(), // different schedule
	}, nil)

	err := svc.RemoveTask(ctx, tenantID, scheduleID, taskID)
	assert.ErrorIs(t, err, ErrScheduleTaskNotFound)
}

func TestScheduleService_ListTasks(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("ListTasks", ctx, scheduleID).Return([]model.ScheduleTask{
		{ID: uuid.New(), TaskType: model.TaskTypeAliveCheck},
		{ID: uuid.New(), TaskType: model.TaskTypeCalculateDays},
	}, nil)

	tasks, err := svc.ListTasks(ctx, tenantID, scheduleID)
	require.NoError(t, err)
	assert.Len(t, tasks, 2)
}

func TestScheduleService_ListTasks_ScheduleNotFound(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(nil, repository.ErrScheduleNotFound)

	_, err := svc.ListTasks(ctx, tenantID, scheduleID)
	assert.ErrorIs(t, err, ErrScheduleNotFound)
}

// =============================================================================
// Execution Management Tests
// =============================================================================

func TestScheduleService_ListExecutions(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID: scheduleID,
	}, nil)
	repo.On("ListExecutions", ctx, scheduleID, 10).Return([]model.ScheduleExecution{
		{ID: uuid.New(), Status: model.ExecutionStatusCompleted},
	}, nil)

	execs, err := svc.ListExecutions(ctx, tenantID, scheduleID, 10)
	require.NoError(t, err)
	assert.Len(t, execs, 1)
}

func TestScheduleService_GetExecutionByID_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	execID := uuid.New()

	repo.On("GetExecutionByID", ctx, execID).Return(&model.ScheduleExecution{
		ID:     execID,
		Status: model.ExecutionStatusCompleted,
	}, nil)

	exec, err := svc.GetExecutionByID(ctx, execID)
	require.NoError(t, err)
	assert.Equal(t, execID, exec.ID)
}

func TestScheduleService_GetExecutionByID_NotFound(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	svc := NewScheduleService(repo)

	execID := uuid.New()
	repo.On("GetExecutionByID", ctx, execID).Return(nil, repository.ErrScheduleExecutionNotFound)

	_, err := svc.GetExecutionByID(ctx, execID)
	assert.ErrorIs(t, err, ErrScheduleExecutionNotFound)
}

// =============================================================================
// Timing Computation Tests
// =============================================================================

func TestComputeNextRun_Seconds(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"interval":30}`)

	next := computeNextRun(model.TimingTypeSeconds, config, now)
	require.NotNil(t, next)
	assert.Equal(t, now.Add(30*time.Second), *next)
}

func TestComputeNextRun_Seconds_DefaultInterval(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{}`)

	next := computeNextRun(model.TimingTypeSeconds, config, now)
	require.NotNil(t, next)
	assert.Equal(t, now.Add(60*time.Second), *next)
}

func TestComputeNextRun_Minutes(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"interval":15}`)

	next := computeNextRun(model.TimingTypeMinutes, config, now)
	require.NotNil(t, next)
	assert.Equal(t, now.Add(15*time.Minute), *next)
}

func TestComputeNextRun_Minutes_DefaultInterval(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{}`)

	next := computeNextRun(model.TimingTypeMinutes, config, now)
	require.NotNil(t, next)
	assert.Equal(t, now.Add(5*time.Minute), *next)
}

func TestComputeNextRun_Hours(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"interval":4}`)

	next := computeNextRun(model.TimingTypeHours, config, now)
	require.NotNil(t, next)
	assert.Equal(t, now.Add(4*time.Hour), *next)
}

func TestComputeNextRun_Daily_FutureToday(t *testing.T) {
	now := time.Date(2026, 1, 15, 1, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"time":"02:00"}`)

	next := computeNextRun(model.TimingTypeDaily, config, now)
	require.NotNil(t, next)
	assert.Equal(t, time.Date(2026, 1, 15, 2, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Daily_PassedToday(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"time":"02:00"}`)

	next := computeNextRun(model.TimingTypeDaily, config, now)
	require.NotNil(t, next)
	// Time already passed today, should be tomorrow
	assert.Equal(t, time.Date(2026, 1, 16, 2, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Daily_DefaultTime(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{}`)

	next := computeNextRun(model.TimingTypeDaily, config, now)
	require.NotNil(t, next)
	// Default is 02:00, already passed, so next day
	assert.Equal(t, time.Date(2026, 1, 16, 2, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Weekly(t *testing.T) {
	// 2026-01-15 is a Thursday (weekday = 4)
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"day_of_week":1,"time":"03:00"}`) // Monday

	next := computeNextRun(model.TimingTypeWeekly, config, now)
	require.NotNil(t, next)
	// Next Monday after Thursday is Jan 19
	assert.Equal(t, time.Date(2026, 1, 19, 3, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Weekly_SameDay_FutureTime(t *testing.T) {
	// 2026-01-15 is a Thursday (weekday = 4)
	now := time.Date(2026, 1, 15, 1, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"day_of_week":4,"time":"03:00"}`) // Thursday at 03:00

	next := computeNextRun(model.TimingTypeWeekly, config, now)
	require.NotNil(t, next)
	// Same day, time not yet passed
	assert.Equal(t, time.Date(2026, 1, 15, 3, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Weekly_SameDay_PastTime(t *testing.T) {
	// 2026-01-15 is a Thursday (weekday = 4)
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"day_of_week":4,"time":"03:00"}`) // Thursday at 03:00

	next := computeNextRun(model.TimingTypeWeekly, config, now)
	require.NotNil(t, next)
	// Same day, time passed, should be next week
	assert.Equal(t, time.Date(2026, 1, 22, 3, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Monthly(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"day_of_month":20,"time":"04:00"}`)

	next := computeNextRun(model.TimingTypeMonthly, config, now)
	require.NotNil(t, next)
	assert.Equal(t, time.Date(2026, 1, 20, 4, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Monthly_DayPassed(t *testing.T) {
	now := time.Date(2026, 1, 25, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"day_of_month":15,"time":"04:00"}`)

	next := computeNextRun(model.TimingTypeMonthly, config, now)
	require.NotNil(t, next)
	// Day 15 already passed this month, should be next month
	assert.Equal(t, time.Date(2026, 2, 15, 4, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Monthly_ClampTo28(t *testing.T) {
	now := time.Date(2026, 1, 30, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{"day_of_month":31,"time":"02:00"}`)

	next := computeNextRun(model.TimingTypeMonthly, config, now)
	require.NotNil(t, next)
	// Day > 28 clamped to 28, which already passed, so next month 28th
	assert.Equal(t, time.Date(2026, 2, 28, 2, 0, 0, 0, time.UTC), *next)
}

func TestComputeNextRun_Manual_ReturnsNil(t *testing.T) {
	now := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	config := datatypes.JSON(`{}`)

	next := computeNextRun(model.TimingTypeManual, config, now)
	assert.Nil(t, next)
}

func TestParseTimeOfDay_Default(t *testing.T) {
	h, m := parseTimeOfDay("")
	assert.Equal(t, 2, h)
	assert.Equal(t, 0, m)
}

func TestParseTimeOfDay_Specific(t *testing.T) {
	h, m := parseTimeOfDay("14:30")
	assert.Equal(t, 14, h)
	assert.Equal(t, 30, m)
}

// =============================================================================
// Task Catalog Tests
// =============================================================================

func TestGetTaskCatalog(t *testing.T) {
	catalog := GetTaskCatalog()
	assert.Len(t, catalog, 10)

	// Verify expected task types are present
	types := make(map[model.TaskType]bool)
	for _, item := range catalog {
		types[item.TaskType] = true
		assert.NotEmpty(t, item.Name)
		assert.NotEmpty(t, item.Description)
		assert.NotNil(t, item.ParameterSchema)
	}

	assert.True(t, types[model.TaskTypeCalculateDays])
	assert.True(t, types[model.TaskTypeCalculateMonths])
	assert.True(t, types[model.TaskTypeBackupDatabase])
	assert.True(t, types[model.TaskTypeSendNotifications])
	assert.True(t, types[model.TaskTypeExportData])
	assert.True(t, types[model.TaskTypeAliveCheck])
	assert.True(t, types[model.TaskTypeTerminalSync])
	assert.True(t, types[model.TaskTypeTerminalImport])
	assert.True(t, types[model.TaskTypeExecuteMacros])
	assert.True(t, types[model.TaskTypeGenerateDayPlans])
}

// =============================================================================
// Task Handler Tests
// =============================================================================

func TestAliveCheckTaskHandler_Execute(t *testing.T) {
	handler := NewAliveCheckTaskHandler()
	tenantID := uuid.New()

	result, err := handler.Execute(context.Background(), tenantID, nil)
	require.NoError(t, err)
	require.NotNil(t, result)

	var data map[string]interface{}
	err = json.Unmarshal(result, &data)
	require.NoError(t, err)
	assert.Equal(t, "alive", data["status"])
	assert.Equal(t, tenantID.String(), data["tenant_id"])
	assert.NotEmpty(t, data["checked_at"])
}

func TestCalculateDaysTaskHandler_Execute_DefaultYesterday(t *testing.T) {
	recalcSvc := new(mockRecalcService)
	handler := NewCalculateDaysTaskHandler(recalcSvc)
	tenantID := uuid.New()

	recalcSvc.On("TriggerRecalcAll", mock.Anything, tenantID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(&RecalcResult{ProcessedDays: 10, FailedDays: 0}, nil)

	result, err := handler.Execute(context.Background(), tenantID, nil)
	require.NoError(t, err)
	require.NotNil(t, result)

	var data map[string]interface{}
	err = json.Unmarshal(result, &data)
	require.NoError(t, err)
	assert.Equal(t, "yesterday", data["date_range"])
	assert.Equal(t, float64(10), data["processed_days"])
	assert.Equal(t, float64(0), data["failed_days"])
}

func TestCalculateDaysTaskHandler_Execute_Today(t *testing.T) {
	recalcSvc := new(mockRecalcService)
	handler := NewCalculateDaysTaskHandler(recalcSvc)
	tenantID := uuid.New()

	recalcSvc.On("TriggerRecalcAll", mock.Anything, tenantID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(&RecalcResult{ProcessedDays: 5, FailedDays: 1}, nil)

	params := json.RawMessage(`{"date_range":"today"}`)
	result, err := handler.Execute(context.Background(), tenantID, params)
	require.NoError(t, err)

	var data map[string]interface{}
	err = json.Unmarshal(result, &data)
	require.NoError(t, err)
	assert.Equal(t, "today", data["date_range"])
}

func TestCalculateDaysTaskHandler_Execute_Last7Days(t *testing.T) {
	recalcSvc := new(mockRecalcService)
	handler := NewCalculateDaysTaskHandler(recalcSvc)
	tenantID := uuid.New()

	recalcSvc.On("TriggerRecalcAll", mock.Anything, tenantID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(&RecalcResult{ProcessedDays: 70, FailedDays: 0}, nil)

	params := json.RawMessage(`{"date_range":"last_7_days"}`)
	result, err := handler.Execute(context.Background(), tenantID, params)
	require.NoError(t, err)

	var data map[string]interface{}
	_ = json.Unmarshal(result, &data)
	assert.Equal(t, "last_7_days", data["date_range"])
}

func TestCalculateDaysTaskHandler_Execute_InvalidRange(t *testing.T) {
	recalcSvc := new(mockRecalcService)
	handler := NewCalculateDaysTaskHandler(recalcSvc)

	params := json.RawMessage(`{"date_range":"invalid"}`)
	_, err := handler.Execute(context.Background(), uuid.New(), params)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unknown date_range")
}

func TestCalculateDaysTaskHandler_Execute_RecalcFails(t *testing.T) {
	recalcSvc := new(mockRecalcService)
	handler := NewCalculateDaysTaskHandler(recalcSvc)
	tenantID := uuid.New()

	recalcSvc.On("TriggerRecalcAll", mock.Anything, tenantID, mock.AnythingOfType("time.Time"), mock.AnythingOfType("time.Time")).
		Return(nil, errors.New("database error"))

	_, err := handler.Execute(context.Background(), tenantID, nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "calculate_days failed")
}

func TestCalculateMonthsTaskHandler_Execute_DefaultPreviousMonth(t *testing.T) {
	monthlySvc := new(mockMonthlyCalcService)
	empRepo := new(mockEmployeeRepo)
	handler := NewCalculateMonthsTaskHandler(monthlySvc, empRepo)
	tenantID := uuid.New()

	emp1 := uuid.New()
	emp2 := uuid.New()

	empRepo.On("List", mock.Anything, mock.AnythingOfType("repository.EmployeeFilter")).Return(
		[]model.Employee{
			{ID: emp1},
			{ID: emp2},
		}, int64(2), nil,
	)
	monthlySvc.On("CalculateMonthBatch", mock.Anything, []uuid.UUID{emp1, emp2}, mock.AnythingOfType("int"), mock.AnythingOfType("int")).
		Return(&MonthlyCalcResult{ProcessedMonths: 2, SkippedMonths: 0, FailedMonths: 0})

	result, err := handler.Execute(context.Background(), tenantID, nil)
	require.NoError(t, err)

	var data map[string]interface{}
	_ = json.Unmarshal(result, &data)
	assert.Equal(t, float64(2), data["processed_months"])
	assert.Equal(t, float64(0), data["failed_months"])
}

func TestCalculateMonthsTaskHandler_Execute_SpecificMonth(t *testing.T) {
	monthlySvc := new(mockMonthlyCalcService)
	empRepo := new(mockEmployeeRepo)
	handler := NewCalculateMonthsTaskHandler(monthlySvc, empRepo)
	tenantID := uuid.New()

	empRepo.On("List", mock.Anything, mock.AnythingOfType("repository.EmployeeFilter")).Return(
		[]model.Employee{{ID: uuid.New()}}, int64(1), nil,
	)
	monthlySvc.On("CalculateMonthBatch", mock.Anything, mock.Anything, 2025, 6).
		Return(&MonthlyCalcResult{ProcessedMonths: 1})

	params := json.RawMessage(`{"year":2025,"month":6}`)
	result, err := handler.Execute(context.Background(), tenantID, params)
	require.NoError(t, err)

	var data map[string]interface{}
	_ = json.Unmarshal(result, &data)
	assert.Equal(t, float64(2025), data["year"])
	assert.Equal(t, float64(6), data["month"])
}

func TestCalculateMonthsTaskHandler_Execute_EmployeeListFails(t *testing.T) {
	monthlySvc := new(mockMonthlyCalcService)
	empRepo := new(mockEmployeeRepo)
	handler := NewCalculateMonthsTaskHandler(monthlySvc, empRepo)

	empRepo.On("List", mock.Anything, mock.AnythingOfType("repository.EmployeeFilter")).Return(
		[]model.Employee{}, int64(0), errors.New("db error"),
	)

	_, err := handler.Execute(context.Background(), uuid.New(), nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "failed to list employees")
}

func TestPlaceholderTaskHandler_Execute(t *testing.T) {
	handler := NewPlaceholderTaskHandler("backup_database")

	result, err := handler.Execute(context.Background(), uuid.New(), nil)
	require.NoError(t, err)

	var data map[string]interface{}
	_ = json.Unmarshal(result, &data)
	assert.Equal(t, "placeholder", data["status"])
	assert.Contains(t, data["message"], "backup_database")
}

// =============================================================================
// Scheduler Executor Tests
// =============================================================================

func TestSchedulerExecutor_RegisterHandler(t *testing.T) {
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)

	handler := new(mockTaskExecutor)
	executor.RegisterHandler(model.TaskTypeAliveCheck, handler)

	// Verify handler is registered (we test this through TriggerExecution)
	assert.NotNil(t, executor.handlers[model.TaskTypeAliveCheck])
}

func TestSchedulerExecutor_TriggerExecution_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	execID := uuid.New()
	triggeredBy := uuid.New()

	// Register a handler
	handler := new(mockTaskExecutor)
	executor.RegisterHandler(model.TaskTypeAliveCheck, handler)
	handler.On("Execute", mock.Anything, tenantID, mock.Anything).
		Return(json.RawMessage(`{"status":"ok"}`), nil)

	// Setup repo expectations
	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:           scheduleID,
		TenantID:     tenantID,
		Name:         "Test",
		TimingType:   model.TimingTypeManual,
		TimingConfig: datatypes.JSON(`{}`),
		Tasks: []model.ScheduleTask{
			{
				ID:         uuid.New(),
				ScheduleID: scheduleID,
				TaskType:   model.TaskTypeAliveCheck,
				SortOrder:  1,
				IsEnabled:  true,
				Parameters: datatypes.JSON(`{}`),
			},
		},
	}, nil)
	repo.On("CreateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil).Run(func(args mock.Arguments) {
		e := args.Get(1).(*model.ScheduleExecution)
		e.ID = execID
	})
	repo.On("CreateTaskExecution", ctx, mock.AnythingOfType("*model.ScheduleTaskExecution")).Return(nil)
	repo.On("UpdateTaskExecution", ctx, mock.AnythingOfType("*model.ScheduleTaskExecution")).Return(nil)
	repo.On("UpdateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil)
	repo.On("UpdateNextRunAt", ctx, scheduleID, mock.AnythingOfType("*time.Time"), mock.Anything).Return(nil)
	repo.On("GetExecutionByID", ctx, execID).Return(&model.ScheduleExecution{
		ID:             execID,
		Status:         model.ExecutionStatusCompleted,
		TasksSucceeded: 1,
		TasksFailed:    0,
	}, nil)

	exec, err := executor.TriggerExecution(ctx, tenantID, scheduleID, &triggeredBy)
	require.NoError(t, err)
	assert.Equal(t, model.ExecutionStatusCompleted, exec.Status)
	assert.Equal(t, 1, exec.TasksSucceeded)
	assert.Equal(t, 0, exec.TasksFailed)
}

func TestSchedulerExecutor_TriggerExecution_TaskFailure(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	execID := uuid.New()

	// Register a failing handler
	handler := new(mockTaskExecutor)
	executor.RegisterHandler(model.TaskTypeAliveCheck, handler)
	handler.On("Execute", mock.Anything, tenantID, mock.Anything).
		Return(nil, errors.New("task failed"))

	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:           scheduleID,
		TenantID:     tenantID,
		TimingType:   model.TimingTypeManual,
		TimingConfig: datatypes.JSON(`{}`),
		Tasks: []model.ScheduleTask{
			{
				ID:         uuid.New(),
				ScheduleID: scheduleID,
				TaskType:   model.TaskTypeAliveCheck,
				IsEnabled:  true,
				Parameters: datatypes.JSON(`{}`),
			},
		},
	}, nil)
	repo.On("CreateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil).Run(func(args mock.Arguments) {
		e := args.Get(1).(*model.ScheduleExecution)
		e.ID = execID
	})
	repo.On("CreateTaskExecution", ctx, mock.AnythingOfType("*model.ScheduleTaskExecution")).Return(nil)
	repo.On("UpdateTaskExecution", ctx, mock.AnythingOfType("*model.ScheduleTaskExecution")).Return(nil)
	repo.On("UpdateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil)
	repo.On("UpdateNextRunAt", ctx, scheduleID, mock.AnythingOfType("*time.Time"), mock.Anything).Return(nil)
	repo.On("GetExecutionByID", ctx, execID).Return(&model.ScheduleExecution{
		ID:          execID,
		Status:      model.ExecutionStatusFailed,
		TasksFailed: 1,
	}, nil)

	exec, err := executor.TriggerExecution(ctx, tenantID, scheduleID, nil)
	require.NoError(t, err)
	assert.Equal(t, model.ExecutionStatusFailed, exec.Status)
	assert.Equal(t, 1, exec.TasksFailed)
}

func TestSchedulerExecutor_TriggerExecution_NoHandlerRegistered(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	execID := uuid.New()

	// Do NOT register any handler
	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:           scheduleID,
		TenantID:     tenantID,
		TimingType:   model.TimingTypeManual,
		TimingConfig: datatypes.JSON(`{}`),
		Tasks: []model.ScheduleTask{
			{
				ID:         uuid.New(),
				ScheduleID: scheduleID,
				TaskType:   model.TaskTypeAliveCheck,
				IsEnabled:  true,
				Parameters: datatypes.JSON(`{}`),
			},
		},
	}, nil)
	repo.On("CreateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil).Run(func(args mock.Arguments) {
		e := args.Get(1).(*model.ScheduleExecution)
		e.ID = execID
	})
	repo.On("CreateTaskExecution", ctx, mock.AnythingOfType("*model.ScheduleTaskExecution")).Return(nil)
	repo.On("UpdateTaskExecution", ctx, mock.AnythingOfType("*model.ScheduleTaskExecution")).Return(nil)
	repo.On("UpdateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil)
	repo.On("UpdateNextRunAt", ctx, scheduleID, mock.AnythingOfType("*time.Time"), mock.Anything).Return(nil)
	repo.On("GetExecutionByID", ctx, execID).Return(&model.ScheduleExecution{
		ID:          execID,
		Status:      model.ExecutionStatusFailed,
		TasksFailed: 1,
	}, nil)

	exec, err := executor.TriggerExecution(ctx, tenantID, scheduleID, nil)
	require.NoError(t, err)
	assert.Equal(t, model.ExecutionStatusFailed, exec.Status)
}

func TestSchedulerExecutor_TriggerExecution_DisabledTaskSkipped(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)

	tenantID := uuid.New()
	scheduleID := uuid.New()
	execID := uuid.New()

	handler := new(mockTaskExecutor)
	executor.RegisterHandler(model.TaskTypeAliveCheck, handler)

	// Task is disabled, handler should NOT be called
	repo.On("GetByTenantAndID", ctx, tenantID, scheduleID).Return(&model.Schedule{
		ID:           scheduleID,
		TenantID:     tenantID,
		TimingType:   model.TimingTypeManual,
		TimingConfig: datatypes.JSON(`{}`),
		Tasks: []model.ScheduleTask{
			{
				ID:         uuid.New(),
				ScheduleID: scheduleID,
				TaskType:   model.TaskTypeAliveCheck,
				IsEnabled:  false, // disabled
				Parameters: datatypes.JSON(`{}`),
			},
		},
	}, nil)
	repo.On("CreateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil).Run(func(args mock.Arguments) {
		e := args.Get(1).(*model.ScheduleExecution)
		e.ID = execID
	})
	repo.On("UpdateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil)
	repo.On("UpdateNextRunAt", ctx, scheduleID, mock.AnythingOfType("*time.Time"), mock.Anything).Return(nil)
	repo.On("GetExecutionByID", ctx, execID).Return(&model.ScheduleExecution{
		ID:     execID,
		Status: model.ExecutionStatusCompleted,
	}, nil)

	exec, err := executor.TriggerExecution(ctx, tenantID, scheduleID, nil)
	require.NoError(t, err)
	assert.Equal(t, model.ExecutionStatusCompleted, exec.Status)
	// Handler should never be called since task is disabled
	handler.AssertNotCalled(t, "Execute")
}

func TestSchedulerExecutor_RunDueSchedules(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)

	scheduleID := uuid.New()
	tenantID := uuid.New()
	execID := uuid.New()

	handler := new(mockTaskExecutor)
	executor.RegisterHandler(model.TaskTypeAliveCheck, handler)
	handler.On("Execute", mock.Anything, tenantID, mock.Anything).
		Return(json.RawMessage(`{"status":"ok"}`), nil)

	repo.On("ListDueSchedules", ctx, mock.AnythingOfType("time.Time")).Return([]model.Schedule{
		{
			ID:           scheduleID,
			TenantID:     tenantID,
			Name:         "Due Schedule",
			TimingType:   model.TimingTypeDaily,
			TimingConfig: datatypes.JSON(`{"time":"02:00"}`),
			IsEnabled:    true,
			Tasks: []model.ScheduleTask{
				{
					ID:         uuid.New(),
					ScheduleID: scheduleID,
					TaskType:   model.TaskTypeAliveCheck,
					IsEnabled:  true,
					Parameters: datatypes.JSON(`{}`),
				},
			},
		},
	}, nil)
	repo.On("CreateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil).Run(func(args mock.Arguments) {
		e := args.Get(1).(*model.ScheduleExecution)
		e.ID = execID
	})
	repo.On("CreateTaskExecution", ctx, mock.AnythingOfType("*model.ScheduleTaskExecution")).Return(nil)
	repo.On("UpdateTaskExecution", ctx, mock.AnythingOfType("*model.ScheduleTaskExecution")).Return(nil)
	repo.On("UpdateExecution", ctx, mock.AnythingOfType("*model.ScheduleExecution")).Return(nil)
	repo.On("UpdateNextRunAt", ctx, scheduleID, mock.AnythingOfType("*time.Time"), mock.AnythingOfType("*time.Time")).Return(nil)
	repo.On("GetExecutionByID", ctx, execID).Return(&model.ScheduleExecution{
		ID:     execID,
		Status: model.ExecutionStatusCompleted,
	}, nil)

	err := executor.RunDueSchedules(ctx)
	require.NoError(t, err)
	handler.AssertCalled(t, "Execute", mock.Anything, tenantID, mock.Anything)
}

func TestSchedulerExecutor_RunDueSchedules_SkipsManual(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)

	repo.On("ListDueSchedules", ctx, mock.AnythingOfType("time.Time")).Return([]model.Schedule{
		{
			ID:         uuid.New(),
			TenantID:   uuid.New(),
			Name:       "Manual Only",
			TimingType: model.TimingTypeManual,
		},
	}, nil)

	err := executor.RunDueSchedules(ctx)
	require.NoError(t, err)
	// No execution should be created for manual schedules
	repo.AssertNotCalled(t, "CreateExecution")
}

func TestSchedulerExecutor_RunDueSchedules_NoDue(t *testing.T) {
	ctx := context.Background()
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)

	repo.On("ListDueSchedules", ctx, mock.AnythingOfType("time.Time")).Return([]model.Schedule{}, nil)

	err := executor.RunDueSchedules(ctx)
	require.NoError(t, err)
}

// =============================================================================
// Scheduler Engine Tests
// =============================================================================

func TestSchedulerEngine_StartStop(t *testing.T) {
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)
	engine := NewSchedulerEngine(executor, 100*time.Millisecond)

	assert.False(t, engine.IsRunning())

	engine.Start()
	assert.True(t, engine.IsRunning())

	// Starting again should be a no-op
	engine.Start()
	assert.True(t, engine.IsRunning())

	engine.Stop()
	assert.False(t, engine.IsRunning())

	// Stopping again should be a no-op
	engine.Stop()
	assert.False(t, engine.IsRunning())
}

func TestSchedulerEngine_DefaultInterval(t *testing.T) {
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)
	engine := NewSchedulerEngine(executor, 0)

	assert.Equal(t, 30*time.Second, engine.tickInterval)
}

func TestSchedulerEngine_NegativeInterval(t *testing.T) {
	repo := new(mockScheduleRepo)
	executor := NewSchedulerExecutor(repo)
	engine := NewSchedulerEngine(executor, -5*time.Second)

	assert.Equal(t, 30*time.Second, engine.tickInterval)
}
