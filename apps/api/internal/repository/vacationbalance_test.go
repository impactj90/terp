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

func createTestTenantForVB(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestEmployeeForVB(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	repo := repository.NewEmployeeRepository(db)
	emp := &model.Employee{
		TenantID:        tenantID,
		PersonnelNumber: "E" + uuid.New().String()[:8],
		PIN:             uuid.New().String()[:4],
		FirstName:       "Test",
		LastName:        "Employee",
		EntryDate:       time.Now(),
		WeeklyHours:     decimal.NewFromFloat(40.0),
		IsActive:        true,
	}
	require.NoError(t, repo.Create(context.Background(), emp))
	return emp
}

func TestVacationBalanceRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromFloat(5.5),
		Adjustments: decimal.NewFromInt(2),
		Taken:       decimal.NewFromInt(10),
	}

	err := repo.Create(ctx, vb)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, vb.ID)
}

func TestVacationBalanceRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromFloat(3.5),
		Adjustments: decimal.NewFromInt(0),
		Taken:       decimal.NewFromFloat(7.5),
	}
	require.NoError(t, repo.Create(ctx, vb))

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.Equal(t, vb.ID, found.ID)
	assert.Equal(t, 2026, found.Year)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(30)))
	assert.True(t, found.Carryover.Equal(decimal.NewFromFloat(3.5)))
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(7.5)))
}

func TestVacationBalanceRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrVacationBalanceNotFound)
}

func TestVacationBalanceRepository_GetByEmployeeYear(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(28),
	}
	require.NoError(t, repo.Create(ctx, vb))

	found, err := repo.GetByEmployeeYear(ctx, emp.ID, 2026)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, vb.ID, found.ID)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(28)))
}

func TestVacationBalanceRepository_GetByEmployeeYear_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	found, err := repo.GetByEmployeeYear(ctx, emp.ID, 2025)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestVacationBalanceRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(0),
		Adjustments: decimal.NewFromInt(0),
		Taken:       decimal.NewFromInt(0),
	}
	require.NoError(t, repo.Create(ctx, vb))

	vb.Entitlement = decimal.NewFromInt(25)
	vb.Carryover = decimal.NewFromFloat(4.5)
	vb.Adjustments = decimal.NewFromInt(-2)
	err := repo.Update(ctx, vb)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(25)))
	assert.True(t, found.Carryover.Equal(decimal.NewFromFloat(4.5)))
	assert.True(t, found.Adjustments.Equal(decimal.NewFromInt(-2)))
}

func TestVacationBalanceRepository_Upsert_Insert(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromFloat(5.0),
		Adjustments: decimal.NewFromInt(0),
		Taken:       decimal.NewFromInt(0),
	}

	err := repo.Upsert(ctx, vb)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, vb.ID)

	found, err := repo.GetByEmployeeYear(ctx, emp.ID, 2026)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(30)))
	assert.True(t, found.Carryover.Equal(decimal.NewFromFloat(5.0)))
}

func TestVacationBalanceRepository_Upsert_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Carryover:   decimal.NewFromInt(0),
		Adjustments: decimal.NewFromInt(0),
		Taken:       decimal.NewFromInt(5),
	}
	require.NoError(t, repo.Create(ctx, vb))
	originalID := vb.ID

	updated := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(28),
		Carryover:   decimal.NewFromFloat(3.5),
		Adjustments: decimal.NewFromInt(1),
		Taken:       decimal.NewFromFloat(10.5),
	}
	err := repo.Upsert(ctx, updated)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, originalID)
	require.NoError(t, err)
	assert.True(t, found.Entitlement.Equal(decimal.NewFromInt(28)))
	assert.True(t, found.Carryover.Equal(decimal.NewFromFloat(3.5)))
	assert.True(t, found.Adjustments.Equal(decimal.NewFromInt(1)))
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(10.5)))
}

func TestVacationBalanceRepository_UpdateTaken(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(5),
	}
	require.NoError(t, repo.Create(ctx, vb))

	err := repo.UpdateTaken(ctx, emp.ID, 2026, decimal.NewFromFloat(12.5))
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(12.5)))
}

func TestVacationBalanceRepository_UpdateTaken_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	err := repo.UpdateTaken(ctx, uuid.New(), 2026, decimal.NewFromInt(5))
	assert.ErrorIs(t, err, repository.ErrVacationBalanceNotFound)
}

func TestVacationBalanceRepository_IncrementTaken(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(5),
	}
	require.NoError(t, repo.Create(ctx, vb))

	err := repo.IncrementTaken(ctx, emp.ID, 2026, decimal.NewFromFloat(1.5))
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(6.5)))
}

func TestVacationBalanceRepository_IncrementTaken_Multiple(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
		Taken:       decimal.NewFromInt(0),
	}
	require.NoError(t, repo.Create(ctx, vb))

	require.NoError(t, repo.IncrementTaken(ctx, emp.ID, 2026, decimal.NewFromInt(1)))
	require.NoError(t, repo.IncrementTaken(ctx, emp.ID, 2026, decimal.NewFromFloat(0.5)))
	require.NoError(t, repo.IncrementTaken(ctx, emp.ID, 2026, decimal.NewFromInt(2)))

	found, err := repo.GetByID(ctx, vb.ID)
	require.NoError(t, err)
	assert.True(t, found.Taken.Equal(decimal.NewFromFloat(3.5)))
}

func TestVacationBalanceRepository_IncrementTaken_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	err := repo.IncrementTaken(ctx, uuid.New(), 2026, decimal.NewFromInt(1))
	assert.ErrorIs(t, err, repository.ErrVacationBalanceNotFound)
}

func TestVacationBalanceRepository_ListByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	years := []int{2027, 2025, 2026}
	for _, year := range years {
		vb := &model.VacationBalance{
			TenantID:    tenant.ID,
			EmployeeID:  emp.ID,
			Year:        year,
			Entitlement: decimal.NewFromInt(30),
		}
		require.NoError(t, repo.Create(ctx, vb))
	}

	balances, err := repo.ListByEmployee(ctx, emp.ID)
	require.NoError(t, err)
	require.Len(t, balances, 3)

	assert.Equal(t, 2025, balances[0].Year)
	assert.Equal(t, 2026, balances[1].Year)
	assert.Equal(t, 2027, balances[2].Year)
}

func TestVacationBalanceRepository_ListByEmployee_Empty(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	balances, err := repo.ListByEmployee(ctx, emp.ID)
	require.NoError(t, err)
	assert.Empty(t, balances)
}

func TestVacationBalanceRepository_UniqueConstraint(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewVacationBalanceRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForVB(t, db)
	emp := createTestEmployeeForVB(t, db, tenant.ID)

	vb1 := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(30),
	}
	require.NoError(t, repo.Create(ctx, vb1))

	vb2 := &model.VacationBalance{
		TenantID:    tenant.ID,
		EmployeeID:  emp.ID,
		Year:        2026,
		Entitlement: decimal.NewFromInt(25),
	}
	err := repo.Create(ctx, vb2)
	assert.Error(t, err)
}

func TestVacationBalance_Total(t *testing.T) {
	tests := []struct {
		name        string
		entitlement decimal.Decimal
		carryover   decimal.Decimal
		adjustments decimal.Decimal
		expected    decimal.Decimal
	}{
		{
			"all zeros",
			decimal.Zero, decimal.Zero, decimal.Zero,
			decimal.Zero,
		},
		{
			"entitlement only",
			decimal.NewFromInt(30), decimal.Zero, decimal.Zero,
			decimal.NewFromInt(30),
		},
		{
			"all positive",
			decimal.NewFromInt(30), decimal.NewFromFloat(5.5), decimal.NewFromInt(2),
			decimal.NewFromFloat(37.5),
		},
		{
			"negative adjustment",
			decimal.NewFromInt(30), decimal.NewFromFloat(3.0), decimal.NewFromInt(-5),
			decimal.NewFromInt(28),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vb := &model.VacationBalance{
				Entitlement: tt.entitlement,
				Carryover:   tt.carryover,
				Adjustments: tt.adjustments,
			}
			assert.True(t, vb.Total().Equal(tt.expected),
				"expected %s, got %s", tt.expected.String(), vb.Total().String())
		})
	}
}

func TestVacationBalance_Available(t *testing.T) {
	tests := []struct {
		name        string
		entitlement decimal.Decimal
		carryover   decimal.Decimal
		adjustments decimal.Decimal
		taken       decimal.Decimal
		expected    decimal.Decimal
	}{
		{
			"nothing taken",
			decimal.NewFromInt(30), decimal.NewFromFloat(5.0), decimal.NewFromInt(0),
			decimal.Zero,
			decimal.NewFromInt(35),
		},
		{
			"some taken",
			decimal.NewFromInt(30), decimal.NewFromFloat(5.0), decimal.NewFromInt(0),
			decimal.NewFromFloat(10.5),
			decimal.NewFromFloat(24.5),
		},
		{
			"all taken",
			decimal.NewFromInt(30), decimal.NewFromInt(0), decimal.NewFromInt(0),
			decimal.NewFromInt(30),
			decimal.Zero,
		},
		{
			"overdrawn (negative available)",
			decimal.NewFromInt(30), decimal.NewFromInt(0), decimal.NewFromInt(0),
			decimal.NewFromInt(32),
			decimal.NewFromInt(-2),
		},
		{
			"with negative adjustment",
			decimal.NewFromInt(30), decimal.NewFromFloat(5.0), decimal.NewFromInt(-3),
			decimal.NewFromFloat(10.0),
			decimal.NewFromInt(22),
		},
		{
			"half days",
			decimal.NewFromInt(30), decimal.NewFromInt(0), decimal.NewFromInt(0),
			decimal.NewFromFloat(0.5),
			decimal.NewFromFloat(29.5),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vb := &model.VacationBalance{
				Entitlement: tt.entitlement,
				Carryover:   tt.carryover,
				Adjustments: tt.adjustments,
				Taken:       tt.taken,
			}
			assert.True(t, vb.Available().Equal(tt.expected),
				"expected %s, got %s", tt.expected.String(), vb.Available().String())
		})
	}
}
