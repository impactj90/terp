---
date: 2026-01-24T12:00:00+01:00
researcher: Claude
git_commit: f4a446a82a20a9d26aa84d2cf1cd26c47c567fcb
branch: master
repository: terp
topic: "NOK-133: Create Absence Type Model + Repository"
tags: [research, codebase, absence-type, model, repository, zmi]
status: complete
last_updated: 2026-01-24
last_updated_by: Claude
---

# Research: NOK-133 - Create Absence Type Model + Repository

**Date**: 2026-01-24
**Researcher**: Claude
**Git Commit**: f4a446a82a20a9d26aa84d2cf1cd26c47c567fcb
**Branch**: master
**Repository**: terp

## Research Question
What is needed to implement the AbsenceType model and repository per Linear ticket NOK-133 (TICKET-075), and what existing patterns should be followed?

## Summary

The ticket requires creating `apps/api/internal/model/absencetype.go` and `apps/api/internal/repository/absencetype.go` (with tests). The migration (`000025_create_absence_types`) already exists and seeds 9 system types. The plan file in `thoughts/shared/plans/tickets/TICKET-075-create-absence-type-model-repository.md` contains detailed implementation specs, but some patterns differ from the actual codebase conventions (e.g., the plan uses interfaces; the codebase uses struct-based repositories).

## Detailed Findings

### 1. Migration Already Exists

The `absence_types` table is created by `db/migrations/000025_create_absence_types.up.sql`. Key schema details:

- **Core fields**: `id` (UUID PK), `tenant_id` (nullable UUID FK to tenants), `code` (VARCHAR 10), `name` (VARCHAR 100), `description` (TEXT), `category` (VARCHAR 20)
- **ZMI fields**: `portion` (INT, 0/1/2), `holiday_code` (VARCHAR 10), `priority` (INT)
- **Behavior flags**: `deducts_vacation`, `requires_approval`, `requires_document` (all BOOLEAN)
- **Display/Status**: `color` (VARCHAR 7), `sort_order` (INT), `is_system` (BOOLEAN), `is_active` (BOOLEAN)
- **Timestamps**: `created_at`, `updated_at` (TIMESTAMPTZ)
- **Unique constraint**: `(COALESCE(tenant_id, '00000000-...'), code)` — ensures code uniqueness per tenant

**Seeded system types**: U, UH, K, KH, KK, S, SH, SB, SD, UU (9 types with `is_system=true`, `tenant_id=NULL`)

### 2. Model Patterns in Codebase

Models in `apps/api/internal/model/` follow these conventions:

- **No BaseModel embedding** in practice — each model defines `ID`, `CreatedAt`, `UpdatedAt` inline (despite a `BaseModel` struct existing in `base.go`)
- **GORM tags**: `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"` for IDs
- **Nullable fields**: Use Go pointers (`*string`, `*uuid.UUID`, `*int`)
- **JSON tags**: Always present, nullable fields use `omitempty`
- **Enum types**: Type aliases (`type BookingSource string`) with `const` blocks
- **TableName()**: Value receiver, returns snake_case plural
- **Helper methods**: Business logic on pointer receivers

Key examples: `model/employee.go`, `model/booking.go`, `model/dailyvalue.go`

### 3. Repository Patterns in Codebase

Repositories in `apps/api/internal/repository/` follow these conventions:

- **Struct-based** (NOT interface-based): `type AbsenceTypeRepository struct { db *DB }`
- **Constructor**: `func NewAbsenceTypeRepository(db *DB) *AbsenceTypeRepository`
- **DB wrapper**: Uses `*repository.DB` which wraps `*gorm.DB` (via `r.db.GORM.WithContext(ctx)`)
- **Error variables**: Package-level `var ErrAbsenceTypeNotFound = errors.New("absence type not found")`
- **Error handling**: Convert `gorm.ErrRecordNotFound` to custom error, wrap other errors with `fmt.Errorf`
- **Delete pattern**: Check `RowsAffected == 0` to return not-found error
- **Tenant scoping**: Explicit `WHERE tenant_id = ?` in queries

**Important discrepancy**: The plan file defines an interface-based repository, but the actual codebase uses struct-based repositories without interfaces.

### 4. Test Patterns

Tests in `apps/api/internal/repository/` follow these conventions:

- **Package**: `package repository_test` (external test package)
- **Setup**: `testutil.SetupTestDB(t)` returns `*repository.DB` with transaction isolation
- **Helpers**: `createTestTenantFor*` and `createTestEmployee` functions using `t.Helper()`
- **Assertions**: `require.NoError` for setup, `assert.*` for test assertions
- **Naming**: `Test<Repo>_<Method>[_<Scenario>]`
- **UUID uniqueness**: `uuid.New().String()[:8]` for unique constraint-safe values

### 5. OpenAPI / Generated Models

Generated models exist at `apps/api/gen/models/absence_type.go` with field name discrepancies:
- OpenAPI `affects_vacation_balance` → DB `deducts_vacation`
- OpenAPI `is_paid` → not present in DB migration
- DB `portion`, `holiday_code`, `priority`, `requires_document`, `sort_order` → not in OpenAPI

The internal model should match the **database schema**, not the OpenAPI spec. The handler layer will handle mapping between internal model and generated API models.

### 6. What Needs to Be Created

| File | Status |
|------|--------|
| `apps/api/internal/model/absencetype.go` | Not yet created |
| `apps/api/internal/repository/absencetype.go` | Not yet created |
| `apps/api/internal/repository/absencetype_test.go` | Not yet created |

### 7. Key Implementation Differences from Plan

The plan file (`TICKET-075`) specifies an interface-based repository. The actual codebase pattern is:

**Plan says:**
```go
type AbsenceTypeRepository interface { ... }
type absenceTypeRepository struct { db *gorm.DB }
func NewAbsenceTypeRepository(db *gorm.DB) AbsenceTypeRepository { ... }
```

**Codebase actually does:**
```go
type AbsenceTypeRepository struct { db *DB }
func NewAbsenceTypeRepository(db *DB) *AbsenceTypeRepository { ... }
```

The plan also uses `r.db.WithContext(ctx)` directly, but the codebase uses `r.db.GORM.WithContext(ctx)` since `db` is a `*repository.DB` wrapper.

## Code References

- `db/migrations/000025_create_absence_types.up.sql` - Migration with table schema and seed data
- `db/migrations/000025_create_absence_types.down.sql` - Rollback migration
- `apps/api/internal/model/base.go` - BaseModel definition (not embedded in practice)
- `apps/api/internal/model/employee.go` - Reference model with relations, nullable fields
- `apps/api/internal/model/booking.go` - Reference model with enums, helper methods
- `apps/api/internal/repository/booking.go` - Reference repository with struct-based pattern
- `apps/api/internal/repository/employee.go` - Reference repository with filters, pagination
- `apps/api/internal/repository/dailyvalue.go` - Reference repository with upsert, aggregation
- `apps/api/internal/repository/db.go` - DB wrapper struct definition
- `apps/api/internal/testutil/db.go` - Test database setup with transaction isolation
- `apps/api/gen/models/absence_type.go` - Generated API model (different field naming)
- `api/schemas/absence-types.yaml` - OpenAPI schema definition
- `api/paths/absence-types.yaml` - OpenAPI endpoint definitions

## Architecture Documentation

- Internal models map directly to database schema using GORM struct tags
- Repositories are struct-based with `*repository.DB` dependency injection
- Multi-tenancy: system types have `tenant_id=NULL`, tenant-specific types have `tenant_id` set
- The `GetByCode` query uses `ORDER BY tenant_id DESC NULLS LAST` to prefer tenant-specific over system types
- Generated models (from OpenAPI) are used only in handler layer for request/response serialization
- Test isolation via database transactions rolled back after each test

## Historical Context (from thoughts/)

- `thoughts/shared/plans/tickets/TICKET-074-create-absence-types-migration.md` - Migration plan with ZMI field mapping
- `thoughts/shared/plans/tickets/TICKET-075-create-absence-type-model-repository.md` - Detailed implementation plan (note: uses interface pattern that differs from codebase)

## Open Questions

1. **Interface vs Struct**: The plan defines a repository interface, but all existing repositories use exported structs. Which pattern should be followed? (Based on codebase research, struct-based is correct.)
2. **Field naming**: The OpenAPI schema uses different names than DB (e.g., `affects_vacation_balance` vs `deducts_vacation`). The model should match DB column names and mapping should happen in the handler layer.
