# TICKET-111: Create Booking Integration Test

**Type**: Test
**Effort**: M
**Sprint**: 28 - Integration Tests
**Dependencies**: TICKET-073

## Description

Create comprehensive integration tests for the booking flow.

## Files to Create

- `apps/api/internal/integration/booking_test.go`

## Implementation

```go
package integration

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"
    "time"

    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
)

func TestBookingFlow(t *testing.T) {
    // Setup test database and server
    server, cleanup := setupTestServer(t)
    defer cleanup()

    // Create test tenant and employee
    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    t.Run("CreateComeBooking", func(t *testing.T) {
        req := map[string]interface{}{
            "employee_id":  employee.ID,
            "booking_type": "A1",
            "booking_time": time.Now().Format("2006-01-02T08:00:00Z"),
        }

        resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusCreated, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)
        assert.Equal(t, "A1", result["booking_type"])
    })

    t.Run("CreateGoBooking", func(t *testing.T) {
        req := map[string]interface{}{
            "employee_id":  employee.ID,
            "booking_type": "A2",
            "booking_time": time.Now().Format("2006-01-02T17:00:00Z"),
        }

        resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusCreated, resp.Code)
    })

    t.Run("GetDailyValue", func(t *testing.T) {
        date := time.Now().Format("2006-01-02")
        resp := makeRequest(t, server, "GET", "/api/v1/daily-values/"+employee.ID+"/"+date, nil)
        assert.Equal(t, http.StatusOK, resp.Code)

        var result map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &result)

        // Should have calculated values
        assert.NotZero(t, result["gross_time"])
        assert.NotZero(t, result["net_time"])
    })

    t.Run("CreateBreakBookings", func(t *testing.T) {
        // Break start
        req := map[string]interface{}{
            "employee_id":  employee.ID,
            "booking_type": "PA",
            "booking_time": time.Now().Format("2006-01-02T12:00:00Z"),
        }
        resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusCreated, resp.Code)

        // Break end
        req["booking_type"] = "PE"
        req["booking_time"] = time.Now().Format("2006-01-02T12:30:00Z")
        resp = makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusCreated, resp.Code)
    })

    t.Run("DuplicateBookingPrevented", func(t *testing.T) {
        // Try to create same booking again
        req := map[string]interface{}{
            "employee_id":  employee.ID,
            "booking_type": "A1",
            "booking_time": time.Now().Format("2006-01-02T08:00:00Z"),
        }

        resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusConflict, resp.Code)
    })

    t.Run("UpdateBooking", func(t *testing.T) {
        // Get first booking
        resp := makeRequest(t, server, "GET", "/api/v1/bookings?employee_id="+employee.ID, nil)
        var list map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &list)

        bookings := list["data"].([]interface{})
        bookingID := bookings[0].(map[string]interface{})["id"].(string)

        // Update
        req := map[string]interface{}{
            "booking_time": time.Now().Format("2006-01-02T08:05:00Z"),
        }
        resp = makeRequest(t, server, "PUT", "/api/v1/bookings/"+bookingID, req)
        assert.Equal(t, http.StatusOK, resp.Code)
    })

    t.Run("DeleteBooking", func(t *testing.T) {
        // Get bookings
        resp := makeRequest(t, server, "GET", "/api/v1/bookings?employee_id="+employee.ID, nil)
        var list map[string]interface{}
        json.Unmarshal(resp.Body.Bytes(), &list)

        bookings := list["data"].([]interface{})
        bookingID := bookings[0].(map[string]interface{})["id"].(string)

        // Delete
        resp = makeRequest(t, server, "DELETE", "/api/v1/bookings/"+bookingID, nil)
        assert.Equal(t, http.StatusNoContent, resp.Code)
    })
}

func TestBookingValidation(t *testing.T) {
    server, cleanup := setupTestServer(t)
    defer cleanup()

    tenant := createTestTenant(t, server)
    employee := createTestEmployee(t, server, tenant.ID)

    t.Run("InvalidBookingType", func(t *testing.T) {
        req := map[string]interface{}{
            "employee_id":  employee.ID,
            "booking_type": "INVALID",
            "booking_time": time.Now().Format("2006-01-02T08:00:00Z"),
        }

        resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })

    t.Run("FutureBookingPrevented", func(t *testing.T) {
        futureTime := time.Now().AddDate(0, 0, 1).Format("2006-01-02T08:00:00Z")
        req := map[string]interface{}{
            "employee_id":  employee.ID,
            "booking_type": "A1",
            "booking_time": futureTime,
        }

        resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })

    t.Run("MissingEmployeeID", func(t *testing.T) {
        req := map[string]interface{}{
            "booking_type": "A1",
            "booking_time": time.Now().Format("2006-01-02T08:00:00Z"),
        }

        resp := makeRequest(t, server, "POST", "/api/v1/bookings", req)
        assert.Equal(t, http.StatusBadRequest, resp.Code)
    })
}

// Helper functions

func makeRequest(t *testing.T, server *httptest.Server, method, path string, body interface{}) *httptest.ResponseRecorder {
    var reqBody *bytes.Buffer
    if body != nil {
        b, _ := json.Marshal(body)
        reqBody = bytes.NewBuffer(b)
    } else {
        reqBody = bytes.NewBuffer(nil)
    }

    req, err := http.NewRequest(method, path, reqBody)
    require.NoError(t, err)

    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Authorization", "Bearer test-token")

    rr := httptest.NewRecorder()
    server.Config.Handler.ServeHTTP(rr, req)
    return rr
}

func setupTestServer(t *testing.T) (*httptest.Server, func()) {
    // Setup test database
    // Initialize dependencies
    // Return server and cleanup function
    return nil, func() {}
}

func createTestTenant(t *testing.T, server *httptest.Server) map[string]interface{} {
    req := map[string]interface{}{
        "name":   "Test Tenant",
        "domain": "test.example.com",
    }
    resp := makeRequest(t, server, "POST", "/api/v1/tenants", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}

func createTestEmployee(t *testing.T, server *httptest.Server, tenantID string) map[string]interface{} {
    req := map[string]interface{}{
        "tenant_id":  tenantID,
        "first_name": "Test",
        "last_name":  "Employee",
        "email":      "test@example.com",
    }
    resp := makeRequest(t, server, "POST", "/api/v1/employees", req)
    require.Equal(t, http.StatusCreated, resp.Code)

    var result map[string]interface{}
    json.Unmarshal(resp.Body.Bytes(), &result)
    return result
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] All booking CRUD operations tested
- [ ] Validation errors tested
- [ ] Daily value calculation triggered
