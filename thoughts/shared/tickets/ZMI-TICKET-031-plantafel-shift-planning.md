# ZMI-TICKET-031: Plantafel (Shift Planning Board)

Status: Proposed
Priority: P3
Owner: TBD
Manual references: Mentions in personnel master; separate documentation implied

## Goal
Implement shift planning board data model and API scaffolding.

## Scope
- In scope: Placeholder data model and API endpoints.
- Out of scope: Full behavior until Plantafel documentation is available.

## Requirements
### Data model (placeholder)
- Shift definition
- Shift assignment to employee and date range
- Qualification linkage

### API / OpenAPI
- Endpoints:
  - CRUD shifts
  - Assign shifts to employees
  - List shifts by date range

## Acceptance criteria
- Placeholder APIs exist and are documented.

## Tests
### Unit tests
- Shift assignment validation.

### API tests
- Create and list shift assignments.


## Test Case Pack
1) Shift assignment
   - Input: assign shift to employee for date range
   - Expected: shift appears in list


## Dependencies
- Employee master data (ZMI-TICKET-004).

## Notes
- Full parity requires separate Plantafel documentation.
