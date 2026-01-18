package model

import (
	"time"

	"github.com/google/uuid"
)

type WeekPlan struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID    uuid.UUID `gorm:"type:uuid;not null;index" json:"tenant_id"`
	Code        string    `gorm:"type:varchar(20);not null" json:"code"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`

	// Day plan IDs (nullable for off days)
	MondayDayPlanID    *uuid.UUID `gorm:"type:uuid" json:"monday_day_plan_id,omitempty"`
	TuesdayDayPlanID   *uuid.UUID `gorm:"type:uuid" json:"tuesday_day_plan_id,omitempty"`
	WednesdayDayPlanID *uuid.UUID `gorm:"type:uuid" json:"wednesday_day_plan_id,omitempty"`
	ThursdayDayPlanID  *uuid.UUID `gorm:"type:uuid" json:"thursday_day_plan_id,omitempty"`
	FridayDayPlanID    *uuid.UUID `gorm:"type:uuid" json:"friday_day_plan_id,omitempty"`
	SaturdayDayPlanID  *uuid.UUID `gorm:"type:uuid" json:"saturday_day_plan_id,omitempty"`
	SundayDayPlanID    *uuid.UUID `gorm:"type:uuid" json:"sunday_day_plan_id,omitempty"`

	IsActive  bool      `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time `gorm:"default:now()" json:"updated_at"`

	// Relations
	MondayDayPlan    *DayPlan `gorm:"foreignKey:MondayDayPlanID" json:"monday_day_plan,omitempty"`
	TuesdayDayPlan   *DayPlan `gorm:"foreignKey:TuesdayDayPlanID" json:"tuesday_day_plan,omitempty"`
	WednesdayDayPlan *DayPlan `gorm:"foreignKey:WednesdayDayPlanID" json:"wednesday_day_plan,omitempty"`
	ThursdayDayPlan  *DayPlan `gorm:"foreignKey:ThursdayDayPlanID" json:"thursday_day_plan,omitempty"`
	FridayDayPlan    *DayPlan `gorm:"foreignKey:FridayDayPlanID" json:"friday_day_plan,omitempty"`
	SaturdayDayPlan  *DayPlan `gorm:"foreignKey:SaturdayDayPlanID" json:"saturday_day_plan,omitempty"`
	SundayDayPlan    *DayPlan `gorm:"foreignKey:SundayDayPlanID" json:"sunday_day_plan,omitempty"`
}

func (WeekPlan) TableName() string {
	return "week_plans"
}

// GetDayPlanIDForWeekday returns the day plan ID for a given weekday (0=Sunday, 1=Monday, etc.)
func (wp *WeekPlan) GetDayPlanIDForWeekday(weekday time.Weekday) *uuid.UUID {
	switch weekday {
	case time.Monday:
		return wp.MondayDayPlanID
	case time.Tuesday:
		return wp.TuesdayDayPlanID
	case time.Wednesday:
		return wp.WednesdayDayPlanID
	case time.Thursday:
		return wp.ThursdayDayPlanID
	case time.Friday:
		return wp.FridayDayPlanID
	case time.Saturday:
		return wp.SaturdayDayPlanID
	case time.Sunday:
		return wp.SundayDayPlanID
	}
	return nil
}

// WorkDaysPerWeek returns the count of days with assigned plans
func (wp *WeekPlan) WorkDaysPerWeek() int {
	count := 0
	if wp.MondayDayPlanID != nil {
		count++
	}
	if wp.TuesdayDayPlanID != nil {
		count++
	}
	if wp.WednesdayDayPlanID != nil {
		count++
	}
	if wp.ThursdayDayPlanID != nil {
		count++
	}
	if wp.FridayDayPlanID != nil {
		count++
	}
	if wp.SaturdayDayPlanID != nil {
		count++
	}
	if wp.SundayDayPlanID != nil {
		count++
	}
	return count
}
