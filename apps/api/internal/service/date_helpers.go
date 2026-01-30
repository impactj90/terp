package service

import "time"

// parseDate parses a date string in "2006-01-02" format.
func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", s)
}
