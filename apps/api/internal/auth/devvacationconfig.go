package auth

import "github.com/google/uuid"

// UUID range: 17000-17099 for vacation config entities

// --- Special Calculations ---

var (
	DevSpecialCalcAgeOver50ID        = uuid.MustParse("00000000-0000-0000-0000-000000017001")
	DevSpecialCalcTenure5ID          = uuid.MustParse("00000000-0000-0000-0000-000000017002")
	DevSpecialCalcTenure10ID         = uuid.MustParse("00000000-0000-0000-0000-000000017003")
	DevSpecialCalcDisabilityID       = uuid.MustParse("00000000-0000-0000-0000-000000017004")
	DevSpecialCalcAgeOver60ID        = uuid.MustParse("00000000-0000-0000-0000-000000017005")
	DevSpecialCalcTenure20InactiveID = uuid.MustParse("00000000-0000-0000-0000-000000017006")
)

// DevSpecialCalc holds seed data for a vacation special calculation.
type DevSpecialCalc struct {
	ID        uuid.UUID
	Type      string
	Threshold int
	BonusDays float64
	Desc      string
	IsActive  bool
}

// DevSpecialCalcs contains special calculation seed data.
//
// | Type       | Threshold | Bonus | Description                  | Active |
// |------------|-----------|-------|------------------------------|--------|
// | age        | 50        | 2     | +2 days at age 50            | true   |
// | tenure     | 5         | 1     | +1 day after 5 years         | true   |
// | tenure     | 10        | 2     | +2 days after 10 years       | true   |
// | disability | 0         | 5     | +5 days for disability       | true   |
// | age        | 60        | 3     | +3 days at age 60            | true   |
// | tenure     | 20        | 3     | +3 days after 20 yrs (inact) | false  |
var DevSpecialCalcs = []DevSpecialCalc{
	{DevSpecialCalcAgeOver50ID, "age", 50, 2, "Additional 2 days for employees over 50", true},
	{DevSpecialCalcTenure5ID, "tenure", 5, 1, "Additional 1 day after 5 years of service", true},
	{DevSpecialCalcTenure10ID, "tenure", 10, 2, "Additional 2 days after 10 years of service", true},
	{DevSpecialCalcDisabilityID, "disability", 0, 5, "Additional 5 days for severe disability", true},
	{DevSpecialCalcAgeOver60ID, "age", 60, 3, "Additional 3 days for employees over 60", true},
	{DevSpecialCalcTenure20InactiveID, "tenure", 20, 3, "Additional 3 days after 20 years (inactive)", false},
}

// GetDevSpecialCalcs returns all dev special calculations.
func GetDevSpecialCalcs() []DevSpecialCalc {
	return DevSpecialCalcs
}

// --- Calculation Groups ---

var (
	DevCalcGroupStandardID = uuid.MustParse("00000000-0000-0000-0000-000000017010")
	DevCalcGroupEntryID    = uuid.MustParse("00000000-0000-0000-0000-000000017011")
)

// DevCalcGroup holds seed data for a vacation calculation group.
type DevCalcGroup struct {
	ID             uuid.UUID
	Code           string
	Name           string
	Desc           string
	Basis          string
	IsActive       bool
	SpecialCalcIDs []uuid.UUID
}

// DevCalcGroups contains calculation group seed data.
var DevCalcGroups = []DevCalcGroup{
	{
		DevCalcGroupStandardID, "STANDARD", "Standard Vacation Group",
		"Default calculation group for calendar year basis",
		"calendar_year", true,
		[]uuid.UUID{DevSpecialCalcAgeOver50ID, DevSpecialCalcTenure5ID, DevSpecialCalcTenure10ID, DevSpecialCalcDisabilityID},
	},
	{
		DevCalcGroupEntryID, "ENTRY_BASED", "Entry Date Group",
		"Calculation group based on employee entry date",
		"entry_date", true,
		[]uuid.UUID{DevSpecialCalcAgeOver60ID, DevSpecialCalcTenure5ID},
	},
}

// GetDevCalcGroups returns all dev calculation groups.
func GetDevCalcGroups() []DevCalcGroup {
	return DevCalcGroups
}

// --- Capping Rules ---

var (
	DevCappingRuleYearEndID    = uuid.MustParse("00000000-0000-0000-0000-000000017020")
	DevCappingRuleMarch31ID    = uuid.MustParse("00000000-0000-0000-0000-000000017021")
	DevCappingRuleForfeitAllID = uuid.MustParse("00000000-0000-0000-0000-000000017022")
)

// DevCappingRule holds seed data for a vacation capping rule.
type DevCappingRule struct {
	ID          uuid.UUID
	Code        string
	Name        string
	Desc        string
	RuleType    string
	CutoffMonth int
	CutoffDay   int
	CapValue    float64
	IsActive    bool
}

// DevCappingRules contains capping rule seed data.
//
// | Code        | Rule Type | Cutoff      | Cap  | Description              |
// |-------------|-----------|-------------|------|--------------------------|
// | YEAR_END_10 | year_end  | December 31 | 10   | Cap at 10 days year-end  |
// | MID_YEAR_5  | mid_year  | March 31    | 5    | Cap at 5 days March 31   |
// | FORFEIT_ALL | year_end  | December 31 | 0    | Forfeit all at year-end  |
var DevCappingRules = []DevCappingRule{
	{DevCappingRuleYearEndID, "YEAR_END_10", "Year-End Cap (10 days)", "Carry over maximum 10 days at year end", "year_end", 12, 31, 10, true},
	{DevCappingRuleMarch31ID, "MID_YEAR_5", "March 31 Cap (5 days)", "Previous year vacation capped at 5 days after March 31", "mid_year", 3, 31, 5, true},
	{DevCappingRuleForfeitAllID, "FORFEIT_ALL", "Year-End Forfeit All", "All remaining vacation forfeited at year end", "year_end", 12, 31, 0, true},
}

// GetDevCappingRules returns all dev capping rules.
func GetDevCappingRules() []DevCappingRule {
	return DevCappingRules
}

// --- Capping Rule Groups ---

var (
	DevCappingGroupStandardID = uuid.MustParse("00000000-0000-0000-0000-000000017030")
	DevCappingGroupStrictID   = uuid.MustParse("00000000-0000-0000-0000-000000017031")
)

// DevCappingRuleGroup holds seed data for a capping rule group.
type DevCappingRuleGroup struct {
	ID             uuid.UUID
	Code           string
	Name           string
	Desc           string
	IsActive       bool
	CappingRuleIDs []uuid.UUID
}

// DevCappingRuleGroups contains capping rule group seed data.
var DevCappingRuleGroups = []DevCappingRuleGroup{
	{
		DevCappingGroupStandardID, "STANDARD_CAPPING", "Standard Capping",
		"Year-end cap at 10 days plus March 31 carryover cap",
		true,
		[]uuid.UUID{DevCappingRuleYearEndID, DevCappingRuleMarch31ID},
	},
	{
		DevCappingGroupStrictID, "STRICT_CAPPING", "Strict Capping",
		"Forfeit all vacation at year end",
		true,
		[]uuid.UUID{DevCappingRuleForfeitAllID},
	},
}

// GetDevCappingRuleGroups returns all dev capping rule groups.
func GetDevCappingRuleGroups() []DevCappingRuleGroup {
	return DevCappingRuleGroups
}

// --- Employee Capping Exceptions ---

var (
	DevExceptionAnnaPartialID = uuid.MustParse("00000000-0000-0000-0000-000000017040")
	DevExceptionThomasFullID  = uuid.MustParse("00000000-0000-0000-0000-000000017041")
)

// DevEmployeeCappingException holds seed data for an employee capping exception.
type DevEmployeeCappingException struct {
	ID            uuid.UUID
	EmployeeID    uuid.UUID
	CappingRuleID uuid.UUID
	ExemptionType string
	RetainDays    *float64
	Year          *int
	Notes         string
	IsActive      bool
}

// DevEmployeeCappingExceptions contains employee exception seed data.
var DevEmployeeCappingExceptions = []DevEmployeeCappingException{
	{
		ID: DevExceptionAnnaPartialID, EmployeeID: DevEmployeeAnnaID,
		CappingRuleID: DevCappingRuleYearEndID, ExemptionType: "partial",
		RetainDays: ptrFloat(5), Year: ptrInt(2026),
		Notes: "Anna retains up to 5 days despite year-end capping", IsActive: true,
	},
	{
		ID: DevExceptionThomasFullID, EmployeeID: DevEmployeeThomasID,
		CappingRuleID: DevCappingRuleYearEndID, ExemptionType: "full",
		RetainDays: nil, Year: nil,
		Notes: "Thomas is fully exempt from year-end capping (all years)", IsActive: true,
	},
}

// GetDevEmployeeCappingExceptions returns all dev employee capping exceptions.
func GetDevEmployeeCappingExceptions() []DevEmployeeCappingException {
	return DevEmployeeCappingExceptions
}

func ptrFloat(f float64) *float64 { return &f }
func ptrInt(i int) *int           { return &i }
