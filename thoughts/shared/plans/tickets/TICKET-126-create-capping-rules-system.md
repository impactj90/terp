# TICKET-126: Create Capping Rules System

**Type**: Migration + Model
**Effort**: M
**Sprint**: 17 - Monthly Calculation
**Dependencies**: TICKET-006 (accounts), TICKET-027 (employees)
**Priority**: MEDIUM

## Description

Create the capping rules system for year-end and mid-year flextime capping, including employee exemptions. This implements ZMI's Kappungsregeln which define how excess flextime is handled at specific times.

## ZMI Reference

> "Kappungsregeln: Am Jahresende oder zu bestimmten Zeitpunkten kann überschüssige Gleitzeit gekappt werden." (Section 20)

> "Obergrenze Gleitzeit: Maximaler positiver Gleitzeitstand" (Section 20)

> "Untergrenze Gleitzeit: Maximaler negativer Gleitzeitstand (Schulden)" (Section 20)

> "Ausnahmen: Bestimmte Mitarbeiter können von Kappungsregeln ausgenommen werden." (Section 20)

## Files to Create

- `db/migrations/000032_create_capping_rules.up.sql`
- `db/migrations/000032_create_capping_rules.down.sql`
- `apps/api/internal/model/capping_rule.go`
- `apps/api/internal/repository/capping_rule.go`
- `apps/api/internal/repository/capping_rule_test.go`

## Implementation

### Up Migration

```sql
-- Capping rules define when and how excess flextime is capped
-- ZMI Reference: Kappungsregeln (Section 20)
CREATE TABLE capping_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Rule identification
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- When capping occurs
    -- 'year_end' = December 31
    -- 'mid_year' = Specific date (e.g., June 30)
    -- 'monthly' = End of each month
    capping_type VARCHAR(20) NOT NULL DEFAULT 'year_end',

    -- For mid_year type: specific month/day
    capping_month INT, -- 1-12
    capping_day INT,   -- 1-31

    -- Capping limits (in minutes)
    -- ZMI: Obergrenze Gleitzeit
    positive_cap INT, -- Max positive balance (NULL = unlimited)

    -- ZMI: Untergrenze Gleitzeit
    negative_cap INT, -- Max negative balance as positive number (NULL = unlimited)

    -- What happens to capped time
    -- 'forfeit' = Time is lost
    -- 'transfer_account' = Transfer to specific account
    -- 'payout' = Mark for payout
    capped_time_action VARCHAR(20) NOT NULL DEFAULT 'forfeit',

    -- Target account for transferred time
    transfer_account_id UUID REFERENCES accounts(id),

    -- Rule priority (higher = checked first)
    priority INT NOT NULL DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER update_capping_rules_updated_at
    BEFORE UPDATE ON capping_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_capping_rules_tenant ON capping_rules(tenant_id);
CREATE UNIQUE INDEX idx_capping_rules_code ON capping_rules(tenant_id, code);
CREATE INDEX idx_capping_rules_type ON capping_rules(capping_type);

-- Add constraint for capping_type
ALTER TABLE capping_rules
    ADD CONSTRAINT chk_capping_type
    CHECK (capping_type IN ('year_end', 'mid_year', 'monthly'));

-- Add constraint for capped_time_action
ALTER TABLE capping_rules
    ADD CONSTRAINT chk_capped_time_action
    CHECK (capped_time_action IN ('forfeit', 'transfer_account', 'payout'));

-- Employee exemptions from capping rules
-- ZMI: Ausnahmen von Kappungsregeln
CREATE TABLE employee_capping_exemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    capping_rule_id UUID NOT NULL REFERENCES capping_rules(id) ON DELETE CASCADE,

    -- Exemption period
    valid_from DATE NOT NULL,
    valid_to DATE, -- NULL = indefinite

    -- Reason for exemption
    reason TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

-- Trigger for updated_at
CREATE TRIGGER update_employee_capping_exemptions_updated_at
    BEFORE UPDATE ON employee_capping_exemptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_employee_capping_exemptions_tenant ON employee_capping_exemptions(tenant_id);
CREATE INDEX idx_employee_capping_exemptions_employee ON employee_capping_exemptions(employee_id);
CREATE INDEX idx_employee_capping_exemptions_rule ON employee_capping_exemptions(capping_rule_id);
CREATE INDEX idx_employee_capping_exemptions_dates ON employee_capping_exemptions(valid_from, valid_to);

-- Comments
COMMENT ON TABLE capping_rules IS 'ZMI Kappungsregeln: Defines when/how excess flextime is capped';
COMMENT ON COLUMN capping_rules.positive_cap IS 'ZMI: Obergrenze Gleitzeit (in minutes)';
COMMENT ON COLUMN capping_rules.negative_cap IS 'ZMI: Untergrenze Gleitzeit (in minutes, stored positive)';
COMMENT ON TABLE employee_capping_exemptions IS 'ZMI: Employees exempt from specific capping rules';
```

### Down Migration

```sql
DROP TRIGGER IF EXISTS update_employee_capping_exemptions_updated_at ON employee_capping_exemptions;
DROP TABLE IF EXISTS employee_capping_exemptions;
DROP TRIGGER IF EXISTS update_capping_rules_updated_at ON capping_rules;
DROP TABLE IF EXISTS capping_rules;
```

### Model

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

// CappingType defines when capping occurs
type CappingType string

const (
    CappingTypeYearEnd CappingType = "year_end"
    CappingTypeMidYear CappingType = "mid_year"
    CappingTypeMonthly CappingType = "monthly"
)

// CappedTimeAction defines what happens to capped time
type CappedTimeAction string

const (
    CappedTimeActionForfeit         CappedTimeAction = "forfeit"
    CappedTimeActionTransferAccount CappedTimeAction = "transfer_account"
    CappedTimeActionPayout          CappedTimeAction = "payout"
)

// CappingRule defines flextime capping configuration
// ZMI: Kappungsregeln
type CappingRule struct {
    ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID    uuid.UUID `gorm:"type:uuid;not null"`
    Tenant      *Tenant   `gorm:"foreignKey:TenantID"`

    Code        string `gorm:"size:50;not null"`
    Name        string `gorm:"size:100;not null"`
    Description string

    // When capping occurs
    CappingType  CappingType `gorm:"size:20;not null;default:'year_end'"`
    CappingMonth *int        // 1-12 for mid_year type
    CappingDay   *int        // 1-31 for mid_year type

    // Capping limits (minutes)
    PositiveCap *int // ZMI: Obergrenze Gleitzeit
    NegativeCap *int // ZMI: Untergrenze Gleitzeit

    // What happens to capped time
    CappedTimeAction   CappedTimeAction `gorm:"size:20;not null;default:'forfeit'"`
    TransferAccountID  *uuid.UUID       `gorm:"type:uuid"`
    TransferAccount    *Account         `gorm:"foreignKey:TransferAccountID"`

    Priority int  `gorm:"not null;default:0"`
    IsActive bool `gorm:"default:true"`

    CreatedAt time.Time
    UpdatedAt time.Time
}

func (CappingRule) TableName() string {
    return "capping_rules"
}

// ApplyCapping applies this rule's capping to a flextime balance
func (c *CappingRule) ApplyCapping(balance int) (cappedBalance int, forfeited int) {
    cappedBalance = balance
    forfeited = 0

    // Apply positive cap
    if c.PositiveCap != nil && balance > *c.PositiveCap {
        forfeited = balance - *c.PositiveCap
        cappedBalance = *c.PositiveCap
    }

    // Apply negative cap (stored as positive)
    if c.NegativeCap != nil && balance < -*c.NegativeCap {
        // Don't track forfeited for negative (it's not "lost" time)
        cappedBalance = -*c.NegativeCap
    }

    return cappedBalance, forfeited
}

// ShouldApplyOn checks if this rule should apply on a given date
func (c *CappingRule) ShouldApplyOn(date time.Time) bool {
    switch c.CappingType {
    case CappingTypeYearEnd:
        return date.Month() == 12 && date.Day() == 31
    case CappingTypeMidYear:
        if c.CappingMonth != nil && c.CappingDay != nil {
            return int(date.Month()) == *c.CappingMonth && date.Day() == *c.CappingDay
        }
        return false
    case CappingTypeMonthly:
        // Last day of month
        nextMonth := date.AddDate(0, 1, 0)
        lastDay := nextMonth.AddDate(0, 0, -1)
        return date.Day() == lastDay.Day()
    default:
        return false
    }
}

// EmployeeCappingExemption defines employee exemption from a capping rule
type EmployeeCappingExemption struct {
    ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
    TenantID      uuid.UUID `gorm:"type:uuid;not null"`
    EmployeeID    uuid.UUID `gorm:"type:uuid;not null"`
    Employee      *Employee `gorm:"foreignKey:EmployeeID"`
    CappingRuleID uuid.UUID `gorm:"type:uuid;not null"`
    CappingRule   *CappingRule `gorm:"foreignKey:CappingRuleID"`

    ValidFrom time.Time `gorm:"not null"`
    ValidTo   *time.Time

    Reason    string
    CreatedBy *uuid.UUID `gorm:"type:uuid"`

    CreatedAt time.Time
    UpdatedAt time.Time
}

func (EmployeeCappingExemption) TableName() string {
    return "employee_capping_exemptions"
}

// IsActiveOn checks if exemption is active on a given date
func (e *EmployeeCappingExemption) IsActiveOn(date time.Time) bool {
    if date.Before(e.ValidFrom) {
        return false
    }
    if e.ValidTo != nil && date.After(*e.ValidTo) {
        return false
    }
    return true
}
```

## Unit Tests

```go
func TestCappingRule_ApplyCapping(t *testing.T) {
    tests := []struct {
        name            string
        positiveCap     *int
        negativeCap     *int
        balance         int
        expectedBalance int
        expectedForfeit int
    }{
        {
            name:            "no caps",
            balance:         500,
            expectedBalance: 500,
            expectedForfeit: 0,
        },
        {
            name:            "under positive cap",
            positiveCap:     intPtr(600),
            balance:         500,
            expectedBalance: 500,
            expectedForfeit: 0,
        },
        {
            name:            "over positive cap",
            positiveCap:     intPtr(400),
            balance:         500,
            expectedBalance: 400,
            expectedForfeit: 100,
        },
        {
            name:            "above negative cap",
            negativeCap:     intPtr(200),
            balance:         -100,
            expectedBalance: -100,
            expectedForfeit: 0,
        },
        {
            name:            "below negative cap",
            negativeCap:     intPtr(200),
            balance:         -300,
            expectedBalance: -200,
            expectedForfeit: 0, // Negative isn't forfeited
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            rule := &CappingRule{
                PositiveCap: tt.positiveCap,
                NegativeCap: tt.negativeCap,
            }
            balance, forfeited := rule.ApplyCapping(tt.balance)
            assert.Equal(t, tt.expectedBalance, balance)
            assert.Equal(t, tt.expectedForfeit, forfeited)
        })
    }
}

func TestCappingRule_ShouldApplyOn(t *testing.T) {
    tests := []struct {
        name     string
        rule     CappingRule
        date     time.Time
        expected bool
    }{
        {
            name:     "year_end on Dec 31",
            rule:     CappingRule{CappingType: CappingTypeYearEnd},
            date:     time.Date(2024, 12, 31, 0, 0, 0, 0, time.UTC),
            expected: true,
        },
        {
            name:     "year_end on other day",
            rule:     CappingRule{CappingType: CappingTypeYearEnd},
            date:     time.Date(2024, 6, 15, 0, 0, 0, 0, time.UTC),
            expected: false,
        },
        {
            name: "mid_year on configured day",
            rule: CappingRule{
                CappingType:  CappingTypeMidYear,
                CappingMonth: intPtr(6),
                CappingDay:   intPtr(30),
            },
            date:     time.Date(2024, 6, 30, 0, 0, 0, 0, time.UTC),
            expected: true,
        },
        {
            name:     "monthly on last day",
            rule:     CappingRule{CappingType: CappingTypeMonthly},
            date:     time.Date(2024, 2, 29, 0, 0, 0, 0, time.UTC), // Leap year
            expected: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := tt.rule.ShouldApplyOn(tt.date)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

## ZMI Compliance

| ZMI Feature | Implementation |
|-------------|----------------|
| Kappungsregeln | `capping_rules` table |
| Obergrenze Gleitzeit | `positive_cap` field |
| Untergrenze Gleitzeit | `negative_cap` field |
| Jahresende Kappung | `CappingTypeYearEnd` |
| Mitarbeiter Ausnahmen | `employee_capping_exemptions` table |

## Acceptance Criteria

- [ ] `make migrate-up` succeeds
- [ ] `make migrate-down` succeeds
- [ ] CappingRule model with CRUD operations
- [ ] EmployeeCappingExemption model with CRUD operations
- [ ] `ApplyCapping()` correctly limits positive/negative balances
- [ ] `ShouldApplyOn()` correctly identifies capping dates
- [ ] Exemption validity checking works
- [ ] All unit tests pass
- [ ] `make test` passes
