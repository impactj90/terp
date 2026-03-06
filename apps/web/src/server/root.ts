/**
 * Root tRPC Router
 *
 * Merges all sub-routers into a single appRouter.
 * The AppRouter type is exported for client-side type inference.
 *
 * Add new routers here as they are implemented (ZMI-TICKET-210+).
 */
import { createTRPCRouter, createCallerFactory } from "./trpc"
import { healthRouter } from "./routers/health"
import { authRouter } from "./routers/auth"
import { permissionsRouter } from "./routers/permissions"
import { tenantsRouter } from "./routers/tenants"
import { userGroupsRouter } from "./routers/userGroups"
import { usersRouter } from "./routers/users"
import { departmentsRouter } from "./routers/departments"
import { teamsRouter } from "./routers/teams"
import { costCentersRouter } from "./routers/costCenters"
import { employmentTypesRouter } from "./routers/employmentTypes"
import { locationsRouter } from "./routers/locations"
import { holidaysRouter } from "./routers/holidays"
import { employeesRouter } from "./routers/employees"
import { employeeContactsRouter } from "./routers/employeeContacts"
import { employeeCardsRouter } from "./routers/employeeCards"
import { employeeTariffAssignmentsRouter } from "./routers/employeeTariffAssignments"
import { groupsRouter } from "./routers/groups"
import { activitiesRouter } from "./routers/activities"
import { ordersRouter } from "./routers/orders"
import { orderAssignmentsRouter } from "./routers/orderAssignments"
import { bookingTypesRouter } from "./routers/bookingTypes"
import { bookingReasonsRouter } from "./routers/bookingReasons"
import { bookingTypeGroupsRouter } from "./routers/bookingTypeGroups"
import { absenceTypeGroupsRouter } from "./routers/absenceTypeGroups"
import { calculationRulesRouter } from "./routers/calculationRules"
import { dayPlansRouter } from "./routers/dayPlans"
import { weekPlansRouter } from "./routers/weekPlans"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  auth: authRouter,
  permissions: permissionsRouter,
  tenants: tenantsRouter,
  users: usersRouter,
  userGroups: userGroupsRouter,
  departments: departmentsRouter,
  teams: teamsRouter,
  costCenters: costCentersRouter,
  employmentTypes: employmentTypesRouter,
  locations: locationsRouter,
  holidays: holidaysRouter,
  employees: employeesRouter,
  employeeContacts: employeeContactsRouter,
  employeeCards: employeeCardsRouter,
  employeeTariffAssignments: employeeTariffAssignmentsRouter,
  groups: groupsRouter,
  activities: activitiesRouter,
  orders: ordersRouter,
  orderAssignments: orderAssignmentsRouter,
  bookingTypes: bookingTypesRouter,
  bookingReasons: bookingReasonsRouter,
  bookingTypeGroups: bookingTypeGroupsRouter,
  absenceTypeGroups: absenceTypeGroupsRouter,
  calculationRules: calculationRulesRouter,
  dayPlans: dayPlansRouter,
  weekPlans: weekPlansRouter,
})

/** Type-only export for client-side inference. */
export type AppRouter = typeof appRouter

/**
 * Server-side caller factory.
 * Used for server-side tRPC calls without HTTP round-trips.
 */
export const createCaller = createCallerFactory(appRouter)
