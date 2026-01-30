package permissions

import (
	"fmt"

	"github.com/google/uuid"
)

const permissionNamespace = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"

type Permission struct {
	ID          uuid.UUID
	Resource    string
	Action      string
	Description string
}

func permissionID(key string) uuid.UUID {
	ns := uuid.MustParse(permissionNamespace)
	return uuid.NewSHA1(ns, []byte(key))
}

// ID returns the deterministic UUID for a permission key.
func ID(key string) uuid.UUID {
	return permissionID(key)
}

// Key returns the canonical permission key for a resource/action pair.
func Key(resource, action string) string {
	return fmt.Sprintf("%s.%s", resource, action)
}

var allPermissions = []Permission{
	{ID: permissionID("employees.view"), Resource: "employees", Action: "read", Description: "View employee records"},
	{ID: permissionID("employees.create"), Resource: "employees", Action: "create", Description: "Create employee records"},
	{ID: permissionID("employees.edit"), Resource: "employees", Action: "update", Description: "Edit employee records"},
	{ID: permissionID("employees.delete"), Resource: "employees", Action: "delete", Description: "Delete employee records"},
	{ID: permissionID("time_tracking.view_own"), Resource: "time_tracking", Action: "view_own", Description: "View own time tracking data"},
	{ID: permissionID("time_tracking.view_all"), Resource: "time_tracking", Action: "view_all", Description: "View all time tracking data"},
	{ID: permissionID("time_tracking.edit"), Resource: "time_tracking", Action: "update", Description: "Edit time tracking entries"},
	{ID: permissionID("time_tracking.approve"), Resource: "time_tracking", Action: "approve", Description: "Approve time tracking entries"},
	{ID: permissionID("booking_overview.change_day_plan"), Resource: "booking_overview", Action: "change_day_plan", Description: "Change day plan in booking overview"},
	{ID: permissionID("booking_overview.calculate_day"), Resource: "booking_overview", Action: "calculate_day", Description: "Calculate day in booking overview"},
	{ID: permissionID("booking_overview.calculate_month"), Resource: "booking_overview", Action: "calculate_month", Description: "Calculate month in booking overview"},
	{ID: permissionID("booking_overview.delete_bookings"), Resource: "booking_overview", Action: "delete_bookings", Description: "Delete bookings in booking overview"},
	{ID: permissionID("absences.request"), Resource: "absences", Action: "request", Description: "Request absences"},
	{ID: permissionID("absences.approve"), Resource: "absences", Action: "approve", Description: "Approve absences"},
	{ID: permissionID("absences.manage"), Resource: "absences", Action: "manage", Description: "Manage absences"},
	{ID: permissionID("day_plans.manage"), Resource: "day_plans", Action: "manage", Description: "Manage day plans"},
	{ID: permissionID("week_plans.manage"), Resource: "week_plans", Action: "manage", Description: "Manage week plans"},
	{ID: permissionID("tariffs.manage"), Resource: "tariffs", Action: "manage", Description: "Manage tariffs"},
	{ID: permissionID("departments.manage"), Resource: "departments", Action: "manage", Description: "Manage departments"},
	{ID: permissionID("teams.manage"), Resource: "teams", Action: "manage", Description: "Manage teams"},
	{ID: permissionID("booking_types.manage"), Resource: "booking_types", Action: "manage", Description: "Manage booking types"},
	{ID: permissionID("absence_types.manage"), Resource: "absence_types", Action: "manage", Description: "Manage absence types"},
	{ID: permissionID("holidays.manage"), Resource: "holidays", Action: "manage", Description: "Manage holidays"},
	{ID: permissionID("accounts.manage"), Resource: "accounts", Action: "manage", Description: "Manage accounts"},
	{ID: permissionID("notifications.manage"), Resource: "notifications", Action: "manage", Description: "Manage notifications"},
	{ID: permissionID("groups.manage"), Resource: "groups", Action: "manage", Description: "Manage employee, workflow, and activity groups"},
	{ID: permissionID("reports.view"), Resource: "reports", Action: "read", Description: "View reports"},
	{ID: permissionID("reports.manage"), Resource: "reports", Action: "manage", Description: "Generate and manage reports"},
	{ID: permissionID("users.manage"), Resource: "users", Action: "manage", Description: "Manage users"},
	{ID: permissionID("tenants.manage"), Resource: "tenants", Action: "manage", Description: "Manage tenants"},
	{ID: permissionID("settings.manage"), Resource: "settings", Action: "manage", Description: "Manage settings"},
	{ID: permissionID("time_plans.manage"), Resource: "time_plans", Action: "manage", Description: "Manage employee day plans and time plan assignments"},
	{ID: permissionID("activities.manage"), Resource: "activities", Action: "manage", Description: "Manage activities for orders"},
	{ID: permissionID("orders.manage"), Resource: "orders", Action: "manage", Description: "Manage orders"},
	{ID: permissionID("order_assignments.manage"), Resource: "order_assignments", Action: "manage", Description: "Manage order assignments"},
	{ID: permissionID("order_bookings.manage"), Resource: "order_bookings", Action: "manage", Description: "Manage order bookings"},
	{ID: permissionID("order_bookings.view"), Resource: "order_bookings", Action: "read", Description: "View order bookings"},
	{ID: permissionID("payroll.manage"), Resource: "payroll", Action: "manage", Description: "Manage payroll exports and interfaces"},
	{ID: permissionID("payroll.view"), Resource: "payroll", Action: "read", Description: "View payroll exports"},
	{ID: permissionID("schedules.manage"), Resource: "schedules", Action: "manage", Description: "Manage schedules and execute scheduled tasks"},
	{ID: permissionID("contact_management.manage"), Resource: "contact_management", Action: "manage", Description: "Manage contact types and contact kinds"},
	{ID: permissionID("terminal_bookings.manage"), Resource: "terminal_bookings", Action: "manage", Description: "Manage terminal bookings and import batches"},
}

var permissionByID = func() map[string]Permission {
	m := make(map[string]Permission, len(allPermissions))
	for _, p := range allPermissions {
		m[p.ID.String()] = p
	}
	return m
}()

func List() []Permission {
	return append([]Permission(nil), allPermissions...)
}

func Lookup(id string) (Permission, bool) {
	p, ok := permissionByID[id]
	return p, ok
}
