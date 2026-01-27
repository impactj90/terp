# Tariff Implementation ZMI Verification

**Date**: 2026-01-26
**Type**: Research / Verification
**Reference**: thoughts/shared/reference/zmi-calculation-manual-reference.md (Section 14 - Tarif)

## Overview

This document compares the current tariff implementation against the ZMI Time Manual specification (Version 6.4, dated 18.05.2022).

---

## 1. Current Implementation Analysis

### 1.1 Tariff Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tariff.go`

```go
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
    CreatedAt   time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt   time.Time  `gorm:"default:now()" json:"updated_at"`

    // Relations
    WeekPlan *WeekPlan     `gorm:"foreignKey:WeekPlanID" json:"week_plan,omitempty"`
    Breaks   []TariffBreak `gorm:"foreignKey:TariffID" json:"breaks,omitempty"`
}
```

**Fields Implemented**:
- Basic identification (ID, TenantID, Code, Name, Description)
- Week plan reference (WeekPlanID)
- Validity period (ValidFrom, ValidTo)
- Status (IsActive)
- Timestamps (CreatedAt, UpdatedAt)
- Break rules (via TariffBreak relation)

### 1.2 TariffBreak Model

**File**: `/home/tolga/projects/terp/apps/api/internal/model/tariff.go`

```go
type TariffBreak struct {
    ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TariffID         uuid.UUID `gorm:"type:uuid;not null;index" json:"tariff_id"`
    BreakType        BreakType `gorm:"type:varchar(20);not null" json:"break_type"`
    AfterWorkMinutes *int      `gorm:"type:int" json:"after_work_minutes,omitempty"`
    Duration         int       `gorm:"type:int;not null" json:"duration"`
    IsPaid           bool      `gorm:"default:false" json:"is_paid"`
    SortOrder        int       `gorm:"default:0" json:"sort_order"`
    CreatedAt        time.Time `gorm:"default:now()" json:"created_at"`
    UpdatedAt        time.Time `gorm:"default:now()" json:"updated_at"`
}
```

**Break Types Implemented**:
- `fixed` - Pause 1-3 (fest)
- `variable` - Pause 4 (variabel)
- `minimum` - Mindestpause 1/2 nach

### 1.3 Database Schema

**File**: `/home/tolga/projects/terp/db/migrations/000019_create_tariffs.up.sql`

```sql
CREATE TABLE tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    week_plan_id UUID REFERENCES week_plans(id) ON DELETE SET NULL,
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code)
);
```

**File**: `/home/tolga/projects/terp/db/migrations/000020_create_tariff_breaks.up.sql`

```sql
CREATE TABLE tariff_breaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES tariffs(id) ON DELETE CASCADE,
    break_type VARCHAR(20) NOT NULL,
    after_work_minutes INT,
    duration INT NOT NULL,
    is_paid BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.4 OpenAPI Schema

**File**: `/home/tolga/projects/terp/api/schemas/tariffs.yaml`

The OpenAPI schema mirrors the model with all implemented fields.

### 1.5 Service and Repository

**Files**:
- `/home/tolga/projects/terp/apps/api/internal/service/tariff.go`
- `/home/tolga/projects/terp/apps/api/internal/repository/tariff.go`

Standard CRUD operations with:
- Create tariff with validation
- Get by ID/code
- Update tariff
- Delete tariff
- List tariffs (all/active)
- Tariff break management

---

## 2. ZMI Reference Fields (Section 14 - Tarif)

### 2.1 Vacation Values (Page 85)

| ZMI Field | German | Description | Status |
|-----------|--------|-------------|--------|
| Jahresurlaub | Annual Vacation | Base annual vacation entitlement (e.g., 30 days) | NOT IMPLEMENTED |
| AT pro Woche | Work Days per Week | Number of weekly work days (e.g., 5) | NOT IMPLEMENTED |

**ZMI Manual Quote**:
> "Im Feld Jahresurlaub tragen Sie den Jahres-Urlaubsanspruch ein (z.B. 30 Tage).
> Im Feld AT pro Woche hinterlegen Sie die Anzahl der Wochenarbeitstage (z.B. 5). Diese Angaben sind wichtig für die Urlaubsberechnung."

### 2.2 Target Hours (Page 86-87)

| ZMI Field | German | Description | Status |
|-----------|--------|-------------|--------|
| Tagessollstunden | Daily Target Hours | Target hours per day | NOT IMPLEMENTED |
| Wochensollstunden | Weekly Target Hours | Target hours per week | NOT IMPLEMENTED |
| Monatssollstunden | Monthly Target Hours | Target hours per month | NOT IMPLEMENTED |
| Jahressollstunden | Annual Target Hours | Target hours per year | NOT IMPLEMENTED |

**ZMI Manual Quote**:
> "Tagessollstunden: Wird hier ein Wert eingetragen, kann im Tagesplan, mit Aktivieren der Funktion Aus Personalstamm holen, eine andere Sollzeit für den Tagesplan vorgegeben werden."

### 2.3 Time Plan Assignment (Page 89-93)

| ZMI Feature | Description | Status |
|-------------|-------------|--------|
| Weekly Rhythm | Assign week plan to tariff | IMPLEMENTED (WeekPlanID) |
| Rolling Week Plans | Multiple week plans rotating | NOT IMPLEMENTED |
| Every X Days Rhythm | Cycle-based day plan assignment | NOT IMPLEMENTED |

**ZMI Manual Quote**:
> "Wenn Sie wöchentlich wählen, können Sie unter Zeitplan dem/der Mitarbeiter/-in einen oder mehrere der zuvor angelegten Wochenpläne zuordnen."

> "Wochenpläne können auch rollierend, d.h. abwechselnd hintereinander, eingetragen werden, z.B. Frühschicht - Spätschicht - Nachtschicht im wöchentlichen Wechsel."

### 2.4 Monthly Evaluation (Page 59-60)

| ZMI Field | German | Description | Status |
|-----------|--------|-------------|--------|
| Maximale Gleitzeit im Monat | MaxFlextimePerMonth | Maximum monthly flextime credit | NOT IMPLEMENTED |
| Obergrenze Jahreszeitkonto | UpperLimitAnnual | Cap for annual flextime account | NOT IMPLEMENTED |
| Untergrenze Jahreszeitkonto | LowerLimitAnnual | Floor for annual flextime account | NOT IMPLEMENTED |
| Gleitzeitschwelle | FlextimeThreshold | Minimum overtime to qualify | NOT IMPLEMENTED |
| Art der Gutschrift | CreditType | How flextime is credited | NOT IMPLEMENTED |

**ZMI Manual Quote**:
> "Die Gleitzeitbewertung bietet folgende Möglichkeiten:
> Maximale Gleitzeit im Monat: Im Monat wird maximal dieser Wert auf das Gleitzeitkonto übertragen.
> Obergrenze Jahreszeitkonto: Wenn das Jahresgleitzeitkonto über dem eingetragenen Wert liegt, wird als Übertrag für den nachfolgenden Monat der eingetragene Wert übernommen."

### 2.5 Credit Types (Monthly Evaluation)

| ZMI Value | German | Description | Status |
|-----------|--------|-------------|--------|
| NoEvaluation | Keine Bewertung | 1:1 transfer to next month | NOT IMPLEMENTED |
| Complete | Gleitzeitübertrag komplett | Full transfer with limits | NOT IMPLEMENTED |
| AfterThreshold | Gleitzeitübertrag nach Schwelle | Only above threshold | NOT IMPLEMENTED |
| NoCarryover | Kein Übertrag | Reset to 0 at month end | NOT IMPLEMENTED |

**ZMI Manual Quote**:
> "Art der Gutschrift:
> - Keine Bewertung: Der vorhandene Gleitzeitwert wird 1 zu 1 in den nächsten Monat übernommen
> - Gleitzeitübertrag komplett: Die Mehrarbeitsstunden werden in Abhängigkeit von Obergrenze Jahreszeitkonto und Maximale Gleitzeit im Monat gutgeschrieben
> - Gleitzeitübertrag nach Schwelle: Erst wenn die monatliche Mehrarbeit größer als die eingetragene Schwelle ist, werden Stunden gutgeschrieben"

### 2.6 Vacation Basis (Page 211-214)

| ZMI Field | German | Description | Status |
|-----------|--------|-------------|--------|
| Urlaubsberechnung Basis | Vacation Basis | Calendar year vs entry date | NOT IMPLEMENTED |

**ZMI Manual Quote**:
> "Im Reiter Urlaubsberechnung können Sie einstellen, ob sich die Urlaubsberechnung auf das Kalenderjahr oder das Eintrittsdatum bezieht."

---

## 3. Implementation Gap Summary

### 3.1 Fields NOT Implemented in Current Tariff Model

| Field | ZMI Name | Purpose | Priority |
|-------|----------|---------|----------|
| `annual_vacation_days` | Jahresurlaub | Base vacation entitlement | HIGH |
| `work_days_per_week` | AT pro Woche | For vacation pro-rating | HIGH |
| `vacation_basis` | Urlaubsberechnung Basis | Calendar vs entry date | HIGH |
| `daily_target_hours` | Tagessollstunden | Daily target hours | MEDIUM |
| `weekly_target_hours` | Wochensollstunden | Weekly target hours | MEDIUM |
| `monthly_target_hours` | Monatssollstunden | Monthly target hours | MEDIUM |
| `annual_target_hours` | Jahressollstunden | Annual target hours | MEDIUM |
| `max_flextime_per_month` | Max Gleitzeit im Monat | Monthly flextime cap | HIGH |
| `upper_limit_annual` | Obergrenze Jahreszeitkonto | Annual flextime cap | HIGH |
| `lower_limit_annual` | Untergrenze Jahreszeitkonto | Annual flextime floor | MEDIUM |
| `flextime_threshold` | Gleitzeitschwelle | Overtime qualification threshold | MEDIUM |
| `credit_type` | Art der Gutschrift | How flextime is credited | HIGH |

### 3.2 Features NOT Implemented

| Feature | ZMI Description | Notes |
|---------|-----------------|-------|
| Rolling Week Plans | Multiple week plans in rotation | Current model only supports single WeekPlanID |
| X-Days Rhythm | Cycle-based day plan assignment | No support for day-based cycles |
| Time Plan Model Selection | Choose between weekly/x-days | No rhythm type field |

### 3.3 TariffBreak Gaps

| Missing Field | ZMI Feature | Notes |
|---------------|-------------|-------|
| `start_time` | Fixed break time window start | Present in DayPlanBreak but not TariffBreak |
| `end_time` | Fixed break time window end | Present in DayPlanBreak but not TariffBreak |
| `minutes_difference` | Minuten Differenz | Proportional deduction flag - present in DayPlanBreak but not TariffBreak |

---

## 4. Planned Work

### 4.1 TICKET-125: Add Tariff ZMI Fields Migration

**File**: `/home/tolga/projects/terp/thoughts/shared/plans/tickets/TICKET-125-add-tariff-zmi-fields-migration.md`

**Status**: Planned (not yet implemented)

Will add:
- `annual_vacation_days` - DECIMAL(5,2)
- `work_days_per_week` - INT DEFAULT 5
- `vacation_basis` - VARCHAR(20) DEFAULT 'calendar_year'

### 4.2 TICKET-131: Update Tariff Model with ZMI Fields

**File**: `/home/tolga/projects/terp/thoughts/shared/plans/tickets/TICKET-131-update-tariff-model-zmi-fields.md`

**Status**: Planned (depends on TICKET-125)

Will update Go model with:
- `AnnualVacationDays *decimal.Decimal`
- `WorkDaysPerWeek *int`
- `VacationBasis VacationBasis`
- Helper methods for vacation calculation

---

## 5. Fields Comparison Table

| ZMI Field | German | Current Status | Planned Ticket |
|-----------|--------|----------------|----------------|
| ID/Code | Kennung | IMPLEMENTED | - |
| Name | Bezeichnung | IMPLEMENTED | - |
| Description | Beschreibung | IMPLEMENTED | - |
| Week Plan | Wochenplan | IMPLEMENTED | - |
| Valid From | Gültig ab | IMPLEMENTED | - |
| Valid To | Gültig bis | IMPLEMENTED | - |
| Active | Aktiv | IMPLEMENTED | - |
| Breaks | Pausen | IMPLEMENTED | - |
| Annual Vacation | Jahresurlaub | NOT IMPLEMENTED | TICKET-125 |
| Work Days/Week | AT pro Woche | NOT IMPLEMENTED | TICKET-125 |
| Vacation Basis | Urlaubsberechnung | NOT IMPLEMENTED | TICKET-125 |
| Daily Target Hours | Tagessollstunden | NOT IMPLEMENTED | - |
| Weekly Target Hours | Wochensollstunden | NOT IMPLEMENTED | - |
| Monthly Target Hours | Monatssollstunden | NOT IMPLEMENTED | - |
| Annual Target Hours | Jahressollstunden | NOT IMPLEMENTED | - |
| Max Flextime/Month | Max Gleitzeit/Monat | NOT IMPLEMENTED | - |
| Upper Limit Annual | Obergrenze Jahr | NOT IMPLEMENTED | - |
| Lower Limit Annual | Untergrenze Jahr | NOT IMPLEMENTED | - |
| Flextime Threshold | Gleitzeitschwelle | NOT IMPLEMENTED | - |
| Credit Type | Gutschriftart | NOT IMPLEMENTED | - |
| Rolling Week Plans | Rollierender Wochenplan | NOT IMPLEMENTED | - |
| X-Days Rhythm | Alle X Tage | NOT IMPLEMENTED | - |

---

## 6. Break Type Comparison

### 6.1 ZMI Break Types (Section 5 - Pausen)

| ZMI Break Type | German | Description | Implementation Status |
|----------------|--------|-------------|----------------------|
| Pause 1 (fest) | Fixed Break 1 | Always deducted in time window | TariffBreak: `break_type=fixed` |
| Pause 2 (fest) | Fixed Break 2 | Same as Pause 1 (lunch) | TariffBreak: `break_type=fixed` |
| Pause 3 (fest) | Fixed Break 3 | Same as Pause 1 | TariffBreak: `break_type=fixed` |
| Pause 4 (variabel) | Variable Break | Skipped if manual break exists | TariffBreak: `break_type=variable` |
| Mindestpause 1 nach | Minimum Break 1 | After threshold hours | TariffBreak: `break_type=minimum` |
| Mindestpause 2 nach | Minimum Break 2 | After threshold hours | TariffBreak: `break_type=minimum` |

### 6.2 TariffBreak vs DayPlanBreak

| Field | TariffBreak | DayPlanBreak |
|-------|-------------|--------------|
| break_type | YES | YES |
| start_time | NO | YES |
| end_time | NO | YES |
| duration | YES | YES |
| after_work_minutes | YES | YES |
| is_paid | YES | YES |
| minutes_difference | NO | YES |
| auto_deduct | NO | YES |
| sort_order | YES | YES |

The TariffBreak model is simpler than DayPlanBreak. TariffBreak lacks:
- Time window fields (`start_time`, `end_time`) for fixed breaks
- `minutes_difference` flag for proportional deduction
- `auto_deduct` flag

---

## 7. Conclusion

### 7.1 What IS Implemented

1. **Basic Tariff Structure**: Code, name, description, validity dates, active status
2. **Week Plan Assignment**: Single week plan reference via `WeekPlanID`
3. **Break Rules**: Three break types (fixed, variable, minimum) with duration and threshold configuration
4. **Standard CRUD**: Full service and repository implementation with validation

### 7.2 What is NOT Implemented

1. **Vacation Configuration**: Annual vacation days, work days per week, vacation basis
2. **Target Hours**: Daily, weekly, monthly, annual target hours
3. **Monthly Evaluation**: Flextime caps, thresholds, and credit types
4. **Advanced Time Plans**: Rolling week plans, X-days rhythm

### 7.3 Planned Remediation

TICKET-125 and TICKET-131 will add:
- `annual_vacation_days`
- `work_days_per_week`
- `vacation_basis`

Additional tickets are needed for:
- Target hours fields
- Monthly evaluation fields
- Rolling/X-days time plan support

---

## 8. File References

| File | Purpose |
|------|---------|
| `/home/tolga/projects/terp/apps/api/internal/model/tariff.go` | Tariff and TariffBreak Go models |
| `/home/tolga/projects/terp/apps/api/internal/repository/tariff.go` | Data access layer |
| `/home/tolga/projects/terp/apps/api/internal/service/tariff.go` | Business logic layer |
| `/home/tolga/projects/terp/api/schemas/tariffs.yaml` | OpenAPI schema |
| `/home/tolga/projects/terp/db/migrations/000019_create_tariffs.up.sql` | Tariff table migration |
| `/home/tolga/projects/terp/db/migrations/000020_create_tariff_breaks.up.sql` | TariffBreak table migration |
| `/home/tolga/projects/terp/thoughts/shared/plans/tickets/TICKET-125-add-tariff-zmi-fields-migration.md` | Planned vacation fields migration |
| `/home/tolga/projects/terp/thoughts/shared/plans/tickets/TICKET-131-update-tariff-model-zmi-fields.md` | Planned model update |

---

**END OF DOCUMENT**
