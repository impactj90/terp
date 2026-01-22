// Package timeutil provides time conversion utilities for the Terp time tracking system.
// All time-of-day values are represented as minutes from midnight (0-1439).
// Durations are represented as minutes.
package timeutil

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ErrInvalidTimeFormat indicates a time string is not in HH:MM format.
var ErrInvalidTimeFormat = errors.New("invalid time format: expected HH:MM")

// MinutesPerDay is the number of minutes in a day (1440).
const MinutesPerDay = 1440

// MaxMinutesFromMidnight is the maximum valid minutes from midnight (1439 = 23:59).
const MaxMinutesFromMidnight = 1439

// TimeToMinutes converts a time.Time to minutes from midnight.
func TimeToMinutes(t time.Time) int {
	return t.Hour()*60 + t.Minute()
}

// MinutesToString formats minutes as "HH:MM".
// For durations >= 24 hours, hours will exceed 23 (e.g., 1500 -> "25:00").
func MinutesToString(minutes int) string {
	if minutes < 0 {
		return "-" + MinutesToString(-minutes)
	}
	h := minutes / 60
	m := minutes % 60
	return fmt.Sprintf("%02d:%02d", h, m)
}

// ParseTimeString parses "HH:MM" format to minutes from midnight.
// Returns ErrInvalidTimeFormat for malformed input.
func ParseTimeString(s string) (int, error) {
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		return 0, ErrInvalidTimeFormat
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, ErrInvalidTimeFormat
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, ErrInvalidTimeFormat
	}
	if h < 0 || m < 0 || m > 59 {
		return 0, ErrInvalidTimeFormat
	}
	return h*60 + m, nil
}

// MinutesToTime creates a time.Time from minutes on a given date.
// The date's timezone is preserved.
func MinutesToTime(date time.Time, minutes int) time.Time {
	return time.Date(
		date.Year(),
		date.Month(),
		date.Day(),
		minutes/60,
		minutes%60,
		0, 0,
		date.Location(),
	)
}

// NormalizeCrossMidnight handles times that span midnight.
// If endMinutes < startMinutes, adds MinutesPerDay to endMinutes.
// Returns the normalized end minutes.
func NormalizeCrossMidnight(startMinutes, endMinutes int) int {
	if endMinutes < startMinutes {
		return endMinutes + MinutesPerDay
	}
	return endMinutes
}

// IsValidTimeOfDay checks if minutes represents a valid time of day (0-1439).
func IsValidTimeOfDay(minutes int) bool {
	return minutes >= 0 && minutes <= MaxMinutesFromMidnight
}
