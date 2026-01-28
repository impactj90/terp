# Absence Types (Admin) (/admin/absence-types)

## Purpose
Define the categories and behavior of absence requests.

## Audience
- Admins: Full access.
- Users: Not available; non-admins are redirected to the Dashboard.

## How to use (step-by-step)
1. Open Absence Types from the Admin navigation.
2. Click New Absence Type.
3. Set code (must start with U, K, or S), name, category, and color.
4. Configure paid status, vacation impact, and approval requirement.
5. Save and activate/deactivate as needed.

## Data and fields
- Code, name, description, category, color.
- Paid flag, affects vacation balance, requires approval.
- Active status; system types show a warning.

## Where changes take effect / integrations
- Absence request form uses these types.
- Approval flow and vacation balance calculations depend on these settings.

## Troubleshooting
- Code must start with U, K, or S.
- Color must be in #RRGGBB format.
