# TICKET-116: Create End-to-End Integration Test

**Type**: Test
**Effort**: L
**Sprint**: 28 - Integration Tests
**Dependencies**: TICKET-111, TICKET-112, TICKET-113, TICKET-114, TICKET-115

## Description

Create comprehensive end-to-end test covering the full workflow.

## Files to Create

- `apps/api/internal/integration/e2e_test.go`

## Implementation

```go
package integration

import (
    "encoding/json"
    "net/http"
    "testing"
    "time"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

// TestFullWorkflow tests the complete employee time tracking lifecycle
func TestFullWorkflow(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    // ========================================
    // Phase 1: Setup tenant and configuration
    // ========================================

    t.Log("Phase 1: Setting up tenant and configuration")

    // Create tenant
    tenant := createTestTenant(t, server)
    require.NotEmpty(t, tenant["id"])

    // Create user groups
    adminGroup := createUserGroup(t, server, tenant["id"].(string), "Administrators", []string{"admin", "manage_employees", "close_months"})
    employeeGroup := createUserGroup(t, server, tenant["id"].(string), "Employees", []string{"view_own", "create_booking"})

    // Create departments
    itDept := createDepartment(t, server, tenant["id"].(string), "IT", nil)
    hrDept := createDepartment(t, server, tenant["id"].(string), "HR", nil)

    // Create cost centers
    ccIT := createCostCenter(t, server, tenant["id"].(string), "CC-IT", "IT Department")
    ccHR := createCostCenter(t, server, tenant["id"].(string), "CC-HR", "HR Department")

    // Create absence types
    vacationType := createAbsenceType(t, server, tenant["id"].(string), "Vacation", "U", true)
    sickType := createAbsenceType(t, server, tenant["id"].(string), "Sick Leave", "K", false)

    // Create day plans
    standardDayPlan := createStandardDayPlan(t, server, tenant["id"].(string))

    // Create week plan
    weekPlan := createWeekPlan(t, server, tenant["id"].(string), standardDayPlan["id"].(string))

    // Create tariff with break rules
    tariff := createTariff(t, server, tenant["id"].(string))

    // Create evaluation rules
    evalRules := createEvaluationRulesWithCaps(t, server, tenant["id"].(string), 120, 60) // +2h/-1h caps

    t.Log("Phase 1 complete: Tenant configured")

    // ========================================
    // Phase 2: Create employees
    // ========================================

    t.Log("Phase 2: Creating employees")

    employee1 := createFullEmployee(t, server, tenant["id"].(string), "John", "Doe", "john.doe@example.com",
        itDept["id"].(string), ccIT["id"].(string), weekPlan["id"].(string), tariff["id"].(string))

    employee2 := createFullEmployee(t, server, tenant["id"].(string), "Jane", "Smith", "jane.smith@example.com",
        hrDept["id"].(string), ccHR["id"].(string), weekPlan["id"].(string), tariff["id"].(string))

    // Set vacation entitlements
    setVacationEntitlement(t, server, employee1["id"].(string), 25)
    setVacationEntitlement(t, server, employee2["id"].(string), 30)

    t.Log("Phase 2 complete: Employees created")

    // ========================================
    // Phase 3: Record time for a month
    // ========================================

    t.Log("Phase 3: Recording time entries")

    lastMonth := time.Now().AddDate(0, -1, 0)
    year := lastMonth.Year()
    month := int(lastMonth.Month())

    // Employee 1: Normal workdays with some overtime
    recordMonthlyTime(t, server, employee1["id"].(string), year, month, []DayRecord{
        {Weekday: time.Monday, Come: "08:00", Go: "17:30"}, // 30 min overtime
        {Weekday: time.Tuesday, Come: "08:00", Go: "17:00"},
        {Weekday: time.Wednesday, Come: "08:00", Go: "18:00"}, // 1 hour overtime
        {Weekday: time.Thursday, Come: "08:00", Go: "17:00"},
        {Weekday: time.Friday, Come: "08:00", Go: "16:00"}, // 1 hour undertime
    })

    // Employee 2: Mixed with absences
    recordMonthlyTime(t, server, employee2["id"].(string), year, month, []DayRecord{
        {Weekday: time.Monday, Come: "09:00", Go: "18:00"},
        {Weekday: time.Tuesday, Come: "09:00", Go: "18:00"},
        // Wednesday-Friday: Vacation
    })

    // Create vacation for employee 2
    createApprovedVacation(t, server, employee2["id"].(string), vacationType["id"].(string),
        getDateOfWeekday(year, month, 3, time.Wednesday).Format("2006-01-02"),
        getDateOfWeekday(year, month, 3, time.Friday).Format("2006-01-02"))

    t.Log("Phase 3 complete: Time recorded")

    // ========================================
    // Phase 4: Verify daily calculations
    // ========================================

    t.Log("Phase 4: Verifying daily calculations")

    // Check employee 1's Monday
    mondayDate := getDateOfWeekday(year, month, 1, time.Monday).Format("2006-01-02")
    resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee1["id"].(string)+"/"+mondayDate, nil)
    assert.Equal(t, http.StatusOK, resp.Code)

    var mondayValue map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &mondayValue)

    assert.Equal(t, float64(570), mondayValue["gross_time"]) // 9.5 hours
    assert.True(t, mondayValue["overtime"].(float64) > 0)

    t.Log("Phase 4 complete: Daily calculations verified")

    // ========================================
    // Phase 5: Close month
    // ========================================

    t.Log("Phase 5: Closing month")

    // Close for both employees
    resp = makeRequest(t, server, "POST",
        "/api/v1/monthly/"+employee1["id"].(string)+"/"+formatYearMonth(year, month)+"/close", nil)
    assert.Equal(t, http.StatusOK, resp.Code)

    resp = makeRequest(t, server, "POST",
        "/api/v1/monthly/"+employee2["id"].(string)+"/"+formatYearMonth(year, month)+"/close", nil)
    assert.Equal(t, http.StatusOK, resp.Code)

    // Verify monthly totals
    resp = makeRequest(t, server, "GET",
        "/api/v1/monthly/"+employee1["id"].(string)+"/"+formatYearMonth(year, month), nil)
    var monthlyValue map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &monthlyValue)

    assert.Equal(t, true, monthlyValue["is_closed"])
    assert.True(t, monthlyValue["work_days"].(float64) > 0)

    t.Log("Phase 5 complete: Month closed")

    // ========================================
    // Phase 6: Export payroll
    // ========================================

    t.Log("Phase 6: Exporting payroll")

    req := map[string]interface{}{
        "year":          year,
        "month":         month,
        "export_format": "csv",
    }
    resp = makeRequest(t, server, "POST", "/api/v1/payroll-exports", req)
    assert.Equal(t, http.StatusCreated, resp.Code)

    var export map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &export)

    // Process export
    resp = makeRequest(t, server, "POST", "/api/v1/payroll-exports/"+export["id"].(string)+"/process", nil)
    assert.Equal(t, http.StatusAccepted, resp.Code)

    // Wait for processing
    time.Sleep(3 * time.Second)

    // Verify export completed
    resp = makeRequest(t, server, "GET", "/api/v1/payroll-exports/"+export["id"].(string), nil)
    json.Unmarshal(resp.Body.Bytes(), &export)
    assert.Equal(t, "completed", export["status"])
    assert.Equal(t, float64(2), export["record_count"]) // 2 employees

    t.Log("Phase 6 complete: Payroll exported")

    // ========================================
    // Phase 7: Verify audit trail
    // ========================================

    t.Log("Phase 7: Verifying audit trail")

    resp = makeRequest(t, server, "GET", "/api/v1/audit?entity_type=monthly_value", nil)
    assert.Equal(t, http.StatusOK, resp.Code)

    var auditLogs map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &auditLogs)

    logs := auditLogs["data"].([]interface{})
    assert.NotEmpty(t, logs)

    // Should have close actions
    hasCloseAction := false
    for _, log := range logs {
        if log.(map[string]interface{})["action"] == "close" {
            hasCloseAction = true
            break
        }
    }
    assert.True(t, hasCloseAction)

    t.Log("Phase 7 complete: Audit trail verified")

    // ========================================
    // Phase 8: Check vacation balance
    // ========================================

    t.Log("Phase 8: Checking vacation balance")

    resp = makeRequest(t, server, "GET", "/api/v1/vacation/balance/"+employee2["id"].(string)+"?year="+string(rune(year)), nil)
    assert.Equal(t, http.StatusOK, resp.Code)

    var vacBalance map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &vacBalance)

    assert.Equal(t, float64(30), vacBalance["entitlement"])
    assert.Equal(t, float64(3), vacBalance["used"]) // 3 days taken
    assert.Equal(t, float64(27), vacBalance["remaining"])

    t.Log("Phase 8 complete: Vacation balance verified")

    t.Log("✓ End-to-end test completed successfully")
}

// Helper types and functions
type DayRecord struct {
    Weekday time.Weekday
    Come    string
    Go      string
    Absent  bool
}

func formatYearMonth(year, month int) string {
    return string(rune(year)) + "/" + string(rune(month))
}

func getDateOfWeekday(year, month, week int, weekday time.Weekday) time.Time {
    firstOfMonth := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
    daysUntilWeekday := (int(weekday) - int(firstOfMonth.Weekday()) + 7) % 7
    return firstOfMonth.AddDate(0, 0, daysUntilWeekday+(week-1)*7)
}

func createUserGroup(t *testing.T, server *httptest.Server, tenantID, name string, permissions []string) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id":   tenantID,
        "name":        name,
        "permissions": permissions,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/user-groups", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createDepartment(t *testing.T, server *httptest.Server, tenantID, name string, parentID *string) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id": tenantID,
        "name":      name,
    }
    if parentID != nil {
        req["parent_id"] = *parentID
    }
    resp := makeRequest(t, server, "POST", "/api/v1/departments", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createCostCenter(t *testing.T, server *httptest.Server, tenantID, code, name string) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id": tenantID,
        "code":      code,
        "name":      name,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/cost-centers", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createStandardDayPlan(t *testing.T, server *httptest.Server, tenantID string) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id":    tenantID,
        "name":         "Standard 8h",
        "target_hours": 480, // 8 hours in minutes
        "start_time":   480, // 08:00
        "end_time":     1020, // 17:00
    }
    resp := makeRequest(t, server, "POST", "/api/v1/day-plans", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createWeekPlan(t *testing.T, server *httptest.Server, tenantID, dayPlanID string) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id": tenantID,
        "name":      "Standard Week",
        "monday":    dayPlanID,
        "tuesday":   dayPlanID,
        "wednesday": dayPlanID,
        "thursday":  dayPlanID,
        "friday":    dayPlanID,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/week-plans", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createTariff(t *testing.T, server *httptest.Server, tenantID string) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id":             tenantID,
        "name":                  "Standard Tariff",
        "minimum_break_minutes": 30,
        "break_after_hours":     6,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/tariffs", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createEvaluationRulesWithCaps(t *testing.T, server *httptest.Server, tenantID string, positiveCap, negativeCap int) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id":             tenantID,
        "name":                  "Default Rules",
        "flextime_cap_positive": positiveCap,
        "flextime_cap_negative": negativeCap,
        "is_default":            true,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/monthly-evaluations", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createFullEmployee(t *testing.T, server *httptest.Server, tenantID, firstName, lastName, email, deptID, costCenterID, weekPlanID, tariffID string) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id":      tenantID,
        "first_name":     firstName,
        "last_name":      lastName,
        "email":          email,
        "department_id":  deptID,
        "cost_center":    costCenterID,
        "week_plan_id":   weekPlanID,
        "tariff_id":      tariffID,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/employees", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func recordMonthlyTime(t *testing.T, server *httptest.Server, employeeID string, year, month int, pattern []DayRecord) {
    // Record bookings for each work week following the pattern
    // Implementation would iterate through the month applying the pattern
}

func createApprovedVacation(t *testing.T, server *httptest.Server, employeeID, absenceTypeID, startDate, endDate string) {
    req := map[string]interface{}{
        "employee_id":     employeeID,
        "absence_type_id": absenceTypeID,
        "start_date":      startDate,
        "end_date":        endDate,
        "status":          "approved",
    }
    resp := makeRequest(t, server, "POST", "/api/v1/absences", req)
    require.Equal(t, http.StatusCreated, resp.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Full workflow from setup to export
- [ ] All components work together
- [ ] Audit trail captures all changes
- [ ] Vacation balance accurate
- [ ] Monthly closing works end-to-end
