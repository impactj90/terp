# Implementation Plan: ZMI-TICKET-010 - Booking Types and Booking Type Groups

## Overview

Enhance the existing booking type system with:
1. New fields on booking types: `category`, `account_id`, `requires_reason`
2. Booking reasons: new entity linked to booking types
3. Booking type groups: grouping entity with ordered membership (controls terminal availability)
4. Dev seed data updates for standard booking types (A1/A2, PA/PE, DA/DE)
5. Full CRUD API endpoints for all new entities

## Dependencies

- ZMI-TICKET-009 (Accounts and Groups) must be complete -- needed for `account_id` FK on booking types.
- Existing booking types infrastructure (migration 000021, model, repo, service, handler).

---

## Phase 1: Database Migration

### File: `db/migrations/000044_booking_type_enhancements.up.sql`

```sql
-- =============================================================
-- Phase 1a: Add new columns to booking_types
-- =============================================================
ALTER TABLE booking_types
    ADD COLUMN category VARCHAR(30) NOT NULL DEFAULT 'work',
    ADD COLUMN account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    ADD COLUMN requires_reason BOOLEAN DEFAULT false;

CREATE INDEX idx_booking_types_account ON booking_types(account_id);
CREATE INDEX idx_booking_types_category ON booking_types(category);

COMMENT ON COLUMN booking_types.category IS 'Category: work, break, business_trip, other';
COMMENT ON COLUMN booking_types.account_id IS 'Optional linked account for time calculations';
COMMENT ON COLUMN booking_types.requires_reason IS 'Whether bookings of this type must include a reason code';

-- Update existing system seed data with categories
UPDATE booking_types SET category = 'work' WHERE code IN ('COME', 'GO');
UPDATE booking_types SET category = 'break' WHERE code IN ('BREAK_START', 'BREAK_END');

-- =============================================================
-- Phase 1b: Create booking_reasons table
-- =============================================================
CREATE TABLE booking_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, booking_type_id, code)
);

CREATE INDEX idx_booking_reasons_tenant ON booking_reasons(tenant_id);
CREATE INDEX idx_booking_reasons_booking_type ON booking_reasons(booking_type_id);

CREATE TRIGGER update_booking_reasons_updated_at
    BEFORE UPDATE ON booking_reasons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE booking_reasons IS 'Reasons that can be selected when creating bookings of a specific type';

-- =============================================================
-- Phase 1c: Create booking_type_groups table
-- =============================================================
CREATE TABLE booking_type_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);

CREATE INDEX idx_booking_type_groups_tenant ON booking_type_groups(tenant_id);

CREATE TRIGGER update_booking_type_groups_updated_at
    BEFORE UPDATE ON booking_type_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE booking_type_groups IS 'Groups of booking types controlling terminal availability';

-- =============================================================
-- Phase 1d: Create booking_type_group_members join table
-- =============================================================
CREATE TABLE booking_type_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES booking_type_groups(id) ON DELETE CASCADE,
    booking_type_id UUID NOT NULL REFERENCES booking_types(id) ON DELETE CASCADE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, booking_type_id)
);

CREATE INDEX idx_btgm_group ON booking_type_group_members(group_id);
CREATE INDEX idx_btgm_booking_type ON booking_type_group_members(booking_type_id);

COMMENT ON TABLE booking_type_group_members IS 'Join table linking booking types to groups with sort ordering';
```

### File: `db/migrations/000044_booking_type_enhancements.down.sql`

```sql
-- Drop join table first (depends on groups and booking_types)
DROP TABLE IF EXISTS booking_type_group_members;

-- Drop booking type groups
DROP TABLE IF EXISTS booking_type_groups;

-- Drop booking reasons
DROP TABLE IF EXISTS booking_reasons;

-- Remove new columns from booking_types
ALTER TABLE booking_types
    DROP COLUMN IF EXISTS requires_reason,
    DROP COLUMN IF EXISTS account_id,
    DROP COLUMN IF EXISTS category;
```

### Verification
- Run `make migrate-up` and confirm migration applies cleanly
- Run `make migrate-down` and then `make migrate-up` again to confirm reversibility
- Check that existing booking_types data still works with new default `category = 'work'`

---

## Phase 2: GORM Models

### File: `apps/api/internal/model/bookingtype.go` (MODIFY)

Add the `BookingCategory` type and new fields to `BookingType` struct:

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

type BookingDirection string

const (
	BookingDirectionIn  BookingDirection = "in"
	BookingDirectionOut BookingDirection = "out"
)

type BookingCategory string

const (
	BookingCategoryWork         BookingCategory = "work"
	BookingCategoryBreak        BookingCategory = "break"
	BookingCategoryBusinessTrip BookingCategory = "business_trip"
	BookingCategoryOther        BookingCategory = "other"
)

type BookingType struct {
	ID             uuid.UUID        `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID       *uuid.UUID       `gorm:"type:uuid;index" json:"tenant_id,omitempty"` // NULL for system types
	Code           string           `gorm:"type:varchar(20);not null" json:"code"`
	Name           string           `gorm:"type:varchar(255);not null" json:"name"`
	Description    *string          `gorm:"type:text" json:"description,omitempty"`
	Direction      BookingDirection `gorm:"type:varchar(10);not null" json:"direction"`
	Category       BookingCategory  `gorm:"type:varchar(30);not null;default:'work'" json:"category"`
	AccountID      *uuid.UUID       `gorm:"type:uuid;index" json:"account_id,omitempty"`
	RequiresReason bool             `gorm:"default:false" json:"requires_reason"`
	UsageCount     int              `gorm:"-" json:"usage_count"`
	IsSystem       bool             `gorm:"default:false" json:"is_system"`
	IsActive       bool             `gorm:"default:true" json:"is_active"`
	CreatedAt      time.Time        `gorm:"default:now()" json:"created_at"`
	UpdatedAt      time.Time        `gorm:"default:now()" json:"updated_at"`
}

func (BookingType) TableName() string {
	return "booking_types"
}

// IsInbound returns true if this is an inbound booking type (arrival)
func (bt *BookingType) IsInbound() bool {
	return bt.Direction == BookingDirectionIn
}

// IsOutbound returns true if this is an outbound booking type (departure)
func (bt *BookingType) IsOutbound() bool {
	return bt.Direction == BookingDirectionOut
}
```

Key changes:
- Add `BookingCategory` type with constants
- Add `Category`, `AccountID`, `RequiresReason` fields to `BookingType`

### File: `apps/api/internal/model/bookingreason.go` (NEW)

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// BookingReason represents a reason that can be selected when creating bookings.
type BookingReason struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID      uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	BookingTypeID uuid.UUID `gorm:"type:uuid;not null;index" json:"booking_type_id"`
	Code          string    `gorm:"type:varchar(50);not null" json:"code"`
	Label         string    `gorm:"type:varchar(255);not null" json:"label"`
	IsActive      bool      `gorm:"default:true" json:"is_active"`
	SortOrder     int       `gorm:"default:0" json:"sort_order"`
	CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt     time.Time `gorm:"default:now()" json:"updated_at"`
}

func (BookingReason) TableName() string {
	return "booking_reasons"
}
```

### File: `apps/api/internal/model/bookingtypegroup.go` (NEW)

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

// BookingTypeGroup represents a group of booking types that controls terminal availability.
type BookingTypeGroup struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(50);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt   time.Time `gorm:"default:now()" json:"updated_at"`
}

func (BookingTypeGroup) TableName() string {
	return "booking_type_groups"
}

// BookingTypeGroupMember represents membership of a booking type in a group.
type BookingTypeGroupMember struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID       uuid.UUID `gorm:"type:uuid;not null;index" json:"group_id"`
	BookingTypeID uuid.UUID `gorm:"type:uuid;not null;index" json:"booking_type_id"`
	SortOrder     int       `gorm:"default:0" json:"sort_order"`
	CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`
}

func (BookingTypeGroupMember) TableName() string {
	return "booking_type_group_members"
}
```

### Verification
- `cd apps/api && go build ./...` should compile cleanly

---

## Phase 3: Repository Layer

### File: `apps/api/internal/repository/bookingtype.go` (MODIFY)

No changes needed to existing methods -- the new columns will be automatically included by GORM since they are defined on the model struct. The existing `Create`, `GetByID`, `Update`, `List*`, etc. methods will pick up the new fields transparently.

### File: `apps/api/internal/repository/bookingreason.go` (NEW)

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

var ErrBookingReasonNotFound = errors.New("booking reason not found")

type BookingReasonRepository struct {
	db *DB
}

func NewBookingReasonRepository(db *DB) *BookingReasonRepository {
	return &BookingReasonRepository{db: db}
}

func (r *BookingReasonRepository) Create(ctx context.Context, br *model.BookingReason) error {
	return r.db.GORM.WithContext(ctx).Create(br).Error
}

func (r *BookingReasonRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingReason, error) {
	var br model.BookingReason
	err := r.db.GORM.WithContext(ctx).First(&br, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingReasonNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking reason: %w", err)
	}
	return &br, nil
}

func (r *BookingReasonRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID, code string) (*model.BookingReason, error) {
	var br model.BookingReason
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND booking_type_id = ? AND code = ?", tenantID, bookingTypeID, code).
		First(&br).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingReasonNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking reason by code: %w", err)
	}
	return &br, nil
}

func (r *BookingReasonRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingReason, error) {
	var reasons []model.BookingReason
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("sort_order ASC, code ASC").
		Find(&reasons).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list booking reasons: %w", err)
	}
	return reasons, nil
}

func (r *BookingReasonRepository) ListByBookingType(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID) ([]model.BookingReason, error) {
	var reasons []model.BookingReason
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND booking_type_id = ?", tenantID, bookingTypeID).
		Order("sort_order ASC, code ASC").
		Find(&reasons).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list booking reasons by type: %w", err)
	}
	return reasons, nil
}

func (r *BookingReasonRepository) Update(ctx context.Context, br *model.BookingReason) error {
	return r.db.GORM.WithContext(ctx).Save(br).Error
}

func (r *BookingReasonRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.BookingReason{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete booking reason: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingReasonNotFound
	}
	return nil
}
```

### File: `apps/api/internal/repository/bookingtypegroup.go` (NEW)

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

var ErrBookingTypeGroupNotFound = errors.New("booking type group not found")

type BookingTypeGroupRepository struct {
	db *DB
}

func NewBookingTypeGroupRepository(db *DB) *BookingTypeGroupRepository {
	return &BookingTypeGroupRepository{db: db}
}

func (r *BookingTypeGroupRepository) Create(ctx context.Context, g *model.BookingTypeGroup) error {
	return r.db.GORM.WithContext(ctx).Create(g).Error
}

func (r *BookingTypeGroupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingTypeGroup, error) {
	var g model.BookingTypeGroup
	err := r.db.GORM.WithContext(ctx).First(&g, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingTypeGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking type group: %w", err)
	}
	return &g, nil
}

func (r *BookingTypeGroupRepository) GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.BookingTypeGroup, error) {
	var g model.BookingTypeGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ? AND code = ?", tenantID, code).
		First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBookingTypeGroupNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get booking type group by code: %w", err)
	}
	return &g, nil
}

func (r *BookingTypeGroupRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingTypeGroup, error) {
	var groups []model.BookingTypeGroup
	err := r.db.GORM.WithContext(ctx).
		Where("tenant_id = ?", tenantID).
		Order("code ASC").
		Find(&groups).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list booking type groups: %w", err)
	}
	return groups, nil
}

func (r *BookingTypeGroupRepository) Update(ctx context.Context, g *model.BookingTypeGroup) error {
	return r.db.GORM.WithContext(ctx).Save(g).Error
}

func (r *BookingTypeGroupRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).Delete(&model.BookingTypeGroup{}, "id = ?", id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete booking type group: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrBookingTypeGroupNotFound
	}
	return nil
}

// --- Group Members ---

func (r *BookingTypeGroupRepository) AddMember(ctx context.Context, member *model.BookingTypeGroupMember) error {
	return r.db.GORM.WithContext(ctx).Create(member).Error
}

func (r *BookingTypeGroupRepository) RemoveMember(ctx context.Context, groupID uuid.UUID, bookingTypeID uuid.UUID) error {
	result := r.db.GORM.WithContext(ctx).
		Delete(&model.BookingTypeGroupMember{}, "group_id = ? AND booking_type_id = ?", groupID, bookingTypeID)
	if result.Error != nil {
		return fmt.Errorf("failed to remove group member: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("member not found in group")
	}
	return nil
}

func (r *BookingTypeGroupRepository) ListMembers(ctx context.Context, groupID uuid.UUID) ([]model.BookingTypeGroupMember, error) {
	var members []model.BookingTypeGroupMember
	err := r.db.GORM.WithContext(ctx).
		Where("group_id = ?", groupID).
		Order("sort_order ASC").
		Find(&members).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list group members: %w", err)
	}
	return members, nil
}

func (r *BookingTypeGroupRepository) ListMemberBookingTypes(ctx context.Context, groupID uuid.UUID) ([]model.BookingType, error) {
	var types []model.BookingType
	err := r.db.GORM.WithContext(ctx).
		Table("booking_types").
		Joins("INNER JOIN booking_type_group_members ON booking_type_group_members.booking_type_id = booking_types.id").
		Where("booking_type_group_members.group_id = ?", groupID).
		Order("booking_type_group_members.sort_order ASC").
		Find(&types).Error
	if err != nil {
		return nil, fmt.Errorf("failed to list member booking types: %w", err)
	}
	return types, nil
}

func (r *BookingTypeGroupRepository) SetMembers(ctx context.Context, groupID uuid.UUID, members []model.BookingTypeGroupMember) error {
	// Delete existing members
	if err := r.db.GORM.WithContext(ctx).
		Delete(&model.BookingTypeGroupMember{}, "group_id = ?", groupID).Error; err != nil {
		return fmt.Errorf("failed to clear group members: %w", err)
	}
	// Insert new members
	if len(members) > 0 {
		for i := range members {
			members[i].GroupID = groupID
		}
		if err := r.db.GORM.WithContext(ctx).Create(&members).Error; err != nil {
			return fmt.Errorf("failed to set group members: %w", err)
		}
	}
	return nil
}
```

### Verification
- `cd apps/api && go build ./...` compiles
- Check that existing booking type tests still pass: `cd apps/api && go test -v ./internal/service/... -run TestBookingType`

---

## Phase 4: Service Layer

### File: `apps/api/internal/service/bookingtype.go` (MODIFY)

Add the new fields to `CreateBookingTypeInput` and `UpdateBookingTypeInput`. Update service methods accordingly.

Changes to make:

1. Add new error sentinels:
```go
var (
	// ... existing errors ...
	ErrInvalidCategory = errors.New("invalid category (must be 'work', 'break', 'business_trip', or 'other')")
)
```

2. Update `CreateBookingTypeInput`:
```go
type CreateBookingTypeInput struct {
	TenantID       uuid.UUID
	Code           string
	Name           string
	Description    *string
	Direction      string
	Category       string  // new
	AccountID      *uuid.UUID // new
	RequiresReason bool    // new
}
```

3. Update `UpdateBookingTypeInput`:
```go
type UpdateBookingTypeInput struct {
	Name           *string
	Description    *string
	IsActive       *bool
	Category       *string    // new
	AccountID      *uuid.UUID // new -- use double pointer **uuid.UUID or use a separate flag. Simpler: use *uuid.UUID where nil means "don't change", uuid.Nil means "clear it"
	RequiresReason *bool      // new
}
```

4. Update `Create` method to validate category and set new fields:
```go
func (s *BookingTypeService) Create(ctx context.Context, input CreateBookingTypeInput) (*model.BookingType, error) {
	// ... existing validation ...

	// Validate category (default to "work" if empty)
	category := strings.TrimSpace(input.Category)
	if category == "" {
		category = string(model.BookingCategoryWork)
	}
	if !isValidCategory(category) {
		return nil, ErrInvalidCategory
	}

	bt := &model.BookingType{
		TenantID:       &input.TenantID,
		Code:           code,
		Name:           name,
		Description:    input.Description,
		Direction:      model.BookingDirection(direction),
		Category:       model.BookingCategory(category),
		AccountID:      input.AccountID,
		RequiresReason: input.RequiresReason,
		IsSystem:       false,
		IsActive:       true,
	}
	// ... rest unchanged ...
}

func isValidCategory(c string) bool {
	switch model.BookingCategory(c) {
	case model.BookingCategoryWork, model.BookingCategoryBreak,
		model.BookingCategoryBusinessTrip, model.BookingCategoryOther:
		return true
	}
	return false
}
```

5. Update `Update` method to handle new fields:
```go
func (s *BookingTypeService) Update(ctx context.Context, id uuid.UUID, tenantID uuid.UUID, input UpdateBookingTypeInput) (*model.BookingType, error) {
	// ... existing code ...

	// Handle new fields
	if input.Category != nil {
		cat := strings.TrimSpace(*input.Category)
		if !isValidCategory(cat) {
			return nil, ErrInvalidCategory
		}
		bt.Category = model.BookingCategory(cat)
	}
	if input.AccountID != nil {
		bt.AccountID = input.AccountID
	}
	if input.RequiresReason != nil {
		bt.RequiresReason = *input.RequiresReason
	}

	// ... rest unchanged ...
}
```

### File: `apps/api/internal/service/bookingreason.go` (NEW)

```go
package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrBookingReasonNotFound     = errors.New("booking reason not found")
	ErrBookingReasonCodeRequired = errors.New("booking reason code is required")
	ErrBookingReasonLabelReq     = errors.New("booking reason label is required")
	ErrBookingReasonCodeExists   = errors.New("booking reason code already exists for this booking type")
	ErrBookingReasonTypeRequired = errors.New("booking type ID is required for booking reason")
)

type bookingReasonRepository interface {
	Create(ctx context.Context, br *model.BookingReason) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.BookingReason, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID, code string) (*model.BookingReason, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingReason, error)
	ListByBookingType(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID) ([]model.BookingReason, error)
	Update(ctx context.Context, br *model.BookingReason) error
	Delete(ctx context.Context, id uuid.UUID) error
}

type BookingReasonService struct {
	repo bookingReasonRepository
}

func NewBookingReasonService(repo bookingReasonRepository) *BookingReasonService {
	return &BookingReasonService{repo: repo}
}

type CreateBookingReasonInput struct {
	TenantID      uuid.UUID
	BookingTypeID uuid.UUID
	Code          string
	Label         string
	SortOrder     int
}

func (s *BookingReasonService) Create(ctx context.Context, input CreateBookingReasonInput) (*model.BookingReason, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrBookingReasonCodeRequired
	}
	label := strings.TrimSpace(input.Label)
	if label == "" {
		return nil, ErrBookingReasonLabelReq
	}
	if input.BookingTypeID == uuid.Nil {
		return nil, ErrBookingReasonTypeRequired
	}

	// Check code uniqueness within tenant + booking type
	existing, err := s.repo.GetByCode(ctx, input.TenantID, input.BookingTypeID, code)
	if err == nil && existing != nil {
		return nil, ErrBookingReasonCodeExists
	}

	br := &model.BookingReason{
		TenantID:      input.TenantID,
		BookingTypeID: input.BookingTypeID,
		Code:          code,
		Label:         label,
		IsActive:      true,
		SortOrder:     input.SortOrder,
	}

	if err := s.repo.Create(ctx, br); err != nil {
		return nil, err
	}
	return br, nil
}

func (s *BookingReasonService) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingReason, error) {
	br, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingReasonNotFound
	}
	return br, nil
}

type UpdateBookingReasonInput struct {
	Code      *string
	Label     *string
	IsActive  *bool
	SortOrder *int
}

func (s *BookingReasonService) Update(ctx context.Context, id uuid.UUID, input UpdateBookingReasonInput) (*model.BookingReason, error) {
	br, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingReasonNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrBookingReasonCodeRequired
		}
		// Check uniqueness for new code
		existing, err := s.repo.GetByCode(ctx, br.TenantID, br.BookingTypeID, code)
		if err == nil && existing != nil && existing.ID != id {
			return nil, ErrBookingReasonCodeExists
		}
		br.Code = code
	}
	if input.Label != nil {
		label := strings.TrimSpace(*input.Label)
		if label == "" {
			return nil, ErrBookingReasonLabelReq
		}
		br.Label = label
	}
	if input.IsActive != nil {
		br.IsActive = *input.IsActive
	}
	if input.SortOrder != nil {
		br.SortOrder = *input.SortOrder
	}

	if err := s.repo.Update(ctx, br); err != nil {
		return nil, err
	}
	return br, nil
}

func (s *BookingReasonService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrBookingReasonNotFound
	}
	return s.repo.Delete(ctx, id)
}

func (s *BookingReasonService) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingReason, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *BookingReasonService) ListByBookingType(ctx context.Context, tenantID uuid.UUID, bookingTypeID uuid.UUID) ([]model.BookingReason, error) {
	return s.repo.ListByBookingType(ctx, tenantID, bookingTypeID)
}
```

### File: `apps/api/internal/service/bookingtypegroup.go` (NEW)

```go
package service

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/tolga/terp/internal/model"
)

var (
	ErrBookingTypeGroupNotFound     = errors.New("booking type group not found")
	ErrBookingTypeGroupCodeRequired = errors.New("booking type group code is required")
	ErrBookingTypeGroupNameRequired = errors.New("booking type group name is required")
	ErrBookingTypeGroupCodeExists   = errors.New("booking type group code already exists for this tenant")
)

type bookingTypeGroupRepository interface {
	Create(ctx context.Context, g *model.BookingTypeGroup) error
	GetByID(ctx context.Context, id uuid.UUID) (*model.BookingTypeGroup, error)
	GetByCode(ctx context.Context, tenantID uuid.UUID, code string) (*model.BookingTypeGroup, error)
	List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingTypeGroup, error)
	Update(ctx context.Context, g *model.BookingTypeGroup) error
	Delete(ctx context.Context, id uuid.UUID) error
	AddMember(ctx context.Context, member *model.BookingTypeGroupMember) error
	RemoveMember(ctx context.Context, groupID uuid.UUID, bookingTypeID uuid.UUID) error
	ListMembers(ctx context.Context, groupID uuid.UUID) ([]model.BookingTypeGroupMember, error)
	ListMemberBookingTypes(ctx context.Context, groupID uuid.UUID) ([]model.BookingType, error)
	SetMembers(ctx context.Context, groupID uuid.UUID, members []model.BookingTypeGroupMember) error
}

type BookingTypeGroupService struct {
	repo bookingTypeGroupRepository
}

func NewBookingTypeGroupService(repo bookingTypeGroupRepository) *BookingTypeGroupService {
	return &BookingTypeGroupService{repo: repo}
}

type CreateBookingTypeGroupInput struct {
	TenantID       uuid.UUID
	Code           string
	Name           string
	Description    string
	BookingTypeIDs []uuid.UUID // optional: initial members with their order
}

func (s *BookingTypeGroupService) Create(ctx context.Context, input CreateBookingTypeGroupInput) (*model.BookingTypeGroup, error) {
	code := strings.TrimSpace(input.Code)
	if code == "" {
		return nil, ErrBookingTypeGroupCodeRequired
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, ErrBookingTypeGroupNameRequired
	}

	existing, err := s.repo.GetByCode(ctx, input.TenantID, code)
	if err == nil && existing != nil {
		return nil, ErrBookingTypeGroupCodeExists
	}

	desc := strings.TrimSpace(input.Description)
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}

	g := &model.BookingTypeGroup{
		TenantID:    input.TenantID,
		Code:        code,
		Name:        name,
		Description: descPtr,
		IsActive:    true,
	}
	if err := s.repo.Create(ctx, g); err != nil {
		return nil, err
	}

	// Add initial members if provided
	if len(input.BookingTypeIDs) > 0 {
		members := make([]model.BookingTypeGroupMember, len(input.BookingTypeIDs))
		for i, btID := range input.BookingTypeIDs {
			members[i] = model.BookingTypeGroupMember{
				GroupID:       g.ID,
				BookingTypeID: btID,
				SortOrder:     i,
			}
		}
		if err := s.repo.SetMembers(ctx, g.ID, members); err != nil {
			return nil, err
		}
	}

	return g, nil
}

func (s *BookingTypeGroupService) GetByID(ctx context.Context, id uuid.UUID) (*model.BookingTypeGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingTypeGroupNotFound
	}
	return g, nil
}

type UpdateBookingTypeGroupInput struct {
	Code           *string
	Name           *string
	Description    *string
	IsActive       *bool
	BookingTypeIDs []uuid.UUID // if non-nil, replace all members
}

func (s *BookingTypeGroupService) Update(ctx context.Context, id uuid.UUID, input UpdateBookingTypeGroupInput) (*model.BookingTypeGroup, error) {
	g, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, ErrBookingTypeGroupNotFound
	}

	if input.Code != nil {
		code := strings.TrimSpace(*input.Code)
		if code == "" {
			return nil, ErrBookingTypeGroupCodeRequired
		}
		existing, err := s.repo.GetByCode(ctx, g.TenantID, code)
		if err == nil && existing != nil && existing.ID != id {
			return nil, ErrBookingTypeGroupCodeExists
		}
		g.Code = code
	}
	if input.Name != nil {
		name := strings.TrimSpace(*input.Name)
		if name == "" {
			return nil, ErrBookingTypeGroupNameRequired
		}
		g.Name = name
	}
	if input.Description != nil {
		desc := strings.TrimSpace(*input.Description)
		if desc != "" {
			g.Description = &desc
		} else {
			g.Description = nil
		}
	}
	if input.IsActive != nil {
		g.IsActive = *input.IsActive
	}

	if err := s.repo.Update(ctx, g); err != nil {
		return nil, err
	}

	// Update members if provided
	if input.BookingTypeIDs != nil {
		members := make([]model.BookingTypeGroupMember, len(input.BookingTypeIDs))
		for i, btID := range input.BookingTypeIDs {
			members[i] = model.BookingTypeGroupMember{
				GroupID:       g.ID,
				BookingTypeID: btID,
				SortOrder:     i,
			}
		}
		if err := s.repo.SetMembers(ctx, g.ID, members); err != nil {
			return nil, err
		}
	}

	return g, nil
}

func (s *BookingTypeGroupService) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return ErrBookingTypeGroupNotFound
	}
	return s.repo.Delete(ctx, id)
}

func (s *BookingTypeGroupService) List(ctx context.Context, tenantID uuid.UUID) ([]model.BookingTypeGroup, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *BookingTypeGroupService) ListMembers(ctx context.Context, groupID uuid.UUID) ([]model.BookingType, error) {
	return s.repo.ListMemberBookingTypes(ctx, groupID)
}

func (s *BookingTypeGroupService) AddMember(ctx context.Context, groupID uuid.UUID, bookingTypeID uuid.UUID, sortOrder int) error {
	member := &model.BookingTypeGroupMember{
		GroupID:       groupID,
		BookingTypeID: bookingTypeID,
		SortOrder:     sortOrder,
	}
	return s.repo.AddMember(ctx, member)
}

func (s *BookingTypeGroupService) RemoveMember(ctx context.Context, groupID uuid.UUID, bookingTypeID uuid.UUID) error {
	return s.repo.RemoveMember(ctx, groupID, bookingTypeID)
}
```

### Verification
- `cd apps/api && go build ./...` compiles
- Existing booking type tests still pass

---

## Phase 5: OpenAPI Specifications

### File: `api/schemas/booking-types.yaml` (MODIFY)

Update the `BookingType` response, `CreateBookingTypeRequest`, and `UpdateBookingTypeRequest` schemas to include new fields:

```yaml
# Booking Type-related schemas
BookingType:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
    - direction
    - category
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
      x-nullable: true
      description: Null for system booking types
    code:
      type: string
      example: "A1"
    name:
      type: string
      example: "Kommen"
    description:
      type: string
      x-nullable: true
    direction:
      type: string
      enum:
        - in
        - out
      description: Whether this is an arrival (in) or departure (out) booking
      example: "in"
    category:
      type: string
      enum:
        - work
        - break
        - business_trip
        - other
      description: |
        Category of the booking type:
        - work: Standard clock in/out (A1/A2)
        - break: Break start/end (PA/PE)
        - business_trip: Business trip start/end (DA/DE)
        - other: Custom category
      example: "work"
    account_id:
      type: string
      format: uuid
      x-nullable: true
      description: Optional linked account for time calculations
    requires_reason:
      type: boolean
      description: Whether bookings of this type must include a reason code
      example: false
    is_system:
      type: boolean
      description: System types cannot be deleted
      example: true
    is_active:
      type: boolean
      example: true
    usage_count:
      type: integer
      format: int64
      description: Number of bookings using this type
      example: 0
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

BookingTypeSummary:
  type: object
  required:
    - id
    - code
    - name
    - direction
  properties:
    id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
    direction:
      type: string
      enum:
        - in
        - out
    category:
      type: string
      enum:
        - work
        - break
        - business_trip
        - other

CreateBookingTypeRequest:
  type: object
  required:
    - code
    - name
    - direction
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 20
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    direction:
      type: string
      enum:
        - in
        - out
    category:
      type: string
      enum:
        - work
        - break
        - business_trip
        - other
      description: Defaults to 'work' if not specified
    account_id:
      type: string
      format: uuid
      x-nullable: true
    requires_reason:
      type: boolean

UpdateBookingTypeRequest:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    is_active:
      type: boolean
    category:
      type: string
      enum:
        - work
        - break
        - business_trip
        - other
    account_id:
      type: string
      format: uuid
      x-nullable: true
    requires_reason:
      type: boolean

BookingTypeList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/BookingType'
```

### File: `api/schemas/booking-reasons.yaml` (NEW)

```yaml
# Booking Reason schemas
BookingReason:
  type: object
  required:
    - id
    - booking_type_id
    - code
    - label
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    booking_type_id:
      type: string
      format: uuid
      description: The booking type this reason applies to
    code:
      type: string
      example: "DOCTOR"
    label:
      type: string
      example: "Doctor Appointment"
    is_active:
      type: boolean
      example: true
    sort_order:
      type: integer
      example: 0
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateBookingReasonRequest:
  type: object
  required:
    - booking_type_id
    - code
    - label
  properties:
    booking_type_id:
      type: string
      format: uuid
    code:
      type: string
      minLength: 1
      maxLength: 50
    label:
      type: string
      minLength: 1
      maxLength: 255
    sort_order:
      type: integer

UpdateBookingReasonRequest:
  type: object
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 50
    label:
      type: string
      minLength: 1
      maxLength: 255
    is_active:
      type: boolean
    sort_order:
      type: integer

BookingReasonList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/BookingReason'
```

### File: `api/schemas/booking-type-groups.yaml` (NEW)

```yaml
# Booking Type Group schemas
BookingTypeGroup:
  type: object
  required:
    - id
    - code
    - name
  properties:
    id:
      type: string
      format: uuid
    tenant_id:
      type: string
      format: uuid
    code:
      type: string
    name:
      type: string
    description:
      type: string
      x-nullable: true
    is_active:
      type: boolean
      example: true
    booking_type_ids:
      type: array
      items:
        type: string
        format: uuid
      description: Ordered list of booking type IDs in this group
    created_at:
      type: string
      format: date-time
    updated_at:
      type: string
      format: date-time

CreateBookingTypeGroupRequest:
  type: object
  required:
    - code
    - name
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 50
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    booking_type_ids:
      type: array
      items:
        type: string
        format: uuid
      description: Ordered list of booking type IDs to include in the group

UpdateBookingTypeGroupRequest:
  type: object
  properties:
    code:
      type: string
      minLength: 1
      maxLength: 50
    name:
      type: string
      minLength: 1
      maxLength: 255
    description:
      type: string
    is_active:
      type: boolean
    booking_type_ids:
      type: array
      items:
        type: string
        format: uuid
      description: Replace all members with this ordered list

BookingTypeGroupList:
  type: object
  required:
    - data
  properties:
    data:
      type: array
      items:
        $ref: '#/BookingTypeGroup'
```

### File: `api/paths/booking-reasons.yaml` (NEW)

```yaml
# Booking Reason endpoints
/booking-reasons:
  get:
    tags:
      - Booking Reasons
    summary: List booking reasons
    description: Returns all booking reasons for the tenant. Optionally filter by booking type.
    operationId: listBookingReasons
    parameters:
      - name: booking_type_id
        in: query
        type: string
        format: uuid
        description: Filter by booking type ID
    responses:
      200:
        description: List of booking reasons
        schema:
          $ref: '../schemas/booking-reasons.yaml#/BookingReasonList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Booking Reasons
    summary: Create booking reason
    operationId: createBookingReason
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/booking-reasons.yaml#/CreateBookingReasonRequest'
    responses:
      201:
        description: Created booking reason
        schema:
          $ref: '../schemas/booking-reasons.yaml#/BookingReason'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/booking-reasons/{id}:
  get:
    tags:
      - Booking Reasons
    summary: Get booking reason by ID
    operationId: getBookingReason
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Booking reason details
        schema:
          $ref: '../schemas/booking-reasons.yaml#/BookingReason'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Booking Reasons
    summary: Update booking reason
    operationId: updateBookingReason
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/booking-reasons.yaml#/UpdateBookingReasonRequest'
    responses:
      200:
        description: Updated booking reason
        schema:
          $ref: '../schemas/booking-reasons.yaml#/BookingReason'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Booking Reasons
    summary: Delete booking reason
    operationId: deleteBookingReason
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Booking reason deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

### File: `api/paths/booking-type-groups.yaml` (NEW)

```yaml
# Booking Type Group endpoints
/booking-type-groups:
  get:
    tags:
      - Booking Type Groups
    summary: List booking type groups
    description: Returns all booking type groups for the tenant.
    operationId: listBookingTypeGroups
    responses:
      200:
        description: List of booking type groups
        schema:
          $ref: '../schemas/booking-type-groups.yaml#/BookingTypeGroupList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
  post:
    tags:
      - Booking Type Groups
    summary: Create booking type group
    operationId: createBookingTypeGroup
    parameters:
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/booking-type-groups.yaml#/CreateBookingTypeGroupRequest'
    responses:
      201:
        description: Created booking type group
        schema:
          $ref: '../schemas/booking-type-groups.yaml#/BookingTypeGroup'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      409:
        description: Code already exists
        schema:
          $ref: '../schemas/common.yaml#/ProblemDetails'

/booking-type-groups/{id}:
  get:
    tags:
      - Booking Type Groups
    summary: Get booking type group by ID
    operationId: getBookingTypeGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: Booking type group details
        schema:
          $ref: '../schemas/booking-type-groups.yaml#/BookingTypeGroup'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  patch:
    tags:
      - Booking Type Groups
    summary: Update booking type group
    operationId: updateBookingTypeGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
      - name: body
        in: body
        required: true
        schema:
          $ref: '../schemas/booking-type-groups.yaml#/UpdateBookingTypeGroupRequest'
    responses:
      200:
        description: Updated booking type group
        schema:
          $ref: '../schemas/booking-type-groups.yaml#/BookingTypeGroup'
      400:
        $ref: '../responses/errors.yaml#/BadRequest'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
  delete:
    tags:
      - Booking Type Groups
    summary: Delete booking type group
    operationId: deleteBookingTypeGroup
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      204:
        description: Booking type group deleted
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'

/booking-type-groups/{id}/members:
  get:
    tags:
      - Booking Type Groups
    summary: List booking types in a group
    description: Returns the ordered list of booking types that belong to this group.
    operationId: listBookingTypeGroupMembers
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
    responses:
      200:
        description: List of booking types in the group
        schema:
          $ref: '../schemas/booking-types.yaml#/BookingTypeList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

### File: `api/openapi.yaml` (MODIFY)

Add under the `tags` section (after "Booking Types"):
```yaml
  - name: Booking Reasons
    description: Booking reason management
  - name: Booking Type Groups
    description: Booking type group management
```

Add under the `paths` section (after the booking-types entries):
```yaml
  # Booking Reasons
  /booking-reasons:
    $ref: 'paths/booking-reasons.yaml#/~1booking-reasons'
  /booking-reasons/{id}:
    $ref: 'paths/booking-reasons.yaml#/~1booking-reasons~1{id}'

  # Booking Type Groups
  /booking-type-groups:
    $ref: 'paths/booking-type-groups.yaml#/~1booking-type-groups'
  /booking-type-groups/{id}:
    $ref: 'paths/booking-type-groups.yaml#/~1booking-type-groups~1{id}'
  /booking-type-groups/{id}/members:
    $ref: 'paths/booking-type-groups.yaml#/~1booking-type-groups~1{id}~1members'
```

Add under the `definitions` section (after BookingTypeList):
```yaml
  # Booking Reasons
  BookingReason:
    $ref: 'schemas/booking-reasons.yaml#/BookingReason'
  CreateBookingReasonRequest:
    $ref: 'schemas/booking-reasons.yaml#/CreateBookingReasonRequest'
  UpdateBookingReasonRequest:
    $ref: 'schemas/booking-reasons.yaml#/UpdateBookingReasonRequest'
  BookingReasonList:
    $ref: 'schemas/booking-reasons.yaml#/BookingReasonList'

  # Booking Type Groups
  BookingTypeGroup:
    $ref: 'schemas/booking-type-groups.yaml#/BookingTypeGroup'
  CreateBookingTypeGroupRequest:
    $ref: 'schemas/booking-type-groups.yaml#/CreateBookingTypeGroupRequest'
  UpdateBookingTypeGroupRequest:
    $ref: 'schemas/booking-type-groups.yaml#/UpdateBookingTypeGroupRequest'
  BookingTypeGroupList:
    $ref: 'schemas/booking-type-groups.yaml#/BookingTypeGroupList'
```

### Verification
- Run `make swagger-bundle` -- must succeed without errors
- Run `make generate` -- must generate new model files for the new schemas
- Check that generated files exist in `apps/api/gen/models/`

---

## Phase 6: Handler Layer

### File: `apps/api/internal/handler/bookingtype.go` (MODIFY)

Update the `Create` handler to read `category`, `account_id`, `requires_reason` from the request and pass them into the service input. Update the `Update` handler similarly.

Changes to `Create`:
```go
input := service.CreateBookingTypeInput{
	TenantID:  tenantID,
	Code:      *req.Code,
	Name:      *req.Name,
	Direction: *req.Direction,
	Category:  req.Category,        // new -- may be empty string (service defaults to "work")
	RequiresReason: req.RequiresReason, // new
}

// Handle optional fields
if req.Description != "" {
	input.Description = &req.Description
}
// Handle optional account_id
if req.AccountID != "" {
	accID, err := uuid.Parse(string(req.AccountID))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account_id format")
		return
	}
	input.AccountID = &accID
}
```

Add `ErrInvalidCategory` to the error switch:
```go
case service.ErrInvalidCategory:
	respondError(w, http.StatusBadRequest, "Invalid category (must be 'work', 'break', 'business_trip', or 'other')")
```

Update `Update` handler to handle new fields:
```go
if req.Category != "" {
	input.Category = &req.Category
}
if req.AccountID != "" {
	accID, err := uuid.Parse(string(req.AccountID))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid account_id format")
		return
	}
	input.AccountID = &accID
}
input.RequiresReason = &req.RequiresReason
```

NOTE: The exact field names on `req` depend on the generated model struct after running `make generate`. Check the generated `create_booking_type_request.go` and `update_booking_type_request.go` for the exact Go field names. They will likely be:
- `req.Category` (string)
- `req.AccountID` (strfmt.UUID)
- `req.RequiresReason` (bool)

### File: `apps/api/internal/handler/bookingreason.go` (NEW)

Follow the pattern from `accountgroup.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type BookingReasonHandler struct {
	svc *service.BookingReasonService
}

func NewBookingReasonHandler(svc *service.BookingReasonService) *BookingReasonHandler {
	return &BookingReasonHandler{svc: svc}
}

func (h *BookingReasonHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var reasons []model.BookingReason
	var err error

	// Check for optional booking_type_id filter
	if btIDStr := r.URL.Query().Get("booking_type_id"); btIDStr != "" {
		btID, parseErr := uuid.Parse(btIDStr)
		if parseErr != nil {
			respondError(w, http.StatusBadRequest, "Invalid booking_type_id")
			return
		}
		reasons, err = h.svc.ListByBookingType(r.Context(), tenantID, btID)
	} else {
		reasons, err = h.svc.List(r.Context(), tenantID)
	}

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list booking reasons")
		return
	}

	data := make([]*models.BookingReason, 0, len(reasons))
	for i := range reasons {
		data = append(data, bookingReasonToResponse(&reasons[i]))
	}

	respondJSON(w, http.StatusOK, models.BookingReasonList{Data: data})
}

func (h *BookingReasonHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking reason ID")
		return
	}

	br, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Booking reason not found")
		return
	}

	respondJSON(w, http.StatusOK, bookingReasonToResponse(br))
}

func (h *BookingReasonHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateBookingReasonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	btID, err := uuid.Parse(string(*req.BookingTypeID))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking_type_id")
		return
	}

	input := service.CreateBookingReasonInput{
		TenantID:      tenantID,
		BookingTypeID: btID,
		Code:          *req.Code,
		Label:         *req.Label,
		SortOrder:     int(req.SortOrder),
	}

	br, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleBookingReasonError(w, err)
		return
	}

	respondJSON(w, http.StatusCreated, bookingReasonToResponse(br))
}

func (h *BookingReasonHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking reason ID")
		return
	}

	var req models.UpdateBookingReasonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateBookingReasonInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Label != "" {
		input.Label = &req.Label
	}
	input.IsActive = &req.IsActive
	if req.SortOrder != 0 {
		so := int(req.SortOrder)
		input.SortOrder = &so
	}

	br, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleBookingReasonError(w, err)
		return
	}

	respondJSON(w, http.StatusOK, bookingReasonToResponse(br))
}

func (h *BookingReasonHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking reason ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleBookingReasonError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func bookingReasonToResponse(br *model.BookingReason) *models.BookingReason {
	id := strfmt.UUID(br.ID.String())
	tenantID := strfmt.UUID(br.TenantID.String())
	btID := strfmt.UUID(br.BookingTypeID.String())

	return &models.BookingReason{
		ID:            &id,
		TenantID:      tenantID,
		BookingTypeID: &btID,
		Code:          &br.Code,
		Label:         &br.Label,
		IsActive:      br.IsActive,
		SortOrder:     int64(br.SortOrder),
		CreatedAt:     strfmt.DateTime(br.CreatedAt),
		UpdatedAt:     strfmt.DateTime(br.UpdatedAt),
	}
}

func handleBookingReasonError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrBookingReasonNotFound:
		respondError(w, http.StatusNotFound, "Booking reason not found")
	case service.ErrBookingReasonCodeRequired:
		respondError(w, http.StatusBadRequest, "Booking reason code is required")
	case service.ErrBookingReasonLabelReq:
		respondError(w, http.StatusBadRequest, "Booking reason label is required")
	case service.ErrBookingReasonCodeExists:
		respondError(w, http.StatusConflict, "A booking reason with this code already exists for this booking type")
	case service.ErrBookingReasonTypeRequired:
		respondError(w, http.StatusBadRequest, "Booking type ID is required")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
```

**NOTE**: The exact field names in the generated `models.CreateBookingReasonRequest`, `models.BookingReason`, etc. will depend on the output of `make generate`. Adjust field name casing and pointer usage as needed after generation. For instance, required fields in the OpenAPI schema generate as pointers (`*string`) in go-swagger, while optional fields are plain types.

### File: `apps/api/internal/handler/bookingtypegroup.go` (NEW)

Follow AccountGroupHandler pattern:

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

type BookingTypeGroupHandler struct {
	svc *service.BookingTypeGroupService
}

func NewBookingTypeGroupHandler(svc *service.BookingTypeGroupService) *BookingTypeGroupHandler {
	return &BookingTypeGroupHandler{svc: svc}
}

func (h *BookingTypeGroupHandler) List(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	groups, err := h.svc.List(r.Context(), tenantID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list booking type groups")
		return
	}

	data := make([]*models.BookingTypeGroup, 0, len(groups))
	for i := range groups {
		// For list, we include member IDs for each group
		memberTypes, _ := h.svc.ListMembers(r.Context(), groups[i].ID)
		data = append(data, bookingTypeGroupToResponse(&groups[i], memberTypes))
	}

	respondJSON(w, http.StatusOK, models.BookingTypeGroupList{Data: data})
}

func (h *BookingTypeGroupHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	g, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Booking type group not found")
		return
	}

	memberTypes, _ := h.svc.ListMembers(r.Context(), g.ID)
	respondJSON(w, http.StatusOK, bookingTypeGroupToResponse(g, memberTypes))
}

func (h *BookingTypeGroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	tenantID, ok := middleware.TenantFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "Tenant required")
		return
	}

	var req models.CreateBookingTypeGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Parse booking type IDs
	var btIDs []uuid.UUID
	for _, idStr := range req.BookingTypeIds {
		btID, err := uuid.Parse(string(idStr))
		if err != nil {
			respondError(w, http.StatusBadRequest, "Invalid booking type ID: "+string(idStr))
			return
		}
		btIDs = append(btIDs, btID)
	}

	input := service.CreateBookingTypeGroupInput{
		TenantID:       tenantID,
		Code:           *req.Code,
		Name:           *req.Name,
		Description:    req.Description,
		BookingTypeIDs: btIDs,
	}

	g, err := h.svc.Create(r.Context(), input)
	if err != nil {
		handleBookingTypeGroupError(w, err)
		return
	}

	memberTypes, _ := h.svc.ListMembers(r.Context(), g.ID)
	respondJSON(w, http.StatusCreated, bookingTypeGroupToResponse(g, memberTypes))
}

func (h *BookingTypeGroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	var req models.UpdateBookingTypeGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if err := req.Validate(nil); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	input := service.UpdateBookingTypeGroupInput{}
	if req.Code != "" {
		input.Code = &req.Code
	}
	if req.Name != "" {
		input.Name = &req.Name
	}
	if req.Description != "" {
		input.Description = &req.Description
	}
	input.IsActive = &req.IsActive

	// Parse booking type IDs if provided
	if req.BookingTypeIds != nil {
		btIDs := make([]uuid.UUID, len(req.BookingTypeIds))
		for i, idStr := range req.BookingTypeIds {
			btID, err := uuid.Parse(string(idStr))
			if err != nil {
				respondError(w, http.StatusBadRequest, "Invalid booking type ID: "+string(idStr))
				return
			}
			btIDs[i] = btID
		}
		input.BookingTypeIDs = btIDs
	}

	g, err := h.svc.Update(r.Context(), id, input)
	if err != nil {
		handleBookingTypeGroupError(w, err)
		return
	}

	memberTypes, _ := h.svc.ListMembers(r.Context(), g.ID)
	respondJSON(w, http.StatusOK, bookingTypeGroupToResponse(g, memberTypes))
}

func (h *BookingTypeGroupHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	if err := h.svc.Delete(r.Context(), id); err != nil {
		handleBookingTypeGroupError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *BookingTypeGroupHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid group ID")
		return
	}

	// Verify group exists
	_, err = h.svc.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Booking type group not found")
		return
	}

	types, err := h.svc.ListMembers(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to list group members")
		return
	}

	if types == nil {
		types = []model.BookingType{}
	}

	respondJSON(w, http.StatusOK, map[string]any{"data": types})
}

func bookingTypeGroupToResponse(g *model.BookingTypeGroup, memberTypes []model.BookingType) *models.BookingTypeGroup {
	id := strfmt.UUID(g.ID.String())
	tenantID := strfmt.UUID(g.TenantID.String())

	var btIDs []strfmt.UUID
	for _, bt := range memberTypes {
		btIDs = append(btIDs, strfmt.UUID(bt.ID.String()))
	}

	resp := &models.BookingTypeGroup{
		ID:             &id,
		TenantID:       tenantID,
		Code:           &g.Code,
		Name:           &g.Name,
		Description:    g.Description,
		IsActive:       g.IsActive,
		BookingTypeIds: btIDs,
		CreatedAt:      strfmt.DateTime(g.CreatedAt),
		UpdatedAt:      strfmt.DateTime(g.UpdatedAt),
	}

	return resp
}

func handleBookingTypeGroupError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrBookingTypeGroupNotFound:
		respondError(w, http.StatusNotFound, "Booking type group not found")
	case service.ErrBookingTypeGroupCodeRequired:
		respondError(w, http.StatusBadRequest, "Group code is required")
	case service.ErrBookingTypeGroupNameRequired:
		respondError(w, http.StatusBadRequest, "Group name is required")
	case service.ErrBookingTypeGroupCodeExists:
		respondError(w, http.StatusConflict, "A group with this code already exists for this tenant")
	default:
		respondError(w, http.StatusInternalServerError, "Internal server error")
	}
}
```

### Verification
- `cd apps/api && go build ./...` compiles

---

## Phase 7: Route Registration and main.go Wiring

### File: `apps/api/internal/handler/routes.go` (MODIFY)

Add two new route registration functions:

```go
// RegisterBookingReasonRoutes registers booking reason routes.
func RegisterBookingReasonRoutes(r chi.Router, h *BookingReasonHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("booking_types.manage").String()
	r.Route("/booking-reasons", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterBookingTypeGroupRoutes registers booking type group routes.
func RegisterBookingTypeGroupRoutes(r chi.Router, h *BookingTypeGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("booking_types.manage").String()
	r.Route("/booking-type-groups", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Get("/{id}/members", h.ListMembers)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Get("/{id}/members", h.ListMembers)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}
```

NOTE: Both use the existing `booking_types.manage` permission. No new permission entry needed in `permissions.go`.

### File: `apps/api/cmd/server/main.go` (MODIFY)

Add the following in the repositories initialization section (after `bookingTypeRepo`):
```go
bookingReasonRepo := repository.NewBookingReasonRepository(db)
bookingTypeGroupRepo := repository.NewBookingTypeGroupRepository(db)
```

Add in the services initialization section (after `bookingTypeService`):
```go
bookingReasonService := service.NewBookingReasonService(bookingReasonRepo)
bookingTypeGroupService := service.NewBookingTypeGroupService(bookingTypeGroupRepo)
```

Add in the handlers initialization section (after `bookingTypeHandler`):
```go
bookingReasonHandler := handler.NewBookingReasonHandler(bookingReasonService)
bookingTypeGroupHandler := handler.NewBookingTypeGroupHandler(bookingTypeGroupService)
```

Add in the tenant-scoped route registration block (after `RegisterBookingTypeRoutes`):
```go
handler.RegisterBookingReasonRoutes(r, bookingReasonHandler, authzMiddleware)
handler.RegisterBookingTypeGroupRoutes(r, bookingTypeGroupHandler, authzMiddleware)
```

### Verification
- `cd apps/api && go build ./cmd/server/...` compiles
- `make dev` starts without errors

---

## Phase 8: Dev Seeding Updates

### File: `apps/api/internal/auth/devbookingtypes.go` (MODIFY)

Add `Category` field to `DevBookingType` struct and update existing entries:

```go
package auth

import "github.com/google/uuid"

// DevBookingType represents a predefined development booking type.
type DevBookingType struct {
	ID             uuid.UUID `json:"id"`
	Code           string    `json:"code"`
	Name           string    `json:"name"`
	Description    string    `json:"description"`
	Direction      string    `json:"direction"`      // "in" or "out"
	Category       string    `json:"category"`       // "work", "break", "business_trip", "other"
	RequiresReason bool      `json:"requires_reason"`
	IsActive       bool      `json:"is_active"`
}

// DevBookingTypes contains predefined booking types for development mode.
var DevBookingTypes = []DevBookingType{
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000201"),
		Code:        "A1",
		Name:        "Kommen",
		Description: "Clock In - Start of work",
		Direction:   "in",
		Category:    "work",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000202"),
		Code:        "A2",
		Name:        "Gehen",
		Description: "Clock Out - End of work",
		Direction:   "out",
		Category:    "work",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000203"),
		Code:        "P1",
		Name:        "Pause Beginn",
		Description: "Break Start",
		Direction:   "out",
		Category:    "break",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000204"),
		Code:        "P2",
		Name:        "Pause Ende",
		Description: "Break End",
		Direction:   "in",
		Category:    "break",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000205"),
		Code:        "D1",
		Name:        "Dienstgang Beginn",
		Description: "Business Trip Start",
		Direction:   "out",
		Category:    "business_trip",
		IsActive:    true,
	},
	{
		ID:          uuid.MustParse("00000000-0000-0000-0000-000000000206"),
		Code:        "D2",
		Name:        "Dienstgang Ende",
		Description: "Business Trip End",
		Direction:   "in",
		Category:    "business_trip",
		IsActive:    true,
	},
}

// GetDevBookingTypes returns all dev booking types.
func GetDevBookingTypes() []DevBookingType {
	return DevBookingTypes
}
```

### File: `apps/api/internal/handler/auth.go` (MODIFY)

Update the dev seeding loop that creates booking types to include the new fields:

Find the section:
```go
for _, devBT := range auth.GetDevBookingTypes() {
	desc := devBT.Description
	bt := &model.BookingType{
		ID:          devBT.ID,
		TenantID:    nil,
		Code:        devBT.Code,
		Name:        devBT.Name,
		Description: &desc,
		Direction:   model.BookingDirection(devBT.Direction),
		IsSystem:    true,
		IsActive:    devBT.IsActive,
	}
```

Replace with:
```go
for _, devBT := range auth.GetDevBookingTypes() {
	desc := devBT.Description
	bt := &model.BookingType{
		ID:             devBT.ID,
		TenantID:       nil,
		Code:           devBT.Code,
		Name:           devBT.Name,
		Description:    &desc,
		Direction:      model.BookingDirection(devBT.Direction),
		Category:       model.BookingCategory(devBT.Category),
		RequiresReason: devBT.RequiresReason,
		IsSystem:       true,
		IsActive:       devBT.IsActive,
	}
```

### Verification
- `make dev` starts and dev login endpoint (`/api/v1/auth/dev/login?role=admin`) successfully seeds the 6 booking types with categories
- GET `/api/v1/booking-types` returns types with `category`, `requires_reason`, and `account_id` fields

---

## Phase 9: Tests

### File: `apps/api/internal/service/bookingtype_test.go` (MODIFY)

Add tests for the new fields:

```go
func TestBookingTypeService_Create_WithCategory(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "BREAK-TYPE",
		Name:      "Break Type",
		Direction: "out",
		Category:  "break",
	}

	bt, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, model.BookingCategoryBreak, bt.Category)
}

func TestBookingTypeService_Create_InvalidCategory(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "INVALID-CAT",
		Name:      "Invalid Category",
		Direction: "in",
		Category:  "invalid_category",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidCategory)
}

func TestBookingTypeService_Create_DefaultCategory(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:  tenant.ID,
		Code:      "DEFAULT-CAT",
		Name:      "Default Category",
		Direction: "in",
		// Category omitted -- should default to "work"
	}

	bt, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, model.BookingCategoryWork, bt.Category)
}

func TestBookingTypeService_Create_WithRequiresReason(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeInput{
		TenantID:       tenant.ID,
		Code:           "REASON-TYPE",
		Name:           "Reason Required",
		Direction:      "out",
		RequiresReason: true,
	}

	bt, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.True(t, bt.RequiresReason)
}

func TestBookingTypeService_Update_Category(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeRepository(db)
	svc := service.NewBookingTypeService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	created, err := svc.Create(ctx, service.CreateBookingTypeInput{
		TenantID: tenant.ID, Code: "UPD-CAT", Name: "Update Cat", Direction: "in", Category: "work",
	})
	require.NoError(t, err)

	cat := "business_trip"
	updated, err := svc.Update(ctx, created.ID, tenant.ID, service.UpdateBookingTypeInput{Category: &cat})
	require.NoError(t, err)
	assert.Equal(t, model.BookingCategoryBusinessTrip, updated.Category)
}
```

### File: `apps/api/internal/service/bookingreason_test.go` (NEW)

```go
package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createBookingTypeForReasonTests(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string) *model.BookingType {
	t.Helper()
	repo := repository.NewBookingTypeRepository(db)
	bt := &model.BookingType{
		TenantID:  &tenantID,
		Code:      code,
		Name:      "Test Type " + code,
		Direction: model.BookingDirectionOut,
		Category:  model.BookingCategoryWork,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(context.Background(), bt))
	return bt
}

func TestBookingReasonService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT")

	input := service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "DOCTOR",
		Label:         "Doctor Appointment",
	}

	br, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "DOCTOR", br.Code)
	assert.Equal(t, "Doctor Appointment", br.Label)
	assert.True(t, br.IsActive)
	assert.Equal(t, bt.ID, br.BookingTypeID)
}

func TestBookingReasonService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT2")

	input := service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "",
		Label:         "Test",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrBookingReasonCodeRequired)
}

func TestBookingReasonService_Create_EmptyLabel(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT3")

	input := service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "TEST",
		Label:         "",
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrBookingReasonLabelReq)
}

func TestBookingReasonService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT4")

	input := service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "DUP",
		Label:         "First",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateBookingReasonInput{
		TenantID:      tenant.ID,
		BookingTypeID: bt.ID,
		Code:          "DUP",
		Label:         "Second",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrBookingReasonCodeExists)
}

func TestBookingReasonService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT5")

	created, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID: tenant.ID, BookingTypeID: bt.ID, Code: "GET", Label: "Get Test",
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestBookingReasonService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrBookingReasonNotFound)
}

func TestBookingReasonService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT6")

	created, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID: tenant.ID, BookingTypeID: bt.ID, Code: "UPD", Label: "Original",
	})
	require.NoError(t, err)

	newLabel := "Updated Label"
	updated, err := svc.Update(ctx, created.ID, service.UpdateBookingReasonInput{Label: &newLabel})
	require.NoError(t, err)
	assert.Equal(t, "Updated Label", updated.Label)
}

func TestBookingReasonService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT7")

	created, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID: tenant.ID, BookingTypeID: bt.ID, Code: "DEL", Label: "To Delete",
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrBookingReasonNotFound)
}

func TestBookingReasonService_ListByBookingType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingReasonRepository(db)
	svc := service.NewBookingReasonService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt1 := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT8")
	bt2 := createBookingTypeForReasonTests(t, db, tenant.ID, "REASON-BT9")

	_, err := svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID: tenant.ID, BookingTypeID: bt1.ID, Code: "R1", Label: "Reason 1",
	})
	require.NoError(t, err)
	_, err = svc.Create(ctx, service.CreateBookingReasonInput{
		TenantID: tenant.ID, BookingTypeID: bt2.ID, Code: "R2", Label: "Reason 2",
	})
	require.NoError(t, err)

	reasons, err := svc.ListByBookingType(ctx, tenant.ID, bt1.ID)
	require.NoError(t, err)
	assert.Len(t, reasons, 1)
	assert.Equal(t, "R1", reasons[0].Code)
}
```

### File: `apps/api/internal/service/bookingtypegroup_test.go` (NEW)

```go
package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createBookingTypeForGroupTests(t *testing.T, db *repository.DB, tenantID uuid.UUID, code string) *model.BookingType {
	t.Helper()
	repo := repository.NewBookingTypeRepository(db)
	bt := &model.BookingType{
		TenantID:  &tenantID,
		Code:      code,
		Name:      "Test Type " + code,
		Direction: model.BookingDirectionIn,
		Category:  model.BookingCategoryWork,
		IsActive:  true,
	}
	require.NoError(t, repo.Create(context.Background(), bt))
	return bt
}

func TestBookingTypeGroupService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID,
		Code:     "TERM-A",
		Name:     "Terminal A Group",
	}

	g, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "TERM-A", g.Code)
	assert.Equal(t, "Terminal A Group", g.Name)
	assert.True(t, g.IsActive)
}

func TestBookingTypeGroupService_Create_WithMembers(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt1 := createBookingTypeForGroupTests(t, db, tenant.ID, "GRP-BT1")
	bt2 := createBookingTypeForGroupTests(t, db, tenant.ID, "GRP-BT2")

	input := service.CreateBookingTypeGroupInput{
		TenantID:       tenant.ID,
		Code:           "TERM-B",
		Name:           "Terminal B Group",
		BookingTypeIDs: []uuid.UUID{bt1.ID, bt2.ID},
	}

	g, err := svc.Create(ctx, input)
	require.NoError(t, err)

	members, err := svc.ListMembers(ctx, g.ID)
	require.NoError(t, err)
	assert.Len(t, members, 2)
}

func TestBookingTypeGroupService_Create_EmptyCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID, Code: "", Name: "Test",
	}
	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupCodeRequired)
}

func TestBookingTypeGroupService_Create_EmptyName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID, Code: "TEST", Name: "",
	}
	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupNameRequired)
}

func TestBookingTypeGroupService_Create_DuplicateCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	input := service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID, Code: "DUP-GRP", Name: "First",
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	input2 := service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID, Code: "DUP-GRP", Name: "Second",
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupCodeExists)
}

func TestBookingTypeGroupService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID, Code: "GET-GRP", Name: "Get Test",
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
}

func TestBookingTypeGroupService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupNotFound)
}

func TestBookingTypeGroupService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID, Code: "UPD-GRP", Name: "Original",
	})
	require.NoError(t, err)

	newName := "Updated Name"
	updated, err := svc.Update(ctx, created.ID, service.UpdateBookingTypeGroupInput{Name: &newName})
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
}

func TestBookingTypeGroupService_Update_Members(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt1 := createBookingTypeForGroupTests(t, db, tenant.ID, "UPD-MBR1")
	bt2 := createBookingTypeForGroupTests(t, db, tenant.ID, "UPD-MBR2")
	bt3 := createBookingTypeForGroupTests(t, db, tenant.ID, "UPD-MBR3")

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID, Code: "UPD-MBR", Name: "Update Members",
		BookingTypeIDs: []uuid.UUID{bt1.ID, bt2.ID},
	})
	require.NoError(t, err)

	// Replace members with bt2 and bt3
	_, err = svc.Update(ctx, created.ID, service.UpdateBookingTypeGroupInput{
		BookingTypeIDs: []uuid.UUID{bt2.ID, bt3.ID},
	})
	require.NoError(t, err)

	members, err := svc.ListMembers(ctx, created.ID)
	require.NoError(t, err)
	assert.Len(t, members, 2)
	assert.Equal(t, bt2.ID, members[0].ID)
	assert.Equal(t, bt3.ID, members[1].ID)
}

func TestBookingTypeGroupService_Delete_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID: tenant.ID, Code: "DEL-GRP", Name: "To Delete",
	})
	require.NoError(t, err)

	err = svc.Delete(ctx, created.ID)
	require.NoError(t, err)

	_, err = svc.GetByID(ctx, created.ID)
	assert.ErrorIs(t, err, service.ErrBookingTypeGroupNotFound)
}

func TestBookingTypeGroupService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)

	for _, code := range []string{"GRP-A", "GRP-B", "GRP-C"} {
		_, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
			TenantID: tenant.ID, Code: code, Name: "Group " + code,
		})
		require.NoError(t, err)
	}

	groups, err := svc.List(ctx, tenant.ID)
	require.NoError(t, err)
	assert.Len(t, groups, 3)
}

func TestBookingTypeGroupService_MemberOrdering(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewBookingTypeGroupRepository(db)
	svc := service.NewBookingTypeGroupService(repo)
	ctx := context.Background()
	tenant := createTestTenantForBookingTypeService(t, db)
	bt1 := createBookingTypeForGroupTests(t, db, tenant.ID, "ORD-BT1")
	bt2 := createBookingTypeForGroupTests(t, db, tenant.ID, "ORD-BT2")
	bt3 := createBookingTypeForGroupTests(t, db, tenant.ID, "ORD-BT3")

	// Create group with specific order: bt3, bt1, bt2
	created, err := svc.Create(ctx, service.CreateBookingTypeGroupInput{
		TenantID:       tenant.ID,
		Code:           "ORD-GRP",
		Name:           "Ordered Group",
		BookingTypeIDs: []uuid.UUID{bt3.ID, bt1.ID, bt2.ID},
	})
	require.NoError(t, err)

	members, err := svc.ListMembers(ctx, created.ID)
	require.NoError(t, err)
	require.Len(t, members, 3)
	assert.Equal(t, bt3.ID, members[0].ID)
	assert.Equal(t, bt1.ID, members[1].ID)
	assert.Equal(t, bt2.ID, members[2].ID)
}
```

### Verification
- Run all booking type tests: `cd apps/api && go test -v -run TestBookingType ./internal/service/...`
- Run booking reason tests: `cd apps/api && go test -v -run TestBookingReason ./internal/service/...`
- Run booking type group tests: `cd apps/api && go test -v -run TestBookingTypeGroup ./internal/service/...`
- Run full test suite: `cd apps/api && go test -race ./...`

---

## Phase 10: Bundle and Generate

### Steps

1. Bundle OpenAPI spec:
```bash
make swagger-bundle
```

2. Generate Go models:
```bash
make generate
```

3. Verify generated models exist:
```
apps/api/gen/models/booking_reason.go
apps/api/gen/models/create_booking_reason_request.go
apps/api/gen/models/update_booking_reason_request.go
apps/api/gen/models/booking_reason_list.go
apps/api/gen/models/booking_type_group.go
apps/api/gen/models/create_booking_type_group_request.go
apps/api/gen/models/update_booking_type_group_request.go
apps/api/gen/models/booking_type_group_list.go
```

4. Check that the existing `booking_type.go` generated model now includes `category`, `account_id`, `requires_reason` fields.

5. Adjust handler code if the generated model field names differ from expected (go-swagger naming can differ).

6. Build and verify:
```bash
cd apps/api && go build ./...
```

7. Run full tests:
```bash
make test
```

---

## Summary of Files Changed/Created

### New Files (14)
| File | Description |
|------|-------------|
| `db/migrations/000044_booking_type_enhancements.up.sql` | Migration: new columns, tables |
| `db/migrations/000044_booking_type_enhancements.down.sql` | Down migration |
| `apps/api/internal/model/bookingreason.go` | BookingReason model |
| `apps/api/internal/model/bookingtypegroup.go` | BookingTypeGroup + member model |
| `apps/api/internal/repository/bookingreason.go` | Booking reason repository |
| `apps/api/internal/repository/bookingtypegroup.go` | Booking type group + member repository |
| `apps/api/internal/service/bookingreason.go` | Booking reason service |
| `apps/api/internal/service/bookingtypegroup.go` | Booking type group service |
| `apps/api/internal/handler/bookingreason.go` | Booking reason handler |
| `apps/api/internal/handler/bookingtypegroup.go` | Booking type group handler |
| `api/schemas/booking-reasons.yaml` | OpenAPI schema: booking reasons |
| `api/schemas/booking-type-groups.yaml` | OpenAPI schema: booking type groups |
| `api/paths/booking-reasons.yaml` | OpenAPI paths: booking reasons |
| `api/paths/booking-type-groups.yaml` | OpenAPI paths: booking type groups |

### Modified Files (8)
| File | Description |
|------|-------------|
| `apps/api/internal/model/bookingtype.go` | Add Category, AccountID, RequiresReason fields |
| `apps/api/internal/service/bookingtype.go` | Add category/account/reason fields to input/validation |
| `apps/api/internal/handler/bookingtype.go` | Handle new fields in create/update |
| `apps/api/internal/handler/routes.go` | Add RegisterBookingReasonRoutes, RegisterBookingTypeGroupRoutes |
| `apps/api/cmd/server/main.go` | Wire new repos, services, handlers |
| `apps/api/internal/auth/devbookingtypes.go` | Add Category field to dev seed data |
| `apps/api/internal/handler/auth.go` | Pass Category to dev seeding |
| `api/openapi.yaml` | Register new paths, tags, definitions |
| `api/schemas/booking-types.yaml` | Add category, account_id, requires_reason fields |

### Test Files (2 new + 1 modified)
| File | Description |
|------|-------------|
| `apps/api/internal/service/bookingtype_test.go` | Add tests for category/requires_reason |
| `apps/api/internal/service/bookingreason_test.go` | Full test suite for booking reasons |
| `apps/api/internal/service/bookingtypegroup_test.go` | Full test suite for booking type groups |

---

## Implementation Order

1. **Phase 1**: Migration (foundation for everything else)
2. **Phase 2**: Models (no dependencies except migration)
3. **Phase 3**: Repository layer (depends on models)
4. **Phase 4**: Service layer (depends on repository)
5. **Phase 5**: OpenAPI specs (independent, but needed before Phase 6)
6. **Phase 10** (partial): `make swagger-bundle && make generate` (needed before handlers)
7. **Phase 6**: Handler layer (depends on services + generated models)
8. **Phase 7**: Route registration and main.go wiring (depends on handlers)
9. **Phase 8**: Dev seeding updates (depends on model changes)
10. **Phase 9**: Tests (depends on all layers)
11. **Phase 10** (final): Full build and test verification
