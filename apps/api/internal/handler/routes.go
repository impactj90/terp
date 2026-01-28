package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
)

// RegisterAuthRoutes registers authentication routes.
// devMode controls whether dev login endpoints are available (NEVER in production).
func RegisterAuthRoutes(r chi.Router, h *AuthHandler, jwtManager *auth.JWTManager, devMode bool) {
	r.Route("/auth", func(r chi.Router) {
		if devMode {
			r.Get("/dev/login", h.DevLogin)
			r.Get("/dev/users", h.DevUsers)
		}

		r.Post("/login", h.Login)
		r.Post("/refresh", h.Refresh)

		r.Group(func(r chi.Router) {
			r.Use(middleware.AuthMiddleware(jwtManager))
			r.Get("/me", h.Me)
			r.Post("/logout", h.Logout)
		})
	})
}

// RegisterUserRoutes registers user routes.
func RegisterUserRoutes(r chi.Router, h *UserHandler) {
	r.Route("/users", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/{id}", h.GetByID)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterTenantRoutes registers tenant routes.
func RegisterTenantRoutes(r chi.Router, h *TenantHandler) {
	r.Route("/tenants", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterHolidayRoutes registers holiday routes.
func RegisterHolidayRoutes(r chi.Router, h *HolidayHandler) {
	r.Route("/holidays", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterCostCenterRoutes registers cost center routes.
func RegisterCostCenterRoutes(r chi.Router, h *CostCenterHandler) {
	r.Route("/cost-centers", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterEmploymentTypeRoutes registers employment type routes.
func RegisterEmploymentTypeRoutes(r chi.Router, h *EmploymentTypeHandler) {
	r.Route("/employment-types", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterAccountRoutes registers account routes.
func RegisterAccountRoutes(r chi.Router, h *AccountHandler) {
	r.Route("/accounts", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Get("/{id}/usage", h.Usage)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterUserGroupRoutes registers user group routes.
func RegisterUserGroupRoutes(r chi.Router, h *UserGroupHandler) {
	r.Route("/user-groups", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterDepartmentRoutes registers department routes.
func RegisterDepartmentRoutes(r chi.Router, h *DepartmentHandler) {
	r.Route("/departments", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/tree", h.GetTree)
		r.Get("/{id}", h.Get)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterTeamRoutes registers team routes.
func RegisterTeamRoutes(r chi.Router, h *TeamHandler) {
	r.Route("/teams", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Put("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
		r.Get("/{id}/members", h.GetMembers)
		r.Post("/{id}/members", h.AddMember)
		r.Delete("/{id}/members/{employee_id}", h.RemoveMember)
		r.Put("/{id}/members/{employee_id}", h.UpdateMemberRole)
	})

	// Employee teams endpoint per OpenAPI spec
	r.Get("/employees/{employee_id}/teams", h.GetEmployeeTeams)
}

// RegisterEmployeeRoutes registers employee routes.
func RegisterEmployeeRoutes(r chi.Router, h *EmployeeHandler) {
	r.Route("/employees", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/search", h.Search)
		r.Get("/{id}", h.Get)
		r.Put("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
		r.Get("/{id}/contacts", h.ListContacts)
		r.Post("/{id}/contacts", h.AddContact)
		r.Delete("/{id}/contacts/{contactId}", h.RemoveContact)
		r.Get("/{id}/cards", h.ListCards)
		r.Post("/{id}/cards", h.AddCard)
		r.Delete("/{id}/cards/{cardId}", h.DeactivateCard)
	})
}

// RegisterDayPlanRoutes registers day plan routes.
func RegisterDayPlanRoutes(r chi.Router, h *DayPlanHandler) {
	r.Route("/day-plans", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Put("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
		r.Post("/{id}/copy", h.Copy)
		r.Post("/{id}/breaks", h.AddBreak)
		r.Delete("/{id}/breaks/{breakId}", h.DeleteBreak)
		r.Post("/{id}/bonuses", h.AddBonus)
		r.Delete("/{id}/bonuses/{bonusId}", h.DeleteBonus)
	})
}

// RegisterWeekPlanRoutes registers week plan routes.
func RegisterWeekPlanRoutes(r chi.Router, h *WeekPlanHandler) {
	r.Route("/week-plans", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Put("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterTariffRoutes registers tariff routes.
func RegisterTariffRoutes(r chi.Router, h *TariffHandler) {
	r.Route("/tariffs", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Put("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
		r.Post("/{id}/breaks", h.CreateBreak)
		r.Delete("/{id}/breaks/{breakId}", h.DeleteBreak)
	})
}

// RegisterBookingTypeRoutes registers booking type routes.
func RegisterBookingTypeRoutes(r chi.Router, h *BookingTypeHandler) {
	r.Route("/booking-types", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.Get)
		r.Patch("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})
}

// RegisterBookingRoutes registers booking routes.
func RegisterBookingRoutes(r chi.Router, h *BookingHandler) {
	r.Route("/bookings", func(r chi.Router) {
		r.Get("/", h.List)
		r.Post("/", h.Create)
		r.Get("/{id}", h.GetByID)
		r.Put("/{id}", h.Update)
		r.Delete("/{id}", h.Delete)
	})

	// Day view routes (nested under employees)
	r.Route("/employees/{id}/day/{date}", func(r chi.Router) {
		r.Get("/", h.GetDayView)
		r.Post("/calculate", h.Calculate)
	})
}

// RegisterDailyValueRoutes registers daily value routes.
func RegisterDailyValueRoutes(r chi.Router, h *DailyValueHandler) {
	r.Get("/daily-values", h.ListAll)
	r.Get("/daily-values/{id}", h.Get)
	r.Post("/daily-values/{id}/approve", h.Approve)
}

// RegisterAbsenceRoutes registers absence routes.
func RegisterAbsenceRoutes(r chi.Router, h *AbsenceHandler) {
	// Absence types CRUD
	r.Route("/absence-types", func(r chi.Router) {
		r.Get("/", h.ListTypes)
		r.Post("/", h.CreateType)
		r.Get("/{id}", h.GetType)
		r.Patch("/{id}", h.UpdateType)
		r.Delete("/{id}", h.DeleteType)
	})

	// Employee absences (nested under employees)
	r.Get("/employees/{id}/absences", h.ListByEmployee)
	r.Post("/employees/{id}/absences", h.CreateRange)

	// Absence list and CRUD
	r.Get("/absences", h.ListAll)
	r.Delete("/absences/{id}", h.Delete)
	r.Post("/absences/{id}/approve", h.Approve)
	r.Post("/absences/{id}/reject", h.Reject)
}

// RegisterVacationRoutes registers vacation routes.
func RegisterVacationRoutes(r chi.Router, h *VacationHandler) {
	r.Get("/employees/{id}/vacation-balance", h.GetBalance)
}

// RegisterMonthlyEvalRoutes registers monthly evaluation routes.
func RegisterMonthlyEvalRoutes(r chi.Router, h *MonthlyEvalHandler) {
	r.Route("/employees/{id}/months", func(r chi.Router) {
		r.Get("/{year}", h.GetYearOverview)
		r.Route("/{year}/{month}", func(r chi.Router) {
			r.Get("/", h.GetMonthSummary)
			r.Get("/days", h.GetDailyBreakdown)
			r.Post("/close", h.CloseMonth)
			r.Post("/reopen", h.ReopenMonth)
			r.Post("/recalculate", h.Recalculate)
		})
	})
}

// RegisterNotificationRoutes registers notification routes.
func RegisterNotificationRoutes(r chi.Router, h *NotificationHandler) {
	r.Route("/notifications", func(r chi.Router) {
		r.Get("/", h.List)
		r.Get("/stream", h.Stream)
		r.Post("/read-all", h.MarkAllRead)
		r.Post("/{id}/read", h.MarkRead)
	})

	r.Route("/notification-preferences", func(r chi.Router) {
		r.Get("/", h.GetPreferences)
		r.Put("/", h.UpdatePreferences)
	})
}
