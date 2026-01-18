# TICKET-104: Create Report Models + Repository

**Type**: Model/Repository
**Effort**: S
**Sprint**: 26 - Reports
**Dependencies**: TICKET-103

## Description

Create the ReportTemplate and ReportRun models and repositories.

## Files to Create

- `apps/api/internal/model/report.go`
- `apps/api/internal/repository/report.go`

## Implementation

### Model

```go
package model

import (
    "encoding/json"
    "time"

    "github.com/google/uuid"
)

type ReportType string

const (
    ReportTypeDailySummary    ReportType = "daily_summary"
    ReportTypeMonthlySummary  ReportType = "monthly_summary"
    ReportTypeAbsenceOverview ReportType = "absence_overview"
    ReportTypeVacationBalance ReportType = "vacation_balance"
    ReportTypeOvertimeSummary ReportType = "overtime_summary"
    ReportTypeEmployeeList    ReportType = "employee_list"
    ReportTypeBookingDetail   ReportType = "booking_detail"
    ReportTypeErrorReport     ReportType = "error_report"
    ReportTypeCustom          ReportType = "custom"
)

type OutputFormat string

const (
    OutputFormatPDF  OutputFormat = "pdf"
    OutputFormatXLSX OutputFormat = "xlsx"
    OutputFormatCSV  OutputFormat = "csv"
)

type ReportStatus string

const (
    ReportStatusPending   ReportStatus = "pending"
    ReportStatusRunning   ReportStatus = "running"
    ReportStatusCompleted ReportStatus = "completed"
    ReportStatusFailed    ReportStatus = "failed"
)

type ReportTemplate struct {
    ID          uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID    uuid.UUID       `gorm:"type:uuid;not null;index" json:"tenant_id"`
    Name        string          `gorm:"type:varchar(100);not null" json:"name"`
    Description string          `gorm:"type:text" json:"description,omitempty"`
    ReportType  ReportType      `gorm:"type:varchar(50);not null" json:"report_type"`

    Config       json.RawMessage `gorm:"type:jsonb;default:'{}'" json:"config"`
    Columns      json.RawMessage `gorm:"type:jsonb" json:"columns,omitempty"`
    Filters      json.RawMessage `gorm:"type:jsonb" json:"filters,omitempty"`
    Grouping     json.RawMessage `gorm:"type:jsonb" json:"grouping,omitempty"`
    Sorting      json.RawMessage `gorm:"type:jsonb" json:"sorting,omitempty"`

    OutputFormat OutputFormat `gorm:"type:varchar(20);default:'pdf'" json:"output_format"`
    IsActive     bool         `gorm:"default:true" json:"is_active"`

    CreatedBy *uuid.UUID `gorm:"type:uuid" json:"created_by,omitempty"`
    CreatedAt time.Time  `gorm:"default:now()" json:"created_at"`
    UpdatedAt time.Time  `gorm:"default:now()" json:"updated_at"`
}

func (ReportTemplate) TableName() string {
    return "report_templates"
}

type ReportRun struct {
    ID         uuid.UUID    `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
    TenantID   uuid.UUID    `gorm:"type:uuid;not null;index" json:"tenant_id"`
    TemplateID *uuid.UUID   `gorm:"type:uuid" json:"template_id,omitempty"`
    ReportType ReportType   `gorm:"type:varchar(50);not null" json:"report_type"`

    Parameters json.RawMessage `gorm:"type:jsonb;default:'{}'" json:"parameters"`
    DateFrom   *time.Time      `gorm:"type:date" json:"date_from,omitempty"`
    DateTo     *time.Time      `gorm:"type:date" json:"date_to,omitempty"`

    Status       ReportStatus `gorm:"type:varchar(20);default:'pending'" json:"status"`
    ErrorMessage string       `gorm:"type:text" json:"error_message,omitempty"`

    OutputFormat OutputFormat `gorm:"type:varchar(20);not null" json:"output_format"`
    FilePath     string       `gorm:"type:text" json:"file_path,omitempty"`
    FileSize     int          `gorm:"type:int" json:"file_size,omitempty"`
    RowCount     int          `gorm:"type:int" json:"row_count,omitempty"`

    StartedAt   *time.Time `json:"started_at,omitempty"`
    CompletedAt *time.Time `json:"completed_at,omitempty"`
    DurationMs  int        `gorm:"type:int" json:"duration_ms,omitempty"`

    RunBy     *uuid.UUID `gorm:"type:uuid" json:"run_by,omitempty"`
    CreatedAt time.Time  `gorm:"default:now()" json:"created_at"`

    // Relations
    Template *ReportTemplate `gorm:"foreignKey:TemplateID" json:"template,omitempty"`
}

func (ReportRun) TableName() string {
    return "report_runs"
}

// IsComplete returns true if report finished (success or failure)
func (r *ReportRun) IsComplete() bool {
    return r.Status == ReportStatusCompleted || r.Status == ReportStatusFailed
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

type ReportTemplateRepository interface {
    Create(ctx context.Context, template *model.ReportTemplate) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.ReportTemplate, error)
    Update(ctx context.Context, template *model.ReportTemplate) error
    Delete(ctx context.Context, id uuid.UUID) error
    ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]model.ReportTemplate, error)
    ListByType(ctx context.Context, tenantID uuid.UUID, reportType model.ReportType) ([]model.ReportTemplate, error)
}

type ReportRunRepository interface {
    Create(ctx context.Context, run *model.ReportRun) error
    GetByID(ctx context.Context, id uuid.UUID) (*model.ReportRun, error)
    Update(ctx context.Context, run *model.ReportRun) error
    ListByTenant(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.ReportRun, int64, error)
    ListPending(ctx context.Context) ([]model.ReportRun, error)
    MarkRunning(ctx context.Context, id uuid.UUID) error
    MarkCompleted(ctx context.Context, id uuid.UUID, filePath string, fileSize, rowCount int) error
    MarkFailed(ctx context.Context, id uuid.UUID, errorMessage string) error
    DeleteOlderThan(ctx context.Context, tenantID uuid.UUID, before time.Time) (int64, error)
}

type reportTemplateRepository struct {
    db *gorm.DB
}

func NewReportTemplateRepository(db *gorm.DB) ReportTemplateRepository {
    return &reportTemplateRepository{db: db}
}

func (r *reportTemplateRepository) Create(ctx context.Context, template *model.ReportTemplate) error {
    return r.db.WithContext(ctx).Create(template).Error
}

func (r *reportTemplateRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ReportTemplate, error) {
    var template model.ReportTemplate
    err := r.db.WithContext(ctx).First(&template, "id = ?", id).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &template, err
}

func (r *reportTemplateRepository) Update(ctx context.Context, template *model.ReportTemplate) error {
    return r.db.WithContext(ctx).Save(template).Error
}

func (r *reportTemplateRepository) Delete(ctx context.Context, id uuid.UUID) error {
    return r.db.WithContext(ctx).Delete(&model.ReportTemplate{}, "id = ?", id).Error
}

func (r *reportTemplateRepository) ListByTenant(ctx context.Context, tenantID uuid.UUID) ([]model.ReportTemplate, error) {
    var templates []model.ReportTemplate
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND is_active = true", tenantID).
        Order("name ASC").
        Find(&templates).Error
    return templates, err
}

func (r *reportTemplateRepository) ListByType(ctx context.Context, tenantID uuid.UUID, reportType model.ReportType) ([]model.ReportTemplate, error) {
    var templates []model.ReportTemplate
    err := r.db.WithContext(ctx).
        Where("tenant_id = ? AND report_type = ? AND is_active = true", tenantID, reportType).
        Order("name ASC").
        Find(&templates).Error
    return templates, err
}

type reportRunRepository struct {
    db *gorm.DB
}

func NewReportRunRepository(db *gorm.DB) ReportRunRepository {
    return &reportRunRepository{db: db}
}

func (r *reportRunRepository) Create(ctx context.Context, run *model.ReportRun) error {
    return r.db.WithContext(ctx).Create(run).Error
}

func (r *reportRunRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ReportRun, error) {
    var run model.ReportRun
    err := r.db.WithContext(ctx).Preload("Template").First(&run, "id = ?", id).Error
    if err == gorm.ErrRecordNotFound {
        return nil, nil
    }
    return &run, err
}

func (r *reportRunRepository) Update(ctx context.Context, run *model.ReportRun) error {
    return r.db.WithContext(ctx).Save(run).Error
}

func (r *reportRunRepository) ListByTenant(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.ReportRun, int64, error) {
    var runs []model.ReportRun
    var total int64

    query := r.db.WithContext(ctx).Model(&model.ReportRun{}).Where("tenant_id = ?", tenantID)

    if err := query.Count(&total).Error; err != nil {
        return nil, 0, err
    }

    err := query.Order("created_at DESC").
        Limit(limit).
        Offset(offset).
        Preload("Template").
        Find(&runs).Error

    return runs, total, err
}

func (r *reportRunRepository) ListPending(ctx context.Context) ([]model.ReportRun, error) {
    var runs []model.ReportRun
    err := r.db.WithContext(ctx).
        Where("status = ?", model.ReportStatusPending).
        Order("created_at ASC").
        Find(&runs).Error
    return runs, err
}

func (r *reportRunRepository) MarkRunning(ctx context.Context, id uuid.UUID) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.ReportRun{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "status":     model.ReportStatusRunning,
            "started_at": now,
        }).Error
}

func (r *reportRunRepository) MarkCompleted(ctx context.Context, id uuid.UUID, filePath string, fileSize, rowCount int) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.ReportRun{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "status":       model.ReportStatusCompleted,
            "completed_at": now,
            "file_path":    filePath,
            "file_size":    fileSize,
            "row_count":    rowCount,
            "duration_ms":  gorm.Expr("EXTRACT(EPOCH FROM (? - started_at)) * 1000", now),
        }).Error
}

func (r *reportRunRepository) MarkFailed(ctx context.Context, id uuid.UUID, errorMessage string) error {
    now := time.Now()
    return r.db.WithContext(ctx).
        Model(&model.ReportRun{}).
        Where("id = ?", id).
        Updates(map[string]interface{}{
            "status":        model.ReportStatusFailed,
            "completed_at":  now,
            "error_message": errorMessage,
        }).Error
}

func (r *reportRunRepository) DeleteOlderThan(ctx context.Context, tenantID uuid.UUID, before time.Time) (int64, error) {
    result := r.db.WithContext(ctx).
        Where("tenant_id = ? AND created_at < ?", tenantID, before).
        Delete(&model.ReportRun{})
    return result.RowsAffected, result.Error
}
```

## Acceptance Criteria

- [ ] Compiles without errors
- [ ] `make lint` passes
- [ ] MarkCompleted calculates duration
- [ ] IsComplete returns correct status
