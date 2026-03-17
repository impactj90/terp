/**
 * Permission Catalog
 *
 * Static list of all available permissions with deterministic UUID generation
 * matching the Go backend (apps/api/internal/permissions/permissions.go).
 *
 * Permission IDs are generated using UUID v5 (SHA1) with a fixed namespace,
 * ensuring consistency between TypeScript and Go.
 */
import { v5 as uuidv5 } from "uuid"

const PERMISSION_NAMESPACE = "f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1"

export interface Permission {
  /** UUID string (deterministic, generated from key) */
  id: string
  /** Human-readable key, e.g. "employees.view" */
  key: string
  /** Resource name, e.g. "employees" */
  resource: string
  /** Action name, e.g. "view" */
  action: string
  /** Human-readable description */
  description: string
}

function permissionId(key: string): string {
  return uuidv5(key, PERMISSION_NAMESPACE)
}

function p(
  key: string,
  resource: string,
  action: string,
  description: string
): Permission {
  return { id: permissionId(key), key, resource, action, description }
}

/**
 * All 78 permissions, mirroring Go's allPermissions slice.
 * Order matches the Go source file for easy comparison.
 */
export const ALL_PERMISSIONS: Permission[] = [
  p("employees.view", "employees", "view", "View employee records"),
  p("employees.create", "employees", "create", "Create employee records"),
  p("employees.edit", "employees", "edit", "Edit employee records"),
  p("employees.delete", "employees", "delete", "Delete employee records"),
  p(
    "time_tracking.view_own",
    "time_tracking",
    "view_own",
    "View own time tracking data"
  ),
  p(
    "time_tracking.view_all",
    "time_tracking",
    "view_all",
    "View all time tracking data"
  ),
  p(
    "time_tracking.edit",
    "time_tracking",
    "edit",
    "Edit time tracking entries"
  ),
  p(
    "time_tracking.approve",
    "time_tracking",
    "approve",
    "Approve time tracking entries"
  ),
  p(
    "booking_overview.change_day_plan",
    "booking_overview",
    "change_day_plan",
    "Change day plan in booking overview"
  ),
  p(
    "booking_overview.calculate_day",
    "booking_overview",
    "calculate_day",
    "Calculate day in booking overview"
  ),
  p(
    "booking_overview.calculate_month",
    "booking_overview",
    "calculate_month",
    "Calculate month in booking overview"
  ),
  p(
    "booking_overview.delete_bookings",
    "booking_overview",
    "delete_bookings",
    "Delete bookings in booking overview"
  ),
  p("absences.request", "absences", "request", "Request absences"),
  p("absences.approve", "absences", "approve", "Approve absences"),
  p("absences.manage", "absences", "manage", "Manage absences"),
  p("day_plans.manage", "day_plans", "manage", "Manage day plans"),
  p("week_plans.manage", "week_plans", "manage", "Manage week plans"),
  p("tariffs.manage", "tariffs", "manage", "Manage tariffs"),
  p("departments.manage", "departments", "manage", "Manage departments"),
  p("teams.manage", "teams", "manage", "Manage teams"),
  p("booking_types.manage", "booking_types", "manage", "Manage booking types"),
  p(
    "absence_types.manage",
    "absence_types",
    "manage",
    "Manage absence types"
  ),
  p("holidays.manage", "holidays", "manage", "Manage holidays"),
  p("accounts.manage", "accounts", "manage", "Manage accounts"),
  p(
    "notifications.manage",
    "notifications",
    "manage",
    "Manage notifications"
  ),
  p(
    "groups.manage",
    "groups",
    "manage",
    "Manage employee, workflow, and activity groups"
  ),
  p("reports.view", "reports", "view", "View reports"),
  p("reports.manage", "reports", "manage", "Generate and manage reports"),
  p("users.manage", "users", "manage", "Manage users"),
  p("tenants.manage", "tenants", "manage", "Manage tenants"),
  p("settings.manage", "settings", "manage", "Manage settings"),
  p(
    "time_plans.manage",
    "time_plans",
    "manage",
    "Manage employee day plans and time plan assignments"
  ),
  p(
    "activities.manage",
    "activities",
    "manage",
    "Manage activities for orders"
  ),
  p("orders.manage", "orders", "manage", "Manage orders"),
  p(
    "order_assignments.manage",
    "order_assignments",
    "manage",
    "Manage order assignments"
  ),
  p(
    "order_bookings.manage",
    "order_bookings",
    "manage",
    "Manage order bookings"
  ),
  p("order_bookings.view", "order_bookings", "view", "View order bookings"),
  p(
    "payroll.manage",
    "payroll",
    "manage",
    "Manage payroll exports and interfaces"
  ),
  p("payroll.view", "payroll", "view", "View payroll exports"),
  p(
    "schedules.manage",
    "schedules",
    "manage",
    "Manage schedules and execute scheduled tasks"
  ),
  p(
    "contact_management.manage",
    "contact_management",
    "manage",
    "Manage contact types and contact kinds"
  ),
  p(
    "terminal_bookings.manage",
    "terminal_bookings",
    "manage",
    "Manage terminal bookings and import batches"
  ),
  p(
    "access_control.manage",
    "access_control",
    "manage",
    "Manage access zones, profiles, and employee assignments"
  ),
  p(
    "vehicle_data.manage",
    "vehicle_data",
    "manage",
    "Manage vehicles, routes, and trip records"
  ),
  p(
    "travel_allowance.manage",
    "travel_allowance",
    "manage",
    "Manage travel allowance rule sets, local and extended travel rules"
  ),
  p(
    "shift_planning.manage",
    "shift_planning",
    "manage",
    "Manage shift definitions and shift assignments for the planning board"
  ),
  p("macros.manage", "macros", "manage", "Manage macros and macro assignments"),
  p("locations.manage", "locations", "manage", "Manage work locations"),
  p("cost_centers.manage", "cost_centers", "manage", "Manage cost centers"),
  p("employment_types.manage", "employment_types", "manage", "Manage employment types"),
  p("corrections.manage", "corrections", "manage", "Manage corrections"),
  p(
    "monthly_evaluations.manage",
    "monthly_evaluations",
    "manage",
    "Manage monthly evaluation templates"
  ),
  p(
    "vacation_config.manage",
    "vacation_config",
    "manage",
    "Manage vacation configuration including special calculations, calculation groups, capping rules, and exceptions"
  ),

  // CRM Module
  p("crm_addresses.view", "crm_addresses", "view", "View CRM addresses"),
  p("crm_addresses.create", "crm_addresses", "create", "Create CRM addresses"),
  p("crm_addresses.edit", "crm_addresses", "edit", "Edit CRM addresses"),
  p("crm_addresses.delete", "crm_addresses", "delete", "Delete CRM addresses"),

  // CRM Correspondence
  p("crm_correspondence.view", "crm_correspondence", "view", "View CRM correspondence"),
  p("crm_correspondence.create", "crm_correspondence", "create", "Create CRM correspondence"),
  p("crm_correspondence.edit", "crm_correspondence", "edit", "Edit CRM correspondence"),
  p("crm_correspondence.delete", "crm_correspondence", "delete", "Delete CRM correspondence"),

  // CRM Inquiries
  p("crm_inquiries.view", "crm_inquiries", "view", "View CRM inquiries"),
  p("crm_inquiries.create", "crm_inquiries", "create", "Create CRM inquiries"),
  p("crm_inquiries.edit", "crm_inquiries", "edit", "Edit CRM inquiries"),
  p("crm_inquiries.delete", "crm_inquiries", "delete", "Delete CRM inquiries"),

  // CRM Tasks
  p("crm_tasks.view", "crm_tasks", "view", "View CRM tasks and messages"),
  p("crm_tasks.create", "crm_tasks", "create", "Create CRM tasks and messages"),
  p("crm_tasks.edit", "crm_tasks", "edit", "Edit CRM tasks and messages"),
  p("crm_tasks.delete", "crm_tasks", "delete", "Delete CRM tasks and messages"),

  // Billing Documents
  p("billing_documents.view", "billing_documents", "view", "View billing documents"),
  p("billing_documents.create", "billing_documents", "create", "Create billing documents"),
  p("billing_documents.edit", "billing_documents", "edit", "Edit billing documents"),
  p("billing_documents.delete", "billing_documents", "delete", "Delete billing documents"),
  p("billing_documents.finalize", "billing_documents", "finalize", "Finalize billing documents"),

  // Billing Service Cases
  p("billing_service_cases.view", "billing_service_cases", "view", "View service cases"),
  p("billing_service_cases.create", "billing_service_cases", "create", "Create service cases"),
  p("billing_service_cases.edit", "billing_service_cases", "edit", "Edit service cases"),
  p("billing_service_cases.delete", "billing_service_cases", "delete", "Delete service cases"),
]

// Lookup maps
const byId = new Map<string, Permission>()
const byKey = new Map<string, Permission>()
for (const perm of ALL_PERMISSIONS) {
  byId.set(perm.id, perm)
  byKey.set(perm.key, perm)
}

/** Get permission by its UUID string */
export function lookupPermission(id: string): Permission | undefined {
  return byId.get(id)
}

/** Get permission UUID by human-readable key (e.g. "employees.view") */
export function permissionIdByKey(key: string): string | undefined {
  return byKey.get(key)?.id
}

/** Get all permissions as a list (returns a copy) */
export function listPermissions(): Permission[] {
  return [...ALL_PERMISSIONS]
}
