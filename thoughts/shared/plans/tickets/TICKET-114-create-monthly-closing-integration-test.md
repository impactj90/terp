# TICKET-114: Create Monthly Closing Integration Test

**Type**: Test
**Effort**: M
**Sprint**: 28 - Integration Tests
**Dependencies**: TICKET-091

## Description

Create integration tests for monthly closing workflow.

## Files to Create

- `apps/api/internal/integration/monthly_test.go`

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

func TestMonthlyClosingFlow(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    // Setup: Create bookings for the past month
    lastMonth := time.Now().AddDate(0, -1, 0)
    year := lastMonth.Year()
    month := int(lastMonth.Month())

    setupMonthlyBookings(t, server, employee["id"].(string), year, month)

    t.Run("CalculateMonth", func(t *testing.T) {
        resp := makeRequest(t, server, "POST",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month))+"/calculate", nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Should have aggregated values
        assert.NotZero(t, result["total_net_time"])
        assert.NotZero(t, result["work_days"])
    })

    t.Run("GetMonthlyValue", func(t *testing.T) {
        resp := makeRequest(t, server, "GET",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month)), nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, false, result["is_closed"])
    })

    t.Run("CloseMonth", func(t *testing.T) {
        resp := makeRequest(t, server, "POST",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month))+"/close", nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        // Verify closed
        resp = makeRequest(t, server, "GET",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month)), nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, true, result["is_closed"])
        assert.NotNil(t, result["closed_at"])
    })

    t.Run("PreventModificationAfterClose", func(t *testing.T) {
        // Try to add booking to closed month
        date := time.Date(year, time.Month(month), 15, 8, 0, 0, 0, time.UTC)
        req := map[string]interface{}{
            "employee_id":  employee["id"],
            "booking_type": "A1",
            "booking_time": date.Format("2006-01-02T15:04:05Z"),
        }

        resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })

    t.Run("ReopenMonth", func(t *testing.T) {
        resp := makeRequest(t, server, "POST",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month))+"/reopen", nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        // Verify reopened
        resp = makeRequest(t, server, "GET",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month)), nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, false, result["is_closed"])
        assert.NotNil(t, result["reopened_at"])
    })
}

func TestFlextimeCarryover(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    // Setup evaluation rules with flextime cap
    createEvaluationRules(t, server, tenant.ID, 120) // 2 hour cap

    // Setup bookings with overtime
    lastMonth := time.Now().AddDate(0, -1, 0)
    year := lastMonth.Year()
    month := int(lastMonth.Month())

    setupMonthlyBookingsWithOvertime(t, server, employee["id"].(string), year, month, 180) // 3 hours overtime

    t.Run("FlextimeCapApplied", func(t *testing.T) {
        // Calculate and close
        makeRequest(t, server, "POST",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month))+"/close", nil)

        resp := makeRequest(t, server, "GET",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month)), nil)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Flextime end should be 180, but carryover capped at 120
        assert.True(t, result["flextime_end"].(float64) >= 120)
        assert.Equal(t, float64(120), result["flextime_carryover"])
    })

    t.Run("CarryoverToNextMonth", func(t *testing.T) {
        // Check next month's starting balance
        nextMonth := lastMonth.AddDate(0, 1, 0)
        resp := makeRequest(t, server, "GET",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(nextMonth.Year()))+"/"+string(rune(int(nextMonth.Month()))), nil)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, float64(120), result["flextime_start"])
    })
}

func TestBatchMonthClose(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)

    // Create multiple employees
    employees := make([]map[string]interface{}, 5)
    for i := 0; i < 5; i++ {
        employees[i] = createTestEmployeeWithIndex(t, server, tenant.ID, i)
    }

    // Setup bookings for all employees
    lastMonth := time.Now().AddDate(0, -1, 0)
    year := lastMonth.Year()
    month := int(lastMonth.Month())

    for _, emp := range employees {
        setupMonthlyBookings(t, server, emp["id"].(string), year, month)
    }

    t.Run("BatchCloseAllEmployees", func(t *testing.T) {
        resp := makeRequest(t, server, "POST",
            "/api/v1/monthly/batch-close/"+string(rune(year))+"/"+string(rune(month)), nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, float64(5), result["employees_closed"])
    })

    t.Run("VerifyAllClosed", func(t *testing.T) {
        for _, emp := range employees {
            resp := makeRequest(t, server, "GET",
                "/api/v1/monthly/"+emp["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month)), nil)

            var result map[string]interface{}
            json.Unmarshal(resp.Body.Bytes(), &result)

            assert.Equal(t, true, result["is_closed"])
        }
    })
}

func TestFutureMonthPrevention(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    futureMonth := time.Now().AddDate(0, 1, 0)
    year := futureMonth.Year()
    month := int(futureMonth.Month())

    t.Run("CannotCalculateFutureMonth", func(t *testing.T) {
        resp := makeRequest(t, server, "POST",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month))+"/calculate", nil)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })

    t.Run("CannotCloseFutureMonth", func(t *testing.T) {
        resp := makeRequest(t, server, "POST",
            "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month))+"/close", nil)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })
}

// Helper functions
func setupMonthlyBookings(t *testing.T, server *httptest.Server, employeeID string, year, month int) {
    // Create bookings for each workday in the month
    startDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
    endDate := startDate.AddDate(0, 1, -1)

    for d := startDate; !d.After(endDate); d = d.AddDate(0, 0, 1) {
        // Skip weekends
        if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
            continue
        }

        // Come at 08:00
        createBookingWithTime(t, server, employeeID, "A1", d.Add(8*time.Hour))
        // Go at 17:00
        createBookingWithTime(t, server, employeeID, "A2", d.Add(17*time.Hour))
    }
}

func setupMonthlyBookingsWithOvertime(t *testing.T, server *httptest.Server, employeeID string, year, month, totalOvertime int) {
    // Create bookings that result in specified overtime
    // Implementation would spread overtime across workdays
}

func createEvaluationRules(t *testing.T, server *httptest.Server, tenantID string, flextimeCap int) {
    req := map[string]interface{}{
        "tenant_id":             tenantID,
        "name":                  "Default",
        "flextime_cap_positive": flextimeCap,
        "is_default":            true,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/monthly-evaluations", req)
    require.Equal(t, http.StatusCreated, resp.Code)
}

func createTestEmployeeWithIndex(t *testing.T, server *httptest.Server, tenantID string, index int) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id":  tenantID,
        "first_name": "Test",
        "last_name":  "Employee " + string(rune(index)),
        "email":      "test" + string(rune(index)) + "@example.com",
    }
    resp := makeRequest(t, server, "POST", "/api/v1/employees", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createBookingWithTime(t *testing.T, server *httptest.Server, employeeID, bookingType string, bookingTime time.Time) {
    req := map[string]interface{}{
        "employee_id":  employeeID,
        "booking_type": bookingType,
        "booking_time": bookingTime.Format("2006-01-02T15:04:05Z"),
    }
    resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
    // Allow conflict for existing bookings
    if resp.Code != http.StatusCreated && resp.Code != http.StatusConflict {
        t.Fatalf("unexpected status: %d", resp.Code)
    }
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Month calculation aggregates correctly
- [ ] Close prevents modifications
- [ ] Reopen allows editing
- [ ] Flextime caps applied
- [ ] Batch close works
- [ ] Future month prevented
