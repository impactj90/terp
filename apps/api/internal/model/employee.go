package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type Employee struct {
	ID                  uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID            uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
	PersonnelNumber     string          `gorm:"type:varchar(50);not null" json:"personnel_number"`
	PIN                 string          `gorm:"type:varchar(20);not null" json:"pin,omitempty"`
	FirstName           string          `gorm:"type:varchar(100);not null" json:"first_name"`
	LastName            string          `gorm:"type:varchar(100);not null" json:"last_name"`
	Email               string          `gorm:"type:varchar(255)" json:"email,omitempty"`
	Phone               string          `gorm:"type:varchar(50)" json:"phone,omitempty"`
	EntryDate           time.Time       `gorm:"type:date;not null" json:"entry_date"`
	ExitDate            *time.Time      `gorm:"type:date" json:"exit_date,omitempty"`
	DepartmentID        *uuid.UUID      `gorm:"type:uuid;index" json:"department_id,omitempty"`
	CostCenterID        *uuid.UUID      `gorm:"type:uuid" json:"cost_center_id,omitempty"`
	EmploymentTypeID    *uuid.UUID      `gorm:"type:uuid" json:"employment_type_id,omitempty"`
	TariffID            *uuid.UUID      `gorm:"type:uuid;index" json:"tariff_id,omitempty"`
	WeeklyHours         decimal.Decimal `gorm:"type:decimal(5,2);default:40.00" json:"weekly_hours"`
	VacationDaysPerYear decimal.Decimal `gorm:"type:decimal(5,2);default:30.00" json:"vacation_days_per_year"`
	IsActive            bool            `gorm:"default:true" json:"is_active"`

	// Extended personnel master data (ZMI-TICKET-004)
	ExitReason     string     `gorm:"type:varchar(255)" json:"exit_reason,omitempty"`
	Notes          string     `gorm:"type:text" json:"notes,omitempty"`
	AddressStreet  string     `gorm:"type:varchar(255)" json:"address_street,omitempty"`
	AddressZip     string     `gorm:"type:varchar(20)" json:"address_zip,omitempty"`
	AddressCity    string     `gorm:"type:varchar(100)" json:"address_city,omitempty"`
	AddressCountry string     `gorm:"type:varchar(100)" json:"address_country,omitempty"`
	BirthDate      *time.Time `gorm:"type:date" json:"birth_date,omitempty"`
	Gender         string     `gorm:"type:varchar(20)" json:"gender,omitempty"`
	Nationality    string     `gorm:"type:varchar(100)" json:"nationality,omitempty"`
	Religion       string     `gorm:"type:varchar(100)" json:"religion,omitempty"`
	MaritalStatus  string     `gorm:"type:varchar(50)" json:"marital_status,omitempty"`
	BirthPlace     string     `gorm:"type:varchar(100)" json:"birth_place,omitempty"`
	BirthCountry   string     `gorm:"type:varchar(100)" json:"birth_country,omitempty"`
	RoomNumber     string     `gorm:"type:varchar(50)" json:"room_number,omitempty"`
	PhotoURL       string     `gorm:"type:varchar(500)" json:"photo_url,omitempty"`

	// Group FKs
	EmployeeGroupID *uuid.UUID `gorm:"type:uuid;index" json:"employee_group_id,omitempty"`
	WorkflowGroupID *uuid.UUID `gorm:"type:uuid;index" json:"workflow_group_id,omitempty"`
	ActivityGroupID *uuid.UUID `gorm:"type:uuid;index" json:"activity_group_id,omitempty"`

	// Order-related FKs (ZMI Auftrag: Stammauftrag, Stammtaetigkeit)
	DefaultOrderID    *uuid.UUID `gorm:"type:uuid;index" json:"default_order_id,omitempty"`
	DefaultActivityID *uuid.UUID `gorm:"type:uuid;index" json:"default_activity_id,omitempty"`

	// Tariff-related override fields (ZMI section 14.2)
	PartTimePercent    *decimal.Decimal `gorm:"type:decimal(5,2)" json:"part_time_percent,omitempty"`
	DisabilityFlag     bool             `gorm:"default:false" json:"disability_flag"`
	DailyTargetHours   *decimal.Decimal `gorm:"type:decimal(5,2)" json:"daily_target_hours,omitempty"`
	WeeklyTargetHours  *decimal.Decimal `gorm:"type:decimal(5,2)" json:"weekly_target_hours,omitempty"`
	MonthlyTargetHours *decimal.Decimal `gorm:"type:decimal(7,2)" json:"monthly_target_hours,omitempty"`
	AnnualTargetHours  *decimal.Decimal `gorm:"type:decimal(8,2)" json:"annual_target_hours,omitempty"`
	WorkDaysPerWeek    *decimal.Decimal `gorm:"type:decimal(3,1)" json:"work_days_per_week,omitempty"`

	// System-managed
	CalculationStartDate *time.Time `gorm:"type:date" json:"calculation_start_date,omitempty"`

	CreatedAt time.Time      `gorm:"default:now()" json:"created_at"`
	UpdatedAt time.Time      `gorm:"default:now()" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`

	// Relations
	Tenant          *Tenant           `gorm:"foreignKey:TenantID" json:"tenant,omitempty"`
	Department      *Department       `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`
	CostCenter      *CostCenter       `gorm:"foreignKey:CostCenterID" json:"cost_center,omitempty"`
	EmploymentType  *EmploymentType   `gorm:"foreignKey:EmploymentTypeID" json:"employment_type,omitempty"`
	Tariff          *Tariff           `gorm:"foreignKey:TariffID" json:"tariff,omitempty"`
	EmployeeGroup   *EmployeeGroup    `gorm:"foreignKey:EmployeeGroupID" json:"employee_group,omitempty"`
	WorkflowGroup   *WorkflowGroup    `gorm:"foreignKey:WorkflowGroupID" json:"workflow_group,omitempty"`
	ActivityGroup   *ActivityGroup    `gorm:"foreignKey:ActivityGroupID" json:"activity_group,omitempty"`
	DefaultOrder    *Order            `gorm:"foreignKey:DefaultOrderID" json:"default_order,omitempty"`
	DefaultActivity *Activity         `gorm:"foreignKey:DefaultActivityID" json:"default_activity,omitempty"`
	Contacts        []EmployeeContact `gorm:"foreignKey:EmployeeID" json:"contacts,omitempty"`
	Cards           []EmployeeCard    `gorm:"foreignKey:EmployeeID" json:"cards,omitempty"`
	User            *User             `gorm:"foreignKey:EmployeeID" json:"user,omitempty"`
}

func (Employee) TableName() string {
	return "employees"
}

// FullName returns first name + last name
func (e *Employee) FullName() string {
	return e.FirstName + " " + e.LastName
}

// IsEmployed returns true if currently employed (no exit date or exit date in future)
func (e *Employee) IsEmployed() bool {
	if e.ExitDate == nil {
		return true
	}
	return e.ExitDate.After(time.Now())
}

type EmployeeContact struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	EmployeeID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
	ContactType   string     `gorm:"type:varchar(50);not null" json:"contact_type"`
	ContactKindID *uuid.UUID `gorm:"type:uuid;index" json:"contact_kind_id,omitempty"`
	Value         string     `gorm:"type:varchar(255);not null" json:"value"`
	Label         string     `gorm:"type:varchar(100)" json:"label,omitempty"`
	IsPrimary     bool       `gorm:"default:false" json:"is_primary"`
	CreatedAt     time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt     time.Time  `gorm:"default:now()" json:"updated_at"`

	// Relations
	ContactKind *ContactKind `gorm:"foreignKey:ContactKindID" json:"contact_kind,omitempty"`
}

func (EmployeeContact) TableName() string {
	return "employee_contacts"
}

type EmployeeCard struct {
	ID                 uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TenantID           uuid.UUID  `gorm:"type:uuid;not null;index" json:"tenant_id"`
	EmployeeID         uuid.UUID  `gorm:"type:uuid;not null;index" json:"employee_id"`
	CardNumber         string     `gorm:"type:varchar(100);not null" json:"card_number"`
	CardType           string     `gorm:"type:varchar(50);default:'rfid'" json:"card_type"`
	ValidFrom          time.Time  `gorm:"type:date;not null" json:"valid_from"`
	ValidTo            *time.Time `gorm:"type:date" json:"valid_to,omitempty"`
	IsActive           bool       `gorm:"default:true" json:"is_active"`
	DeactivatedAt      *time.Time `json:"deactivated_at,omitempty"`
	DeactivationReason string     `gorm:"type:varchar(255)" json:"deactivation_reason,omitempty"`
	CreatedAt          time.Time  `gorm:"default:now()" json:"created_at"`
	UpdatedAt          time.Time  `gorm:"default:now()" json:"updated_at"`
}

func (EmployeeCard) TableName() string {
	return "employee_cards"
}

// IsValid returns true if card is currently valid
func (c *EmployeeCard) IsValid() bool {
	if !c.IsActive {
		return false
	}
	now := time.Now()
	if c.ValidFrom.After(now) {
		return false
	}
	if c.ValidTo != nil && c.ValidTo.Before(now) {
		return false
	}
	return true
}
