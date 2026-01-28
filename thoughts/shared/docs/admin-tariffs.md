# Tariffs (Admin) (/admin/tariffs)

## Purpose
Define employment contract settings: scheduling rhythm, vacation rules, target hours, and flextime limits.

## Audience
- Admins: Full access.
- Users: Not available; non-admins are redirected to the Dashboard.

## How to use (step-by-step)
1. Open Tariffs from the Admin navigation.
2. Click New Tariff and enter basic info.
3. Configure the schedule rhythm:
   - Weekly: choose one Week Plan.
   - Rolling weekly: choose multiple Week Plans.
   - X-days: set cycle length and assign a Day Plan to each day.
4. Set rhythm start date and validity period if applicable.
5. Configure vacation entitlement and basis.
6. Set target hours (daily/weekly/monthly/annual).
7. Configure flextime credit type and limits.
8. Save and use View/Edit/Copy as needed.

## Data and fields
- Rhythm: type, cycle days, start date, week plan(s), day plan assignments.
- Validity period: valid_from/valid_to.
- Vacation: annual days, work days per week, basis.
- Target hours: daily/weekly/monthly/annual.
- Flextime: credit type, thresholds, annual limits.

## Where changes take effect / integrations
- Employees can be linked to tariffs (tariff_id in the employee schema).
- Daily/monthly calculations use tariff targets and flextime settings.
- Week Plans and Day Plans used here drive employee schedules.

## Troubleshooting
- Weekly rhythm requires a Week Plan; rolling weekly requires at least one Week Plan.
- X-days rhythm requires a cycle length and a Day Plan for every day in the cycle.
- Valid To must be after Valid From.
