package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/go-openapi/strfmt"
	"github.com/google/uuid"

	"github.com/tolga/terp/gen/models"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/timeutil"
)

// EvaluationService provides read-only evaluation queries.
type EvaluationService struct {
	dailyValueRepo *repository.DailyValueRepository
	bookingRepo    *repository.BookingRepository
	auditLogRepo   *repository.AuditLogRepository
}

// NewEvaluationService creates a new evaluation service.
func NewEvaluationService(
	dvRepo *repository.DailyValueRepository,
	bookingRepo *repository.BookingRepository,
	auditLogRepo *repository.AuditLogRepository,
) *EvaluationService {
	return &EvaluationService{
		dailyValueRepo: dvRepo,
		bookingRepo:    bookingRepo,
		auditLogRepo:   auditLogRepo,
	}
}

// --- DailyValue filter ---

// EvalDailyValueFilter defines the input for daily value evaluations.
type EvalDailyValueFilter struct {
	TenantID           uuid.UUID
	From               time.Time
	To                 time.Time
	EmployeeID         *uuid.UUID
	DepartmentID       *uuid.UUID
	HasErrors          *bool
	IncludeNoBookings  bool
	ScopeType          model.DataScopeType
	ScopeDepartmentIDs []uuid.UUID
	ScopeEmployeeIDs   []uuid.UUID
	Limit              int
	Page               int
}

// ListDailyValues returns daily value evaluations.
func (s *EvaluationService) ListDailyValues(ctx context.Context, f EvalDailyValueFilter) (*models.EvaluationDailyValueList, error) {
	offset := 0
	if f.Page > 1 {
		offset = (f.Page - 1) * f.Limit
	}

	from := f.From
	to := f.To
	opts := model.DailyValueListOptions{
		EmployeeID:         f.EmployeeID,
		DepartmentID:       f.DepartmentID,
		From:               &from,
		To:                 &to,
		HasErrors:          f.HasErrors,
		ScopeType:          f.ScopeType,
		ScopeDepartmentIDs: f.ScopeDepartmentIDs,
		ScopeEmployeeIDs:   f.ScopeEmployeeIDs,
		Limit:              f.Limit,
		Offset:             offset,
	}

	values, err := s.dailyValueRepo.ListAll(ctx, f.TenantID, opts)
	if err != nil {
		return nil, err
	}

	data := make([]*models.EvaluationDailyValue, 0, len(values))
	for _, dv := range values {
		data = append(data, mapDailyValueToEval(&dv))
	}

	result := &models.EvaluationDailyValueList{
		Data: data,
		Meta: &models.PaginationMeta{
			Limit: int64(f.Limit),
			Total: int64(len(data)),
		},
	}
	return result, nil
}

func mapDailyValueToEval(dv *model.DailyValue) *models.EvaluationDailyValue {
	id := strfmt.UUID(dv.ID.String())
	empID := strfmt.UUID(dv.EmployeeID.String())
	date := strfmt.Date(dv.ValueDate)

	item := &models.EvaluationDailyValue{
		ID:               &id,
		EmployeeID:       &empID,
		Date:             &date,
		Status:           string(dv.Status),
		TargetMinutes:    int64(dv.TargetTime),
		GrossMinutes:     int64(dv.GrossTime),
		NetMinutes:       int64(dv.NetTime),
		BreakMinutes:     int64(dv.BreakTime),
		OvertimeMinutes:  int64(dv.Overtime),
		UndertimeMinutes: int64(dv.Undertime),
		BalanceMinutes:   int64(dv.Balance()),
		BookingCount:     int64(dv.BookingCount),
		HasErrors:        dv.HasError,
	}

	if dv.FirstCome != nil {
		s := timeutil.MinutesToString(*dv.FirstCome)
		item.FirstCome = &s
	}
	if dv.LastGo != nil {
		s := timeutil.MinutesToString(*dv.LastGo)
		item.LastGo = &s
	}
	if dv.Employee != nil {
		item.Employee = mapEmployeeToSummary(dv.Employee)
	}

	return item
}

// --- Booking filter ---

// EvalBookingFilter defines the input for booking evaluations.
type EvalBookingFilter struct {
	TenantID           uuid.UUID
	From               time.Time
	To                 time.Time
	EmployeeID         *uuid.UUID
	DepartmentID       *uuid.UUID
	BookingTypeID      *uuid.UUID
	Source             *model.BookingSource
	Direction          *model.BookingDirection
	ScopeType          model.DataScopeType
	ScopeDepartmentIDs []uuid.UUID
	ScopeEmployeeIDs   []uuid.UUID
	Limit              int
	Page               int
}

// ListBookings returns booking evaluations.
func (s *EvaluationService) ListBookings(ctx context.Context, f EvalBookingFilter) (*models.EvaluationBookingList, error) {
	offset := 0
	if f.Page > 1 {
		offset = (f.Page - 1) * f.Limit
	}

	from := f.From
	to := f.To
	filter := repository.BookingFilter{
		TenantID:           f.TenantID,
		EmployeeID:         f.EmployeeID,
		DepartmentID:       f.DepartmentID,
		BookingTypeID:      f.BookingTypeID,
		StartDate:          &from,
		EndDate:            &to,
		Source:             f.Source,
		Direction:          f.Direction,
		ScopeType:          f.ScopeType,
		ScopeDepartmentIDs: f.ScopeDepartmentIDs,
		ScopeEmployeeIDs:   f.ScopeEmployeeIDs,
		Limit:              f.Limit,
		Offset:             offset,
	}

	bookings, total, err := s.bookingRepo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	data := make([]*models.EvaluationBooking, 0, len(bookings))
	for _, b := range bookings {
		data = append(data, mapBookingToEval(&b))
	}

	return &models.EvaluationBookingList{
		Data: data,
		Meta: &models.PaginationMeta{
			Limit: int64(f.Limit),
			Total: total,
		},
	}, nil
}

func mapBookingToEval(b *model.Booking) *models.EvaluationBooking {
	id := strfmt.UUID(b.ID.String())
	empID := strfmt.UUID(b.EmployeeID.String())
	bDate := strfmt.Date(b.BookingDate)
	editedTime := int64(b.EditedTime)

	item := &models.EvaluationBooking{
		ID:            &id,
		EmployeeID:    &empID,
		BookingDate:   &bDate,
		BookingTypeID: strfmt.UUID(b.BookingTypeID.String()),
		OriginalTime:  int64(b.OriginalTime),
		EditedTime:    &editedTime,
		TimeString:    b.TimeString(),
		Source:        string(b.Source),
		CreatedAt:     strfmt.DateTime(b.CreatedAt),
	}

	if b.CalculatedTime != nil {
		ct := int64(*b.CalculatedTime)
		item.CalculatedTime = &ct
	}
	if b.PairID != nil {
		pid := strfmt.UUID(b.PairID.String())
		item.PairID = &pid
	}
	if b.TerminalID != nil {
		tid := strfmt.UUID(b.TerminalID.String())
		item.TerminalID = &tid
	}
	if b.Notes != "" {
		item.Notes = &b.Notes
	}
	if b.Employee != nil {
		item.Employee = mapEmployeeToSummary(b.Employee)
	}
	if b.BookingType != nil {
		item.BookingType = mapBookingTypeToSummary(b.BookingType)
	}

	return item
}

// --- Terminal Bookings ---

// EvalTerminalBookingFilter defines the input for terminal booking evaluations.
type EvalTerminalBookingFilter struct {
	TenantID           uuid.UUID
	From               time.Time
	To                 time.Time
	EmployeeID         *uuid.UUID
	DepartmentID       *uuid.UUID
	ScopeType          model.DataScopeType
	ScopeDepartmentIDs []uuid.UUID
	ScopeEmployeeIDs   []uuid.UUID
	Limit              int
	Page               int
}

// ListTerminalBookings returns terminal booking evaluations (source='terminal').
func (s *EvaluationService) ListTerminalBookings(ctx context.Context, f EvalTerminalBookingFilter) (*models.EvaluationTerminalBookingList, error) {
	offset := 0
	if f.Page > 1 {
		offset = (f.Page - 1) * f.Limit
	}

	from := f.From
	to := f.To
	terminalSource := model.BookingSourceTerminal
	filter := repository.BookingFilter{
		TenantID:           f.TenantID,
		EmployeeID:         f.EmployeeID,
		DepartmentID:       f.DepartmentID,
		StartDate:          &from,
		EndDate:            &to,
		Source:             &terminalSource,
		ScopeType:          f.ScopeType,
		ScopeDepartmentIDs: f.ScopeDepartmentIDs,
		ScopeEmployeeIDs:   f.ScopeEmployeeIDs,
		Limit:              f.Limit,
		Offset:             offset,
	}

	bookings, total, err := s.bookingRepo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	data := make([]*models.EvaluationTerminalBooking, 0, len(bookings))
	for _, b := range bookings {
		data = append(data, mapTerminalBookingToEval(&b))
	}

	return &models.EvaluationTerminalBookingList{
		Data: data,
		Meta: &models.PaginationMeta{
			Limit: int64(f.Limit),
			Total: total,
		},
	}, nil
}

func mapTerminalBookingToEval(b *model.Booking) *models.EvaluationTerminalBooking {
	id := strfmt.UUID(b.ID.String())
	empID := strfmt.UUID(b.EmployeeID.String())
	bDate := strfmt.Date(b.BookingDate)
	origTime := int64(b.OriginalTime)
	editedTime := int64(b.EditedTime)

	item := &models.EvaluationTerminalBooking{
		ID:                 &id,
		EmployeeID:         &empID,
		BookingDate:        &bDate,
		BookingTypeID:      strfmt.UUID(b.BookingTypeID.String()),
		OriginalTime:       &origTime,
		OriginalTimeString: timeutil.MinutesToString(b.OriginalTime),
		EditedTime:         &editedTime,
		EditedTimeString:   timeutil.MinutesToString(b.EditedTime),
		WasEdited:          b.IsEdited(),
		Source:             string(b.Source),
		CreatedAt:          strfmt.DateTime(b.CreatedAt),
	}

	if b.CalculatedTime != nil {
		ct := int64(*b.CalculatedTime)
		item.CalculatedTime = &ct
	}
	if b.TerminalID != nil {
		tid := strfmt.UUID(b.TerminalID.String())
		item.TerminalID = &tid
	}
	if b.Employee != nil {
		item.Employee = mapEmployeeToSummary(b.Employee)
	}
	if b.BookingType != nil {
		item.BookingType = mapBookingTypeToSummary(b.BookingType)
	}

	return item
}

// --- Log Entries ---

// EvalLogFilter defines the input for log evaluations.
type EvalLogFilter struct {
	TenantID     uuid.UUID
	From         time.Time
	To           time.Time
	EmployeeID   *uuid.UUID
	DepartmentID *uuid.UUID
	EntityType   *string
	Action       *string
	UserID       *uuid.UUID
	Limit        int
	Page         int
}

// ListLogs returns change log evaluation entries.
func (s *EvaluationService) ListLogs(ctx context.Context, f EvalLogFilter) (*models.EvaluationLogEntryList, error) {
	offset := 0
	if f.Page > 1 {
		offset = (f.Page - 1) * f.Limit
	}

	from := f.From
	// Set 'to' to end of day
	to := f.To.Add(23*time.Hour + 59*time.Minute + 59*time.Second)

	filter := repository.AuditLogFilter{
		TenantID:   f.TenantID,
		UserID:     f.UserID,
		EntityType: f.EntityType,
		Action:     f.Action,
		From:       &from,
		To:         &to,
		Limit:      f.Limit,
		Offset:     offset,
	}

	logs, total, err := s.auditLogRepo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	data := make([]*models.EvaluationLogEntry, 0, len(logs))
	for _, l := range logs {
		data = append(data, mapAuditLogToLogEntry(&l))
	}

	return &models.EvaluationLogEntryList{
		Data: data,
		Meta: &models.PaginationMeta{
			Limit: int64(f.Limit),
			Total: total,
		},
	}, nil
}

func mapAuditLogToLogEntry(l *model.AuditLog) *models.EvaluationLogEntry {
	id := strfmt.UUID(l.ID.String())
	entityID := strfmt.UUID(l.EntityID.String())
	action := string(l.Action)
	performedAt := strfmt.DateTime(l.PerformedAt)

	item := &models.EvaluationLogEntry{
		ID:          &id,
		Action:      &action,
		EntityType:  &l.EntityType,
		EntityID:    &entityID,
		PerformedAt: &performedAt,
	}

	if l.EntityName != nil {
		item.EntityName = l.EntityName
	}
	if l.Changes != nil {
		var changes any
		if err := json.Unmarshal(l.Changes, &changes); err == nil {
			item.Changes = changes
		}
	}
	if l.UserID != nil {
		uid := strfmt.UUID(l.UserID.String())
		item.UserID = &uid
	}
	if l.User != nil {
		item.User = mapUserToSummary(l.User)
	}

	return item
}

// --- Workflow History ---

// EvalWorkflowFilter defines the input for workflow history evaluations.
type EvalWorkflowFilter struct {
	TenantID     uuid.UUID
	From         time.Time
	To           time.Time
	EmployeeID   *uuid.UUID
	DepartmentID *uuid.UUID
	EntityType   *string
	Action       *string
	Limit        int
	Page         int
}

// ListWorkflowHistory returns workflow history evaluation entries.
// Filters audit logs to workflow-relevant entity types and actions.
func (s *EvaluationService) ListWorkflowHistory(ctx context.Context, f EvalWorkflowFilter) (*models.EvaluationWorkflowEntryList, error) {
	offset := 0
	if f.Page > 1 {
		offset = (f.Page - 1) * f.Limit
	}

	from := f.From
	to := f.To.Add(23*time.Hour + 59*time.Minute + 59*time.Second)

	// Default entity types and actions for workflow if not specified
	var entityTypes []string
	if f.EntityType != nil {
		entityTypes = nil // single entity type filter will be used
	} else {
		entityTypes = []string{"absence", "monthly_value"}
	}

	var actions []string
	if f.Action != nil {
		actions = nil // single action filter will be used
	} else {
		actions = []string{"create", "approve", "reject", "close", "reopen"}
	}

	filter := repository.AuditLogFilter{
		TenantID:    f.TenantID,
		EntityType:  f.EntityType,
		EntityTypes: entityTypes,
		Action:      f.Action,
		Actions:     actions,
		From:        &from,
		To:          &to,
		Limit:       f.Limit,
		Offset:      offset,
	}

	logs, total, err := s.auditLogRepo.List(ctx, filter)
	if err != nil {
		return nil, err
	}

	data := make([]*models.EvaluationWorkflowEntry, 0, len(logs))
	for _, l := range logs {
		data = append(data, mapAuditLogToWorkflowEntry(&l))
	}

	return &models.EvaluationWorkflowEntryList{
		Data: data,
		Meta: &models.PaginationMeta{
			Limit: int64(f.Limit),
			Total: total,
		},
	}, nil
}

func mapAuditLogToWorkflowEntry(l *model.AuditLog) *models.EvaluationWorkflowEntry {
	id := strfmt.UUID(l.ID.String())
	entityID := strfmt.UUID(l.EntityID.String())
	action := string(l.Action)
	performedAt := strfmt.DateTime(l.PerformedAt)

	item := &models.EvaluationWorkflowEntry{
		ID:          &id,
		Action:      &action,
		EntityType:  &l.EntityType,
		EntityID:    &entityID,
		PerformedAt: &performedAt,
	}

	if l.EntityName != nil {
		item.EntityName = l.EntityName
	}
	if l.UserID != nil {
		uid := strfmt.UUID(l.UserID.String())
		item.UserID = &uid
	}
	if l.User != nil {
		item.User = mapUserToSummary(l.User)
	}
	if l.Metadata != nil {
		var metadata any
		if err := json.Unmarshal(l.Metadata, &metadata); err == nil {
			item.Metadata = metadata
		}
	}

	return item
}

// --- Shared mappers ---

func mapEmployeeToSummary(e *model.Employee) *models.EmployeeSummary {
	id := strfmt.UUID(e.ID.String())
	return &models.EmployeeSummary{
		ID:              &id,
		PersonnelNumber: &e.PersonnelNumber,
		FirstName:       &e.FirstName,
		LastName:        &e.LastName,
		IsActive:        e.IsActive,
	}
}

func mapBookingTypeToSummary(bt *model.BookingType) *models.BookingTypeSummary {
	id := strfmt.UUID(bt.ID.String())
	direction := string(bt.Direction)
	return &models.BookingTypeSummary{
		ID:        &id,
		Code:      &bt.Code,
		Name:      &bt.Name,
		Direction: &direction,
	}
}

func mapUserToSummary(u *model.User) *models.UserSummary {
	id := strfmt.UUID(u.ID.String())
	return &models.UserSummary{
		ID:          &id,
		DisplayName: &u.DisplayName,
	}
}
