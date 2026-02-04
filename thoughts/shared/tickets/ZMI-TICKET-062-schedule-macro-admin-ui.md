# ZMI-TICKET-062: Schedule & Macro Admin UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-022, ZMI-TICKET-032

## Goal
Provide admin pages for managing scheduled tasks (schedules with timing configuration and task management) and macros (weekly/monthly automated actions with assignments and execution logs).

## Scope
- In scope: Schedules CRUD with task management, schedule execution logs, macros CRUD with assignments, macro execution logs, task catalog display.
- Out of scope: Schedule/macro execution engine, real-time execution monitoring.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/schedules/page.tsx`
  - Route: `/admin/schedules`
- **Schedule detail**: `apps/web/src/app/[locale]/(dashboard)/admin/schedules/[id]/page.tsx`
  - Route: `/admin/schedules/{id}` with tabs: "Tasks", "Executions"
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/macros/page.tsx`
  - Route: `/admin/macros`
- **Macro detail**: `apps/web/src/app/[locale]/(dashboard)/admin/macros/[id]/page.tsx`
  - Route: `/admin/macros/{id}` with tabs: "Assignments", "Executions"

### Components

#### Schedules
- `apps/web/src/components/schedules/schedule-data-table.tsx`
  - Columns: Name, Timing Type (badge), Interval/Time, Active, Task Count, Last Run, Actions
  - Timing type badges: seconds/minutes/hours/daily/weekly/monthly/manual
- `apps/web/src/components/schedules/schedule-form-sheet.tsx`
  - Fields: name, description, timing_type (select), timing_config (dynamic fields based on type):
    - seconds/minutes/hours: interval (number)
    - daily: time (HH:MM)
    - weekly: day_of_week (select Mon-Sun), time
    - monthly: day_of_month (1-31), time
    - manual: no timing config
  - Active switch, is_enabled switch
- `apps/web/src/components/schedules/schedule-task-list.tsx`
  - List of tasks in a schedule with drag-and-drop reordering
  - Each task shows: task_type badge, parameters, sort_order
  - Add task from task catalog
- `apps/web/src/components/schedules/schedule-task-form-dialog.tsx`
  - Task type selector (from GET `/scheduler/task-catalog`)
  - Parameters: dynamic fields based on task_type
- `apps/web/src/components/schedules/schedule-execution-log.tsx`
  - Read-only table: started_at, completed_at, status (success/failed/running), duration, error_message
  - Manual trigger: "Execute Now" button (POST `/schedules/{id}/execute`)

#### Macros
- `apps/web/src/components/macros/macro-data-table.tsx`
  - Columns: Name, Type (badge: weekly/monthly), Action Type, Active, Assignment Count, Actions
- `apps/web/src/components/macros/macro-form-sheet.tsx`
  - Fields: name, description, macro_type (weekly/monthly), action_type (select: log_message/recalculate_target_hours/reset_flextime/carry_forward_balance), parameters (JSON), active
- `apps/web/src/components/macros/macro-assignment-list.tsx`
  - Assignment table: Target (tariff or employee), Execution Day, Active, Actions
  - Form: execution_day (0-6 for weekly, 1-31 for monthly), tariff_id or employee_id (mutually exclusive), active
- `apps/web/src/components/macros/macro-execution-log.tsx`
  - Execution history table with manual "Execute Now" button

### API hooks
- `apps/web/src/hooks/api/use-schedules.ts`
  - Schedules: `useSchedules()`, `useSchedule()`, `useCreateSchedule()`, `useUpdateSchedule()`, `useDeleteSchedule()`
  - Tasks: `useScheduleTasks()`, `useCreateScheduleTask()`, `useUpdateScheduleTask()`, `useDeleteScheduleTask()`
  - Execution: `useExecuteSchedule()`, `useScheduleExecutions()`, `useTaskCatalog()`
- `apps/web/src/hooks/api/use-macros.ts`
  - Macros: `useMacros()`, `useMacro()`, `useCreateMacro()`, `useUpdateMacro()`, `useDeleteMacro()`
  - Assignments: `useMacroAssignments()`, `useCreateMacroAssignment()`, `useUpdateMacroAssignment()`, `useDeleteMacroAssignment()`
  - Execution: `useExecuteMacro()`, `useMacroExecutions()`

### UI behavior
- Schedule timing config: dynamic fields change based on timing_type selection
- Task catalog: loaded from API, provides available task types with descriptions
- Manual execution: "Execute Now" button triggers immediate run with status feedback
- Macro assignment: mutually exclusive tariff_id/employee_id (radio toggle between "By Tariff" and "By Employee")
- Execution logs: read-only, sorted by most recent

### Navigation & translations
- Sidebar entries in "Administration" section:
  - `{ titleKey: 'nav.schedules', href: '/admin/schedules', icon: Clock, roles: ['admin'] }`
  - `{ titleKey: 'nav.macros', href: '/admin/macros', icon: Repeat, roles: ['admin'] }`
- Translation namespaces: `schedules`, `macros`

## Acceptance criteria
- Admin can CRUD schedules with timing configuration
- Admin can manage tasks within schedules
- Admin can manually trigger schedule execution
- Admin can view execution logs for schedules and macros
- Admin can CRUD macros with assignments
- Macro assignments support tariff-level and employee-level targeting

## Tests

### Component tests
- Timing config changes dynamically with type selection
- Task catalog loads and displays available task types
- Macro assignment form toggles between tariff/employee

### Integration tests
- Create schedule with tasks, execute manually, view logs
- Create macro with assignment, execute, view results

## Test case pack
1) Create daily schedule
   - Input: Timing type=daily, time="05:00", add "calculate_days" task
   - Expected: Schedule created showing "Daily at 05:00"
2) Execute schedule manually
   - Input: Click "Execute Now"
   - Expected: Execution started, log entry appears
3) Create monthly macro
   - Input: Type=monthly, action=carry_forward_balance, assign to tariff
   - Expected: Macro with monthly assignment to tariff

## Dependencies
- ZMI-TICKET-022 (ZMI Server Scheduler backend)
- ZMI-TICKET-032 (Macros Weekly/Monthly backend)
- Tariffs API (for macro assignments)
- Employees API (for macro assignments)
