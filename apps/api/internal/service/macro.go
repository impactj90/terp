package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"gorm.io/datatypes"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrMacroNotFound           = errors.New("macro not found")
	ErrMacroNameExists         = errors.New("macro name already exists")
	ErrMacroNameReq            = errors.New("macro name is required")
	ErrInvalidMacroType        = errors.New("invalid macro type (must be 'weekly' or 'monthly')")
	ErrInvalidActionType       = errors.New("invalid action type")
	ErrMacroAssignmentNotFound = errors.New("macro assignment not found")
	ErrAssignmentTargetReq     = errors.New("either tariff_id or employee_id is required")
	ErrAssignmentTargetBoth    = errors.New("only one of tariff_id or employee_id can be set")
	ErrInvalidExecutionDay     = errors.New("invalid execution day")
	ErrMacroExecutionNotFound  = errors.New("macro execution not found")
	ErrMacroInactive           = errors.New("macro is not active")
)

// macroRepository defines the interface for macro data access.
type macroRepository interface {
	Create(ctx context.Context, m *model.Macro) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.Macro, error)
	GetByTenantAndID(ctx context.Context, tenantID, id uuid.UUID) (*model.Macro, error)
	GetByName(ctx context.Context, tenantID uuid.UUID, name string) (*model.Macro, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error)
	ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error)
	ListActiveByType(ctx context.Context, tenantID uuid.UUID, macroType model.MacroType) ([]model.Macro, error)
	Update(ctx context.Context, m *model.Macro) error
	Delete(ctx context.Context, id uuid.UUID) error
	CreateAssignment(ctx context.Context, a *model.MacroAssignment) error
	GetAssignmentByID(ctx context.Context, id uuid.UUID) (*model.MacroAssignment, error)
	ListAssignmentsByMacro(ctx context.Context, macroID uuid.UUID) ([]model.MacroAssignment, error)
	ListAssignmentsByTariff(ctx context.Context, tariffID uuid.UUID) ([]model.MacroAssignment, error)
	ListAssignmentsByEmployee(ctx context.Context, employeeID uuid.UUID) ([]model.MacroAssignment, error)
	UpdateAssignment(ctx context.Context, a *model.MacroAssignment) error
	DeleteAssignment(ctx context.Context, id uuid.UUID) error
	CreateExecution(ctx context.Context, e *model.MacroExecution) error
	GetExecutionByID(ctx context.Context, id uuid.UUID) (*model.MacroExecution, error)
	ListExecutionsByMacro(ctx context.Context, macroID uuid.UUID, limit int) ([]model.MacroExecution, error)
	UpdateExecution(ctx context.Context, e *model.MacroExecution) error
}

// MacroService handles macro business logic.
type MacroService struct {
	repo macroRepository
}

// NewMacroService creates a new MacroService.
func NewMacroService(repo macroRepository) *MacroService {
	return &MacroService{repo: repo}
}

// --- Macro CRUD ---

// CreateMacroInput represents the input for creating a macro.
type CreateMacroInput struct {
	TenantID     uuid.UUID
	Name         string
	Description  *string
	MacroType    string
	ActionType   string
	ActionParams json.RawMessage
}

// Create creates a new macro with validation.
func (s *MacroService) Create(ctx context.Context, input CreateMacroInput) (*model.Macro, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrMacroNameReq
	}

	// Check name uniqueness
	existing, err := s.repo.GetByName(ctx, input.TenantID, name)
	if err == nil && existing != nil {
		return nil, ErrMacroNameExists
	}

	// Validate macro type
	macroType := model.MacroType(input.MacroType)
	if macroType != model.MacroTypeWeekly && macroType != model.MacroTypeMonthly {
		return nil, ErrInvalidMacroType
	}

	// Validate action type
	actionType := model.MacroActionType(input.ActionType)
	if !isValidActionType(actionType) {
		return nil, ErrInvalidActionType
	}

	actionParams := datatypes.JSON("{}")
	if len(input.ActionParams) > 0 {
		actionParams = datatypes.JSON(input.ActionParams)
	}

	macro := &model.Macro{
		TenantID:     input.TenantID,
		Name:         name,
		Description:  input.Description,
		MacroType:    macroType,
		ActionType:   actionType,
		ActionParams: actionParams,
		IsActive:     true,
	}

	if err := s.repo.Create(ctx, macro); err != nil {
		return nil, err
	}

	return s.repo.GetByID(ctx, macro.ID)
}

// GetByID retrieves a macro by ID.
func (s *MacroService) GetByID(ctx context.Context, tenantID, id uuid.UUID) (*model.Macro, error) {
	macro, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		return nil, ErrMacroNotFound
	}
	return macro, nil
}

// List retrieves all macros for a tenant.
func (s *MacroService) List(ctx context.Context, tenantID uuid.UUID) ([]model.Macro, error) {
	return s.repo.List(ctx, tenantID)
}

// UpdateMacroInput represents the input for updating a macro.
type UpdateMacroInput struct {
	Name         *string
	Description  *string
	MacroType    *string
	ActionType   *string
	ActionParams json.RawMessage
	IsActive     *bool
}

// Update updates a macro.
func (s *MacroService) Update(ctx context.Context, tenantID, id uuid.UUID, input UpdateMacroInput) (*model.Macro, error) {
	macro, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		return nil, ErrMacroNotFound
	}

	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrMacroNameReq
		}
		// Check uniqueness if name changed
		if name != macro.Name {
			existing, err := s.repo.GetByName(ctx, tenantID, name)
			if err == nil && existing != nil {
				return nil, ErrMacroNameExists
			}
		}
		macro.Name = name
	}

	if input.Description != nil {
		macro.Description = input.Description
	}

	if input.MacroType != nil {
		macroType := model.MacroType(*input.MacroType)
		if macroType != model.MacroTypeWeekly && macroType != model.MacroTypeMonthly {
			return nil, ErrInvalidMacroType
		}
		macro.MacroType = macroType
	}

	if input.ActionType != nil {
		actionType := model.MacroActionType(*input.ActionType)
		if !isValidActionType(actionType) {
			return nil, ErrInvalidActionType
		}
		macro.ActionType = actionType
	}

	if len(input.ActionParams) > 0 {
		macro.ActionParams = datatypes.JSON(input.ActionParams)
	}

	if input.IsActive != nil {
		macro.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, macro); err != nil {
		return nil, err
	}

	return s.repo.GetByTenantAndID(ctx, tenantID, id)
}

// Delete deletes a macro.
func (s *MacroService) Delete(ctx context.Context, tenantID, id uuid.UUID) error {
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, id)
	if err != nil {
		return ErrMacroNotFound
	}
	return s.repo.Delete(ctx, id)
}

// --- Assignment management ---

// CreateAssignmentInput represents the input for creating a macro assignment.
type CreateAssignmentInput struct {
	TenantID     uuid.UUID
	MacroID      uuid.UUID
	TariffID     *uuid.UUID
	EmployeeID   *uuid.UUID
	ExecutionDay int
}

// CreateAssignment creates a new macro assignment.
func (s *MacroService) CreateAssignment(ctx context.Context, input CreateAssignmentInput) (*model.MacroAssignment, error) {
	// Validate macro exists
	macro, err := s.repo.GetByTenantAndID(ctx, input.TenantID, input.MacroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}

	// Validate exactly one target
	if input.TariffID == nil && input.EmployeeID == nil {
		return nil, ErrAssignmentTargetReq
	}
	if input.TariffID != nil && input.EmployeeID != nil {
		return nil, ErrAssignmentTargetBoth
	}

	// Validate execution day based on macro type
	if err := validateExecutionDay(macro.MacroType, input.ExecutionDay); err != nil {
		return nil, err
	}

	assignment := &model.MacroAssignment{
		TenantID:     input.TenantID,
		MacroID:      input.MacroID,
		TariffID:     input.TariffID,
		EmployeeID:   input.EmployeeID,
		ExecutionDay: input.ExecutionDay,
		IsActive:     true,
	}

	if err := s.repo.CreateAssignment(ctx, assignment); err != nil {
		return nil, err
	}

	return s.repo.GetAssignmentByID(ctx, assignment.ID)
}

// ListAssignments retrieves all assignments for a macro.
func (s *MacroService) ListAssignments(ctx context.Context, tenantID, macroID uuid.UUID) ([]model.MacroAssignment, error) {
	// Verify macro exists and belongs to tenant
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}
	return s.repo.ListAssignmentsByMacro(ctx, macroID)
}

// UpdateAssignmentInput represents the input for updating an assignment.
type UpdateAssignmentInput struct {
	ExecutionDay *int
	IsActive     *bool
}

// UpdateAssignment updates a macro assignment.
func (s *MacroService) UpdateAssignment(ctx context.Context, tenantID, macroID, assignmentID uuid.UUID, input UpdateAssignmentInput) (*model.MacroAssignment, error) {
	macro, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}

	assignment, err := s.repo.GetAssignmentByID(ctx, assignmentID)
	if err != nil {
		return nil, ErrMacroAssignmentNotFound
	}

	if assignment.MacroID != macroID {
		return nil, ErrMacroAssignmentNotFound
	}

	if input.ExecutionDay != nil {
		if err := validateExecutionDay(macro.MacroType, *input.ExecutionDay); err != nil {
			return nil, err
		}
		assignment.ExecutionDay = *input.ExecutionDay
	}

	if input.IsActive != nil {
		assignment.IsActive = *input.IsActive
	}

	if err := s.repo.UpdateAssignment(ctx, assignment); err != nil {
		return nil, err
	}

	return s.repo.GetAssignmentByID(ctx, assignmentID)
}

// DeleteAssignment deletes a macro assignment.
func (s *MacroService) DeleteAssignment(ctx context.Context, tenantID, macroID, assignmentID uuid.UUID) error {
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return ErrMacroNotFound
	}

	assignment, err := s.repo.GetAssignmentByID(ctx, assignmentID)
	if err != nil {
		return ErrMacroAssignmentNotFound
	}

	if assignment.MacroID != macroID {
		return ErrMacroAssignmentNotFound
	}

	return s.repo.DeleteAssignment(ctx, assignmentID)
}

// --- Execution ---

// TriggerExecution manually triggers execution of a macro.
func (s *MacroService) TriggerExecution(ctx context.Context, tenantID, macroID uuid.UUID, triggeredBy *uuid.UUID) (*model.MacroExecution, error) {
	macro, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}

	if !macro.IsActive {
		return nil, ErrMacroInactive
	}

	return s.executeMacro(ctx, macro, model.MacroTriggerTypeManual, triggeredBy, nil)
}

// ListExecutions retrieves execution history for a macro.
func (s *MacroService) ListExecutions(ctx context.Context, tenantID, macroID uuid.UUID, limit int) ([]model.MacroExecution, error) {
	_, err := s.repo.GetByTenantAndID(ctx, tenantID, macroID)
	if err != nil {
		return nil, ErrMacroNotFound
	}
	return s.repo.ListExecutionsByMacro(ctx, macroID, limit)
}

// GetExecution retrieves a single execution by ID.
func (s *MacroService) GetExecution(ctx context.Context, id uuid.UUID) (*model.MacroExecution, error) {
	exec, err := s.repo.GetExecutionByID(ctx, id)
	if err != nil {
		return nil, ErrMacroExecutionNotFound
	}
	return exec, nil
}

// ExecuteDueMacros finds and executes all macros due for the given date.
// Called by the scheduler task handler after daily calculation.
func (s *MacroService) ExecuteDueMacros(ctx context.Context, tenantID uuid.UUID, date time.Time) (int, int, error) {
	weekday := int(date.Weekday()) // 0=Sunday..6=Saturday
	dayOfMonth := date.Day()
	lastDayOfMonth := lastDay(date.Year(), date.Month())

	var executed, failed int

	// Execute weekly macros
	weeklyMacros, err := s.repo.ListActiveByType(ctx, tenantID, model.MacroTypeWeekly)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to list weekly macros: %w", err)
	}

	for _, macro := range weeklyMacros {
		for _, assignment := range macro.Assignments {
			if !assignment.IsActive {
				continue
			}
			if assignment.ExecutionDay == weekday {
				_, execErr := s.executeMacro(ctx, &macro, model.MacroTriggerTypeScheduled, nil, &assignment.ID)
				if execErr != nil {
					failed++
					log.Error().Err(execErr).
						Str("macro_id", macro.ID.String()).
						Str("assignment_id", assignment.ID.String()).
						Msg("weekly macro execution failed")
				} else {
					executed++
				}
			}
		}
	}

	// Execute monthly macros
	monthlyMacros, err := s.repo.ListActiveByType(ctx, tenantID, model.MacroTypeMonthly)
	if err != nil {
		return executed, failed, fmt.Errorf("failed to list monthly macros: %w", err)
	}

	for _, macro := range monthlyMacros {
		for _, assignment := range macro.Assignments {
			if !assignment.IsActive {
				continue
			}
			// Monthly day fallback: if configured day exceeds month length, use last day
			effectiveDay := assignment.ExecutionDay
			if effectiveDay > lastDayOfMonth {
				effectiveDay = lastDayOfMonth
			}
			if effectiveDay == dayOfMonth {
				_, execErr := s.executeMacro(ctx, &macro, model.MacroTriggerTypeScheduled, nil, &assignment.ID)
				if execErr != nil {
					failed++
					log.Error().Err(execErr).
						Str("macro_id", macro.ID.String()).
						Str("assignment_id", assignment.ID.String()).
						Msg("monthly macro execution failed")
				} else {
					executed++
				}
			}
		}
	}

	return executed, failed, nil
}

// executeMacro runs a single macro and records the execution.
func (s *MacroService) executeMacro(ctx context.Context, macro *model.Macro, triggerType model.MacroTriggerType, triggeredBy *uuid.UUID, assignmentID *uuid.UUID) (*model.MacroExecution, error) {
	now := time.Now()

	exec := &model.MacroExecution{
		TenantID:     macro.TenantID,
		MacroID:      macro.ID,
		AssignmentID: assignmentID,
		Status:       model.MacroExecutionStatusRunning,
		TriggerType:  triggerType,
		TriggeredBy:  triggeredBy,
		StartedAt:    &now,
	}

	if err := s.repo.CreateExecution(ctx, exec); err != nil {
		return nil, fmt.Errorf("failed to create execution record: %w", err)
	}

	// Execute the action
	result, execErr := executeAction(ctx, macro)

	completedAt := time.Now()
	exec.CompletedAt = &completedAt

	if execErr != nil {
		exec.Status = model.MacroExecutionStatusFailed
		errMsg := execErr.Error()
		exec.ErrorMessage = &errMsg
	} else {
		exec.Status = model.MacroExecutionStatusCompleted
	}

	if result != nil {
		exec.Result = datatypes.JSON(result)
	}

	if updateErr := s.repo.UpdateExecution(ctx, exec); updateErr != nil {
		log.Error().Err(updateErr).Str("execution_id", exec.ID.String()).Msg("failed to update macro execution status")
	}

	return exec, execErr
}

// executeAction runs the predefined action for a macro.
func executeAction(_ context.Context, macro *model.Macro) (json.RawMessage, error) {
	switch macro.ActionType {
	case model.MacroActionLogMessage:
		result := map[string]interface{}{
			"action":      "log_message",
			"macro_name":  macro.Name,
			"macro_type":  string(macro.MacroType),
			"executed_at": time.Now().UTC().Format(time.RFC3339),
		}
		data, _ := json.Marshal(result)
		log.Info().
			Str("macro_id", macro.ID.String()).
			Str("macro_name", macro.Name).
			Msg("macro log_message executed")
		return data, nil

	case model.MacroActionRecalculateTargetHours:
		// Placeholder: actual implementation would recalculate target hours
		result := map[string]interface{}{
			"action":      "recalculate_target_hours",
			"status":      "placeholder",
			"executed_at": time.Now().UTC().Format(time.RFC3339),
		}
		data, _ := json.Marshal(result)
		return data, nil

	case model.MacroActionResetFlextime:
		// Placeholder: actual implementation would reset flextime counters
		result := map[string]interface{}{
			"action":      "reset_flextime",
			"status":      "placeholder",
			"executed_at": time.Now().UTC().Format(time.RFC3339),
		}
		data, _ := json.Marshal(result)
		return data, nil

	case model.MacroActionCarryForwardBalance:
		// Placeholder: actual implementation would carry forward balances
		result := map[string]interface{}{
			"action":      "carry_forward_balance",
			"status":      "placeholder",
			"executed_at": time.Now().UTC().Format(time.RFC3339),
		}
		data, _ := json.Marshal(result)
		return data, nil

	default:
		return nil, fmt.Errorf("unknown action type: %s", macro.ActionType)
	}
}

// --- Helpers ---

func isValidActionType(at model.MacroActionType) bool {
	switch at {
	case model.MacroActionLogMessage,
		model.MacroActionRecalculateTargetHours,
		model.MacroActionResetFlextime,
		model.MacroActionCarryForwardBalance:
		return true
	default:
		return false
	}
}

func validateExecutionDay(macroType model.MacroType, day int) error {
	switch macroType {
	case model.MacroTypeWeekly:
		if day < 0 || day > 6 {
			return ErrInvalidExecutionDay
		}
	case model.MacroTypeMonthly:
		if day < 1 || day > 31 {
			return ErrInvalidExecutionDay
		}
	}
	return nil
}

// lastDay returns the last day of the given month.
func lastDay(year int, month time.Month) int {
	// Go to the first of the next month, then subtract one day
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}
