package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// macroServiceForScheduler defines the interface for macro execution from the scheduler.
type macroServiceForScheduler interface {
	ExecuteDueMacros(ctx context.Context, tenantID uuid.UUID, date time.Time) (int, int, error)
}

// ExecuteMacrosTaskHandler handles the execute_macros task type for the scheduler.
type ExecuteMacrosTaskHandler struct {
	macroService macroServiceForScheduler
}

// NewExecuteMacrosTaskHandler creates a new ExecuteMacrosTaskHandler.
func NewExecuteMacrosTaskHandler(macroService macroServiceForScheduler) *ExecuteMacrosTaskHandler {
	return &ExecuteMacrosTaskHandler{macroService: macroService}
}

// Execute runs the macro execution task.
func (h *ExecuteMacrosTaskHandler) Execute(ctx context.Context, tenantID uuid.UUID, params json.RawMessage) (json.RawMessage, error) {
	// Parse optional date parameter (default: today)
	var config struct {
		Date string `json:"date"` // YYYY-MM-DD format, default today
	}
	if len(params) > 0 {
		_ = json.Unmarshal(params, &config)
	}

	date := time.Now()
	if config.Date != "" {
		parsed, err := time.Parse("2006-01-02", config.Date)
		if err != nil {
			return nil, fmt.Errorf("invalid date format: %w", err)
		}
		date = parsed
	}

	log.Info().
		Str("tenant_id", tenantID.String()).
		Str("date", date.Format("2006-01-02")).
		Msg("executing due macros")

	executed, failed, err := h.macroService.ExecuteDueMacros(ctx, tenantID, date)
	if err != nil {
		return nil, fmt.Errorf("macro execution failed: %w", err)
	}

	result := map[string]interface{}{
		"date":     date.Format("2006-01-02"),
		"executed": executed,
		"failed":   failed,
	}
	data, _ := json.Marshal(result)
	return data, nil
}
