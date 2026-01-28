# Departments (Admin) (/admin/departments)

## Purpose
Create and maintain the department hierarchy used to organize employees and teams.

## Audience
- Admins: Full access.
- Users: Not available; non-admins are redirected to the Dashboard.

## How to use (step-by-step)
1. Open Departments from the Admin navigation.
2. Click New Department.
3. Enter name, code, description, and optionally select a parent department.
4. Save, then use Edit to update or deactivate as needed.

## Data and fields
- Name and code (code is uppercased).
- Description.
- Parent department (optional hierarchy).
- Active status (edit only).

## Where changes take effect / integrations
- Departments are referenced by Employees and Teams.
- Holidays can be scoped to departments.

## Troubleshooting
- Codes are required and limited in length.
- Parent selection excludes the current department to prevent obvious cycles.
