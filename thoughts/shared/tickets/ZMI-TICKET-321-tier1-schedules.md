# ZMI-TICKET-321: Extract Services — schedules (1251 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the schedules router. This handles scheduled task definitions, execution tracking, and cron-like scheduling.

## Current Router Analysis (src/server/routers/schedules.ts — 1251 lines)

### Procedures
- `schedules.list` — list schedule definitions
- `schedules.getById` — single schedule with tasks + execution history
- `schedules.create` — create schedule with task definitions
- `schedules.update` — update schedule configuration
- `schedules.delete` — delete schedule
- `schedules.activate` / `schedules.deactivate` — toggle schedule active state
- `schedules.createTask` — add task to schedule
- `schedules.updateTask` — update task configuration
- `schedules.deleteTask` — remove task from schedule
- `schedules.triggerExecution` — manually trigger schedule execution
- `schedules.getExecutions` — list execution history
- `schedules.getExecutionById` — single execution with task results
- `schedules.getTaskCatalog` — available task types

### Key Business Logic
- Schedule definitions with cron-like timing (interval, time of day, days of week)
- Task ordering within a schedule
- Execution tracking (start, end, status, errors per task)
- Manual trigger vs automatic execution
- Task catalog with parameter schemas
- Active/inactive state management

## Implementation

### Repository: `src/lib/services/schedule-repository.ts`
```typescript
// Schedule CRUD
export async function findMany(prisma, tenantId, params)
export async function findById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function setActive(prisma, tenantId, id, active: boolean)
// Tasks
export async function createTask(prisma, tenantId, scheduleId, data)
export async function updateTask(prisma, tenantId, taskId, data)
export async function removeTask(prisma, tenantId, taskId)
// Executions
export async function findExecutions(prisma, tenantId, scheduleId, params)
export async function findExecutionById(prisma, tenantId, executionId)
export async function createExecution(prisma, tenantId, data)
export async function updateExecution(prisma, tenantId, executionId, data)
```

### Service: `src/lib/services/schedule-service.ts`
```typescript
export class ScheduleNotFoundError extends Error { ... }
export class TaskNotFoundError extends Error { ... }
export class ScheduleInactiveError extends Error { ... }

export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function activate(prisma, tenantId, id)
export async function deactivate(prisma, tenantId, id)
export async function createTask(prisma, tenantId, scheduleId, data)
  // Validates task type against catalog, validates parameters
export async function updateTask(prisma, tenantId, taskId, data)
export async function deleteTask(prisma, tenantId, taskId)
export async function triggerExecution(prisma, tenantId, scheduleId)
  // Creates execution record, runs tasks in order, logs results
export async function getExecutions(prisma, tenantId, scheduleId, params)
export async function getExecutionById(prisma, tenantId, executionId)
export function getTaskCatalog()
```

## Files Created
- `src/lib/services/schedule-service.ts`
- `src/lib/services/schedule-repository.ts`

## Verification
```bash
make typecheck
make test
```
