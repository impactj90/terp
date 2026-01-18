# TICKET-109: Create Payroll Export Service

**Type**: Service
**Effort**: L
**Sprint**: 27 - Payroll Export
**Dependencies**: TICKET-108, TICKET-086

## Description

Create the payroll export service for generating payroll files.

## Files to Create

- `apps/api/internal/service/payroll_export.go`

## Implementation

```go
package service

import (
    "context"
    "encoding/csv"
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
    ErrExportNotFound     = errors.New("export not found")
    ErrExportAlreadyExists = errors.New("export already exists for this period")
    ErrMonthNotClosed     = errors.New("month must be closed before export")
)

type PayrollExportService interface {
    CreateExport(ctx context.Context, tenantID uuid.UUID, year, month int, format model.ExportFormat, createdBy uuid.UUID) (*model.PayrollExport, error)
    GetExport(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error)
    ListExports(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.PayrollExport, int64, error)
    ProcessExport(ctx context.Context, id uuid.UUID) error
    DownloadExport(ctx context.Context, id uuid.UUID) (string, error)
}

type payrollExportService struct {
    exportRepo   repository.PayrollExportRepository
    monthlyRepo  repository.MonthlyValueRepository
    employeeRepo repository.EmployeeRepository
    outputDir    string
}

func NewPayrollExportService(
    exportRepo repository.PayrollExportRepository,
    monthlyRepo repository.MonthlyValueRepository,
    employeeRepo repository.EmployeeRepository,
    outputDir string,
) PayrollExportService {
    return &payrollExportService{
        exportRepo:   exportRepo,
        monthlyRepo:  monthlyRepo,
        employeeRepo: employeeRepo,
        outputDir:    outputDir,
    }
}

func (s *payrollExportService) CreateExport(ctx context.Context, tenantID uuid.UUID, year, month int, format model.ExportFormat, createdBy uuid.UUID) (*model.PayrollExport, error) {
    // Check if export already exists
    existing, _ := s.exportRepo.GetByPeriod(ctx, tenantID, year, month, format)
    if existing != nil {
        return nil, ErrExportAlreadyExists
    }

    export := &model.PayrollExport{
        TenantID:     tenantID,
        Year:         year,
        Month:        month,
        ExportFormat: format,
        Status:       model.ExportStatusPending,
        CreatedBy:    createdBy,
    }

    if err := s.exportRepo.Create(ctx, export); err != nil {
        return nil, err
    }

    return export, nil
}

func (s *payrollExportService) GetExport(ctx context.Context, id uuid.UUID) (*model.PayrollExport, error) {
    export, err := s.exportRepo.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    if export == nil {
        return nil, ErrExportNotFound
    }
    return export, nil
}

func (s *payrollExportService) ListExports(ctx context.Context, tenantID uuid.UUID, limit, offset int) ([]model.PayrollExport, int64, error) {
    return s.exportRepo.ListByTenant(ctx, tenantID, limit, offset)
}

func (s *payrollExportService) ProcessExport(ctx context.Context, id uuid.UUID) error {
    export, err := s.GetExport(ctx, id)
    if err != nil {
        return err
    }

    // Mark as processing
    s.exportRepo.MarkProcessing(ctx, id)

    // Generate based on format
    var filePath string
    var recordCount int

    switch export.ExportFormat {
    case model.ExportFormatDATEV:
        filePath, recordCount, err = s.generateDATEV(ctx, export)
    case model.ExportFormatCSV:
        filePath, recordCount, err = s.generateCSV(ctx, export)
    default:
        err = fmt.Errorf("unsupported format: %s", export.ExportFormat)
    }

    if err != nil {
        s.exportRepo.MarkFailed(ctx, id, err.Error())
        return err
    }

    // Get file size
    fileInfo, _ := os.Stat(filePath)
    fileSize := int(fileInfo.Size())

    return s.exportRepo.MarkCompleted(ctx, id, filePath, fileSize, recordCount)
}

func (s *payrollExportService) DownloadExport(ctx context.Context, id uuid.UUID) (string, error) {
    export, err := s.GetExport(ctx, id)
    if err != nil {
        return "", err
    }
    if export.Status != model.ExportStatusCompleted {
        return "", errors.New("export not ready")
    }
    return export.FilePath, nil
}

func (s *payrollExportService) generateDATEV(ctx context.Context, export *model.PayrollExport) (string, int, error) {
    // Get employees with monthly values
    filter := repository.EmployeeFilter{TenantID: export.TenantID}
    employees, _, err := s.employeeRepo.List(ctx, filter)
    if err != nil {
        return "", 0, err
    }

    // Prepare output
    filename := fmt.Sprintf("DATEV_%04d%02d.csv", export.Year, export.Month)
    filePath := filepath.Join(s.outputDir, export.TenantID.String(), filename)
    os.MkdirAll(filepath.Dir(filePath), 0755)

    file, err := os.Create(filePath)
    if err != nil {
        return "", 0, err
    }
    defer file.Close()

    writer := csv.NewWriter(file)
    writer.Comma = ';' // DATEV uses semicolon
    defer writer.Flush()

    // DATEV header
    writer.Write([]string{
        "Personalnummer",
        "Lohnart",
        "Betrag",
        "Kostenstelle",
    })

    recordCount := 0
    for _, emp := range employees {
        monthly, _ := s.monthlyRepo.GetByEmployeeYearMonth(ctx, emp.ID, export.Year, export.Month)
        if monthly == nil {
            continue
        }

        // Store item
        item := &model.PayrollExportItem{
            ExportID:        export.ID,
            EmployeeID:      emp.ID,
            PersonnelNumber: emp.PersonnelNumber,
            CostCenter:      emp.CostCenter,
            TotalHours:      monthly.TotalNetTime / 60, // Convert to hours
            OvertimeHours:   monthly.TotalOvertime / 60,
            VacationDays:    monthly.VacationTaken,
            SickDays:        monthly.SickDays,
        }
        s.exportRepo.AddItem(ctx, item)

        // Regular hours (Lohnart 100)
        writer.Write([]string{
            emp.PersonnelNumber,
            "100",
            fmt.Sprintf("%.2f", float64(monthly.TotalNetTime)/60),
            emp.CostCenter,
        })
        recordCount++

        // Overtime (Lohnart 200)
        if monthly.TotalOvertime > 0 {
            writer.Write([]string{
                emp.PersonnelNumber,
                "200",
                fmt.Sprintf("%.2f", float64(monthly.TotalOvertime)/60),
                emp.CostCenter,
            })
            recordCount++
        }

        // Vacation (Lohnart 300)
        if monthly.VacationTaken.IsPositive() {
            writer.Write([]string{
                emp.PersonnelNumber,
                "300",
                monthly.VacationTaken.String(),
                emp.CostCenter,
            })
            recordCount++
        }

        // Sick days (Lohnart 400)
        if monthly.SickDays > 0 {
            writer.Write([]string{
                emp.PersonnelNumber,
                "400",
                fmt.Sprintf("%d", monthly.SickDays),
                emp.CostCenter,
            })
            recordCount++
        }
    }

    return filePath, recordCount, nil
}

func (s *payrollExportService) generateCSV(ctx context.Context, export *model.PayrollExport) (string, int, error) {
    // Similar to DATEV but standard CSV format
    filter := repository.EmployeeFilter{TenantID: export.TenantID}
    employees, _, err := s.employeeRepo.List(ctx, filter)
    if err != nil {
        return "", 0, err
    }

    filename := fmt.Sprintf("payroll_%04d%02d.csv", export.Year, export.Month)
    filePath := filepath.Join(s.outputDir, export.TenantID.String(), filename)
    os.MkdirAll(filepath.Dir(filePath), 0755)

    file, err := os.Create(filePath)
    if err != nil {
        return "", 0, err
    }
    defer file.Close()

    writer := csv.NewWriter(file)
    defer writer.Flush()

    // Header
    writer.Write([]string{
        "Personnel Number", "Last Name", "First Name", "Cost Center",
        "Total Hours", "Overtime Hours", "Vacation Days", "Sick Days",
    })

    recordCount := 0
    for _, emp := range employees {
        monthly, _ := s.monthlyRepo.GetByEmployeeYearMonth(ctx, emp.ID, export.Year, export.Month)
        if monthly == nil {
            continue
        }

        writer.Write([]string{
            emp.PersonnelNumber,
            emp.LastName,
            emp.FirstName,
            emp.CostCenter,
            fmt.Sprintf("%.2f", float64(monthly.TotalNetTime)/60),
            fmt.Sprintf("%.2f", float64(monthly.TotalOvertime)/60),
            monthly.VacationTaken.String(),
            fmt.Sprintf("%d", monthly.SickDays),
        })
        recordCount++
    }

    return filePath, recordCount, nil
}
```

## Unit Tests

**File**: `apps/api/internal/service/payroll_export_test.go`

```go
package service

import (
    "context"
    "testing"

    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/stretchr/testify/require"

    "terp/apps/api/internal/model"
)

// MockPayrollExportRepository for testing
type MockPayrollExportRepository struct {
    mock.Mock
}

func (m *MockPayrollExportRepository) GetByPeriod(ctx context.Context, tenantID uuid.UUID, year, month int, format model.ExportFormat) (*model.PayrollExport, error) {
    args := m.Called(ctx, tenantID, year, month, format)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*model.PayrollExport), args.Error(1)
}

func (m *MockPayrollExportRepository) Create(ctx context.Context, export *model.PayrollExport) error {
    args := m.Called(ctx, export)
    export.ID = uuid.New()
    return args.Error(0)
}

func (m *MockPayrollExportRepository) MarkCompleted(ctx context.Context, id uuid.UUID, filePath string, fileSize, recordCount int) error {
    args := m.Called(ctx, id, filePath, fileSize, recordCount)
    return args.Error(0)
}

func TestPayrollExportService_CreateExport_PreventsDuplicates(t *testing.T) {
    mockExportRepo := new(MockPayrollExportRepository)

    svc := NewPayrollExportService(mockExportRepo, nil, nil, "/tmp")
    ctx := context.Background()

    tenantID := uuid.New()
    year, month := 2024, 1

    existing := &model.PayrollExport{ID: uuid.New()}
    mockExportRepo.On("GetByPeriod", ctx, tenantID, year, month, model.ExportFormatDATEV).Return(existing, nil)

    _, err := svc.CreateExport(ctx, tenantID, year, month, model.ExportFormatDATEV, uuid.New())
    assert.Equal(t, ErrExportAlreadyExists, err)
}

func TestPayrollExportService_CreateExport_Success(t *testing.T) {
    mockExportRepo := new(MockPayrollExportRepository)

    svc := NewPayrollExportService(mockExportRepo, nil, nil, "/tmp")
    ctx := context.Background()

    tenantID := uuid.New()
    year, month := 2024, 1
    createdBy := uuid.New()

    mockExportRepo.On("GetByPeriod", ctx, tenantID, year, month, model.ExportFormatCSV).Return(nil, nil)
    mockExportRepo.On("Create", ctx, mock.MatchedBy(func(export *model.PayrollExport) bool {
        return export.Status == model.ExportStatusPending &&
               export.Year == year &&
               export.Month == month
    })).Return(nil)

    export, err := svc.CreateExport(ctx, tenantID, year, month, model.ExportFormatCSV, createdBy)
    require.NoError(t, err)
    assert.Equal(t, model.ExportStatusPending, export.Status)
    assert.Equal(t, year, export.Year)
    assert.Equal(t, month, export.Month)
}

func TestPayrollExportService_DownloadExport_RequiresCompleted(t *testing.T) {
    mockExportRepo := new(MockPayrollExportRepository)

    svc := &payrollExportService{
        exportRepo: mockExportRepo,
    }
    ctx := context.Background()

    exportID := uuid.New()
    pendingExport := &model.PayrollExport{
        ID:     exportID,
        Status: model.ExportStatusPending,
    }

    mockExportRepo.On("GetByID", ctx, exportID).Return(pendingExport, nil).Maybe()

    _, err := svc.DownloadExport(ctx, exportID)
    assert.Error(t, err)
}
```

## Acceptance Criteria

- [ ] `make test` passes
- [ ] CreateExport prevents duplicates
- [ ] DATEV format uses semicolon separator
- [ ] CSV includes all required fields
- [ ] ProcessExport stores items
- [ ] Unit tests with mocked repository
- [ ] Tests cover validation logic and error cases
