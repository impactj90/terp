package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
	"github.com/tolga/terp/internal/testutil"
)

// --- helpers for employee message tests ---

func createTestTenantForMessageService(t *testing.T, db *repository.DB) *model.Tenant {
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

func createTestUserForMessageService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.User {
	t.Helper()
	userRepo := repository.NewUserRepository(db)
	user := &model.User{
		TenantID:    &tenantID,
		Email:       "testuser-" + uuid.New().String()[:8] + "@example.com",
		DisplayName: "Test User",
		Role:        "admin",
		IsActive:    true,
	}
	err := userRepo.Create(context.Background(), user)
	require.NoError(t, err)
	return user
}

func createTestEmployeeForMessageService(t *testing.T, db *repository.DB, tenantID uuid.UUID) *model.Employee {
	t.Helper()
	employeeRepo := repository.NewEmployeeRepository(db)
	employee := &model.Employee{
		TenantID:        tenantID,
		FirstName:       "Test",
		LastName:        "Employee-" + uuid.New().String()[:8],
		PersonnelNumber: uuid.New().String()[:6],
		PIN:             uuid.New().String()[:8],
		IsActive:        true,
	}
	err := employeeRepo.Create(context.Background(), employee)
	require.NoError(t, err)
	return employee
}

// mockNotificationServiceForMessages implements the interface for testing.
type mockNotificationServiceForMessages struct {
	createForEmployeeCalls int
	failForEmployee        bool
}

func (m *mockNotificationServiceForMessages) CreateForEmployee(
	_ context.Context,
	_, _ uuid.UUID,
	_ service.CreateNotificationInput,
) (*model.Notification, error) {
	m.createForEmployeeCalls++
	if m.failForEmployee {
		return nil, assert.AnError
	}
	return &model.Notification{
		ID: uuid.New(),
	}, nil
}

// --- Create tests ---

func TestEmployeeMessageService_Create_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp := createTestEmployeeForMessageService(t, db, tenant.ID)

	input := service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "Test Subject",
		Body:        "Test body content.",
		EmployeeIDs: []uuid.UUID{emp.ID},
	}

	msg, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Equal(t, "Test Subject", msg.Subject)
	assert.Equal(t, "Test body content.", msg.Body)
	assert.Equal(t, tenant.ID, msg.TenantID)
	assert.Equal(t, sender.ID, msg.SenderID)
	assert.Len(t, msg.Recipients, 1)
	assert.Equal(t, emp.ID, msg.Recipients[0].EmployeeID)
	assert.Equal(t, model.RecipientStatusPending, msg.Recipients[0].Status)
}

func TestEmployeeMessageService_Create_MultipleRecipients(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp1 := createTestEmployeeForMessageService(t, db, tenant.ID)
	emp2 := createTestEmployeeForMessageService(t, db, tenant.ID)
	emp3 := createTestEmployeeForMessageService(t, db, tenant.ID)

	input := service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "Multi-recipient message",
		Body:        "Hello everyone.",
		EmployeeIDs: []uuid.UUID{emp1.ID, emp2.ID, emp3.ID},
	}

	msg, err := svc.Create(ctx, input)
	require.NoError(t, err)
	assert.Len(t, msg.Recipients, 3)
	for _, r := range msg.Recipients {
		assert.Equal(t, model.RecipientStatusPending, r.Status)
	}
}

func TestEmployeeMessageService_Create_EmptySubject(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	input := service.CreateEmployeeMessageInput{
		TenantID:    uuid.New(),
		SenderID:    uuid.New(),
		Subject:     "",
		Body:        "Some body",
		EmployeeIDs: []uuid.UUID{uuid.New()},
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrEmployeeMessageSubjectRequired)
}

func TestEmployeeMessageService_Create_EmptyBody(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	input := service.CreateEmployeeMessageInput{
		TenantID:    uuid.New(),
		SenderID:    uuid.New(),
		Subject:     "Subject",
		Body:        "",
		EmployeeIDs: []uuid.UUID{uuid.New()},
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrEmployeeMessageBodyRequired)
}

func TestEmployeeMessageService_Create_EmptyRecipients(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	input := service.CreateEmployeeMessageInput{
		TenantID:    uuid.New(),
		SenderID:    uuid.New(),
		Subject:     "Subject",
		Body:        "Body",
		EmployeeIDs: []uuid.UUID{},
	}

	_, err := svc.Create(ctx, input)
	assert.ErrorIs(t, err, service.ErrEmployeeMessageRecipientsRequired)
}

// --- GetByID tests ---

func TestEmployeeMessageService_GetByID_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp := createTestEmployeeForMessageService(t, db, tenant.ID)

	msg, err := svc.Create(ctx, service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "Get test",
		Body:        "Body",
		EmployeeIDs: []uuid.UUID{emp.ID},
	})
	require.NoError(t, err)

	found, err := svc.GetByID(ctx, tenant.ID, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, msg.ID, found.ID)
	assert.Equal(t, "Get test", found.Subject)
	assert.Len(t, found.Recipients, 1)
}

func TestEmployeeMessageService_GetByID_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	_, err := svc.GetByID(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, service.ErrEmployeeMessageNotFound)
}

// --- List tests ---

func TestEmployeeMessageService_List_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp := createTestEmployeeForMessageService(t, db, tenant.ID)

	// Create 3 messages
	for i := 0; i < 3; i++ {
		_, err := svc.Create(ctx, service.CreateEmployeeMessageInput{
			TenantID:    tenant.ID,
			SenderID:    sender.ID,
			Subject:     "List msg",
			Body:        "Body",
			EmployeeIDs: []uuid.UUID{emp.ID},
		})
		require.NoError(t, err)
	}

	messages, total, err := svc.List(ctx, tenant.ID, service.EmployeeMessageListParams{
		Limit:  10,
		Offset: 0,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	assert.Len(t, messages, 3)
}

func TestEmployeeMessageService_List_FilterByEmployee(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp1 := createTestEmployeeForMessageService(t, db, tenant.ID)
	emp2 := createTestEmployeeForMessageService(t, db, tenant.ID)

	// Message to emp1 only
	_, err := svc.Create(ctx, service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "For emp1",
		Body:        "Body",
		EmployeeIDs: []uuid.UUID{emp1.ID},
	})
	require.NoError(t, err)

	// Message to emp2 only
	_, err = svc.Create(ctx, service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "For emp2",
		Body:        "Body",
		EmployeeIDs: []uuid.UUID{emp2.ID},
	})
	require.NoError(t, err)

	// Filtered list for emp1 only
	messages, total, err := svc.List(ctx, tenant.ID, service.EmployeeMessageListParams{
		EmployeeID: &emp1.ID,
		Limit:      10,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	assert.Len(t, messages, 1)
	assert.Equal(t, "For emp1", messages[0].Subject)
}

// --- Send tests ---

func TestEmployeeMessageService_Send_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp := createTestEmployeeForMessageService(t, db, tenant.ID)

	msg, err := svc.Create(ctx, service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "Send test",
		Body:        "Body",
		EmployeeIDs: []uuid.UUID{emp.ID},
	})
	require.NoError(t, err)

	result, err := svc.Send(ctx, tenant.ID, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(1), result.Sent)
	assert.Equal(t, int64(0), result.Failed)
	assert.Equal(t, msg.ID, result.MessageID)
	assert.Equal(t, 1, mockNotif.createForEmployeeCalls)

	// Verify the recipient was updated
	updated, err := svc.GetByID(ctx, tenant.ID, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RecipientStatusSent, updated.Recipients[0].Status)
	assert.NotNil(t, updated.Recipients[0].SentAt)
}

func TestEmployeeMessageService_Send_NotificationFailure(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{failForEmployee: true}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp := createTestEmployeeForMessageService(t, db, tenant.ID)

	msg, err := svc.Create(ctx, service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "Fail test",
		Body:        "Body",
		EmployeeIDs: []uuid.UUID{emp.ID},
	})
	require.NoError(t, err)

	result, err := svc.Send(ctx, tenant.ID, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), result.Sent)
	assert.Equal(t, int64(1), result.Failed)

	// Verify the recipient was marked as failed
	updated, err := svc.GetByID(ctx, tenant.ID, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, model.RecipientStatusFailed, updated.Recipients[0].Status)
	assert.NotNil(t, updated.Recipients[0].ErrorMessage)
}

func TestEmployeeMessageService_Send_NotFound(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	_, err := svc.Send(ctx, uuid.New(), uuid.New())
	assert.ErrorIs(t, err, service.ErrEmployeeMessageNotFound)
}

func TestEmployeeMessageService_Send_AlreadySent(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp := createTestEmployeeForMessageService(t, db, tenant.ID)

	msg, err := svc.Create(ctx, service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "Send twice test",
		Body:        "Body",
		EmployeeIDs: []uuid.UUID{emp.ID},
	})
	require.NoError(t, err)

	// Send once
	result1, err := svc.Send(ctx, tenant.ID, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(1), result1.Sent)

	// Send again - should process 0 pending recipients
	result2, err := svc.Send(ctx, tenant.ID, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(0), result2.Sent)
	assert.Equal(t, int64(0), result2.Failed)
}

// --- ProcessPendingNotifications tests ---

func TestEmployeeMessageService_ProcessPendingNotifications_Success(t *testing.T) {
	db := testutil.SetupTestDB(t)
	repo := repository.NewEmployeeMessageRepository(db)
	mockNotif := &mockNotificationServiceForMessages{}
	svc := service.NewEmployeeMessageService(repo, mockNotif)
	ctx := context.Background()

	tenant := createTestTenantForMessageService(t, db)
	sender := createTestUserForMessageService(t, db, tenant.ID)
	emp := createTestEmployeeForMessageService(t, db, tenant.ID)

	_, err := svc.Create(ctx, service.CreateEmployeeMessageInput{
		TenantID:    tenant.ID,
		SenderID:    sender.ID,
		Subject:     "Pending test",
		Body:        "Body",
		EmployeeIDs: []uuid.UUID{emp.ID},
	})
	require.NoError(t, err)

	result, err := svc.ProcessPendingNotifications(ctx)
	require.NoError(t, err)
	assert.Equal(t, int64(1), result.Sent)
	assert.Equal(t, int64(0), result.Failed)
}
