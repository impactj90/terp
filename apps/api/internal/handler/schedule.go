package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

// ScheduleHandler handles schedule HTTP requests.
type ScheduleHandler struct {
	svc      *service.ScheduleService
	executor *service.SchedulerExecutor
}

// NewScheduleHandler creates a new ScheduleHandler.
func NewScheduleHandler(svc *service.ScheduleService, executor *service.SchedulerExecutor) *ScheduleHandler {
	return &ScheduleHandler{svc: svc, executor: executor}
}

// List handles GET /schedules
func (h *ScheduleHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	schedules, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list schedules")
		return
	}

	respondJSON(w, http.StatusOK, scheduleListToResponse(schedules))
}

// Get handles GET /schedules/{id}
func (h *ScheduleHandler) Get(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	schedule, err := h.svc.GetByID(r.Context(), tenantID, id)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, scheduleToResponse(schedule))
}

// Create handles POST /schedules
func (h *ScheduleHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateScheduleInput{
		TenantID:   tenantID,
		Name:       *req.Name,
		TimingType: *req.TimingType,
	}

	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.TimingConfig != nil {
		configBytes, _ := json.Marshal(req.TimingConfig)
		input.TimingConfig = configBytes
	}
	input.IsEnabled = &req.IsEnabled

	for _, t := range req.Tasks {
		if t == nil {
			continue
		}
		taskInput := service.CreateScheduleTaskInput{
			TaskType:  *t.TaskType,
			SortOrder: int(*t.SortOrder),
		}
		if t.Parameters != nil {
			paramBytes, _ := json.Marshal(t.Parameters)
			taskInput.Parameters = paramBytes
		}
		taskInput.IsEnabled = &t.IsEnabled
		input.Tasks = append(input.Tasks, taskInput)
	}

	schedule, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, scheduleToResponse(schedule))
}

// Update handles PATCH /schedules/{id}
func (h *ScheduleHandler) Update(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	var req models.UpdateScheduleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateScheduleInput{}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	if req.TimingType != "" {
		input.TimingType = &req.TimingType
	}
	if req.TimingConfig != nil {
		configBytes, _ := json.Marshal(req.TimingConfig)
		input.TimingConfig = configBytes
	}
	input.IsEnabled = &req.IsEnabled

	schedule, err := h.svc.Update(r.Context(), tenantID, id, input)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, scheduleToResponse(schedule))
}

// Delete handles DELETE /schedules/{id}
func (h *ScheduleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	if err := h.svc.Delete(r.Context(), tenantID, id); err != nil {
		handleScheduleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ListTasks handles GET /schedules/{id}/tasks
func (h *ScheduleHandler) ListTasks(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	scheduleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	tasks, err := h.svc.ListTasks(r.Context(), tenantID, scheduleID)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"data": scheduleTasksToResponse(tasks),
	})
}

// AddTask handles POST /schedules/{id}/tasks
func (h *ScheduleHandler) AddTask(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	scheduleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	var req models.CreateScheduleTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.CreateScheduleTaskInput{
		TaskType:  *req.TaskType,
		SortOrder: int(*req.SortOrder),
	}
	if req.Parameters != nil {
		paramBytes, _ := json.Marshal(req.Parameters)
		input.Parameters = paramBytes
	}
	input.IsEnabled = &req.IsEnabled

	task, err := h.svc.AddTask(r.Context(), tenantID, scheduleID, input)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, scheduleTaskToResponse(task))
}

// UpdateTask handles PATCH /schedules/{id}/tasks/{taskId}
func (h *ScheduleHandler) UpdateTask(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	scheduleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	taskID, err := uuid.Parse(chi.URLParam(r, "taskId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid task ID")
		return
	}

	var req models.UpdateScheduleTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input := service.UpdateScheduleTaskInput{}
	if req.TaskType != "" {
		input.TaskType = &req.TaskType
	}
	if req.SortOrder != 0 {
		order := int(req.SortOrder)
		input.SortOrder = &order
	}
	if req.Parameters != nil {
		paramBytes, _ := json.Marshal(req.Parameters)
		input.Parameters = paramBytes
	}
	input.IsEnabled = &req.IsEnabled

	task, err := h.svc.UpdateTask(r.Context(), tenantID, scheduleID, taskID, input)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, scheduleTaskToResponse(task))
}

// RemoveTask handles DELETE /schedules/{id}/tasks/{taskId}
func (h *ScheduleHandler) RemoveTask(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	scheduleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	taskID, err := uuid.Parse(chi.URLParam(r, "taskId"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid task ID")
		return
	}

	if err := h.svc.RemoveTask(r.Context(), tenantID, scheduleID, taskID); err != nil {
		handleScheduleError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// TriggerExecution handles POST /schedules/{id}/execute
func (h *ScheduleHandler) TriggerExecution(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	scheduleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	var triggeredBy *uuid.UUID
	if user, ok := auth.UserFromContext(r.Context()); ok {
		triggeredBy = &user.ID
	}

	exec, err := h.executor.TriggerExecution(r.Context(), tenantID, scheduleID, triggeredBy)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, scheduleExecutionToResponse(exec))
}

// ListExecutions handles GET /schedules/{id}/executions
func (h *ScheduleHandler) ListExecutions(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	scheduleID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid schedule ID")
		return
	}

	limit := 20
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	executions, err := h.svc.ListExecutions(r.Context(), tenantID, scheduleID, limit)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, scheduleExecutionListToResponse(executions))
}

// GetExecution handles GET /schedule-executions/{id}
func (h *ScheduleHandler) GetExecution(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid execution ID")
		return
	}

	exec, err := h.svc.GetExecutionByID(r.Context(), id)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, scheduleExecutionToResponse(exec))
}

// GetTaskCatalog handles GET /scheduler/task-catalog
func (h *ScheduleHandler) GetTaskCatalog(w http.ResponseWriter, _ *http.Request) {
	catalog := service.GetTaskCatalog()
	respondJSON(w, http.StatusOK, taskCatalogToResponse(catalog))
}

// --- Response mapping ---

func scheduleToResponse(s *model.Schedule) *models.Schedule {
	id := strfmt.UUID(s.ID.String())
	tenantID := strfmt.UUID(s.TenantID.String())
	timingType := string(s.TimingType)

	resp := &models.Schedule{
		ID:         &id,
		TenantID:   &tenantID,
		Name:       &s.Name,
		TimingType: &timingType,
		IsEnabled:  s.IsEnabled,
		CreatedAt:  strfmt.DateTime(s.CreatedAt),
		UpdatedAt:  strfmt.DateTime(s.UpdatedAt),
	}

	if s.Description != nil {
		resp.Description = s.Description
	}

	// Map timing config from JSON
	var timingConfig models.TimingConfig
	if len(s.TimingConfig) > 0 {
		_ = json.Unmarshal(s.TimingConfig, &timingConfig)
		resp.TimingConfig = &timingConfig
	}

	if s.LastRunAt != nil {
		lastRun := strfmt.DateTime(*s.LastRunAt)
		resp.LastRunAt = &lastRun
	}
	if s.NextRunAt != nil {
		nextRun := strfmt.DateTime(*s.NextRunAt)
		resp.NextRunAt = &nextRun
	}

	if len(s.Tasks) > 0 {
		resp.Tasks = scheduleTasksToResponse(s.Tasks)
	}

	return resp
}

func scheduleListToResponse(schedules []model.Schedule) *models.ScheduleList {
	data := make([]*models.Schedule, 0, len(schedules))
	for i := range schedules {
		data = append(data, scheduleToResponse(&schedules[i]))
	}
	return &models.ScheduleList{Data: data}
}

func scheduleTaskToResponse(t *model.ScheduleTask) *models.ScheduleTask {
	id := strfmt.UUID(t.ID.String())
	scheduleID := strfmt.UUID(t.ScheduleID.String())
	taskType := string(t.TaskType)
	sortOrder := int64(t.SortOrder)

	resp := &models.ScheduleTask{
		ID:         &id,
		ScheduleID: &scheduleID,
		TaskType:   &taskType,
		SortOrder:  &sortOrder,
		IsEnabled:  t.IsEnabled,
		CreatedAt:  strfmt.DateTime(t.CreatedAt),
		UpdatedAt:  strfmt.DateTime(t.UpdatedAt),
	}

	// Map parameters from JSON
	var params interface{}
	if len(t.Parameters) > 0 {
		_ = json.Unmarshal(t.Parameters, &params)
		resp.Parameters = params
	}

	return resp
}

func scheduleTasksToResponse(tasks []model.ScheduleTask) []*models.ScheduleTask {
	result := make([]*models.ScheduleTask, 0, len(tasks))
	for i := range tasks {
		result = append(result, scheduleTaskToResponse(&tasks[i]))
	}
	return result
}

func scheduleExecutionToResponse(e *model.ScheduleExecution) *models.ScheduleExecution {
	id := strfmt.UUID(e.ID.String())
	scheduleID := strfmt.UUID(e.ScheduleID.String())
	status := string(e.Status)

	resp := &models.ScheduleExecution{
		ID:             &id,
		TenantID:       strfmt.UUID(e.TenantID.String()),
		ScheduleID:     &scheduleID,
		Status:         &status,
		TriggerType:    string(e.TriggerType),
		TasksTotal:     int64(e.TasksTotal),
		TasksSucceeded: int64(e.TasksSucceeded),
		TasksFailed:    int64(e.TasksFailed),
		CreatedAt:      strfmt.DateTime(e.CreatedAt),
	}

	if e.TriggeredBy != nil {
		triggeredBy := strfmt.UUID(e.TriggeredBy.String())
		resp.TriggeredBy = &triggeredBy
	}
	if e.StartedAt != nil {
		startedAt := strfmt.DateTime(*e.StartedAt)
		resp.StartedAt = &startedAt
	}
	if e.CompletedAt != nil {
		completedAt := strfmt.DateTime(*e.CompletedAt)
		resp.CompletedAt = &completedAt
	}
	if e.ErrorMessage != nil {
		resp.ErrorMessage = e.ErrorMessage
	}

	if len(e.TaskExecutions) > 0 {
		resp.TaskExecutions = make([]*models.ScheduleTaskExecution, 0, len(e.TaskExecutions))
		for _, te := range e.TaskExecutions {
			resp.TaskExecutions = append(resp.TaskExecutions, scheduleTaskExecutionToResponse(&te))
		}
	}

	return resp
}

func scheduleTaskExecutionToResponse(te *model.ScheduleTaskExecution) *models.ScheduleTaskExecution {
	resp := &models.ScheduleTaskExecution{
		ID:          strfmt.UUID(te.ID.String()),
		ExecutionID: strfmt.UUID(te.ExecutionID.String()),
		TaskType:    string(te.TaskType),
		SortOrder:   int64(te.SortOrder),
		Status:      string(te.Status),
		CreatedAt:   strfmt.DateTime(te.CreatedAt),
	}

	if te.StartedAt != nil {
		startedAt := strfmt.DateTime(*te.StartedAt)
		resp.StartedAt = &startedAt
	}
	if te.CompletedAt != nil {
		completedAt := strfmt.DateTime(*te.CompletedAt)
		resp.CompletedAt = &completedAt
	}
	if te.ErrorMessage != nil {
		resp.ErrorMessage = te.ErrorMessage
	}

	// Map result from JSON
	var result interface{}
	if len(te.Result) > 0 {
		_ = json.Unmarshal(te.Result, &result)
		resp.Result = result
	}

	return resp
}

func scheduleExecutionListToResponse(execs []model.ScheduleExecution) *models.ScheduleExecutionList {
	data := make([]*models.ScheduleExecution, 0, len(execs))
	for i := range execs {
		data = append(data, scheduleExecutionToResponse(&execs[i]))
	}
	return &models.ScheduleExecutionList{Data: data}
}

func taskCatalogToResponse(catalog []service.TaskCatalogItem) *models.TaskCatalog {
	data := make([]*models.TaskCatalogEntry, 0, len(catalog))
	for _, item := range catalog {
		taskType := string(item.TaskType)
		name := item.Name
		desc := item.Description
		data = append(data, &models.TaskCatalogEntry{
			TaskType:        &taskType,
			Name:            &name,
			Description:     &desc,
			ParameterSchema: item.ParameterSchema,
		})
	}
	return &models.TaskCatalog{Data: data}
}

func handleScheduleError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrScheduleNotFound):
		respondError(w, http.StatusNotFound, "Schedule not found")
	case errors.Is(err, service.ErrScheduleTaskNotFound):
		respondError(w, http.StatusNotFound, "Schedule task not found")
	case errors.Is(err, service.ErrScheduleExecutionNotFound):
		respondError(w, http.StatusNotFound, "Execution not found")
	case errors.Is(err, service.ErrScheduleNameRequired):
		respondError(w, http.StatusBadRequest, "Schedule name is required")
	case errors.Is(err, service.ErrScheduleNameConflict):
		respondError(w, http.StatusConflict, "A schedule with this name already exists")
	case errors.Is(err, service.ErrScheduleTimingRequired):
		respondError(w, http.StatusBadRequest, "Timing type is required")
	case errors.Is(err, service.ErrScheduleInvalidTiming):
		respondError(w, http.StatusBadRequest, "Invalid timing type")
	case errors.Is(err, service.ErrScheduleInvalidTaskType):
		respondError(w, http.StatusBadRequest, "Invalid task type")
	case errors.Is(err, service.ErrScheduleDisabled):
		respondError(w, http.StatusBadRequest, "Schedule is disabled")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
