# ZMI-TICKET-025: Contact Management (Kontaktmanagement)

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 10.15 Contact Management; 4.5 Contact Data

## Goal
Implement configurable contact field types used in employee contact data.

## Scope
- In scope: Contact type definitions, contact kind labels, validation, OpenAPI coverage.
- Out of scope: UI form layout.

## Requirements
### Data model
- Contact type:
  - Name/label
  - Data type (text, phone, email, etc.)
  - Active flag
- Contact kind:
  - Label shown in employee contact tab
  - Linked to a contact type
- Employee contact values reference contact kind and store value.

### Business rules
- Only active contact kinds can be used on employees.
- Value validation based on contact type (e.g., email format).

### API / OpenAPI
- Endpoints:
  - CRUD contact types
  - CRUD contact kinds
  - List contact kinds for use in employee contact data
- OpenAPI must document validation rules.

## Acceptance criteria
- Contact types and kinds can be created and assigned.
- Employee contact data validates against contact type rules.

## Tests
### Unit tests
- Contact type validation (email/phone formats if enforced).
- Prevent use of inactive contact kinds.

### API tests
- Create contact type and kind; assign to employee contact value; verify retrieval.

### Integration tests
- Employee contact tab data uses configured contact kinds.


## Test Case Pack
1) Contact type validation
   - Input: email type, value="not-an-email"
   - Expected: validation error
2) Inactive contact kind
   - Input: assign inactive kind to employee
   - Expected: validation error


## Dependencies
- Personnel master data (ZMI-TICKET-004).
