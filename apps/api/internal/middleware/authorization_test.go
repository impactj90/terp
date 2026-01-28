package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/datatypes"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/permissions"
)

type stubUserRepo struct {
	user *model.User
}

func (s stubUserRepo) GetWithRelations(ctx context.Context, id uuid.UUID) (*model.User, error) {
	return s.user, nil
}

func TestPermissionChecker_AdminGroupBypass(t *testing.T) {
	group := &model.UserGroup{
		IsAdmin:  true,
		IsActive: true,
	}
	user := &model.User{
		ID:        uuid.New(),
		Role:      model.RoleUser,
		UserGroup: group,
	}

	checker, err := NewPermissionCheckerForUser(user)
	require.NoError(t, err)

	assert.True(t, checker.Has(permissions.ID("employees.view").String()))
}

func TestPermissionChecker_InactiveGroupDenies(t *testing.T) {
	perms := []string{permissions.ID("employees.view").String()}
	group := &model.UserGroup{
		IsAdmin:     true,
		IsActive:    false,
		Permissions: datatypes.JSON(mustJSON(t, perms)),
	}
	user := &model.User{
		ID:        uuid.New(),
		Role:      model.RoleAdmin,
		UserGroup: group,
	}

	checker, err := NewPermissionCheckerForUser(user)
	require.NoError(t, err)

	assert.False(t, checker.Has(permissions.ID("employees.view").String()))
}

func TestRequireEmployeePermission_OwnVsAll(t *testing.T) {
	ownPerm := permissions.ID("time_tracking.view_own").String()
	allPerm := permissions.ID("time_tracking.view_all").String()

	employeeID := uuid.New()
	userID := uuid.New()
	group := &model.UserGroup{
		IsActive:    true,
		Permissions: datatypes.JSON(mustJSON(t, []string{ownPerm})),
	}
	user := &model.User{
		ID:         userID,
		Role:       model.RoleUser,
		UserGroup:  group,
		EmployeeID: &employeeID,
	}

	authz := NewAuthorizationMiddleware(stubUserRepo{user: user})

	r := chi.NewRouter()
	r.With(authz.RequireEmployeePermission("id", ownPerm, allPerm)).Get("/employees/{id}", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/employees/"+employeeID.String(), nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: userID, Role: string(model.RoleUser)}))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)

	otherID := uuid.New()
	req = httptest.NewRequest(http.MethodGet, "/employees/"+otherID.String(), nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: userID, Role: string(model.RoleUser)}))
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)

	// Grant view_all and retry other employee.
	group.Permissions = datatypes.JSON(mustJSON(t, []string{allPerm}))
	req = httptest.NewRequest(http.MethodGet, "/employees/"+otherID.String(), nil)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{ID: userID, Role: string(model.RoleUser)}))
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func mustJSON(t *testing.T, values []string) []byte {
	t.Helper()
	data, err := json.Marshal(values)
	require.NoError(t, err)
	return data
}
