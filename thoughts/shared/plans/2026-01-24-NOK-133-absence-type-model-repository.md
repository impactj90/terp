# NOK-133: AbsenceType Model + Repository Implementation Plan

## Overview

Create the AbsenceType model and repository with ZMI-compliant fields (portion, holiday_code, priority). The migration already exists (`000025_create_absence_types`). Implementation follows the established struct-based repository pattern used throughout the codebase.

## Current State Analysis

- **Migration exists**: `db/migrations/000025_create_absence_types.up.sql` creates the table and seeds 10 system absence types
- **No model or repository yet**: Neither `model/absencetype.go` nor `repository/absencetype.go` exist
- **Generated API model exists**: `apps/api/gen/models/absence_type.go` (used only in handler layer, different field naming)

### Key Discoveries:
- Models use inline ID/CreatedAt/UpdatedAt fields, not `BaseModel` embedding (`model/booking.go:21-43`)
- Repositories are struct-based with `*DB` dependency, not interface-based (`repository/booking.go:33-40`)
- DB access via `r.db.GORM.WithContext(ctx)` (`repository/booking.go:44`)
- Tests use external package `repository_test` with `testutil.SetupTestDB(t)` (`repository/booking_test.go:1`)
- Test helpers create full model objects via other repositories (`repository/booking_test.go:19-61`)
- Error pattern: package-level `var ErrXxxNotFound` + check `gorm.ErrRecordNotFound` + wrap other errors with `fmt.Errorf`
- Delete pattern: check `RowsAffected == 0` to return not-found

## Desired End State

Three new files exist, all tests pass, and the AbsenceType model correctly maps to the `absence_types` DB schema with ZMI helper methods.

### Verification:
- `cd apps/api && go build ./...` succeeds
- `cd apps/api && go test -v ./internal/repository/ -run TestAbsenceType` passes all tests
- `make lint` passes

## What We're NOT Doing

- No handler/service layer (separate ticket)
- No OpenAPI-to-internal model mapping (handler layer responsibility)
- No migration changes (already exists)
- No interface definition (codebase uses structs)

## Implementation Approach

Single phase: create model → repository → tests. All files are independent of each other in terms of compilation order, but logically the model must be defined before the repository and tests reference it.

## Phase 1: Model, Repository, and Tests

### Changes Required:

#### 1. AbsenceType Model
**File**: `apps/api/internal/model/absencetype.go`

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// AbsenceCategory represents the category of absence.
type AbsenceCategory string

const (
	AbsenceCategoryVacation AbsenceCategory = "vacation"
	AbsenceCategoryIllness  AbsenceCategory = "illness"
	AbsenceCategorySpecial  AbsenceCategory = "special"
	AbsenceCategoryUnpaid   AbsenceCategory = "unpaid"
)

// AbsencePortion represents how much of Regelarbeitszeit to credit.
// ZMI: Anteil field (0=none, 1=full, 2=half)
type AbsencePortion int

const (
	AbsencePortionNone AbsencePortion = 0
	AbsencePortionFull AbsencePortion = 1
	AbsencePortionHalf AbsencePortion = 2
)

// AbsenceType represents an absence type definition.
type AbsenceType struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID  *uuid.UUID `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Identification
	Code        string          `gorm:"type:varchar(10);not null" json:"code"`
	Name        string          `gorm:"type:varchar(100);not null" json:"name"`
	Description *string         `gorm:"type:text" json:"description,omitempty"`
	Category    AbsenceCategory `gorm:"type:varchar(20);not null" json:"category"`

	// ZMI: Anteil - determines time credit
	Portion AbsencePortion `gorm:"type:int;not null;default:1" json:"portion"`

	// ZMI: Kürzel am Feiertag - alternative code on holidays
	HolidayCode *string `gorm:"type:varchar(10)" json:"holiday_code,omitempty"`

	// ZMI: Priorität - higher wins when holiday + absence overlap
	Priority int `gorm:"type:int;not null;default:0" json:"priority"`

	// Behavior flags
	DeductsVacation  bool `gorm:"default:false" json:"deducts_vacation"`
	RequiresApproval bool `gorm:"default:true" json:"requires_approval"`
	RequiresDocument bool `gorm:"default:false" json:"requires_document"`

	// Display
	Color     string `gorm:"type:varchar(7);default:'#808080'" json:"color"`
	SortOrder int    `gorm:"type:int;default:0" json:"sort_order"`

	// Status
	IsSystem bool `gorm:"default:false" json:"is_system"`
	IsActive bool `gorm:"default:true" json:"is_active"`

	// Relations
	Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (AbsenceType) TableName() string {
	return "absence_types"
}

// CreditMultiplier returns the multiplier for Regelarbeitszeit.
func (at *AbsenceType) CreditMultiplier() float64 {
	switch at.Portion {
	case AbsencePortionNone:
		return 0.0
	case AbsencePortionFull:
		return 1.0
	case AbsencePortionHalf:
		return 0.5
	default:
		return 1.0
	}
}

// CalculateCredit computes the time credit for an absence day.
// Formula: Regelarbeitszeit (minutes) * CreditMultiplier
func (at *AbsenceType) CalculateCredit(regelarbeitszeit int) int {
	return int(float64(regelarbeitszeit) * at.CreditMultiplier())
}

// GetEffectiveCode returns the holiday_code if on a holiday, otherwise the regular code.
func (at *AbsenceType) GetEffectiveCode(isHoliday bool) string {
	if isHoliday && at.HolidayCode != nil && *at.HolidayCode != "" {
		return *at.HolidayCode
	}
	return at.Code
}

// IsVacationType returns true if this is a vacation-related absence.
func (at *AbsenceType) IsVacationType() bool {
	return at.Category == AbsenceCategoryVacation
}

// IsIllnessType returns true if this is an illness-related absence.
func (at *AbsenceType) IsIllnessType() bool {
	return at.Category == AbsenceCategoryIllness
}
```

#### 2. AbsenceType Repository
**File**: `apps/api/internal/repository/absencetype.go`

```go
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/tolga/terp/internal/model"
)

var ErrAbsenceTypeNotFound = errors.New("absence type not found")

// AbsenceTypeRepository handles absence type data access.
type AbsenceTypeRepository struct {
	db *DB
}

// NewAbsenceTypeRepository creates a new absence type repository.
func NewAbsenceTypeRepository(db *DB) *AbsenceTypeRepository {
	return &AbsenceTypeRepository{db: db}
}

// Create creates a new absence type.
func (r *AbsenceTypeRepository) Create(ctx context.Context, at *model.AbsenceType) error {
	return r.db.GORM.WithContext(ctx).Create(at).Error
}

// GetByID retrieves an absence type by ID.
func (r *AbsenceTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error) {
	var at model.AbsenceType
	err := r.db.GORM.WithContext(ctx).First(&at, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence type: %w", err)
	}
	return &at, nil
}

// GetByCode retrieves an absence type by code for a tenant.
// Prefers tenant-specific types over system types when both exist.
func (r *AbsenceTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceType, error) {
	var at model.AbsenceType
	err := r.db.GORM.WithContext(ctx).
		Where("(tenant_id = ? OR tenant_id IS NULL) AND code = ?", tenantID, code).
		Order("tenant_id DESC NULLS LAST").
		First(&at).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrAbsenceTypeNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get absence type by code: %w", err)
	}
	return &at, nil
}

// Update updates an absence type.
func (r *AbsenceTypeRepository) Update(ctx context.Context, at *model.AbsenceType) error {
	return r.db.GORM.WithContext(ctx).Save(at).Error
}

// Delete deletes an absence type by ID.
func (r *AbsenceTypeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.AbsenceType{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete absence type: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrAbsenceTypeNotFound
	}
	return nil
}

// List retrieves absence types for a tenant with optional system type inclusion.
func (r *AbsenceTypeRepository) List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error) {
	var types []model.AbsenceType
	query := r.db.GORM.WithContext(ctx).Where("is_active = ?", true)

	if includeSystem {
		query = query.Where("tenant_id = ? OR tenant_id IS NULL", tenantID)
	} else {
		query = query.Where("tenant_id = ?", tenantID)
	}

	err := query.Order("sort_order ASC, code ASC").Find(&types).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list absence types: %w", err)
	}
	return types, nil
}

// ListByCategory retrieves active absence types for a tenant filtered by category.
func (r *AbsenceTypeRepository) ListByCategory(ctx context.Context, tenantID uuid.UUID, category model.AbsenceCategory) ([]model.AbsenceType, error) {
	var types []model.AbsenceType
	err := r.db.GORM.WithContext(ctx).
		Where("(tenant_id = ? OR tenant_id IS NULL) AND category = ? AND is_active = ?", tenantID, category, true).
		Order("sort_order ASC, code ASC").
		Find(&types).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list absence types by category: %w", err)
	}
	return types, nil
}
```

#### 3. AbsenceType Repository Tests
**File**: `apps/api/internal/repository/absencetype_test.go`

```go
package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForAbsenceType(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestAbsenceType(t *testing.T, db *repository.DB, tenantID *uuid.UUID, code string, category model.AbsenceCategory) *model.AbsenceType {
	t.Helper()
	repo := repository.NewAbsenceTypeRepository(db)
	at := &model.AbsenceType{
		TenantID: tenantID,
		Code:     code,
		Name:     "Test " + code,
		Category: category,
		Portion:  model.AbsencePortionFull,
		IsActive: true,
	}
	require.NoError(t, repo.Create(context.Background(), at))
	return at
}

func TestAbsenceTypeRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	at := &model.AbsenceType{
		TenantID:        &tenant.ID,
		Code:            "U" + uuid.New().String()[:4],
		Name:            "Urlaub",
		Category:        model.AbsenceCategoryVacation,
		Portion:         model.AbsencePortionFull,
		DeductsVacation: true,
		IsActive:        true,
	}

	err := repo.Create(ctx, at)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, at.ID)
}

func TestAbsenceTypeRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	at := createTestAbsenceType(t, db, &tenant.ID, "K"+uuid.New().String()[:4], model.AbsenceCategoryIllness)

	found, err := repo.GetByID(ctx, at.ID)
	require.NoError(t, err)
	assert.Equal(t, at.ID, found.ID)
	assert.Equal(t, at.Code, found.Code)
	assert.Equal(t, model.AbsenceCategoryIllness, found.Category)
}

func TestAbsenceTypeRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAbsenceTypeNotFound)
}

func TestAbsenceTypeRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code := "S" + uuid.New().String()[:4]
	at := createTestAbsenceType(t, db, &tenant.ID, code, model.AbsenceCategorySpecial)

	found, err := repo.GetByCode(ctx, tenant.ID, code)
	require.NoError(t, err)
	assert.Equal(t, at.ID, found.ID)
}

func TestAbsenceTypeRepository_GetByCode_PrefersTenantSpecific(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code := "X" + uuid.New().String()[:4]

	// Create system type (tenant_id = NULL)
	systemType := &model.AbsenceType{
		TenantID: nil,
		Code:     code,
		Name:     "System Type",
		Category: model.AbsenceCategoryIllness,
		Portion:  model.AbsencePortionFull,
		IsSystem: true,
		IsActive: true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	// Create tenant-specific type with same code
	tenantType := &model.AbsenceType{
		TenantID: &tenant.ID,
		Code:     code,
		Name:     "Tenant Type",
		Category: model.AbsenceCategoryIllness,
		Portion:  model.AbsencePortionFull,
		IsActive: true,
	}
	require.NoError(t, repo.Create(ctx, tenantType))

	found, err := repo.GetByCode(ctx, tenant.ID, code)
	require.NoError(t, err)
	assert.Equal(t, "Tenant Type", found.Name)
}

func TestAbsenceTypeRepository_GetByCode_FallsBackToSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code := "Y" + uuid.New().String()[:4]

	// Create system type only
	systemType := &model.AbsenceType{
		TenantID: nil,
		Code:     code,
		Name:     "System Only",
		Category: model.AbsenceCategorySpecial,
		Portion:  model.AbsencePortionFull,
		IsSystem: true,
		IsActive: true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	found, err := repo.GetByCode(ctx, tenant.ID, code)
	require.NoError(t, err)
	assert.Equal(t, "System Only", found.Name)
}

func TestAbsenceTypeRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)

	_, err := repo.GetByCode(ctx, tenant.ID, "NONEXIST")
	assert.ErrorIs(t, err, repository.ErrAbsenceTypeNotFound)
}

func TestAbsenceTypeRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	at := createTestAbsenceType(t, db, &tenant.ID, "U"+uuid.New().String()[:4], model.AbsenceCategoryVacation)

	at.Name = "Updated Name"
	at.Portion = model.AbsencePortionHalf
	err := repo.Update(ctx, at)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, at.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
	assert.Equal(t, model.AbsencePortionHalf, found.Portion)
}

func TestAbsenceTypeRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	at := createTestAbsenceType(t, db, &tenant.ID, "K"+uuid.New().String()[:4], model.AbsenceCategoryIllness)

	err := repo.Delete(ctx, at.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, at.ID)
	assert.ErrorIs(t, err, repository.ErrAbsenceTypeNotFound)
}

func TestAbsenceTypeRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAbsenceTypeNotFound)
}

func TestAbsenceTypeRepository_List_IncludesSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code1 := "A" + uuid.New().String()[:4]
	code2 := "B" + uuid.New().String()[:4]

	// Create system type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: nil, Code: code1, Name: "System", Category: model.AbsenceCategoryIllness,
		Portion: model.AbsencePortionFull, IsSystem: true, IsActive: true,
	}))

	// Create tenant type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenant.ID, Code: code2, Name: "Tenant", Category: model.AbsenceCategoryVacation,
		Portion: model.AbsencePortionFull, IsActive: true,
	}))

	types, err := repo.List(ctx, tenant.ID, true)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(types), 2)

	// Verify both system and tenant types are present
	var foundSystem, foundTenant bool
	for _, at := range types {
		if at.Code == code1 {
			foundSystem = true
		}
		if at.Code == code2 {
			foundTenant = true
		}
	}
	assert.True(t, foundSystem, "should include system type")
	assert.True(t, foundTenant, "should include tenant type")
}

func TestAbsenceTypeRepository_List_ExcludesSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code1 := "C" + uuid.New().String()[:4]
	code2 := "D" + uuid.New().String()[:4]

	// Create system type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: nil, Code: code1, Name: "System", Category: model.AbsenceCategoryIllness,
		Portion: model.AbsencePortionFull, IsSystem: true, IsActive: true,
	}))

	// Create tenant type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenant.ID, Code: code2, Name: "Tenant", Category: model.AbsenceCategoryVacation,
		Portion: model.AbsencePortionFull, IsActive: true,
	}))

	types, err := repo.List(ctx, tenant.ID, false)
	require.NoError(t, err)

	for _, at := range types {
		assert.NotNil(t, at.TenantID, "should not include system types")
	}
}

func TestAbsenceTypeRepository_List_ExcludesInactive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)

	// Create active type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenant.ID, Code: "E" + uuid.New().String()[:4], Name: "Active",
		Category: model.AbsenceCategoryVacation, Portion: model.AbsencePortionFull, IsActive: true,
	}))

	// Create inactive type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenant.ID, Code: "F" + uuid.New().String()[:4], Name: "Inactive",
		Category: model.AbsenceCategoryVacation, Portion: model.AbsencePortionFull, IsActive: false,
	}))

	types, err := repo.List(ctx, tenant.ID, false)
	require.NoError(t, err)

	for _, at := range types {
		assert.True(t, at.IsActive, "should not include inactive types")
	}
}

func TestAbsenceTypeRepository_ListByCategory(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)

	createTestAbsenceType(t, db, &tenant.ID, "U"+uuid.New().String()[:4], model.AbsenceCategoryVacation)
	createTestAbsenceType(t, db, &tenant.ID, "U"+uuid.New().String()[:4], model.AbsenceCategoryVacation)
	createTestAbsenceType(t, db, &tenant.ID, "K"+uuid.New().String()[:4], model.AbsenceCategoryIllness)

	types, err := repo.ListByCategory(ctx, tenant.ID, model.AbsenceCategoryVacation)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(types), 2)
	for _, at := range types {
		assert.Equal(t, model.AbsenceCategoryVacation, at.Category)
	}
}

// Model unit tests (no DB required)

func TestAbsenceType_CreditMultiplier(t *testing.T) {
	tests := []struct {
		name     string
		portion  model.AbsencePortion
		expected float64
	}{
		{"none", model.AbsencePortionNone, 0.0},
		{"full", model.AbsencePortionFull, 1.0},
		{"half", model.AbsencePortionHalf, 0.5},
		{"unknown defaults to full", model.AbsencePortion(99), 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{Portion: tt.portion}
			assert.Equal(t, tt.expected, at.CreditMultiplier())
		})
	}
}

func TestAbsenceType_CalculateCredit(t *testing.T) {
	tests := []struct {
		name             string
		portion          model.AbsencePortion
		regelarbeitszeit int
		expected         int
	}{
		{"full 8h", model.AbsencePortionFull, 480, 480},
		{"half 8h", model.AbsencePortionHalf, 480, 240},
		{"none 8h", model.AbsencePortionNone, 480, 0},
		{"full 7.5h", model.AbsencePortionFull, 450, 450},
		{"half 7.5h", model.AbsencePortionHalf, 450, 225},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{Portion: tt.portion}
			assert.Equal(t, tt.expected, at.CalculateCredit(tt.regelarbeitszeit))
		})
	}
}

func TestAbsenceType_GetEffectiveCode(t *testing.T) {
	holidayCode := "KF"

	tests := []struct {
		name        string
		code        string
		holidayCode *string
		isHoliday   bool
		expected    string
	}{
		{"regular day, no holiday code", "K", nil, false, "K"},
		{"holiday, no holiday code", "K", nil, true, "K"},
		{"regular day, has holiday code", "K", &holidayCode, false, "K"},
		{"holiday, has holiday code", "K", &holidayCode, true, "KF"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{Code: tt.code, HolidayCode: tt.holidayCode}
			assert.Equal(t, tt.expected, at.GetEffectiveCode(tt.isHoliday))
		})
	}
}

func TestAbsenceType_IsVacationType(t *testing.T) {
	assert.True(t, (&model.AbsenceType{Category: model.AbsenceCategoryVacation}).IsVacationType())
	assert.False(t, (&model.AbsenceType{Category: model.AbsenceCategoryIllness}).IsVacationType())
}

func TestAbsenceType_IsIllnessType(t *testing.T) {
	assert.True(t, (&model.AbsenceType{Category: model.AbsenceCategoryIllness}).IsIllnessType())
	assert.False(t, (&model.AbsenceType{Category: model.AbsenceCategoryVacation}).IsIllnessType())
}
```

### Success Criteria:

#### Automated Verification:
- [x] Build succeeds: `cd apps/api && go build ./...`
- [x] Tests pass: `cd apps/api && go test -v ./internal/repository/ -run TestAbsenceType`
- [x] Lint passes: `cd apps/api && golangci-lint run ./...` (new files clean; pre-existing warnings in daily_calc.go)

## Testing Strategy

### Unit Tests (no DB):
- `CreditMultiplier()` returns 0.0, 1.0, 0.5 for all portion values
- `CalculateCredit()` correctly computes minutes * multiplier
- `GetEffectiveCode()` returns holiday code only when is_holiday=true and holiday_code is set
- `IsVacationType()` / `IsIllnessType()` category checks

### Integration Tests (with DB):
- CRUD operations (Create, GetByID, Update, Delete)
- `GetByCode` prefers tenant-specific over system types
- `GetByCode` falls back to system types when no tenant override
- `List` includes/excludes system types based on flag
- `List` excludes inactive types
- `ListByCategory` filters correctly
- Not-found error cases for GetByID, GetByCode, Delete

## References

- Research: `thoughts/shared/research/2026-01-24-NOK-133-absence-type-model-repository.md`
- Ticket plan: `thoughts/shared/plans/tickets/TICKET-075-create-absence-type-model-repository.md`
- Migration: `db/migrations/000025_create_absence_types.up.sql`
- Reference model: `apps/api/internal/model/booking.go`
- Reference repository: `apps/api/internal/repository/booking.go`
- Reference tests: `apps/api/internal/repository/booking_test.go`
