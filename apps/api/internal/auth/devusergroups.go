package auth

import (
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/permissions"
)

// DevUserGroup represents a predefined development user group.
type DevUserGroup struct {
	ID          uuid.UUID
	Code        string
	Name        string
	Description string
	IsAdmin     bool
	Permissions []string // permission UUIDs
}

// allPermissionIDs returns all registered permission UUIDs as strings.
func allPermissionIDs() []string {
	all := permissions.List()
	ids := make([]string, len(all))
	for i, p := range all {
		ids[i] = p.ID.String()
	}
	return ids
}

// DevUserGroups contains predefined user groups for development mode.
// Using deterministic UUIDs (range 19xxx) for consistency across restarts.
var DevUserGroups = []DevUserGroup{
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000019001"),
		Code:        "ADMIN",
		Name:        "Administratoren",
		Description: "Vollzugriff auf alle Funktionen",
		IsAdmin:     true,
		Permissions: nil, // is_admin=true grants all permissions
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000019002"),
		Code:        "HR",
		Name:        "Personalverwaltung",
		Description: "Personalwesen und Mitarbeiterverwaltung",
		IsAdmin:     false,
		Permissions: []string{
			permissions.ID("employees.view").String(),
			permissions.ID("employees.create").String(),
			permissions.ID("employees.edit").String(),
			permissions.ID("employees.delete").String(),
			permissions.ID("time_tracking.view_all").String(),
			permissions.ID("time_tracking.edit").String(),
			permissions.ID("time_tracking.approve").String(),
			permissions.ID("booking_overview.change_day_plan").String(),
			permissions.ID("booking_overview.calculate_day").String(),
			permissions.ID("booking_overview.calculate_month").String(),
			permissions.ID("booking_overview.delete_bookings").String(),
			permissions.ID("absences.manage").String(),
			permissions.ID("absences.approve").String(),
			permissions.ID("day_plans.manage").String(),
			permissions.ID("week_plans.manage").String(),
			permissions.ID("tariffs.manage").String(),
			permissions.ID("departments.manage").String(),
			permissions.ID("teams.manage").String(),
			permissions.ID("reports.view").String(),
			permissions.ID("reports.manage").String(),
			permissions.ID("time_plans.manage").String(),
			permissions.ID("payroll.view").String(),
			permissions.ID("payroll.manage").String(),
			permissions.ID("corrections.manage").String(),
			permissions.ID("monthly_evaluations.manage").String(),
		},
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000019003"),
		Code:        "TEAMLEAD",
		Name:        "Teamleitung",
		Description: "Teamverwaltung und Genehmigungen",
		IsAdmin:     false,
		Permissions: []string{
			permissions.ID("employees.view").String(),
			permissions.ID("time_tracking.view_all").String(),
			permissions.ID("time_tracking.edit").String(),
			permissions.ID("time_tracking.approve").String(),
			permissions.ID("booking_overview.change_day_plan").String(),
			permissions.ID("booking_overview.calculate_day").String(),
			permissions.ID("absences.approve").String(),
			permissions.ID("absences.manage").String(),
			permissions.ID("reports.view").String(),
			permissions.ID("shift_planning.manage").String(),
		},
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000019004"),
		Code:        "EMPLOYEE",
		Name:        "Mitarbeiter",
		Description: "Standard-Mitarbeitergruppe mit Grundrechten",
		IsAdmin:     false,
		Permissions: []string{
			permissions.ID("time_tracking.view_own").String(),
			permissions.ID("absences.request").String(),
		},
	},
}

// GetDevUserGroups returns all dev user groups.
func GetDevUserGroups() []DevUserGroup {
	return DevUserGroups
}
