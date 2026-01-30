package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
)

// --- Mocks ---

type mockExportInterfaceRepo struct {
	mock.Mock
}

func (m *mockExportInterfaceRepo) Create(ctx context.Context, ei *model.ExportInterface) error {
	args := m.Called(ctx, ei)
	if ei.ID == uuid.Nil {
		ei.ID = uuid.New()
	}
	return args.Error(0)
}

func (m *mockExportInterfaceRepo) GetByID(ctx context.Context, id uuid.UUID) (*model.ExportInterface, error) {
	args := m.Called(ctx, id)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.ExportInterface), args.Error(1)
}

func (m *mockExportInterfaceRepo) GetByNumber(ctx context.Context, tenantID uuid.UUID, number int) (*model.ExportInterface, error) {
	args := m.Called(ctx, tenantID, number)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*model.ExportInterface), args.Error(1)
}

func (m *mockExportInterfaceRepo) List(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.ExportInterface), args.Error(1)
}

func (m *mockExportInterfaceRepo) ListActive(ctx context.Context, tenantID uuid.UUID) ([]model.ExportInterface, error) {
	args := m.Called(ctx, tenantID)
	return args.Get(0).([]model.ExportInterface), args.Error(1)
}

func (m *mockExportInterfaceRepo) Update(ctx context.Context, ei *model.ExportInterface) error {
	args := m.Called(ctx, ei)
	return args.Error(0)
}

func (m *mockExportInterfaceRepo) Delete(ctx context.Context, id uuid.UUID) error {
	args := m.Called(ctx, id)
	return args.Error(0)
}

func (m *mockExportInterfaceRepo) SetAccounts(ctx context.Context, interfaceID uuid.UUID, accountIDs []uuid.UUID) ([]model.ExportInterfaceAccount, error) {
	args := m.Called(ctx, interfaceID, accountIDs)
	return args.Get(0).([]model.ExportInterfaceAccount), args.Error(1)
}

func (m *mockExportInterfaceRepo) ListAccounts(ctx context.Context, interfaceID uuid.UUID) ([]model.ExportInterfaceAccount, error) {
	args := m.Called(ctx, interfaceID)
	return args.Get(0).([]model.ExportInterfaceAccount), args.Error(1)
}

func (m *mockExportInterfaceRepo) CountExportUsages(ctx context.Context, interfaceID uuid.UUID) (int64, error) {
	args := m.Called(ctx, interfaceID)
	return args.Get(0).(int64), args.Error(1)
}

// --- Tests ---

func TestExportInterfaceService_Create_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	tenantID := uuid.New()

	repo.On("GetByNumber", ctx, tenantID, 1).Return(nil, errors.New("not found"))
	repo.On("Create", ctx, mock.AnythingOfType("*model.ExportInterface")).Return(nil)

	ei, err := svc.Create(ctx, CreateExportInterfaceInput{
		TenantID:        tenantID,
		InterfaceNumber: 1,
		Name:            "DATEV Export",
	})

	require.NoError(t, err)
	assert.Equal(t, 1, ei.InterfaceNumber)
	assert.Equal(t, "DATEV Export", ei.Name)
	assert.True(t, ei.IsActive)
	repo.AssertExpectations(t)
}

func TestExportInterfaceService_Create_WithOptionalFields(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	tenantID := uuid.New()
	mandant := "12345"
	script := "export_datev.sh"
	path := "/exports/datev/"
	filename := "payroll.csv"

	repo.On("GetByNumber", ctx, tenantID, 2).Return(nil, errors.New("not found"))
	repo.On("Create", ctx, mock.AnythingOfType("*model.ExportInterface")).Return(nil)

	ei, err := svc.Create(ctx, CreateExportInterfaceInput{
		TenantID:        tenantID,
		InterfaceNumber: 2,
		Name:            "Sage Export",
		MandantNumber:   &mandant,
		ExportScript:    &script,
		ExportPath:      &path,
		OutputFilename:  &filename,
	})

	require.NoError(t, err)
	assert.Equal(t, &mandant, ei.MandantNumber)
	assert.Equal(t, &script, ei.ExportScript)
	assert.Equal(t, &path, ei.ExportPath)
	assert.Equal(t, &filename, ei.OutputFilename)
	repo.AssertExpectations(t)
}

func TestExportInterfaceService_Create_NameRequired(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	_, err := svc.Create(ctx, CreateExportInterfaceInput{
		TenantID:        uuid.New(),
		InterfaceNumber: 1,
		Name:            "",
	})

	assert.ErrorIs(t, err, ErrExportInterfaceNameRequired)
}

func TestExportInterfaceService_Create_NumberRequired(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	_, err := svc.Create(ctx, CreateExportInterfaceInput{
		TenantID:        uuid.New(),
		InterfaceNumber: 0,
		Name:            "Test",
	})

	assert.ErrorIs(t, err, ErrExportInterfaceNumberRequired)
}

func TestExportInterfaceService_Create_NumberNegative(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	_, err := svc.Create(ctx, CreateExportInterfaceInput{
		TenantID:        uuid.New(),
		InterfaceNumber: -1,
		Name:            "Test",
	})

	assert.ErrorIs(t, err, ErrExportInterfaceNumberRequired)
}

func TestExportInterfaceService_Create_NumberExists(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	tenantID := uuid.New()
	existing := &model.ExportInterface{ID: uuid.New(), InterfaceNumber: 1}
	repo.On("GetByNumber", ctx, tenantID, 1).Return(existing, nil)

	_, err := svc.Create(ctx, CreateExportInterfaceInput{
		TenantID:        tenantID,
		InterfaceNumber: 1,
		Name:            "Duplicate",
	})

	assert.ErrorIs(t, err, ErrExportInterfaceNumberExists)
}

func TestExportInterfaceService_Update_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	existing := &model.ExportInterface{
		ID:              eiID,
		TenantID:        uuid.New(),
		InterfaceNumber: 1,
		Name:            "Old Name",
		IsActive:        true,
	}
	repo.On("GetByID", ctx, eiID).Return(existing, nil)
	repo.On("Update", ctx, mock.AnythingOfType("*model.ExportInterface")).Return(nil)

	newName := "Updated Name"
	updated, err := svc.Update(ctx, eiID, UpdateExportInterfaceInput{
		Name: &newName,
	})

	require.NoError(t, err)
	assert.Equal(t, "Updated Name", updated.Name)
	repo.AssertExpectations(t)
}

func TestExportInterfaceService_Update_ChangeNumber(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	tenantID := uuid.New()
	existing := &model.ExportInterface{
		ID:              eiID,
		TenantID:        tenantID,
		InterfaceNumber: 1,
		Name:            "Test",
		IsActive:        true,
	}
	repo.On("GetByID", ctx, eiID).Return(existing, nil)
	repo.On("GetByNumber", ctx, tenantID, 5).Return(nil, errors.New("not found"))
	repo.On("Update", ctx, mock.AnythingOfType("*model.ExportInterface")).Return(nil)

	newNum := 5
	updated, err := svc.Update(ctx, eiID, UpdateExportInterfaceInput{
		InterfaceNumber: &newNum,
	})

	require.NoError(t, err)
	assert.Equal(t, 5, updated.InterfaceNumber)
	repo.AssertExpectations(t)
}

func TestExportInterfaceService_Update_ChangeNumberConflict(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	tenantID := uuid.New()
	existing := &model.ExportInterface{
		ID:              eiID,
		TenantID:        tenantID,
		InterfaceNumber: 1,
		Name:            "Test",
	}
	repo.On("GetByID", ctx, eiID).Return(existing, nil)
	repo.On("GetByNumber", ctx, tenantID, 2).Return(&model.ExportInterface{ID: uuid.New()}, nil)

	newNum := 2
	_, err := svc.Update(ctx, eiID, UpdateExportInterfaceInput{
		InterfaceNumber: &newNum,
	})

	assert.ErrorIs(t, err, ErrExportInterfaceNumberExists)
}

func TestExportInterfaceService_Delete_Success(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	repo.On("GetByID", ctx, eiID).Return(&model.ExportInterface{ID: eiID}, nil)
	repo.On("CountExportUsages", ctx, eiID).Return(int64(0), nil)
	repo.On("Delete", ctx, eiID).Return(nil)

	err := svc.Delete(ctx, eiID)

	assert.NoError(t, err)
	repo.AssertExpectations(t)
}

func TestExportInterfaceService_Delete_InUse(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	repo.On("GetByID", ctx, eiID).Return(&model.ExportInterface{ID: eiID}, nil)
	repo.On("CountExportUsages", ctx, eiID).Return(int64(3), nil)

	err := svc.Delete(ctx, eiID)

	assert.ErrorIs(t, err, ErrExportInterfaceInUse)
}

func TestExportInterfaceService_Delete_NotFound(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	repo.On("GetByID", ctx, eiID).Return(nil, errors.New("not found"))

	err := svc.Delete(ctx, eiID)

	assert.ErrorIs(t, err, ErrExportInterfaceNotFound)
}

func TestExportInterfaceService_List(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	tenantID := uuid.New()
	expected := []model.ExportInterface{
		{ID: uuid.New(), InterfaceNumber: 1, Name: "First"},
		{ID: uuid.New(), InterfaceNumber: 2, Name: "Second"},
	}
	repo.On("List", ctx, tenantID).Return(expected, nil)

	result, err := svc.List(ctx, tenantID, false)

	require.NoError(t, err)
	assert.Len(t, result, 2)
	repo.AssertExpectations(t)
}

func TestExportInterfaceService_ListActive(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	tenantID := uuid.New()
	expected := []model.ExportInterface{
		{ID: uuid.New(), InterfaceNumber: 1, Name: "Active", IsActive: true},
	}
	repo.On("ListActive", ctx, tenantID).Return(expected, nil)

	result, err := svc.List(ctx, tenantID, true)

	require.NoError(t, err)
	assert.Len(t, result, 1)
	repo.AssertExpectations(t)
}

func TestExportInterfaceService_SetAccounts(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	accountIDs := []uuid.UUID{uuid.New(), uuid.New()}
	expected := []model.ExportInterfaceAccount{
		{ID: uuid.New(), ExportInterfaceID: eiID, AccountID: accountIDs[0], SortOrder: 0},
		{ID: uuid.New(), ExportInterfaceID: eiID, AccountID: accountIDs[1], SortOrder: 1},
	}

	repo.On("GetByID", ctx, eiID).Return(&model.ExportInterface{ID: eiID}, nil)
	repo.On("SetAccounts", ctx, eiID, accountIDs).Return(expected, nil)

	result, err := svc.SetAccounts(ctx, eiID, accountIDs)

	require.NoError(t, err)
	assert.Len(t, result, 2)
	repo.AssertExpectations(t)
}

func TestExportInterfaceService_SetAccounts_NotFound(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	repo.On("GetByID", ctx, eiID).Return(nil, errors.New("not found"))

	_, err := svc.SetAccounts(ctx, eiID, []uuid.UUID{uuid.New()})

	assert.ErrorIs(t, err, ErrExportInterfaceNotFound)
}

func TestExportInterfaceService_ListAccounts(t *testing.T) {
	ctx := context.Background()
	repo := new(mockExportInterfaceRepo)
	svc := NewExportInterfaceService(repo)

	eiID := uuid.New()
	expected := []model.ExportInterfaceAccount{
		{ID: uuid.New(), ExportInterfaceID: eiID, AccountID: uuid.New()},
	}

	repo.On("GetByID", ctx, eiID).Return(&model.ExportInterface{ID: eiID}, nil)
	repo.On("ListAccounts", ctx, eiID).Return(expected, nil)

	result, err := svc.ListAccounts(ctx, eiID)

	require.NoError(t, err)
	assert.Len(t, result, 1)
	repo.AssertExpectations(t)
}
