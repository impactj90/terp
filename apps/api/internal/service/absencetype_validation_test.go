package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/service"
)

func TestValidateAbsenceType_ValidPortion(t *testing.T) {
	tests := []struct {
		name    string
		portion model.AbsencePortion
	}{
		{"none", model.AbsencePortionNone},
		{"full", model.AbsencePortionFull},
		{"half", model.AbsencePortionHalf},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{
				Code:     "U01",
				Category: model.AbsenceCategoryVacation,
				Portion:  tt.portion,
			}
			err := service.ValidateAbsenceType(at)
			assert.NoError(t, err)
		})
	}
}

func TestValidateAbsenceType_InvalidPortion(t *testing.T) {
	at := &model.AbsenceType{
		Code:     "U01",
		Category: model.AbsenceCategoryVacation,
		Portion:  model.AbsencePortion(99),
	}
	err := service.ValidateAbsenceType(at)
	assert.ErrorIs(t, err, service.ErrInvalidPortion)
}

func TestValidateAbsenceType_ValidCodePrefix(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		category model.AbsenceCategory
	}{
		{"vacation U", "U01", model.AbsenceCategoryVacation},
		{"illness K", "K01", model.AbsenceCategoryIllness},
		{"special S", "S01", model.AbsenceCategorySpecial},
		{"unpaid U", "UU", model.AbsenceCategoryUnpaid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{
				Code:     tt.code,
				Category: tt.category,
				Portion:  model.AbsencePortionFull,
			}
			err := service.ValidateAbsenceType(at)
			assert.NoError(t, err)
		})
	}
}

func TestValidateAbsenceType_InvalidCodePrefix(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		category model.AbsenceCategory
	}{
		{"vacation wrong prefix", "K01", model.AbsenceCategoryVacation},
		{"illness wrong prefix", "U01", model.AbsenceCategoryIllness},
		{"special wrong prefix", "U01", model.AbsenceCategorySpecial},
		{"unpaid wrong prefix", "K01", model.AbsenceCategoryUnpaid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			at := &model.AbsenceType{
				Code:     tt.code,
				Category: tt.category,
				Portion:  model.AbsencePortionFull,
			}
			err := service.ValidateAbsenceType(at)
			assert.ErrorIs(t, err, service.ErrInvalidCodePrefix)
		})
	}
}

func TestValidateAbsenceType_EmptyCode(t *testing.T) {
	at := &model.AbsenceType{
		Code:     "",
		Category: model.AbsenceCategoryVacation,
		Portion:  model.AbsencePortionFull,
	}
	err := service.ValidateAbsenceType(at)
	assert.Error(t, err)
}

func TestValidateAbsenceType_OtherCategory_AnyPrefix(t *testing.T) {
	// "other" category should accept any prefix
	at := &model.AbsenceType{
		Code:     "X01",
		Category: model.AbsenceCategory("other"),
		Portion:  model.AbsencePortionFull,
	}
	err := service.ValidateAbsenceType(at)
	assert.NoError(t, err)
}
