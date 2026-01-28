package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/datatypes"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/permissions"
)

type stubUserRepo struct {
	user *model.User
}

func (s stubUserRepo) GetWithRelations(ctx context.Context, id uuid.UUID) (*model.User, error) {
	return s.user, nil
}

func TestAuthorization_UserGroupsRequiresPermission(t *testing.T) {
	permManage := permissions.ID("users.manage").String()

	user := testUserWithPerms(t, []string{})
	authz := middleware.NewAuthorizationMiddleware(stubUserRepo{user: user})

	r := chi.NewRouter()
	r.With(authz.RequirePermission(permManage)).Get("/user-groups", okHandler)

	req := newAuthRequest(http.MethodGet, "/user-groups", nil, user)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)

	user = testUserWithPerms(t, []string{permManage})
	authz = middleware.NewAuthorizationMiddleware(stubUserRepo{user: user})
	r = chi.NewRouter()
	r.With(authz.RequirePermission(permManage)).Get("/user-groups", okHandler)

	req = newAuthRequest(http.MethodGet, "/user-groups", nil, user)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestAuthorization_AbsencesOwnVsManage(t *testing.T) {
	requestPerm := permissions.ID("absences.request").String()
	managePerm := permissions.ID("absences.manage").String()

	employeeID := uuid.New()
	user := testUserWithPerms(t, []string{requestPerm})
	user.EmployeeID = &employeeID
	authz := middleware.NewAuthorizationMiddleware(stubUserRepo{user: user})

	r := chi.NewRouter()
	r.With(authz.RequireEmployeePermission("id", requestPerm, managePerm)).Get("/employees/{id}/absences", okHandler)

	req := newAuthRequest(http.MethodGet, "/employees/"+employeeID.String()+"/absences", nil, user)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)

	otherID := uuid.New()
	req = newAuthRequest(http.MethodGet, "/employees/"+otherID.String()+"/absences", nil, user)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)

	user = testUserWithPerms(t, []string{managePerm})
	user.EmployeeID = &employeeID
	authz = middleware.NewAuthorizationMiddleware(stubUserRepo{user: user})
	r = chi.NewRouter()
	r.With(authz.RequireEmployeePermission("id", requestPerm, managePerm)).Get("/employees/{id}/absences", okHandler)

	req = newAuthRequest(http.MethodGet, "/employees/"+otherID.String()+"/absences", nil, user)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestAuthorization_BookingCreateRequiresEditAndOwnOrAll(t *testing.T) {
	viewOwn := permissions.ID("time_tracking.view_own").String()
	viewAll := permissions.ID("time_tracking.view_all").String()
	edit := permissions.ID("time_tracking.edit").String()

	employeeID := uuid.New()
	body := []byte(`{"employee_id":"` + employeeID.String() + `"}`)

	resolver := func(r *http.Request) (uuid.UUID, error) {
		var payload struct {
			EmployeeID string `json:"employee_id"`
		}
		if err := middleware.DecodeJSONBody(r, &payload); err != nil {
			return uuid.Nil, err
		}
		return uuid.Parse(payload.EmployeeID)
	}

	user := testUserWithPerms(t, []string{viewOwn})
	user.EmployeeID = &employeeID
	authz := middleware.NewAuthorizationMiddleware(stubUserRepo{user: user})

	r := chi.NewRouter()
	r.With(authz.RequirePermission(edit), authz.RequireEmployeePermissionFromResolver(resolver, viewOwn, viewAll)).Post("/bookings", okHandler)

	req := newAuthRequest(http.MethodPost, "/bookings", bytes.NewBuffer(body), user)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusForbidden, rr.Code)

	user = testUserWithPerms(t, []string{viewOwn, edit})
	user.EmployeeID = &employeeID
	authz = middleware.NewAuthorizationMiddleware(stubUserRepo{user: user})
	r = chi.NewRouter()
	r.With(authz.RequirePermission(edit), authz.RequireEmployeePermissionFromResolver(resolver, viewOwn, viewAll)).Post("/bookings", okHandler)

	req = newAuthRequest(http.MethodPost, "/bookings", bytes.NewBuffer(body), user)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)

	otherEmployee := uuid.New()
	body = []byte(`{"employee_id":"` + otherEmployee.String() + `"}`)
	user = testUserWithPerms(t, []string{viewAll, edit})
	user.EmployeeID = &employeeID
	authz = middleware.NewAuthorizationMiddleware(stubUserRepo{user: user})
	r = chi.NewRouter()
	r.With(authz.RequirePermission(edit), authz.RequireEmployeePermissionFromResolver(resolver, viewOwn, viewAll)).Post("/bookings", okHandler)

	req = newAuthRequest(http.MethodPost, "/bookings", bytes.NewBuffer(body), user)
	rr = httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	assert.Equal(t, http.StatusOK, rr.Code)
}

func testUserWithPerms(t *testing.T, permissionIDs []string) *model.User {
	t.Helper()
	perms, err := json.Marshal(permissionIDs)
	require.NoError(t, err)
	group := &model.UserGroup{
		IsActive:    true,
		IsAdmin:     false,
		Permissions: datatypes.JSON(perms),
	}
	return &model.User{
		ID:        uuid.New(),
		Role:      model.RoleUser,
		UserGroup: group,
	}
}

func newAuthRequest(method, path string, body io.Reader, user *model.User) *http.Request {
	req := httptest.NewRequest(method, path, body)
	req = req.WithContext(auth.ContextWithUser(req.Context(), &auth.User{
		ID:   user.ID,
		Role: string(user.Role),
	}))
	return req
}

func okHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}
