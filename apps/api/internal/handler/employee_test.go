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

func setupEmployeeHandler(t *testing.T) (*handler.EmployeeHandler, *service.EmployeeService, *model.Tenant) {
	db := testutil.SetupTestDB(t)
	employeeRepo := repository.NewEmployeeRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	svc := service.NewEmployeeService(employeeRepo, nil, nil)
	h := handler.NewEmployeeHandler(svc)

	// Create test tenant
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)

	return h, svc, tenant
}

func withEmployeeTenantContext(r *http.Request, tenant *model.Tenant) *http.Request {
	ctx := context.WithValue(r.Context(), middleware.TenantContextKey, tenant.ID)
	return r.WithContext(ctx)
}

func TestEmployeeHandler_Create_Success(t *testing.T) {
	h, _, tenant := setupEmployeeHandler(t)

	entryDate := time.Now().AddDate(0, -1, 0).Format("2006-01-02")
	body := `{"personnel_number": "E001", "pin": "1234", "first_name": "John", "last_name": "Doe", "email": "john@example.com", "entry_date": "` + entryDate + `"}`
	req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmployeeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var result model.Employee
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "E001", result.PersonnelNumber)
	assert.Equal(t, "John", result.FirstName)
	assert.Equal(t, "Doe", result.LastName)
	assert.Equal(t, "john@example.com", result.Email)
	assert.True(t, result.IsActive)
}

func TestEmployeeHandler_Create_InvalidBody(t *testing.T) {
	h, _, tenant := setupEmployeeHandler(t)

	req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString("invalid"))
	req = withEmployeeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Create_MissingRequiredFields(t *testing.T) {
	h, _, tenant := setupEmployeeHandler(t)

	body := `{"personnel_number": "E001"}`
	req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmployeeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Create_NoTenant(t *testing.T) {
	h, _, _ := setupEmployeeHandler(t)

	body := `{"personnel_number": "E001", "pin": "1234", "first_name": "John", "last_name": "Doe", "entry_date": "2024-01-01"}`
	req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestEmployeeHandler_Create_DuplicatePersonnelNumber(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	// Create first employee
	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Try to create duplicate
	entryDate := time.Now().Format("2006-01-02")
	body := `{"personnel_number": "E001", "pin": "5678", "first_name": "Jane", "last_name": "Smith", "entry_date": "` + entryDate + `"}`
	req := httptest.NewRequest("POST", "/employees", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmployeeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Create(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Get_Success(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employees/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Employee
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, created.ID, result.ID)
	assert.Equal(t, "E001", result.PersonnelNumber)
}

func TestEmployeeHandler_Get_InvalidID(t *testing.T) {
	h, _, _ := setupEmployeeHandler(t)

	req := httptest.NewRequest("GET", "/employees/invalid", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Get_NotFound(t *testing.T) {
	h, _, _ := setupEmployeeHandler(t)

	req := httptest.NewRequest("GET", "/employees/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Get(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestEmployeeHandler_List_All(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	// Create employees
	for i, name := range []string{"Alice", "Bob"} {
		input := service.CreateEmployeeInput{
			TenantID:        tenant.ID,
			PersonnelNumber: "E00" + string(rune('1'+i)),
			PIN:             "100" + string(rune('1'+i)),
			FirstName:       name,
			LastName:        "Test",
			EntryDate:       time.Now(),
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/employees", nil)
	req = withEmployeeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.EmployeeList
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 2)
	assert.Equal(t, int64(2), result.Total)
}

func TestEmployeeHandler_List_NoTenant(t *testing.T) {
	h, _, _ := setupEmployeeHandler(t)

	req := httptest.NewRequest("GET", "/employees", nil)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestEmployeeHandler_List_WithPagination(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	// Create employees
	for i := 0; i < 5; i++ {
		input := service.CreateEmployeeInput{
			TenantID:        tenant.ID,
			PersonnelNumber: "E" + string(rune('A'+i)),
			PIN:             "100" + string(rune('0'+i)),
			FirstName:       "Employee",
			LastName:        string(rune('A' + i)),
			EntryDate:       time.Now(),
		}
		_, err := svc.Create(ctx, input)
		require.NoError(t, err)
	}

	req := httptest.NewRequest("GET", "/employees?limit=2&offset=0", nil)
	req = withEmployeeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.EmployeeList
	err := json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 2)
	assert.Equal(t, int64(5), result.Total)
}

func TestEmployeeHandler_Update_Success(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	body := `{"last_name": "Smith", "email": "john.smith@example.com"}`
	req := httptest.NewRequest("PUT", "/employees/"+created.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result model.Employee
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Equal(t, "Smith", result.LastName)
	assert.Equal(t, "john.smith@example.com", result.Email)
}

func TestEmployeeHandler_Update_InvalidID(t *testing.T) {
	h, _, _ := setupEmployeeHandler(t)

	body := `{"last_name": "Updated"}`
	req := httptest.NewRequest("PUT", "/employees/invalid", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "invalid")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Update_NotFound(t *testing.T) {
	h, _, _ := setupEmployeeHandler(t)

	body := `{"last_name": "Updated"}`
	req := httptest.NewRequest("PUT", "/employees/00000000-0000-0000-0000-000000000000", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Update(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestEmployeeHandler_Delete_Success(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/employees/"+created.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", created.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deactivated
	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.False(t, found.IsActive)
	assert.NotNil(t, found.ExitDate)
}

func TestEmployeeHandler_Delete_NotFound(t *testing.T) {
	h, _, _ := setupEmployeeHandler(t)

	req := httptest.NewRequest("DELETE", "/employees/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.Delete(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestEmployeeHandler_Search_Success(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Smith",
		EntryDate:       time.Now(),
	}
	_, err := svc.Create(ctx, input)
	require.NoError(t, err)

	req := httptest.NewRequest("GET", "/employees/search?q=smith", nil)
	req = withEmployeeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Search(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result []model.Employee
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result, 1)
	assert.Equal(t, "John", result[0].FirstName)
}

func TestEmployeeHandler_Search_MissingQuery(t *testing.T) {
	h, _, tenant := setupEmployeeHandler(t)

	req := httptest.NewRequest("GET", "/employees/search", nil)
	req = withEmployeeTenantContext(req, tenant)
	rr := httptest.NewRecorder()

	h.Search(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestEmployeeHandler_Contact_AddAndList(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	// Create employee
	empInput := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	emp, err := svc.Create(ctx, empInput)
	require.NoError(t, err)

	// Add contact
	body := `{"contact_type": "email", "value": "john@example.com", "label": "Work", "is_primary": true}`
	req := httptest.NewRequest("POST", "/employees/"+emp.ID.String()+"/contacts", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddContact(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var contact model.EmployeeContact
	err = json.Unmarshal(rr.Body.Bytes(), &contact)
	require.NoError(t, err)
	assert.Equal(t, "email", contact.ContactType)
	assert.Equal(t, "john@example.com", contact.Value)
	assert.Equal(t, "Work", contact.Label)
	assert.True(t, contact.IsPrimary)

	// List contacts
	req = httptest.NewRequest("GET", "/employees/"+emp.ID.String()+"/contacts", nil)
	rctx = chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr = httptest.NewRecorder()

	h.ListContacts(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.EmployeeContactList
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 1)
}

func TestEmployeeHandler_Contact_Remove(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	// Create employee with contact
	empInput := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	emp, err := svc.Create(ctx, empInput)
	require.NoError(t, err)

	contactInput := service.CreateContactInput{
		EmployeeID:  emp.ID,
		ContactType: "email",
		Value:       "john@example.com",
	}
	contact, err := svc.AddContact(ctx, contactInput)
	require.NoError(t, err)

	// Remove contact
	req := httptest.NewRequest("DELETE", "/employees/"+emp.ID.String()+"/contacts/"+contact.ID.String(), nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	rctx.URLParams.Add("contactId", contact.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.RemoveContact(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify removed
	contacts, err := svc.ListContacts(ctx, emp.ID)
	require.NoError(t, err)
	assert.Empty(t, contacts)
}

func TestEmployeeHandler_Card_AddAndList(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	// Create employee
	empInput := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	emp, err := svc.Create(ctx, empInput)
	require.NoError(t, err)

	// Add card
	validFrom := time.Now().Format("2006-01-02")
	body := `{"card_number": "CARD001", "card_type": "rfid", "valid_from": "` + validFrom + `"}`
	req := httptest.NewRequest("POST", "/employees/"+emp.ID.String()+"/cards", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = withEmployeeTenantContext(req, tenant)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.AddCard(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var card model.EmployeeCard
	err = json.Unmarshal(rr.Body.Bytes(), &card)
	require.NoError(t, err)
	assert.Equal(t, "CARD001", card.CardNumber)
	assert.Equal(t, "rfid", card.CardType)
	assert.True(t, card.IsActive)

	// List cards
	req = httptest.NewRequest("GET", "/employees/"+emp.ID.String()+"/cards", nil)
	rctx = chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr = httptest.NewRecorder()

	h.ListCards(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var result handler.EmployeeCardList
	err = json.Unmarshal(rr.Body.Bytes(), &result)
	require.NoError(t, err)
	assert.Len(t, result.Data, 1)
}

func TestEmployeeHandler_Card_Deactivate(t *testing.T) {
	h, svc, tenant := setupEmployeeHandler(t)
	ctx := context.Background()

	// Create employee with card
	empInput := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	emp, err := svc.Create(ctx, empInput)
	require.NoError(t, err)

	cardInput := service.CreateCardInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		CardNumber: "CARD001",
		ValidFrom:  time.Now(),
	}
	card, err := svc.AddCard(ctx, cardInput)
	require.NoError(t, err)

	// Deactivate card
	body := `{"reason": "Lost"}`
	req := httptest.NewRequest("DELETE", "/employees/"+emp.ID.String()+"/cards/"+card.ID.String(), bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", emp.ID.String())
	rctx.URLParams.Add("cardId", card.ID.String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeactivateCard(rr, req)

	assert.Equal(t, http.StatusNoContent, rr.Code)

	// Verify deactivated
	cards, err := svc.ListCards(ctx, emp.ID)
	require.NoError(t, err)
	assert.Len(t, cards, 1)
	assert.False(t, cards[0].IsActive)
	assert.Equal(t, "Lost", cards[0].DeactivationReason)
}

func TestEmployeeHandler_Card_DeactivateNotFound(t *testing.T) {
	h, _, _ := setupEmployeeHandler(t)

	req := httptest.NewRequest("DELETE", "/employees/00000000-0000-0000-0000-000000000000/cards/00000000-0000-0000-0000-000000000000", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", "00000000-0000-0000-0000-000000000000")
	rctx.URLParams.Add("cardId", "00000000-0000-0000-0000-000000000000")
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
	rr := httptest.NewRecorder()

	h.DeactivateCard(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
