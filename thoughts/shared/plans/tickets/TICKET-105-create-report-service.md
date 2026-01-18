# TICKET-105: Create Report Service

**Type**: Service
**Effort**: L
**Sprint**: 26 - Reports
**Dependencies**: TICKET-104, TICKET-058

## Description

Create the report service for generating reports.

## Files to Create

- `apps/api/internal/service/report.go`

## Implementation

```go
package service

import (
    "context"
    "encoding/csv"
    "encoding/json"
    "errors"
    "fmt"
    "os"
    "path/filepath"
    "time"

    "github.com/google/uuid"

    "terp/apps/api/internal/model"
    "terp/apps/api/internal/repository"
)

var (
    ErrReportTemplateNotFound = errors.New("report template not found")
    ErrReportRunNotFound      = errors.New("report run not found")
    ErrInvalidDateRange       = errors.New("invalid date range")
)

type ReportService interface {
    // Templates
    CreateTemplate(ctx context.Context, template *model.ReportTemplate) error
    GetTemplate(ctx context.Context, id uuid.UUID) (*model.ReportTemplate, error)
    UpdateTemplate(ctx context.Context, template *model.ReportTemplate) error
    DeleteTemplate(ctx context.Context, id uuid.UUID) error
    ListTemplates(ctx context.Context, tenantID uuid.UUID) ([]model.ReportTemplate, error)

    // Report execution
    RunReport(ctx context.Context, params ReportParams) (*model.ReportRun, error)
    GetRun(ctx context.Context, id uuid.UUID) (*model.ReportRun, error)
    ListRuns(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.ReportRun, int64, error)
    DownloadReport(ctx context.Context, id uuid.UUID) (string, error)

    // Background processor
    ProcessPendingReports(ctx context.Context) error
}

type ReportParams struct {
    TenantID     uuid.UUID
    TemplateID   *uuid.UUID
    ReportType   model.ReportType
    Parameters   map[string]interface{}
    DateFrom     *time.Time
    DateTo       *time.Time
    OutputFormat model.OutputFormat
    RunBy        uuid.UUID
}

type reportService struct {
    templateRepo repository.ReportTemplateRepository
    runRepo      repository.ReportRunRepository
    dailyRepo    repository.DailyValueRepository
    monthlyRepo  repository.MonthlyValueRepository
    employeeRepo repository.EmployeeRepository
    absenceRepo  repository.AbsenceRepository
    outputDir    string
}

func NewReportService(
    templateRepo repository.ReportTemplateRepository,
    runRepo repository.ReportRunRepository,
    dailyRepo repository.DailyValueRepository,
    monthlyRepo repository.MonthlyValueRepository,
    employeeRepo repository.EmployeeRepository,
    absenceRepo repository.AbsenceRepository,
    outputDir string,
) ReportService {
    return &reportService{
        templateRepo: templateRepo,
        runRepo:      runRepo,
        dailyRepo:    dailyRepo,
        monthlyRepo:  monthlyRepo,
        employeeRepo: employeeRepo,
        absenceRepo:  absenceRepo,
        outputDir:    outputDir,
    }
}

func (s *reportService) CreateTemplate(ctx context.Context, template *model.ReportTemplate) error {
    return s.templateRepo.Create(ctx, template)
}

func (s *reportService) GetTemplate(ctx context.Context, id uuid.UUID) (*model.ReportTemplate, error) {
    template, err := s.templateRepo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    if template == nil {
        return nil, ErrReportTemplateNotFound
    }
    return template, nil
}

func (s *reportService) UpdateTemplate(ctx context.Context, template *model.ReportTemplate) error {
    return s.templateRepo.Update(ctx, template)
}

func (s *reportService) DeleteTemplate(ctx context.Context, id uuid.UUID) error {
    return s.templateRepo.Delete(ctx, id)
}

func (s *reportService) ListTemplates(ctx context.Context, tenantID uuid.UUID) ([]model.ReportTemplate, error) {
    return s.templateRepo.ListByTenant(ctx, tenantID)
}

func (s *reportService) RunReport(ctx context.Context, params ReportParams) (*model.ReportRun, error) {
    // Validate date range
    if params.DateFrom != nil && params.DateTo != nil {
        if params.DateFrom.After(*params.DateTo) {
            return nil, ErrInvalidDateRange
        }
    }

    // Create run record
    paramsJSON, _ := json.Marshal(params.Parameters)
    run := &model.ReportRun{
        TenantID:     params.TenantID,
        TemplateID:   params.TemplateID,
        ReportType:   params.ReportType,
        Parameters:   paramsJSON,
        DateFrom:     params.DateFrom,
        DateTo:       params.DateTo,
        Status:       model.ReportStatusPending,
        OutputFormat: params.OutputFormat,
        RunBy:        &params.RunBy,
    }

    if err := s.runRepo.Create(ctx, run); err != nil {
        return nil, err
    }

    return run, nil
}

func (s *reportService) GetRun(ctx context.Context, id uuid.UUID) (*model.ReportRun, error) {
    run, err := s.runRepo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    if run == nil {
        return nil, ErrReportRunNotFound
    }
    return run, nil
}

func (s *reportService) ListRuns(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.ReportRun, int64, error) {
    return s.runRepo.ListByTenant(ctx, tenantID, limit, offset)
}

func (s *reportService) DownloadReport(ctx context.Context, id uuid.UUID) (string, error) {
    run, err := s.GetRun(ctx, id)
    if err != nil {
        return "", err
    }
    if run.Status != model.ReportStatusCompleted {
        return "", errors.New("report not ready")
    }
    return run.FilePath, nil
}

func (s *reportService) ProcessPendingReports(ctx context.Context) error {
    runs, err := s.runRepo.ListPending(ctx)
    if err != nil {
        return err
    }

    for _, run := range runs {
        s.processReport(ctx, &run)
    }

    return nil
}

func (s *reportService) processReport(ctx context.Context, run *model.ReportRun) {
    // Mark as running
    s.runRepo.MarkRunning(ctx, run.ID)

    // Generate report based on type
    var filePath string
    var rowCount int
    var err error

    switch run.ReportType {
    case model.ReportTypeDailySummary:
        filePath, rowCount, err = s.generateDailySummary(ctx, run)
    case model.ReportTypeMonthlySummary:
        filePath, rowCount, err = s.generateMonthlySummary(ctx, run)
    case model.ReportTypeAbsenceOverview:
        filePath, rowCount, err = s.generateAbsenceOverview(ctx, run)
    default:
        err = fmt.Errorf("unsupported report type: %s", run.ReportType)
    }

    if err != nil {
        s.runRepo.MarkFailed(ctx, run.ID, err.Error())
        return
    }

    // Get file size
    fileInfo, _ := os.Stat(filePath)
    fileSize := int(fileInfo.Size())

    s.runRepo.MarkCompleted(ctx, run.ID, filePath, fileSize, rowCount)
}

func (s *reportService) generateDailySummary(ctx context.Context, run *model.ReportRun) (string, int, error) {
    if run.DateFrom == nil || run.DateTo == nil {
        return "", 0, errors.New("date range required")
    }

    // Get employees
    filter := repository.EmployeeFilter{TenantID: run.TenantID}
    employees, _, err := s.employeeRepo.List(ctx, filter)
    if err != nil {
        return "", 0, err
    }

    // Prepare output file
    filename := fmt.Sprintf("daily_summary_%s_%s.csv", run.DateFrom.Format("20060102"), run.DateTo.Format("20060102"))
    filePath := filepath.Join(s.outputDir, run.TenantID.String(), filename)
    os.MkdirAll(filepath.Dir(filePath), 0755)

    file, err := os.Create(filePath)
    if err != nil {
        return "", 0, err
    }
    defer file.Close()

    writer := csv.NewWriter(file)
    defer writer.Flush()

    // Header
    writer.Write([]string{"Date", "Employee", "Gross Time", "Net Time", "Target", "Overtime", "Undertime"})

    rowCount := 0
    for _, emp := range employees {
        dailyValues, _ := s.dailyRepo.GetByEmployeeDateRange(ctx, emp.ID, *run.DateFrom, *run.DateTo)
        for _, dv := range dailyValues {
            writer.Write([]string{
                dv.ValueDate.Format("2006-01-02"),
                emp.LastName + ", " + emp.FirstName,
                fmt.Sprintf("%d", dv.GrossTime),
                fmt.Sprintf("%d", dv.NetTime),
                fmt.Sprintf("%d", dv.TargetTime),
                fmt.Sprintf("%d", dv.Overtime),
                fmt.Sprintf("%d", dv.Undertime),
            })
            rowCount++
        }
    }

    return filePath, rowCount, nil
}

func (s *reportService) generateMonthlySummary(ctx context.Context, run *model.ReportRun) (string, int, error) {
    // Similar implementation for monthly data
    return "", 0, errors.New("not implemented")
}

func (s *reportService) generateAbsenceOverview(ctx context.Context, run *model.ReportRun) (string, int, error) {
    // Similar implementation for absence data
    return "", 0, errors.New("not implemented")
}
```

## Unit Tests

**File**: `apps/api/internal/service/report_test.go`

```go
package service

import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
)

// MockReportRunRepository for testing
type MockReportRunRepository struct {
    mock.Mock
}

func (m *MockReportRunRepository) Create(ctx context.Context, run *model.ReportRun) error {
    args := m.Called(ctx, run)
    run.ID = uuid.New()
    return args.Error(0)
}

func (m *MockReportRunRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.ReportRun, error) {
    args := m.Called(ctx, id)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.ReportRun), args.Error(1)
}

func (m *MockReportRunRepository) MarkCompleted(ctx context.Context, id uuid.UUID, filePath string, fileSize, rowCount int) error {
    args := m.Called(ctx, id, filePath, fileSize, rowCount)
    return args.Error(0)
}

func TestReportService_RunReport_ValidatesDateRange(t *testing.T) {
    svc := &reportService{}
    ctx := context.Background()

    from := time.Date(2024, 1, 10, 0, 0, 0, 0, time.UTC)
    to := time.Date(2024, 1, 5, 0, 0, 0, 0, time.UTC) // Before from

    params := ReportParams{
        DateFrom: &from,
        DateTo:   &to,
    }

    _, err := svc.RunReport(ctx, params)
    assert.Equal(t, ErrInvalidDateRange, err)
}

func TestReportService_RunReport_CreatesPendingRun(t *testing.T) {
    mockRunRepo := new(MockReportRunRepository)

    svc := &reportService{
        runRepo: mockRunRepo,
    }
    ctx := context.Background()

    mockRunRepo.On("Create", ctx, mock.MatchedBy(func(run *model.ReportRun) bool {
        return run.Status == model.ReportStatusPending
    })).Return(nil)

    params := ReportParams{
        TenantID:     uuid.New(),
        ReportType:   model.ReportTypeDailySummary,
        OutputFormat: model.OutputFormatCSV,
        RunBy:        uuid.New(),
    }

    run, err := svc.RunReport(ctx, params)
    require.NoError(t, err)
    assert.NotNil(t, run.ID)
    assert.Equal(t, model.ReportStatusPending, run.Status)
}

func TestReportService_DownloadReport_RequiresCompleted(t *testing.T) {
    mockRunRepo := new(MockReportRunRepository)

    svc := &reportService{
        runRepo: mockRunRepo,
    }
    ctx := context.Background()

    runID := uuid.New()
    pendingRun := &model.ReportRun{
        ID:     runID,
        Status: model.ReportStatusPending,
    }

    mockRunRepo.On("GetByID", ctx, runID).Return(pendingRun, nil)

    _, err := svc.DownloadReport(ctx, runID)
    assert.Error(t, err)
    assert.Contains(t, err.Error(), "not ready")
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] RunReport creates pending run
- [ ] ProcessPendingReports generates reports
- [ ] CSV output is correctly formatted
- [ ] MarkCompleted records file info
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
