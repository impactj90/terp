# ZMI-TICKET-022: ZMI Server Scheduler and Automated Tasks

Status: Proposed
Priority: P2
Owner: TBD
Manual references: 12 ZMI Server (schedules, tasks, execution order)

## Goal
Implement a scheduler for automated tasks and the task catalog described in the manual.

## Scope
- In scope: Schedule definitions, task catalog, execution timing, task ordering, OpenAPI coverage.
- Out of scope: Terminal communication protocols (separate tickets if required).

## Requirements
### Data model
- Schedule fields:
  - Name/description
  - Timing type (seconds/minutes/hours/daily/weekly/monthly/manual)
  - Timing configuration (interval, day, time)
  - Enabled flag
  - Task list (ordered)
- Task catalog:
  - Calculate days with new bookings
  - Calculate months (current/full month)
  - Backup database
  - Send notifications
  - Export data
  - Alive check
  - Other tasks listed in manual (placeholders where module docs are missing)

### Business rules
- Tasks execute top-to-bottom within a schedule.
- Manual execution runs immediately without schedule timing.
- A schedule can be paused and resumed without losing configuration.
- Backup task should be run before calculation tasks in recommended schedules.

### API / OpenAPI
- Endpoints:
  - CRUD schedules
  - Trigger manual execution
  - List task catalog
  - Get last execution status/logs
- OpenAPI must document timing options and task parameters.

## Acceptance criteria
- Schedules can be created for each timing type and execute tasks in order.
- Manual execution runs selected schedule tasks immediately.
- Execution logs capture success/failure and timestamps.

## Tests
### Unit tests
- Schedule timing validation for each timing type.
- Task ordering preserved and executed in sequence.

### API tests
- Create schedule with multiple tasks; trigger manual execution; verify logs.
- Pause and resume schedule; verify no execution while paused.

### Integration tests
- Scheduled daily calculation runs and produces daily values for new bookings.


## Test Case Pack
1) Ordered tasks
   - Input: schedule tasks [backup, calculate]
   - Expected: backup runs before calculate
2) Manual execution
   - Input: trigger manual run
   - Expected: tasks execute immediately
3) Pause schedule
   - Input: pause schedule
   - Expected: no runs while paused


## Dependencies
- Daily calculation (ZMI-TICKET-006).
- Monthly evaluation (ZMI-TICKET-016).
- Data exchange (ZMI-TICKET-021) for export tasks.
