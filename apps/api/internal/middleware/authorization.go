package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/model"
)

var (
	ErrNoAuthenticatedUser = errors.New("authenticated user not found")
	ErrResourceNotFound    = errors.New("resource not found")
)

type permissionCheckerContextKey struct{}

type userRepository interface {
	GetWithRelations(ctx context.Context, id uuid.UUID) (*model.User, error)
}

type PermissionChecker struct {
	user          *model.User
	permissionSet map[string]struct{}
	hasGroup      bool
	groupActive   bool
	groupAdmin    bool
}

type AuthorizationMiddleware struct {
	userRepo userRepository
}

type EmployeeResolver func(*http.Request) (uuid.UUID, error)

func NewAuthorizationMiddleware(userRepo userRepository) *AuthorizationMiddleware {
	return &AuthorizationMiddleware{userRepo: userRepo}
}

func ContextWithPermissionChecker(ctx context.Context, checker *PermissionChecker) context.Context {
	return context.WithValue(ctx, permissionCheckerContextKey{}, checker)
}

func PermissionCheckerFromContext(ctx context.Context) (*PermissionChecker, bool) {
	checker, ok := ctx.Value(permissionCheckerContextKey{}).(*PermissionChecker)
	return checker, ok
}

func LoadPermissionChecker(ctx context.Context, userRepo userRepository) (context.Context, *PermissionChecker, error) {
	if checker, ok := PermissionCheckerFromContext(ctx); ok {
		return ctx, checker, nil
	}

	checker, err := NewPermissionChecker(ctx, userRepo)
	if err != nil {
		return ctx, nil, err
	}

	return ContextWithPermissionChecker(ctx, checker), checker, nil
}

func NewPermissionChecker(ctx context.Context, userRepo userRepository) (*PermissionChecker, error) {
	if userRepo == nil {
		return nil, errors.New("user repository not configured")
	}

	ctxUser, ok := auth.UserFromContext(ctx)
	if !ok {
		return nil, ErrNoAuthenticatedUser
	}

	user, err := userRepo.GetWithRelations(ctx, ctxUser.ID)
	if err != nil {
		return nil, err
	}

	return NewPermissionCheckerForUser(user)
}

func NewPermissionCheckerForUser(user *model.User) (*PermissionChecker, error) {
	if user == nil {
		return nil, errors.New("user required")
	}

	checker := &PermissionChecker{
		user:          user,
		permissionSet: map[string]struct{}{},
	}

	if user.UserGroup != nil {
		checker.hasGroup = true
		checker.groupActive = user.UserGroup.IsActive
		checker.groupAdmin = user.UserGroup.IsAdmin

		if checker.groupActive && !checker.groupAdmin {
			var permissions []string
			if err := json.Unmarshal(user.UserGroup.Permissions, &permissions); err != nil {
				return nil, err
			}
			for _, id := range permissions {
				checker.permissionSet[id] = struct{}{}
			}
		}
	}

	return checker, nil
}

func (c *PermissionChecker) Has(id string) bool {
	if c == nil || c.user == nil || id == "" {
		return false
	}

	if c.hasGroup {
		if !c.groupActive {
			return false
		}
		if c.groupAdmin {
			return true
		}
		_, ok := c.permissionSet[id]
		return ok
	}

	return c.user.Role == model.RoleAdmin
}

func (c *PermissionChecker) HasAny(ids ...string) bool {
	for _, id := range ids {
		if c.Has(id) {
			return true
		}
	}
	return false
}

func (c *PermissionChecker) EmployeeID() *uuid.UUID {
	if c == nil || c.user == nil {
		return nil
	}
	return c.user.EmployeeID
}

func (c *PermissionChecker) User() *model.User {
	if c == nil {
		return nil
	}
	return c.user
}

func (m *AuthorizationMiddleware) RequirePermission(ids ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, checker, err := LoadPermissionChecker(r.Context(), m.userRepo)
			if err != nil {
				writeAuthError(w, err)
				return
			}
			if !checker.HasAny(ids...) {
				writeForbidden(w)
				return
			}
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func (m *AuthorizationMiddleware) RequireSelfOrPermission(param string, permissionID string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, checker, err := LoadPermissionChecker(r.Context(), m.userRepo)
			if err != nil {
				writeAuthError(w, err)
				return
			}

			idStr := chi.URLParam(r, param)
			userID, err := uuid.Parse(idStr)
			if err != nil {
				http.Error(w, "invalid user id", http.StatusBadRequest)
				return
			}

			if checker.user != nil && checker.user.ID == userID {
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			if !checker.Has(permissionID) {
				writeForbidden(w)
				return
			}

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func (m *AuthorizationMiddleware) RequireEmployeePermission(param string, ownID, allID string) func(http.Handler) http.Handler {
	return m.requireEmployeePermissionWithResolver(func(r *http.Request) (uuid.UUID, error) {
		idStr := chi.URLParam(r, param)
		return uuid.Parse(idStr)
	}, ownID, allID)
}

func (m *AuthorizationMiddleware) RequireEmployeePermissionFromResolver(resolver EmployeeResolver, ownID, allID string) func(http.Handler) http.Handler {
	return m.requireEmployeePermissionWithResolver(resolver, ownID, allID)
}

func (m *AuthorizationMiddleware) requireEmployeePermissionWithResolver(resolver EmployeeResolver, ownID, allID string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, checker, err := LoadPermissionChecker(r.Context(), m.userRepo)
			if err != nil {
				writeAuthError(w, err)
				return
			}

			employeeID, err := resolver(r)
			if err != nil {
				if errors.Is(err, ErrResourceNotFound) {
					http.Error(w, "resource not found", http.StatusNotFound)
					return
				}
				http.Error(w, "invalid employee id", http.StatusBadRequest)
				return
			}

			if currentEmployeeID := checker.EmployeeID(); currentEmployeeID != nil && *currentEmployeeID == employeeID {
				if checker.Has(ownID) || (allID != "" && checker.Has(allID)) {
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			} else if allID != "" && checker.Has(allID) {
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}

			writeForbidden(w)
		})
	}
}

func DecodeJSONBody(r *http.Request, dest any) error {
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if err := r.Body.Close(); err != nil {
		return err
	}
	r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	if len(bodyBytes) == 0 {
		return nil
	}
	return json.Unmarshal(bodyBytes, dest)
}

func writeAuthError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNoAuthenticatedUser) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	http.Error(w, "authorization error", http.StatusUnauthorized)
}

func writeForbidden(w http.ResponseWriter) {
	http.Error(w, "forbidden", http.StatusForbidden)
}
