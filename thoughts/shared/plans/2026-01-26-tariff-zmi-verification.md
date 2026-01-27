# Tariff ZMI Compliance Implementation Plan

**Date**: 2026-01-26
**Type**: Implementation Plan
**Based On**: thoughts/shared/research/2026-01-26-tariff-zmi-verification.md
**Related Tickets**: TICKET-125, TICKET-131

---

## Executive Summary

This plan brings the tariff implementation into full ZMI compliance by adding all missing fields identified in the research document. The existing planned tickets (TICKET-125 and TICKET-131) only cover vacation fields. This plan supersedes those tickets to include ALL ZMI fields.

---

## Gap Analysis Summary

### Currently Implemented
- Basic tariff fields (ID, Code, Name, Description, WeekPlanID, ValidFrom, ValidTo, IsActive)
- TariffBreak for break rules (fixed, variable, minimum)
- Single week plan assignment

### Missing Fields

| Category | Field | ZMI Name | Priority |
|----------|-------|----------|----------|
| **Vacation** | `annual_vacation_days` | Jahresurlaub | HIGH |
| **Vacation** | `work_days_per_week` | AT pro Woche | HIGH |
| **Vacation** | `vacation_basis` | Urlaubsberechnung Basis | HIGH |
| **Target Hours** | `daily_target_hours` | Tagessollstunden | MEDIUM |
| **Target Hours** | `weekly_target_hours` | Wochensollstunden | MEDIUM |
| **Target Hours** | `monthly_target_hours` | Monatssollstunden | MEDIUM |
| **Target Hours** | `annual_target_hours` | Jahressollstunden | MEDIUM |
| **Flextime** | `max_flextime_per_month` | Max Gleitzeit im Monat | HIGH |
| **Flextime** | `upper_limit_annual` | Obergrenze Jahreszeitkonto | HIGH |
| **Flextime** | `lower_limit_annual` | Untergrenze Jahreszeitkonto | MEDIUM |
| **Flextime** | `flextime_threshold` | Gleitzeitschwelle | MEDIUM |
| **Flextime** | `credit_type` | Art der Gutschrift | HIGH |

### Missing Features (Future Work)
- Rolling week plans (multiple week plans in rotation)
- X-days rhythm (cycle-based day plan assignment)

---

## Implementation Phases

### Phase 1: Database Migration

**File**: `db/migrations/000029_add_tariff_zmi_fields.up.sql`

```sql
-- Add ZMI-compliant fields to tariffs table
-- ZMI Reference: Tarif (Section 14), Gleitzeitbewertung (Section 5)

-- =====================================================
-- VACATION FIELDS (ZMI Section 14)
-- =====================================================

ALTER TABLE tariffs
    -- Base annual vacation days for this tariff
    -- ZMI: Jahresurlaub
    ADD COLUMN annual_vacation_days DECIMAL(5,2),

    -- Work days per week (for pro-rating)
    -- ZMI: AT pro Woche (Arbeitstage pro Woche)
    ADD COLUMN work_days_per_week INT DEFAULT 5,

    -- Vacation calculation basis
    -- ZMI: Urlaubsberechnung Basis
    -- 'calendar_year' = Jan 1 - Dec 31
    -- 'entry_date' = Anniversary-based
    ADD COLUMN vacation_basis VARCHAR(20) DEFAULT 'calendar_year';

-- =====================================================
-- TARGET HOURS FIELDS (ZMI Section 14)
-- =====================================================

ALTER TABLE tariffs
    -- Daily target hours
    -- ZMI: Tagessollstunden
    ADD COLUMN daily_target_hours DECIMAL(5,2),

    -- Weekly target hours
    -- ZMI: Wochensollstunden
    ADD COLUMN weekly_target_hours DECIMAL(5,2),

    -- Monthly target hours
    -- ZMI: Monatssollstunden
    ADD COLUMN monthly_target_hours DECIMAL(6,2),

    -- Annual target hours
    -- ZMI: Jahressollstunden
    ADD COLUMN annual_target_hours DECIMAL(7,2);

-- =====================================================
-- FLEXTIME/MONTHLY EVALUATION FIELDS (ZMI Section 5)
-- =====================================================

ALTER TABLE tariffs
    -- Maximum monthly flextime credit (in minutes)
    -- ZMI: Maximale Gleitzeit im Monat
    ADD COLUMN max_flextime_per_month INT,

    -- Upper limit for annual flextime account (in minutes)
    -- ZMI: Obergrenze Jahreszeitkonto
    ADD COLUMN upper_limit_annual INT,

    -- Lower limit for annual flextime account (in minutes, can be negative)
    -- ZMI: Untergrenze Jahreszeitkonto
    ADD COLUMN lower_limit_annual INT,

    -- Minimum overtime threshold to qualify for flextime credit (in minutes)
    -- ZMI: Gleitzeitschwelle
    ADD COLUMN flextime_threshold INT,

    -- How flextime is credited at month end
    -- ZMI: Art der Gutschrift
    -- 'no_evaluation' = Keine Bewertung (1:1 transfer)
    -- 'complete' = Gleitzeitübertrag komplett (with limits)
    -- 'after_threshold' = Gleitzeitübertrag nach Schwelle
    -- 'no_carryover' = Kein Übertrag (reset to 0)
    ADD COLUMN credit_type VARCHAR(20) DEFAULT 'no_evaluation';

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN tariffs.annual_vacation_days IS 'ZMI: Jahresurlaub - base vacation days per year';
COMMENT ON COLUMN tariffs.work_days_per_week IS 'ZMI: AT pro Woche - work days per week (default 5)';
COMMENT ON COLUMN tariffs.vacation_basis IS 'ZMI: Urlaubsberechnung - calendar_year or entry_date';
COMMENT ON COLUMN tariffs.daily_target_hours IS 'ZMI: Tagessollstunden - daily target hours';
COMMENT ON COLUMN tariffs.weekly_target_hours IS 'ZMI: Wochensollstunden - weekly target hours';
COMMENT ON COLUMN tariffs.monthly_target_hours IS 'ZMI: Monatssollstunden - monthly target hours';
COMMENT ON COLUMN tariffs.annual_target_hours IS 'ZMI: Jahressollstunden - annual target hours';
COMMENT ON COLUMN tariffs.max_flextime_per_month IS 'ZMI: Max Gleitzeit im Monat - max monthly flextime in minutes';
COMMENT ON COLUMN tariffs.upper_limit_annual IS 'ZMI: Obergrenze Jahreszeitkonto - annual flextime cap in minutes';
COMMENT ON COLUMN tariffs.lower_limit_annual IS 'ZMI: Untergrenze Jahreszeitkonto - annual flextime floor in minutes';
COMMENT ON COLUMN tariffs.flextime_threshold IS 'ZMI: Gleitzeitschwelle - overtime threshold in minutes';
COMMENT ON COLUMN tariffs.credit_type IS 'ZMI: Art der Gutschrift - how flextime is credited';

-- =====================================================
-- CONSTRAINTS
-- =====================================================

ALTER TABLE tariffs
    ADD CONSTRAINT chk_vacation_basis
    CHECK (vacation_basis IN ('calendar_year', 'entry_date'));

ALTER TABLE tariffs
    ADD CONSTRAINT chk_credit_type
    CHECK (credit_type IN ('no_evaluation', 'complete', 'after_threshold', 'no_carryover'));

ALTER TABLE tariffs
    ADD CONSTRAINT chk_work_days_per_week
    CHECK (work_days_per_week IS NULL OR (work_days_per_week >= 1 AND work_days_per_week <= 7));
```

**File**: `db/migrations/000029_add_tariff_zmi_fields.down.sql`

```sql
ALTER TABLE tariffs
    DROP CONSTRAINT IF EXISTS chk_vacation_basis,
    DROP CONSTRAINT IF EXISTS chk_credit_type,
    DROP CONSTRAINT IF EXISTS chk_work_days_per_week,
    DROP COLUMN IF EXISTS annual_vacation_days,
    DROP COLUMN IF EXISTS work_days_per_week,
    DROP COLUMN IF EXISTS vacation_basis,
    DROP COLUMN IF EXISTS daily_target_hours,
    DROP COLUMN IF EXISTS weekly_target_hours,
    DROP COLUMN IF EXISTS monthly_target_hours,
    DROP COLUMN IF EXISTS annual_target_hours,
    DROP COLUMN IF EXISTS max_flextime_per_month,
    DROP COLUMN IF EXISTS upper_limit_annual,
    DROP COLUMN IF EXISTS lower_limit_annual,
    DROP COLUMN IF EXISTS flextime_threshold,
    DROP COLUMN IF EXISTS credit_type;
```

---

### Phase 2: Model Updates

**File**: `apps/api/internal/model/tariff.go`

Add the following type definitions and fields:

```go
package model

import (
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

// VacationBasis determines how vacation year is calculated
// ZMI: Urlaubsberechnung Basis
type VacationBasis string

const (
    // VacationBasisCalendarYear - Jan 1 to Dec 31
    VacationBasisCalendarYear VacationBasis = "calendar_year"

    // VacationBasisEntryDate - Anniversary-based (hire date)
    VacationBasisEntryDate VacationBasis = "entry_date"
)

// CreditType determines how flextime is credited at month end
// ZMI: Art der Gutschrift
type CreditType string

const (
    // CreditTypeNoEvaluation - 1:1 transfer to next month
    // ZMI: Keine Bewertung
    CreditTypeNoEvaluation CreditType = "no_evaluation"

    // CreditTypeComplete - Full transfer with limits applied
    // ZMI: Gleitzeitübertrag komplett
    CreditTypeComplete CreditType = "complete"

    // CreditTypeAfterThreshold - Only credit above threshold
    // ZMI: Gleitzeitübertrag nach Schwelle
    CreditTypeAfterThreshold CreditType = "after_threshold"

    // CreditTypeNoCarryover - Reset to 0 at month end
    // ZMI: Kein Übertrag
    CreditTypeNoCarryover CreditType = "no_carryover"
)

// BreakType is defined in dayplan.go

type Tariff struct {
    ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Code        string     `gorm:"type:varchar(20);not null" json:"code"`
    Name        string     `gorm:"type:varchar(255);not null" json:"name"`
    Description *string    `gorm:"type:text" json:"description,omitempty"`
    WeekPlanID  *uuid.UUID `gorm:"type:uuid" json:"week_plan_id,omitempty"`
    ValidFrom   *time.Time `gorm:"type:date" json:"valid_from,omitempty"`
    ValidTo     *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
    IsActive    bool       `gorm:"default:true" json:"is_active"`

    // =====================================================
    // ZMI VACATION FIELDS (Section 14)
    // =====================================================

    // Base annual vacation days for this tariff
    // ZMI: Jahresurlaub
    AnnualVacationDays *decimal.Decimal `gorm:"type:decimal(5,2)" json:"annual_vacation_days,omitempty"`

    // Work days per week (for vacation pro-rating)
    // ZMI: AT pro Woche (Arbeitstage pro Woche)
    WorkDaysPerWeek *int `gorm:"default:5" json:"work_days_per_week,omitempty"`

    // Vacation calculation basis
    // ZMI: Urlaubsberechnung Basis
    VacationBasis VacationBasis `gorm:"type:varchar(20);default:'calendar_year'" json:"vacation_basis"`

    // =====================================================
    // ZMI TARGET HOURS FIELDS (Section 14)
    // =====================================================

    // Daily target hours
    // ZMI: Tagessollstunden
    DailyTargetHours *decimal.Decimal `gorm:"type:decimal(5,2)" json:"daily_target_hours,omitempty"`

    // Weekly target hours
    // ZMI: Wochensollstunden
    WeeklyTargetHours *decimal.Decimal `gorm:"type:decimal(5,2)" json:"weekly_target_hours,omitempty"`

    // Monthly target hours
    // ZMI: Monatssollstunden
    MonthlyTargetHours *decimal.Decimal `gorm:"type:decimal(6,2)" json:"monthly_target_hours,omitempty"`

    // Annual target hours
    // ZMI: Jahressollstunden
    AnnualTargetHours *decimal.Decimal `gorm:"type:decimal(7,2)" json:"annual_target_hours,omitempty"`

    // =====================================================
    // ZMI FLEXTIME/MONTHLY EVALUATION FIELDS (Section 5)
    // =====================================================

    // Maximum monthly flextime credit (in minutes)
    // ZMI: Maximale Gleitzeit im Monat
    MaxFlextimePerMonth *int `gorm:"type:int" json:"max_flextime_per_month,omitempty"`

    // Upper limit for annual flextime account (in minutes)
    // ZMI: Obergrenze Jahreszeitkonto
    UpperLimitAnnual *int `gorm:"type:int" json:"upper_limit_annual,omitempty"`

    // Lower limit for annual flextime account (in minutes, can be negative)
    // ZMI: Untergrenze Jahreszeitkonto
    LowerLimitAnnual *int `gorm:"type:int" json:"lower_limit_annual,omitempty"`

    // Minimum overtime threshold to qualify for flextime credit (in minutes)
    // ZMI: Gleitzeitschwelle
    FlextimeThreshold *int `gorm:"type:int" json:"flextime_threshold,omitempty"`

    // How flextime is credited at month end
    // ZMI: Art der Gutschrift
    CreditType CreditType `gorm:"type:varchar(20);default:'no_evaluation'" json:"credit_type"`

    // =====================================================
    // TIMESTAMPS
    // =====================================================

    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

    // Relations
    WeekPlan *WeekPlan     `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
    Breaks   []TariffBreak `gorm:"foreignKey:TariffID" json:"breaks,omitempty"`
}

// =====================================================
// HELPER METHODS
// =====================================================

// GetAnnualVacationDays returns the base vacation days, with fallback to 30
func (t *Tariff) GetAnnualVacationDays() decimal.Decimal {
    if t.AnnualVacationDays != nil {
        return *t.AnnualVacationDays
    }
    return decimal.NewFromInt(30) // Default 30 days
}

// GetWorkDaysPerWeek returns work days per week, with fallback to 5
func (t *Tariff) GetWorkDaysPerWeek() int {
    if t.WorkDaysPerWeek != nil {
        return *t.WorkDaysPerWeek
    }
    return 5 // Default 5 days
}

// GetVacationBasis returns the vacation basis, with default calendar_year
func (t *Tariff) GetVacationBasis() VacationBasis {
    if t.VacationBasis == "" {
        return VacationBasisCalendarYear
    }
    return t.VacationBasis
}

// IsCalendarYearBasis returns true if vacation uses calendar year
func (t *Tariff) IsCalendarYearBasis() bool {
    return t.GetVacationBasis() == VacationBasisCalendarYear
}

// IsEntryDateBasis returns true if vacation uses entry date (anniversary)
func (t *Tariff) IsEntryDateBasis() bool {
    return t.GetVacationBasis() == VacationBasisEntryDate
}

// GetCreditType returns the credit type, with default no_evaluation
func (t *Tariff) GetCreditType() CreditType {
    if t.CreditType == "" {
        return CreditTypeNoEvaluation
    }
    return t.CreditType
}

// CalculateProRatedVacation calculates vacation for part-time employee
// workDaysActual: actual work days per week for the employee
func (t *Tariff) CalculateProRatedVacation(workDaysActual int) decimal.Decimal {
    baseDays := t.GetAnnualVacationDays()
    standardDays := t.GetWorkDaysPerWeek()

    if standardDays == 0 || workDaysActual >= standardDays {
        return baseDays
    }

    // Pro-rate: baseDays * (actual / standard)
    ratio := decimal.NewFromInt(int64(workDaysActual)).Div(decimal.NewFromInt(int64(standardDays)))
    return baseDays.Mul(ratio)
}

// GetVacationYearStart returns the start of the vacation year for a given date
func (t *Tariff) GetVacationYearStart(referenceDate time.Time, hireDate *time.Time) time.Time {
    if t.IsEntryDateBasis() && hireDate != nil {
        year := referenceDate.Year()
        anniversary := time.Date(year, hireDate.Month(), hireDate.Day(), 0, 0, 0, 0, time.UTC)
        if anniversary.After(referenceDate) {
            anniversary = anniversary.AddDate(-1, 0, 0)
        }
        return anniversary
    }
    return time.Date(referenceDate.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
}

// GetVacationYearEnd returns the end of the vacation year for a given date
func (t *Tariff) GetVacationYearEnd(referenceDate time.Time, hireDate *time.Time) time.Time {
    start := t.GetVacationYearStart(referenceDate, hireDate)
    return start.AddDate(1, 0, -1)
}

// GetDailyTargetMinutes returns daily target in minutes
func (t *Tariff) GetDailyTargetMinutes() int {
    if t.DailyTargetHours != nil {
        return int(t.DailyTargetHours.Mul(decimal.NewFromInt(60)).IntPart())
    }
    return 0
}

// GetWeeklyTargetMinutes returns weekly target in minutes
func (t *Tariff) GetWeeklyTargetMinutes() int {
    if t.WeeklyTargetHours != nil {
        return int(t.WeeklyTargetHours.Mul(decimal.NewFromInt(60)).IntPart())
    }
    return 0
}
```

**Unit Tests File**: `apps/api/internal/model/tariff_zmi_test.go`

Create comprehensive unit tests for all helper methods (see TICKET-131 for template).

---

### Phase 3: Repository Updates

**File**: `apps/api/internal/repository/tariff.go`

The repository requires no changes - GORM will automatically handle the new fields. However, verify that `Update` method correctly handles all new nullable fields.

---

### Phase 4: Service Updates

**File**: `apps/api/internal/service/tariff.go`

Update input structs and create/update methods:

```go
// CreateTariffInput - Add new ZMI fields
type CreateTariffInput struct {
    TenantID    uuid.UUID
    Code        string
    Name        string
    Description *string
    WeekPlanID  *uuid.UUID
    ValidFrom   *time.Time
    ValidTo     *time.Time

    // ZMI Vacation Fields
    AnnualVacationDays *decimal.Decimal
    WorkDaysPerWeek    *int
    VacationBasis      model.VacationBasis

    // ZMI Target Hours Fields
    DailyTargetHours   *decimal.Decimal
    WeeklyTargetHours  *decimal.Decimal
    MonthlyTargetHours *decimal.Decimal
    AnnualTargetHours  *decimal.Decimal

    // ZMI Flextime Fields
    MaxFlextimePerMonth *int
    UpperLimitAnnual    *int
    LowerLimitAnnual    *int
    FlextimeThreshold   *int
    CreditType          model.CreditType
}

// UpdateTariffInput - Add new ZMI fields
type UpdateTariffInput struct {
    Name           *string
    Description    *string
    WeekPlanID     *uuid.UUID
    ValidFrom      *time.Time
    ValidTo        *time.Time
    IsActive       *bool
    ClearWeekPlan  bool
    ClearValidFrom bool
    ClearValidTo   bool

    // ZMI Vacation Fields
    AnnualVacationDays      *decimal.Decimal
    WorkDaysPerWeek         *int
    VacationBasis           *model.VacationBasis
    ClearAnnualVacationDays bool

    // ZMI Target Hours Fields
    DailyTargetHours        *decimal.Decimal
    WeeklyTargetHours       *decimal.Decimal
    MonthlyTargetHours      *decimal.Decimal
    AnnualTargetHours       *decimal.Decimal
    ClearDailyTargetHours   bool
    ClearWeeklyTargetHours  bool
    ClearMonthlyTargetHours bool
    ClearAnnualTargetHours  bool

    // ZMI Flextime Fields
    MaxFlextimePerMonth      *int
    UpperLimitAnnual         *int
    LowerLimitAnnual         *int
    FlextimeThreshold        *int
    CreditType               *model.CreditType
    ClearMaxFlextimePerMonth bool
    ClearUpperLimitAnnual    bool
    ClearLowerLimitAnnual    bool
    ClearFlextimeThreshold   bool
}
```

Update `Create` method to populate all new fields:

```go
tariff := &model.Tariff{
    // ... existing fields ...

    // ZMI Vacation Fields
    AnnualVacationDays: input.AnnualVacationDays,
    WorkDaysPerWeek:    input.WorkDaysPerWeek,
    VacationBasis:      input.VacationBasis,

    // ZMI Target Hours Fields
    DailyTargetHours:   input.DailyTargetHours,
    WeeklyTargetHours:  input.WeeklyTargetHours,
    MonthlyTargetHours: input.MonthlyTargetHours,
    AnnualTargetHours:  input.AnnualTargetHours,

    // ZMI Flextime Fields
    MaxFlextimePerMonth: input.MaxFlextimePerMonth,
    UpperLimitAnnual:    input.UpperLimitAnnual,
    LowerLimitAnnual:    input.LowerLimitAnnual,
    FlextimeThreshold:   input.FlextimeThreshold,
    CreditType:          input.CreditType,
}
```

Update `Update` method to handle all new fields with clear flags.

Add validation:
- `work_days_per_week` must be 1-7 if provided
- `vacation_basis` must be valid enum value
- `credit_type` must be valid enum value

---

### Phase 5: Handler/API Updates

**File**: `apps/api/internal/handler/tariff.go`

Update Create handler to parse all new fields from request:

```go
func (h *TariffHandler) Create(w http.ResponseWriter, r *http.Request) {
    // ... existing code ...

    input := service.CreateTariffInput{
        TenantID: tenantID,
        Code:     *req.Code,
        Name:     *req.Name,
    }

    // ... existing optional fields ...

    // ZMI Vacation Fields
    if req.AnnualVacationDays != nil {
        d := decimal.NewFromFloat(*req.AnnualVacationDays)
        input.AnnualVacationDays = &d
    }
    if req.WorkDaysPerWeek != nil {
        input.WorkDaysPerWeek = req.WorkDaysPerWeek
    }
    if req.VacationBasis != "" {
        input.VacationBasis = model.VacationBasis(req.VacationBasis)
    }

    // ZMI Target Hours Fields
    if req.DailyTargetHours != nil {
        d := decimal.NewFromFloat(*req.DailyTargetHours)
        input.DailyTargetHours = &d
    }
    // ... similar for weekly, monthly, annual ...

    // ZMI Flextime Fields
    if req.MaxFlextimePerMonth != nil {
        input.MaxFlextimePerMonth = req.MaxFlextimePerMonth
    }
    // ... similar for other flextime fields ...

    // ... rest of handler ...
}
```

Update Update handler similarly.

---

### Phase 6: OpenAPI Schema Updates

**File**: `api/schemas/tariffs.yaml`

Update `Tariff` schema:

```yaml
Tariff:
  type: object
  required:
    - id
    - tenant_id
    - code
    - name
  properties:
    # ... existing properties ...

    # ZMI Vacation Fields
    annual_vacation_days:
      type: number
      format: decimal
      description: "ZMI: Jahresurlaub - Base annual vacation days"
      example: 30.0
      x-nullable: true
    work_days_per_week:
      type: integer
      minimum: 1
      maximum: 7
      description: "ZMI: AT pro Woche - Work days per week for vacation pro-rating"
      example: 5
      x-nullable: true
    vacation_basis:
      type: string
      enum:
        - calendar_year
        - entry_date
      description: "ZMI: Urlaubsberechnung Basis - Vacation year calculation basis"
      example: "calendar_year"

    # ZMI Target Hours Fields
    daily_target_hours:
      type: number
      format: decimal
      description: "ZMI: Tagessollstunden - Daily target hours"
      example: 8.0
      x-nullable: true
    weekly_target_hours:
      type: number
      format: decimal
      description: "ZMI: Wochensollstunden - Weekly target hours"
      example: 40.0
      x-nullable: true
    monthly_target_hours:
      type: number
      format: decimal
      description: "ZMI: Monatssollstunden - Monthly target hours"
      example: 173.33
      x-nullable: true
    annual_target_hours:
      type: number
      format: decimal
      description: "ZMI: Jahressollstunden - Annual target hours"
      example: 2080.0
      x-nullable: true

    # ZMI Flextime Fields
    max_flextime_per_month:
      type: integer
      description: "ZMI: Max Gleitzeit im Monat - Max monthly flextime credit in minutes"
      example: 600
      x-nullable: true
    upper_limit_annual:
      type: integer
      description: "ZMI: Obergrenze Jahreszeitkonto - Annual flextime cap in minutes"
      example: 2400
      x-nullable: true
    lower_limit_annual:
      type: integer
      description: "ZMI: Untergrenze Jahreszeitkonto - Annual flextime floor in minutes (can be negative)"
      example: -600
      x-nullable: true
    flextime_threshold:
      type: integer
      description: "ZMI: Gleitzeitschwelle - Overtime threshold in minutes"
      example: 60
      x-nullable: true
    credit_type:
      type: string
      enum:
        - no_evaluation
        - complete
        - after_threshold
        - no_carryover
      description: "ZMI: Art der Gutschrift - How flextime is credited at month end"
      example: "no_evaluation"
```

Update `CreateTariffRequest`:

```yaml
CreateTariffRequest:
  type: object
  required:
    - code
    - name
  properties:
    # ... existing properties ...

    # ZMI Vacation Fields
    annual_vacation_days:
      type: number
      format: decimal
    work_days_per_week:
      type: integer
      minimum: 1
      maximum: 7
    vacation_basis:
      type: string
      enum:
        - calendar_year
        - entry_date

    # ZMI Target Hours Fields
    daily_target_hours:
      type: number
      format: decimal
    weekly_target_hours:
      type: number
      format: decimal
    monthly_target_hours:
      type: number
      format: decimal
    annual_target_hours:
      type: number
      format: decimal

    # ZMI Flextime Fields
    max_flextime_per_month:
      type: integer
    upper_limit_annual:
      type: integer
    lower_limit_annual:
      type: integer
    flextime_threshold:
      type: integer
    credit_type:
      type: string
      enum:
        - no_evaluation
        - complete
        - after_threshold
        - no_carryover
```

Update `UpdateTariffRequest` similarly.

---

## Verification Steps

### Phase 1 Verification
- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] All 12 new columns exist in tariffs table
- [ ] Constraints are correctly applied
- [ ] Existing tariff data unaffected

### Phase 2 Verification
- [ ] Model compiles without errors
- [ ] All new fields have correct GORM tags
- [ ] VacationBasis enum values match DB constraint
- [ ] CreditType enum values match DB constraint
- [ ] Helper methods have comprehensive unit tests
- [ ] `make test` passes

### Phase 3 Verification
- [ ] Repository handles new nullable fields correctly
- [ ] Preloading still works correctly

### Phase 4 Verification
- [ ] CreateTariffInput includes all new fields
- [ ] UpdateTariffInput includes all new fields with clear flags
- [ ] Validation enforces enum values
- [ ] `make test` passes

### Phase 5 Verification
- [ ] Handler parses all new fields from request
- [ ] Handler correctly handles null/empty values
- [ ] API returns all new fields in response

### Phase 6 Verification
- [ ] `make swagger-bundle` succeeds
- [ ] `make generate` succeeds
- [ ] Generated models include all new fields
- [ ] Swagger UI shows all new fields

### Integration Tests
- [ ] Create tariff with all ZMI fields - verify stored correctly
- [ ] Update tariff ZMI fields - verify changes persisted
- [ ] Clear nullable ZMI fields - verify set to NULL
- [ ] List tariffs - verify all fields returned
- [ ] Vacation pro-rating calculation works correctly
- [ ] Flextime credit type is respected in monthly calculations

---

## ZMI Field Reference

| Field | ZMI German | Type | Default | Notes |
|-------|------------|------|---------|-------|
| `annual_vacation_days` | Jahresurlaub | DECIMAL(5,2) | NULL | Days per year |
| `work_days_per_week` | AT pro Woche | INT | 5 | 1-7 range |
| `vacation_basis` | Urlaubsberechnung | VARCHAR(20) | 'calendar_year' | enum |
| `daily_target_hours` | Tagessollstunden | DECIMAL(5,2) | NULL | Hours |
| `weekly_target_hours` | Wochensollstunden | DECIMAL(5,2) | NULL | Hours |
| `monthly_target_hours` | Monatssollstunden | DECIMAL(6,2) | NULL | Hours |
| `annual_target_hours` | Jahressollstunden | DECIMAL(7,2) | NULL | Hours |
| `max_flextime_per_month` | Max Gleitzeit/Monat | INT | NULL | Minutes |
| `upper_limit_annual` | Obergrenze Jahr | INT | NULL | Minutes |
| `lower_limit_annual` | Untergrenze Jahr | INT | NULL | Minutes (neg) |
| `flextime_threshold` | Gleitzeitschwelle | INT | NULL | Minutes |
| `credit_type` | Art der Gutschrift | VARCHAR(20) | 'no_evaluation' | enum |

---

## Future Work (Not in Scope)

These features are documented for future implementation:

1. **Rolling Week Plans**: Support for multiple week plans rotating in sequence
   - Requires new `tariff_week_plans` junction table
   - Add `week_number` field for rotation order

2. **X-Days Rhythm**: Cycle-based day plan assignment
   - Requires new `rhythm_type` field ('weekly' vs 'x_days')
   - Add `rhythm_days` field for cycle length
   - New `tariff_day_plans` table for day-based cycles

---

## Dependencies

This plan supersedes:
- TICKET-125: Add Tariff ZMI Fields Migration (vacation fields only)
- TICKET-131: Update Tariff Model with ZMI Fields (vacation fields only)

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Migration | XS (1 hour) |
| Phase 2: Model | S (2-3 hours) |
| Phase 3: Repository | XS (verify only) |
| Phase 4: Service | S (2-3 hours) |
| Phase 5: Handler | S (2-3 hours) |
| Phase 6: OpenAPI | S (1-2 hours) |
| **Total** | **M (8-12 hours)** |

---

**END OF PLAN**
