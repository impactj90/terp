# TICKET-075: Create Absence Type Model and Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 13 - Absence Types
**Dependencies**: TICKET-074

## Description

Create the AbsenceType model and repository with ZMI-compliant fields for portion, holiday code, and priority.

## ZMI Reference

> "Anteil: 0=keine Gutschrift, 1=volle Regelarbeitszeit, 2=halbe Regelarbeitszeit"
> "Kürzel am Feiertag: alternatives Kürzel bei Feiertagen"
> "Priorität: welches gewinnt wenn Feiertag + Fehltag"

## Files to Create

- `apps/api/internal/model/absencetype.go`
- `apps/api/internal/repository/absencetype.go`
- `apps/api/internal/repository/absencetype_test.go`

## Implementation

### Model

```go
package model

import (
    "github.com/google/uuid"
)

// AbsenceCategory represents the category of absence (derived from code prefix)
type AbsenceCategory string

const (
    AbsenceCategoryVacation AbsenceCategory = "vacation" // U prefix
    AbsenceCategoryIllness  AbsenceCategory = "illness"  // K prefix
    AbsenceCategorySpecial  AbsenceCategory = "special"  // S prefix
    AbsenceCategoryUnpaid   AbsenceCategory = "unpaid"   // No time credit
)

// AbsencePortion represents how much of Regelarbeitszeit to credit
// ZMI: Anteil field
type AbsencePortion int

const (
    AbsencePortionNone AbsencePortion = 0 // Sollzeit auf Null - no credit
    AbsencePortionFull AbsencePortion = 1 // Full Regelarbeitszeit
    AbsencePortionHalf AbsencePortion = 2 // Half Regelarbeitszeit
)

// AbsenceType represents an absence type definition
// ZMI Reference: Fehltage (Page 159-161)
type AbsenceType struct {
    BaseModel
    TenantID *uuid.UUID `gorm:"type:uuid;index" json:"tenant_id,omitempty"`

    // Identification
    Code        string          `gorm:"size:10;not null" json:"code"`
    Name        string          `gorm:"size:100;not null" json:"name"`
    Description *string         `gorm:"type:text" json:"description,omitempty"`
    Category    AbsenceCategory `gorm:"size:20;not null" json:"category"`

    // ZMI: Anteil - determines time credit (0=none, 1=full, 2=half)
    Portion AbsencePortion `gorm:"not null;default:1" json:"portion"`

    // ZMI: Kürzel am Feiertag - alternative code to use on holidays
    HolidayCode *string `gorm:"size:10" json:"holiday_code,omitempty"`

    // ZMI: Priorität - which wins when holiday + absence overlap (higher wins)
    Priority int `gorm:"not null;default:0" json:"priority"`

    // Behavior flags
    DeductsVacation  bool `gorm:"default:false" json:"deducts_vacation"`
    RequiresApproval bool `gorm:"default:true" json:"requires_approval"`
    RequiresDocument bool `gorm:"default:false" json:"requires_document"`

    // Display
    Color     string `gorm:"size:7;default:'#808080'" json:"color"`
    SortOrder int    `gorm:"default:0" json:"sort_order"`

    // Status
    IsSystem bool `gorm:"default:false" json:"is_system"`
    IsActive bool `gorm:"default:true" json:"is_active"`

    // Relationships
    Tenant *Tenant `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
}

func (AbsenceType) TableName() string {
    return "absence_types"
}

// CreditMultiplier returns the multiplier for Regelarbeitszeit
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

// CalculateCredit calculates the time credit for an absence
// Formula: Regelarbeitszeit * CreditMultiplier
func (at *AbsenceType) CalculateCredit(regelarbeitszeit int) int {
    return int(float64(regelarbeitszeit) * at.CreditMultiplier())
}

// IsVacationType returns true if this is a vacation-related absence
func (at *AbsenceType) IsVacationType() bool {
    return at.Category == AbsenceCategoryVacation
}

// IsIllnessType returns true if this is an illness-related absence
func (at *AbsenceType) IsIllnessType() bool {
    return at.Category == AbsenceCategoryIllness
}

// GetEffectiveCode returns the code to use, considering holidays
func (at *AbsenceType) GetEffectiveCode(isHoliday bool) string {
    if isHoliday && at.HolidayCode != nil && *at.HolidayCode != "" {
        return *at.HolidayCode
    }
    return at.Code
}
```

### Repository

```go
package repository

import (
    "context"
    "errors"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

var ErrAbsenceTypeNotFound = errors.New("absence type not found")

type AbsenceTypeRepository interface {
    Create(ctx context.Context, at *model.AbsenceType) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.AbsenceType, error)
    GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceType, error)
    Update(ctx context.Context, at *model.AbsenceType) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error)
    ListByCategory(ctx context.Context, tenantID uuid.UUID, category model.AbsenceCategory) ([]model.AbsenceType, error)
    ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error)
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
    err := r.db.WithContext(ctx).First(&at, "id = ?", id).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrAbsenceTypeNotFound
    }
    return &at, err
}

func (r *absenceTypeRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.AbsenceType, error) {
    var at model.AbsenceType
    err := r.db.WithContext(ctx).
        Where("(tenant_id = ? OR tenant_id IS NULL) AND code = ?", tenantID, code).
        Order("tenant_id DESC NULLS LAST"). // Prefer tenant-specific over system
        First(&at).Error
    if errors.Is(err, gorm.ErrRecordNotFound) {
        return nil, ErrAbsenceTypeNotFound
    }
    return &at, err
}

func (r *absenceTypeRepository) Update(ctx context.Context, at *model.AbsenceType) error {
    return r.db.WithContext(ctx).Save(at).Error
}

func (r *absenceTypeRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.AbsenceType{}, "id = ?", id).Error
}

func (r *absenceTypeRepository) List(ctx context.Context, tenantID uuid.UUID, includeSystem bool) ([]model.AbsenceType, error) {
    var types []model.AbsenceType
    query := r.db.WithContext(ctx).Where("is_active = ?", true)

    if includeSystem {
        query = query.Where("tenant_id = ? OR tenant_id IS NULL", tenantID)
    } else {
        query = query.Where("tenant_id = ?", tenantID)
    }

    err := query.Order("sort_order ASC, code ASC").Find(&types).Error
    return types, err
}

func (r *absenceTypeRepository) ListByCategory(ctx context.Context, tenantID uuid.UUID, category model.AbsenceCategory) ([]model.AbsenceType, error) {
    var types []model.AbsenceType
    err := r.db.WithContext(ctx).
        Where("(tenant_id = ? OR tenant_id IS NULL) AND category = ? AND is_active = ?", tenantID, category, true).
        Order("sort_order ASC").
        Find(&types).Error
    return types, err
}

func (r *absenceTypeRepository) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.AbsenceType, error) {
    return r.List(ctx, tenantID, true)
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

    tenantID := testutil.CreateTestTenant(t, db)
    absenceType := &model.AbsenceType{
        TenantID:        &tenantID,
        Code:            "U",
        Name:            "Urlaub",
        Category:        model.AbsenceCategoryVacation,
        Portion:         model.AbsencePortionFull,
        DeductsVacation: true,
        IsActive:        true,
    }

    err := repo.Create(ctx, absenceType)
    require.NoError(t, err)
    assert.NotEqual(t, uuid.Nil, absenceType.ID)
}

func TestAbsenceTypeRepository_GetByCode_PrefersTenantSpecific(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAbsenceTypeRepository(db)
    ctx := context.Background()

    tenantID := testutil.CreateTestTenant(t, db)

    // Create system type
    systemType := &model.AbsenceType{
        TenantID: nil,
        Code:     "K",
        Name:     "Krankheit (System)",
        Category: model.AbsenceCategoryIllness,
        Portion:  model.AbsencePortionFull,
        IsSystem: true,
    }
    repo.Create(ctx, systemType)

    // Create tenant-specific type with same code
    tenantType := &model.AbsenceType{
        TenantID: &tenantID,
        Code:     "K",
        Name:     "Krankheit (Custom)",
        Category: model.AbsenceCategoryIllness,
        Portion:  model.AbsencePortionFull,
        IsSystem: false,
    }
    repo.Create(ctx, tenantType)

    // Should prefer tenant-specific over system
    found, err := repo.GetByCode(ctx, tenantID, "K")
    require.NoError(t, err)
    assert.Equal(t, "Krankheit (Custom)", found.Name)
}

func TestAbsenceType_CreditMultiplier(t *testing.T) {
    tests := []struct {
        name     string
        portion  model.AbsencePortion
        expected float64
    }{
        {"none", model.AbsencePortionNone, 0.0},
        {"full", model.AbsencePortionFull, 1.0},
        {"half", model.AbsencePortionHalf, 0.5},
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
        name            string
        portion         model.AbsencePortion
        regelarbeitszeit int
        expected        int
    }{
        {"full - 8 hours", model.AbsencePortionFull, 480, 480},
        {"half - 8 hours", model.AbsencePortionHalf, 480, 240},
        {"none - 8 hours", model.AbsencePortionNone, 480, 0},
        {"full - 7.5 hours", model.AbsencePortionFull, 450, 450},
        {"half - 7.5 hours", model.AbsencePortionHalf, 450, 225},
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
        {"no holiday code, not holiday", "K", nil, false, "K"},
        {"no holiday code, is holiday", "K", nil, true, "K"},
        {"has holiday code, not holiday", "K", &holidayCode, false, "K"},
        {"has holiday code, is holiday", "K", &holidayCode, true, "KF"},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            at := &model.AbsenceType{
                Code:        tt.code,
                HolidayCode: tt.holidayCode,
            }
            assert.Equal(t, tt.expected, at.GetEffectiveCode(tt.isHoliday))
        })
    }
}

func TestAbsenceTypeRepository_ListByCategory(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAbsenceTypeRepository(db)
    ctx := context.Background()

    tenantID := testutil.CreateTestTenant(t, db)

    // Create various absence types
    repo.Create(ctx, &model.AbsenceType{
        TenantID: &tenantID,
        Code:     "U",
        Name:     "Urlaub",
        Category: model.AbsenceCategoryVacation,
        Portion:  model.AbsencePortionFull,
        IsActive: true,
    })
    repo.Create(ctx, &model.AbsenceType{
        TenantID: &tenantID,
        Code:     "K",
        Name:     "Krankheit",
        Category: model.AbsenceCategoryIllness,
        Portion:  model.AbsencePortionFull,
        IsActive: true,
    })
    repo.Create(ctx, &model.AbsenceType{
        TenantID: &tenantID,
        Code:     "UH",
        Name:     "Urlaub halber Tag",
        Category: model.AbsenceCategoryVacation,
        Portion:  model.AbsencePortionHalf,
        IsActive: true,
    })

    // List vacation types only
    vacationTypes, err := repo.ListByCategory(ctx, tenantID, model.AbsenceCategoryVacation)
    require.NoError(t, err)
    assert.Len(t, vacationTypes, 2)
    for _, at := range vacationTypes {
        assert.Equal(t, model.AbsenceCategoryVacation, at.Category)
    }
}

func TestAbsenceTypeRepository_Delete(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAbsenceTypeRepository(db)
    ctx := context.Background()

    tenantID := testutil.CreateTestTenant(t, db)
    absenceType := &model.AbsenceType{
        TenantID: &tenantID,
        Code:     "U",
        Name:     "Urlaub",
        Category: model.AbsenceCategoryVacation,
        Portion:  model.AbsencePortionFull,
    }
    repo.Create(ctx, absenceType)

    err := repo.Delete(ctx, absenceType.ID)
    require.NoError(t, err)

    _, err = repo.GetByID(ctx, absenceType.ID)
    assert.ErrorIs(t, err, ErrAbsenceTypeNotFound)
}
```

## ZMI Compliance

| ZMI Concept | Implementation |
|-------------|----------------|
| Anteil (Portion) | `Portion` field with 0/1/2 values |
| Kürzel am Feiertag | `HolidayCode` field |
| Priorität | `Priority` field |
| Credit calculation | `CalculateCredit()` method |
| Holiday behavior | `GetEffectiveCode()` method |

## Acceptance Criteria

- [ ] Model has all ZMI fields (portion, holiday_code, priority)
- [ ] `CreditMultiplier()` returns correct values (0.0, 1.0, 0.5)
- [ ] `CalculateCredit()` computes Regelarbeitszeit * multiplier
- [ ] `GetEffectiveCode()` returns holiday_code when applicable
- [ ] Repository supports listing by category
- [ ] System types accessible alongside tenant types
- [ ] `make test` passes with all unit tests
- [ ] Tests cover all ZMI-specific functionality
