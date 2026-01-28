# Timesheet (/timesheet)

## Purpose
View and manage time bookings and calculated values by day, week, or month. Supports booking edits and exports.

## Audience
- Users: View and edit their own time entries.
- Admins: Can select any employee to review or edit.

## How to use (step-by-step)
1. Open Timesheet from the main navigation.
2. (Admin only) Select an employee.
3. Choose Day, Week, or Month view.
4. Navigate dates using the arrows or Today button.
5. In Day view, add/edit/delete bookings; in Week/Month view, click a day to drill down.
6. Export Week/Month views as CSV or printable PDF.

## Data and fields
- Bookings: show original, edited, and calculated times; booking type; source; notes.
- Daily value: target, gross, break, net, and balance minutes; status; locked flag.
- Monthly value (Month view): totals and working/absence/holiday days.

## Where changes take effect / integrations
- Bookings are the source for daily calculations and approvals.
- Daily values flow into Monthly Evaluation and Year Overview.
- Admin approvals operate on daily values generated here.

## Troubleshooting
- If editing is disabled, the day is locked (`is_locked`) or the month is closed.
- Time inputs must be in HH:MM format.
- Admins must select an employee to see data.
