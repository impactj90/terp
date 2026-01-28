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
	{ID: permissionID("absences.request"), Resource: "absences", Action: "request", Description: "Request absences"},
	{ID: permissionID("absences.approve"), Resource: "absences", Action: "approve", Description: "Approve absences"},
	{ID: permissionID("absences.manage"), Resource: "absences", Action: "manage", Description: "Manage absences"},
	{ID: permissionID("day_plans.manage"), Resource: "day_plans", Action: "manage", Description: "Manage day plans"},
	{ID: permissionID("week_plans.manage"), Resource: "week_plans", Action: "manage", Description: "Manage week plans"},
	{ID: permissionID("tariffs.manage"), Resource: "tariffs", Action: "manage", Description: "Manage tariffs"},
	{ID: permissionID("users.manage"), Resource: "users", Action: "manage", Description: "Manage users"},
	{ID: permissionID("tenants.manage"), Resource: "tenants", Action: "manage", Description: "Manage tenants"},
	{ID: permissionID("settings.manage"), Resource: "settings", Action: "manage", Description: "Manage settings"},
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
