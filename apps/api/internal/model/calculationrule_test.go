package model_test

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/model"
)

func TestCalculationRule_Calculate_FullDay_ZeroValue(t *testing.T) {
	// When value=0, use daily target time * factor
	// Full day: 480 min (8h) * 1.0 = 480
	rule := &model.CalculationRule{
		Value:  0,
		Factor: 1.0,
	}
	result := rule.Calculate(480)
	expected := decimal.NewFromInt(480)
	assert.True(t, result.Equal(expected), "expected %s, got %s", expected, result)
}

func TestCalculationRule_Calculate_HalfDay_ZeroValue(t *testing.T) {
	// When value=0, use daily target time * factor
	// Half day: 480 min (8h) * 0.5 = 240
	rule := &model.CalculationRule{
		Value:  0,
		Factor: 0.5,
	}
	result := rule.Calculate(480)
	expected := decimal.NewFromInt(240)
	assert.True(t, result.Equal(expected), "expected %s, got %s", expected, result)
}

func TestCalculationRule_Calculate_FixedValue(t *testing.T) {
	// When value is set, use value * factor
	// Fixed: 300 min * 1.0 = 300
	rule := &model.CalculationRule{
		Value:  300,
		Factor: 1.0,
	}
	result := rule.Calculate(480) // dailyTarget ignored since value != 0
	expected := decimal.NewFromInt(300)
	assert.True(t, result.Equal(expected), "expected %s, got %s", expected, result)
}

func TestCalculationRule_Calculate_FixedValueWithFactor(t *testing.T) {
	// Fixed: 600 min * 0.5 = 300
	rule := &model.CalculationRule{
		Value:  600,
		Factor: 0.5,
	}
	result := rule.Calculate(480)
	expected := decimal.NewFromInt(300)
	assert.True(t, result.Equal(expected), "expected %s, got %s", expected, result)
}

func TestCalculationRule_Calculate_ZeroTarget(t *testing.T) {
	// When value=0 and target=0: 0 * 1.0 = 0
	rule := &model.CalculationRule{
		Value:  0,
		Factor: 1.0,
	}
	result := rule.Calculate(0)
	expected := decimal.NewFromInt(0)
	assert.True(t, result.Equal(expected), "expected %s, got %s", expected, result)
}

func TestCalculationRule_Calculate_PartTimeTarget(t *testing.T) {
	// Part-time employee: 6h day = 360 min
	// Full day absence: 360 * 1.0 = 360
	rule := &model.CalculationRule{
		Value:  0,
		Factor: 1.0,
	}
	result := rule.Calculate(360)
	expected := decimal.NewFromInt(360)
	assert.True(t, result.Equal(expected), "expected %s, got %s", expected, result)
}
