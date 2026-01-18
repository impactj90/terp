# TICKET-115: Create Payroll Export Integration Test

**Type**: Test
**Effort**: S
**Sprint**: 28 - Integration Tests
**Dependencies**: TICKET-110

## Description

Create integration tests for payroll export functionality.

## Files to Create

- `apps/api/internal/integration/payroll_export_test.go`

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

func TestPayrollExportFlow(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)

    // Create employees with data
    employees := make([]map[string]interface{}, 3)
    for i := 0; i < 3; i++ {
        employees[i] = createTestEmployeeWithIndex(t, server, tenant.ID, i)
    }

    // Setup closed month with data
    lastMonth := time.Now().AddDate(0, -1, 0)
    year := lastMonth.Year()
    month := int(lastMonth.Month())

    for _, emp := range employees {
        setupMonthlyBookings(t, server, emp["id"].(string), year, month)
        // Close the month
        makeRequest(t, server, "POST",
            "/api/v1/monthly/"+emp["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month))+"/close", nil)
    }

    t.Run("CreateCSVExport", func(t *testing.T) {
        req := map[string]interface{}{
            "year":          year,
            "month":         month,
            "export_format": "csv",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/payroll-exports", req)
        assert.Equal(t, http.StatusCreated, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, "pending", result["status"])
        assert.NotEmpty(t, result["id"])
    })

    t.Run("CreateDATEVExport", func(t *testing.T) {
        req := map[string]interface{}{
            "year":          year,
            "month":         month,
            "export_format": "datev",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/payroll-exports", req)
        assert.Equal(t, http.StatusCreated, resp.Code)
    })

    t.Run("PreventDuplicateExport", func(t *testing.T) {
        req := map[string]interface{}{
            "year":          year,
            "month":         month,
            "export_format": "csv",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/payroll-exports", req)
        assert.Equal(t, http.StatusConflict, resp.Code)
    })

    t.Run("ProcessExport", func(t *testing.T) {
        // Get pending export
        resp := makeRequest(t, server, "GET", "/api/v1/payroll-exports", nil)
        var list map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &list)

        exports := list["data"].([]interface{})
        exportID := exports[0].(map[string]interface{})["id"].(string)

        // Process
        resp = makeRequest(t, server, "POST", "/api/v1/payroll-exports/"+exportID+"/process", nil)
        assert.Equal(t, http.StatusAccepted, resp.Code)

        // Wait for processing (in real test would poll or use webhook)
        time.Sleep(2 * time.Second)

        // Check status
        resp = makeRequest(t, server, "GET", "/api/v1/payroll-exports/"+exportID, nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, "completed", result["status"])
        assert.NotEmpty(t, result["file_path"])
        assert.NotZero(t, result["record_count"])
    })

    t.Run("DownloadExport", func(t *testing.T) {
        // Get completed export
        resp := makeRequest(t, server, "GET", "/api/v1/payroll-exports?status=completed", nil)
        var list map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &list)

        exports := list["data"].([]interface{})
        require.NotEmpty(t, exports)
        exportID := exports[0].(map[string]interface{})["id"].(string)

        // Download
        resp = makeRequest(t, server, "GET", "/api/v1/payroll-exports/"+exportID+"/download", nil)
        assert.Equal(t, http.StatusOK, resp.Code)
        assert.Contains(t, resp.Header().Get("Content-Disposition"), "attachment")
    })

    t.Run("ListExports", func(t *testing.T) {
        resp := makeRequest(t, server, "GET", "/api/v1/payroll-exports", nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        exports := result["data"].([]interface{})
        assert.GreaterOrEqual(t, len(exports), 2)
    })
}

func TestPayrollExportContent(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    // Setup specific scenario
    lastMonth := time.Now().AddDate(0, -1, 0)
    year := lastMonth.Year()
    month := int(lastMonth.Month())

    // Create bookings with known values
    setupSpecificMonthlyBookings(t, server, employee["id"].(string), year, month,
        160*60, // 160 hours total
        10*60,  // 10 hours overtime
        5,      // 5 vacation days
        2,      // 2 sick days
    )

    // Close month
    makeRequest(t, server, "POST",
        "/api/v1/monthly/"+employee["id"].(string)+"/"+string(rune(year))+"/"+string(rune(month))+"/close", nil)

    t.Run("VerifyExportValues", func(t *testing.T) {
        // Create and process export
        req := map[string]interface{}{
            "year":          year,
            "month":         month,
            "export_format": "csv",
        }
        resp := makeRequest(t, server, "POST", "/api/v1/payroll-exports", req)
        var created map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &created)

        // Process
        makeRequest(t, server, "POST", "/api/v1/payroll-exports/"+created["id"].(string)+"/process", nil)
        time.Sleep(2 * time.Second)

        // Get export items
        resp = makeRequest(t, server, "GET", "/api/v1/payroll-exports/"+created["id"].(string), nil)
        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Verify record count
        assert.Equal(t, float64(1), result["record_count"]) // 1 employee
    })
}

func TestPayrollExportValidation(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    t.Run("InvalidYear", func(t *testing.T) {
        req := map[string]interface{}{
            "year":          1999, // Too old
            "month":         1,
            "export_format": "csv",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/payroll-exports", req)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })

    t.Run("InvalidMonth", func(t *testing.T) {
        req := map[string]interface{}{
            "year":          2024,
            "month":         13, // Invalid
            "export_format": "csv",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/payroll-exports", req)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })

    t.Run("InvalidFormat", func(t *testing.T) {
        req := map[string]interface{}{
            "year":          2024,
            "month":         1,
            "export_format": "invalid",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/payroll-exports", req)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })
}

// Helper functions
func setupSpecificMonthlyBookings(t *testing.T, server *httptest.Server, employeeID string, year, month, totalMinutes, overtimeMinutes, vacationDays, sickDays int) {
    // This would create bookings that result in specific values
    // Implementation would calculate required booking times
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Export creation works
- [ ] Duplicate prevention works
- [ ] Processing generates file
- [ ] Download returns file
- [ ] Validation prevents bad input
