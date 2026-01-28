# Day Plans (Admin) (/admin/day-plans)

## Purpose
Define daily work schedules and calculation rules (fixed or flextime).

## Audience
- Admins: Full access.
- Users: Not available; non-admins are redirected to the Dashboard.

## How to use (step-by-step)
1. Open Day Plans from the Admin navigation.
2. Click New Day Plan.
3. Fill Basic info (code, type, name, target hours).
4. Configure Time Windows and Core Time (for flextime).
5. Configure Tolerance and Rounding rules.
6. Configure Special settings (holiday credits, vacation deduction, no-booking behavior).
7. Save and use View to confirm details or Copy to clone an existing plan.

## Data and fields
- Code, name, description, active status.
- Plan type: fixed or flextime.
- Time windows: come/go from/to; core start/end for flextime.
- Target hours: regular_hours and optional regular_hours_2.
- Tolerance and variable work time settings.
- Rounding rules for arrival/departure and round-all-bookings.
- Min/max work time, holiday credits, vacation deduction.
- No-booking behavior and day-change behavior.
- Breaks and bonuses appear in the detail sheet if returned by the API.

## Where changes take effect / integrations
- Week Plans reference Day Plans for each weekday.
- Tariffs reference Day Plans for rolling/x-days rhythms.
- Daily calculation uses these fields for tolerance, rounding, breaks, and credits.

## Troubleshooting
- Codes U, K, and S are reserved and cannot be used.
- Rounding types that require intervals/values must have those fields filled.
- Flextime vs fixed settings change which time-window fields are relevant.
