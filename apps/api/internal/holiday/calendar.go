package holiday

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

// State represents a German federal state (Bundesland).
type State string

const (
	StateBW State = "BW" // Baden-Wuerttemberg
	StateBY State = "BY" // Bayern
	StateBE State = "BE" // Berlin
	StateBB State = "BB" // Brandenburg
	StateHB State = "HB" // Bremen
	StateHH State = "HH" // Hamburg
	StateHE State = "HE" // Hessen
	StateMV State = "MV" // Mecklenburg-Vorpommern
	StateNI State = "NI" // Niedersachsen
	StateNW State = "NW" // Nordrhein-Westfalen
	StateRP State = "RP" // Rheinland-Pfalz
	StateSL State = "SL" // Saarland
	StateSN State = "SN" // Sachsen
	StateST State = "ST" // Sachsen-Anhalt
	StateSH State = "SH" // Schleswig-Holstein
	StateTH State = "TH" // Thueringen
)

var states = map[State]struct{}{
	StateBW: {}, StateBY: {}, StateBE: {}, StateBB: {}, StateHB: {}, StateHH: {},
	StateHE: {}, StateMV: {}, StateNI: {}, StateNW: {}, StateRP: {}, StateSL: {},
	StateSN: {}, StateST: {}, StateSH: {}, StateTH: {},
}

// Definition represents a generated holiday.
type Definition struct {
	Date time.Time
	Name string
}

// ParseState parses a Bundesland code (case-insensitive).
func ParseState(code string) (State, error) {
	normalized := strings.ToUpper(strings.TrimSpace(code))
	state := State(normalized)
	if _, ok := states[state]; !ok {
		return "", fmt.Errorf("unknown state: %s", code)
	}
	return state, nil
}

// Generate returns holidays for a given year and state.
func Generate(year int, state State) ([]Definition, error) {
	if year < 1900 || year > 2200 {
		return nil, fmt.Errorf("invalid year: %d", year)
	}
	if _, ok := states[state]; !ok {
		return nil, fmt.Errorf("unknown state: %s", state)
	}

	easter := easterSunday(year)
	fixed := func(month time.Month, day int, name string) Definition {
		return Definition{Date: time.Date(year, month, day, 0, 0, 0, 0, time.UTC), Name: name}
	}
	offset := func(days int, name string) Definition {
		return Definition{Date: easter.AddDate(0, 0, days), Name: name}
	}

	// Nationwide holidays
	holidayList := []Definition{
		fixed(time.January, 1, "Neujahr"),
		offset(-2, "Karfreitag"),
		offset(1, "Ostermontag"),
		fixed(time.May, 1, "Tag der Arbeit"),
		offset(39, "Christi Himmelfahrt"),
		offset(50, "Pfingstmontag"),
		fixed(time.October, 3, "Tag der Deutschen Einheit"),
		fixed(time.December, 25, "1. Weihnachtstag"),
		fixed(time.December, 26, "2. Weihnachtstag"),
	}

	// State-specific holidays
	switch state {
	case StateBW, StateBY, StateST:
		holidayList = append(holidayList, fixed(time.January, 6, "Heilige Drei Koenige"))
	}

	switch state {
	case StateBE, StateMV:
		holidayList = append(holidayList, fixed(time.March, 8, "Internationaler Frauentag"))
	}

	switch state {
	case StateBB:
		holidayList = append(holidayList,
			offset(0, "Ostersonntag"),
			offset(49, "Pfingstsonntag"),
		)
	}

	switch state {
	case StateBW, StateBY, StateHE, StateNW, StateRP, StateSL:
		holidayList = append(holidayList, offset(60, "Fronleichnam"))
	}

	switch state {
	case StateBY, StateSL:
		holidayList = append(holidayList, fixed(time.August, 15, "Mariae Himmelfahrt"))
	}

	switch state {
	case StateBW, StateBY, StateNW, StateRP, StateSL:
		holidayList = append(holidayList, fixed(time.November, 1, "Allerheiligen"))
	}

	switch state {
	case StateBB, StateMV, StateSN, StateST, StateTH, StateHB, StateHH, StateNI, StateSH:
		holidayList = append(holidayList, fixed(time.October, 31, "Reformationstag"))
	}

	switch state {
	case StateSN:
		holidayList = append(holidayList, repentanceDay(year))
	}

	switch state {
	case StateTH:
		holidayList = append(holidayList, fixed(time.September, 20, "Weltkindertag"))
	}

	sort.Slice(holidayList, func(i, j int) bool {
		return holidayList[i].Date.Before(holidayList[j].Date)
	})

	return holidayList, nil
}

func easterSunday(year int) time.Time {
	a := year % 19
	b := year / 100
	c := year % 100
	d := b / 4
	e := b % 4
	f := (b + 8) / 25
	g := (b - f + 1) / 3
	h := (19*a + b - d - g + 15) % 30
	i := c / 4
	k := c % 4
	l := (32 + 2*e + 2*i - h - k) % 7
	m := (a + 11*h + 22*l) / 451
	month := (h + l - 7*m + 114) / 31
	day := ((h + l - 7*m + 114) % 31) + 1
	return time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.UTC)
}

func repentanceDay(year int) Definition {
	date := time.Date(year, time.November, 23, 0, 0, 0, 0, time.UTC)
	// Step back one day to ensure the Wednesday is strictly before Nov 23.
	date = date.AddDate(0, 0, -1)
	for date.Weekday() != time.Wednesday {
		date = date.AddDate(0, 0, -1)
	}
	return Definition{Date: date, Name: "Buss- und Bettag"}
}
