# TICKET-084: Add Vacation Balance Endpoint

**Type**: Handler
**Effort**: XS
**Sprint**: 20 - Vacation Balance
**Dependencies**: TICKET-083

## Description

Add vacation balance endpoint to absence handler.

## Files to Modify

- `apps/api/internal/handler/absence.go`

## Implementation

Add to AbsenceHandler:

```go
type AbsenceHandler struct {
    service         service.AbsenceService
    typeService     service.AbsenceTypeService
    vacationService service.VacationService
}

// GetVacationBalance handles GET /api/v1/employees/{id}/vacation-balance
func (h *AbsenceHandler) GetVacationBalance(w http.ResponseWriter, r *http.Request) {
    empIDStr := chi.URLParam(r, "id")
    employeeID, err := uuid.Parse(empIDStr)
    if err != nil {
        http.Error(w, "invalid employee id", http.StatusBadRequest)
        return
    }

    // Get year from query param, default to current year
    year := time.Now().Year()
    if y := r.URL.Query().Get("year"); y != "" {
        if parsedYear, err := strconv.Atoi(y); err == nil {
            year = parsedYear
        }
    }

    balance, err := h.vacationService.GetBalance(r.Context(), employeeID, year)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    respondJSON(w, http.StatusOK, balance)
}
```

## Route Registration

```go
r.Get("/api/v1/employees/{id}/vacation-balance", absenceHandler.GetVacationBalance)
```

## Response Format

```json
{
    "year": 2024,
    "entitlement": 30.0,
    "carryover": 3.0,
    "adjustments": 0.0,
    "taken": 10.0,
    "available": 23.0,
    "planned": 5.0
}
```

## Acceptance Criteria

- [ ] `make lint` passes
- [ ] Returns balance for specified year
- [ ] Defaults to current year if not specified
- [ ] Includes all balance components
