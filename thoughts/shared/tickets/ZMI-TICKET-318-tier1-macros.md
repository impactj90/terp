# ZMI-TICKET-318: Extract Services — macros (928 lines)

Status: Todo
Priority: P1
Depends on: ZMI-TICKET-303

## Goal
Extract service + repository layers for the macros router. This handles macro definitions, assignments, execution, and the task catalog.

## Current Router Analysis (src/server/routers/macros.ts — 928 lines)

### Procedures
- `macros.list` — list macro definitions
- `macros.getById` — single macro with assignments
- `macros.create` — create macro definition
- `macros.update` — update macro definition
- `macros.delete` — delete macro
- `macros.createAssignment` — assign macro to employee/group
- `macros.deleteAssignment` — remove assignment
- `macros.triggerExecution` — manually trigger macro execution
- `macros.getExecutionHistory` — list past executions
- `macros.getTaskCatalog` — available task types for macro steps

### Key Business Logic
- Macro definition with ordered task steps
- Task catalog (predefined task types with parameters)
- Assignment to employees or groups
- Manual and scheduled execution
- Execution logging and history
- Integration with macro-executor service

### Dependencies
- `@/lib/services/macro-executor` (execution engine)

## Implementation

### Repository: `src/lib/services/macro-repository.ts`
```typescript
export async function findMany(prisma, tenantId, params)
export async function findById(prisma, tenantId, id) // includes assignments + tasks
export async function create(prisma, tenantId, data) // with tasks
export async function update(prisma, tenantId, id, data) // with task updates
export async function remove(prisma, tenantId, id)
export async function createAssignment(prisma, tenantId, macroId, data)
export async function deleteAssignment(prisma, tenantId, assignmentId)
export async function findExecutionHistory(prisma, tenantId, macroId, params)
export async function createExecution(prisma, tenantId, data)
```

### Service: `src/lib/services/macro-service.ts`
```typescript
export class MacroNotFoundError extends Error { ... }
export class AssignmentNotFoundError extends Error { ... }
export class ExecutionFailedError extends Error { ... }

export async function list(prisma, tenantId, params)
export async function getById(prisma, tenantId, id)
export async function create(prisma, tenantId, data)
  // Validates task steps against catalog
export async function update(prisma, tenantId, id, data)
export async function remove(prisma, tenantId, id)
export async function createAssignment(prisma, tenantId, macroId, data)
export async function deleteAssignment(prisma, tenantId, assignmentId)
export async function triggerExecution(prisma, tenantId, macroId)
  // Uses macro-executor service
export async function getExecutionHistory(prisma, tenantId, macroId, params)
export function getTaskCatalog()
  // Returns available task types and their parameter schemas
```

## Files Created
- `src/lib/services/macro-service.ts`
- `src/lib/services/macro-repository.ts`

## Verification
```bash
make typecheck
make test
```
