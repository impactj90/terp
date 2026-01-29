package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func setupBookingHandler(t *testing.T) (*handler.BookingHandler, *service.BookingService, *model.Tenant, *model.Employee, *model.BookingType) {
	db := testutil.SetupTestDB(t)
	tenantRepo := repository.NewTenantRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	bookingTypeRepo := repository.NewBookingTypeRepository(db)
	bookingRepo := repository.NewBookingRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	dailyValueRepo := repository.NewDailyValueRepository(db)
	holidayRepo := repository.NewHolidayRepository(db)

	ctx := context.Background()

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	require.NoError(t, tenantRepo.Create(ctx, tenant))

	// Create test employee
	employee := &model.Employee{
		TenantID:        tenant.ID,
		FirstName:       "Test",
		LastName:        "Employee",
		PersonnelNumber: "TEST-001",
		PIN:             "1234",
		EntryDate:       time.Now().AddDate(-1, 0, 0),
		IsActive:        true,
	}
	require.NoError(t, employeeRepo.Create(ctx, employee))

	// Create test booking type
	bookingType := &model.BookingType{
		TenantID:  &tenant.ID,
		Code:      "TEST-IN",
		Name:      "Test Clock In",
		Direction: model.BookingDirectionIn,
		IsActive:  true,
	}
	require.NoError(t, bookingTypeRepo.Create(ctx, bookingType))

	// Create services
	tariffRepo := repository.NewTariffRepository(db)
	dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo)
	recalcService := service.NewRecalcService(dailyCalcService, employeeRepo)
	bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)
	employeeService := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo)

	// Create handler
	h := handler.NewBookingHandler(
		bookingService,
		dailyCalcService,
		employeeService,
		bookingRepo,
		dailyValueRepo,
		empDayPlanRepo,
		holidayRepo,
	)

	return h, bookingService, tenant, employee, bookingType
}

func withBookingTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestBookingHandler_Create_Success(t *testing.T) {
	h, _, tenant, employee, bookingType := setupBookingHandler(t)

	body := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_type_id": bookingType.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"time":            "08:00",
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
	assert.NotEmpty(t, result["id"])
	assert.Equal(t, "08:00", result["time_string"])
}

func TestBookingHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant, _, _ := setupBookingHandler(t)

	req := httptest.NewRequest("POST", "/bookings", bytes.NewBufferString("invalid"))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Create_InvalidTimeFormat(t *testing.T) {
	h, _, tenant, employee, bookingType := setupBookingHandler(t)

	body := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_type_id": bookingType.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"time":            "invalid",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Create_NoTenant(t *testing.T) {
	h, _, _, employee, bookingType := setupBookingHandler(t)

	body := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_type_id": bookingType.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"time":            "08:00",
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestBookingHandler_GetByID_Success(t *testing.T) {
	h, svc, tenant, employee, bookingType := setupBookingHandler(t)
	ctx := context.Background()

	// Create a booking first
	input := service.CreateBookingInput{
		TenantID:      tenant.ID,
		EmployeeID:    employee.ID,
		BookingTypeID: bookingType.ID,
		BookingDate:   time.Now(),
		OriginalTime:  480, // 08:00
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/bookings/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetByID(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID.String(), result["id"])
}

func TestBookingHandler_GetByID_InvalidID(t *testing.T) {
	h, _, _, _, _ := setupBookingHandler(t)

	req := httptest.NewRequest("GET", "/bookings/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetByID(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_GetByID_NotFound(t *testing.T) {
	h, _, _, _, _ := setupBookingHandler(t)

	req := httptest.NewRequest("GET", "/bookings/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetByID(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestBookingHandler_List_Success(t *testing.T) {
	h, svc, tenant, employee, bookingType := setupBookingHandler(t)
	ctx := context.Background()

	// Create bookings
	for i := 0; i < 3; i++ {
		input := service.CreateBookingInput{
			TenantID:      tenant.ID,
			EmployeeID:    employee.ID,
			BookingTypeID: bookingType.ID,
			BookingDate:   time.Now(),
			OriginalTime:  480 + i*60,
			EditedTime:    480 + i*60,
			Source:        model.BookingSourceWeb,
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/bookings", nil)
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	data := result["data"].([]interface{})
	assert.GreaterOrEqual(t, len(data), 3)
}

func TestBookingHandler_List_FilterByEmployee(t *testing.T) {
	h, svc, tenant, employee, bookingType := setupBookingHandler(t)
	ctx := context.Background()

	// Create a booking
	input := service.CreateBookingInput{
		TenantID:      tenant.ID,
		EmployeeID:    employee.ID,
		BookingTypeID: bookingType.ID,
		BookingDate:   time.Now(),
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/bookings?employee_id="+employee.ID.String(), nil)
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	data := result["data"].([]interface{})
	assert.GreaterOrEqual(t, len(data), 1)
}

func TestBookingHandler_List_NoTenant(t *testing.T) {
	h, _, _, _, _ := setupBookingHandler(t)

	req := httptest.NewRequest("GET", "/bookings", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestBookingHandler_Update_Success(t *testing.T) {
	h, svc, tenant, employee, bookingType := setupBookingHandler(t)
	ctx := context.Background()

	// Create a booking first
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

	body := `{"time": "08:15", "notes": "Updated"}`
	req := httptest.NewRequest("PUT", "/bookings/"+created.ID.String(), bytes.NewBufferString(body))
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
	assert.Equal(t, "08:15", result["time_string"])
}

func TestBookingHandler_Update_InvalidID(t *testing.T) {
	h, _, _, _, _ := setupBookingHandler(t)

	body := `{"time": "08:15"}`
	req := httptest.NewRequest("PUT", "/bookings/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Update_NotFound(t *testing.T) {
	h, _, _, _, _ := setupBookingHandler(t)

	body := `{"time": "08:15"}`
	req := httptest.NewRequest("PUT", "/bookings/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestBookingHandler_Delete_Success(t *testing.T) {
	h, svc, tenant, employee, bookingType := setupBookingHandler(t)
	ctx := context.Background()

	// Create a booking first
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

	req := httptest.NewRequest("DELETE", "/bookings/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)
}

func TestBookingHandler_Delete_InvalidID(t *testing.T) {
	h, _, _, _, _ := setupBookingHandler(t)

	req := httptest.NewRequest("DELETE", "/bookings/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Delete_NotFound(t *testing.T) {
	h, _, _, _, _ := setupBookingHandler(t)

	req := httptest.NewRequest("DELETE", "/bookings/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestBookingHandler_GetDayView_Success(t *testing.T) {
	h, svc, tenant, employee, bookingType := setupBookingHandler(t)
	ctx := context.Background()

	today := time.Now()

	// Create a booking for today
	input := service.CreateBookingInput{
		TenantID:      tenant.ID,
		EmployeeID:    employee.ID,
		BookingTypeID: bookingType.ID,
		BookingDate:   today,
		OriginalTime:  480,
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employees/"+employee.ID.String()+"/day/"+today.Format("2006-01-02"), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", employee.ID.String())
	rctx.URLParams.Add("date", today.Format("2006-01-02"))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.GetDayView(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result map[string]interface{}
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, employee.ID.String(), result["employee_id"])
	bookings := result["bookings"].([]interface{})
	assert.GreaterOrEqual(t, len(bookings), 1)
}

func TestBookingHandler_GetDayView_InvalidEmployeeID(t *testing.T) {
	h, _, tenant, _, _ := setupBookingHandler(t)

	req := httptest.NewRequest("GET", "/employees/invalid/day/2024-01-15", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	rctx.URLParams.Add("date", "2024-01-15")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.GetDayView(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_GetDayView_InvalidDate(t *testing.T) {
	h, _, tenant, employee, _ := setupBookingHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+employee.ID.String()+"/day/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", employee.ID.String())
	rctx.URLParams.Add("date", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.GetDayView(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_GetDayView_NoTenant(t *testing.T) {
	h, _, _, employee, _ := setupBookingHandler(t)

	req := httptest.NewRequest("GET", "/employees/"+employee.ID.String()+"/day/2024-01-15", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", employee.ID.String())
	rctx.URLParams.Add("date", "2024-01-15")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetDayView(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestBookingHandler_Calculate_Success(t *testing.T) {
	h, svc, tenant, employee, bookingType := setupBookingHandler(t)
	ctx := context.Background()

	today := time.Now()

	// Create bookings for calculation (IN at 08:00, OUT at 17:00)
	inInput := service.CreateBookingInput{
		TenantID:      tenant.ID,
		EmployeeID:    employee.ID,
		BookingTypeID: bookingType.ID,
		BookingDate:   today,
		OriginalTime:  480, // 08:00
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	_, err := svc.Create(ctx, inInput)
	require.NoError(t, err)

	req := httptest.NewRequest("POST", "/employees/"+employee.ID.String()+"/day/"+today.Format("2006-01-02")+"/calculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", employee.ID.String())
	rctx.URLParams.Add("date", today.Format("2006-01-02"))
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Calculate(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestBookingHandler_Calculate_InvalidEmployeeID(t *testing.T) {
	h, _, tenant, _, _ := setupBookingHandler(t)

	req := httptest.NewRequest("POST", "/employees/invalid/day/2024-01-15/calculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	rctx.URLParams.Add("date", "2024-01-15")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Calculate(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Calculate_InvalidDate(t *testing.T) {
	h, _, tenant, employee, _ := setupBookingHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+employee.ID.String()+"/day/invalid/calculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", employee.ID.String())
	rctx.URLParams.Add("date", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Calculate(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_Calculate_NoTenant(t *testing.T) {
	h, _, _, employee, _ := setupBookingHandler(t)

	req := httptest.NewRequest("POST", "/employees/"+employee.ID.String()+"/day/2024-01-15/calculate", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", employee.ID.String())
	rctx.URLParams.Add("date", "2024-01-15")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Calculate(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}
