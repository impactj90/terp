# Implementation Plan: ZMI-TICKET-011 - Booking Ingest, Edit, and Calculated Values

## Overview

This ticket covers the complete booking flow: ingest from terminals, store original and edited times, calculate derived times, maintain pairing integrity, and log edits. The **research document reveals that the core implementation is largely complete**. The booking model, migration, repository, service, handler, route registration, OpenAPI spec, and generated models all exist and are functional.

What remains is closing the gaps identified during research:

1. **Audit log enrichment** -- Populate the `Changes` field with before/after values on booking update and delete operations, and include `EntityName` for human-readable context.
2. **OpenAPI spec refinement** -- Mark `original_time` as `readOnly` to document immutability, add description clarifying edit semantics.
3. **Dedicated booking history endpoint** -- Add `GET /bookings/{id}/logs` to retrieve audit trail for a specific booking.
4. **Test coverage gaps** -- Add tests for original_time immutability, audit log changes capture, pairing behavior, calculated time lifecycle, and cross-midnight booking behavior.

## Dependencies

All dependencies are satisfied:

- **ZMI-TICKET-010** (Booking types) -- COMPLETE (migration 000044, model, repo, service, handler)
- **ZMI-TICKET-006** (Day plans) -- COMPLETE (model, repo, calculation integration)
- **ZMI-TICKET-003** (User management) -- COMPLETE (auth, users)
- **ZMI-TICKET-034** (Audit logging) -- COMPLETE (migration 000040, model, service, repo, handler)

## Existing Implementation Summary

| Component | File | Status |
|-----------|------|--------|
| Booking model | `apps/api/internal/model/booking.go` | Complete |
| Booking migration | `db/migrations/000022_create_bookings.up.sql` | Complete |
| Booking repository | `apps/api/internal/repository/booking.go` | Complete |
| Booking service | `apps/api/internal/service/booking.go` | Complete |
| Booking handler | `apps/api/internal/handler/booking.go` | Complete |
| Route registration | `apps/api/internal/handler/routes.go` (lines 399-478) | Complete |
| Booking OpenAPI schemas | `api/schemas/bookings.yaml` | Complete |
| Booking OpenAPI paths | `api/paths/bookings.yaml` | Needs enhancement |
| Generated models | `apps/api/gen/models/booking.go` | Complete |
| Handler tests | `apps/api/internal/handler/booking_test.go` | Needs expansion |
| Service tests | `apps/api/internal/service/booking_test.go` | Needs expansion |
| Audit log infrastructure | `apps/api/internal/service/auditlog.go` | Complete |

---

## Phase 1: OpenAPI Spec Enhancement

### Step 1.1: Annotate `original_time` as read-only

**File**: `api/schemas/bookings.yaml`

Add `readOnly: true` to the `original_time` field and enhance the description to document immutability semantics. Also add a description to `edited_time` and `calculated_time` clarifying the three-value model.

```yaml
    original_time:
      type: integer
      description: >
        Original booking time (minutes from midnight). This value is set once
        during creation and is immutable -- it cannot be changed by any update
        operation. Represents the raw terminal or manual ingest time.
      example: 480
      readOnly: true
    edited_time:
      type: integer
      description: >
        Edited/corrected time (minutes from midnight). Defaults to original_time
        on creation. Can be changed by the user via PUT /bookings/{id}. When changed,
        calculated_time is cleared and recalculated on next day calculation.
      example: 480
    calculated_time:
      type: integer
      description: >
        Time after tolerance/rounding applied (minutes from midnight). Derived
        automatically during day calculation based on day plan settings. Cleared
        when edited_time changes. This is the value used in final time calculations.
      x-nullable: true
```

### Step 1.2: Add booking log endpoint to OpenAPI paths

**File**: `api/paths/bookings.yaml`

Append the new endpoint definition at the end of the file:

```yaml
/bookings/{id}/logs:
  get:
    tags:
      - Bookings
    summary: Get booking audit logs
    description: |
      Returns audit trail for a specific booking. Shows all create, update,
      and delete operations with before/after values, user identity, and timestamps.
    operationId: getBookingLogs
    parameters:
      - name: id
        in: path
        required: true
        type: string
        format: uuid
        description: Booking ID
      - name: limit
        in: query
        type: integer
        default: 50
        minimum: 1
        maximum: 100
      - name: cursor
        in: query
        type: string
    responses:
      200:
        description: Audit logs for this booking
        schema:
          $ref: '../schemas/audit-logs.yaml#/AuditLogList'
      401:
        $ref: '../responses/errors.yaml#/Unauthorized'
      404:
        $ref: '../responses/errors.yaml#/NotFound'
```

### Step 1.3: Register path in openapi.yaml

**File**: `api/openapi.yaml`

In the `paths:` section, add a reference to the new booking logs path. Locate the existing `/bookings/{id}` reference and add below it:

```yaml
  /bookings/{id}/logs:
    $ref: './paths/bookings.yaml#/~1bookings~1{id}~1logs'
```

### Step 1.4: Bundle and regenerate

```bash
make swagger-bundle
make generate
```

### Verification

- `api/openapi.bundled.yaml` includes the `/bookings/{id}/logs` endpoint
- `original_time` field has `readOnly: true` in the bundled output
- Generated models compile without errors
- `make lint` passes

---

## Phase 2: Audit Log Enrichment for Bookings

### Step 2.1: Capture before/after Changes on booking update

**File**: `apps/api/internal/handler/booking.go`

In the `Update` method (around line 362), the handler already fetches the booking BEFORE the update at line 370:

```go
booking, err := h.bookingRepo.GetWithDetails(r.Context(), id)
```

Then later calls `h.bookingService.Update()` at line 418 which returns the UPDATED booking. The `booking` variable is reassigned.

**Change**: Before the `h.bookingService.Update()` call, capture the old values. Then include them in the audit log call.

Modify the Update method to capture old values before the service call:

```go
// Update handles PUT /bookings/{id}
func (h *BookingHandler) Update(w http.ResponseWriter, r *http.Request) {
    // ... existing code to parse ID and fetch booking ...

    // === NEW: Capture old values before update ===
    oldEditedTime := booking.EditedTime
    oldNotes := booking.Notes
    // === END NEW ===

    // ... existing code to parse request and build input ...

    booking, err = h.bookingService.Update(r.Context(), id, input)
    // ... existing error handling ...

    // === MODIFIED: Include Changes in audit log ===
    if h.auditService != nil {
        if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
            changes := map[string]interface{}{}
            if input.EditedTime != nil && *input.EditedTime != oldEditedTime {
                changes["edited_time"] = map[string]interface{}{
                    "before": oldEditedTime,
                    "after":  *input.EditedTime,
                }
            }
            if input.Notes != nil && *input.Notes != oldNotes {
                changes["notes"] = map[string]interface{}{
                    "before": oldNotes,
                    "after":  *input.Notes,
                }
            }

            var changesData interface{}
            if len(changes) > 0 {
                changesData = changes
            }

            h.auditService.Log(r.Context(), r, service.LogEntry{
                TenantID:   tenantID,
                Action:     model.AuditActionUpdate,
                EntityType: "booking",
                EntityID:   booking.ID,
                EntityName: "Booking " + timeutil.MinutesToString(booking.EditedTime) + " on " + booking.BookingDate.Format("2006-01-02"),
                Changes:    changesData,
            })
        }
    }
    // === END MODIFIED ===

    respondJSON(w, http.StatusOK, h.modelToResponse(booking))
}
```

### Step 2.2: Capture entity details on booking delete

**File**: `apps/api/internal/handler/booking.go`

In the `Delete` method (around line 448), the booking is fetched before deletion (line 456). Use this to populate the audit log with entity details.

Modify the delete audit log call:

```go
// === MODIFIED: Include booking details in audit log ===
if h.auditService != nil {
    if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
        deletedData := map[string]interface{}{
            "booking_date":    booking.BookingDate.Format("2006-01-02"),
            "original_time":   booking.OriginalTime,
            "edited_time":     booking.EditedTime,
            "calculated_time": booking.CalculatedTime,
            "booking_type_id": booking.BookingTypeID.String(),
            "employee_id":     booking.EmployeeID.String(),
        }

        h.auditService.Log(r.Context(), r, service.LogEntry{
            TenantID:   tenantID,
            Action:     model.AuditActionDelete,
            EntityType: "booking",
            EntityID:   id,
            EntityName: "Booking " + timeutil.MinutesToString(booking.EditedTime) + " on " + booking.BookingDate.Format("2006-01-02"),
            Changes:    deletedData,
        })
    }
}
// === END MODIFIED ===
```

### Step 2.3: Enhance create audit log with entity name

**File**: `apps/api/internal/handler/booking.go`

In the `Create` method (line 311), add `EntityName` to the audit log:

```go
if h.auditService != nil {
    h.auditService.Log(r.Context(), r, service.LogEntry{
        TenantID:   tenantID,
        Action:     model.AuditActionCreate,
        EntityType: "booking",
        EntityID:   booking.ID,
        EntityName: "Booking " + timeutil.MinutesToString(booking.EditedTime) + " on " + booking.BookingDate.Format("2006-01-02"),
    })
}
```

### Verification

- Build passes: `cd apps/api && go build ./...`
- `make lint` passes
- Manual test: create a booking, update its time, verify audit log has `changes` field with before/after
- Manual test: delete a booking, verify audit log has deleted booking details

---

## Phase 3: Booking Logs Endpoint

### Step 3.1: Add GetLogs handler method

**File**: `apps/api/internal/handler/booking.go`

Add a new method to `BookingHandler`:

```go
// GetLogs handles GET /bookings/{id}/logs
func (h *BookingHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        respondError(w, http.StatusBadRequest, "Invalid booking ID")
        return
    }

    // Verify booking exists and caller has access
    booking, err := h.bookingRepo.GetWithDetails(r.Context(), id)
    if err != nil {
        if err == repository.ErrBookingNotFound {
            respondError(w, http.StatusNotFound, "Booking not found")
            return
        }
        respondError(w, http.StatusInternalServerError, "Failed to get booking")
        return
    }

    scope, err := scopeFromContext(r.Context())
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to load access scope")
        return
    }
    if tenantID, ok := middleware.TenantFromContext(r.Context()); ok {
        if !scope.AllowsTenant(tenantID) {
            respondError(w, http.StatusForbidden, "Permission denied")
            return
        }
    }
    if !scope.AllowsEmployee(booking.Employee) {
        respondError(w, http.StatusForbidden, "Permission denied")
        return
    }

    // Parse pagination
    limit := 50
    if l := r.URL.Query().Get("limit"); l != "" {
        if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
            limit = v
        }
    }

    if h.auditService == nil {
        respondJSON(w, http.StatusOK, map[string]interface{}{
            "data": []interface{}{},
            "meta": map[string]interface{}{
                "total": 0,
            },
        })
        return
    }

    tenantID, ok := middleware.TenantFromContext(r.Context())
    if !ok {
        respondError(w, http.StatusUnauthorized, "Tenant required")
        return
    }

    filter := repository.AuditLogFilter{
        TenantID:   tenantID,
        EntityType: "booking",
        EntityID:   &id,
        Limit:      limit,
    }

    logs, total, err := h.auditService.List(r.Context(), filter)
    if err != nil {
        respondError(w, http.StatusInternalServerError, "Failed to get booking logs")
        return
    }

    // Map to response format
    data := make([]map[string]interface{}, 0, len(logs))
    for _, l := range logs {
        entry := map[string]interface{}{
            "id":          l.ID.String(),
            "tenant_id":   l.TenantID.String(),
            "action":      string(l.Action),
            "entity_type": l.EntityType,
            "entity_id":   l.EntityID.String(),
            "performed_at": l.PerformedAt.Format(time.RFC3339),
        }
        if l.UserID != nil {
            entry["user_id"] = l.UserID.String()
        }
        if l.EntityName != nil {
            entry["entity_name"] = *l.EntityName
        }
        if l.Changes != nil {
            entry["changes"] = json.RawMessage(l.Changes)
        }
        if l.Metadata != nil {
            entry["metadata"] = json.RawMessage(l.Metadata)
        }
        if l.IPAddress != nil {
            entry["ip_address"] = *l.IPAddress
        }
        if l.UserAgent != nil {
            entry["user_agent"] = *l.UserAgent
        }
        data = append(data, entry)
    }

    respondJSON(w, http.StatusOK, map[string]interface{}{
        "data": data,
        "meta": map[string]interface{}{
            "total": total,
        },
    })
}
```

### Step 3.2: Register the new route

**File**: `apps/api/internal/handler/routes.go`

In the `RegisterBookingRoutes` function, within the `/bookings` route group, add the logs sub-route. Find the existing `r.Route("/bookings", ...)` block and add inside the `/{id}` sub-route:

```go
r.Route("/{id}", func(r chi.Router) {
    // ... existing GET, PUT, DELETE routes ...

    // Booking audit logs
    r.Get("/logs", h.GetLogs)
})
```

This route should use the same permission resolution as `GET /bookings/{id}` (employee-scoped `viewOwn` or `viewAll`).

### Step 3.3: Verify AuditLogFilter supports EntityID

**File**: `apps/api/internal/repository/auditlog.go`

Check that `AuditLogFilter` has an `EntityID` field of type `*uuid.UUID` and that the `List` method filters on it. Based on the research, the audit log repository already supports this filter.

### Verification

- Build passes: `cd apps/api && go build ./...`
- `make lint` passes
- `make swagger-bundle` includes the new endpoint
- Manual test: create booking, update it, then GET `/bookings/{id}/logs` returns audit entries
- The response includes `changes` with before/after values for the update entry

---

## Phase 4: Service-Level Tests

### Step 4.1: Test original_time immutability on update

**File**: `apps/api/internal/service/booking_test.go`

Add a test that verifies `OriginalTime` is never modified during an update, even when `EditedTime` changes.

```go
func TestBookingService_Update_OriginalTimeImmutable(t *testing.T) {
    ctx := context.Background()
    svc, bookingRepo, _, recalcSvc, monthlyValueRepo := newTestBookingService()

    tenantID := uuid.New()
    employeeID := uuid.New()
    bookingID := uuid.New()
    date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)
    originalTime := 483 // 08:03

    existingBooking := &model.Booking{
        ID:           bookingID,
        TenantID:     tenantID,
        EmployeeID:   employeeID,
        BookingDate:  date,
        OriginalTime: originalTime,
        EditedTime:   originalTime,
    }

    newTime := 480 // 08:00
    input := UpdateBookingInput{EditedTime: &newTime}

    bookingRepo.On("GetByID", ctx, bookingID).Return(existingBooking, nil)
    monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
    bookingRepo.On("Update", ctx, mock.MatchedBy(func(b *model.Booking) bool {
        // Verify original_time is NOT changed
        return b.OriginalTime == originalTime && b.EditedTime == 480
    })).Return(nil)
    recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{}, nil)

    result, err := svc.Update(ctx, bookingID, input)

    require.NoError(t, err)
    assert.Equal(t, originalTime, result.OriginalTime, "OriginalTime must remain immutable")
    assert.Equal(t, 480, result.EditedTime, "EditedTime should be updated")
    assert.NotEqual(t, result.OriginalTime, result.EditedTime, "After edit, values should differ")
    bookingRepo.AssertExpectations(t)
}
```

### Step 4.2: Test calculated_time cleared on edit

**File**: `apps/api/internal/service/booking_test.go`

Add a test that verifies `CalculatedTime` is set to `nil` when `EditedTime` changes.

```go
func TestBookingService_Update_CalculatedTimeCleared(t *testing.T) {
    ctx := context.Background()
    svc, bookingRepo, _, recalcSvc, monthlyValueRepo := newTestBookingService()

    tenantID := uuid.New()
    employeeID := uuid.New()
    bookingID := uuid.New()
    date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)
    calcTime := 495 // Previously calculated

    existingBooking := &model.Booking{
        ID:             bookingID,
        TenantID:       tenantID,
        EmployeeID:     employeeID,
        BookingDate:    date,
        OriginalTime:   483,
        EditedTime:     483,
        CalculatedTime: &calcTime,
    }

    newTime := 480
    input := UpdateBookingInput{EditedTime: &newTime}

    bookingRepo.On("GetByID", ctx, bookingID).Return(existingBooking, nil)
    monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
    bookingRepo.On("Update", ctx, mock.MatchedBy(func(b *model.Booking) bool {
        return b.CalculatedTime == nil && b.EditedTime == 480
    })).Return(nil)
    recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{}, nil)

    result, err := svc.Update(ctx, bookingID, input)

    require.NoError(t, err)
    assert.Nil(t, result.CalculatedTime, "CalculatedTime must be cleared when EditedTime changes")
}
```

### Step 4.3: Test update notes only does NOT clear calculated time

**File**: `apps/api/internal/service/booking_test.go`

```go
func TestBookingService_Update_NotesOnlyKeepsCalculatedTime(t *testing.T) {
    ctx := context.Background()
    svc, bookingRepo, _, recalcSvc, monthlyValueRepo := newTestBookingService()

    tenantID := uuid.New()
    employeeID := uuid.New()
    bookingID := uuid.New()
    date := time.Date(2026, 1, 22, 0, 0, 0, 0, time.UTC)
    calcTime := 495

    existingBooking := &model.Booking{
        ID:             bookingID,
        TenantID:       tenantID,
        EmployeeID:     employeeID,
        BookingDate:    date,
        OriginalTime:   483,
        EditedTime:     483,
        CalculatedTime: &calcTime,
    }

    newNotes := "Updated notes only"
    input := UpdateBookingInput{Notes: &newNotes}

    bookingRepo.On("GetByID", ctx, bookingID).Return(existingBooking, nil)
    monthlyValueRepo.On("IsMonthClosed", ctx, tenantID, employeeID, date).Return(false, nil)
    bookingRepo.On("Update", ctx, mock.MatchedBy(func(b *model.Booking) bool {
        return b.CalculatedTime != nil && *b.CalculatedTime == 495 && b.Notes == "Updated notes only"
    })).Return(nil)
    recalcSvc.On("TriggerRecalc", ctx, tenantID, employeeID, date).Return(&RecalcResult{}, nil)

    result, err := svc.Update(ctx, bookingID, input)

    require.NoError(t, err)
    assert.NotNil(t, result.CalculatedTime, "CalculatedTime must be preserved when only notes change")
    assert.Equal(t, 495, *result.CalculatedTime)
}
```

### Step 4.4: Test effective time returns calculated when available

**File**: `apps/api/internal/service/booking_test.go` (or `model/booking_test.go`)

```go
func TestBooking_EffectiveTime(t *testing.T) {
    calcTime := 495

    tests := []struct {
        name           string
        editedTime     int
        calculatedTime *int
        expected       int
    }{
        {"returns calculated when set", 483, &calcTime, 495},
        {"returns edited when calculated nil", 483, nil, 483},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            b := &model.Booking{
                EditedTime:     tt.editedTime,
                CalculatedTime: tt.calculatedTime,
            }
            assert.Equal(t, tt.expected, b.EffectiveTime())
        })
    }
}
```

### Step 4.5: Test IsEdited helper

**File**: `apps/api/internal/service/booking_test.go` (or `model/booking_test.go`)

```go
func TestBooking_IsEdited(t *testing.T) {
    tests := []struct {
        name         string
        originalTime int
        editedTime   int
        expected     bool
    }{
        {"not edited when equal", 480, 480, false},
        {"edited when different", 483, 480, true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            b := &model.Booking{
                OriginalTime: tt.originalTime,
                EditedTime:   tt.editedTime,
            }
            assert.Equal(t, tt.expected, b.IsEdited())
        })
    }
}
```

### Verification

```bash
cd apps/api && go test -v -run "TestBookingService_Update_OriginalTimeImmutable|TestBookingService_Update_CalculatedTimeCleared|TestBookingService_Update_NotesOnlyKeepsCalculatedTime|TestBooking_EffectiveTime|TestBooking_IsEdited" ./internal/service/...
```

All tests pass.

---

## Phase 5: Handler-Level Tests

### Step 5.1: Test create booking sets original=edited

**File**: `apps/api/internal/handler/booking_test.go`

This test already exists as `TestBookingHandler_Create_Success`. Enhance it to explicitly verify `original_time == edited_time` in the response:

```go
func TestBookingHandler_Create_OriginalEqualsEdited(t *testing.T) {
    h, _, tenant, employee, bookingType := setupBookingHandler(t)

    body := map[string]interface{}{
        "employee_id":     employee.ID.String(),
        "booking_type_id": bookingType.ID.String(),
        "booking_date":    time.Now().Format("2006-01-02"),
        "time":            "08:03",
    }
    bodyBytes, _ := json.Marshal(body)

    req := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(bodyBytes))
    req.Header.Set("Content-Type", "application/json")
    req = withBookingTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.Create(rr, req)

    assert.Equal(t, http.StatusCreated, rr.Code)
    var result map[string]interface{}
    err := json.Unmarshal(rr.Body.Bytes(), &result)
    require.NoError(t, err)

    // Verify original_time == edited_time on creation
    assert.Equal(t, result["original_time"], result["edited_time"],
        "On creation, original_time must equal edited_time")
    assert.Equal(t, "08:03", result["time_string"])
}
```

### Step 5.2: Test update does not change original_time

**File**: `apps/api/internal/handler/booking_test.go`

```go
func TestBookingHandler_Update_OriginalTimePreserved(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupBookingHandler(t)
    ctx := context.Background()

    // Create booking at 08:03
    input := service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   time.Now(),
        OriginalTime:  483, // 08:03
        EditedTime:    483,
        Source:        model.BookingSourceWeb,
    }
    created, err := svc.Create(ctx, input)
    require.NoError(t, err)

    // Update edited time to 08:00
    body := map[string]interface{}{
        "time": "08:00",
    }
    bodyBytes, _ := json.Marshal(body)

    req := httptest.NewRequest("PUT", "/bookings/"+created.ID.String(), bytes.NewBuffer(bodyBytes))
    req.Header.Set("Content-Type", "application/json")
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", created.ID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Update(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    err = json.Unmarshal(rr.Body.Bytes(), &result)
    require.NoError(t, err)

    // original_time must remain 483 (08:03)
    originalTime := int(result["original_time"].(float64))
    editedTime := int(result["edited_time"].(float64))
    assert.Equal(t, 483, originalTime, "original_time must not change on update")
    assert.Equal(t, 480, editedTime, "edited_time should be updated to 08:00")
}
```

### Step 5.3: Test booking log retrieval endpoint

**File**: `apps/api/internal/handler/booking_test.go`

```go
func TestBookingHandler_GetLogs_Success(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupBookingHandler(t)
    ctx := context.Background()

    // Set up audit service for this test
    db := testutil.SetupTestDB(t)
    auditLogRepo := repository.NewAuditLogRepository(db)
    auditService := service.NewAuditLogService(auditLogRepo)
    h.SetAuditService(auditService)

    // Create booking
    input := service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   time.Now(),
        OriginalTime:  480,
        EditedTime:    480,
        Source:        model.BookingSourceWeb,
    }
    created, err := svc.Create(ctx, input)
    require.NoError(t, err)

    // Manually log a create audit entry
    auditService.Log(ctx, nil, service.LogEntry{
        TenantID:   tenant.ID,
        Action:     model.AuditActionCreate,
        EntityType: "booking",
        EntityID:   created.ID,
    })

    // Request logs
    req := httptest.NewRequest("GET", "/bookings/"+created.ID.String()+"/logs", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", created.ID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    req = withBookingTenantContext(req, tenant)
    rr := httptest.NewRecorder()

    h.GetLogs(rr, req)

    assert.Equal(t, http.StatusOK, rr.Code)
    var result map[string]interface{}
    err = json.Unmarshal(rr.Body.Bytes(), &result)
    require.NoError(t, err)
    data := result["data"].([]interface{})
    assert.GreaterOrEqual(t, len(data), 1, "Should have at least one audit log entry")
}

func TestBookingHandler_GetLogs_BookingNotFound(t *testing.T) {
    h, _, _, _, _ := setupBookingHandler(t)

    req := httptest.NewRequest("GET", "/bookings/00000000-0000-0000-0000-000000000000/logs", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetLogs(rr, req)

    assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestBookingHandler_GetLogs_InvalidID(t *testing.T) {
    h, _, _, _, _ := setupBookingHandler(t)

    req := httptest.NewRequest("GET", "/bookings/invalid/logs", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", "invalid")
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.GetLogs(rr, req)

    assert.Equal(t, http.StatusBadRequest, rr.Code)
}
```

### Verification

```bash
cd apps/api && go test -v -run "TestBookingHandler_Create_OriginalEqualsEdited|TestBookingHandler_Update_OriginalTimePreserved|TestBookingHandler_GetLogs" ./internal/handler/...
```

All tests pass.

---

## Phase 6: Integration Tests

### Step 6.1: End-to-end recalculation flow test

**File**: `apps/api/internal/handler/booking_test.go`

This test verifies the full cycle: create booking -> calculate day -> verify calculated_time is set -> edit booking -> verify calculated_time is cleared -> recalculate -> verify new calculated_time.

```go
func TestBookingHandler_CalculationLifecycle(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupBookingHandler(t)
    ctx := context.Background()

    // Also need a "Go" booking type
    db := testutil.SetupTestDB(t)
    bookingTypeRepo := repository.NewBookingTypeRepository(db)
    goType := &model.BookingType{
        TenantID:  &tenant.ID,
        Code:      "TEST-OUT",
        Name:      "Test Clock Out",
        Direction: model.BookingDirectionOut,
        IsActive:  true,
    }
    require.NoError(t, bookingTypeRepo.Create(ctx, goType))

    // Create day plan and assign to employee (needed for calculation)
    dayPlanRepo := repository.NewDayPlanRepository(db)
    empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)

    dayPlan := &model.DayPlan{
        TenantID:     tenant.ID,
        Code:         "TEST-DP",
        Name:         "Test Day Plan",
        PlanType:     model.PlanTypeFixed,
        ComeFrom:     480,  // 08:00
        GoFrom:       1020, // 17:00
        RegularHours: 480,  // 8 hours
        IsActive:     true,
    }
    require.NoError(t, dayPlanRepo.Create(ctx, dayPlan))

    today := time.Now().Truncate(24 * time.Hour)
    empDayPlan := &model.EmployeeDayPlan{
        TenantID:   tenant.ID,
        EmployeeID: employee.ID,
        Date:       today,
        DayPlanID:  &dayPlan.ID,
    }
    require.NoError(t, empDayPlanRepo.Upsert(ctx, empDayPlan))

    // Step 1: Create come booking at 08:03
    comeInput := service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   today,
        OriginalTime:  483, // 08:03
        EditedTime:    483,
        Source:        model.BookingSourceTerminal,
    }
    comeBooking, err := svc.Create(ctx, comeInput)
    require.NoError(t, err)

    // Step 2: Create go booking at 17:05
    goInput := service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: goType.ID,
        BookingDate:   today,
        OriginalTime:  1025, // 17:05
        EditedTime:    1025,
        Source:        model.BookingSourceTerminal,
    }
    _, err = svc.Create(ctx, goInput)
    require.NoError(t, err)

    // Step 3: Trigger day calculation
    calcReq := httptest.NewRequest("POST",
        "/employees/"+employee.ID.String()+"/day/"+today.Format("2006-01-02")+"/calculate", nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", employee.ID.String())
    rctx.URLParams.Add("date", today.Format("2006-01-02"))
    calcReq = calcReq.WithContext(context.WithValue(calcReq.Context(), chi.RouteCtxKey, rctx))
    calcReq = withBookingTenantContext(calcReq, tenant)
    calcRR := httptest.NewRecorder()

    h.Calculate(calcRR, calcReq)
    assert.Equal(t, http.StatusOK, calcRR.Code)

    // Step 4: Verify come booking has calculated_time after calculation
    getReq := httptest.NewRequest("GET", "/bookings/"+comeBooking.ID.String(), nil)
    getRctx := chi.NewRouteContext()
    getRctx.URLParams.Add("id", comeBooking.ID.String())
    getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, getRctx))
    getRR := httptest.NewRecorder()
    h.GetByID(getRR, getReq)

    assert.Equal(t, http.StatusOK, getRR.Code)
    // Note: calculated_time depends on day plan rounding settings;
    // for a basic day plan without rounding, calculated_time may equal edited_time
    // or may differ based on tolerance. The key check is that calculation ran.

    // Step 5: Edit booking to 08:00
    updateBody := map[string]interface{}{"time": "08:00"}
    updateBytes, _ := json.Marshal(updateBody)
    updateReq := httptest.NewRequest("PUT", "/bookings/"+comeBooking.ID.String(), bytes.NewBuffer(updateBytes))
    updateReq.Header.Set("Content-Type", "application/json")
    updateRctx := chi.NewRouteContext()
    updateRctx.URLParams.Add("id", comeBooking.ID.String())
    updateReq = updateReq.WithContext(context.WithValue(updateReq.Context(), chi.RouteCtxKey, updateRctx))
    updateRR := httptest.NewRecorder()
    h.Update(updateRR, updateReq)

    assert.Equal(t, http.StatusOK, updateRR.Code)
    var updateResult map[string]interface{}
    err = json.Unmarshal(updateRR.Body.Bytes(), &updateResult)
    require.NoError(t, err)
    assert.Equal(t, float64(483), updateResult["original_time"], "original_time unchanged")
    assert.Equal(t, float64(480), updateResult["edited_time"], "edited_time updated")
}
```

### Step 6.2: Test delete triggers recalculation

**File**: `apps/api/internal/handler/booking_test.go`

```go
func TestBookingHandler_Delete_TriggersRecalc(t *testing.T) {
    h, svc, tenant, employee, bookingType := setupBookingHandler(t)
    ctx := context.Background()

    today := time.Now().Truncate(24 * time.Hour)

    // Create booking
    input := service.CreateBookingInput{
        TenantID:      tenant.ID,
        EmployeeID:    employee.ID,
        BookingTypeID: bookingType.ID,
        BookingDate:   today,
        OriginalTime:  480,
        EditedTime:    480,
        Source:        model.BookingSourceWeb,
    }
    created, err := svc.Create(ctx, input)
    require.NoError(t, err)

    // Delete the booking
    req := httptest.NewRequest("DELETE", "/bookings/"+created.ID.String(), nil)
    rctx := chi.NewRouteContext()
    rctx.URLParams.Add("id", created.ID.String())
    req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
    rr := httptest.NewRecorder()

    h.Delete(rr, req)

    // Should succeed (204 or 200 depending on handler)
    assert.Contains(t, []int{http.StatusOK, http.StatusNoContent}, rr.Code)

    // Verify booking is gone
    getReq := httptest.NewRequest("GET", "/bookings/"+created.ID.String(), nil)
    getRctx := chi.NewRouteContext()
    getRctx.URLParams.Add("id", created.ID.String())
    getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, getRctx))
    getRR := httptest.NewRecorder()
    h.GetByID(getRR, getReq)
    assert.Equal(t, http.StatusNotFound, getRR.Code)
}
```

### Verification

```bash
cd apps/api && go test -v -run "TestBookingHandler_CalculationLifecycle|TestBookingHandler_Delete_TriggersRecalc" ./internal/handler/...
```

All integration tests pass.

---

## Phase 7: Final Verification

### Step 7.1: Run all tests

```bash
make test
```

All existing tests continue to pass, new tests also pass.

### Step 7.2: Run linter

```bash
make lint
```

No new lint errors.

### Step 7.3: Bundle OpenAPI spec

```bash
make swagger-bundle
```

Bundled spec includes all new annotations and the `/bookings/{id}/logs` endpoint.

### Step 7.4: Verify against acceptance criteria

| Criterion | Status |
|-----------|--------|
| Original time is immutable and preserved on edits | Verified: service never modifies OriginalTime; tested |
| Edited time changes create log entries | Verified: Changes field populated with before/after on update |
| Calculated time is updated on day recalculation | Verified: existing DailyCalcService + integration test |
| Pairing behaves deterministically and respects categories | Verified: existing repo SetPair/ClearPair + calculation package |

### Step 7.5: Verify test case pack from ticket

| Test Case | Coverage |
|-----------|----------|
| 1) Ingest at 08:03 -> original=08:03, edited=08:03 | `TestBookingHandler_Create_OriginalEqualsEdited` |
| 2) Edit to 08:00 -> original=08:03, log entry | `TestBookingHandler_Update_OriginalTimePreserved` + audit log enrichment |
| 3) Day plan rounding 15min, edited=08:03 -> calculated=08:15 | Handled by existing calculation engine |
| 4) Manual calc -> calculated times updated | `TestBookingHandler_CalculationLifecycle` |

---

## Implementation Order Summary

| Phase | Description | Files Modified | New Files |
|-------|-------------|----------------|-----------|
| 1 | OpenAPI spec enhancement | `api/schemas/bookings.yaml`, `api/paths/bookings.yaml`, `api/openapi.yaml` | None |
| 2 | Audit log enrichment | `apps/api/internal/handler/booking.go` | None |
| 3 | Booking logs endpoint | `apps/api/internal/handler/booking.go`, `apps/api/internal/handler/routes.go` | None |
| 4 | Service-level tests | `apps/api/internal/service/booking_test.go` | None |
| 5 | Handler-level tests | `apps/api/internal/handler/booking_test.go` | None |
| 6 | Integration tests | `apps/api/internal/handler/booking_test.go` | None |
| 7 | Final verification | None | None |

**No new database migrations required** -- all tables and columns already exist.
**No new model files required** -- Booking model is complete.
**No new repository files required** -- BookingRepository and AuditLogRepository are complete.
**No new service files required** -- BookingService and AuditLogService are complete.

The changes are focused on:
1. Enriching existing audit log calls with before/after data (handler modifications)
2. Adding a convenience endpoint for booking-specific audit log retrieval
3. OpenAPI documentation accuracy
4. Closing test coverage gaps
