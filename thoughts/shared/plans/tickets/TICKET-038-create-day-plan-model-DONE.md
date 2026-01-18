# TICKET-038: Create Day Plan Model

**Type**: Model
**Effort**: S
**Sprint**: 6 - Day Plans
**Dependencies**: TICKET-035, TICKET-036, TICKET-037

## Description

Create the DayPlan model with breaks and bonuses relationships.

## Files to Create

- `apps/api/internal/model/dayplan.go`

## Implementation

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

type PlanType string

const (
    PlanTypeFixed    PlanType = "fixed"
    PlanTypeFlextime PlanType = "flextime"
)

type RoundingType string

const (
    RoundingNone    RoundingType = "none"
    RoundingUp      RoundingType = "up"
    RoundingDown    RoundingType = "down"
    RoundingNearest RoundingType = "nearest"
)

type DayPlan struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(20);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description string    `gorm:"type:text" json:"description,omitempty"`
    PlanType    PlanType  `gorm:"type:varchar(20);not null;default:'fixed'" json:"plan_type"`

    // Time windows (minutes from midnight)
    ComeFrom  *int `gorm:"type:int" json:"come_from,omitempty"`
    ComeTo    *int `gorm:"type:int" json:"come_to,omitempty"`
    GoFrom    *int `gorm:"type:int" json:"go_from,omitempty"`
    GoTo      *int `gorm:"type:int" json:"go_to,omitempty"`
    CoreStart *int `gorm:"type:int" json:"core_start,omitempty"`
    CoreEnd   *int `gorm:"type:int" json:"core_end,omitempty"`

    // Target hours
    RegularHours int `gorm:"type:int;not null;default:480" json:"regular_hours"`

    // Tolerance settings
    ToleranceComePlus  int `gorm:"type:int;default:0" json:"tolerance_come_plus"`
    ToleranceComeMinus int `gorm:"type:int;default:0" json:"tolerance_come_minus"`
    ToleranceGoPlus    int `gorm:"type:int;default:0" json:"tolerance_go_plus"`
    ToleranceGoMinus   int `gorm:"type:int;default:0" json:"tolerance_go_minus"`

    // Rounding settings
    RoundingComeType     *RoundingType `gorm:"type:varchar(20)" json:"rounding_come_type,omitempty"`
    RoundingComeInterval *int          `gorm:"type:int" json:"rounding_come_interval,omitempty"`
    RoundingGoType       *RoundingType `gorm:"type:varchar(20)" json:"rounding_go_type,omitempty"`
    RoundingGoInterval   *int          `gorm:"type:int" json:"rounding_go_interval,omitempty"`

    // Caps
    MinWorkTime    *int `gorm:"type:int" json:"min_work_time,omitempty"`
    MaxNetWorkTime *int `gorm:"type:int" json:"max_net_work_time,omitempty"`

    IsActive  bool      `gorm:"default:true" json:"is_active"`
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    Breaks  []DayPlanBreak `gorm:"foreignKey:DayPlanID" json:"breaks,omitempty"`
    Bonuses []DayPlanBonus `gorm:"foreignKey:DayPlanID" json:"bonuses,omitempty"`
}

func (DayPlan) TableName() string {
    return "day_plans"
}

type BreakType string

const (
    BreakTypeFixed    BreakType = "fixed"
    BreakTypeVariable BreakType = "variable"
    BreakTypeMinimum  BreakType = "minimum"
)

type DayPlanBreak struct {
    ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    DayPlanID        uuid.UUID `gorm:"type:uuid;not null;index" json:"day_plan_id"`
    BreakType        BreakType `gorm:"type:varchar(20);not null" json:"break_type"`
    StartTime        *int      `gorm:"type:int" json:"start_time,omitempty"`
    EndTime          *int      `gorm:"type:int" json:"end_time,omitempty"`
    Duration         int       `gorm:"type:int;not null" json:"duration"`
    AfterWorkMinutes *int      `gorm:"type:int" json:"after_work_minutes,omitempty"`
    AutoDeduct       bool      `gorm:"default:true" json:"auto_deduct"`
    IsPaid           bool      `gorm:"default:false" json:"is_paid"`
    SortOrder        int       `gorm:"default:0" json:"sort_order"`
    CreatedAt        time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt        time.Time `gorm:"default:now()" json:"updated_at"`
}

func (DayPlanBreak) TableName() string {
    return "day_plan_breaks"
}

type CalculationType string

const (
    CalculationFixed      CalculationType = "fixed"
    CalculationPerMinute  CalculationType = "per_minute"
    CalculationPercentage CalculationType = "percentage"
)

type DayPlanBonus struct {
    ID              uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    DayPlanID       uuid.UUID       `gorm:"type:uuid;not null;index" json:"day_plan_id"`
    AccountID       uuid.UUID       `gorm:"type:uuid;not null;index" json:"account_id"`
    TimeFrom        int             `gorm:"type:int;not null" json:"time_from"`
    TimeTo          int             `gorm:"type:int;not null" json:"time_to"`
    CalculationType CalculationType `gorm:"type:varchar(20);not null" json:"calculation_type"`
    ValueMinutes    int             `gorm:"type:int;not null" json:"value_minutes"`
    MinWorkMinutes  *int            `gorm:"type:int" json:"min_work_minutes,omitempty"`
    AppliesOnHoliday bool           `gorm:"default:false" json:"applies_on_holiday"`
    SortOrder       int             `gorm:"default:0" json:"sort_order"`
    CreatedAt       time.Time       `gorm:"default:now()" json:"created_at"`
    UpdatedAt       time.Time       `gorm:"default:now()" json:"updated_at"`

    // Relations
    Account *Account `gorm:"foreignKey:AccountID" json:"account,omitempty"`
}

func (DayPlanBonus) TableName() string {
    return "day_plan_bonuses"
}
```

## Acceptance Criteria

- [ ] Compiles without errors
- [ ] `make lint` passes
- [ ] All enums defined (PlanType, RoundingType, BreakType, CalculationType)
- [ ] Relationships to breaks and bonuses defined
