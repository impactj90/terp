package repository_test

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
	"github.com/tolga/terp/internal/testutil"
)

// createTestTenantForEmployee creates a tenant for use in employee tests
func createTestTenantForEmployee(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func TestEmployeeRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now().AddDate(0, -1, 0),
		WeeklyHours:     decimal.NewFromFloat(40.0),
		IsActive:        true,
	}

	err := repo.Create(ctx, emp)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, emp.ID)
}

func TestEmployeeRepository_Create_WithAllFields(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:            tenant.ID,
		PersonnelNumber:     "E001",
		PIN:                 "1234",
		FirstName:           "John",
		LastName:            "Doe",
		Email:               "john.doe@example.com",
		Phone:               "+1234567890",
		EntryDate:           time.Now().AddDate(0, -1, 0),
		WeeklyHours:         decimal.NewFromFloat(40.0),
		VacationDaysPerYear: decimal.NewFromFloat(30.0),
		IsActive:            true,
	}

	err := repo.Create(ctx, emp)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, emp.ID)
	require.NoError(t, err)
	assert.Equal(t, "john.doe@example.com", found.Email)
	assert.Equal(t, "+1234567890", found.Phone)
}

func TestEmployeeRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	require.NoError(t, repo.Create(ctx, emp))

	found, err := repo.GetByID(ctx, emp.ID)
	require.NoError(t, err)
	assert.Equal(t, emp.ID, found.ID)
	assert.Equal(t, "E001", found.PersonnelNumber)
	assert.Equal(t, "John", found.FirstName)
	assert.Equal(t, "Doe", found.LastName)
}

func TestEmployeeRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrEmployeeNotFound)
}

func TestEmployeeRepository_GetByPersonnelNumber(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	require.NoError(t, repo.Create(ctx, emp))

	found, err := repo.GetByPersonnelNumber(ctx, tenant.ID, "E001")
	require.NoError(t, err)
	assert.Equal(t, emp.ID, found.ID)
	assert.Equal(t, "E001", found.PersonnelNumber)
}

func TestEmployeeRepository_GetByPersonnelNumber_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByPersonnelNumber(ctx, uuid.New(), "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrEmployeeNotFound)
}

func TestEmployeeRepository_GetByPIN(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	require.NoError(t, repo.Create(ctx, emp))

	found, err := repo.GetByPIN(ctx, tenant.ID, "1234")
	require.NoError(t, err)
	assert.Equal(t, emp.ID, found.ID)
}

func TestEmployeeRepository_GetByPIN_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByPIN(ctx, uuid.New(), "9999")
	assert.ErrorIs(t, err, repository.ErrEmployeeNotFound)
}

func TestEmployeeRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	require.NoError(t, repo.Create(ctx, emp))

	emp.LastName = "Smith"
	err := repo.Update(ctx, emp)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, emp.ID)
	require.NoError(t, err)
	assert.Equal(t, "Smith", found.LastName)
}

func TestEmployeeRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	require.NoError(t, repo.Create(ctx, emp))

	err := repo.Delete(ctx, emp.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, emp.ID)
	assert.ErrorIs(t, err, repository.ErrEmployeeNotFound)
}

func TestEmployeeRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrEmployeeNotFound)
}

func TestEmployeeRepository_List(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	for i, name := range []string{"Alice", "Bob", "Charlie"} {
		emp := &model.Employee{
			TenantID:        tenant.ID,
			PersonnelNumber: "E00" + string(rune('1'+i)),
			PIN:             "100" + string(rune('1'+i)),
			FirstName:       name,
			LastName:        "Test",
			EntryDate:       time.Now(),
			IsActive:        true,
		}
		require.NoError(t, repo.Create(ctx, emp))
	}

	filter := repository.EmployeeFilter{
		TenantID: tenant.ID,
		Limit:    10,
	}
	employees, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Len(t, employees, 3)
}

func TestEmployeeRepository_List_WithPagination(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	for i := range 5 {
		emp := &model.Employee{
			TenantID:        tenant.ID,
			PersonnelNumber: "E" + string(rune('A'+i)),
			PIN:             "100" + string(rune('0'+i)),
			FirstName:       "Employee",
			LastName:        string(rune('A' + i)),
			EntryDate:       time.Now(),
			IsActive:        true,
		}
		require.NoError(t, repo.Create(ctx, emp))
	}

	filter := repository.EmployeeFilter{
		TenantID: tenant.ID,
		Limit:    2,
		Offset:   0,
	}
	employees, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, employees, 2)

	// Second page
	filter.Offset = 2
	employees, total, err = repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(5), total)
	assert.Len(t, employees, 2)
}

func TestEmployeeRepository_List_FilterByActive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)

	// Create active employee
	active := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1001",
		FirstName:       "Active",
		LastName:        "User",
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(ctx, active))

	// Create inactive employee
	inactive := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E002",
		PIN:             "1002",
		FirstName:       "Inactive",
		LastName:        "User",
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(ctx, inactive))

	// Deactivate via update
	inactive.IsActive = false
	require.NoError(t, repo.Update(ctx, inactive))

	isActive := true
	filter := repository.EmployeeFilter{
		TenantID: tenant.ID,
		IsActive: &isActive,
		Limit:    10,
	}
	employees, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Len(t, employees, 1)
	assert.Equal(t, "Active", employees[0].FirstName)
}

func TestEmployeeRepository_List_Search(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp1 := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1001",
		FirstName:       "John",
		LastName:        "Smith",
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	emp2 := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E002",
		PIN:             "1002",
		FirstName:       "Jane",
		LastName:        "Doe",
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(ctx, emp1))
	require.NoError(t, repo.Create(ctx, emp2))

	filter := repository.EmployeeFilter{
		TenantID:    tenant.ID,
		SearchQuery: "john",
		Limit:       10,
	}
	employees, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Len(t, employees, 1)
	assert.Equal(t, "John", employees[0].FirstName)
}

func TestEmployeeRepository_List_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)

	filter := repository.EmployeeFilter{
		TenantID: tenant.ID,
		Limit:    10,
	}
	employees, total, err := repo.List(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
	assert.Empty(t, employees)
}

func TestEmployeeRepository_Search(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp1 := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1001",
		FirstName:       "John",
		LastName:        "Smith",
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	emp2 := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E002",
		PIN:             "1002",
		FirstName:       "Jane",
		LastName:        "Doe",
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(ctx, emp1))
	require.NoError(t, repo.Create(ctx, emp2))

	employees, err := repo.Search(ctx, tenant.ID, "smith", 10)
	require.NoError(t, err)
	assert.Len(t, employees, 1)
	assert.Equal(t, "John", employees[0].FirstName)
}

func TestEmployeeRepository_Search_ByPersonnelNumber(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "EMP-ABC-123",
		PIN:             "1001",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(ctx, emp))

	employees, err := repo.Search(ctx, tenant.ID, "ABC", 10)
	require.NoError(t, err)
	assert.Len(t, employees, 1)
}

func TestEmployeeRepository_Contact_CRUD(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	require.NoError(t, repo.Create(ctx, emp))

	// Create contact
	contact := &model.EmployeeContact{
		EmployeeID:  emp.ID,
		ContactType: "email",
		Value:       "john@example.com",
		IsPrimary:   true,
	}
	err := repo.CreateContact(ctx, contact)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, contact.ID)

	// Get contact
	found, err := repo.GetContactByID(ctx, contact.ID)
	require.NoError(t, err)
	assert.Equal(t, "email", found.ContactType)
	assert.Equal(t, "john@example.com", found.Value)

	// List contacts
	contacts, err := repo.ListContacts(ctx, emp.ID)
	require.NoError(t, err)
	assert.Len(t, contacts, 1)

	// Delete contact
	err = repo.DeleteContact(ctx, contact.ID)
	require.NoError(t, err)

	_, err = repo.GetContactByID(ctx, contact.ID)
	assert.ErrorIs(t, err, repository.ErrContactNotFound)
}

func TestEmployeeRepository_Card_CRUD(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	require.NoError(t, repo.Create(ctx, emp))

	// Create card
	card := &model.EmployeeCard{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		CardNumber: "CARD001",
		CardType:   "rfid",
		ValidFrom:  time.Now(),
		IsActive:   true,
	}
	err := repo.CreateCard(ctx, card)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, card.ID)

	// Get card by ID
	found, err := repo.GetCardByID(ctx, card.ID)
	require.NoError(t, err)
	assert.Equal(t, "CARD001", found.CardNumber)

	// Get card by number
	found, err = repo.GetCardByNumber(ctx, tenant.ID, "CARD001")
	require.NoError(t, err)
	assert.Equal(t, card.ID, found.ID)

	// Update card
	card.IsActive = false
	err = repo.UpdateCard(ctx, card)
	require.NoError(t, err)

	found, err = repo.GetCardByID(ctx, card.ID)
	require.NoError(t, err)
	assert.False(t, found.IsActive)

	// List cards
	cards, err := repo.ListCards(ctx, emp.ID)
	require.NoError(t, err)
	assert.Len(t, cards, 1)
}

func TestEmployeeRepository_GetByCardNumber(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(ctx, emp))

	// Create active card
	card := &model.EmployeeCard{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		CardNumber: "CARD001",
		CardType:   "rfid",
		ValidFrom:  time.Now(),
		IsActive:   true,
	}
	require.NoError(t, repo.CreateCard(ctx, card))

	// Find employee by card number
	found, err := repo.GetByCardNumber(ctx, tenant.ID, "CARD001")
	require.NoError(t, err)
	assert.Equal(t, emp.ID, found.ID)
}

func TestEmployeeRepository_GetByCardNumber_InactiveCard(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForEmployee(t, db)
	emp := &model.Employee{
		TenantID:        tenant.ID,
		PersonnelNumber: "E001",
		PIN:             "1234",
		FirstName:       "John",
		LastName:        "Doe",
		EntryDate:       time.Now(),
	}
	require.NoError(t, repo.Create(ctx, emp))

	// Create active card first
	card := &model.EmployeeCard{
		TenantID:   tenant.ID,
		EmployeeID: emp.ID,
		CardNumber: "CARD001",
		CardType:   "rfid",
		ValidFrom:  time.Now(),
		IsActive:   true,
	}
	require.NoError(t, repo.CreateCard(ctx, card))

	// Deactivate the card via update
	card.IsActive = false
	require.NoError(t, repo.UpdateCard(ctx, card))

	// Should not find employee with inactive card
	_, err := repo.GetByCardNumber(ctx, tenant.ID, "CARD001")
	assert.ErrorIs(t, err, repository.ErrEmployeeNotFound)
}

func TestEmployeeRepository_GetByCardNumber_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByCardNumber(ctx, uuid.New(), "NONEXISTENT")
	assert.ErrorIs(t, err, repository.ErrEmployeeNotFound)
}
