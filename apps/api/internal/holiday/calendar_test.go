package holiday

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerate_Bavaria2026(t *testing.T) {
	holidays, err := Generate(2026, StateBY)
	require.NoError(t, err)
	require.NotEmpty(t, holidays)

	byDate := map[string]string{}
	for _, holiday := range holidays {
		byDate[holiday.Date.Format("2006-01-02")] = holiday.Name
	}

	assert.Equal(t, "Neujahr", byDate["2026-01-01"])
	assert.Equal(t, "Heilige Drei Koenige", byDate["2026-01-06"])
	assert.Equal(t, "Ostermontag", byDate["2026-04-06"])
	assert.Equal(t, "Tag der Deutschen Einheit", byDate["2026-10-03"])
	assert.Equal(t, "1. Weihnachtstag", byDate["2026-12-25"])
}

func TestParseState_CaseInsensitive(t *testing.T) {
	state, err := ParseState("by")
	require.NoError(t, err)
	assert.Equal(t, StateBY, state)
}

func TestGenerate_InvalidYear(t *testing.T) {
	_, err := Generate(1800, StateBY)
	assert.Error(t, err)
}

func TestGenerate_InvalidState(t *testing.T) {
	_, err := Generate(2026, State("XX"))
	assert.Error(t, err)
}
