package calculation_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/tolga/terp/internal/calculation"
)

func TestPairBookings_Empty(t *testing.T) {
	result := calculation.PairBookings(nil)
	assert.Empty(t, result.Pairs)
	assert.Empty(t, result.UnpairedInIDs)
	assert.Empty(t, result.UnpairedOutIDs)
}

func TestPairBookings_SinglePair(t *testing.T) {
	comeID := uuid.New()
	goID := uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 1)
	assert.Equal(t, comeID, result.Pairs[0].InBooking.ID)
	assert.Equal(t, goID, result.Pairs[0].OutBooking.ID)
	assert.Equal(t, 540, result.Pairs[0].Duration) // 9 hours = 540 min
	assert.Empty(t, result.UnpairedInIDs)
	assert.Empty(t, result.UnpairedOutIDs)
}

func TestPairBookings_WithExistingPairID(t *testing.T) {
	comeID := uuid.New()
	goID := uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork, PairID: &goID},
		{ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork, PairID: &comeID},
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 1)
	assert.Equal(t, comeID, result.Pairs[0].InBooking.ID)
	assert.Equal(t, goID, result.Pairs[0].OutBooking.ID)
}

func TestPairBookings_MultiplePairs(t *testing.T) {
	// Morning shift + afternoon shift
	come1ID, go1ID := uuid.New(), uuid.New()
	come2ID, go2ID := uuid.New(), uuid.New()

	bookings := []calculation.BookingInput{
		{ID: come1ID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 08:00
		{ID: go1ID, Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},  // 12:00
		{ID: come2ID, Time: 780, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 13:00
		{ID: go2ID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork}, // 17:00
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 2)
	assert.Equal(t, 240, result.Pairs[0].Duration) // 4 hours
	assert.Equal(t, 240, result.Pairs[1].Duration) // 4 hours
}

func TestPairBookings_WithBreaks(t *testing.T) {
	comeID, goID := uuid.New(), uuid.New()
	breakStartID, breakEndID := uuid.New(), uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{ID: breakStartID, Time: 720, Direction: calculation.DirectionOut, Category: calculation.CategoryBreak},
		{ID: breakEndID, Time: 750, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak},
		{ID: goID, Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 2) // 1 work pair + 1 break pair

	var workPair, breakPair *calculation.BookingPair
	for i := range result.Pairs {
		if result.Pairs[i].Category == calculation.CategoryWork {
			workPair = &result.Pairs[i]
		} else {
			breakPair = &result.Pairs[i]
		}
	}

	require.NotNil(t, workPair)
	assert.Equal(t, 540, workPair.Duration) // 9 hours

	require.NotNil(t, breakPair)
	assert.Equal(t, 30, breakPair.Duration) // 30 min break
}

func TestPairBookings_Unpaired(t *testing.T) {
	comeID := uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
	}

	result := calculation.PairBookings(bookings)

	assert.Empty(t, result.Pairs)
	assert.Equal(t, []uuid.UUID{comeID}, result.UnpairedInIDs)
	assert.Empty(t, result.UnpairedOutIDs)
}

func TestPairBookings_CrossMidnight(t *testing.T) {
	comeID, goID := uuid.New(), uuid.New()

	bookings := []calculation.BookingInput{
		{ID: comeID, Time: 1320, Direction: calculation.DirectionIn, Category: calculation.CategoryWork}, // 22:00
		{ID: goID, Time: 120, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},   // 02:00 next day
	}

	result := calculation.PairBookings(bookings)

	require.Len(t, result.Pairs, 1)
	assert.Equal(t, 240, result.Pairs[0].Duration) // 4 hours (22:00 to 02:00)
	assert.Contains(t, result.Warnings, calculation.WarnCodeCrossMidnight)
}

func TestCalculateGrossTime(t *testing.T) {
	pairs := []calculation.BookingPair{
		{Category: calculation.CategoryWork, Duration: 240},
		{Category: calculation.CategoryWork, Duration: 240},
		{Category: calculation.CategoryBreak, Duration: 30}, // Should not be counted
	}

	gross := calculation.CalculateGrossTime(pairs)
	assert.Equal(t, 480, gross)
}

func TestCalculateBreakTime(t *testing.T) {
	pairs := []calculation.BookingPair{
		{Category: calculation.CategoryWork, Duration: 480},
		{Category: calculation.CategoryBreak, Duration: 30},
		{Category: calculation.CategoryBreak, Duration: 15},
	}

	breakTime := calculation.CalculateBreakTime(pairs)
	assert.Equal(t, 45, breakTime)
}

func TestFindFirstCome(t *testing.T) {
	bookings := []calculation.BookingInput{
		{Time: 500, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{Time: 720, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak}, // break, not work
		{Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
	}

	first := calculation.FindFirstCome(bookings)
	require.NotNil(t, first)
	assert.Equal(t, 480, *first)
}

func TestFindLastGo(t *testing.T) {
	bookings := []calculation.BookingInput{
		{Time: 480, Direction: calculation.DirectionIn, Category: calculation.CategoryWork},
		{Time: 1020, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
		{Time: 1050, Direction: calculation.DirectionIn, Category: calculation.CategoryBreak}, // break end, not work
		{Time: 1080, Direction: calculation.DirectionOut, Category: calculation.CategoryWork},
	}

	last := calculation.FindLastGo(bookings)
	require.NotNil(t, last)
	assert.Equal(t, 1080, *last)
}
