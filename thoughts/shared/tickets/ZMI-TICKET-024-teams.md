# ZMI-TICKET-024: Teams (Mitarbeitergruppen)

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 7 Teams

## Goal
Implement team management for grouping employees used by reports and vacation planner.

## Scope
- In scope: Team CRUD, membership management, OpenAPI coverage.
- Out of scope: UI for vacation planner.

## Requirements
### Data model
- Team fields:
  - Team number/code
  - Team name
  - Members (employees)

### Business rules
- Employees can belong to multiple teams.
- Teams are used as filters in reports and evaluation queries.

### API / OpenAPI
- Endpoints:
  - CRUD teams
  - Add/remove team members
  - List teams with members
- OpenAPI must document team membership behavior.

## Acceptance criteria
- Teams can be created and members assigned.
- Team filters are available in report/evaluation endpoints.

## Tests
### Unit tests
- Team membership add/remove operations.

### API tests
- Create team, add members, list members.

### Integration tests
- Reports filtered by team return only members’ data.


## Test Case Pack
1) Team membership
   - Input: create team, add two employees
   - Expected: team lists both employees
2) Reporting filter by team
   - Input: report filtered to team
   - Expected: only team members included


## Dependencies
- Employee master data (ZMI-TICKET-004).
- Reporting module (ZMI-TICKET-020).
