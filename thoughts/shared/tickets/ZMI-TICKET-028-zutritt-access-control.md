# ZMI-TICKET-028: ZMI Zutritt (Access Control)

Status: Proposed
Priority: P3
Owner: TBD
Manual references: 10.13 Access Settings; mentions separate documentation

## Goal
Implement access control module integration for terminals and access profiles.

## Scope
- In scope: Placeholder API scaffolding and data model stubs.
- Out of scope: Full behavior until separate Zutritt documentation is available.

## Requirements
### Data model (placeholder)
- Access zone
- Access profile
- Employee access assignments

### API / OpenAPI
- Endpoints:
  - CRUD access zones
  - CRUD access profiles
  - Assign profiles to employees

## Acceptance criteria
- Placeholder APIs exist and are documented.
- Feature is marked as requiring separate documentation before full implementation.

## Tests
### Unit tests
- Basic CRUD validation for placeholder models.

### API tests
- Create and retrieve access zone/profile.


## Test Case Pack
1) Access zone CRUD
   - Input: create zone
   - Expected: zone retrievable via API


## Dependencies
- Employee master data (ZMI-TICKET-004).

## Notes
- Full functional parity requires separate ZMI Zutritt documentation.
