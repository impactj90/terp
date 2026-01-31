# ZMI-TICKET-036: Day Plan Net/Cap Accounts (Tagesnetto/Kappungskonto)

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 3.4.4.9 Sonstiges (Tagesnetto-Konto, Kappungskonto)

## Goal
Post daily net time and capped minutes to configured day plan accounts.

## Scope
- In scope: Day plan fields for net/cap accounts, daily account postings, API/OpenAPI coverage.
- Out of scope: Payroll export formatting changes (use existing export logic).

## Requirements
### Data model
- Add nullable fields on day_plans:
  - net_account_id (account_type=day)
  - cap_account_id (account_type=day)
- Add daily account posting storage (e.g., daily_account_values):
  - employee_id, date, account_id, minutes, source (net_time | capped_time), day_plan_id

### Business rules
- After daily calculation:
  - If net_account_id is set, post NetTime (minutes) to that account.
  - If cap_account_id is set, post CappedTime (minutes) to that account.
- Recalculation replaces existing postings for the same employee/date/account/source.
- No postings for off-days or missing day plans.

### API / OpenAPI
- Extend day plan CRUD to include net_account_id and cap_account_id.
- Add read endpoint for daily account values (filter by employee/date/account).

## Acceptance criteria
- Daily calculation produces account postings for net and capped minutes when configured.
- Recalculation updates values without duplicates.
- Day plans without configured accounts produce no postings.

## Tests
### Unit tests
- NetTime and CappedTime postings created with correct minutes.
- Recalc overwrites existing postings.

### API tests
- Create day plan with net_account_id and cap_account_id; verify fields persist.
- List daily account values by date range.

### Integration tests
- Daily calculation produces account postings that match daily value totals.


## Test Case Pack
1) Net account posting
   - Input: net_account_id set, NetTime=480
   - Expected: daily_account_values entry with 480 minutes
2) Capped account posting
   - Input: cap_account_id set, CappedTime=15
   - Expected: daily_account_values entry with 15 minutes
3) Recalc update
   - Input: recalc changes NetTime from 480 to 450
   - Expected: posting updated to 450 (single row)


## Dependencies
- Accounts and account groups (ZMI-TICKET-009).
- Day plan advanced rules (ZMI-TICKET-006).
