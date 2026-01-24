package repository_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/testutil"
)

func createTestTenantForAbsenceType(t *testing.T, db *repository.DB) *model.Tenant {
	t.Helper()
	tenantRepo := repository.NewTenantRepository(db)
	tenant := &model.Tenant{
		Name: "Test Tenant " + uuid.New().String()[:8],
		Slug: "test-" + uuid.New().String()[:8],
	}
	require.NoError(t, tenantRepo.Create(context.Background(), tenant))
	return tenant
}

func createTestAbsenceType(t *testing.T, db *repository.DB, tenantID *uuid.UUID, code string, category model.AbsenceCategory) *model.AbsenceType {
	t.Helper()
	repo := repository.NewAbsenceTypeRepository(db)
	at := &model.AbsenceType{
		TenantID: tenantID,
		Code:     code,
		Name:     "Test " + code,
		Category: category,
		Portion:  model.AbsencePortionFull,
		IsActive: true,
	}
	require.NoError(t, repo.Create(context.Background(), at))
	return at
}

func TestAbsenceTypeRepository_Create(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	at := &model.AbsenceType{
		TenantID:        &tenant.ID,
		Code:            "U" + uuid.New().String()[:4],
		Name:            "Urlaub",
		Category:        model.AbsenceCategoryVacation,
		Portion:         model.AbsencePortionFull,
		DeductsVacation: true,
		IsActive:        true,
	}

	err := repo.Create(ctx, at)
	require.NoError(t, err)
	assert.NotEqual(t, uuid.Nil, at.ID)
}

func TestAbsenceTypeRepository_GetByID(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	at := createTestAbsenceType(t, db, &tenant.ID, "K"+uuid.New().String()[:4], model.AbsenceCategoryIllness)

	found, err := repo.GetByID(ctx, at.ID)
	require.NoError(t, err)
	assert.Equal(t, at.ID, found.ID)
	assert.Equal(t, at.Code, found.Code)
	assert.Equal(t, model.AbsenceCategoryIllness, found.Category)
}

func TestAbsenceTypeRepository_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	_, err := repo.GetByID(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAbsenceTypeNotFound)
}

func TestAbsenceTypeRepository_GetByCode(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code := "S" + uuid.New().String()[:4]
	at := createTestAbsenceType(t, db, &tenant.ID, code, model.AbsenceCategorySpecial)

	found, err := repo.GetByCode(ctx, tenant.ID, code)
	require.NoError(t, err)
	assert.Equal(t, at.ID, found.ID)
}

func TestAbsenceTypeRepository_GetByCode_PrefersTenantSpecific(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code := "X" + uuid.New().String()[:4]

	// Create system type (tenant_id = NULL)
	systemType := &model.AbsenceType{
		TenantID: nil,
		Code:     code,
		Name:     "System Type",
		Category: model.AbsenceCategoryIllness,
		Portion:  model.AbsencePortionFull,
		IsSystem: true,
		IsActive: true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	// Create tenant-specific type with same code
	tenantType := &model.AbsenceType{
		TenantID: &tenant.ID,
		Code:     code,
		Name:     "Tenant Type",
		Category: model.AbsenceCategoryIllness,
		Portion:  model.AbsencePortionFull,
		IsActive: true,
	}
	require.NoError(t, repo.Create(ctx, tenantType))

	found, err := repo.GetByCode(ctx, tenant.ID, code)
	require.NoError(t, err)
	assert.Equal(t, "Tenant Type", found.Name)
}

func TestAbsenceTypeRepository_GetByCode_FallsBackToSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code := "Y" + uuid.New().String()[:4]

	// Create system type only
	systemType := &model.AbsenceType{
		TenantID: nil,
		Code:     code,
		Name:     "System Only",
		Category: model.AbsenceCategorySpecial,
		Portion:  model.AbsencePortionFull,
		IsSystem: true,
		IsActive: true,
	}
	require.NoError(t, repo.Create(ctx, systemType))

	found, err := repo.GetByCode(ctx, tenant.ID, code)
	require.NoError(t, err)
	assert.Equal(t, "System Only", found.Name)
}

func TestAbsenceTypeRepository_GetByCode_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)

	_, err := repo.GetByCode(ctx, tenant.ID, "NONEXIST")
	assert.ErrorIs(t, err, repository.ErrAbsenceTypeNotFound)
}

func TestAbsenceTypeRepository_Update(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	at := createTestAbsenceType(t, db, &tenant.ID, "U"+uuid.New().String()[:4], model.AbsenceCategoryVacation)

	at.Name = "Updated Name"
	at.Portion = model.AbsencePortionHalf
	err := repo.Update(ctx, at)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, at.ID)
	require.NoError(t, err)
	assert.Equal(t, "Updated Name", found.Name)
	assert.Equal(t, model.AbsencePortionHalf, found.Portion)
}

func TestAbsenceTypeRepository_Delete(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	at := createTestAbsenceType(t, db, &tenant.ID, "K"+uuid.New().String()[:4], model.AbsenceCategoryIllness)

	err := repo.Delete(ctx, at.ID)
	require.NoError(t, err)

	_, err = repo.GetByID(ctx, at.ID)
	assert.ErrorIs(t, err, repository.ErrAbsenceTypeNotFound)
}

func TestAbsenceTypeRepository_Delete_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	err := repo.Delete(ctx, uuid.New())
	assert.ErrorIs(t, err, repository.ErrAbsenceTypeNotFound)
}

func TestAbsenceTypeRepository_List_IncludesSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code1 := "A" + uuid.New().String()[:4]
	code2 := "B" + uuid.New().String()[:4]

	// Create system type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: nil, Code: code1, Name: "System", Category: model.AbsenceCategoryIllness,
		Portion: model.AbsencePortionFull, IsSystem: true, IsActive: true,
	}))

	// Create tenant type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenant.ID, Code: code2, Name: "Tenant", Category: model.AbsenceCategoryVacation,
		Portion: model.AbsencePortionFull, IsActive: true,
	}))

	types, err := repo.List(ctx, tenant.ID, true)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(types), 2)

	// Verify both system and tenant types are present
	var foundSystem, foundTenant bool
	for _, at := range types {
		if at.Code == code1 {
			foundSystem = true
		}
		if at.Code == code2 {
			foundTenant = true
		}
	}
	assert.True(t, foundSystem, "should include system type")
	assert.True(t, foundTenant, "should include tenant type")
}

func TestAbsenceTypeRepository_List_ExcludesSystem(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)
	code1 := "C" + uuid.New().String()[:4]
	code2 := "D" + uuid.New().String()[:4]

	// Create system type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: nil, Code: code1, Name: "System", Category: model.AbsenceCategoryIllness,
		Portion: model.AbsencePortionFull, IsSystem: true, IsActive: true,
	}))

	// Create tenant type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenant.ID, Code: code2, Name: "Tenant", Category: model.AbsenceCategoryVacation,
		Portion: model.AbsencePortionFull, IsActive: true,
	}))

	types, err := repo.List(ctx, tenant.ID, false)
	require.NoError(t, err)

	for _, at := range types {
		assert.NotNil(t, at.TenantID, "should not include system types")
	}
}

func TestAbsenceTypeRepository_List_ExcludesInactive(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)

	// Create active type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenant.ID, Code: "E" + uuid.New().String()[:4], Name: "Active",
		Category: model.AbsenceCategoryVacation, Portion: model.AbsencePortionFull, IsActive: true,
	}))

	// Create inactive type
	require.NoError(t, repo.Create(ctx, &model.AbsenceType{
		TenantID: &tenant.ID, Code: "F" + uuid.New().String()[:4], Name: "Inactive",
		Category: model.AbsenceCategoryVacation, Portion: model.AbsencePortionFull, IsActive: false,
	}))

	types, err := repo.List(ctx, tenant.ID, false)
	require.NoError(t, err)

	for _, at := range types {
		assert.True(t, at.IsActive, "should not include inactive types")
	}
}

func TestAbsenceTypeRepository_ListByCategory(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewAbsenceTypeRepository(db)
	ctx := context.Background()

	tenant := createTestTenantForAbsenceType(t, db)

	createTestAbsenceType(t, db, &tenant.ID, "U"+uuid.New().String()[:4], model.AbsenceCategoryVacation)
	createTestAbsenceType(t, db, &tenant.ID, "U"+uuid.New().String()[:4], model.AbsenceCategoryVacation)
	createTestAbsenceType(t, db, &tenant.ID, "K"+uuid.New().String()[:4], model.AbsenceCategoryIllness)

	types, err := repo.ListByCategory(ctx, tenant.ID, model.AbsenceCategoryVacation)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(types), 2)
	for _, at := range types {
		assert.Equal(t, model.AbsenceCategoryVacation, at.Category)
	}
}

// Model unit tests (no DB required)

func TestAbsenceType_CreditMultiplier(t *testing.T) {
	tests := []struct {
		name     string
		portion  model.AbsencePortion
		expected float64
	}{
		{"none", model.AbsencePortionNone, 0.0},
		{"full", model.AbsencePortionFull, 1.0},
		{"half", model.AbsencePortionHalf, 0.5},
		{"unknown defaults to full", model.AbsencePortion(99), 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{Portion: tt.portion}
			assert.Equal(t, tt.expected, at.CreditMultiplier())
		})
	}
}

func TestAbsenceType_CalculateCredit(t *testing.T) {
	tests := []struct {
		name             string
		portion          model.AbsencePortion
		regelarbeitszeit int
		expected         int
	}{
		{"full 8h", model.AbsencePortionFull, 480, 480},
		{"half 8h", model.AbsencePortionHalf, 480, 240},
		{"none 8h", model.AbsencePortionNone, 480, 0},
		{"full 7.5h", model.AbsencePortionFull, 450, 450},
		{"half 7.5h", model.AbsencePortionHalf, 450, 225},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{Portion: tt.portion}
			assert.Equal(t, tt.expected, at.CalculateCredit(tt.regelarbeitszeit))
		})
	}
}

func TestAbsenceType_GetEffectiveCode(t *testing.T) {
	holidayCode := "KF"

	tests := []struct {
		name        string
		code        string
		holidayCode *string
		isHoliday   bool
		expected    string
	}{
		{"regular day, no holiday code", "K", nil, false, "K"},
		{"holiday, no holiday code", "K", nil, true, "K"},
		{"regular day, has holiday code", "K", &holidayCode, false, "K"},
		{"holiday, has holiday code", "K", &holidayCode, true, "KF"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{Code: tt.code, HolidayCode: tt.holidayCode}
			assert.Equal(t, tt.expected, at.GetEffectiveCode(tt.isHoliday))
		})
	}
}

func TestAbsenceType_IsVacationType(t *testing.T) {
	assert.True(t, (&model.AbsenceType{Category: model.AbsenceCategoryVacation}).IsVacationType())
	assert.False(t, (&model.AbsenceType{Category: model.AbsenceCategoryIllness}).IsVacationType())
}

func TestAbsenceType_IsIllnessType(t *testing.T) {
	assert.True(t, (&model.AbsenceType{Category: model.AbsenceCategoryIllness}).IsIllnessType())
	assert.False(t, (&model.AbsenceType{Category: model.AbsenceCategoryVacation}).IsIllnessType())
}
