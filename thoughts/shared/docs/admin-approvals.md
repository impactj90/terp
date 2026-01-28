# Approvals (Admin) (/admin/approvals)

## Purpose
Provide a single queue for approving or rejecting timesheet calculations and absence requests.

## Audience
- Admins: Full access.
- Users: Not available; non-admins are redirected to the Dashboard.

## How to use (step-by-step)
1. Open Approvals from the Admin navigation.
2. Choose the Timesheets or Absences tab.
3. Use the Team, Date Range, and Status filters to narrow results.
4. Select items and approve in bulk, or approve/reject individual items.
5. For absences, enter a rejection reason in the dialog when rejecting.

## Data and fields
- Timesheets: daily values with status (pending/calculated/approved/error) and error flags.
- Absences: requests with status (pending/approved/rejected/cancelled) and employee info.
- Team filter: limits items to team members.

## Where changes take effect / integrations
- Approving daily values affects Monthly Evaluation, Year Overview, and Timesheet status.
- Approving/rejecting absences affects the employee's Absences view and Vacation balance.

## Troubleshooting
- Only calculated/pending daily values without errors can be approved.
- If the team filter is active but empty, the selected team has no members.
- If nothing appears, widen the date range or change the status filter.
