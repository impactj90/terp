package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
)

var (
	ErrScheduleNotFound          = errors.New("schedule not found")
	ErrScheduleTaskNotFound      = errors.New("schedule task not found")
	ErrScheduleExecutionNotFound = errors.New("schedule execution not found")
	ErrScheduleNameRequired      = errors.New("schedule name is required")
	ErrScheduleNameConflict      = errors.New("schedule name already exists for this tenant")
	ErrScheduleTimingRequired    = errors.New("timing type is required")
	ErrScheduleInvalidTiming     = errors.New("invalid timing type")
	ErrScheduleInvalidTaskType   = errors.New("invalid task type")
	ErrScheduleDisabled          = errors.New("schedule is disabled")
)

// scheduleRepository defines the interface for schedule data access.
type scheduleRepository interface {
	Create(ctx context.Context, s *model.Schedule) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Schedule, error)
	GetByTenantAndID(ctx context.Context, tenantID, id uuid.UUID) (*model.Schedule, error)
	GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Schedule, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Schedule, error)
	ListEnabled(ctx context.Context, tenantID uuid.UUID) ([]model.Schedule, error)
	ListDueSchedules(ctx context.Context, now time.Time) ([]model.Schedule, error)
	Update(ctx context.Context, s *model.Schedule) error
	Delete(ctx context.Context, id uuid.UUID) error
	UpdateNextRunAt(ctx context.Context, id uuid.UUID, lastRun, nextRun *time.Time) error

	CreateTask(ctx context.Context, task *model.ScheduleTask) error
	GetTaskByID(ctx context.Context, id uuid.UUID) (*model.ScheduleTask, error)
	ListTasks(ctx context.Context, scheduleID uuid.UUID) ([]model.ScheduleTask, error)
	UpdateTask(ctx context.Context, task *model.ScheduleTask) error
	DeleteTask(ctx context.Context, id uuid.UUID) error

	CreateExecution(ctx context.Context, exec *model.ScheduleExecution) error
	GetExecutionByID(ctx context.Context, id uuid.UUID) (*model.ScheduleExecution, error)
	ListExecutions(ctx context.Context, scheduleID uuid.UUID, limit int) ([]model.ScheduleExecution, error)
	UpdateExecution(ctx context.Context, exec *model.ScheduleExecution) error

	CreateTaskExecution(ctx context.Context, te *model.ScheduleTaskExecution) error
	UpdateTaskExecution(ctx context.Context, te *model.ScheduleTaskExecution) error
}

// CreateScheduleInput represents the input for creating a schedule.
type CreateScheduleInput struct {
	TenantID     uuid.UUID
	Name         string
	Description  *string
	TimingType   string
	TimingConfig json.RawMessage
	IsEnabled    *bool
	Tasks        []CreateScheduleTaskInput
}

// UpdateScheduleInput represents the input for updating a schedule.
type UpdateScheduleInput struct {
	Name         *string
	Description  *string
	TimingType   *string
	TimingConfig json.RawMessage
	IsEnabled    *bool
}

// CreateScheduleTaskInput represents the input for creating a schedule task.
type CreateScheduleTaskInput struct {
	TaskType   string
	SortOrder  int
	Parameters json.RawMessage
	IsEnabled  *bool
}

// UpdateScheduleTaskInput represents the input for updating a schedule task.
type UpdateScheduleTaskInput struct {
	TaskType   *string
	SortOrder  *int
	Parameters json.RawMessage
	IsEnabled  *bool
}

// ScheduleService handles business logic for schedules.
type ScheduleService struct {
	repo scheduleRepository
}

// NewScheduleService creates a new ScheduleService.
func NewScheduleService(repo scheduleRepository) *ScheduleService {
	return &ScheduleService{repo: repo}
}

var validTimingTypes = map[string]bool{
	"seconds": true, "minutes": true, "hours": true,
	"daily": true, "weekly": true, "monthly": true, "manual": true,
}

var validTaskTypes = map[string]bool{
	"calculate_days": true, "calculate_months": true,
	"backup_database": true, "send_notifications": true,
	"export_data": true, "alive_check": true,
	"terminal_sync": true, "terminal_import": true,
	"execute_macros": true,
}

// Create creates a new schedule with optional tasks.
func (s *ScheduleService) Create(ctx context.Context, input CreateScheduleInput) (*model.Schedule, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrScheduleNameRequired
	}

	if input.TimingType == "" {
		return nil, ErrScheduleTimingRequired
	}
	if !validTimingTypes[input.TimingType] {
		return nil, ErrScheduleInvalidTiming
	}

	// Check name uniqueness within tenant
	existing, err := s.repo.GetByName(ctx, input.TenantID, name)
	if err == nil && existing != nil {
		return nil, ErrScheduleNameConflict
	}
	if err != nil && !errors.Is(err, repository.ErrScheduleNotFound) {
		return nil, err
	}

	isEnabled := true
	if input.IsEnabled != nil {
		isEnabled = *input.IsEnabled
	}

	timingConfig := datatypes.JSON("{}")
	if len(input.TimingConfig) > 0 {
		timingConfig = datatypes.JSON(input.TimingConfig)
	}

	schedule := &model.Schedule{
		TenantID:     input.TenantID,
		Name:         name,
		Description:  input.Description,
		TimingType:   model.TimingType(input.TimingType),
		TimingConfig: timingConfig,
		IsEnabled:    isEnabled,
	}

	// Compute next run time
	if isEnabled && input.TimingType != "manual" {
		nextRun := computeNextRun(model.TimingType(input.TimingType), timingConfig, time.Now())
		schedule.NextRunAt = nextRun
	}

	if err := s.repo.Create(ctx, schedule); err != nil {
		return nil, err
	}

	// Create tasks if provided
	for _, taskInput := range input.Tasks {
		if !validTaskTypes[taskInput.TaskType] {
			continue // skip invalid task types silently
		}
		taskEnabled := true
		if taskInput.IsEnabled != nil {
			taskEnabled = *taskInput.IsEnabled
		}

		taskParams := datatypes.JSON("{}")
		if len(taskInput.Parameters) > 0 {
			taskParams = datatypes.JSON(taskInput.Parameters)
		}

		task := &model.ScheduleTask{
			ScheduleID: schedule.ID,
			TaskType:   model.TaskType(taskInput.TaskType),
			SortOrder:  taskInput.SortOrder,
			Parameters: taskParams,
			IsEnabled:  taskEnabled,
		}
		if err := s.repo.CreateTask(ctx, task); err != nil {
			return nil, err
		}
	}

	// Re-fetch with tasks
	return s.repo.GetByTenantAndID(ctx, input.TenantID, schedule.ID)
}

// GetByID retrieves a schedule by ID scoped to tenant.
func (s *ScheduleService) GetByID(ctx context.Context, tenantID, id uuid.UUID) (*model.Schedule, error) {
	schedule, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrScheduleNotFound) {
			return nil, ErrScheduleNotFound
		}
		return nil, err
	}
	return schedule, nil
}

// List retrieves all schedules for a tenant.
func (s *ScheduleService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Schedule, error) {
	return s.repo.List(ctx, tenantID)
}

// Update updates a schedule.
func (s *ScheduleService) Update(ctx context.Context, tenantID, id uuid.UUID, input UpdateScheduleInput) (*model.Schedule, error) {
	schedule, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrScheduleNotFound) {
			return nil, ErrScheduleNotFound
		}
		return nil, err
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrScheduleNameRequired
		}
		// Check name uniqueness if changed
		if name != schedule.Name {
			existing, checkErr := s.repo.GetByName(ctx, tenantID, name)
			if checkErr == nil && existing != nil && existing.ID != schedule.ID {
				return nil, ErrScheduleNameConflict
			}
		}
		schedule.Name = name
	}

	if input.Description != nil {
		schedule.Description = input.Description
	}

	if input.TimingType != nil {
		if !validTimingTypes[*input.TimingType] {
			return nil, ErrScheduleInvalidTiming
		}
		schedule.TimingType = model.TimingType(*input.TimingType)
	}

	if len(input.TimingConfig) > 0 {
		schedule.TimingConfig = datatypes.JSON(input.TimingConfig)
	}

	if input.IsEnabled != nil {
		schedule.IsEnabled = *input.IsEnabled
	}

	// Recompute next run time
	if schedule.IsEnabled && schedule.TimingType != model.TimingTypeManual {
		nextRun := computeNextRun(schedule.TimingType, schedule.TimingConfig, time.Now())
		schedule.NextRunAt = nextRun
	} else if !schedule.IsEnabled || schedule.TimingType == model.TimingTypeManual {
		schedule.NextRunAt = nil
	}

	if err := s.repo.Update(ctx, schedule); err != nil {
		return nil, err
	}

	return s.repo.GetByTenantAndID(ctx, tenantID, id)
}

// Delete deletes a schedule.
func (s *ScheduleService) Delete(ctx context.Context, tenantID, id uuid.UUID) error {
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		if errors.Is(err, repository.ErrScheduleNotFound) {
			return ErrScheduleNotFound
		}
		return err
	}
	return s.repo.Delete(ctx, id)
}

// --- Task Management ---

// ListTasks retrieves all tasks for a schedule.
func (s *ScheduleService) ListTasks(ctx context.Context, tenantID, scheduleID uuid.UUID) ([]model.ScheduleTask, error) {
	// Verify schedule belongs to tenant
	if _, err := s.repo.GetByTenantAndID(ctx, tenantID, scheduleID); err != nil {
		if errors.Is(err, repository.ErrScheduleNotFound) {
			return nil, ErrScheduleNotFound
		}
		return nil, err
	}
	return s.repo.ListTasks(ctx, scheduleID)
}

// AddTask adds a task to a schedule.
func (s *ScheduleService) AddTask(ctx context.Context, tenantID, scheduleID uuid.UUID, input CreateScheduleTaskInput) (*model.ScheduleTask, error) {
	if _, err := s.repo.GetByTenantAndID(ctx, tenantID, scheduleID); err != nil {
		if errors.Is(err, repository.ErrScheduleNotFound) {
			return nil, ErrScheduleNotFound
		}
		return nil, err
	}

	if !validTaskTypes[input.TaskType] {
		return nil, ErrScheduleInvalidTaskType
	}

	isEnabled := true
	if input.IsEnabled != nil {
		isEnabled = *input.IsEnabled
	}

	params := datatypes.JSON("{}")
	if len(input.Parameters) > 0 {
		params = datatypes.JSON(input.Parameters)
	}

	task := &model.ScheduleTask{
		ScheduleID: scheduleID,
		TaskType:   model.TaskType(input.TaskType),
		SortOrder:  input.SortOrder,
		Parameters: params,
		IsEnabled:  isEnabled,
	}

	if err := s.repo.CreateTask(ctx, task); err != nil {
		return nil, err
	}
	return task, nil
}

// UpdateTask updates a schedule task.
func (s *ScheduleService) UpdateTask(ctx context.Context, tenantID, scheduleID, taskID uuid.UUID, input UpdateScheduleTaskInput) (*model.ScheduleTask, error) {
	if _, err := s.repo.GetByTenantAndID(ctx, tenantID, scheduleID); err != nil {
		if errors.Is(err, repository.ErrScheduleNotFound) {
			return nil, ErrScheduleNotFound
		}
		return nil, err
	}

	task, err := s.repo.GetTaskByID(ctx, taskID)
	if err != nil {
		if errors.Is(err, repository.ErrScheduleTaskNotFound) {
			return nil, ErrScheduleTaskNotFound
		}
		return nil, err
	}

	// Verify task belongs to this schedule
	if task.ScheduleID != scheduleID {
		return nil, ErrScheduleTaskNotFound
	}

	if input.TaskType != nil {
		if !validTaskTypes[*input.TaskType] {
			return nil, ErrScheduleInvalidTaskType
		}
		task.TaskType = model.TaskType(*input.TaskType)
	}
	if input.SortOrder != nil {
		task.SortOrder = *input.SortOrder
	}
	if len(input.Parameters) > 0 {
		task.Parameters = datatypes.JSON(input.Parameters)
	}
	if input.IsEnabled != nil {
		task.IsEnabled = *input.IsEnabled
	}

	if err := s.repo.UpdateTask(ctx, task); err != nil {
		return nil, err
	}
	return task, nil
}

// RemoveTask removes a task from a schedule.
func (s *ScheduleService) RemoveTask(ctx context.Context, tenantID, scheduleID, taskID uuid.UUID) error {
	if _, err := s.repo.GetByTenantAndID(ctx, tenantID, scheduleID); err != nil {
		if errors.Is(err, repository.ErrScheduleNotFound) {
			return ErrScheduleNotFound
		}
		return err
	}

	task, err := s.repo.GetTaskByID(ctx, taskID)
	if err != nil {
		if errors.Is(err, repository.ErrScheduleTaskNotFound) {
			return ErrScheduleTaskNotFound
		}
		return err
	}

	if task.ScheduleID != scheduleID {
		return ErrScheduleTaskNotFound
	}

	return s.repo.DeleteTask(ctx, taskID)
}

// --- Execution Management ---

// ListExecutions retrieves execution history for a schedule.
func (s *ScheduleService) ListExecutions(ctx context.Context, tenantID, scheduleID uuid.UUID, limit int) ([]model.ScheduleExecution, error) {
	if _, err := s.repo.GetByTenantAndID(ctx, tenantID, scheduleID); err != nil {
		if errors.Is(err, repository.ErrScheduleNotFound) {
			return nil, ErrScheduleNotFound
		}
		return nil, err
	}
	return s.repo.ListExecutions(ctx, scheduleID, limit)
}

// GetExecutionByID retrieves an execution by ID.
func (s *ScheduleService) GetExecutionByID(ctx context.Context, id uuid.UUID) (*model.ScheduleExecution, error) {
	exec, err := s.repo.GetExecutionByID(ctx, id)
	if err != nil {
		if errors.Is(err, repository.ErrScheduleExecutionNotFound) {
			return nil, ErrScheduleExecutionNotFound
		}
		return nil, err
	}
	return exec, nil
}

// --- Timing Computation ---

// computeNextRun calculates the next run time based on timing type and config.
func computeNextRun(timingType model.TimingType, timingConfig datatypes.JSON, now time.Time) *time.Time {
	var config struct {
		Interval   int    `json:"interval"`
		Time       string `json:"time"`
		DayOfWeek  int    `json:"day_of_week"`
		DayOfMonth int    `json:"day_of_month"`
	}
	_ = json.Unmarshal(timingConfig, &config)

	var next time.Time

	switch timingType {
	case model.TimingTypeSeconds:
		interval := config.Interval
		if interval <= 0 {
			interval = 60
		}
		next = now.Add(time.Duration(interval) * time.Second)

	case model.TimingTypeMinutes:
		interval := config.Interval
		if interval <= 0 {
			interval = 5
		}
		next = now.Add(time.Duration(interval) * time.Minute)

	case model.TimingTypeHours:
		interval := config.Interval
		if interval <= 0 {
			interval = 1
		}
		next = now.Add(time.Duration(interval) * time.Hour)

	case model.TimingTypeDaily:
		next = computeNextDailyRun(now, config.Time)

	case model.TimingTypeWeekly:
		next = computeNextWeeklyRun(now, config.DayOfWeek, config.Time)

	case model.TimingTypeMonthly:
		next = computeNextMonthlyRun(now, config.DayOfMonth, config.Time)

	case model.TimingTypeManual:
		return nil

	default:
		return nil
	}

	return &next
}

func parseTimeOfDay(timeStr string) (int, int) {
	if timeStr == "" {
		return 2, 0 // default 02:00
	}
	var h, m int
	n, _ := time.Parse("15:04", timeStr)
	h = n.Hour()
	m = n.Minute()
	return h, m
}

func computeNextDailyRun(now time.Time, timeStr string) time.Time {
	h, m := parseTimeOfDay(timeStr)
	next := time.Date(now.Year(), now.Month(), now.Day(), h, m, 0, 0, now.Location())
	if !next.After(now) {
		next = next.AddDate(0, 0, 1)
	}
	return next
}

func computeNextWeeklyRun(now time.Time, dayOfWeek int, timeStr string) time.Time {
	h, m := parseTimeOfDay(timeStr)
	next := time.Date(now.Year(), now.Month(), now.Day(), h, m, 0, 0, now.Location())

	// Find the next occurrence of the desired weekday
	daysUntil := (dayOfWeek - int(now.Weekday()) + 7) % 7
	if daysUntil == 0 && !next.After(now) {
		daysUntil = 7
	}
	next = next.AddDate(0, 0, daysUntil)
	return next
}

func computeNextMonthlyRun(now time.Time, dayOfMonth int, timeStr string) time.Time {
	h, m := parseTimeOfDay(timeStr)
	if dayOfMonth <= 0 {
		dayOfMonth = 1
	}
	if dayOfMonth > 28 {
		dayOfMonth = 28 // safe for all months
	}

	next := time.Date(now.Year(), now.Month(), dayOfMonth, h, m, 0, 0, now.Location())
	if !next.After(now) {
		next = next.AddDate(0, 1, 0)
	}
	return next
}
