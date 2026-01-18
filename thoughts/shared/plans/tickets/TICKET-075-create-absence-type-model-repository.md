# TICKET-075: Create Absence Type Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 18 - Absence Types
**Dependencies**: TICKET-074

## Description

Create the AbsenceType model and repository.

## Files to Create

- `apps/api/internal/model/absencetype.go`
- `apps/api/internal/repository/absencetype.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type AbsenceCategory string

const (
    AbsenceCategoryVacation AbsenceCategory = "vacation"
    AbsenceCategoryIllness  AbsenceCategory = "illness"
    AbsenceCategorySpecial  AbsenceCategory = "special"
    AbsenceCategoryUnpaid   AbsenceCategory = "unpaid"
)

type AbsenceType struct {
    ID            uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID      *uuid.UUID      `gorm:"type:uuid;index" json:"tenant_id,omitempty"`
    Code          string          `gorm:"type:varchar(10);not null" json:"code"`
    Name          string          `gorm:"type:varchar(100);not null" json:"name"`
    Category      AbsenceCategory `gorm:"type:varchar(20);not null" json:"category"`
    CreditsHours  bool            `gorm:"default:true" json:"credits_hours"`
    DeductsVacation bool          `gorm:"default:false" json:"deducts_vacation"`
    IsSystem      bool            `gorm:"default:false" json:"is_system"`
    IsActive      bool            `gorm:"default:true" json:"is_active"`
    Color         string          `gorm:"type:varchar(7);default:'#808080'" json:"color"`
    SortOrder     int             `gorm:"default:0" json:"sort_order"`
    CreatedAt     time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt     time.Time       `gorm:"default:now()" json:"updated_at"`
}

func (AbsenceType) TableName() string {
    return "absence_types"
}

// IsVacation returns true if this absence type deducts vacation
func (at *AbsenceType) IsVacation() bool {
    return at.DeductsVacation
}
```

### Repository

```go
type AbsenceTypeRepository interface {
    Create(ctx context.Context, at *model.AbsenceType) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error)
    GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.AbsenceType, error)
    Update(ctx context.Context, at *model.AbsenceType) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error)
    ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error)
    GetSystemTypes(ctx context.Context) ([]model.AbsenceType, error)
}

func (r *absenceTypeRepository) ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error) {
    var types []model.AbsenceType
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? OR tenant_id IS NULL", tenantID).
        Where("is_active = true").
        Order("sort_order ASC, code ASC").
        Find(&types).Error
    return types, err
}

func (r *absenceTypeRepository) GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.AbsenceType, error) {
    var at model.AbsenceType
    query := r.db.WithContext(ctx).Where("code = ?", code)
    if tenantID != nil {
        query = query.Where("tenant_id = ? OR tenant_id IS NULL", *tenantID)
    } else {
        query = query.Where("tenant_id IS NULL")
    }
    err := query.Order("tenant_id DESC NULLS LAST").First(&at).Error // Prefer tenant-specific over system
    return &at, err
}
```

## Repository Implementation

```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"terp/apps/api/internal/model"
)

type AbsenceTypeRepository interface {
	Create(ctx context.Context, at *model.AbsenceType) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error)
	GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.AbsenceType, error)
	Update(ctx context.Context, at *model.AbsenceType) error
	Delete(ctx context.Context, id uuid.UUID) error
	List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error)
	ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error)
	GetSystemTypes(ctx context.Context) ([]model.AbsenceType, error)
}

type absenceTypeRepository struct {
	db *gorm.DB
}

func NewAbsenceTypeRepository(db *gorm.DB) AbsenceTypeRepository {
	return &absenceTypeRepository{db: db}
}

func (r *absenceTypeRepository) Create(ctx context.Context, at *model.AbsenceType) error {
	return r.db.WithContext(ctx).Create(at).Error
}

func (r *absenceTypeRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error) {
	var at model.AbsenceType
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&at).Error
	return &at, err
}

func (r *absenceTypeRepository) Update(ctx context.Context, at *model.AbsenceType) error {
	return r.db.WithContext(ctx).Save(at).Error
}

func (r *absenceTypeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&model.AbsenceType{}, "id = ?", id).Error
}

func (r *absenceTypeRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error) {
	var types []model.AbsenceType
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND is_active = true", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&types).Error
	return types, err
}

func (r *absenceTypeRepository) GetSystemTypes(ctx context.Context) ([]model.AbsenceType, error) {
	var types []model.AbsenceType
	err := r.db.WithContext(ctx).
		Where("tenant_id IS NULL AND is_active = true").
		Order("sort_order ASC, code ASC").
		Find(&types).Error
	return types, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/absencetype_test.go`

```go
package repository

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"terp/apps/api/internal/model"
	"terp/apps/api/internal/testutil"
)

func TestAbsenceTypeRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	absenceType := &model.AbsenceType{
		TenantID:        &tenantID,
		Code:            "VAC",
		Name:            "Vacation",
		Category:        model.AbsenceCategoryVacation,
		DeductsVacation: true,
		IsActive:        true,
	}

	err := repo.Create(ctx, absenceType)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, absenceType.ID)
}

func TestAbsenceTypeRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	absenceType := &model.AbsenceType{
		TenantID: &tenantID,
		Code:     "VAC",
		Name:     "Vacation",
		Category: model.AbsenceCategoryVacation,
	}
	repo.Create(ctx, absenceType)

	found, err := repo.GetByID(ctx, absenceType.ID)
	require.NoError(t, err)
	assert.Equal(t, absenceType.ID, found.ID)
	assert.Equal(t, absenceType.Code, found.Code)
}

func TestAbsenceTypeRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceTypeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.Error(t, err)
}

func TestAbsenceTypeRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create system type
	systemType := &model.AbsenceType{
		TenantID: nil,
		Code:     "SICK",
		Name:     "Sick Leave (System)",
		Category: model.AbsenceCategoryIllness,
		IsSystem: true,
	}
	repo.Create(ctx, systemType)

	// Create tenant-specific type with same code
	tenantType := &model.AbsenceType{
		TenantID: &tenantID,
		Code:     "SICK",
		Name:     "Sick Leave (Custom)",
		Category: model.AbsenceCategoryIllness,
		IsSystem: false,
	}
	repo.Create(ctx, tenantType)

	// Should prefer tenant-specific over system
	found, err := repo.GetByCode(ctx, &tenantID, "SICK")
	require.NoError(t, err)
	assert.Equal(t, "Sick Leave (Custom)", found.Name)
}

func TestAbsenceTypeRepository_ListWithSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()

	// Create system types
	repo.Create(ctx, &model.AbsenceType{
		TenantID: nil,
		Code:     "SICK",
		Name:     "Sick",
		Category: model.AbsenceCategoryIllness,
		IsSystem: true,
		IsActive: true,
	})

	// Create tenant types
	repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenantID,
		Code:     "VAC",
		Name:     "Vacation",
		Category: model.AbsenceCategoryVacation,
		IsActive: true,
	})

	types, err := repo.ListWithSystem(ctx, tenantID)
	require.NoError(t, err)
	assert.Len(t, types, 2)
}

func TestAbsenceTypeRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	absenceType := &model.AbsenceType{
		TenantID: &tenantID,
		Code:     "VAC",
		Name:     "Original Name",
		Category: model.AbsenceCategoryVacation,
	}
	repo.Create(ctx, absenceType)

	absenceType.Name = "Updated Name"
	err := repo.Update(ctx, absenceType)
	require.NoError(t, err)

	found, _ := repo.GetByID(ctx, absenceType.ID)
	assert.Equal(t, "Updated Name", found.Name)
}

func TestAbsenceTypeRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenantID := uuid.New()
	absenceType := &model.AbsenceType{
		TenantID: &tenantID,
		Code:     "VAC",
		Name:     "Vacation",
		Category: model.AbsenceCategoryVacation,
	}
	repo.Create(ctx, absenceType)

	err := repo.Delete(ctx, absenceType.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, absenceType.ID)
	assert.Error(t, err)
}

func TestAbsenceType_IsVacation(t *testing.T) {
	at := &model.AbsenceType{
		DeductsVacation: true,
	}
	assert.True(t, at.IsVacation())

	at2 := &model.AbsenceType{
		DeductsVacation: false,
	}
	assert.False(t, at2.IsVacation())
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] `make lint` passes
- [ ] Unit tests cover all CRUD operations
- [ ] Unit tests with test database
- [ ] Tests cover error cases (not found)
- [ ] ListWithSystem returns both tenant and system types
- [ ] GetByCode prefers tenant-specific over system type
- [ ] Category enum defined
