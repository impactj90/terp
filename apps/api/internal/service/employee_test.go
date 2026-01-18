package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForEmployeeService(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name:     "Test Tenant " + uuid.New().String()[:8],
		Slug:     "test-" + uuid.New().String()[:8],
		IsActive: true,
	}
	err := tenantRepo.Create(context.Background(), tenant)
	require.NoError(t, err)
	return tenant
}

func TestEmployeeService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		Email:           "john.doe@example.com",
		EntryDate:       time.Now().AddDate(0, -1, 0),
		WeeklyHours:     40.0,
	}

	emp, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "E001", emp.PersonnelNumber)
	assert.Equal(t, "John", emp.FirstName)
	assert.Equal(t, "Doe", emp.LastName)
	assert.Equal(t, "john.doe@example.com", emp.Email)
	assert.Equal(t, tenant.ID, emp.TenantID)
	assert.True(t, emp.IsActive)
}

func TestEmployeeService_Create_WithAllFields(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:            tenant.ID,
		PersonnelNumber:     "E001",
		PIN:                 "1234",
		FirstName:           "John",
		LastName:            "Doe",
		Email:               "john.doe@example.com",
		Phone:               "+1234567890",
		EntryDate:           time.Now().AddDate(0, -1, 0),
		WeeklyHours:         38.5,
		VacationDaysPerYear: 25.0,
	}

	emp, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "john.doe@example.com", emp.Email)
	assert.Equal(t, "+1234567890", emp.Phone)
	assert.True(t, emp.WeeklyHours.Equal(decimal.NewFromFloat(38.5)))
	assert.True(t, emp.VacationDaysPerYear.Equal(decimal.NewFromFloat(25.0)))
}

func TestEmployeeService_Create_EmptyPersonnelNumber(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:  tenant.ID,
		PIN:       "1234",
		FirstName: "John",
		LastName:  "Doe",
		EntryDate: time.Now(),
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrPersonnelNumberRequired)
}

func TestEmployeeService_Create_EmptyPIN(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrPINRequired)
}

func TestEmployeeService_Create_EmptyFirstName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrFirstNameRequired)
}

func TestEmployeeService_Create_EmptyLastName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		EntryDate:       time.Now(),
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrLastNameRequired)
}

func TestEmployeeService_Create_DuplicatePersonnelNumber(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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

	input2 := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "5678",
		FirstName:       "Jane",
		LastName:        "Smith",
		EntryDate:       time.Now(),
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrPersonnelNumberExists)
}

func TestEmployeeService_Create_DuplicatePIN(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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

	input2 := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E002",
		PIN:             "1234",
		FirstName:       "Jane",
		LastName:        "Smith",
		EntryDate:       time.Now(),
	}
	_, err = svc.Create(ctx, input2)
	assert.ErrorIs(t, err, service.ErrPINExists)
}

func TestEmployeeService_Create_InvalidEntryDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now().AddDate(1, 0, 0), // 1 year in future
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrInvalidEntryDate)
}

func TestEmployeeService_Create_TrimsWhitespace(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "  E001  ",
		PIN:             "  1234  ",
		FirstName:       "  John  ",
		LastName:        "  Doe  ",
		Email:           "  john@example.com  ",
		EntryDate:       time.Now(),
	}

	emp, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "E001", emp.PersonnelNumber)
	assert.Equal(t, "1234", emp.PIN)
	assert.Equal(t, "John", emp.FirstName)
	assert.Equal(t, "Doe", emp.LastName)
	assert.Equal(t, "john@example.com", emp.Email)
}

func TestEmployeeService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, created.ID, found.ID)
	assert.Equal(t, "E001", found.PersonnelNumber)
}

func TestEmployeeService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrEmployeeNotFound)
}

func TestEmployeeService_Update_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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

	newLastName := "Smith"
	newEmail := "john.smith@example.com"
	updateInput := service.UpdateEmployeeInput{
		LastName: &newLastName,
		Email:    &newEmail,
	}

	updated, err := svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)
	assert.Equal(t, "Smith", updated.LastName)
	assert.Equal(t, "john.smith@example.com", updated.Email)
}

func TestEmployeeService_Update_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	newName := "Updated"
	updateInput := service.UpdateEmployeeInput{
		FirstName: &newName,
	}

	_, err := svc.Update(ctx, uuid.New(), updateInput)
	assert.ErrorIs(t, err, service.ErrEmployeeNotFound)
}

func TestEmployeeService_Update_EmptyFirstName(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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

	emptyName := "   "
	updateInput := service.UpdateEmployeeInput{
		FirstName: &emptyName,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrFirstNameRequired)
}

func TestEmployeeService_Update_ExitBeforeEntry(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	entryDate := time.Date(2023, 1, 1, 0, 0, 0, 0, time.UTC)
	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       entryDate,
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	exitDate := time.Date(2022, 12, 31, 0, 0, 0, 0, time.UTC) // Before entry
	updateInput := service.UpdateEmployeeInput{
		ExitDate: &exitDate,
	}

	_, err = svc.Update(ctx, created.ID, updateInput)
	assert.ErrorIs(t, err, service.ErrExitBeforeEntry)
}

func TestEmployeeService_Deactivate_SetsExitDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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
	require.Nil(t, created.ExitDate)

	err = svc.Deactivate(ctx, created.ID)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.False(t, found.IsActive)
	assert.NotNil(t, found.ExitDate)
}

func TestEmployeeService_Deactivate_PreservesExitDate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	input := service.CreateEmployeeInput{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now().AddDate(-1, 0, 0),
	}
	created, err := svc.Create(ctx, input)
	require.NoError(t, err)

	// Set exit date first
	exitDate := time.Date(2024, 12, 31, 0, 0, 0, 0, time.UTC)
	updateInput := service.UpdateEmployeeInput{
		ExitDate: &exitDate,
	}
	_, err = svc.Update(ctx, created.ID, updateInput)
	require.NoError(t, err)

	err = svc.Deactivate(ctx, created.ID)
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.False(t, found.IsActive)
	// Should preserve the original exit date
	assert.Equal(t, exitDate.Year(), found.ExitDate.Year())
	assert.Equal(t, exitDate.Month(), found.ExitDate.Month())
	assert.Equal(t, exitDate.Day(), found.ExitDate.Day())
}

func TestEmployeeService_Deactivate_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	err := svc.Deactivate(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrEmployeeNotFound)
}

func TestEmployeeService_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	for i, name := range []string{"Alice", "Bob", "Charlie"} {
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

	filter := repository.EmployeeFilter{
		TenantID: tenant.ID,
		Limit:    10,
	}
	employees, total, err := svc.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Len(t, employees, 3)
}

func TestEmployeeService_Search(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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

	employees, err := svc.Search(ctx, tenant.ID, "smith")
	require.NoError(t, err)
	assert.Len(t, employees, 1)
	assert.Equal(t, "John", employees[0].FirstName)
}

func TestEmployeeService_Contact_AddAndRemove(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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
	contactInput := service.CreateContactInput{
		EmployeeID:  emp.ID,
		ContactType: "email",
		Value:       "john@example.com",
		Label:       "Work",
		IsPrimary:   true,
	}
	contact, err := svc.AddContact(ctx, contactInput)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, contact.ID)
	assert.Equal(t, "email", contact.ContactType)
	assert.Equal(t, "john@example.com", contact.Value)
	assert.Equal(t, "Work", contact.Label)
	assert.True(t, contact.IsPrimary)

	// List contacts
	contacts, err := svc.ListContacts(ctx, emp.ID)
	require.NoError(t, err)
	assert.Len(t, contacts, 1)

	// Remove contact
	err = svc.RemoveContact(ctx, contact.ID)
	require.NoError(t, err)

	contacts, err = svc.ListContacts(ctx, emp.ID)
	require.NoError(t, err)
	assert.Empty(t, contacts)
}

func TestEmployeeService_AddContact_EmployeeNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	contactInput := service.CreateContactInput{
		EmployeeID:  uuid.New(),
		ContactType: "email",
		Value:       "test@example.com",
	}
	_, err := svc.AddContact(ctx, contactInput)
	assert.ErrorIs(t, err, service.ErrEmployeeNotFound)
}

func TestEmployeeService_AddContact_EmptyType(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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
		EmployeeID: emp.ID,
		Value:      "test@example.com",
	}
	_, err = svc.AddContact(ctx, contactInput)
	assert.ErrorIs(t, err, service.ErrContactTypeRequired)
}

func TestEmployeeService_AddContact_EmptyValue(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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
	}
	_, err = svc.AddContact(ctx, contactInput)
	assert.ErrorIs(t, err, service.ErrContactValueRequired)
}

func TestEmployeeService_RemoveContact_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	err := svc.RemoveContact(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrContactNotFound)
}

func TestEmployeeService_Card_AddAndDeactivate(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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
	cardInput := service.CreateCardInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		CardNumber: "CARD001",
		CardType:   "rfid",
		ValidFrom:  time.Now(),
	}
	card, err := svc.AddCard(ctx, cardInput)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, card.ID)
	assert.Equal(t, "CARD001", card.CardNumber)
	assert.Equal(t, "rfid", card.CardType)
	assert.True(t, card.IsActive)

	// List cards
	cards, err := svc.ListCards(ctx, emp.ID)
	require.NoError(t, err)
	assert.Len(t, cards, 1)

	// Deactivate card
	err = svc.DeactivateCard(ctx, card.ID, "Lost")
	require.NoError(t, err)

	cards, err = svc.ListCards(ctx, emp.ID)
	require.NoError(t, err)
	assert.Len(t, cards, 1)
	assert.False(t, cards[0].IsActive)
	assert.NotNil(t, cards[0].DeactivatedAt)
	assert.Equal(t, "Lost", cards[0].DeactivationReason)
}

func TestEmployeeService_AddCard_EmployeeNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

	cardInput := service.CreateCardInput{
		TenantID:   tenant.ID,
		EmployeeID: uuid.New(),
		CardNumber: "CARD001",
		ValidFrom:  time.Now(),
	}
	_, err := svc.AddCard(ctx, cardInput)
	assert.ErrorIs(t, err, service.ErrEmployeeNotFound)
}

func TestEmployeeService_AddCard_EmptyCardNumber(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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
		ValidFrom:  time.Now(),
	}
	_, err = svc.AddCard(ctx, cardInput)
	assert.ErrorIs(t, err, service.ErrCardNumberRequired)
}

func TestEmployeeService_AddCard_DuplicateCardNumber(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	tenant := createTestTenantForEmployeeService(t, db)

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
	_, err = svc.AddCard(ctx, cardInput)
	require.NoError(t, err)

	// Try to add duplicate card number
	cardInput2 := service.CreateCardInput{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		CardNumber: "CARD001",
		ValidFrom:  time.Now(),
	}
	_, err = svc.AddCard(ctx, cardInput2)
	assert.ErrorIs(t, err, service.ErrCardNumberExists)
}

func TestEmployeeService_DeactivateCard_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	err := svc.DeactivateCard(ctx, uuid.New(), "Lost")
	assert.ErrorIs(t, err, service.ErrCardNotFound)
}

func TestEmployeeService_ListCards_EmployeeNotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	svc := service.NewEmployeeService(repo)
	ctx := context.Background()

	_, err := svc.ListCards(ctx, uuid.New())
	assert.ErrorIs(t, err, service.ErrEmployeeNotFound)
}
