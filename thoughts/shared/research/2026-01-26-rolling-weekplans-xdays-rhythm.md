# Research: Rolling Week Plans and X-Days Rhythm

> **Date**: 2026-01-26
> **ZMI Reference**: Section 14.4-14.5 (Pages 92-93)
> **Status**: Research Complete

---

## 1. ZMI Specification Summary

### 1.1 Rolling Week Plans (Rollierende Wochenplaene)

**Original German (Page 92):**
> "Wochenplaene koennen auch rollierend, d.h. abwechselnd hintereinander, eingetragen werden, z.B. Fruehschicht - Spaetschicht - Nachtschicht im woechentlichen Wechsel."

**Translation:**
> "Week plans can also be entered rolling, i.e., alternating one after another, e.g., early shift - late shift - night shift in weekly rotation."

**Behavior:**
- A tariff can reference MULTIPLE week plans instead of just one
- Week plans rotate in sequence: Week 1 uses Plan A, Week 2 uses Plan B, Week 3 uses Plan C, Week 4 back to Plan A, etc.
- The rotation has a defined start date (when to begin the sequence)
- Commonly used for shift work patterns (Schichtarbeit)

**Example: 3-Week Rotation**
```
Week 1: Fruehschicht (Early Shift) - Mon-Fri 06:00-14:00
Week 2: Spaetschicht (Late Shift) - Mon-Fri 14:00-22:00
Week 3: Nachtschicht (Night Shift) - Mon-Fri 22:00-06:00
Week 4: (repeats) Fruehschicht
```

### 1.2 X-Days Rhythm (Zeitplan nach X-Tagen)

**Original German (Page 93):**
> "Wenn Sie das Zeitplan-Modell nach X-Tagen auswaehlen, geben Sie an, nach wie vielen Tagen sich die Zeitplaene wiederholen sollen."

**Translation:**
> "If you select the 'Every X days' time plan model, you specify after how many days the time plans should repeat."

**Behavior:**
- Instead of weekly rotation, use a custom day-based cycle
- Each position in the cycle (day 1, day 2, ..., day N) has its own day plan
- The cycle repeats after N days
- Not tied to weekdays (Mon-Sun), purely positional

**Example: 14-Day Cycle**
```
Day 1:  Work (Plan A)
Day 2:  Work (Plan A)
Day 3:  Work (Plan A)
Day 4:  Work (Plan A)
Day 5:  Off (no plan)
Day 6:  Off (no plan)
Day 7:  Work (Plan B)
Day 8:  Work (Plan B)
Day 9:  Work (Plan B)
Day 10: Work (Plan B)
Day 11: Off (no plan)
Day 12: Off (no plan)
Day 13: Off (no plan)
Day 14: Off (no plan)
(Then repeats from Day 1)
```

---

## 2. Current Implementation Status

### 2.1 Tariff Model (`apps/api/internal/model/tariff.go`)

```go
type Tariff struct {
    ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string     `gorm:"type:varchar(20);not null" json:"code"`
    Name        string     `gorm:"type:varchar(255);not null" json:"name"`
    Description *string    `gorm:"type:text" json:"description,omitempty"`
    WeekPlanID  *uuid.UUID `gorm:"type:uuid" json:"week_plan_id,omitempty"`  // <-- SINGLE week plan only
    ValidFrom   *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
    ValidTo     *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
    IsActive    bool       `gorm:"default:true" json:"is_active"`
    // ... ZMI fields for vacation, target hours, flextime ...
    WeekPlan *WeekPlan `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
}
```

**Limitations:**
- Only supports a SINGLE week plan (`WeekPlanID`)
- No rhythm type field (weekly vs x_days)
- No cycle configuration (cycle length, start date)
- No ordered list of week plans for rotation

### 2.2 Week Plan Model (`apps/api/internal/model/weekplan.go`)

```go
type WeekPlan struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string    `gorm:"type:varchar(20);not null" json:"code"`
    Name        string    `gorm:"type:varchar(255);not null" json:"name"`
    Description *string   `gorm:"type:text" json:"description,omitempty"`
    // Fixed 7-day structure
    MondayDayPlanID    *uuid.UUID
    TuesdayDayPlanID   *uuid.UUID
    WednesdayDayPlanID *uuid.UUID
    ThursdayDayPlanID  *uuid.UUID
    FridayDayPlanID    *uuid.UUID
    SaturdayDayPlanID  *uuid.UUID
    SundayDayPlanID    *uuid.UUID
    // ...
}
```

**Status:** Week plan structure is complete for single-plan use cases.

### 2.3 Tariff Migration (`db/migrations/000019_create_tariffs.up.sql`)

```sql
CREATE TABLE tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    week_plan_id UUID REFERENCES week_plans(id) ON DELETE SET NULL,  -- SINGLE reference
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

### 2.4 Employee Model (`apps/api/internal/model/employee.go`)

**Important Gap:** Employees do NOT have a `tariff_id` field. This needs to be added for the time plan assignment to work properly.

```go
type Employee struct {
    ID                  uuid.UUID
    TenantID            uuid.UUID
    // ... personal info ...
    DepartmentID        *uuid.UUID
    CostCenterID        *uuid.UUID
    EmploymentTypeID    *uuid.UUID
    // NOTE: No TariffID field!
    WeeklyHours         decimal.Decimal
    VacationDaysPerYear decimal.Decimal
    // ...
}
```

### 2.5 Employee Day Plans (`db/migrations/000023_create_employee_day_plans.up.sql`)

```sql
CREATE TABLE employee_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    employee_id UUID NOT NULL,
    plan_date DATE NOT NULL,
    day_plan_id UUID REFERENCES day_plans(id),
    source VARCHAR(20) DEFAULT 'tariff',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, plan_date)
);
```

**Status:** Can store per-day assignments, but no logic to populate from rolling/X-days rhythms.

---

## 3. Required Changes

### 3.1 Database Schema Changes

#### 3.1.1 Add Rhythm Fields to Tariffs

```sql
ALTER TABLE tariffs
    -- Rhythm type: 'weekly' (default), 'rolling_weekly', 'x_days'
    ADD COLUMN rhythm_type VARCHAR(20) DEFAULT 'weekly',

    -- For x_days rhythm: how many days in the cycle
    ADD COLUMN cycle_days INT,

    -- When the rhythm/cycle starts (for calculating current position)
    ADD COLUMN rhythm_start_date DATE;

ALTER TABLE tariffs
    ADD CONSTRAINT chk_rhythm_type
    CHECK (rhythm_type IN ('weekly', 'rolling_weekly', 'x_days'));

ALTER TABLE tariffs
    ADD CONSTRAINT chk_cycle_days
    CHECK (cycle_days IS NULL OR (cycle_days >= 1 AND cycle_days <= 365));

COMMENT ON COLUMN tariffs.rhythm_type IS 'ZMI: Time plan model - weekly, rolling_weekly, or x_days';
COMMENT ON COLUMN tariffs.cycle_days IS 'ZMI: For x_days rhythm, number of days in cycle';
COMMENT ON COLUMN tariffs.rhythm_start_date IS 'ZMI: Start date for rhythm calculation';
```

#### 3.1.2 Create Tariff Week Plans Join Table (for Rolling Weekly)

```sql
-- For rolling_weekly rhythm: ordered list of week plans
CREATE TABLE tariff_week_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    week_plan_id UUID NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
    sequence_order INT NOT NULL,  -- 1, 2, 3, ... for rotation order
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tariff_id, sequence_order),
    UNIQUE(tariff_id, week_plan_id)
);

CREATE INDEX idx_tariff_week_plans_tariff ON tariff_week_plans(tariff_id);

COMMENT ON TABLE tariff_week_plans IS 'Ordered week plans for rolling weekly rhythm';
COMMENT ON COLUMN tariff_week_plans.sequence_order IS 'Position in rotation (1-based)';
```

#### 3.1.3 Create Tariff Day Plans Table (for X-Days Rhythm)

```sql
-- For x_days rhythm: day plan per position in cycle
CREATE TABLE tariff_day_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    day_position INT NOT NULL,  -- 1 to cycle_days
    day_plan_id UUID REFERENCES day_plans(id) ON DELETE SET NULL,  -- NULL = off day
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tariff_id, day_position)
);

CREATE INDEX idx_tariff_day_plans_tariff ON tariff_day_plans(tariff_id);

COMMENT ON TABLE tariff_day_plans IS 'Day plans for X-days rhythm cycle';
COMMENT ON COLUMN tariff_day_plans.day_position IS 'Position in cycle (1 to cycle_days)';
COMMENT ON COLUMN tariff_day_plans.day_plan_id IS 'Day plan for this position, NULL = off day';
```

#### 3.1.4 Add Tariff Reference to Employees

```sql
ALTER TABLE employees
    ADD COLUMN tariff_id UUID REFERENCES tariffs(id) ON DELETE SET NULL;

CREATE INDEX idx_employees_tariff ON employees(tariff_id);

COMMENT ON COLUMN employees.tariff_id IS 'Employee tariff for time plan assignment';
```

### 3.2 Model Changes

#### 3.2.1 Update Tariff Model

```go
// RhythmType determines how time plans repeat
type RhythmType string

const (
    // RhythmTypeWeekly - Single week plan, same every week
    RhythmTypeWeekly RhythmType = "weekly"

    // RhythmTypeRollingWeekly - Multiple week plans rotating in sequence
    RhythmTypeRollingWeekly RhythmType = "rolling_weekly"

    // RhythmTypeXDays - Custom day cycle (not tied to weekdays)
    RhythmTypeXDays RhythmType = "x_days"
)

type Tariff struct {
    // ... existing fields ...

    // Keep week_plan_id for simple weekly rhythm (backwards compatibility)
    WeekPlanID  *uuid.UUID `gorm:"type:uuid" json:"week_plan_id,omitempty"`

    // NEW: Rhythm configuration
    RhythmType      RhythmType `gorm:"type:varchar(20);default:'weekly'" json:"rhythm_type"`
    CycleDays       *int       `gorm:"type:int" json:"cycle_days,omitempty"`
    RhythmStartDate *time.Time `gorm:"type:date" json:"rhythm_start_date,omitempty"`

    // Relations
    WeekPlan        *WeekPlan          `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
    TariffWeekPlans []TariffWeekPlan   `gorm:"foreignKey:TariffID" json:"tariff_week_plans,omitempty"`
    TariffDayPlans  []TariffDayPlan    `gorm:"foreignKey:TariffID" json:"tariff_day_plans,omitempty"`
    // ...
}
```

#### 3.2.2 New TariffWeekPlan Model

```go
// TariffWeekPlan links week plans to tariffs for rolling_weekly rhythm
type TariffWeekPlan struct {
    ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TariffID      uuid.UUID `gorm:"type:uuid;not null;index" json:"tariff_id"`
    WeekPlanID    uuid.UUID `gorm:"type:uuid;not null" json:"week_plan_id"`
    SequenceOrder int       `gorm:"type:int;not null" json:"sequence_order"`
    CreatedAt     time.Time `gorm:"default:now()" json:"created_at"`

    // Relations
    WeekPlan *WeekPlan `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
}

func (TariffWeekPlan) TableName() string {
    return "tariff_week_plans"
}
```

#### 3.2.3 New TariffDayPlan Model

```go
// TariffDayPlan assigns day plans to positions in x_days rhythm
type TariffDayPlan struct {
    ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TariffID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tariff_id"`
    DayPosition int        `gorm:"type:int;not null" json:"day_position"`  // 1-based
    DayPlanID   *uuid.UUID `gorm:"type:uuid" json:"day_plan_id,omitempty"` // NULL = off day
    CreatedAt   time.Time  `gorm:"default:now()" json:"created_at"`

    // Relations
    DayPlan *DayPlan `gorm:"foreignKey:DayPlanID" json:"day_plan,omitempty"`
}

func (TariffDayPlan) TableName() string {
    return "tariff_day_plans"
}
```

#### 3.2.4 Update Employee Model

```go
type Employee struct {
    // ... existing fields ...

    // NEW: Tariff reference
    TariffID *uuid.UUID `gorm:"type:uuid;index" json:"tariff_id,omitempty"`

    // Relations
    Tariff *Tariff `gorm:"foreignKey:TariffID" json:"tariff,omitempty"`
    // ...
}
```

### 3.3 API Changes

#### 3.3.1 Tariff Endpoints

**GET /tariffs/{id}** - Include rhythm configuration and related plans:
```json
{
  "id": "...",
  "code": "SHIFT-3W",
  "name": "3-Week Shift Rotation",
  "rhythm_type": "rolling_weekly",
  "rhythm_start_date": "2026-01-01",
  "tariff_week_plans": [
    { "sequence_order": 1, "week_plan": { "code": "EARLY", "name": "Early Shift" } },
    { "sequence_order": 2, "week_plan": { "code": "LATE", "name": "Late Shift" } },
    { "sequence_order": 3, "week_plan": { "code": "NIGHT", "name": "Night Shift" } }
  ]
}
```

**POST/PUT /tariffs** - Accept rhythm configuration:
```json
{
  "code": "SHIFT-3W",
  "name": "3-Week Shift Rotation",
  "rhythm_type": "rolling_weekly",
  "rhythm_start_date": "2026-01-01",
  "week_plan_ids": ["plan-a-uuid", "plan-b-uuid", "plan-c-uuid"]
}
```

Or for X-days:
```json
{
  "code": "14DAY",
  "name": "14-Day Rotation",
  "rhythm_type": "x_days",
  "cycle_days": 14,
  "rhythm_start_date": "2026-01-01",
  "day_plans": [
    { "position": 1, "day_plan_id": "work-plan-uuid" },
    { "position": 2, "day_plan_id": "work-plan-uuid" },
    { "position": 3, "day_plan_id": "work-plan-uuid" },
    { "position": 4, "day_plan_id": "work-plan-uuid" },
    { "position": 5, "day_plan_id": null },
    { "position": 6, "day_plan_id": null },
    { "position": 7, "day_plan_id": "other-plan-uuid" },
    ...
  ]
}
```

#### 3.3.2 Employee Endpoints

**PUT /employees/{id}** - Allow tariff assignment:
```json
{
  "tariff_id": "tariff-uuid"
}
```

### 3.4 Logic Changes

#### 3.4.1 Day Plan Resolution Logic

Add helper method to Tariff for resolving the correct day plan for any date:

```go
// GetDayPlanForDate returns the day plan for a specific date based on rhythm
func (t *Tariff) GetDayPlanForDate(date time.Time, weekPlans []TariffWeekPlan, dayPlans []TariffDayPlan) *uuid.UUID {
    switch t.RhythmType {
    case RhythmTypeWeekly:
        // Simple: use single week plan
        if t.WeekPlan == nil {
            return nil
        }
        return t.WeekPlan.GetDayPlanIDForWeekday(date.Weekday())

    case RhythmTypeRollingWeekly:
        // Calculate which week in rotation
        if t.RhythmStartDate == nil || len(weekPlans) == 0 {
            return nil
        }
        weeksSinceStart := int(date.Sub(*t.RhythmStartDate).Hours() / (24 * 7))
        if weeksSinceStart < 0 {
            weeksSinceStart = 0 // Before start date, use first plan
        }
        cyclePosition := weeksSinceStart % len(weekPlans)

        // Find week plan at this position
        for _, twp := range weekPlans {
            if twp.SequenceOrder == cyclePosition+1 { // 1-based
                if twp.WeekPlan != nil {
                    return twp.WeekPlan.GetDayPlanIDForWeekday(date.Weekday())
                }
            }
        }
        return nil

    case RhythmTypeXDays:
        // Calculate position in day cycle
        if t.RhythmStartDate == nil || t.CycleDays == nil || *t.CycleDays == 0 {
            return nil
        }
        daysSinceStart := int(date.Sub(*t.RhythmStartDate).Hours() / 24)
        if daysSinceStart < 0 {
            daysSinceStart = 0
        }
        cyclePosition := (daysSinceStart % *t.CycleDays) + 1 // 1-based

        // Find day plan at this position
        for _, tdp := range dayPlans {
            if tdp.DayPosition == cyclePosition {
                return tdp.DayPlanID
            }
        }
        return nil
    }

    return nil
}
```

#### 3.4.2 Employee Day Plan Population

Update the logic that populates `employee_day_plans` to use the new rhythm-aware resolution:

```go
func (s *DayPlanService) PopulateEmployeeDayPlans(ctx context.Context, employeeID uuid.UUID, startDate, endDate time.Time) error {
    // 1. Get employee with tariff
    employee, err := s.employeeRepo.GetByIDWithTariff(ctx, employeeID)
    if err != nil {
        return err
    }

    if employee.TariffID == nil {
        return nil // No tariff assigned
    }

    // 2. Get tariff with all rhythm data
    tariff, err := s.tariffRepo.GetByIDWithRhythm(ctx, *employee.TariffID)
    if err != nil {
        return err
    }

    // 3. Iterate each day and resolve day plan
    for date := startDate; !date.After(endDate); date = date.AddDate(0, 0, 1) {
        dayPlanID := tariff.GetDayPlanForDate(date, tariff.TariffWeekPlans, tariff.TariffDayPlans)

        // 4. Upsert employee_day_plan
        err := s.employeeDayPlanRepo.Upsert(ctx, EmployeeDayPlan{
            TenantID:   employee.TenantID,
            EmployeeID: employeeID,
            PlanDate:   date,
            DayPlanID:  dayPlanID,
            Source:     "tariff",
        })
        if err != nil {
            return err
        }
    }

    return nil
}
```

---

## 4. Migration Strategy

### Phase 1: Database Schema (Migration 000031)
1. Add rhythm fields to tariffs table
2. Create tariff_week_plans table
3. Create tariff_day_plans table
4. Add tariff_id to employees table

### Phase 2: Models
1. Update Tariff model with rhythm fields
2. Create TariffWeekPlan model
3. Create TariffDayPlan model
4. Update Employee model with TariffID

### Phase 3: Repositories
1. Update TariffRepository with rhythm data loading
2. Create TariffWeekPlanRepository
3. Create TariffDayPlanRepository
4. Update EmployeeRepository with tariff loading

### Phase 4: API
1. Update tariff OpenAPI schema
2. Update tariff handlers for CRUD with rhythm data
3. Update employee OpenAPI schema
4. Update employee handlers for tariff assignment

### Phase 5: Services
1. Update DayPlanService with rhythm-aware population logic
2. Add validation for rhythm configuration

---

## 5. Summary

| Feature | Current Status | Required Change |
|---------|---------------|-----------------|
| Single week plan per tariff | Implemented | Keep for `weekly` rhythm |
| Rolling week plans | Not implemented | New `tariff_week_plans` table + logic |
| X-days rhythm | Not implemented | New `tariff_day_plans` table + logic |
| Rhythm type selection | Not implemented | Add `rhythm_type` to tariffs |
| Cycle configuration | Not implemented | Add `cycle_days`, `rhythm_start_date` |
| Tariff on employee | Not implemented | Add `tariff_id` to employees |
| Day plan resolution | Single plan only | Add rhythm-aware resolution logic |

---

## 6. Open Questions

1. **Default rhythm_start_date**: If not specified, should we use:
   - The tariff's `valid_from` date?
   - The employee's `entry_date`?
   - A system-wide default?

2. **Retroactive changes**: If a tariff's rhythm is changed, should existing employee_day_plans be recalculated?

3. **Week numbering**: For rolling weekly, is the week number based on:
   - Calendar week (ISO week number)?
   - Weeks since rhythm_start_date?
   - The ZMI reference suggests weeks since rhythm_start_date.

4. **Employee-specific overrides**: Should employees be able to have their own rhythm_start_date that overrides the tariff's default?

---

**END OF RESEARCH**
