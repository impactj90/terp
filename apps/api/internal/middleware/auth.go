// Package middleware provides HTTP middleware for JWT validation.
package middleware

import (
	"net/http"
	"strings"

	"github.com/tolga/terp/internal/auth"
)

// AuthMiddleware creates a middleware that requires a valid JWT.
// If token is missing or invalid, returns 401.
// If valid, adds User and Claims to request context.
func AuthMiddleware(jwtManager *auth.JWTManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenString := extractTokenFromHeader(r)

			if tokenString == "" {
				tokenString = extractTokenFromCookie(r)
			}

			if tokenString == "" {
				http.Error(w, `{"error": "unauthorized", "message": "missing authentication token"}`, http.StatusUnauthorized)
				return
			}

			claims, err := jwtManager.Validate(tokenString)
			if err != nil {
				http.Error(w, err.Error(), http.StatusUnauthorized)
				return
			}

			user := &auth.User{
				ID:          claims.UserID,
				Email:       claims.Email,
				DisplayName: claims.DisplayName,
				Role:        claims.Role,
			}

			ctx := r.Context()

			ctx = auth.ContextWithUser(ctx, user)
			ctx = auth.ContextWithClaims(ctx, claims)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func extractTokenFromHeader(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}

	return parts[1]
}

func extractTokenFromCookie(r *http.Request) string {
	authString, err := r.Cookie("token")
	if err != nil {
		return ""
	}
	return authString.Value
}
