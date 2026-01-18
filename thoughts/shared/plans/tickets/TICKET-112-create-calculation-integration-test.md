# TICKET-112: Create Calculation Integration Test

**Type**: Test
**Effort**: M
**Sprint**: 28 - Integration Tests
**Dependencies**: TICKET-070

## Description

Create integration tests for the calculation engine.

## Files to Create

- `apps/api/internal/integration/calculation_test.go`

## Implementation

```go
package integration

import (
    "testing"
    "time"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestDailyCalculation(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    // Create day plan for employee
    dayPlan := createTestDayPlan(t, server, tenant.ID)
    assignDayPlanToEmployee(t, server, employee.ID, dayPlan.ID)

    t.Run("CalculateWorkday", func(t *testing.T) {
        today := time.Now().Format("2006-01-02")

        // Create come booking at 08:00
        createBooking(t, server, employee.ID, "A1", today+"T08:00:00Z")
        // Create go booking at 17:00
        createBooking(t, server, employee.ID, "A2", today+"T17:00:00Z")

        // Get daily value
        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+today, nil)
        assert.Equal(t, 200, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // 9 hours = 540 minutes gross time
        assert.Equal(t, float64(540), result["gross_time"])
        // Net time should be less due to break deduction
        assert.True(t, result["net_time"].(float64) < 540)
    })

    t.Run("CalculateWithBreaks", func(t *testing.T) {
        tomorrow := time.Now().AddDate(0, 0, 1).Format("2006-01-02")

        createBooking(t, server, employee.ID, "A1", tomorrow+"T08:00:00Z")
        createBooking(t, server, employee.ID, "PA", tomorrow+"T12:00:00Z")
        createBooking(t, server, employee.ID, "PE", tomorrow+"T12:30:00Z")
        createBooking(t, server, employee.ID, "A2", tomorrow+"T17:00:00Z")

        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+tomorrow, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Break time should be 30 minutes
        assert.Equal(t, float64(30), result["break_time"])
        // Net = gross - break
        assert.Equal(t, float64(510), result["net_time"]) // 540 - 30
    })

    t.Run("CalculateOvertime", func(t *testing.T) {
        date := time.Now().AddDate(0, 0, 2).Format("2006-01-02")

        // Work 10 hours (8 target + 2 overtime)
        createBooking(t, server, employee.ID, "A1", date+"T07:00:00Z")
        createBooking(t, server, employee.ID, "A2", date+"T18:00:00Z")

        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+date, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Should have overtime
        assert.True(t, result["overtime"].(float64) > 0)
    })

    t.Run("CalculateUndertime", func(t *testing.T) {
        date := time.Now().AddDate(0, 0, 3).Format("2006-01-02")

        // Work only 6 hours (2 hours undertime)
        createBooking(t, server, employee.ID, "A1", date+"T09:00:00Z")
        createBooking(t, server, employee.ID, "A2", date+"T15:00:00Z")

        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+date, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Should have undertime
        assert.True(t, result["undertime"].(float64) > 0)
    })
}

func TestToleranceRounding(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    // Create day plan with tolerance settings
    dayPlan := createDayPlanWithTolerance(t, server, tenant.ID, 5, 10) // 5 min start, 10 min end tolerance
    assignDayPlanToEmployee(t, server, employee.ID, dayPlan.ID)

    t.Run("ApplyStartTolerance", func(t *testing.T) {
        date := time.Now().Format("2006-01-02")

        // Come 3 minutes late (within 5 min tolerance)
        createBooking(t, server, employee.ID, "A1", date+"T08:03:00Z") // Target is 08:00
        createBooking(t, server, employee.ID, "A2", date+"T17:00:00Z")

        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+date, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Should be rounded to 08:00, no undertime
        assert.Equal(t, float64(0), result["undertime"])
    })

    t.Run("ExceedStartTolerance", func(t *testing.T) {
        date := time.Now().AddDate(0, 0, 1).Format("2006-01-02")

        // Come 10 minutes late (exceeds 5 min tolerance)
        createBooking(t, server, employee.ID, "A1", date+"T08:10:00Z")
        createBooking(t, server, employee.ID, "A2", date+"T17:00:00Z")

        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+date, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Should have undertime
        assert.True(t, result["undertime"].(float64) > 0)
    })
}

func TestBreakDeduction(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    // Create tariff with break rules
    tariff := createTariffWithBreaks(t, server, tenant.ID)
    assignTariffToEmployee(t, server, employee.ID, tariff.ID)

    t.Run("MinimumBreakEnforced", func(t *testing.T) {
        date := time.Now().Format("2006-01-02")

        // Work 7 hours with only 15 min break (minimum is 30)
        createBooking(t, server, employee.ID, "A1", date+"T08:00:00Z")
        createBooking(t, server, employee.ID, "PA", date+"T12:00:00Z")
        createBooking(t, server, employee.ID, "PE", date+"T12:15:00Z")
        createBooking(t, server, employee.ID, "A2", date+"T15:00:00Z")

        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+date, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Break should be at least 30 minutes
        assert.True(t, result["break_time"].(float64) >= 30)
    })
}

func TestErrorDetection(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    t.Run("DetectMissingGoBooking", func(t *testing.T) {
        date := time.Now().Format("2006-01-02")

        // Only come booking, no go
        createBooking(t, server, employee.ID, "A1", date+"T08:00:00Z")

        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+date, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Should flag error
        assert.True(t, result["has_error"].(bool))
    })

    t.Run("DetectUnpairedBreak", func(t *testing.T) {
        date := time.Now().AddDate(0, 0, 1).Format("2006-01-02")

        createBooking(t, server, employee.ID, "A1", date+"T08:00:00Z")
        createBooking(t, server, employee.ID, "PA", date+"T12:00:00Z")
        // Missing PE
        createBooking(t, server, employee.ID, "A2", date+"T17:00:00Z")

        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+date, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Should flag error
        assert.True(t, result["has_error"].(bool))
    })
}

// Helper functions
func createBooking(t *testing.T, server *httptest.Server, employeeID, bookingType, bookingTime string) {
    req := map[string]interface{}{
        "employee_id":  employeeID,
        "booking_type": bookingType,
        "booking_time": bookingTime,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
    require.Equal(t, 201, resp.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Daily value calculation verified
- [ ] Overtime/undertime calculation correct
- [ ] Tolerance rounding tested
- [ ] Break deduction tested
- [ ] Error detection tested
