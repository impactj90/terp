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
	dayPlanRepo := repository.NewDayPlanRepository(db)
	weekPlanRepo := repository.NewWeekPlanRepository(db)
	tariffRepo := repository.NewTariffRepository(db)
	bookingTypeRepo := repository.NewBookingTypeRepository(db)

	// Initialize services
	userService := service.NewUserService(userRepo)
	tenantService := service.NewTenantService(tenantRepo)
	accountService := service.NewAccountService(accountRepo)
	holidayService := service.NewHolidayService(holidayRepo)
	costCenterService := service.NewCostCenterService(costCenterRepo)
	employmentTypeService := service.NewEmploymentTypeService(employmentTypeRepo)
	userGroupService := service.NewUserGroupService(userGroupRepo)
	departmentService := service.NewDepartmentService(departmentRepo)
	teamService := service.NewTeamService(teamRepo)
	employeeService := service.NewEmployeeService(employeeRepo)
	dayPlanService := service.NewDayPlanService(dayPlanRepo)
	weekPlanService := service.NewWeekPlanService(weekPlanRepo, dayPlanRepo)
	tariffService := service.NewTariffService(tariffRepo, weekPlanRepo)
	bookingTypeService := service.NewBookingTypeService(bookingTypeRepo)

	// Initialize calculation services
	bookingRepo := repository.NewBookingRepository(db)
	empDayPlanRepo := repository.NewEmployeeDayPlanRepository(db)
	dailyValueRepo := repository.NewDailyValueRepository(db)
	dailyCalcService := service.NewDailyCalcService(bookingRepo, empDayPlanRepo, dailyValueRepo, holidayRepo)
	recalcService := service.NewRecalcService(dailyCalcService, employeeRepo)

	// Initialize BookingService
	bookingService := service.NewBookingService(bookingRepo, bookingTypeRepo, recalcService, nil)

	// Initialize AbsenceService
	absenceDayRepo := repository.NewAbsenceDayRepository(db)
	absenceTypeRepo := repository.NewAbsenceTypeRepository(db)
	absenceService := service.NewAbsenceService(absenceDayRepo, absenceTypeRepo, holidayRepo, empDayPlanRepo, recalcService)
	absenceHandler := handler.NewAbsenceHandler(absenceService)

	// Initialize VacationService
	vacationBalanceRepo := repository.NewVacationBalanceRepository(db)
	vacationService := service.NewVacationService(vacationBalanceRepo, absenceDayRepo, absenceTypeRepo, employeeRepo, decimal.Zero)
	vacationHandler := handler.NewVacationHandler(vacationService)

	// Initialize handlers
	authHandler := handler.NewAuthHandler(
		authConfig,
		jwtManager,
		userService,
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

	// Initialize BookingHandler
	bookingHandler := handler.NewBookingHandler(
		bookingService,
		dailyCalcService,
		bookingRepo,
		dailyValueRepo,
		empDayPlanRepo,
		holidayRepo,
	)

	// Initialize tenant middleware
	tenantMiddleware := middleware.NewTenantMiddleware(tenantService)

	// Create router
	r := chi.NewRouter()

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
			handler.RegisterUserRoutes(r, userHandler)
			handler.RegisterTenantRoutes(r, tenantHandler)

			// Tenant-scoped routes (require authentication + tenant header)
			r.Group(func(r chi.Router) {
				r.Use(tenantMiddleware.RequireTenant)
				handler.RegisterAccountRoutes(r, accountHandler)
				handler.RegisterHolidayRoutes(r, holidayHandler)
				handler.RegisterCostCenterRoutes(r, costCenterHandler)
				handler.RegisterEmploymentTypeRoutes(r, employmentTypeHandler)
				handler.RegisterUserGroupRoutes(r, userGroupHandler)
				handler.RegisterDepartmentRoutes(r, departmentHandler)
				handler.RegisterTeamRoutes(r, teamHandler)
				handler.RegisterEmployeeRoutes(r, employeeHandler)
				handler.RegisterDayPlanRoutes(r, dayPlanHandler)
				handler.RegisterWeekPlanRoutes(r, weekPlanHandler)
				handler.RegisterTariffRoutes(r, tariffHandler)
				handler.RegisterBookingTypeRoutes(r, bookingTypeHandler)
				handler.RegisterBookingRoutes(r, bookingHandler)
				handler.RegisterAbsenceRoutes(r, absenceHandler)
				handler.RegisterVacationRoutes(r, vacationHandler)
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
