package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tolga/terp/internal/auth"
	"github.com/tolga/terp/internal/middleware"
	"github.com/tolga/terp/internal/permissions"
	"github.com/tolga/terp/internal/repository"
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
			r.Get("/permissions", h.Permissions)
			r.Post("/logout", h.Logout)
		})
	})
}

// RegisterUserRoutes registers user routes.
func RegisterUserRoutes(r chi.Router, h *UserHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("users.manage").String()
	r.Route("/users", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.GetByID)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			r.Post("/{id}/password", h.ChangePassword)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetByID)
		r.With(authz.RequireSelfOrPermission("id", permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequireSelfOrPermission("id", permManage)).Post("/{id}/password", h.ChangePassword)
	})
}

// RegisterTenantRoutes registers tenant routes.
func RegisterTenantRoutes(r chi.Router, h *TenantHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("tenants.manage").String()
	r.Route("/tenants", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterHolidayRoutes registers holiday routes.
func RegisterHolidayRoutes(r chi.Router, h *HolidayHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("holidays.manage").String()
	r.Route("/holidays", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Post("/generate", h.Generate)
			r.Post("/copy", h.Copy)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Post("/generate", h.Generate)
		r.With(authz.RequirePermission(permManage)).Post("/copy", h.Copy)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
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
func RegisterAccountRoutes(r chi.Router, h *AccountHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("accounts.manage").String()
	r.Route("/accounts", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Get("/{id}/usage", h.Usage)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Get("/{id}/usage", h.Usage)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterAccountGroupRoutes registers account group routes.
func RegisterAccountGroupRoutes(r chi.Router, h *AccountGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("accounts.manage").String()
	r.Route("/account-groups", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterUserGroupRoutes registers user group routes.
func RegisterUserGroupRoutes(r chi.Router, h *UserGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("users.manage").String()
	r.Route("/user-groups", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterPermissionRoutes registers permission routes.
func RegisterPermissionRoutes(r chi.Router, h *PermissionHandler, authz *middleware.AuthorizationMiddleware) {
	if authz == nil {
		r.Get("/permissions", h.List)
		return
	}
	r.With(authz.RequirePermission(permissions.ID("users.manage").String())).Get("/permissions", h.List)
}

// RegisterDepartmentRoutes registers department routes.
func RegisterDepartmentRoutes(r chi.Router, h *DepartmentHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("departments.manage").String()
	r.Route("/departments", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/tree", h.GetTree)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/tree", h.GetTree)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterTeamRoutes registers team routes.
func RegisterTeamRoutes(r chi.Router, h *TeamHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("teams.manage").String()
	r.Route("/teams", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Put("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			r.Get("/{id}/members", h.GetMembers)
			r.Post("/{id}/members", h.AddMember)
			r.Delete("/{id}/members/{employee_id}", h.RemoveMember)
			r.Put("/{id}/members/{employee_id}", h.UpdateMemberRole)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Put("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permManage)).Get("/{id}/members", h.GetMembers)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/members", h.AddMember)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}/members/{employee_id}", h.RemoveMember)
		r.With(authz.RequirePermission(permManage)).Put("/{id}/members/{employee_id}", h.UpdateMemberRole)
	})

	// Employee teams endpoint per OpenAPI spec
	if authz == nil {
		r.Get("/employees/{employee_id}/teams", h.GetEmployeeTeams)
		return
	}
	r.With(authz.RequirePermission(permManage)).Get("/employees/{employee_id}/teams", h.GetEmployeeTeams)
}

// RegisterEmployeeRoutes registers employee routes.
func RegisterEmployeeRoutes(r chi.Router, h *EmployeeHandler, authz *middleware.AuthorizationMiddleware) {
	permView := permissions.ID("employees.view").String()
	permCreate := permissions.ID("employees.create").String()
	permEdit := permissions.ID("employees.edit").String()
	permDelete := permissions.ID("employees.delete").String()

	r.Route("/employees", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/search", h.Search)
			r.Patch("/bulk-tariff", h.BulkAssignTariff)
			r.Get("/{id}", h.Get)
			r.Put("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			r.Get("/{id}/contacts", h.ListContacts)
			r.Post("/{id}/contacts", h.AddContact)
			r.Delete("/{id}/contacts/{contactId}", h.RemoveContact)
			r.Get("/{id}/cards", h.ListCards)
			r.Post("/{id}/cards", h.AddCard)
			r.Delete("/{id}/cards/{cardId}", h.DeactivateCard)
			return
		}

		r.With(authz.RequirePermission(permView)).Get("/", h.List)
		r.With(authz.RequirePermission(permCreate)).Post("/", h.Create)
		r.With(authz.RequirePermission(permView)).Get("/search", h.Search)
		r.With(authz.RequirePermission(permEdit)).Patch("/bulk-tariff", h.BulkAssignTariff)
		r.With(authz.RequirePermission(permView)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permEdit)).Put("/{id}", h.Update)
		r.With(authz.RequirePermission(permDelete)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permView)).Get("/{id}/contacts", h.ListContacts)
		r.With(authz.RequirePermission(permEdit)).Post("/{id}/contacts", h.AddContact)
		r.With(authz.RequirePermission(permEdit)).Delete("/{id}/contacts/{contactId}", h.RemoveContact)
		r.With(authz.RequirePermission(permView)).Get("/{id}/cards", h.ListCards)
		r.With(authz.RequirePermission(permEdit)).Post("/{id}/cards", h.AddCard)
		r.With(authz.RequirePermission(permEdit)).Delete("/{id}/cards/{cardId}", h.DeactivateCard)
	})
}

// RegisterDayPlanRoutes registers day plan routes.
func RegisterDayPlanRoutes(r chi.Router, h *DayPlanHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("day_plans.manage").String()
	r.Route("/day-plans", func(r chi.Router) {
		if authz == nil {
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
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Put("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/copy", h.Copy)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/breaks", h.AddBreak)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}/breaks/{breakId}", h.DeleteBreak)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/bonuses", h.AddBonus)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}/bonuses/{bonusId}", h.DeleteBonus)
	})
}

// RegisterWeekPlanRoutes registers week plan routes.
func RegisterWeekPlanRoutes(r chi.Router, h *WeekPlanHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("week_plans.manage").String()
	r.Route("/week-plans", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Put("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Put("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterTariffRoutes registers tariff routes.
func RegisterTariffRoutes(r chi.Router, h *TariffHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("tariffs.manage").String()
	r.Route("/tariffs", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Put("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			r.Post("/{id}/breaks", h.CreateBreak)
			r.Delete("/{id}/breaks/{breakId}", h.DeleteBreak)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Put("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/breaks", h.CreateBreak)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}/breaks/{breakId}", h.DeleteBreak)
	})
}

// RegisterBookingTypeRoutes registers booking type routes.
func RegisterBookingTypeRoutes(r chi.Router, h *BookingTypeHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("booking_types.manage").String()
	r.Route("/booking-types", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterBookingRoutes registers booking routes.
func RegisterBookingRoutes(r chi.Router, h *BookingHandler, authz *middleware.AuthorizationMiddleware) {
	viewOwn := permissions.ID("time_tracking.view_own").String()
	viewAll := permissions.ID("time_tracking.view_all").String()
	edit := permissions.ID("time_tracking.edit").String()
	permCalculateDay := permissions.ID("booking_overview.calculate_day").String()
	permDeleteBookings := permissions.ID("booking_overview.delete_bookings").String()

	bookingResolver := func(r *http.Request) (uuid.UUID, error) {
		idStr := chi.URLParam(r, "id")
		bookingID, err := uuid.Parse(idStr)
		if err != nil {
			return uuid.Nil, err
		}
		booking, err := h.bookingRepo.GetByID(r.Context(), bookingID)
		if err != nil {
			if err == repository.ErrBookingNotFound {
				return uuid.Nil, middleware.ErrResourceNotFound
			}
			return uuid.Nil, err
		}
		return booking.EmployeeID, nil
	}

	bookingCreateResolver := func(r *http.Request) (uuid.UUID, error) {
		var body struct {
			EmployeeID string `json:"employee_id"`
		}
		if err := middleware.DecodeJSONBody(r, &body); err != nil {
			return uuid.Nil, err
		}
		if body.EmployeeID == "" {
			return uuid.Nil, errors.New("employee_id required")
		}
		return uuid.Parse(body.EmployeeID)
	}

	r.Route("/bookings", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.GetByID)
			r.Get("/{id}/logs", h.GetLogs)
			r.Put("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(viewAll)).Get("/", h.List)
		r.With(
			authz.RequirePermission(edit),
			authz.RequireEmployeePermissionFromResolver(bookingCreateResolver, viewOwn, viewAll),
		).Post("/", h.Create)
		r.With(authz.RequireEmployeePermissionFromResolver(bookingResolver, viewOwn, viewAll)).Get("/{id}", h.GetByID)
		r.With(authz.RequireEmployeePermissionFromResolver(bookingResolver, viewOwn, viewAll)).Get("/{id}/logs", h.GetLogs)
		r.With(
			authz.RequirePermission(edit),
			authz.RequireEmployeePermissionFromResolver(bookingResolver, viewOwn, viewAll),
		).Put("/{id}", h.Update)
		r.With(
			authz.RequirePermission(edit),
			authz.RequirePermission(permDeleteBookings),
			authz.RequireEmployeePermissionFromResolver(bookingResolver, viewOwn, viewAll),
		).Delete("/{id}", h.Delete)
	})

	// Day view routes (nested under employees)
	if authz == nil {
		r.Route("/employees/{id}/day/{date}", func(r chi.Router) {
			r.Get("/", h.GetDayView)
			r.Post("/calculate", h.Calculate)
		})
	} else {
		r.Route("/employees/{id}/day/{date}", func(r chi.Router) {
			r.With(authz.RequireEmployeePermission("id", viewOwn, viewAll)).Get("/", h.GetDayView)
			r.With(
				authz.RequirePermission(permCalculateDay),
				authz.RequireEmployeePermission("id", viewOwn, viewAll),
			).Post("/calculate", h.Calculate)
		})
	}
}

// RegisterDailyValueRoutes registers daily value routes.
func RegisterDailyValueRoutes(r chi.Router, h *DailyValueHandler, authz *middleware.AuthorizationMiddleware) {
	viewAll := permissions.ID("time_tracking.view_all").String()
	approve := permissions.ID("time_tracking.approve").String()
	permCalculateDay := permissions.ID("booking_overview.calculate_day").String()
	if authz == nil {
		r.Get("/daily-values", h.ListAll)
		r.Post("/daily-values/recalculate", h.Recalculate)
		r.Get("/daily-values/{id}", h.Get)
		r.Post("/daily-values/{id}/approve", h.Approve)
		return
	}

	r.With(authz.RequirePermission(viewAll)).Get("/daily-values", h.ListAll)
	r.With(authz.RequirePermission(permCalculateDay)).Post("/daily-values/recalculate", h.Recalculate)
	r.With(authz.RequirePermission(viewAll)).Get("/daily-values/{id}", h.Get)
	r.With(authz.RequirePermission(approve)).Post("/daily-values/{id}/approve", h.Approve)
}

// RegisterDailyAccountValueRoutes registers daily account value routes.
func RegisterDailyAccountValueRoutes(r chi.Router, h *DailyAccountValueHandler, authz *middleware.AuthorizationMiddleware) {
	permView := permissions.ID("accounts.manage").String()
	if authz == nil {
		r.Get("/daily-account-values", h.List)
		return
	}
	r.With(authz.RequirePermission(permView)).Get("/daily-account-values", h.List)
}

// RegisterAbsenceRoutes registers absence routes.
func RegisterAbsenceRoutes(r chi.Router, h *AbsenceHandler, authz *middleware.AuthorizationMiddleware) {
	requestPerm := permissions.ID("absences.request").String()
	approvePerm := permissions.ID("absences.approve").String()
	managePerm := permissions.ID("absences.manage").String()
	absenceTypesPerm := permissions.ID("absence_types.manage").String()

	// Absence types CRUD
	r.Route("/absence-types", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.ListTypes)
			r.Post("/", h.CreateType)
			r.Get("/{id}", h.GetType)
			r.Patch("/{id}", h.UpdateType)
			r.Delete("/{id}", h.DeleteType)
			return
		}
		r.With(authz.RequirePermission(absenceTypesPerm)).Get("/", h.ListTypes)
		r.With(authz.RequirePermission(absenceTypesPerm)).Post("/", h.CreateType)
		r.With(authz.RequirePermission(absenceTypesPerm)).Get("/{id}", h.GetType)
		r.With(authz.RequirePermission(absenceTypesPerm)).Patch("/{id}", h.UpdateType)
		r.With(authz.RequirePermission(absenceTypesPerm)).Delete("/{id}", h.DeleteType)
	})

	// Employee absences (nested under employees)
	if authz == nil {
		r.Get("/employees/{id}/absences", h.ListByEmployee)
		r.Post("/employees/{id}/absences", h.CreateRange)
	} else {
		r.With(authz.RequireEmployeePermission("id", requestPerm, managePerm)).Get("/employees/{id}/absences", h.ListByEmployee)
		r.With(authz.RequireEmployeePermission("id", requestPerm, managePerm)).Post("/employees/{id}/absences", h.CreateRange)
	}

	// Absence list and CRUD
	if authz == nil {
		r.Get("/absences", h.ListAll)
		r.Get("/absences/{id}", h.GetAbsence)
		r.Patch("/absences/{id}", h.UpdateAbsence)
		r.Delete("/absences/{id}", h.Delete)
		r.Post("/absences/{id}/approve", h.Approve)
		r.Post("/absences/{id}/reject", h.Reject)
		r.Post("/absences/{id}/cancel", h.Cancel)
	} else {
		r.With(authz.RequirePermission(managePerm)).Get("/absences", h.ListAll)
		r.With(authz.RequirePermission(managePerm)).Get("/absences/{id}", h.GetAbsence)
		r.With(authz.RequirePermission(managePerm)).Patch("/absences/{id}", h.UpdateAbsence)
		r.With(authz.RequirePermission(managePerm)).Delete("/absences/{id}", h.Delete)
		r.With(authz.RequirePermission(approvePerm)).Post("/absences/{id}/approve", h.Approve)
		r.With(authz.RequirePermission(approvePerm)).Post("/absences/{id}/reject", h.Reject)
		r.With(authz.RequirePermission(approvePerm)).Post("/absences/{id}/cancel", h.Cancel)
	}
}

// RegisterVacationRoutes registers vacation routes.
func RegisterVacationRoutes(r chi.Router, h *VacationHandler) {
	r.Get("/employees/{id}/vacation-balance", h.GetBalance)
}

// RegisterMonthlyEvalRoutes registers monthly evaluation routes.
func RegisterMonthlyEvalRoutes(r chi.Router, h *MonthlyEvalHandler, authz *middleware.AuthorizationMiddleware) {
	permViewReports := permissions.ID("reports.view").String()
	permCalculateMonth := permissions.ID("booking_overview.calculate_month").String()
	r.Route("/employees/{id}/months", func(r chi.Router) {
		if authz == nil {
			r.Get("/{year}", h.GetYearOverview)
			r.Route("/{year}/{month}", func(r chi.Router) {
				r.Get("/", h.GetMonthSummary)
				r.Get("/days", h.GetDailyBreakdown)
				r.Post("/close", h.CloseMonth)
				r.Post("/reopen", h.ReopenMonth)
				r.Post("/recalculate", h.Recalculate)
			})
			return
		}

		r.With(authz.RequirePermission(permViewReports)).Get("/{year}", h.GetYearOverview)
		r.Route("/{year}/{month}", func(r chi.Router) {
			r.With(authz.RequirePermission(permViewReports)).Get("/", h.GetMonthSummary)
			r.With(authz.RequirePermission(permViewReports)).Get("/days", h.GetDailyBreakdown)
			r.With(authz.RequirePermission(permViewReports)).Post("/close", h.CloseMonth)
			r.With(authz.RequirePermission(permViewReports)).Post("/reopen", h.ReopenMonth)
			r.With(
				authz.RequirePermission(permViewReports),
				authz.RequirePermission(permCalculateMonth),
			).Post("/recalculate", h.Recalculate)
		})
	})
}

// RegisterAuditLogRoutes registers audit log routes.
func RegisterAuditLogRoutes(r chi.Router, h *AuditLogHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("users.manage").String()
	r.Route("/audit-logs", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Get("/{id}", h.GetByID)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetByID)
	})
}

// RegisterNotificationRoutes registers notification routes.
func RegisterNotificationRoutes(r chi.Router, h *NotificationHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("notifications.manage").String()
	r.Route("/notifications", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Get("/stream", h.Stream)
			r.Post("/read-all", h.MarkAllRead)
			r.Post("/{id}/read", h.MarkRead)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Get("/stream", h.Stream)
		r.With(authz.RequirePermission(permManage)).Post("/read-all", h.MarkAllRead)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/read", h.MarkRead)
	})

	r.Route("/notification-preferences", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.GetPreferences)
			r.Put("/", h.UpdatePreferences)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.GetPreferences)
		r.With(authz.RequirePermission(permManage)).Put("/", h.UpdatePreferences)
	})
}

// RegisterEmployeeDayPlanRoutes registers employee day plan routes.
func RegisterEmployeeDayPlanRoutes(r chi.Router, h *EmployeeDayPlanHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("time_plans.manage").String()
	r.Route("/employee-day-plans", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Post("/bulk", h.BulkCreate)
			r.Post("/delete-range", h.DeleteRange)
			r.Get("/{id}", h.Get)
			r.Put("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Post("/bulk", h.BulkCreate)
		r.With(authz.RequirePermission(permManage)).Post("/delete-range", h.DeleteRange)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Put("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterAbsenceTypeGroupRoutes registers absence type group routes.
func RegisterAbsenceTypeGroupRoutes(r chi.Router, h *AbsenceTypeGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/absence-type-groups", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterBookingReasonRoutes registers booking reason routes.
func RegisterBookingReasonRoutes(r chi.Router, h *BookingReasonHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("booking_types.manage").String()
	r.Route("/booking-reasons", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterBookingTypeGroupRoutes registers booking type group routes.
func RegisterBookingTypeGroupRoutes(r chi.Router, h *BookingTypeGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("booking_types.manage").String()
	r.Route("/booking-type-groups", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterGroupRoutes registers employee group, workflow group, and activity group routes.
func RegisterGroupRoutes(r chi.Router, h *GroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("groups.manage").String()

	registerGroupCRUD := func(prefix string,
		list, get, create, update, del http.HandlerFunc,
	) {
		r.Route(prefix, func(r chi.Router) {
			if authz == nil {
				r.Get("/", list)
				r.Post("/", create)
				r.Get("/{id}", get)
				r.Patch("/{id}", update)
				r.Delete("/{id}", del)
				return
			}
			r.With(authz.RequirePermission(permManage)).Get("/", list)
			r.With(authz.RequirePermission(permManage)).Post("/", create)
			r.With(authz.RequirePermission(permManage)).Get("/{id}", get)
			r.With(authz.RequirePermission(permManage)).Patch("/{id}", update)
			r.With(authz.RequirePermission(permManage)).Delete("/{id}", del)
		})
	}

	registerGroupCRUD("/employee-groups",
		h.ListEmployeeGroups, h.GetEmployeeGroup, h.CreateEmployeeGroup, h.UpdateEmployeeGroup, h.DeleteEmployeeGroup,
	)
	registerGroupCRUD("/workflow-groups",
		h.ListWorkflowGroups, h.GetWorkflowGroup, h.CreateWorkflowGroup, h.UpdateWorkflowGroup, h.DeleteWorkflowGroup,
	)
	registerGroupCRUD("/activity-groups",
		h.ListActivityGroups, h.GetActivityGroup, h.CreateActivityGroup, h.UpdateActivityGroup, h.DeleteActivityGroup,
	)
}

// RegisterCalculationRuleRoutes registers calculation rule routes.
func RegisterCalculationRuleRoutes(r chi.Router, h *CalculationRuleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/calculation-rules", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterVacationSpecialCalcRoutes registers vacation special calculation routes.
func RegisterVacationSpecialCalcRoutes(r chi.Router, h *VacationSpecialCalcHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/vacation-special-calculations", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterVacationCalcGroupRoutes registers vacation calculation group routes.
func RegisterVacationCalcGroupRoutes(r chi.Router, h *VacationCalcGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/vacation-calculation-groups", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterVacationCappingRuleRoutes registers vacation capping rule routes.
func RegisterVacationCappingRuleRoutes(r chi.Router, h *VacationCappingRuleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/vacation-capping-rules", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterVacationCappingRuleGroupRoutes registers vacation capping rule group routes.
func RegisterVacationCappingRuleGroupRoutes(r chi.Router, h *VacationCappingRuleGroupHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/vacation-capping-rule-groups", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterEmployeeCappingExceptionRoutes registers employee capping exception routes.
func RegisterEmployeeCappingExceptionRoutes(r chi.Router, h *EmployeeCappingExceptionHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	r.Route("/employee-capping-exceptions", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterVacationCarryoverRoutes registers vacation carryover preview routes.
func RegisterVacationCarryoverRoutes(r chi.Router, h *VacationCarryoverHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	if authz == nil {
		r.Post("/vacation-carryover/preview", h.PreviewCarryover)
		return
	}
	r.With(authz.RequirePermission(permManage)).Post("/vacation-carryover/preview", h.PreviewCarryover)
}

// RegisterVacationEntitlementRoutes registers vacation entitlement preview routes.
func RegisterVacationEntitlementRoutes(r chi.Router, h *VacationHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absence_types.manage").String()
	if authz == nil {
		r.Post("/vacation-entitlement/preview", h.PreviewEntitlement)
		return
	}
	r.With(authz.RequirePermission(permManage)).Post("/vacation-entitlement/preview", h.PreviewEntitlement)
}

// RegisterCorrectionAssistantRoutes registers correction assistant routes.
func RegisterCorrectionAssistantRoutes(r chi.Router, h *CorrectionAssistantHandler, authz *middleware.AuthorizationMiddleware) {
	permViewAll := permissions.ID("time_tracking.view_all").String()
	permEdit := permissions.ID("time_tracking.edit").String()

	// Correction message catalog
	r.Route("/correction-messages", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.ListMessages)
			r.Get("/{id}", h.GetMessage)
			r.Patch("/{id}", h.UpdateMessage)
			return
		}
		r.With(authz.RequirePermission(permViewAll)).Get("/", h.ListMessages)
		r.With(authz.RequirePermission(permViewAll)).Get("/{id}", h.GetMessage)
		r.With(authz.RequirePermission(permEdit)).Patch("/{id}", h.UpdateMessage)
	})

	// Correction assistant query
	if authz == nil {
		r.Get("/correction-assistant", h.ListItems)
	} else {
		r.With(authz.RequirePermission(permViewAll)).Get("/correction-assistant", h.ListItems)
	}
}

// RegisterEmployeeTariffAssignmentRoutes registers employee tariff assignment routes.
func RegisterEmployeeTariffAssignmentRoutes(r chi.Router, h *EmployeeTariffAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
	permEdit := permissions.ID("employees.edit").String()
	permView := permissions.ID("employees.view").String()

	// Routes nested under /employees/{id}/tariff-assignments
	if authz == nil {
		r.Route("/employees/{id}/tariff-assignments", func(r chi.Router) {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{assignmentId}", h.Get)
			r.Put("/{assignmentId}", h.Update)
			r.Delete("/{assignmentId}", h.Delete)
		})
		r.Get("/employees/{id}/effective-tariff", h.GetEffectiveTariff)
		return
	}

	r.Route("/employees/{id}/tariff-assignments", func(r chi.Router) {
		r.With(authz.RequirePermission(permView)).Get("/", h.List)
		r.With(authz.RequirePermission(permEdit)).Post("/", h.Create)
		r.With(authz.RequirePermission(permView)).Get("/{assignmentId}", h.Get)
		r.With(authz.RequirePermission(permEdit)).Put("/{assignmentId}", h.Update)
		r.With(authz.RequirePermission(permEdit)).Delete("/{assignmentId}", h.Delete)
	})
	r.With(authz.RequirePermission(permView)).Get("/employees/{id}/effective-tariff", h.GetEffectiveTariff)
}

// RegisterActivityRoutes registers activity routes.
func RegisterActivityRoutes(r chi.Router, h *ActivityHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("activities.manage").String()
	r.Route("/activities", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterOrderRoutes registers order routes.
func RegisterOrderRoutes(r chi.Router, h *OrderHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("orders.manage").String()
	r.Route("/orders", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterOrderAssignmentRoutes registers order assignment routes.
func RegisterOrderAssignmentRoutes(r chi.Router, h *OrderAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("order_assignments.manage").String()
	r.Route("/order-assignments", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})

	// Nested route: /orders/{id}/assignments
	if authz == nil {
		r.Get("/orders/{id}/assignments", h.ListByOrder)
	} else {
		r.With(authz.RequirePermission(permManage)).Get("/orders/{id}/assignments", h.ListByOrder)
	}
}

// RegisterEvaluationRoutes registers evaluation query routes.
func RegisterEvaluationRoutes(r chi.Router, h *EvaluationHandler, authz *middleware.AuthorizationMiddleware) {
	permViewReports := permissions.ID("reports.view").String()
	r.Route("/evaluations", func(r chi.Router) {
		if authz == nil {
			r.Get("/daily-values", h.ListDailyValues)
			r.Get("/bookings", h.ListBookings)
			r.Get("/terminal-bookings", h.ListTerminalBookings)
			r.Get("/logs", h.ListLogs)
			r.Get("/workflow-history", h.ListWorkflowHistory)
			return
		}

		r.With(authz.RequirePermission(permViewReports)).Get("/daily-values", h.ListDailyValues)
		r.With(authz.RequirePermission(permViewReports)).Get("/bookings", h.ListBookings)
		r.With(authz.RequirePermission(permViewReports)).Get("/terminal-bookings", h.ListTerminalBookings)
		r.With(authz.RequirePermission(permViewReports)).Get("/logs", h.ListLogs)
		r.With(authz.RequirePermission(permViewReports)).Get("/workflow-history", h.ListWorkflowHistory)
	})
}

// RegisterExportInterfaceRoutes registers export interface routes.
func RegisterExportInterfaceRoutes(r chi.Router, h *ExportInterfaceHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("payroll.manage").String()
	r.Route("/export-interfaces", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			r.Put("/{id}/accounts", h.SetAccounts)
			r.Get("/{id}/accounts", h.ListAccounts)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permManage)).Put("/{id}/accounts", h.SetAccounts)
		r.With(authz.RequirePermission(permManage)).Get("/{id}/accounts", h.ListAccounts)
	})
}

// RegisterPayrollExportRoutes registers payroll export routes.
func RegisterPayrollExportRoutes(r chi.Router, h *PayrollExportHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("payroll.manage").String()
	permView := permissions.ID("payroll.view").String()
	r.Route("/payroll-exports", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Generate)
			r.Get("/{id}", h.Get)
			r.Delete("/{id}", h.Delete)
			r.Get("/{id}/download", h.Download)
			r.Get("/{id}/preview", h.Preview)
			return
		}
		r.With(authz.RequirePermission(permView)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Generate)
		r.With(authz.RequirePermission(permView)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permView)).Get("/{id}/download", h.Download)
		r.With(authz.RequirePermission(permView)).Get("/{id}/preview", h.Preview)
	})
}

// RegisterReportRoutes registers report routes.
func RegisterReportRoutes(r chi.Router, h *ReportHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("reports.manage").String()
	permView := permissions.ID("reports.view").String()
	r.Route("/reports", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Generate)
			r.Get("/{id}", h.Get)
			r.Delete("/{id}", h.Delete)
			r.Get("/{id}/download", h.Download)
			return
		}
		r.With(authz.RequirePermission(permView)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Generate)
		r.With(authz.RequirePermission(permView)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permView)).Get("/{id}/download", h.Download)
	})
}

// RegisterOrderBookingRoutes registers order booking routes.
func RegisterOrderBookingRoutes(r chi.Router, h *OrderBookingHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("order_bookings.manage").String()
	permView := permissions.ID("order_bookings.view").String()
	r.Route("/order-bookings", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permView)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permView)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterScheduleRoutes registers schedule and scheduler routes.
func RegisterScheduleRoutes(r chi.Router, h *ScheduleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("schedules.manage").String()

	// Schedule CRUD
	r.Route("/schedules", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)

			// Task management
			r.Get("/{id}/tasks", h.ListTasks)
			r.Post("/{id}/tasks", h.AddTask)
			r.Patch("/{id}/tasks/{taskId}", h.UpdateTask)
			r.Delete("/{id}/tasks/{taskId}", h.RemoveTask)

			// Execution
			r.Post("/{id}/execute", h.TriggerExecution)
			r.Get("/{id}/executions", h.ListExecutions)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)

		// Task management
		r.With(authz.RequirePermission(permManage)).Get("/{id}/tasks", h.ListTasks)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/tasks", h.AddTask)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}/tasks/{taskId}", h.UpdateTask)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}/tasks/{taskId}", h.RemoveTask)

		// Execution
		r.With(authz.RequirePermission(permManage)).Post("/{id}/execute", h.TriggerExecution)
		r.With(authz.RequirePermission(permManage)).Get("/{id}/executions", h.ListExecutions)
	})

	// Execution detail
	if authz == nil {
		r.Get("/schedule-executions/{id}", h.GetExecution)
	} else {
		r.With(authz.RequirePermission(permManage)).Get("/schedule-executions/{id}", h.GetExecution)
	}

	// Task catalog
	if authz == nil {
		r.Get("/scheduler/task-catalog", h.GetTaskCatalog)
	} else {
		r.With(authz.RequirePermission(permManage)).Get("/scheduler/task-catalog", h.GetTaskCatalog)
	}
}

// RegisterSystemSettingsRoutes registers system settings and cleanup routes.
func RegisterSystemSettingsRoutes(r chi.Router, h *SystemSettingsHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("system_settings.manage").String()

	r.Route("/system-settings", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.GetSettings)
			r.Put("/", h.UpdateSettings)
			r.Post("/cleanup/delete-bookings", h.CleanupDeleteBookings)
			r.Post("/cleanup/delete-booking-data", h.CleanupDeleteBookingData)
			r.Post("/cleanup/re-read-bookings", h.CleanupReReadBookings)
			r.Post("/cleanup/mark-delete-orders", h.CleanupMarkDeleteOrders)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.GetSettings)
		r.With(authz.RequirePermission(permManage)).Put("/", h.UpdateSettings)
		r.With(authz.RequirePermission(permManage)).Post("/cleanup/delete-bookings", h.CleanupDeleteBookings)
		r.With(authz.RequirePermission(permManage)).Post("/cleanup/delete-booking-data", h.CleanupDeleteBookingData)
		r.With(authz.RequirePermission(permManage)).Post("/cleanup/re-read-bookings", h.CleanupReReadBookings)
		r.With(authz.RequirePermission(permManage)).Post("/cleanup/mark-delete-orders", h.CleanupMarkDeleteOrders)
	})
}

// RegisterEmployeeMessageRoutes registers employee message routes.
func RegisterEmployeeMessageRoutes(r chi.Router, h *EmployeeMessageHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("notifications.manage").String()

	r.Route("/employee-messages", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Post("/{id}/send", h.Send)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/send", h.Send)
	})

	// Employee-nested route: /employees/{id}/messages
	if authz == nil {
		r.Get("/employees/{id}/messages", h.ListForEmployee)
	} else {
		r.With(authz.RequirePermission(permManage)).Get("/employees/{id}/messages", h.ListForEmployee)
	}
}

// RegisterContactTypeRoutes registers contact type routes.
func RegisterContactTypeRoutes(r chi.Router, h *ContactTypeHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("contact_management.manage").String()
	r.Route("/contact-types", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterTerminalBookingRoutes registers terminal booking and import batch routes.
func RegisterTerminalBookingRoutes(r chi.Router, h *TerminalHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("terminal_bookings.manage").String()

	r.Route("/terminal-bookings", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.ListRawBookings)
			r.Post("/import", h.TriggerImport)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.ListRawBookings)
		r.With(authz.RequirePermission(permManage)).Post("/import", h.TriggerImport)
	})

	r.Route("/import-batches", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.ListImportBatches)
			r.Get("/{id}", h.GetImportBatch)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.ListImportBatches)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.GetImportBatch)
	})
}

// RegisterAccessZoneRoutes registers access zone routes.
func RegisterAccessZoneRoutes(r chi.Router, h *AccessZoneHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("access_control.manage").String()
	r.Route("/access-zones", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterAccessProfileRoutes registers access profile routes.
func RegisterAccessProfileRoutes(r chi.Router, h *AccessProfileHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("access_control.manage").String()
	r.Route("/access-profiles", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterEmployeeAccessAssignmentRoutes registers employee access assignment routes.
func RegisterEmployeeAccessAssignmentRoutes(r chi.Router, h *EmployeeAccessAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("access_control.manage").String()
	r.Route("/employee-access-assignments", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterContactKindRoutes registers contact kind routes.
func RegisterContactKindRoutes(r chi.Router, h *ContactKindHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("contact_management.manage").String()
	r.Route("/contact-kinds", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterVehicleRoutes registers vehicle routes.
func RegisterVehicleRoutes(r chi.Router, h *VehicleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("vehicle_data.manage").String()
	r.Route("/vehicles", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterVehicleRouteRoutes registers vehicle route routes.
func RegisterVehicleRouteRoutes(r chi.Router, h *VehicleRouteHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("vehicle_data.manage").String()
	r.Route("/vehicle-routes", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterTripRecordRoutes registers trip record routes.
func RegisterTripRecordRoutes(r chi.Router, h *TripRecordHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("vehicle_data.manage").String()
	r.Route("/trip-records", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterTravelAllowanceRuleSetRoutes registers travel allowance rule set routes.
func RegisterTravelAllowanceRuleSetRoutes(r chi.Router, h *TravelAllowanceRuleSetHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("travel_allowance.manage").String()
	r.Route("/travel-allowance-rule-sets", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterLocalTravelRuleRoutes registers local travel rule routes.
func RegisterLocalTravelRuleRoutes(r chi.Router, h *LocalTravelRuleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("travel_allowance.manage").String()
	r.Route("/local-travel-rules", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterExtendedTravelRuleRoutes registers extended travel rule routes.
func RegisterExtendedTravelRuleRoutes(r chi.Router, h *ExtendedTravelRuleHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("travel_allowance.manage").String()
	r.Route("/extended-travel-rules", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterTravelAllowancePreviewRoutes registers travel allowance preview routes.
func RegisterTravelAllowancePreviewRoutes(r chi.Router, h *TravelAllowancePreviewHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("travel_allowance.manage").String()
	if authz == nil {
		r.Post("/travel-allowance/preview", h.Preview)
		return
	}
	r.With(authz.RequirePermission(permManage)).Post("/travel-allowance/preview", h.Preview)
}

// RegisterShiftRoutes registers shift routes.
func RegisterShiftRoutes(r chi.Router, h *ShiftHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("shift_planning.manage").String()
	r.Route("/shifts", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterShiftAssignmentRoutes registers shift assignment routes.
func RegisterShiftAssignmentRoutes(r chi.Router, h *ShiftAssignmentHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("shift_planning.manage").String()
	r.Route("/shift-assignments", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}
		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterMacroRoutes registers macro routes.
func RegisterMacroRoutes(r chi.Router, h *MacroHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("macros.manage").String()

	// Macro CRUD
	r.Route("/macros", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)

			// Assignment management
			r.Get("/{id}/assignments", h.ListAssignments)
			r.Post("/{id}/assignments", h.CreateAssignment)
			r.Patch("/{id}/assignments/{assignmentId}", h.UpdateAssignment)
			r.Delete("/{id}/assignments/{assignmentId}", h.DeleteAssignment)

			// Execution
			r.Post("/{id}/execute", h.TriggerExecution)
			r.Get("/{id}/executions", h.ListExecutions)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)

		// Assignment management
		r.With(authz.RequirePermission(permManage)).Get("/{id}/assignments", h.ListAssignments)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/assignments", h.CreateAssignment)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}/assignments/{assignmentId}", h.UpdateAssignment)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}/assignments/{assignmentId}", h.DeleteAssignment)

		// Execution
		r.With(authz.RequirePermission(permManage)).Post("/{id}/execute", h.TriggerExecution)
		r.With(authz.RequirePermission(permManage)).Get("/{id}/executions", h.ListExecutions)
	})

	// Execution detail
	if authz == nil {
		r.Get("/macro-executions/{id}", h.GetExecution)
	} else {
		r.With(authz.RequirePermission(permManage)).Get("/macro-executions/{id}", h.GetExecution)
	}
}

// RegisterVacationBalanceRoutes registers vacation balance CRUD routes.
func RegisterVacationBalanceRoutes(r chi.Router, h *VacationBalanceHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("absences.manage").String()
	if authz == nil {
		r.Get("/vacation-balances", h.List)
		r.Post("/vacation-balances", h.Create)
		r.Post("/vacation-balances/initialize", h.Initialize)
		r.Get("/vacation-balances/{id}", h.Get)
		r.Patch("/vacation-balances/{id}", h.Update)
		return
	}

	r.With(authz.RequirePermission(permManage)).Get("/vacation-balances", h.List)
	r.With(authz.RequirePermission(permManage)).Post("/vacation-balances", h.Create)
	r.With(authz.RequirePermission(permManage)).Post("/vacation-balances/initialize", h.Initialize)
	r.With(authz.RequirePermission(permManage)).Get("/vacation-balances/{id}", h.Get)
	r.With(authz.RequirePermission(permManage)).Patch("/vacation-balances/{id}", h.Update)
}

// RegisterCorrectionRoutes registers correction routes.
func RegisterCorrectionRoutes(r chi.Router, h *CorrectionHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("corrections.manage").String()
	r.Route("/corrections", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			r.Post("/{id}/approve", h.Approve)
			r.Post("/{id}/reject", h.Reject)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/approve", h.Approve)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/reject", h.Reject)
	})
}

// RegisterLocationRoutes registers location routes.
func RegisterLocationRoutes(r chi.Router, h *LocationHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("locations.manage").String()
	r.Route("/locations", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/{id}", h.Get)
			r.Patch("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Patch("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
	})
}

// RegisterMonthlyValueRoutes registers flat monthly value routes.
func RegisterMonthlyValueRoutes(r chi.Router, h *MonthlyValueHandler, authz *middleware.AuthorizationMiddleware) {
	permViewReports := permissions.ID("reports.view").String()
	permCalculateMonth := permissions.ID("booking_overview.calculate_month").String()
	if authz == nil {
		r.Get("/monthly-values", h.List)
		r.Post("/monthly-values/close-batch", h.CloseBatch)
		r.Post("/monthly-values/recalculate", h.Recalculate)
		r.Get("/monthly-values/{id}", h.Get)
		r.Post("/monthly-values/{id}/close", h.Close)
		r.Post("/monthly-values/{id}/reopen", h.Reopen)
		return
	}

	r.With(authz.RequirePermission(permViewReports)).Get("/monthly-values", h.List)
	r.With(authz.RequirePermission(permViewReports)).Post("/monthly-values/close-batch", h.CloseBatch)
	r.With(authz.RequirePermission(permCalculateMonth)).Post("/monthly-values/recalculate", h.Recalculate)
	r.With(authz.RequirePermission(permViewReports)).Get("/monthly-values/{id}", h.Get)
	r.With(authz.RequirePermission(permViewReports)).Post("/monthly-values/{id}/close", h.Close)
	r.With(authz.RequirePermission(permViewReports)).Post("/monthly-values/{id}/reopen", h.Reopen)
}

// RegisterMonthlyEvalTemplateRoutes registers monthly evaluation template routes.
func RegisterMonthlyEvalTemplateRoutes(r chi.Router, h *MonthlyEvalTemplateHandler, authz *middleware.AuthorizationMiddleware) {
	permManage := permissions.ID("monthly_evaluations.manage").String()
	r.Route("/monthly-evaluations", func(r chi.Router) {
		if authz == nil {
			r.Get("/", h.List)
			r.Post("/", h.Create)
			r.Get("/default", h.GetDefault)
			r.Get("/{id}", h.Get)
			r.Put("/{id}", h.Update)
			r.Delete("/{id}", h.Delete)
			r.Post("/{id}/set-default", h.SetDefault)
			return
		}

		r.With(authz.RequirePermission(permManage)).Get("/", h.List)
		r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
		r.With(authz.RequirePermission(permManage)).Get("/default", h.GetDefault)
		r.With(authz.RequirePermission(permManage)).Get("/{id}", h.Get)
		r.With(authz.RequirePermission(permManage)).Put("/{id}", h.Update)
		r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
		r.With(authz.RequirePermission(permManage)).Post("/{id}/set-default", h.SetDefault)
	})
}
