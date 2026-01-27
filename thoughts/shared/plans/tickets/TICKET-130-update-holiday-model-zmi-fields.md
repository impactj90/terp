# TICKET-130: Update Holiday Model with ZMI Fields

**Type**: Model Update
**Effort**: XS
**Sprint**: 13 - Absence Types
**Dependencies**: TICKET-124 (migration)
**Priority**: HIGH (after TICKET-124)

## Description

Update the Holiday Go model with the new ZMI fields added in TICKET-124 migration for absence code override and priority-based conflict resolution.

## ZMI Reference

> "Das Kürzel am Feiertag bedeutet, dass ZMI Time bei Feiertagen ein anderes Fehltagekürzel verwenden soll." (Section 18)

> "Die Priorität gibt vor, welche Berechnung zum Tragen kommt, falls zusätzlich zum Feiertag ein Fehltag eingetragen ist." (Section 18)

## Files to Modify

- `apps/api/internal/model/holiday.go`

## Files to Create

- `apps/api/internal/model/holiday_zmi_test.go`

## Implementation

### Model Updates

```go
// Add to model/holiday.go

// Add these fields to the Holiday struct:

// Alternative absence code to use on this holiday
// ZMI: Kürzel am Feiertag
AbsenceCode *string `gorm:"size:10" json:"absence_code,omitempty"`

// Priority for conflict resolution (holiday vs absence)
// Higher number = higher priority
// ZMI: Priorität
Priority int `gorm:"default:0" json:"priority"`

// Helper methods

// GetEffectiveCode returns the absence code to use on this holiday
// Returns AbsenceCode if set, otherwise returns a default based on category
func (h *Holiday) GetEffectiveCode() string {
    if h.AbsenceCode != nil && *h.AbsenceCode != "" {
        return *h.AbsenceCode
    }
    // Default codes by category
    switch h.Category {
    case 1:
        return "FT1" // Feiertag Kategorie 1
    case 2:
        return "FT2" // Feiertag Kategorie 2
    case 3:
        return "FT3" // Feiertag Kategorie 3
    default:
        return "FT"
    }
}

// HasHigherPriority checks if this holiday has higher priority than given absence priority
func (h *Holiday) HasHigherPriority(absencePriority int) bool {
    return h.Priority > absencePriority
}

// ShouldOverrideAbsence determines if holiday should take precedence over an absence
// Returns true if holiday should be used, false if absence should be used
func (h *Holiday) ShouldOverrideAbsence(absencePriority int) bool {
    // Higher priority wins
    return h.Priority >= absencePriority
}

// GetCreditMinutes returns the time credit for this holiday based on category and target
// This integrates with day plan holiday credit settings
func (h *Holiday) GetCreditMinutes(targetTime int, customCredits map[int]*int) int {
    // Check if custom credit is set for this category
    if customCredits != nil {
        if credit, ok := customCredits[h.Category]; ok && credit != nil {
            return *credit
        }
    }

    // Default credits by category
    switch h.Category {
    case 1:
        return targetTime // Full target time
    case 2:
        return targetTime / 2 // Half target time (or average, handled elsewhere)
    case 3:
        return 0 // No credit
    default:
        return 0
    }
}
```

### Unit Tests

```go
// File: model/holiday_zmi_test.go
package model

import (
    "testing"

    "github.com/stretchr/testify/assert"
)

func TestHoliday_GetEffectiveCode(t *testing.T) {
    tests := []struct {
        name        string
        absenceCode *string
        category    int
        expected    string
    }{
        {
            name:        "custom code set",
            absenceCode: strPtr("XMAS"),
            category:    1,
            expected:    "XMAS",
        },
        {
            name:        "empty custom code uses default",
            absenceCode: strPtr(""),
            category:    1,
            expected:    "FT1",
        },
        {
            name:        "nil code category 1",
            absenceCode: nil,
            category:    1,
            expected:    "FT1",
        },
        {
            name:        "nil code category 2",
            absenceCode: nil,
            category:    2,
            expected:    "FT2",
        },
        {
            name:        "nil code category 3",
            absenceCode: nil,
            category:    3,
            expected:    "FT3",
        },
        {
            name:        "nil code unknown category",
            absenceCode: nil,
            category:    0,
            expected:    "FT",
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            h := &Holiday{
                AbsenceCode: tt.absenceCode,
                Category:    tt.category,
            }
            assert.Equal(t, tt.expected, h.GetEffectiveCode())
        })
    }
}

func TestHoliday_HasHigherPriority(t *testing.T) {
    tests := []struct {
        name            string
        holidayPriority int
        absencePriority int
        expected        bool
    }{
        {
            name:            "holiday higher",
            holidayPriority: 10,
            absencePriority: 5,
            expected:        true,
        },
        {
            name:            "absence higher",
            holidayPriority: 5,
            absencePriority: 10,
            expected:        false,
        },
        {
            name:            "equal priority",
            holidayPriority: 5,
            absencePriority: 5,
            expected:        false, // Not strictly higher
        },
        {
            name:            "both zero",
            holidayPriority: 0,
            absencePriority: 0,
            expected:        false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            h := &Holiday{Priority: tt.holidayPriority}
            assert.Equal(t, tt.expected, h.HasHigherPriority(tt.absencePriority))
        })
    }
}

func TestHoliday_ShouldOverrideAbsence(t *testing.T) {
    tests := []struct {
        name            string
        holidayPriority int
        absencePriority int
        expected        bool
    }{
        {
            name:            "holiday higher - override",
            holidayPriority: 10,
            absencePriority: 5,
            expected:        true,
        },
        {
            name:            "absence higher - no override",
            holidayPriority: 5,
            absencePriority: 10,
            expected:        false,
        },
        {
            name:            "equal priority - holiday wins",
            holidayPriority: 5,
            absencePriority: 5,
            expected:        true, // Holiday wins ties
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            h := &Holiday{Priority: tt.holidayPriority}
            assert.Equal(t, tt.expected, h.ShouldOverrideAbsence(tt.absencePriority))
        })
    }
}

func TestHoliday_GetCreditMinutes(t *testing.T) {
    tests := []struct {
        name          string
        category      int
        targetTime    int
        customCredits map[int]*int
        expected      int
    }{
        {
            name:          "category 1 default - full target",
            category:      1,
            targetTime:    480,
            customCredits: nil,
            expected:      480,
        },
        {
            name:          "category 2 default - half target",
            category:      2,
            targetTime:    480,
            customCredits: nil,
            expected:      240,
        },
        {
            name:          "category 3 default - no credit",
            category:      3,
            targetTime:    480,
            customCredits: nil,
            expected:      0,
        },
        {
            name:       "category 1 custom credit",
            category:   1,
            targetTime: 480,
            customCredits: map[int]*int{
                1: intPtr(450),
            },
            expected: 450,
        },
        {
            name:       "category 3 custom credit",
            category:   3,
            targetTime: 480,
            customCredits: map[int]*int{
                3: intPtr(100), // Custom non-zero for category 3
            },
            expected: 100,
        },
        {
            name:       "custom credits but not for this category",
            category:   2,
            targetTime: 480,
            customCredits: map[int]*int{
                1: intPtr(450), // Only category 1 custom
            },
            expected: 240, // Falls back to default
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            h := &Holiday{Category: tt.category}
            assert.Equal(t, tt.expected, h.GetCreditMinutes(tt.targetTime, tt.customCredits))
        })
    }
}

// Helper functions
func strPtr(s string) *string {
    return &s
}

func intPtr(i int) *int {
    return &i
}
```

## Usage in Daily Calculation

```go
// In service/daily_calc.go handleHolidayCredit
func (s *dailyCalcService) handleHolidayCredit(...) *model.DailyValue {
    // Get holiday for this date
    holiday, _ := s.holidayRepo.GetByDate(ctx, tenantID, date)
    if holiday == nil {
        return nil
    }

    // Check for absence on same day
    absence, _ := s.absenceRepo.GetByEmployeeDate(ctx, employeeID, date)

    // Resolve priority conflict
    if absence != nil && absence.AbsenceType != nil {
        if !holiday.ShouldOverrideAbsence(absence.AbsenceType.Priority) {
            // Absence wins - use absence handling instead
            return s.handleAbsenceCredit(ctx, employeeID, date, empDayPlan, absence)
        }
    }

    // Holiday wins - calculate holiday credit
    customCredits := map[int]*int{
        1: empDayPlan.DayPlan.HolidayCreditCat1,
        2: empDayPlan.DayPlan.HolidayCreditCat2,
        3: empDayPlan.DayPlan.HolidayCreditCat3,
    }

    credit := holiday.GetCreditMinutes(targetTime, customCredits)

    dv := &model.DailyValue{
        EmployeeID: employeeID,
        ValueDate:  date,
        NetTime:    credit,
        GrossTime:  credit,
        Warnings:   []string{"HOLIDAY:" + holiday.GetEffectiveCode()},
    }

    return dv
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Kürzel am Feiertag | `AbsenceCode`, `GetEffectiveCode()` |
| Priorität | `Priority`, `HasHigherPriority()`, `ShouldOverrideAbsence()` |
| Zeitgutschrift Kategorien | `GetCreditMinutes()` |

## Acceptance Criteria

- [ ] `AbsenceCode` field added to Holiday model
- [ ] `Priority` field added with default 0
- [ ] `GetEffectiveCode()` returns custom or default code
- [ ] Priority comparison methods work correctly
- [ ] `GetCreditMinutes()` respects custom credits
- [ ] All unit tests pass
- [ ] `make test` passes
