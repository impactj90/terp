# Booking Types (Admin) (/admin/booking-types)

## Purpose
Manage the booking types used for clock-ins, clock-outs, breaks, and other time events.

## Audience
- Admins: Full access.
- Users: Not available; non-admins are redirected to the Dashboard.

## How to use (step-by-step)
1. Open Booking Types from the Admin navigation.
2. Use search and direction filters (In/Out) to find a type.
3. Click New Booking Type to create a new code.
4. Edit an existing type to update name/description or toggle active status.
5. Delete unused booking types when needed.

## Data and fields
- Code (unique identifier, max 20 chars).
- Direction (in/out).
- Name and description.
- Active status (edit only).
- System booking types show a warning and restrict code/direction changes.

## Where changes take effect / integrations
- Time Clock uses booking types to create A1/A2/P1/P2/D1/D2 style bookings.
- Timesheet and Recent Activity display booking type names and directions.

## Troubleshooting
- Code, name, and direction are required for creation.
- System booking types may be locked for editing code/direction.
- Inactive types will not appear in booking type selectors.
