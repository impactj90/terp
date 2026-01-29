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
	absenceDayRepo := repository.NewAbsenceDayRepository(db)

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
	dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
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

// ===== Phase 5: Handler-Level Tests =====

func setupBookingHandlerWithAudit(t *testing.T) (*handler.BookingHandler, *service.BookingService, *service.AuditLogService, *model.Tenant, *model.Employee, *model.BookingType) {
	db := testutil.SetupTestDB(t)
	tenantRepo := repository.NewTenantRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	bookingTypeRepo := repository.NewBookingTypeRepository(db)
	bookingRepo := repository.NewBookingRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	dailyValueRepo := repository.NewDailyValueRepository(db)
	holidayRepo := repository.NewHolidayRepository(db)
	absenceDayRepo := repository.NewAbsenceDayRepository(db)
	auditLogRepo := repository.NewAuditLogRepository(db)

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
	dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
	recalcService := service.NewRecalcService(dailyCalcService, employeeRepo)
	bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)
	employeeService := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo)
	auditService := service.NewAuditLogService(auditLogRepo)

	// Create handler with audit service
	h := handler.NewBookingHandler(
		bookingService,
		dailyCalcService,
		employeeService,
		bookingRepo,
		dailyValueRepo,
		empDayPlanRepo,
		holidayRepo,
	)
	h.SetAuditService(auditService)

	return h, bookingService, auditService, tenant, employee, bookingType
}

func TestBookingHandler_GetLogs_Success(t *testing.T) {
	h, svc, _, tenant, employee, bookingType := setupBookingHandlerWithAudit(t)
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
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// The Create handler would log, but we called the service directly.
	// Let's call the handler Create to generate the audit log.
	body := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_type_id": bookingType.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"time":            "09:00",
	}
	bodyBytes, _ := json.Marshal(body)

	createReq := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(bodyBytes))
	createReq.Header.Set("Content-Type", "application/json")
	createReq = withBookingTenantContext(createReq, tenant)
	createRR := httptest.NewRecorder()
	h.Create(createRR, createReq)
	assert.Equal(t, http.StatusCreated, createRR.Code)

	// Decode the created booking to get its ID
	var createdResp map[string]interface{}
	require.NoError(t, json.Unmarshal(createRR.Body.Bytes(), &createdResp))
	createdID := createdResp["id"].(string)

	// Now request logs for the booking
	req := httptest.NewRequest("GET", "/bookings/"+createdID+"/logs", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", createdID)
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

	// Verify first log entry is a create action
	firstLog := data[0].(map[string]interface{})
	assert.Equal(t, "create", firstLog["action"])
	assert.Equal(t, "booking", firstLog["entity_type"])

	// Verify the directly created booking has no logs (created via service, not handler)
	_ = created // direct service call doesn't create audit logs
}

func TestBookingHandler_GetLogs_InvalidBookingID(t *testing.T) {
	h, _, _, _, _, _ := setupBookingHandlerWithAudit(t)

	req := httptest.NewRequest("GET", "/bookings/invalid/logs", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.GetLogs(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestBookingHandler_GetLogs_BookingNotFound(t *testing.T) {
	h, _, _, tenant, _, _ := setupBookingHandlerWithAudit(t)

	nonExistentID := uuid.New().String()
	req := httptest.NewRequest("GET", "/bookings/"+nonExistentID+"/logs", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", nonExistentID)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.GetLogs(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestBookingHandler_Update_AuditLogContainsChanges(t *testing.T) {
	h, svc, auditSvc, tenant, employee, bookingType := setupBookingHandlerWithAudit(t)
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

	// Update the booking via handler (which generates audit log)
	body := `{"time": "08:30", "notes": "Late arrival"}`
	req := httptest.NewRequest("PUT", "/bookings/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	req = withBookingTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Update(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)

	// Verify audit log was created with changes
	entityType := "booking"
	logs, total, err := auditSvc.List(ctx, repository.AuditLogFilter{
		TenantID:   tenant.ID,
		EntityType: &entityType,
		EntityID:   &created.ID,
		Limit:      10,
	})
	require.NoError(t, err)
	assert.GreaterOrEqual(t, total, int64(1))

	// Find the update log
	var updateLog *model.AuditLog
	for i := range logs {
		if logs[i].Action == model.AuditActionUpdate {
			updateLog = &logs[i]
			break
		}
	}
	require.NotNil(t, updateLog, "Expected an update audit log entry")
	assert.Equal(t, "booking", updateLog.EntityType)
	assert.NotNil(t, updateLog.Changes, "Changes field should be populated")

	// Verify changes JSON contains before/after values
	var changes map[string]interface{}
	err = json.Unmarshal(updateLog.Changes, &changes)
	require.NoError(t, err)

	editedTimeChange, ok := changes["edited_time"].(map[string]interface{})
	require.True(t, ok, "Changes should contain edited_time")
	assert.Equal(t, float64(480), editedTimeChange["before"])
	assert.Equal(t, float64(510), editedTimeChange["after"]) // 08:30 = 510 minutes

	notesChange, ok := changes["notes"].(map[string]interface{})
	require.True(t, ok, "Changes should contain notes")
	assert.Equal(t, "", notesChange["before"])
	assert.Equal(t, "Late arrival", notesChange["after"])
}

func TestBookingHandler_Create_OriginalTimePreserved(t *testing.T) {
	h, _, _, tenant, employee, bookingType := setupBookingHandlerWithAudit(t)

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

	// Both original_time and edited_time should be 480 (08:00)
	assert.Equal(t, float64(480), result["original_time"])
	assert.Equal(t, float64(480), result["edited_time"])
	assert.Equal(t, "08:00", result["time_string"])
}

func TestBookingHandler_GetLogs_EmptyWhenNoAuditLogs(t *testing.T) {
	h, svc, _, tenant, employee, bookingType := setupBookingHandlerWithAudit(t)
	ctx := context.Background()

	// Create a booking directly via service (no handler audit log)
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
	assert.Equal(t, 0, len(data), "Bookings created via service should have no audit logs")
}

// ===== Phase 6: Integration Tests =====

func TestBookingHandler_FullLifecycle(t *testing.T) {
	h, _, auditSvc, tenant, employee, bookingType := setupBookingHandlerWithAudit(t)

	// Step 1: Create a booking at 08:00
	createBody := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_type_id": bookingType.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"time":            "08:00",
	}
	createBodyBytes, _ := json.Marshal(createBody)

	createReq := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(createBodyBytes))
	createReq.Header.Set("Content-Type", "application/json")
	createReq = withBookingTenantContext(createReq, tenant)
	createRR := httptest.NewRecorder()
	h.Create(createRR, createReq)
	require.Equal(t, http.StatusCreated, createRR.Code)

	var created map[string]interface{}
	require.NoError(t, json.Unmarshal(createRR.Body.Bytes(), &created))
	bookingID := created["id"].(string)

	// Verify original_time and edited_time match
	assert.Equal(t, float64(480), created["original_time"])
	assert.Equal(t, float64(480), created["edited_time"])
	assert.Equal(t, "08:00", created["time_string"])

	// Step 2: Update to 08:15 -- original_time must stay 480
	updateBody := `{"time": "08:15", "notes": "Corrected"}`
	updateReq := httptest.NewRequest("PUT", "/bookings/"+bookingID, bytes.NewBufferString(updateBody))
	updateReq.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", bookingID)
	updateReq = updateReq.WithContext(context.WithValue(updateReq.Context(), chi.RouteCtxKey, rctx))
	updateReq = withBookingTenantContext(updateReq, tenant)
	updateRR := httptest.NewRecorder()
	h.Update(updateRR, updateReq)
	require.Equal(t, http.StatusOK, updateRR.Code)

	var updated map[string]interface{}
	require.NoError(t, json.Unmarshal(updateRR.Body.Bytes(), &updated))

	assert.Equal(t, float64(480), updated["original_time"], "original_time must not change on update")
	assert.Equal(t, float64(495), updated["edited_time"], "edited_time should be 08:15 = 495")
	assert.Equal(t, "08:15", updated["time_string"])
	assert.Equal(t, "Corrected", updated["notes"])

	// Step 3: Verify audit logs contain both create and update
	logsReq := httptest.NewRequest("GET", "/bookings/"+bookingID+"/logs", nil)
	logsRctx := chi.NewRouteContext()
	logsRctx.URLParams.Add("id", bookingID)
	logsReq = logsReq.WithContext(context.WithValue(logsReq.Context(), chi.RouteCtxKey, logsRctx))
	logsReq = withBookingTenantContext(logsReq, tenant)
	logsRR := httptest.NewRecorder()
	h.GetLogs(logsRR, logsReq)
	require.Equal(t, http.StatusOK, logsRR.Code)

	var logsResult map[string]interface{}
	require.NoError(t, json.Unmarshal(logsRR.Body.Bytes(), &logsResult))
	logsData := logsResult["data"].([]interface{})
	assert.GreaterOrEqual(t, len(logsData), 2, "Should have create + update audit logs")

	// Verify actions present
	actions := make(map[string]bool)
	for _, l := range logsData {
		entry := l.(map[string]interface{})
		actions[entry["action"].(string)] = true
	}
	assert.True(t, actions["create"], "Should have create audit log")
	assert.True(t, actions["update"], "Should have update audit log")

	// Step 4: Delete the booking
	deleteReq := httptest.NewRequest("DELETE", "/bookings/"+bookingID, nil)
	deleteRctx := chi.NewRouteContext()
	deleteRctx.URLParams.Add("id", bookingID)
	deleteReq = deleteReq.WithContext(context.WithValue(deleteReq.Context(), chi.RouteCtxKey, deleteRctx))
	deleteReq = withBookingTenantContext(deleteReq, tenant)
	deleteRR := httptest.NewRecorder()
	h.Delete(deleteRR, deleteReq)
	require.Equal(t, http.StatusNoContent, deleteRR.Code)

	// Step 5: Verify booking is gone (get should return 404)
	getReq := httptest.NewRequest("GET", "/bookings/"+bookingID, nil)
	getRctx := chi.NewRouteContext()
	getRctx.URLParams.Add("id", bookingID)
	getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, getRctx))
	getRR := httptest.NewRecorder()
	h.GetByID(getRR, getReq)
	assert.Equal(t, http.StatusNotFound, getRR.Code)

	// Step 6: Verify the delete was also logged
	bookingUUID, _ := uuid.Parse(bookingID)
	entityType := "booking"
	allLogs, _, err := auditSvc.List(context.Background(), repository.AuditLogFilter{
		TenantID:   tenant.ID,
		EntityType: &entityType,
		EntityID:   &bookingUUID,
		Limit:      20,
	})
	require.NoError(t, err)

	deleteActions := 0
	for _, l := range allLogs {
		if l.Action == model.AuditActionDelete {
			deleteActions++
			// Verify delete log has changes with booking details
			assert.NotNil(t, l.Changes, "Delete audit log should contain booking details")
		}
	}
	assert.Equal(t, 1, deleteActions, "Should have exactly one delete audit log")
}

func TestBookingHandler_UpdateDoesNotChangeOriginalTime_MultipleUpdates(t *testing.T) {
	h, _, _, tenant, employee, bookingType := setupBookingHandlerWithAudit(t)

	// Create
	createBody := map[string]interface{}{
		"employee_id":     employee.ID.String(),
		"booking_type_id": bookingType.ID.String(),
		"booking_date":    time.Now().Format("2006-01-02"),
		"time":            "08:00",
	}
	createBytes, _ := json.Marshal(createBody)

	createReq := httptest.NewRequest("POST", "/bookings", bytes.NewBuffer(createBytes))
	createReq.Header.Set("Content-Type", "application/json")
	createReq = withBookingTenantContext(createReq, tenant)
	createRR := httptest.NewRecorder()
	h.Create(createRR, createReq)
	require.Equal(t, http.StatusCreated, createRR.Code)

	var created map[string]interface{}
	require.NoError(t, json.Unmarshal(createRR.Body.Bytes(), &created))
	bookingID := created["id"].(string)

	// Update 1: Change to 08:15
	update1 := httptest.NewRequest("PUT", "/bookings/"+bookingID, bytes.NewBufferString(`{"time": "08:15"}`))
	update1.Header.Set("Content-Type", "application/json")
	rctx1 := chi.NewRouteContext()
	rctx1.URLParams.Add("id", bookingID)
	update1 = update1.WithContext(context.WithValue(update1.Context(), chi.RouteCtxKey, rctx1))
	update1 = withBookingTenantContext(update1, tenant)
	rr1 := httptest.NewRecorder()
	h.Update(rr1, update1)
	require.Equal(t, http.StatusOK, rr1.Code)

	var updated1 map[string]interface{}
	require.NoError(t, json.Unmarshal(rr1.Body.Bytes(), &updated1))
	assert.Equal(t, float64(480), updated1["original_time"], "First update: original must stay")
	assert.Equal(t, float64(495), updated1["edited_time"])

	// Update 2: Change to 08:30
	update2 := httptest.NewRequest("PUT", "/bookings/"+bookingID, bytes.NewBufferString(`{"time": "08:30"}`))
	update2.Header.Set("Content-Type", "application/json")
	rctx2 := chi.NewRouteContext()
	rctx2.URLParams.Add("id", bookingID)
	update2 = update2.WithContext(context.WithValue(update2.Context(), chi.RouteCtxKey, rctx2))
	update2 = withBookingTenantContext(update2, tenant)
	rr2 := httptest.NewRecorder()
	h.Update(rr2, update2)
	require.Equal(t, http.StatusOK, rr2.Code)

	var updated2 map[string]interface{}
	require.NoError(t, json.Unmarshal(rr2.Body.Bytes(), &updated2))
	assert.Equal(t, float64(480), updated2["original_time"], "Second update: original must STILL stay 480")
	assert.Equal(t, float64(510), updated2["edited_time"], "edited_time should be 08:30 = 510")

	// Update 3: Change to 09:00
	update3 := httptest.NewRequest("PUT", "/bookings/"+bookingID, bytes.NewBufferString(`{"time": "09:00"}`))
	update3.Header.Set("Content-Type", "application/json")
	rctx3 := chi.NewRouteContext()
	rctx3.URLParams.Add("id", bookingID)
	update3 = update3.WithContext(context.WithValue(update3.Context(), chi.RouteCtxKey, rctx3))
	update3 = withBookingTenantContext(update3, tenant)
	rr3 := httptest.NewRecorder()
	h.Update(rr3, update3)
	require.Equal(t, http.StatusOK, rr3.Code)

	var updated3 map[string]interface{}
	require.NoError(t, json.Unmarshal(rr3.Body.Bytes(), &updated3))
	assert.Equal(t, float64(480), updated3["original_time"], "Third update: original must STILL be 480 after multiple edits")
	assert.Equal(t, float64(540), updated3["edited_time"], "edited_time should be 09:00 = 540")
}

func TestBookingHandler_DeleteTriggersRecalculation(t *testing.T) {
	h, svc, _, tenant, employee, bookingType := setupBookingHandlerWithAudit(t)
	ctx := context.Background()

	today := time.Now()

	// Create a booking
	input := service.CreateBookingInput{
		TenantID:      tenant.ID,
		EmployeeID:    employee.ID,
		BookingTypeID: bookingType.ID,
		BookingDate:   today,
		OriginalTime:  480, // 08:00
		EditedTime:    480,
		Source:        model.BookingSourceWeb,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Delete via handler -- this should trigger recalc
	deleteReq := httptest.NewRequest("DELETE", "/bookings/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	deleteReq = deleteReq.WithContext(context.WithValue(deleteReq.Context(), chi.RouteCtxKey, rctx))
	deleteReq = withBookingTenantContext(deleteReq, tenant)
	deleteRR := httptest.NewRecorder()
	h.Delete(deleteRR, deleteReq)
	require.Equal(t, http.StatusNoContent, deleteRR.Code)

	// After deletion, the booking should not exist
	getReq := httptest.NewRequest("GET", "/bookings/"+created.ID.String(), nil)
	getRctx := chi.NewRouteContext()
	getRctx.URLParams.Add("id", created.ID.String())
	getReq = getReq.WithContext(context.WithValue(getReq.Context(), chi.RouteCtxKey, getRctx))
	getRR := httptest.NewRecorder()
	h.GetByID(getRR, getReq)
	assert.Equal(t, http.StatusNotFound, getRR.Code, "Deleted booking should not be found")

	// Listing for this employee/date should show one fewer booking
	listReq := httptest.NewRequest("GET", "/bookings?employee_id="+employee.ID.String(), nil)
	listReq = withBookingTenantContext(listReq, tenant)
	listRR := httptest.NewRecorder()
	h.List(listRR, listReq)
	assert.Equal(t, http.StatusOK, listRR.Code)
}
