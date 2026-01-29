# ZMI-TICKET-026: Employee Messages and Notifications

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 4.13 Messages Tab; 12 ZMI Server tasks (Push Notifications)

## Goal
Support sending messages/notifications to employees and tracking delivery status.

## Scope
- In scope: Message creation, send workflow, notification records, OpenAPI coverage.
- Out of scope: Mobile app UI.

## Requirements
### Data model
- Message fields:
  - Sender (user)
  - Recipients (employees)
  - Message text
  - Created timestamp
  - Sent timestamp
  - Status (pending/sent/failed)

### Business rules
- Messages can be created in personnel master and then sent.
- Sending can be triggered manually or by scheduler task.

### API / OpenAPI
- Endpoints:
  - Create message
  - Send message
  - List messages and status
- OpenAPI must document status values and send behavior.

## Acceptance criteria
- Messages can be created and sent to selected employees.
- Status updates reflect send success/failure.

## Tests
### Unit tests
- Status transitions (pending -> sent/failed).

### API tests
- Create message; trigger send; verify status update.

### Integration tests
- Scheduler task "Push Notifications" sends pending messages.


## Test Case Pack
1) Create and send message
   - Input: message to two employees
   - Expected: status moves pending -> sent
2) Scheduler send
   - Input: scheduled task runs
   - Expected: all pending messages sent


## Dependencies
- User management (ZMI-TICKET-003).
- ZMI Server scheduler (ZMI-TICKET-022).
