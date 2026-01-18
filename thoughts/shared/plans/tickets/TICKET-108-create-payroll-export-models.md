# TICKET-108: Create Payroll Export Models + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 27 - Payroll Export
**Dependencies**: TICKET-107

## Description

Create the PayrollExport and PayrollExportItem models and repositories.

## Files to Create

- `apps/api/internal/model/payrollexport.go`
- `apps/api/internal/repository/payrollexport.go`

## Implementation

### Model

```go
package model

import (
    "encoding/json"
    "time"

    "github.com/google/uuid"
    "github.com/shopspring/decimal"
)

type ExportFormat string

const (
    ExportFormatDATEV   ExportFormat = "datev"
    ExportFormatLexware ExportFormat = "lexware"
    ExportFormatSage    ExportFormat = "sage"
    ExportFormatCSV     ExportFormat = "csv"
    ExportFormatCustom  ExportFormat = "custom"
)

type ExportStatus string

const (
    ExportStatusPending    ExportStatus = "pending"
    ExportStatusProcessing ExportStatus = "processing"
    ExportStatusCompleted  ExportStatus = "completed"
    ExportStatusFailed     ExportStatus = "failed"
)

type PayrollExport struct {
    ID         uuid.UUID    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID    `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Year       int          `gorm:"not null" json:"year"`
    Month      int          `gorm:"not null" json:"month"`

    ExportFormat ExportFormat    `gorm:"type:varchar(30);not null" json:"export_format"`
    Config       json.RawMessage `gorm:"type:jsonb;default:'{}'" json:"config"`

    Status       ExportStatus `gorm:"type:varchar(20);default:'pending'" json:"status"`
    ErrorMessage string       `gorm:"type:text" json:"error_message,omitempty"`

    FilePath    string `gorm:"type:text" json:"file_path,omitempty"`
    FileSize    int    `gorm:"type:int" json:"file_size,omitempty"`
    RecordCount int    `gorm:"type:int" json:"record_count,omitempty"`

    StartedAt   *time.Time `json:"started_at,omitempty"`
    CompletedAt *time.Time `json:"completed_at,omitempty"`

    CreatedBy uuid.UUID `gorm:"type:uuid;not null" json:"created_by"`
    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`

    // Relations
    Items []PayrollExportItem `gorm:"foreignKey:ExportID" json:"items,omitempty"`
}

func (PayrollExport) TableName() string {
    return "payroll_exports"
}

type PayrollExportItem struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    ExportID   uuid.UUID `gorm:"type:uuid;not null;index" json:"export_id"`
    EmployeeID uuid.UUID `gorm:"type:uuid;not null" json:"employee_id"`

    PersonnelNumber string `gorm:"type:varchar(50)" json:"personnel_number,omitempty"`
    CostCenter      string `gorm:"type:varchar(50)" json:"cost_center,omitempty"`

    TotalHours    int `gorm:"default:0" json:"total_hours"`
    OvertimeHours int `gorm:"default:0" json:"overtime_hours"`
    NightHours    int `gorm:"default:0" json:"night_hours"`
    SundayHours   int `gorm:"default:0" json:"sunday_hours"`
    HolidayHours  int `gorm:"default:0" json:"holiday_hours"`

    VacationDays     decimal.Decimal `gorm:"type:decimal(5,2);default:0" json:"vacation_days"`
    SickDays         int             `gorm:"default:0" json:"sick_days"`
    OtherAbsenceDays int             `gorm:"default:0" json:"other_absence_days"`

    RawData json.RawMessage `gorm:"type:jsonb" json:"raw_data,omitempty"`

    CreatedAt time.Time `gorm:"default:now()" json:"created_at"`

    // Relations
    Employee *Employee `gorm:"foreignKey:EmployeeID" json:"employee,omitempty"`
}

func (PayrollExportItem) TableName() string {
    return "payroll_export_items"
}
```

### Repository

```go
package repository

import (
    "context"
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"

    "terp/apps/api/internal/model"
)

type PayrollExportRepository interface {
    Create(ctx context.Context, export *model.PayrollExport) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error)
    GetByPeriod(ctx context.Context, tenantID uuid.UUID, year, month int, format model.ExportFormat) (*model.PayrollExport, error)
    Update(ctx context.Context, export *model.PayrollExport) error
    ListByTenant(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.PayrollExport, int64, error)
    MarkProcessing(ctx context.Context, id uuid.UUID) error
    MarkCompleted(ctx context.Context, id uuid.UUID, filePath string, fileSize, recordCount int) error
    MarkFailed(ctx context.Context, id uuid.UUID, errorMessage string) error
    AddItem(ctx context.Context, item *model.PayrollExportItem) error
    GetItems(ctx context.Context, exportID uuid.UUID) ([]model.PayrollExportItem, error)
}

type payrollExportRepository struct {
    db *gorm.DB
}

func NewPayrollExportRepository(db *gorm.DB) PayrollExportRepository {
    return &payrollExportRepository{db: db}
}

func (r *payrollExportRepository) Create(ctx context.Context, export *model.PayrollExport) error {
    return r.db.WithContext(ctx).Create(export).Error
}

func (r *payrollExportRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error) {
    var export model.PayrollExport
    err := r.db.WithContext(ctx).First(&export, "id = ?", id).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &export, err
}

func (r *payrollExportRepository) GetByPeriod(ctx context.Context, tenantID uuid.UUID, year, month int, format model.ExportFormat) (*model.PayrollExport, error) {
    var export model.PayrollExport
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND year = ? AND month = ? AND export_format = ?", tenantID, year, month, format).
        First(&export).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &export, err
}

func (r *payrollExportRepository) Update(ctx context.Context, export *model.PayrollExport) error {
    return r.db.WithContext(ctx).Save(export).Error
}

func (r *payrollExportRepository) ListByTenant(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.PayrollExport, int64, error) {
    var exports []model.PayrollExport
    var total int64

    query := r.db.WithContext(ctx).Model(&model.PayrollExport{}).Where("tenant_id = ?", tenantID)

    if err := query.Count(&total).Error; err != nil {
        return nil, 0, err
    }

    err := query.Order("created_at DESC").
        Limit(limit).
        Offset(offset).
        Find(&exports).Error

    return exports, total, err
}

func (r *payrollExportRepository) MarkProcessing(ctx context.Context, id uuid.UUID) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.PayrollExport{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "status":     model.ExportStatusProcessing,
            "started_at": now,
        }).Error
}

func (r *payrollExportRepository) MarkCompleted(ctx context.Context, id uuid.UUID, filePath string, fileSize, recordCount int) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.PayrollExport{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "status":       model.ExportStatusCompleted,
            "completed_at": now,
            "file_path":    filePath,
            "file_size":    fileSize,
            "record_count": recordCount,
        }).Error
}

func (r *payrollExportRepository) MarkFailed(ctx context.Context, id uuid.UUID, errorMessage string) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.PayrollExport{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "status":        model.ExportStatusFailed,
            "completed_at":  now,
            "error_message": errorMessage,
        }).Error
}

func (r *payrollExportRepository) AddItem(ctx context.Context, item *model.PayrollExportItem) error {
    return r.db.WithContext(ctx).Create(item).Error
}

func (r *payrollExportRepository) GetItems(ctx context.Context, exportID uuid.UUID) ([]model.PayrollExportItem, error) {
    var items []model.PayrollExportItem
    err := r.db.WithContext(ctx).
        Where("export_id = ?", exportID).
        Preload("Employee").
        Find(&items).Error
    return items, err
}
```

## Acceptance Criteria

- [ ] Compiles without errors
- [ ] `make lint` passes
- [ ] GetByPeriod finds existing export
- [ ] MarkCompleted updates all fields
