# TICKET-002: Create Tenant Model

**Type**: Model
**Effort**: XS
**Sprint**: 1 - Multi-Tenant Foundation
**Dependencies**: TICKET-001

## Description

Create the Tenant model struct with GORM tags matching the migration schema.

## Files to Create

- `apps/api/internal/model/tenant.go`

## Implementation

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "gorm.io/datatypes"
)

type Tenant struct {
    ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    Name      string         `gorm:"type:varchar(255);not null" json:"name"`
    Slug      string         `gorm:"type:varchar(100);not null;uniqueIndex" json:"slug"`
    Settings  datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"settings"`
    IsActive  bool           `gorm:"default:true" json:"is_active"`
    CreatedAt time.Time      `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time      `gorm:"default:now()" json:"updated_at"`
}

func (Tenant) TableName() string {
    return "tenants"
}
```

## Acceptance Criteria

- [x] Compiles without errors
- [x] `make lint` passes
- [x] Struct tags match migration schema
- [x] TableName() returns "tenants"
