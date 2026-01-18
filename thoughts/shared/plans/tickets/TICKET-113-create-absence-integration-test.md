# TICKET-113: Create Absence Integration Test

**Type**: Test
**Effort**: M
**Sprint**: 28 - Integration Tests
**Dependencies**: TICKET-080

## Description

Create integration tests for absence management.

## Files to Create

- `apps/api/internal/integration/absence_test.go`

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

func TestAbsenceFlow(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    // Create absence types
    vacationType := createAbsenceType(t, server, tenant.ID, "Vacation", "U", true)
    sickType := createAbsenceType(t, server, tenant.ID, "Sick", "K", false)

    t.Run("CreateVacationRequest", func(t *testing.T) {
        startDate := time.Now().AddDate(0, 1, 0).Format("2006-01-02")
        endDate := time.Now().AddDate(0, 1, 5).Format("2006-01-02")

        req := map[string]interface{}{
            "employee_id":     employee["id"],
            "absence_type_id": vacationType["id"],
            "start_date":      startDate,
            "end_date":        endDate,
            "status":          "requested",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/absences", req)
        assert.Equal(t, http.StatusCreated, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)
        assert.Equal(t, "requested", result["status"])
    })

    t.Run("ApproveVacation", func(t *testing.T) {
        // Get pending absences
        resp := makeRequest(t, server, "GET", "/api/v1/absences?employee_id="+employee["id"].(string)+"&status=requested", nil)
        var list map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &list)

        absences := list["data"].([]interface{})
        absenceID := absences[0].(map[string]interface{})["id"].(string)

        // Approve
        resp = makeRequest(t, server, "POST", "/api/v1/absences/"+absenceID+"/approve", nil)
        assert.Equal(t, http.StatusOK, resp.Code)
    })

    t.Run("CreateSickLeave", func(t *testing.T) {
        today := time.Now().Format("2006-01-02")

        req := map[string]interface{}{
            "employee_id":     employee["id"],
            "absence_type_id": sickType["id"],
            "start_date":      today,
            "end_date":        today,
            "status":          "approved", // Sick leave auto-approved
        }

        resp := makeRequest(t, server, "POST", "/api/v1/absences", req)
        assert.Equal(t, http.StatusCreated, resp.Code)
    })

    t.Run("GetAbsencesByDateRange", func(t *testing.T) {
        from := time.Now().Format("2006-01-02")
        to := time.Now().AddDate(0, 2, 0).Format("2006-01-02")

        resp := makeRequest(t, server, "GET", "/api/v1/absences?employee_id="+employee["id"].(string)+"&from="+from+"&to="+to, nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        absences := result["data"].([]interface{})
        assert.GreaterOrEqual(t, len(absences), 2)
    })

    t.Run("RejectVacation", func(t *testing.T) {
        startDate := time.Now().AddDate(0, 2, 0).Format("2006-01-02")
        endDate := time.Now().AddDate(0, 2, 3).Format("2006-01-02")

        // Create new request
        req := map[string]interface{}{
            "employee_id":     employee["id"],
            "absence_type_id": vacationType["id"],
            "start_date":      startDate,
            "end_date":        endDate,
            "status":          "requested",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/absences", req)
        var created map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &created)

        // Reject
        rejectReq := map[string]interface{}{
            "reason": "Insufficient staffing",
        }
        resp = makeRequest(t, server, "POST", "/api/v1/absences/"+created["id"].(string)+"/reject", rejectReq)
        assert.Equal(t, http.StatusOK, resp.Code)
    })

    t.Run("CancelAbsence", func(t *testing.T) {
        // Get approved absence
        resp := makeRequest(t, server, "GET", "/api/v1/absences?employee_id="+employee["id"].(string)+"&status=approved", nil)
        var list map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &list)

        absences := list["data"].([]interface{})
        if len(absences) > 0 {
            absenceID := absences[0].(map[string]interface{})["id"].(string)

            resp = makeRequest(t, server, "DELETE", "/api/v1/absences/"+absenceID, nil)
            assert.Equal(t, http.StatusNoContent, resp.Code)
        }
    })
}

func TestVacationBalance(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)
    vacationType := createAbsenceType(t, server, tenant.ID, "Vacation", "U", true)

    // Set initial vacation entitlement
    setVacationEntitlement(t, server, employee["id"].(string), 25) // 25 days

    t.Run("GetVacationBalance", func(t *testing.T) {
        year := time.Now().Year()
        resp := makeRequest(t, server, "GET", "/api/v1/vacation/balance/"+employee["id"].(string)+"?year="+string(rune(year)), nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, float64(25), result["entitlement"])
        assert.Equal(t, float64(0), result["used"])
        assert.Equal(t, float64(25), result["remaining"])
    })

    t.Run("BalanceUpdatedAfterAbsence", func(t *testing.T) {
        startDate := time.Now().AddDate(0, 0, 7).Format("2006-01-02")
        endDate := time.Now().AddDate(0, 0, 11).Format("2006-01-02") // 5 work days

        // Create and approve vacation
        req := map[string]interface{}{
            "employee_id":     employee["id"],
            "absence_type_id": vacationType["id"],
            "start_date":      startDate,
            "end_date":        endDate,
            "status":          "approved",
        }
        resp := makeRequest(t, server, "POST", "/api/v1/absences", req)
        require.Equal(t, http.StatusCreated, resp.Code)

        // Check updated balance
        year := time.Now().Year()
        resp = makeRequest(t, server, "GET", "/api/v1/vacation/balance/"+employee["id"].(string)+"?year="+string(rune(year)), nil)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, float64(5), result["used"])
        assert.Equal(t, float64(20), result["remaining"])
    })

    t.Run("PreventOverBooking", func(t *testing.T) {
        // Try to book more vacation than available
        startDate := time.Now().AddDate(0, 3, 0).Format("2006-01-02")
        endDate := time.Now().AddDate(0, 4, 0).Format("2006-01-02") // 30+ days

        req := map[string]interface{}{
            "employee_id":     employee["id"],
            "absence_type_id": vacationType["id"],
            "start_date":      startDate,
            "end_date":        endDate,
            "status":          "requested",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/absences", req)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })
}

func TestHalfDayAbsences(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)
    vacationType := createAbsenceType(t, server, tenant.ID, "Vacation", "U", true)

    t.Run("CreateHalfDayVacation", func(t *testing.T) {
        today := time.Now().AddDate(0, 0, 14).Format("2006-01-02")

        req := map[string]interface{}{
            "employee_id":     employee["id"],
            "absence_type_id": vacationType["id"],
            "start_date":      today,
            "end_date":        today,
            "is_half_day":     true,
            "half_day_type":   "morning",
            "status":          "approved",
        }

        resp := makeRequest(t, server, "POST", "/api/v1/absences", req)
        assert.Equal(t, http.StatusCreated, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        assert.Equal(t, true, result["is_half_day"])
        assert.Equal(t, "morning", result["half_day_type"])
    })
}

// Helper functions
func createAbsenceType(t *testing.T, server *httptest.Server, tenantID, name, code string, requiresApproval bool) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id":         tenantID,
        "name":              name,
        "code":              code,
        "requires_approval": requiresApproval,
    }
    resp := makeRequest(t, server, "POST", "/api/v1/absence-types", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func setVacationEntitlement(t *testing.T, server *httptest.Server, employeeID string, days int) {
    req := map[string]interface{}{
        "yearly_entitlement": days,
    }
    resp := makeRequest(t, server, "PUT", "/api/v1/employees/"+employeeID+"/vacation-entitlement", req)
    require.Equal(t, http.StatusOK, resp.Code)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] Create, approve, reject flow tested
- [ ] Vacation balance updates correctly
- [ ] Overbooking prevented
- [ ] Half-day absences work
