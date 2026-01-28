# Team Overview (/team-overview)

## Purpose
Give managers a single place to monitor team attendance, time metrics, and upcoming absences over a selected date range.

## Audience
- Users: Available to any user who belongs to at least one team; content is based on team membership.
- Admins: Same view; can manage teams in Admin > Teams.

## How to use (step-by-step)
1. Open Team Overview from the main navigation.
2. Choose a date range in the picker (default is the current week).
3. Select a team from the Team selector.
4. Use Refresh to reload live status, or Export to download the current range.
5. Review the stats cards (present today, hours in range, absences, issues).
6. Review the Attendance list, Attendance pattern, and Upcoming absences panels.
7. Use Quick Actions to jump to team management or relevant pages.

## Data and fields
- Teams: pulled from active teams.
- Team members: employees assigned to the selected team.
- Day views: per-employee day view for attendance status and issues.
- Daily values (range): per-employee daily values for range totals (net, target, overtime, undertime, absences).
- Absences: per-employee absences within the selected range.

## Where changes take effect / integrations
- Team membership is managed in Admin > Teams and affects who appears here.
- Attendance status uses the same bookings and daily values shown in Timesheet/Time Clock.
- Upcoming absences match Absences and Admin > Approvals.

## Troubleshooting
- If no teams appear, the user is not assigned to any team; an admin must add them in Admin > Teams.
- If a team shows no members, add members in Admin > Teams.
- If cards show '-' or empty states, daily values or day views are missing or not yet calculated.
