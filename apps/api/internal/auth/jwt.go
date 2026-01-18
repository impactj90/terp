package auth

import (
	"errors"
	"time"

	jwt "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Errors for jwt token.
var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token has expired")
)

// Claims represents the JWT claims.
type Claims struct {
	jwt.RegisteredClaims

	UserID      uuid.UUID `json:"user_id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Role        string    `json:"role"`
}

// JWTManager handles JWT operations.
type JWTManager struct {
	Secret []byte
	Issuer string
	Expiry time.Duration
}

// NewJWTManager creates a new JWT manager.
func NewJWTManager(secret []byte, issuer string, expiry time.Duration) *JWTManager {
	return &JWTManager{
		Secret: secret,
		Issuer: issuer,
		Expiry: expiry,
	}
}

// Generate creates a new JWT token for the user.
func (jm *JWTManager) Generate(userID uuid.UUID, email, name, role string) (string, error) {
	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    jm.Issuer,
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(jm.Expiry)),
			NotBefore: jwt.NewNumericDate(now),
		},
		UserID:      userID,
		Email:       email,
		DisplayName: name,
		Role:        role,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	return token.SignedString(jm.Secret)
}

// Validate parses and validates a JWT token.
func (jm *JWTManager) Validate(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}

		return jm.Secret, nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}
