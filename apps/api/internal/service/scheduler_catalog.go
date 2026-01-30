package service

import "github.com/tolga/terp/internal/model"

// TaskCatalogItem describes a single task type available in the scheduler.
type TaskCatalogItem struct {
	TaskType        model.TaskType         `json:"task_type"`
	Name            string                 `json:"name"`
	Description     string                 `json:"description"`
	ParameterSchema map[string]interface{} `json:"parameter_schema"`
}

// GetTaskCatalog returns the list of available task types.
func GetTaskCatalog() []TaskCatalogItem {
	return []TaskCatalogItem{
		{
			TaskType:    model.TaskTypeCalculateDays,
			Name:        "Calculate Days",
			Description: "Recalculates daily values for all employees for a given date range. Default: yesterday.",
			ParameterSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"date_range": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"yesterday", "today", "last_7_days", "current_month"},
						"description": "Which date range to recalculate",
						"default":     "yesterday",
					},
				},
			},
		},
		{
			TaskType:    model.TaskTypeCalculateMonths,
			Name:        "Calculate Months",
			Description: "Recalculates monthly aggregations for a specific year/month. Default: previous month.",
			ParameterSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"year": map[string]interface{}{
						"type":        "integer",
						"description": "Target year (default: current year)",
					},
					"month": map[string]interface{}{
						"type":        "integer",
						"description": "Target month 1-12 (default: previous month)",
						"minimum":     1,
						"maximum":     12,
					},
				},
			},
		},
		{
			TaskType:    model.TaskTypeBackupDatabase,
			Name:        "Backup Database",
			Description: "Triggers a database backup (placeholder - logs execution only).",
			ParameterSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			TaskType:    model.TaskTypeSendNotifications,
			Name:        "Send Notifications",
			Description: "Processes all pending employee message recipients and delivers notifications.",
			ParameterSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			TaskType:    model.TaskTypeExportData,
			Name:        "Export Data",
			Description: "Exports data via configured export interfaces (placeholder - logs execution only).",
			ParameterSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"export_interface_id": map[string]interface{}{
						"type":        "string",
						"format":      "uuid",
						"description": "Export interface to use",
					},
				},
			},
		},
		{
			TaskType:    model.TaskTypeAliveCheck,
			Name:        "Alive Check",
			Description: "Simple heartbeat task that confirms the scheduler is running.",
			ParameterSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			TaskType:    model.TaskTypeTerminalSync,
			Name:        "Terminal Sync",
			Description: "Placeholder for syncing data from physical terminals (not yet implemented).",
			ParameterSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			TaskType:    model.TaskTypeTerminalImport,
			Name:        "Terminal Import",
			Description: "Processes pending raw terminal bookings and creates booking records.",
			ParameterSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
	}
}
