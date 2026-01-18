# TICKET-118: Refactor Handlers to Use Generated OpenAPI Request Schemas

## Summary

Refactor all handlers to use generated request/response structs from `gen/models/` instead of manually defining them in handler files. This ensures consistency between OpenAPI spec and implementation, reduces duplication, and leverages built-in validation.

## Status

- [ ] Not Started

## Priority

Medium - Technical debt / consistency improvement

## Current State

### Handlers Already Using Generated Models (8)

- `account.go` - `models.CreateAccountRequest`, `models.UpdateAccountRequest`
- `costcenter.go` - `models.CreateCostCenterRequest`, `models.UpdateCostCenterRequest`
- `department.go` - `models.CreateDepartmentRequest`, `models.UpdateDepartmentRequest`
- `employee.go` - `models.CreateEmployeeRequest`, `models.UpdateEmployeeRequest`
- `employmenttype.go` - `models.CreateEmploymentTypeRequest`, `models.UpdateEmploymentTypeRequest`
- `holiday.go` - `models.CreateHolidayRequest`, `models.UpdateHolidayRequest`
- `team.go` - `models.CreateTeamRequest`, `models.UpdateTeamRequest`
- `tenant.go` - `models.CreateTenantRequest`, `models.UpdateTenantRequest`

### Handlers with Manual Structs (Need Migration)

| Handler        | Manual Structs                                                                                                                 | OpenAPI Schema Exists? |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `dayplan.go`   | `CreateDayPlanRequest`, `UpdateDayPlanRequest`, `CopyDayPlanRequest`, `CreateDayPlanBreakRequest`, `CreateDayPlanBonusRequest` | Yes                    |
| `usergroup.go` | `createUserGroupRequest`, `updateUserGroupRequest`                                                                             | Yes                    |
| `employee.go`  | `CreateEmployeeContactRequest`, `CreateEmployeeCardRequest`, `DeactivateCardRequest`                                           | Yes                    |
| `team.go`      | `AddMemberRequest`, `UpdateMemberRoleRequest`                                                                                  | Yes                    |
| `response.go`  | `UserResponse`                                                                                                                 | Yes                    |

## Key Differences to Address

| Aspect          | Generated Models          | Manual Models          |
| --------------- | ------------------------- | ---------------------- |
| Required fields | Pointer types (`*string`) | Non-pointer (`string`) |
| Optional fields | Non-pointer (`string`)    | Pointer (`*string`)    |
| Validation      | Built-in `Validate()`     | Manual in service      |
| Enums           | String with constants     | `model.PlanType`       |

## Implementation Steps

### Phase 1: Regenerate Models

All OpenAPI schemas already exist. Just regenerate to ensure models are current:

```bash
make swagger-bundle && make generate
```

### Phase 2: Update Handlers

For each handler with manual structs:

1. **Remove manual struct definitions**
2. **Import `gen/models`**
3. **Update handler methods**:
   - Change struct type to `models.XxxRequest`
   - Add `req.Validate(nil)` call after decode
   - Handle pointer dereferencing for required fields
   - Update field access (e.g., `*req.Code` instead of `req.Code`)

### Phase 3: Update Tests

- Update test files to use generated request structs
- Ensure tests handle pointer types correctly

## Files to Modify

### Handlers

- `apps/api/internal/handler/dayplan.go`
- `apps/api/internal/handler/usergroup.go`
- `apps/api/internal/handler/employee.go`
- `apps/api/internal/handler/team.go`
- `apps/api/internal/handler/response.go`

### Tests

- `apps/api/internal/handler/dayplan_test.go`
- `apps/api/internal/handler/usergroup_test.go`
- `apps/api/internal/handler/employee_test.go`
- `apps/api/internal/handler/team_test.go`

## Example Migration Pattern

**Before (manual struct)**:

```go
type CreateDayPlanRequest struct {
    Code         string         `json:"code"`
    Name         string         `json:"name"`
    PlanType     model.PlanType `json:"plan_type"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    var req CreateDayPlanRequest
    json.NewDecoder(r.Body).Decode(&req)
    // No validation
    h.svc.Create(ctx, req.Code, req.Name, string(req.PlanType))
}
```

**After (generated model)**:

```go
import "github.com/tolga/terp/gen/models"

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
    var req models.CreateDayPlanRequest
    json.NewDecoder(r.Body).Decode(&req)

    if err := req.Validate(nil); err != nil {
        respondError(w, http.StatusBadRequest, err.Error())
        return
    }

    h.svc.Create(ctx, *req.Code, *req.Name, *req.PlanType)
}
```

## Success Criteria

- [ ] All handlers use `gen/models` for request/response structs
- [ ] No manual request struct definitions in handler files
- [ ] All handlers call `.Validate(nil)` on requests
- [ ] All tests pass
- [ ] `make lint` passes

## Dependencies

None

## Notes

- This is a refactoring task with no functional changes
- Generated models use go-swagger validation framework
- Required fields use pointer types in generated models (opposite of manual convention)
