// Package handler handles all HTTP requests.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/model"
	"github.com/tolga/terp/internal/permissions"
	"github.com/tolga/terp/internal/service"
)

// bookingRepoForAuth defines the interface for booking data access in auth handler.
type bookingRepoForAuth interface {
	Upsert(ctx context.Context, booking *model.Booking) error
}

// dailyValueRepoForAuth defines the interface for daily value data access in auth handler.
type dailyValueRepoForAuth interface {
	Upsert(ctx context.Context, dv *model.DailyValue) error
}

// monthlyValueRepoForAuth defines the interface for monthly value data access in auth handler.
type monthlyValueRepoForAuth interface {
	Upsert(ctx context.Context, mv *model.MonthlyValue) error
}

// empDayPlanRepoForAuth defines the interface for employee day plan data access in auth handler.
type empDayPlanRepoForAuth interface {
	BulkCreate(ctx context.Context, plans []model.EmployeeDayPlan) error
}

// absenceDayRepoForAuth defines the interface for absence day data access in auth handler.
type absenceDayRepoForAuth interface {
	Upsert(ctx context.Context, ad *model.AbsenceDay) error
}

// vacationBalanceRepoForAuth defines the interface for vacation balance data access in auth handler.
type vacationBalanceRepoForAuth interface {
	Upsert(ctx context.Context, balance *model.VacationBalance) error
}

// accountRepoForAuth defines the interface for account data access in auth handler.
type accountRepoForAuth interface {
	Upsert(ctx context.Context, account *model.Account) error
}

// vacationConfigSeederForAuth defines the interface for seeding vacation config data in auth handler.
type vacationConfigSeederForAuth interface {
	SeedAll(ctx context.Context, tenantID uuid.UUID) error
}

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	jwtManager          *auth.JWTManager
	authConfig          *auth.Config
	userService         *service.UserService
	tenantService       *service.TenantService
	employeeService     *service.EmployeeService
	bookingTypeService  *service.BookingTypeService
	absenceService      *service.AbsenceService
	holidayService      *service.HolidayService
	dayPlanService      *service.DayPlanService
	weekPlanService     *service.WeekPlanService
	tariffService       *service.TariffService
	departmentService   *service.DepartmentService
	teamService         *service.TeamService
	bookingRepo         bookingRepoForAuth
	dailyValueRepo      dailyValueRepoForAuth
	monthlyValueRepo    monthlyValueRepoForAuth
	empDayPlanRepo      empDayPlanRepoForAuth
	absenceDayRepo      absenceDayRepoForAuth
	vacationBalanceRepo    vacationBalanceRepoForAuth
	accountRepo            accountRepoForAuth
	vacationConfigSeeder   vacationConfigSeederForAuth
}

// NewAuthHandler creates a new auth handler instance.
func NewAuthHandler(
	config *auth.Config,
	jwtManager *auth.JWTManager,
	userService *service.UserService,
	tenantService *service.TenantService,
	employeeService *service.EmployeeService,
	bookingTypeService *service.BookingTypeService,
	absenceService *service.AbsenceService,
	holidayService *service.HolidayService,
	dayPlanService *service.DayPlanService,
	weekPlanService *service.WeekPlanService,
	tariffService *service.TariffService,
	departmentService *service.DepartmentService,
	teamService *service.TeamService,
	bookingRepo bookingRepoForAuth,
	dailyValueRepo dailyValueRepoForAuth,
	monthlyValueRepo monthlyValueRepoForAuth,
	empDayPlanRepo empDayPlanRepoForAuth,
	absenceDayRepo absenceDayRepoForAuth,
	vacationBalanceRepo vacationBalanceRepoForAuth,
	accountRepo accountRepoForAuth,
	vacationConfigSeeder vacationConfigSeederForAuth,
) *AuthHandler {
	return &AuthHandler{
		jwtManager:           jwtManager,
		authConfig:           config,
		userService:          userService,
		tenantService:        tenantService,
		employeeService:      employeeService,
		bookingTypeService:   bookingTypeService,
		absenceService:       absenceService,
		holidayService:       holidayService,
		dayPlanService:       dayPlanService,
		weekPlanService:      weekPlanService,
		tariffService:        tariffService,
		departmentService:    departmentService,
		teamService:          teamService,
		bookingRepo:          bookingRepo,
		dailyValueRepo:       dailyValueRepo,
		monthlyValueRepo:     monthlyValueRepo,
		empDayPlanRepo:       empDayPlanRepo,
		absenceDayRepo:       absenceDayRepo,
		vacationBalanceRepo:  vacationBalanceRepo,
		accountRepo:          accountRepo,
		vacationConfigSeeder: vacationConfigSeeder,
	}
}

// DevLogin handles development-mode authentication.
// GET /auth/dev/login?role=admin|user
func (h *AuthHandler) DevLogin(w http.ResponseWriter, r *http.Request) {
	if !h.authConfig.IsDevMode() {
		respondError(w, http.StatusForbidden, "Dev login not available in production")
		return
	}

	roleStr := r.URL.Query().Get("role")
	if roleStr == "" {
		roleStr = "user"
	}

	devUser, ok := auth.GetDevUser(roleStr)
	if !ok {
		respondJSON(w, http.StatusBadRequest, map[string]any{
			"error":       "bad_request",
			"message":     "invalid role",
			"valid_roles": auth.ValidDevRoles(),
		})
		return
	}

	// Ensure dev tenant exists in database
	devTenant := auth.GetDevTenant()
	if err := h.tenantService.UpsertDevTenant(r.Context(), devTenant.ID, devTenant.Name, devTenant.Slug); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to sync dev tenant to database")
		return
	}

	// Ensure all dev users exist (so seeded data can reference any dev user IDs)
	for _, user := range auth.DevUsers {
		if err := h.userService.UpsertDevUser(r.Context(), user.ID, devTenant.ID, user.Email, user.DisplayName, model.UserRole(user.Role)); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev users to database")
			return
		}
	}

	// Create all dev booking types (system-level, idempotent)
	for _, devBT := range auth.GetDevBookingTypes() {
		desc := devBT.Description
		category := model.BookingCategory(devBT.Category)
		if category == "" {
			category = model.BookingCategoryWork
		}
		bt := &model.BookingType{
			ID:          devBT.ID,
			TenantID:    nil, // System-level
			Code:        devBT.Code,
			Name:        devBT.Name,
			Description: &desc,
			Direction:   model.BookingDirection(devBT.Direction),
			Category:    category,
			IsSystem:    true,
			IsActive:    devBT.IsActive,
		}
		if err := h.bookingTypeService.UpsertDevBookingType(r.Context(), bt); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev booking types to database")
			return
		}
	}

	// Create all dev absence types (tenant-level, idempotent)
	for _, devAT := range auth.GetDevAbsenceTypes() {
		desc := devAT.Description
		at := &model.AbsenceType{
			ID:              devAT.ID,
			TenantID:        &devTenant.ID,
			Code:            devAT.Code,
			Name:            devAT.Name,
			Description:     &desc,
			Category:        model.AbsenceCategory(devAT.Category),
			Portion:         model.AbsencePortion(devAT.Portion),
			DeductsVacation: devAT.DeductsVacation,
			Color:           devAT.Color,
			SortOrder:       devAT.SortOrder,
			IsSystem:        false,
			IsActive:        true,
		}
		if err := h.absenceService.UpsertDevAbsenceType(r.Context(), at); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev absence types to database")
			return
		}
	}

	// Create all dev holidays (tenant-level, idempotent)
	for _, devH := range auth.GetDevHolidays() {
		holiday := &model.Holiday{
			ID:           devH.ID,
			TenantID:     devTenant.ID,
			HolidayDate:  devH.HolidayDate,
			Name:         devH.Name,
			Category:     devH.Category,
			AppliesToAll: devH.AppliesToAll,
		}
		if err := h.holidayService.UpsertDevHoliday(r.Context(), holiday); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev holidays to database")
			return
		}
	}

	// Create all dev day plans (tenant-level, idempotent)
	for _, devDP := range auth.GetDevDayPlans() {
		desc := devDP.Description
		dayPlan := &model.DayPlan{
			ID:           devDP.ID,
			TenantID:     devTenant.ID,
			Code:         devDP.Code,
			Name:         devDP.Name,
			Description:  &desc,
			PlanType:     model.PlanType(devDP.PlanType),
			ComeFrom:     devDP.ComeFrom,
			ComeTo:       devDP.ComeTo,
			GoFrom:       devDP.GoFrom,
			GoTo:         devDP.GoTo,
			RegularHours: devDP.RegularHours,
			IsActive:     devDP.IsActive,
		}
		if err := h.dayPlanService.UpsertDevDayPlan(r.Context(), dayPlan); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev day plans to database")
			return
		}
	}

	// Create all dev week plans (tenant-level, idempotent)
	for _, devWP := range auth.GetDevWeekPlans() {
		desc := devWP.Description
		weekPlan := &model.WeekPlan{
			ID:                 devWP.ID,
			TenantID:           devTenant.ID,
			Code:               devWP.Code,
			Name:               devWP.Name,
			Description:        &desc,
			MondayDayPlanID:    &devWP.Monday,
			TuesdayDayPlanID:   &devWP.Tuesday,
			WednesdayDayPlanID: &devWP.Wednesday,
			ThursdayDayPlanID:  &devWP.Thursday,
			FridayDayPlanID:    &devWP.Friday,
			SaturdayDayPlanID:  &devWP.Saturday,
			SundayDayPlanID:    &devWP.Sunday,
			IsActive:           devWP.IsActive,
		}
		if err := h.weekPlanService.UpsertDevWeekPlan(r.Context(), weekPlan); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev week plans to database")
			return
		}
	}

	// Create all dev tariffs (tenant-level, idempotent)
	for _, devT := range auth.GetDevTariffs() {
		desc := devT.Description
		tariff := &model.Tariff{
			ID:                  devT.ID,
			TenantID:            devTenant.ID,
			Code:                devT.Code,
			Name:                devT.Name,
			Description:         &desc,
			WeekPlanID:          devT.WeekPlanID,
			IsActive:            devT.IsActive,
			AnnualVacationDays:  devT.AnnualVacationDays,
			WorkDaysPerWeek:     devT.WorkDaysPerWeek,
			VacationBasis:       model.VacationBasis(devT.VacationBasis),
			DailyTargetHours:    devT.DailyTargetHours,
			WeeklyTargetHours:   devT.WeeklyTargetHours,
			MonthlyTargetHours:  devT.MonthlyTargetHours,
			MaxFlextimePerMonth: devT.MaxFlextimePerMonth,
			UpperLimitAnnual:    devT.UpperLimitAnnual,
			LowerLimitAnnual:    devT.LowerLimitAnnual,
			FlextimeThreshold:   devT.FlextimeThreshold,
			CreditType:          model.CreditType(devT.CreditType),
			RhythmType:          model.RhythmType(devT.RhythmType),
		}
		if err := h.tariffService.UpsertDevTariff(r.Context(), tariff); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev tariffs to database")
			return
		}
	}

	// Create all dev employees (idempotent, with tariff assignment)
	for _, devEmp := range auth.GetDevEmployees() {
		emp := &model.Employee{
			TenantID:            devTenant.ID,
			PersonnelNumber:     devEmp.PersonnelNumber,
			PIN:                 devEmp.PIN,
			FirstName:           devEmp.FirstName,
			LastName:            devEmp.LastName,
			Email:               devEmp.Email,
			EntryDate:           devEmp.EntryDate,
			WeeklyHours:         decimal.NewFromFloat(devEmp.WeeklyHours),
			VacationDaysPerYear: decimal.NewFromFloat(devEmp.VacationDays),
			IsActive:            true,
		}
		emp.ID = devEmp.ID
		if tariffID, ok := auth.DevEmployeeTariffMap[devEmp.ID]; ok {
			emp.TariffID = &tariffID
		}
		if err := h.employeeService.UpsertDevEmployee(r.Context(), emp); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev employees to database")
			return
		}
	}

	// Link dev users to their employee records if mapped
	for _, user := range auth.DevUsers {
		if empID, ok := auth.GetDevEmployeeForUser(user.ID); ok {
			if err := h.userService.LinkUserToEmployee(r.Context(), user.ID, empID); err != nil {
				respondError(w, http.StatusInternalServerError, "failed to link user to employee")
				return
			}
		}
	}

	// Create all dev employee day plans (idempotent via BulkCreate with ON CONFLICT)
	devDayPlans := auth.GetDevEmployeeDayPlans()
	if len(devDayPlans) > 0 {
		plans := make([]model.EmployeeDayPlan, 0, len(devDayPlans))
		for _, devEDP := range devDayPlans {
			plans = append(plans, model.EmployeeDayPlan{
				ID:         devEDP.ID,
				TenantID:   devTenant.ID,
				EmployeeID: devEDP.EmployeeID,
				PlanDate:   devEDP.PlanDate,
				DayPlanID:  devEDP.DayPlanID,
				Source:     model.EmployeeDayPlanSource(devEDP.Source),
			})
		}
		if err := h.empDayPlanRepo.BulkCreate(r.Context(), plans); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev employee day plans to database")
			return
		}
	}

	// Create all dev departments (tenant-level, idempotent)
	// Departments must be created before teams since teams reference departments
	for _, devDept := range auth.GetDevDepartments() {
		desc := devDept.Description
		dept := &model.Department{
			ID:                devDept.ID,
			TenantID:          devTenant.ID,
			Code:              devDept.Code,
			Name:              devDept.Name,
			Description:       desc,
			ParentID:          devDept.ParentID,
			ManagerEmployeeID: devDept.ManagerEmployeeID,
			IsActive:          true,
		}
		if err := h.departmentService.UpsertDevDepartment(r.Context(), dept); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev departments to database")
			return
		}
	}

	// Create all dev teams (tenant-level, idempotent)
	for _, devTeam := range auth.GetDevTeams() {
		desc := devTeam.Description
		team := &model.Team{
			ID:               devTeam.ID,
			TenantID:         devTenant.ID,
			Name:             devTeam.Name,
			Description:      desc,
			DepartmentID:     devTeam.DepartmentID,
			LeaderEmployeeID: devTeam.LeaderEmployeeID,
			IsActive:         true,
		}
		if err := h.teamService.UpsertDevTeam(r.Context(), team); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev teams to database")
			return
		}
	}

	// Create all dev team members (idempotent)
	for _, devMember := range auth.GetDevTeamMembers() {
		member := &model.TeamMember{
			TeamID:     devMember.TeamID,
			EmployeeID: devMember.EmployeeID,
			Role:       model.TeamMemberRole(devMember.Role),
		}
		if err := h.teamService.UpsertDevTeamMember(r.Context(), member); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev team members to database")
			return
		}
	}

	// Create all dev accounts (tenant-level, idempotent)
	for _, devAcct := range auth.GetDevAccounts() {
		acct := &model.Account{
			ID:          devAcct.ID,
			TenantID:    &devTenant.ID,
			Code:        devAcct.Code,
			Name:        devAcct.Name,
			AccountType: model.AccountType(devAcct.AccountType),
			Unit:        model.AccountUnit(devAcct.Unit),
			IsSystem:    false,
			IsActive:    true,
		}
		if err := h.accountRepo.Upsert(r.Context(), acct); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev accounts to database")
			return
		}
	}

	// Create all dev bookings (idempotent)
	for _, devBooking := range auth.GetDevBookings() {
		booking := &model.Booking{
			ID:            devBooking.ID,
			TenantID:      devTenant.ID,
			EmployeeID:    devBooking.EmployeeID,
			BookingTypeID: devBooking.BookingTypeID,
			BookingDate:   devBooking.BookingDate,
			OriginalTime:  devBooking.OriginalTime,
			EditedTime:    devBooking.EditedTime,
			Source:        model.BookingSource(devBooking.Source),
			PairID:        devBooking.PairID,
		}
		if err := h.bookingRepo.Upsert(r.Context(), booking); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev bookings to database")
			return
		}
	}

	// Create all dev daily values (idempotent)
	now := time.Now()
	for _, devDV := range auth.GetDevDailyValues() {
		status := model.DailyValueStatusCalculated
		if devDV.HasError {
			status = model.DailyValueStatusError
		}
		dv := &model.DailyValue{
			ID:                 devDV.ID,
			TenantID:           devTenant.ID,
			EmployeeID:         devDV.EmployeeID,
			ValueDate:          devDV.ValueDate,
			Status:             status,
			GrossTime:          devDV.GrossTime,
			NetTime:            devDV.NetTime,
			TargetTime:         devDV.TargetTime,
			Overtime:           devDV.Overtime,
			Undertime:          devDV.Undertime,
			BreakTime:          devDV.BreakTime,
			HasError:           devDV.HasError,
			ErrorCodes:         devDV.ErrorCodes,
			Warnings:           devDV.Warnings,
			FirstCome:          devDV.FirstCome,
			LastGo:             devDV.LastGo,
			BookingCount:       devDV.BookingCount,
			CalculatedAt:       &now,
			CalculationVersion: 1,
		}
		if err := h.dailyValueRepo.Upsert(r.Context(), dv); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev daily values to database")
			return
		}
	}

	// Create all dev monthly values (idempotent)
	for _, devMV := range auth.GetDevMonthlyValues() {
		mv := &model.MonthlyValue{
			ID:               devMV.ID,
			TenantID:         devTenant.ID,
			EmployeeID:       devMV.EmployeeID,
			Year:             devMV.Year,
			Month:            devMV.Month,
			TotalGrossTime:   devMV.TotalGrossTime,
			TotalNetTime:     devMV.TotalNetTime,
			TotalTargetTime:  devMV.TotalTargetTime,
			TotalOvertime:    devMV.TotalOvertime,
			TotalUndertime:   devMV.TotalUndertime,
			TotalBreakTime:   devMV.TotalBreakTime,
			FlextimeStart:    devMV.FlextimeStart,
			FlextimeChange:   devMV.FlextimeChange,
			FlextimeEnd:      devMV.FlextimeEnd,
			VacationTaken:    devMV.VacationTaken,
			SickDays:         devMV.SickDays,
			OtherAbsenceDays: devMV.OtherAbsenceDays,
			WorkDays:         devMV.WorkDays,
			DaysWithErrors:   devMV.DaysWithErrors,
			IsClosed:         devMV.IsClosed,
		}
		if err := h.monthlyValueRepo.Upsert(r.Context(), mv); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev monthly values to database")
			return
		}
	}

	// Create all dev absence days (idempotent)
	for _, devAD := range auth.GetDevAbsenceDays() {
		ad := &model.AbsenceDay{
			ID:              devAD.ID,
			TenantID:        devTenant.ID,
			EmployeeID:      devAD.EmployeeID,
			AbsenceDate:     devAD.AbsenceDate,
			AbsenceTypeID:   devAD.AbsenceTypeID,
			Duration:        decimal.NewFromFloat(devAD.Duration),
			HalfDayPeriod:   (*model.HalfDayPeriod)(devAD.HalfDayPeriod),
			Status:          model.AbsenceStatus(devAD.Status),
			ApprovedBy:      devAD.ApprovedBy,
			ApprovedAt:      devAD.ApprovedAt,
			RejectionReason: devAD.RejectionReason,
			Notes:           devAD.Notes,
			CreatedBy:       devAD.CreatedBy,
		}
		if err := h.absenceDayRepo.Upsert(r.Context(), ad); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev absence days to database")
			return
		}
	}

	// Create all dev vacation balances (idempotent)
	for _, devVB := range auth.GetDevVacationBalances() {
		vb := &model.VacationBalance{
			ID:          devVB.ID,
			TenantID:    devTenant.ID,
			EmployeeID:  devVB.EmployeeID,
			Year:        devVB.Year,
			Entitlement: decimal.NewFromFloat(devVB.Entitlement),
			Carryover:   decimal.NewFromFloat(devVB.Carryover),
			Adjustments: decimal.NewFromFloat(devVB.Adjustments),
			Taken:       decimal.NewFromFloat(devVB.Taken),
		}
		if err := h.vacationBalanceRepo.Upsert(r.Context(), vb); err != nil {
			respondError(w, http.StatusInternalServerError, "failed to sync dev vacation balances to database")
			return
		}
	}

	// Seed vacation configuration (special calcs, calc groups, capping rules, etc.)
	if err := h.vacationConfigSeeder.SeedAll(r.Context(), devTenant.ID); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to seed dev vacation config to database")
		return
	}

	token, err := h.jwtManager.Generate(devUser.ID, devUser.Email, devUser.DisplayName, devUser.Role)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.authConfig.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(h.authConfig.JWTExpiry.Seconds()),
	})

	respondJSON(w, http.StatusOK, map[string]any{
		"token":  token,
		"user":   devUser,
		"tenant": devTenant,
	})
}

// DevUsers lists all available dev users.
// GET /auth/dev/users
func (h *AuthHandler) DevUsers(w http.ResponseWriter, _ *http.Request) {
	if !h.authConfig.IsDevMode() {
		respondError(w, http.StatusForbidden, "Dev users not available in production")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"dev_mode": true,
		"users":    auth.DevUsers,
	})
}

// Login handles credential-based authentication.
// POST /auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// In dev mode, redirect to dev login
	if h.authConfig.IsDevMode() {
		respondJSON(w, http.StatusBadRequest, map[string]any{
			"message": "You are in dev mode, please use /auth/dev/login instead.",
		})
		return
	}

	tenantIDStr := r.Header.Get("X-Tenant-ID")
	if tenantIDStr == "" {
		respondError(w, http.StatusBadRequest, "Tenant required")
		return
	}
	tenantID, err := uuid.Parse(tenantIDStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid tenant ID")
		return
	}

	tenant, err := h.tenantService.GetByID(r.Context(), tenantID)
	if errors.Is(err, service.ErrTenantNotFound) {
		respondError(w, http.StatusUnauthorized, "Invalid tenant")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to load tenant")
		return
	}
	if !tenant.IsActive {
		respondError(w, http.StatusForbidden, "Tenant is inactive")
		return
	}

	user, err := h.userService.Authenticate(r.Context(), tenantID, req.Email, req.Password)
	if errors.Is(err, service.ErrInvalidCredentials) {
		respondError(w, http.StatusUnauthorized, "Invalid credentials")
		return
	}
	if errors.Is(err, service.ErrUserInactive) {
		respondError(w, http.StatusForbidden, "User is inactive")
		return
	}
	if errors.Is(err, service.ErrUserLocked) {
		respondError(w, http.StatusForbidden, "User is locked")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to authenticate")
		return
	}

	token, err := h.jwtManager.Generate(user.ID, user.Email, user.DisplayName, string(user.Role))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to generate token")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.authConfig.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(h.authConfig.JWTExpiry.Seconds()),
	})

	respondJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  mapUserToResponse(user),
	})
}

// Refresh handles token refresh.
// POST /auth/refresh
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	token, err := h.jwtManager.Generate(user.ID, user.Email, user.DisplayName, user.Role)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   h.authConfig.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(h.authConfig.JWTExpiry.Seconds()),
	})

	respondJSON(w, http.StatusOK, map[string]any{
		"token": token,
	})
}

// Me returns the current authenticated user.
// GET /auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	ctxUser, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	// Fetch full user from database to include employee_id
	user, err := h.userService.GetByID(r.Context(), ctxUser.ID)
	if err != nil {
		// Fall back to context user if DB lookup fails
		respondJSON(w, http.StatusOK, ctxUser)
		return
	}

	// Return User directly (not wrapped) per OpenAPI spec
	respondJSON(w, http.StatusOK, user)
}

// Permissions returns the current user's permission IDs.
// GET /auth/permissions
func (h *AuthHandler) Permissions(w http.ResponseWriter, r *http.Request) {
	ctxUser, ok := auth.UserFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	user, err := h.userService.GetWithRelations(r.Context(), ctxUser.ID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	response := struct {
		Data struct {
			PermissionIDs []string `json:"permission_ids"`
			IsAdmin       bool     `json:"is_admin"`
		} `json:"data"`
	}{}

	// Inactive groups deny all permissions.
	if user.UserGroup != nil && !user.UserGroup.IsActive {
		response.Data.PermissionIDs = []string{}
		response.Data.IsAdmin = false
		respondJSON(w, http.StatusOK, response)
		return
	}

	isAdmin := user.Role == model.RoleAdmin
	if user.UserGroup != nil {
		isAdmin = user.UserGroup.IsAdmin
	}

	response.Data.IsAdmin = isAdmin

	if isAdmin {
		all := permissions.List()
		ids := make([]string, 0, len(all))
		for _, perm := range all {
			ids = append(ids, perm.ID.String())
		}
		response.Data.PermissionIDs = ids
		respondJSON(w, http.StatusOK, response)
		return
	}

	if user.UserGroup == nil {
		response.Data.PermissionIDs = []string{}
		respondJSON(w, http.StatusOK, response)
		return
	}

	var permissionIDs []string
	if err := json.Unmarshal(user.UserGroup.Permissions, &permissionIDs); err != nil {
		respondError(w, http.StatusInternalServerError, "failed to parse permissions")
		return
	}
	response.Data.PermissionIDs = permissionIDs

	respondJSON(w, http.StatusOK, response)
}

// Logout clears the authentication cookie.
// POST /auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.authConfig.CookieSecure,
	})

	w.WriteHeader(http.StatusNoContent)
}
