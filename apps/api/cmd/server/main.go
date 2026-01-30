// Package main is the entry point for the Terp API server.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/shopspring/decimal"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/config"
	"github.com/tolga/terp/internal/handler"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/repository"
	"github.com/tolga/terp/internal/service"
)

func main() {
	// Setup logger
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	cfg := config.Load()

	if cfg.IsDevelopment() {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
	}

	authConfig := &auth.Config{
		DevMode:      cfg.IsDevelopment(),
		JWTSecret:    []byte(cfg.JWT.Secret),
		JWTExpiry:    cfg.JWT.Expiry,
		JWTIssuer:    "terp-api",
		CookieSecure: cfg.IsProduction(),
		FrontendURL:  cfg.FrontendURL,
	}

	// Initialize JWT manager
	jwtManager := auth.NewJWTManager(
		[]byte(cfg.JWT.Secret),
		"terp-api",
		cfg.JWT.Expiry,
	)

	if authConfig.IsDevMode() {
		log.Info().Msg("Running in dev mode - use /api/v1/auth/dev/login?role=admin|user")
	}

	// Initialize database
	db, err := repository.NewDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer func() {
		if err := db.Close(); err != nil {
			log.Error().Err(err).Msg("Failed to close database connection")
		}
	}()
	log.Info().Msg("Connected to database")

	// Initialize repositories
	userRepo := repository.NewUserRepository(db)
	tenantRepo := repository.NewTenantRepository(db)
	accountRepo := repository.NewAccountRepository(db)
	holidayRepo := repository.NewHolidayRepository(db)
	costCenterRepo := repository.NewCostCenterRepository(db)
	employmentTypeRepo := repository.NewEmploymentTypeRepository(db)
	userGroupRepo := repository.NewUserGroupRepository(db)
	departmentRepo := repository.NewDepartmentRepository(db)
	teamRepo := repository.NewTeamRepository(db)
	employeeRepo := repository.NewEmployeeRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	dayPlanRepo := repository.NewDayPlanRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	bookingTypeRepo := repository.NewBookingTypeRepository(db)
	notificationRepo := repository.NewNotificationRepository(db)
	notificationPreferencesRepo := repository.NewNotificationPreferencesRepository(db)
	auditLogRepo := repository.NewAuditLogRepository(db)
	employeeGroupRepo := repository.NewEmployeeGroupRepository(db)
	workflowGroupRepo := repository.NewWorkflowGroupRepository(db)
	activityGroupRepo := repository.NewActivityGroupRepository(db)

	// Initialize services
	userService := service.NewUserService(userRepo, userGroupRepo)
	tenantService := service.NewTenantService(tenantRepo)
	accountService := service.NewAccountService(accountRepo)
	holidayService := service.NewHolidayService(holidayRepo)
	costCenterService := service.NewCostCenterService(costCenterRepo)
	employmentTypeService := service.NewEmploymentTypeService(employmentTypeRepo)
	userGroupService := service.NewUserGroupService(userGroupRepo, userRepo)
	departmentService := service.NewDepartmentService(departmentRepo)
	teamService := service.NewTeamService(teamRepo)
	employeeService := service.NewEmployeeService(employeeRepo, tariffRepo, empDayPlanRepo)
	dayPlanService := service.NewDayPlanService(dayPlanRepo)
	weekPlanService := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	tariffService := service.NewTariffService(tariffRepo, weekPlanRepo, dayPlanRepo)
	bookingTypeService := service.NewBookingTypeService(bookingTypeRepo)
	notificationService := service.NewNotificationService(notificationRepo, notificationPreferencesRepo, userRepo)
	auditLogService := service.NewAuditLogService(auditLogRepo)
	groupService := service.NewGroupService(employeeGroupRepo, workflowGroupRepo, activityGroupRepo)
	edpService := service.NewEmployeeDayPlanService(empDayPlanRepo, employeeRepo, dayPlanRepo)
	notificationStreamHub := service.NewNotificationStreamHub()
	notificationService.SetStreamHub(notificationStreamHub)

	bookingReasonRepo := repository.NewBookingReasonRepository(db)
	bookingTypeGroupRepo := repository.NewBookingTypeGroupRepository(db)
	accountGroupRepo := repository.NewAccountGroupRepository(db)
	absenceTypeGroupRepo := repository.NewAbsenceTypeGroupRepository(db)

	// Initialize calculation services
	bookingRepo := repository.NewBookingRepository(db)
	dailyValueRepo := repository.NewDailyValueRepository(db)
	absenceDayRepo := repository.NewAbsenceDayRepository(db)
	dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dayPlanRepo, dailyValueRepo, holidayRepo, employeeRepo, absenceDayRepo)
	recalcService := service.NewRecalcService(dailyCalcService, employeeRepo)
	dailyValueService := service.NewDailyValueService(dailyValueRepo)

	// Initialize BookingService
	bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)

	// Initialize AbsenceService
	absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
	absenceService := service.NewAbsenceService(absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcService)
	absenceHandler := handler.NewAbsenceHandler(absenceService, employeeService)

	// Initialize VacationService
	vacationBalanceRepo := repository.NewVacationBalanceRepository(db)
	vacationSpecialCalcRepo := repository.NewVacationSpecialCalcRepository(db)
	vacationCalcGroupRepo := repository.NewVacationCalcGroupRepository(db)
	vacationService := service.NewVacationService(
		vacationBalanceRepo,
		absenceDayRepo,
		absenceTypeRepo,
		employeeRepo,
		tenantRepo,
		tariffRepo,
		employmentTypeRepo,
		vacationCalcGroupRepo,
		decimal.Zero,
	)
	vacationHandler := handler.NewVacationHandler(vacationService)

	// Initialize Vacation Special Calc Service
	vacationSpecialCalcService := service.NewVacationSpecialCalcService(vacationSpecialCalcRepo)
	vacationSpecialCalcHandler := handler.NewVacationSpecialCalcHandler(vacationSpecialCalcService)

	// Initialize Vacation Calc Group Service
	vacationCalcGroupService := service.NewVacationCalcGroupService(vacationCalcGroupRepo, vacationSpecialCalcRepo)
	vacationCalcGroupHandler := handler.NewVacationCalcGroupHandler(vacationCalcGroupService)

	// Initialize Vacation Capping Rule Service
	vacationCappingRuleRepo := repository.NewVacationCappingRuleRepository(db)
	vacationCappingRuleService := service.NewVacationCappingRuleService(vacationCappingRuleRepo)
	vacationCappingRuleHandler := handler.NewVacationCappingRuleHandler(vacationCappingRuleService)

	// Initialize Vacation Capping Rule Group Service
	vacationCappingRuleGroupRepo := repository.NewVacationCappingRuleGroupRepository(db)
	vacationCappingRuleGroupService := service.NewVacationCappingRuleGroupService(vacationCappingRuleGroupRepo, vacationCappingRuleRepo)
	vacationCappingRuleGroupHandler := handler.NewVacationCappingRuleGroupHandler(vacationCappingRuleGroupService)

	// Initialize Employee Capping Exception Service
	employeeCappingExceptionRepo := repository.NewEmployeeCappingExceptionRepository(db)
	employeeCappingExceptionService := service.NewEmployeeCappingExceptionService(employeeCappingExceptionRepo, vacationCappingRuleRepo)
	employeeCappingExceptionHandler := handler.NewEmployeeCappingExceptionHandler(employeeCappingExceptionService)

	// Initialize Vacation Carryover Service
	vacationCarryoverService := service.NewVacationCarryoverService(
		employeeRepo, tariffRepo, vacationBalanceRepo, vacationCappingRuleGroupRepo, employeeCappingExceptionRepo,
	)
	vacationCarryoverHandler := handler.NewVacationCarryoverHandler(vacationCarryoverService)

	// Initialize MonthlyEvalService
	monthlyValueRepo := repository.NewMonthlyValueRepository(db)
	monthlyEvalService := service.NewMonthlyEvalService(monthlyValueRepo, dailyValueRepo, absenceDayRepo, employeeRepo, tariffRepo)
	monthlyEvalHandler := handler.NewMonthlyEvalHandler(monthlyEvalService, employeeService)

	// Initialize MonthlyCalcService
	monthlyCalcService := service.NewMonthlyCalcService(monthlyEvalService, monthlyValueRepo)
	holidayService.SetRecalcServices(recalcService, monthlyCalcService, employeeRepo)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(
		authConfig,
		jwtManager,
		userService,
		tenantService,
		employeeService,
		bookingTypeService,
		absenceService,
		holidayService,
		dayPlanService,
		weekPlanService,
		tariffService,
		departmentService,
		teamService,
		bookingRepo,
		dailyValueRepo,
		monthlyValueRepo,
		empDayPlanRepo,
		absenceDayRepo,
		vacationBalanceRepo,
		accountRepo,
	)
	userHandler := handler.NewUserHandler(userService)
	tenantHandler := handler.NewTenantHandler(tenantService)
	accountHandler := handler.NewAccountHandler(accountService)
	holidayHandler := handler.NewHolidayHandler(holidayService)
	costCenterHandler := handler.NewCostCenterHandler(costCenterService)
	employmentTypeHandler := handler.NewEmploymentTypeHandler(employmentTypeService)
	userGroupHandler := handler.NewUserGroupHandler(userGroupService)
	departmentHandler := handler.NewDepartmentHandler(departmentService)
	teamHandler := handler.NewTeamHandler(teamService)
	employeeHandler := handler.NewEmployeeHandler(employeeService)
	dayPlanHandler := handler.NewDayPlanHandler(dayPlanService)
	weekPlanHandler := handler.NewWeekPlanHandler(weekPlanService)
	tariffHandler := handler.NewTariffHandler(tariffService)
	bookingTypeHandler := handler.NewBookingTypeHandler(bookingTypeService)
	dailyValueHandler := handler.NewDailyValueHandler(dailyValueService, employeeService)
	notificationHandler := handler.NewNotificationHandler(notificationService, notificationStreamHub)
	permissionHandler := handler.NewPermissionHandler()
	auditLogHandler := handler.NewAuditLogHandler(auditLogService)
	bookingReasonService := service.NewBookingReasonService(bookingReasonRepo)
	bookingReasonHandler := handler.NewBookingReasonHandler(bookingReasonService)
	bookingTypeGroupService := service.NewBookingTypeGroupService(bookingTypeGroupRepo)
	bookingTypeGroupHandler := handler.NewBookingTypeGroupHandler(bookingTypeGroupService)
	accountGroupService := service.NewAccountGroupService(accountGroupRepo)
	accountGroupHandler := handler.NewAccountGroupHandler(accountGroupService)
	absenceTypeGroupService := service.NewAbsenceTypeGroupService(absenceTypeGroupRepo)
	absenceTypeGroupHandler := handler.NewAbsenceTypeGroupHandler(absenceTypeGroupService)
	groupHandler := handler.NewGroupHandler(groupService)
	edpHandler := handler.NewEmployeeDayPlanHandler(edpService)
	calculationRuleRepo := repository.NewCalculationRuleRepository(db)
	calculationRuleService := service.NewCalculationRuleService(calculationRuleRepo)
	calculationRuleHandler := handler.NewCalculationRuleHandler(calculationRuleService)

	correctionMessageRepo := repository.NewCorrectionMessageRepository(db)
	correctionAssistantService := service.NewCorrectionAssistantService(correctionMessageRepo, dailyValueRepo)
	correctionAssistantHandler := handler.NewCorrectionAssistantHandler(correctionAssistantService)

	// Initialize BookingHandler
	bookingHandler := handler.NewBookingHandler(
		bookingService,
		dailyCalcService,
		employeeService,
		bookingRepo,
		dailyValueRepo,
		empDayPlanRepo,
		holidayRepo,
	)

	// Wire notification service into producers
	absenceService.SetNotificationService(notificationService)
	dailyCalcService.SetNotificationService(notificationService)
	dailyValueService.SetNotificationService(notificationService)
	userService.SetNotificationService(notificationService)

	// Wire audit log service into handlers
	userHandler.SetAuditService(auditLogService)
	userGroupHandler.SetAuditService(auditLogService)
	bookingHandler.SetAuditService(auditLogService)
	absenceHandler.SetAuditService(auditLogService)
	employeeHandler.SetAuditService(auditLogService)
	calculationRuleHandler.SetAuditService(auditLogService)
	vacationCappingRuleHandler.SetAuditService(auditLogService)
	vacationCappingRuleGroupHandler.SetAuditService(auditLogService)
	employeeCappingExceptionHandler.SetAuditService(auditLogService)

	// Initialize tenant middleware
	tenantMiddleware := middleware.NewTenantMiddleware(tenantService)
	authzMiddleware := middleware.NewAuthorizationMiddleware(userRepo)

	// Create router
	r := chi.NewRouter()

	// CORS middleware - must be first
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.FrontendURL, "http://localhost:3000", "http://localhost:3001"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Tenant-ID", "X-Request-ID"},
		ExposedHeaders:   []string{"Link", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any major browser
	}))

	// Global middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(60 * time.Second))

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"healthy","version":"1.0.0"}`))
	})

	// Swagger UI (only in development)
	if cfg.IsDevelopment() {
		handler.RegisterSwaggerRoutes(r, openapiSpec)
		log.Info().Msg("Swagger UI available at /swagger/")
	}

	// API routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth routes
		handler.RegisterAuthRoutes(r, authHandler, jwtManager, authConfig.IsDevMode())

		// Protected routes (require authentication)
		r.Group(func(r chi.Router) {
			r.Use(middleware.AuthMiddleware(jwtManager))
			handler.RegisterUserRoutes(r, userHandler, authzMiddleware)
			handler.RegisterTenantRoutes(r, tenantHandler, authzMiddleware)

			// Tenant-scoped routes (require authentication + tenant header)
			r.Group(func(r chi.Router) {
				r.Use(tenantMiddleware.RequireTenant)
				handler.RegisterAccountRoutes(r, accountHandler, authzMiddleware)
				handler.RegisterAccountGroupRoutes(r, accountGroupHandler, authzMiddleware)
				handler.RegisterHolidayRoutes(r, holidayHandler, authzMiddleware)
				handler.RegisterCostCenterRoutes(r, costCenterHandler)
				handler.RegisterEmploymentTypeRoutes(r, employmentTypeHandler)
				handler.RegisterUserGroupRoutes(r, userGroupHandler, authzMiddleware)
				handler.RegisterPermissionRoutes(r, permissionHandler, authzMiddleware)
				handler.RegisterDepartmentRoutes(r, departmentHandler, authzMiddleware)
				handler.RegisterTeamRoutes(r, teamHandler, authzMiddleware)
				handler.RegisterEmployeeRoutes(r, employeeHandler, authzMiddleware)
				handler.RegisterDayPlanRoutes(r, dayPlanHandler, authzMiddleware)
				handler.RegisterWeekPlanRoutes(r, weekPlanHandler, authzMiddleware)
				handler.RegisterTariffRoutes(r, tariffHandler, authzMiddleware)
				handler.RegisterBookingTypeRoutes(r, bookingTypeHandler, authzMiddleware)
				handler.RegisterBookingReasonRoutes(r, bookingReasonHandler, authzMiddleware)
				handler.RegisterBookingTypeGroupRoutes(r, bookingTypeGroupHandler, authzMiddleware)
				handler.RegisterBookingRoutes(r, bookingHandler, authzMiddleware)
				handler.RegisterDailyValueRoutes(r, dailyValueHandler, authzMiddleware)
				handler.RegisterAbsenceRoutes(r, absenceHandler, authzMiddleware)
				handler.RegisterAbsenceTypeGroupRoutes(r, absenceTypeGroupHandler, authzMiddleware)
				handler.RegisterVacationRoutes(r, vacationHandler)
				handler.RegisterMonthlyEvalRoutes(r, monthlyEvalHandler, authzMiddleware)
				handler.RegisterNotificationRoutes(r, notificationHandler, authzMiddleware)
				handler.RegisterAuditLogRoutes(r, auditLogHandler, authzMiddleware)
				handler.RegisterGroupRoutes(r, groupHandler, authzMiddleware)
				handler.RegisterEmployeeDayPlanRoutes(r, edpHandler, authzMiddleware)
				handler.RegisterCalculationRuleRoutes(r, calculationRuleHandler, authzMiddleware)
				handler.RegisterCorrectionAssistantRoutes(r, correctionAssistantHandler, authzMiddleware)
				handler.RegisterVacationSpecialCalcRoutes(r, vacationSpecialCalcHandler, authzMiddleware)
				handler.RegisterVacationCalcGroupRoutes(r, vacationCalcGroupHandler, authzMiddleware)
				handler.RegisterVacationEntitlementRoutes(r, vacationHandler, authzMiddleware)
				handler.RegisterVacationCappingRuleRoutes(r, vacationCappingRuleHandler, authzMiddleware)
				handler.RegisterVacationCappingRuleGroupRoutes(r, vacationCappingRuleGroupHandler, authzMiddleware)
				handler.RegisterEmployeeCappingExceptionRoutes(r, employeeCappingExceptionHandler, authzMiddleware)
				handler.RegisterVacationCarryoverRoutes(r, vacationCarryoverHandler, authzMiddleware)
			})
		})

		// API info
		r.Get("/", func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"message":"Terp API v1"}`))
		})
	})

	// Create server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Info().Str("port", cfg.Port).Msg("Starting server")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Info().Msg("Shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server exited properly")
}
