package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrScheduleNotFound          = errors.New("schedule not found")
	ErrScheduleTaskNotFound      = errors.New("schedule task not found")
	ErrScheduleExecutionNotFound = errors.New("schedule execution not found")
	ErrScheduleNameConflict      = errors.New("schedule name already exists for this tenant")
)

// ScheduleRepository handles schedule data access.
type ScheduleRepository struct {
	db *DB
}

// NewScheduleRepository creates a new ScheduleRepository.
func NewScheduleRepository(db *DB) *ScheduleRepository {
	return &ScheduleRepository{db: db}
}

// Create creates a new schedule.
func (r *ScheduleRepository) Create(ctx context.Context, s *model.Schedule) error {
	return r.db.GORM.WithContext(ctx).Create(s).Error
}

// GetByID retrieves a schedule by ID with tasks preloaded.
func (r *ScheduleRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Schedule, error) {
	var s model.Schedule
	err := r.db.GORM.WithContext(ctx).
		Preload("Tasks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		First(&s, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrScheduleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get schedule: %w", err)
	}
	return &s, nil
}

// GetByTenantAndID retrieves a schedule scoped by tenant.
func (r *ScheduleRepository) GetByTenantAndID(ctx context.Context, tenantID, id uuid.UUID) (*model.Schedule, error) {
	var s model.Schedule
	err := r.db.GORM.WithContext(ctx).
		Preload("Tasks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Where("tenant_id = ?", tenantID).
		First(&s, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrScheduleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get schedule: %w", err)
	}
	return &s, nil
}

// List retrieves all schedules for a tenant.
func (r *ScheduleRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Schedule, error) {
	var schedules []model.Schedule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Preload("Tasks", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Order("name ASC").
		Find(&schedules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list schedules: %w", err)
	}
	return schedules, nil
}

// ListEnabled retrieves all enabled schedules for a tenant.
func (r *ScheduleRepository) ListEnabled(ctx context.Context, tenantID uuid.UUID) ([]model.Schedule, error) {
	var schedules []model.Schedule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND is_enabled = ?", tenantID, true).
		Preload("Tasks", func(db *gorm.DB) *gorm.DB {
			return db.Where("is_enabled = ?", true).Order("sort_order ASC")
		}).
		Order("name ASC").
		Find(&schedules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list enabled schedules: %w", err)
	}
	return schedules, nil
}

// ListDueSchedules retrieves all enabled schedules due to run.
func (r *ScheduleRepository) ListDueSchedules(ctx context.Context, now time.Time) ([]model.Schedule, error) {
	var schedules []model.Schedule
	err := r.db.GORM.WithContext(ctx).
		Where("is_enabled = ? AND (next_run_at IS NULL OR next_run_at <= ?)", true, now).
		Where("timing_type != ?", model.TimingTypeManual).
		Preload("Tasks", func(db *gorm.DB) *gorm.DB {
			return db.Where("is_enabled = ?", true).Order("sort_order ASC")
		}).
		Find(&schedules).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list due schedules: %w", err)
	}
	return schedules, nil
}

// Update saves changes to a schedule.
func (r *ScheduleRepository) Update(ctx context.Context, s *model.Schedule) error {
	return r.db.GORM.WithContext(ctx).Save(s).Error
}

// Delete deletes a schedule and its tasks (cascade).
func (r *ScheduleRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.Schedule{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete schedule: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrScheduleNotFound
	}
	return nil
}

// GetByName retrieves a schedule by tenant + name.
func (r *ScheduleRepository) GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Schedule, error) {
	var s model.Schedule
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND name = ?", tenantID, name).
		First(&s).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrScheduleNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get schedule by name: %w", err)
	}
	return &s, nil
}

// UpdateNextRunAt updates only the next_run_at and last_run_at fields.
func (r *ScheduleRepository) UpdateNextRunAt(ctx context.Context, id uuid.UUID, lastRun, nextRun *time.Time) error {
	return r.db.GORM.WithContext(ctx).
		Model(&model.Schedule{}).
		Where("id = ?", id).
		Updates(map[string]interface{}{
			"last_run_at": lastRun,
			"next_run_at": nextRun,
		}).Error
}

// --- Schedule Task methods ---

// CreateTask creates a new task within a schedule.
func (r *ScheduleRepository) CreateTask(ctx context.Context, task *model.ScheduleTask) error {
	return r.db.GORM.WithContext(ctx).Create(task).Error
}

// GetTaskByID retrieves a task by ID.
func (r *ScheduleRepository) GetTaskByID(ctx context.Context, id uuid.UUID) (*model.ScheduleTask, error) {
	var task model.ScheduleTask
	err := r.db.GORM.WithContext(ctx).
		First(&task, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrScheduleTaskNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get schedule task: %w", err)
	}
	return &task, nil
}

// ListTasks retrieves all tasks for a schedule.
func (r *ScheduleRepository) ListTasks(ctx context.Context, scheduleID uuid.UUID) ([]model.ScheduleTask, error) {
	var tasks []model.ScheduleTask
	err := r.db.GORM.WithContext(ctx).
		Where("schedule_id = ?", scheduleID).
		Order("sort_order ASC").
		Find(&tasks).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list schedule tasks: %w", err)
	}
	return tasks, nil
}

// UpdateTask saves changes to a schedule task.
func (r *ScheduleRepository) UpdateTask(ctx context.Context, task *model.ScheduleTask) error {
	return r.db.GORM.WithContext(ctx).Save(task).Error
}

// DeleteTask deletes a schedule task by ID.
func (r *ScheduleRepository) DeleteTask(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.ScheduleTask{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete schedule task: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrScheduleTaskNotFound
	}
	return nil
}

// --- Execution methods ---

// CreateExecution creates a new execution record.
func (r *ScheduleRepository) CreateExecution(ctx context.Context, exec *model.ScheduleExecution) error {
	return r.db.GORM.WithContext(ctx).Create(exec).Error
}

// GetExecutionByID retrieves an execution by ID with task executions preloaded.
func (r *ScheduleRepository) GetExecutionByID(ctx context.Context, id uuid.UUID) (*model.ScheduleExecution, error) {
	var exec model.ScheduleExecution
	err := r.db.GORM.WithContext(ctx).
		Preload("TaskExecutions", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Preload("Schedule").
		First(&exec, "id = ?", id).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrScheduleExecutionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get schedule execution: %w", err)
	}
	return &exec, nil
}

// ListExecutions retrieves execution history for a schedule.
func (r *ScheduleRepository) ListExecutions(ctx context.Context, scheduleID uuid.UUID, limit int) ([]model.ScheduleExecution, error) {
	if limit <= 0 {
		limit = 20
	}
	var executions []model.ScheduleExecution
	err := r.db.GORM.WithContext(ctx).
		Where("schedule_id = ?", scheduleID).
		Preload("TaskExecutions", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC")
		}).
		Order("created_at DESC").
		Limit(limit).
		Find(&executions).Error

	if err != nil {
		return nil, fmt.Errorf("failed to list schedule executions: %w", err)
	}
	return executions, nil
}

// UpdateExecution saves changes to an execution.
func (r *ScheduleRepository) UpdateExecution(ctx context.Context, exec *model.ScheduleExecution) error {
	return r.db.GORM.WithContext(ctx).Save(exec).Error
}

// --- Task Execution methods ---

// CreateTaskExecution creates a new task execution record.
func (r *ScheduleRepository) CreateTaskExecution(ctx context.Context, te *model.ScheduleTaskExecution) error {
	return r.db.GORM.WithContext(ctx).Create(te).Error
}

// UpdateTaskExecution saves changes to a task execution.
func (r *ScheduleRepository) UpdateTaskExecution(ctx context.Context, te *model.ScheduleTaskExecution) error {
	return r.db.GORM.WithContext(ctx).Save(te).Error
}
