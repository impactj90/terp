package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDateRange_Valid(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/evaluations/daily-values?from=2026-01-01&to=2026-01-31", nil)

	from, to, err := parseDateRange(r)
	require.NoError(t, err)
	assert.Equal(t, "2026-01-01", from.Format("2006-01-02"))
	assert.Equal(t, "2026-01-31", to.Format("2006-01-02"))
}

func TestParseDateRange_MissingFrom(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/evaluations/daily-values?to=2026-01-31", nil)

	_, _, err := parseDateRange(r)
	require.Error(t, err)
	assert.Equal(t, errMissingDateRange, err)
}

func TestParseDateRange_MissingTo(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/evaluations/daily-values?from=2026-01-01", nil)

	_, _, err := parseDateRange(r)
	require.Error(t, err)
	assert.Equal(t, errMissingDateRange, err)
}

func TestParseDateRange_InvalidFormat(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/evaluations/daily-values?from=01-01-2026&to=2026-01-31", nil)

	_, _, err := parseDateRange(r)
	require.Error(t, err)
	assert.Equal(t, errInvalidDateFormat, err)
}

func TestParseDateRange_ToBeforeFrom(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/evaluations/daily-values?from=2026-01-31&to=2026-01-01", nil)

	_, _, err := parseDateRange(r)
	require.Error(t, err)
	assert.Equal(t, errDateRangeInvalid, err)
}

func TestParseOptionalUUID_Valid(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?employee_id=550e8400-e29b-41d4-a716-446655440000", nil)

	id := parseOptionalUUID(r, "employee_id")
	require.NotNil(t, id)
	assert.Equal(t, "550e8400-e29b-41d4-a716-446655440000", id.String())
}

func TestParseOptionalUUID_Empty(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)

	id := parseOptionalUUID(r, "employee_id")
	assert.Nil(t, id)
}

func TestParseOptionalUUID_Invalid(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?employee_id=not-a-uuid", nil)

	id := parseOptionalUUID(r, "employee_id")
	assert.Nil(t, id)
}

func TestParseOptionalBool_True(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?has_errors=true", nil)

	val := parseOptionalBool(r, "has_errors")
	require.NotNil(t, val)
	assert.True(t, *val)
}

func TestParseOptionalBool_False(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?has_errors=false", nil)

	val := parseOptionalBool(r, "has_errors")
	require.NotNil(t, val)
	assert.False(t, *val)
}

func TestParseOptionalBool_Empty(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)

	val := parseOptionalBool(r, "has_errors")
	assert.Nil(t, val)
}

func TestParseOptionalBool_Invalid(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?has_errors=maybe", nil)

	val := parseOptionalBool(r, "has_errors")
	assert.Nil(t, val)
}

func TestParseIntDefault_WithValue(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?limit=25", nil)

	val := parseIntDefault(r, "limit", 50)
	assert.Equal(t, 25, val)
}

func TestParseIntDefault_DefaultValue(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test", nil)

	val := parseIntDefault(r, "limit", 50)
	assert.Equal(t, 50, val)
}

func TestParseIntDefault_InvalidFallsBack(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?limit=abc", nil)

	val := parseIntDefault(r, "limit", 50)
	assert.Equal(t, 50, val)
}

func TestParseIntDefault_ZeroFallsBack(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?limit=0", nil)

	val := parseIntDefault(r, "limit", 50)
	assert.Equal(t, 50, val)
}

func TestParseOptionalBoolDefault(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/test?include=true", nil)
	assert.True(t, parseOptionalBoolDefault(r, "include", false))

	r = httptest.NewRequest(http.MethodGet, "/test?include=false", nil)
	assert.False(t, parseOptionalBoolDefault(r, "include", true))

	r = httptest.NewRequest(http.MethodGet, "/test", nil)
	assert.True(t, parseOptionalBoolDefault(r, "include", true))
	assert.False(t, parseOptionalBoolDefault(r, "include", false))
}
