# ZMI-TICKET-033: Grid Layout Preferences (Evaluation UI Support)

Status: Proposed
Priority: P3
Owner: TBD
Manual references: 9.7 Grid Operations; 9.7.2 Saving and Loading Layouts

## Goal
Persist user-specific grid layout preferences for evaluations.

## Scope
- In scope: Layout save/load/delete per user and evaluation type, OpenAPI coverage.
- Out of scope: UI rendering logic.

## Requirements
### Data model
- Layout:
  - User ID
  - Evaluation type
  - Layout name
  - Serialized layout settings (columns, grouping, order, sizes)
  - Created/updated timestamps

### Business rules
- Users can save multiple named layouts per evaluation type.
- Reset restores default layout (no stored preferences).

### API / OpenAPI
- Endpoints:
  - Save layout
  - Load layout
  - List layouts
  - Delete layout
- OpenAPI must document layout payload format.

## Acceptance criteria
- Layouts can be saved and loaded per user/evaluation type.
- Reset removes custom layout and falls back to default.

## Tests
### Unit tests
- Layout serialization/deserialization consistency.

### API tests
- Save layout, list layouts, load layout, delete layout.


## Test Case Pack
1) Save and load layout
   - Input: save layout A, then load
   - Expected: layout returned with same columns/grouping
2) Reset layout
   - Input: reset
   - Expected: default layout used


## Dependencies
- User management (ZMI-TICKET-003).
- Evaluation module (ZMI-TICKET-019).
