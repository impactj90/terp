# TICKET-015: Create Account Model + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 2 - Reference Tables
**Dependencies**: TICKET-014

## Description

Create the Account model and repository for time tracking accounts.

## Files to Create

- `apps/api/internal/model/account.go`
- `apps/api/internal/repository/account.go`

## Implementation

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type AccountType string

const (
    AccountTypeBonus    AccountType = "bonus"
    AccountTypeTracking AccountType = "tracking"
    AccountTypeBalance  AccountType = "balance"
)

type AccountUnit string

const (
    AccountUnitMinutes AccountUnit = "minutes"
    AccountUnitHours   AccountUnit = "hours"
    AccountUnitDays    AccountUnit = "days"
)

type Account struct {
    ID          uuid.UUID   `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    *uuid.UUID  `gorm:"type:uuid;index" json:"tenant_id,omitempty"` // NULL for system
    Code        string      `gorm:"type:varchar(50);not null" json:"code"`
    Name        string      `gorm:"type:varchar(255);not null" json:"name"`
    AccountType AccountType `gorm:"type:varchar(20);not null" json:"account_type"`
    Unit        AccountUnit `gorm:"type:varchar(20);not null;default:'minutes'" json:"unit"`
    IsSystem    bool        `gorm:"default:false" json:"is_system"`
    IsActive    bool        `gorm:"default:true" json:"is_active"`
    CreatedAt   time.Time   `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time   `gorm:"default:now()" json:"updated_at"`
}

func (Account) TableName() string {
    return "accounts"
}
```

### Repository

```go
package repository

import (
    "context"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type AccountRepository interface {
    Create(ctx context.Context, account *model.Account) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.Account, error)
    GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.Account, error)
    Update(ctx context.Context, account *model.Account) error
    Delete(ctx context.Context, id uuid.UUID) error
    List(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error)
    ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) // includes system accounts
    GetSystemAccounts(ctx context.Context) ([]model.Account, error)
}

type accountRepository struct {
    db *gorm.DB
}

func NewAccountRepository(db *gorm.DB) AccountRepository {
    return &accountRepository{db: db}
}

func (r *accountRepository) Create(ctx context.Context, account *model.Account) error {
    return r.db.WithContext(ctx).Create(account).Error
}

func (r *accountRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Account, error) {
    var account model.Account
    err := r.db.WithContext(ctx).Where("id = ?", id).First(&account).Error
    return &account, err
}

func (r *accountRepository) GetByCode(ctx context.Context, tenantID *uuid.UUID, code string) (*model.Account, error) {
    var account model.Account
    query := r.db.WithContext(ctx).Where("code = ?", code)
    if tenantID != nil {
        query = query.Where("tenant_id = ?", *tenantID)
    } else {
        query = query.Where("tenant_id IS NULL")
    }
    err := query.First(&account).Error
    return &account, err
}

func (r *accountRepository) Update(ctx context.Context, account *model.Account) error {
    return r.db.WithContext(ctx).Save(account).Error
}

func (r *accountRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.Account{}, "id = ?", id).Error
}

func (r *accountRepository) List(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) {
    var accounts []model.Account
    err := r.db.WithContext(ctx).
        Where("tenant_id = ?", tenantID).
        Order("code ASC").
        Find(&accounts).Error
    return accounts, err
}

func (r *accountRepository) ListWithSystem(ctx context.Context, tenantID uuid.UUID) ([]model.Account, error) {
    var accounts []model.Account
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? OR tenant_id IS NULL", tenantID).
        Order("is_system DESC, code ASC").
        Find(&accounts).Error
    return accounts, err
}

func (r *accountRepository) GetSystemAccounts(ctx context.Context) ([]model.Account, error) {
    var accounts []model.Account
    err := r.db.WithContext(ctx).
        Where("is_system = ?", true).
        Order("code ASC").
        Find(&accounts).Error
    return accounts, err
}
```

## Unit Tests

**File**: `apps/api/internal/repository/account_test.go`

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

func TestAccountRepository_Create(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    account := &model.Account{
        TenantID:    &tenantID,
        Code:        "OVERTIME",
        Name:        "Overtime Account",
        AccountType: model.AccountTypeBonus,
        Unit:        model.AccountUnitMinutes,
        IsActive:    true,
    }

    err := repo.Create(ctx, account)
    require.NoError(t, err)
    assert.NotEqual(t, uuid.Nil, account.ID)
}

func TestAccountRepository_GetByID(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    account := &model.Account{
        TenantID:    &tenantID,
        Code:        "OVERTIME",
        Name:        "Overtime Account",
        AccountType: model.AccountTypeBonus,
    }
    repo.Create(ctx, account)

    found, err := repo.GetByID(ctx, account.ID)
    require.NoError(t, err)
    assert.Equal(t, account.ID, found.ID)
    assert.Equal(t, account.Code, found.Code)
}

func TestAccountRepository_GetByID_NotFound(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    _, err := repo.GetByID(ctx, uuid.New())
    assert.Error(t, err)
}

func TestAccountRepository_GetByCode(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    account := &model.Account{
        TenantID:    &tenantID,
        Code:        "OVERTIME",
        Name:        "Overtime Account",
        AccountType: model.AccountTypeBonus,
    }
    repo.Create(ctx, account)

    found, err := repo.GetByCode(ctx, &tenantID, "OVERTIME")
    require.NoError(t, err)
    assert.Equal(t, account.ID, found.ID)
}

func TestAccountRepository_GetByCode_System(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    account := &model.Account{
        TenantID:    nil,
        Code:        "SYSTEM_ACCOUNT",
        Name:        "System Account",
        AccountType: model.AccountTypeTracking,
        IsSystem:    true,
    }
    repo.Create(ctx, account)

    found, err := repo.GetByCode(ctx, nil, "SYSTEM_ACCOUNT")
    require.NoError(t, err)
    assert.Equal(t, account.ID, found.ID)
    assert.True(t, found.IsSystem)
}

func TestAccountRepository_Update(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    account := &model.Account{
        TenantID:    &tenantID,
        Code:        "OVERTIME",
        Name:        "Original Name",
        AccountType: model.AccountTypeBonus,
    }
    repo.Create(ctx, account)

    account.Name = "Updated Name"
    err := repo.Update(ctx, account)
    require.NoError(t, err)

    found, _ := repo.GetByID(ctx, account.ID)
    assert.Equal(t, "Updated Name", found.Name)
}

func TestAccountRepository_Delete(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    account := &model.Account{
        TenantID:    &tenantID,
        Code:        "OVERTIME",
        Name:        "To Delete",
        AccountType: model.AccountTypeBonus,
    }
    repo.Create(ctx, account)

    err := repo.Delete(ctx, account.ID)
    require.NoError(t, err)

    _, err = repo.GetByID(ctx, account.ID)
    assert.Error(t, err)
}

func TestAccountRepository_List(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.Account{
        TenantID:    &tenantID,
        Code:        "OVERTIME",
        Name:        "Overtime",
        AccountType: model.AccountTypeBonus,
    })
    repo.Create(ctx, &model.Account{
        TenantID:    &tenantID,
        Code:        "VACATION",
        Name:        "Vacation",
        AccountType: model.AccountTypeBalance,
    })

    accounts, err := repo.List(ctx, tenantID)
    require.NoError(t, err)
    assert.Len(t, accounts, 2)
}

func TestAccountRepository_ListWithSystem(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.Account{
        TenantID:    &tenantID,
        Code:        "OVERTIME",
        Name:        "Overtime",
        AccountType: model.AccountTypeBonus,
    })
    repo.Create(ctx, &model.Account{
        TenantID:    nil,
        Code:        "SYSTEM",
        Name:        "System Account",
        AccountType: model.AccountTypeTracking,
        IsSystem:    true,
    })

    accounts, err := repo.ListWithSystem(ctx, tenantID)
    require.NoError(t, err)
    assert.Len(t, accounts, 2)
}

func TestAccountRepository_GetSystemAccounts(t *testing.T) {
    db := testutil.SetupTestDB(t)
    repo := NewAccountRepository(db)
    ctx := context.Background()

    tenantID := uuid.New()
    repo.Create(ctx, &model.Account{
        TenantID:    &tenantID,
        Code:        "OVERTIME",
        Name:        "Overtime",
        AccountType: model.AccountTypeBonus,
    })
    repo.Create(ctx, &model.Account{
        TenantID:    nil,
        Code:        "SYSTEM",
        Name:        "System Account",
        AccountType: model.AccountTypeTracking,
        IsSystem:    true,
    })

    accounts, err := repo.GetSystemAccounts(ctx)
    require.NoError(t, err)
    assert.Len(t, accounts, 1)
    assert.True(t, accounts[0].IsSystem)
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] ListWithSystem includes both tenant and system accounts
- [x] AccountType and AccountUnit enums defined
- [x] Unit tests for all repository methods
- [x] Tests cover success and error cases

## Additional Implementation (beyond original ticket scope)

The following layers were added per user request:

### Service Layer
- Created `apps/api/internal/service/account.go`
- Created `apps/api/internal/service/account_test.go` (20 tests)
- Service validation for code, name, type
- Protection against deleting system accounts

### Handler Layer
- Created `apps/api/internal/handler/account.go`
- Created `apps/api/internal/handler/account_test.go` (21 tests)
- Added `RegisterAccountRoutes` in `routes.go`

### API Endpoints
- `GET /accounts` - List accounts (supports `?include_system=true`, `?active_only=true`)
- `POST /accounts` - Create account
- `GET /accounts/{id}` - Get account by ID
- `PATCH /accounts/{id}` - Update account
- `DELETE /accounts/{id}` - Delete account (prevents deleting system accounts)
