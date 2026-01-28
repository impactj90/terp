# Time Clock (/time-clock)

## Purpose
Provide a simple clock-in/clock-out interface, including break and errand actions, with real-time status and daily stats.

## Audience
- Users: Primary clocking interface.
- Admins: Same view; currently the page can show an employee selector if multiple employees are returned.

## How to use (step-by-step)
1. Open Time Clock from the main navigation.
2. (If shown) Select an employee from the dropdown.
3. Use the main button to Clock In or Clock Out.
4. Use Secondary Actions to start/end Break or Errand.
5. Review Today Stats and Booking History for the day.

## Data and fields
- Booking types: uses booking codes A1 (clock in), A2 (clock out), P1/P2 (break start/end), D1/D2 (errand start/end).
- Bookings: created with the current time and selected employee.
- Daily value: shows gross, break, net, target, overtime, undertime minutes.

## Where changes take effect / integrations
- Bookings appear immediately in Timesheet and Recent Activity.
- Daily value updates feed Monthly Evaluation and Year Overview.

## Troubleshooting
- If actions fail, check that booking types A1/A2/P1/P2/D1/D2 are configured and active in the backend.
- If the employee selector is empty, there are no active employees returned by the API.
- A "Notification stream unavailable" or load error typically indicates an API connectivity issue; use Retry.
