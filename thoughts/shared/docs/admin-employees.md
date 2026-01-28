# Employees (Admin) (/admin/employees)

## Purpose
Create, edit, and deactivate employee records used throughout the application.

## Audience
- Admins: Full access.
- Users: Not available; non-admins are redirected to the Dashboard.

## How to use (step-by-step)
1. Open Employees from the Admin navigation.
2. Search or filter by status to find employees.
3. Click New Employee to create a record.
4. Use View to open the detail sheet, Edit to update, or Deactivate to disable an employee.
5. Use View Timesheet to open the employee's Timesheet with a query parameter.

## Data and fields
- Personnel number and PIN (PIN is required on create and not shown after).
- First/last name, email, phone.
- Entry date (create-only) and exit date (edit).
- Department, cost center, employment type.
- Weekly hours and vacation days per year.

## Where changes take effect / integrations
- Employees power Timesheet, Time Clock, Absences, Team Overview, and Approvals.
- Department/team assignments are used across Admin > Teams and department reports.

## Troubleshooting
- Personnel number and entry date cannot be changed after creation.
- PIN is only entered on creation and is not shown after.
- Required fields must be filled before saving.
