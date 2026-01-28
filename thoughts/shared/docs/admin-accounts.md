# Accounts (Admin) (/admin/accounts)

## Purpose
Create and manage time accounts (bonus, tracking, balance) used in calculations and payroll exports.

## Audience
- Admins: Full access.
- Users: Not available; non-admins are redirected to the Dashboard.

## How to use (step-by-step)
1. Open Accounts from the Admin navigation.
2. Use filters to narrow by type/status or hide system accounts.
3. Click New Account to create a custom account.
4. Edit, view details, or delete as needed.
5. Toggle Active status to include/exclude from calculations.

## Data and fields
- Code, name, description.
- Account type (bonus/tracking/balance).
- Unit (minutes/hours/days), year carryover.
- Payroll relevance and payroll code.
- Sort order and active status.
- System accounts are marked and may have restrictions.

## Where changes take effect / integrations
- Day Plan bonuses reference accounts.
- Monthly values can include account balances.
- Payroll exports use payroll flags and codes.

## Troubleshooting
- Codes and names are required and have length limits.
- If delete is blocked, the account is in use by day plans or other entities.
- System accounts cannot change code or type.
