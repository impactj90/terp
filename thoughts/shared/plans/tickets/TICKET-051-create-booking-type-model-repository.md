# TICKET-051: Create Booking Type Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 9 - Booking Types
**Dependencies**: TICKET-050

## Description

Create the BookingType model and repository.

## Files to Create

- `apps/api/internal/model/bookingtype.go`
- `apps/api/internal/repository/bookingtype.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type BookingCategory string

const (
    BookingCategoryCome       BookingCategory = "come"
    BookingCategoryGo         BookingCategory = "go"
    BookingCategoryBreakStart BookingCategory = "break_start"
    BookingCategoryBreakEnd   BookingCategory = "break_end"
    BookingCategoryManual     BookingCategory = "manual"
)

type BookingType struct {
    ID        uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID  *uuid.UUID      `gorm:"type:uuid;index" json:"tenant_id,omitempty"` // NULL for system
    Code      string          `gorm:"type:varchar(10);not null" json:"code"`
    Name      string          `gorm:"type:varchar(100);not null" json:"name"`
    Category  BookingCategory `gorm:"type:varchar(20);not null" json:"category"`
    IsSystem  bool            `gorm:"default:false" json:"is_system"`
    IsActive  bool            `gorm:"default:true" json:"is_active"`
    Color     string          `gorm:"type:varchar(7);default:'#808080'" json:"color"`
    SortOrder int             `gorm:"default:0" json:"sort_order"`
    CreatedAt time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time       `gorm:"default:now()" json:"updated_at"`
}

func (BookingType) TableName() string {
    return "booking_types"
}

// IsComeGo returns true if this is a come or go booking type
func (bt *BookingType) IsComeGo() bool {
    return bt.Category == BookingCategoryCome || bt.Category == BookingCategoryGo
}

// IsBreak returns true if this is a break start or end booking type
func (bt *BookingType) IsBreak() bool {
    return bt.Category == BookingCategoryBreakStart || bt.Category == BookingCategoryBreakEnd
}
```

### Repository

```go
type BookingTypeRepository interface {
    Create(ctx context.Context, bt *model.BookingType) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.BookingType, error)
    GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.BookingType, error)
    Update(ctx context.Context, bt *model.BookingType) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error)
    ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error)
    GetSystemTypes(ctx context.Context) ([]model.BookingType, error)
    GetByCategory(ctx context.Context, tenantID uuid.UUID, category model.BookingCategory) ([]model.BookingType, error)
}

func (r *bookingTypeRepository) ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.BookingType, error) {
    var types []model.BookingType
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? OR tenant_id IS NULL", tenantID).
        Where("is_active = true").
        Order("sort_order ASC, code ASC").
        Find(&types).Error
    return types, err
}

func (r *bookingTypeRepository) GetSystemTypes(ctx context.Context) ([]model.BookingType, error) {
    var types []model.BookingType
    err := r.db.WithContext(ctx).
        Where("is_system = true").
        Order("sort_order ASC").
        Find(&types).Error
    return types, err
}

func (r *bookingTypeRepository) GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.BookingType, error) {
    var bt model.BookingType
    query := r.db.WithContext(ctx).Where("code = ?", code)
    if tenantID != nil {
        query = query.Where("tenant_id = ? OR tenant_id IS NULL", *tenantID)
    } else {
        query = query.Where("tenant_id IS NULL")
    }
    err := query.First(&bt).Error
    return &bt, err
}
```

## Acceptance Criteria

- [ ] Compiles without errors
- [ ] `make lint` passes
- [ ] ListWithSystem returns both tenant and system types
- [ ] GetByCode handles NULL tenant_id for system types
- [ ] Category enum defined
