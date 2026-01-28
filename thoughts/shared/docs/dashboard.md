# Dashboard (/dashboard)

## Purpose
Provide a personal, at-a-glance overview of today's schedule, balances, and recent activity, with quick actions to jump into common tasks.

## Audience
- Users: Full access when the user is linked to an employee record.
- Admins: Same view for their own employee profile.

## How to use (step-by-step)
1. Open Dashboard from the main navigation.
2. Use Quick Actions to clock in/out, request time off, or open the Timesheet.
3. Review Today's Schedule for clock status, first in/last out, and target hours.
4. Review Hours This Week, Vacation Balance, and Flextime Balance cards.
5. Check Pending Actions for errors or pending days; click an item to open the Timesheet for that date.
6. Review Recent Activity to see the latest bookings; use "View all activity" to open the Timesheet.

## Data and fields
- Employee linkage: uses the authenticated user's `employee_id`. If missing, the page shows a "no employee profile" message.
- Today's Schedule: derived from the day view (bookings + daily value), including holiday/absence flags.
- Hours This Week: aggregates daily values for the current week.
- Vacation Balance: uses the vacation balance for the current year.
- Flextime Balance: uses the current month's monthly value (`balance_minutes`).
- Pending Actions: uses daily values with `has_errors` or `status` flags.
- Recent Activity: uses recent bookings (booking type, time, edited status).

## Where changes take effect / integrations
- Quick Actions create bookings that appear immediately in Timesheet and Time Clock.
- Pending Actions and Recent Activity link into Timesheet for deeper review.
- Vacation Balance and Flextime Balance match the values shown in Vacation and Monthly/Year Overview.

## Troubleshooting
- "No employee profile" means the user is not linked to an employee; an admin must link the user.
- Empty cards usually indicate no bookings or no calculated values yet.
- If a card shows a loading error, use its Retry link; the data comes from the same APIs used by Timesheet/Vacation.
- The Dashboard "Request Time Off" quick action links to `/absences/new`, which is not implemented; the request form is available on `/absences`.
- The "View all corrections" link in Pending Actions points to `/corrections`, which is not implemented in the current routes.