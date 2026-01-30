package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/datatypes"

	"github.com/tolga/terp/internal/model"
)

// TaskExecutor is the interface that individual task handlers implement.
type TaskExecutor interface {
	Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error)
}

// SchedulerExecutor orchestrates schedule execution.
type SchedulerExecutor struct {
	repo     scheduleRepository
	handlers map[model.TaskType]TaskExecutor
}

// NewSchedulerExecutor creates a new SchedulerExecutor.
func NewSchedulerExecutor(repo scheduleRepository) *SchedulerExecutor {
	return &SchedulerExecutor{
		repo:     repo,
		handlers: make(map[model.TaskType]TaskExecutor),
	}
}

// RegisterHandler registers a task executor for a specific task type.
func (e *SchedulerExecutor) RegisterHandler(taskType model.TaskType, handler TaskExecutor) {
	e.handlers[taskType] = handler
}

// TriggerExecution manually triggers a schedule execution.
func (e *SchedulerExecutor) TriggerExecution(ctx context.Context, tenantID, scheduleID uuid.UUID, triggeredBy *uuid.UUID) (*model.ScheduleExecution, error) {
	schedule, err := e.repo.GetByTenantAndID(ctx, tenantID, scheduleID)
	if err != nil {
		return nil, err
	}

	return e.executeSchedule(ctx, schedule, model.TriggerTypeManual, triggeredBy)
}

// executeSchedule runs all enabled tasks in order.
func (e *SchedulerExecutor) executeSchedule(ctx context.Context, schedule *model.Schedule, triggerType model.TriggerType, triggeredBy *uuid.UUID) (*model.ScheduleExecution, error) {
	now := time.Now()

	exec := &model.ScheduleExecution{
		TenantID:    schedule.TenantID,
		ScheduleID:  schedule.ID,
		Status:      model.ExecutionStatusRunning,
		TriggerType: triggerType,
		TriggeredBy: triggeredBy,
		StartedAt:   &now,
		TasksTotal:  len(schedule.Tasks),
	}

	if err := e.repo.CreateExecution(ctx, exec); err != nil {
		return nil, fmt.Errorf("failed to create execution record: %w", err)
	}

	var succeeded, failed int

	for _, task := range schedule.Tasks {
		if !task.IsEnabled {
			continue
		}

		taskExec := e.executeTask(ctx, exec.ID, schedule.TenantID, task)

		if taskExec.Status == model.TaskExecutionStatusCompleted {
			succeeded++
		} else if taskExec.Status == model.TaskExecutionStatusFailed {
			failed++
		}
	}

	// Determine overall status
	completedAt := time.Now()
	exec.CompletedAt = &completedAt
	exec.TasksSucceeded = succeeded
	exec.TasksFailed = failed

	switch {
	case failed == 0:
		exec.Status = model.ExecutionStatusCompleted
	case succeeded == 0:
		exec.Status = model.ExecutionStatusFailed
		errMsg := "all tasks failed"
		exec.ErrorMessage = &errMsg
	default:
		exec.Status = model.ExecutionStatusPartial
		errMsg := fmt.Sprintf("%d of %d tasks failed", failed, succeeded+failed)
		exec.ErrorMessage = &errMsg
	}

	if err := e.repo.UpdateExecution(ctx, exec); err != nil {
		log.Error().Err(err).Str("execution_id", exec.ID.String()).Msg("failed to update execution status")
	}

	// Update schedule's last_run_at and next_run_at
	nextRun := computeNextRun(schedule.TimingType, schedule.TimingConfig, completedAt)
	if updateErr := e.repo.UpdateNextRunAt(ctx, schedule.ID, &completedAt, nextRun); updateErr != nil {
		log.Error().Err(updateErr).Str("schedule_id", schedule.ID.String()).Msg("failed to update next run time")
	}

	// Re-fetch with task executions
	return e.repo.GetExecutionByID(ctx, exec.ID)
}

// executeTask runs a single task and records the result.
func (e *SchedulerExecutor) executeTask(ctx context.Context, executionID uuid.UUID, tenantID uuid.UUID, task model.ScheduleTask) *model.ScheduleTaskExecution {
	now := time.Now()

	taskExec := &model.ScheduleTaskExecution{
		ExecutionID: executionID,
		TaskType:    task.TaskType,
		SortOrder:   task.SortOrder,
		Status:      model.TaskExecutionStatusRunning,
		StartedAt:   &now,
		Result:      datatypes.JSON("{}"),
	}

	if err := e.repo.CreateTaskExecution(ctx, taskExec); err != nil {
		log.Error().Err(err).Msg("failed to create task execution record")
		taskExec.Status = model.TaskExecutionStatusFailed
		errMsg := "failed to create execution record"
		taskExec.ErrorMessage = &errMsg
		return taskExec
	}

	handler, ok := e.handlers[task.TaskType]
	if !ok {
		completedAt := time.Now()
		taskExec.CompletedAt = &completedAt
		taskExec.Status = model.TaskExecutionStatusFailed
		errMsg := fmt.Sprintf("no handler registered for task type: %s", task.TaskType)
		taskExec.ErrorMessage = &errMsg
		_ = e.repo.UpdateTaskExecution(ctx, taskExec)
		return taskExec
	}

	result, execErr := handler.Execute(ctx, tenantID, json.RawMessage(task.Parameters))

	completedAt := time.Now()
	taskExec.CompletedAt = &completedAt

	if execErr != nil {
		taskExec.Status = model.TaskExecutionStatusFailed
		errMsg := execErr.Error()
		taskExec.ErrorMessage = &errMsg
		log.Warn().
			Err(execErr).
			Str("task_type", string(task.TaskType)).
			Str("execution_id", executionID.String()).
			Msg("task execution failed")
	} else {
		taskExec.Status = model.TaskExecutionStatusCompleted
	}

	if result != nil {
		taskExec.Result = datatypes.JSON(result)
	}

	if updateErr := e.repo.UpdateTaskExecution(ctx, taskExec); updateErr != nil {
		log.Error().Err(updateErr).Msg("failed to update task execution status")
	}

	return taskExec
}

// RunDueSchedules finds and executes all schedules that are due.
// This is called by the scheduler engine on a tick.
func (e *SchedulerExecutor) RunDueSchedules(ctx context.Context) error {
	schedules, err := e.repo.ListDueSchedules(ctx, time.Now())
	if err != nil {
		return fmt.Errorf("failed to list due schedules: %w", err)
	}

	for _, schedule := range schedules {
		if schedule.TimingType == model.TimingTypeManual {
			continue
		}

		logger := log.With().
			Str("schedule_id", schedule.ID.String()).
			Str("schedule_name", schedule.Name).
			Logger()

		logger.Info().Msg("executing due schedule")

		_, execErr := e.executeSchedule(ctx, &schedule, model.TriggerTypeScheduled, nil)
		if execErr != nil {
			if errors.Is(ctx.Err(), context.Canceled) {
				return ctx.Err()
			}
			logger.Error().Err(execErr).Msg("schedule execution failed")
		}
	}

	return nil
}
