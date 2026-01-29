# ZMI-TICKET-001: Mandant Master Data (Tenant) and Core Attributes

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 3.2 Mandant Master Data (Company Data, Notes, Vacation Calculation Basis)

## Goal
Provide full Mandant (tenant) master data coverage and make it the authoritative source for company identity and tenant-wide defaults that other modules rely on.

## Scope
- In scope: Mandant master data CRUD, tenant scoping, validation, auditability, OpenAPI coverage.
- Out of scope: Holiday generation, system settings options, payroll export configs (separate tickets).

## Requirements
### Data model
- Mandant entity includes at least:
  - Company name
  - Address fields (street, zip, city, country)
  - Phone, email
  - Payroll export base path (used by data exchange module)
  - Notes field (free text)
  - Vacation year basis flag (calendar year vs entry date)
  - Active/inactive flag
- All tenant-scoped entities must reference Mandant ID.

### Business rules
- Mandant is required for all employee records and time plan assignments.
- Vacation year basis set at Mandant is the default for vacation calculations unless overridden by tariff or special rules.

### API / OpenAPI
- Create, read, update, deactivate Mandant endpoints.
- List/search Mandants with filters (name, active).
- Mandant details endpoint returns all fields and derived display labels (if any).
- OpenAPI schemas must include all fields with clear descriptions and validation constraints.

## Acceptance criteria
- Mandant CRUD works with strict tenant scoping and validation.
- OpenAPI includes Mandant schemas and endpoints with complete field coverage.
- Vacation year basis is accessible via API and used as default by vacation calculation service.

## Tests
### Unit tests
- Validate required fields (company name, address minimums if enforced) and reject invalid payloads.
- Validate unique constraints (e.g., company name uniqueness if applicable).
- Verify vacation year basis default is returned when no tariff override is present.

### API tests
- Create Mandant with full field set; read back and verify all fields.
- Deactivate Mandant; list filters exclude inactive by default but include when requested.
- Tenant scoping: attempts to access another tenant’s Mandant return forbidden/not found.

### Integration tests
- Vacation calculation service uses Mandant basis when tariff basis is not set.


## Test Case Pack
1) Create Mandant with vacation basis = calendar_year
   - Input: company name, address, notes, basis=calendar_year
   - Expected: Mandant stored; basis returned as calendar_year
2) Change vacation basis to entry_date
   - Input: update mandant basis
   - Expected: basis returned as entry_date; subsequent vacation previews use entry-date basis by default
3) Deactivate Mandant
   - Input: set active=false
   - Expected: Mandant excluded from default list; included when include_inactive=true


## Dependencies
- None (foundational).
