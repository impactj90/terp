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
import { bookingsRouter } from "./routers/bookings"
import { bookingTypeGroupsRouter } from "./routers/bookingTypeGroups"
import { absenceTypeGroupsRouter } from "./routers/absenceTypeGroups"
import { calculationRulesRouter } from "./routers/calculationRules"
import { absenceTypesRouter } from "./routers/absenceTypes"
import { dayPlansRouter } from "./routers/dayPlans"
import { weekPlansRouter } from "./routers/weekPlans"
import { tariffsRouter } from "./routers/tariffs"
import { vacationSpecialCalcsRouter } from "./routers/vacationSpecialCalcs"
import { vacationCalcGroupsRouter } from "./routers/vacationCalcGroups"
import { vacationCappingRulesRouter } from "./routers/vacationCappingRules"
import { vacationCappingRuleGroupsRouter } from "./routers/vacationCappingRuleGroups"
import { employeeCappingExceptionsRouter } from "./routers/employeeCappingExceptions"
import { vacationRouter } from "./routers/vacation"
import { systemSettingsRouter } from "./routers/systemSettings"
import { auditLogsRouter } from "./routers/auditLogs"
import { notificationsRouter } from "./routers/notifications"
import { shiftsRouter } from "./routers/shifts"
import { macrosRouter } from "./routers/macros"
import { employeeMessagesRouter } from "./routers/employeeMessages"
import { accessZonesRouter } from "./routers/accessZones"
import { accessProfilesRouter } from "./routers/accessProfiles"
import { employeeAccessAssignmentsRouter } from "./routers/employeeAccessAssignments"
import { exportInterfacesRouter } from "./routers/exportInterfaces"
import { payrollExportsRouter } from "./routers/payrollExports"
import { reportsRouter } from "./routers/reports"
import { terminalBookingsRouter } from "./routers/terminalBookings"
import { vehiclesRouter } from "./routers/vehicles"
import { vehicleRoutesRouter } from "./routers/vehicleRoutes"
import { tripRecordsRouter } from "./routers/tripRecords"
import { travelAllowanceRuleSetsRouter } from "./routers/travelAllowanceRuleSets"
import { localTravelRulesRouter } from "./routers/localTravelRules"
import { extendedTravelRulesRouter } from "./routers/extendedTravelRules"
import { travelAllowancePreviewRouter } from "./routers/travelAllowancePreview"
import { monthlyEvalTemplatesRouter } from "./routers/monthlyEvalTemplates"
import { correctionAssistantRouter } from "./routers/correctionAssistant"
import { employeeDayPlansRouter } from "./routers/employeeDayPlans"
import { dailyValuesRouter } from "./routers/dailyValues"
import { dailyAccountValuesRouter } from "./routers/dailyAccountValues"

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
  bookings: bookingsRouter,
  bookingTypeGroups: bookingTypeGroupsRouter,
  absenceTypeGroups: absenceTypeGroupsRouter,
  calculationRules: calculationRulesRouter,
  absenceTypes: absenceTypesRouter,
  dayPlans: dayPlansRouter,
  weekPlans: weekPlansRouter,
  tariffs: tariffsRouter,
  vacationSpecialCalcs: vacationSpecialCalcsRouter,
  vacationCalcGroups: vacationCalcGroupsRouter,
  vacationCappingRules: vacationCappingRulesRouter,
  vacationCappingRuleGroups: vacationCappingRuleGroupsRouter,
  employeeCappingExceptions: employeeCappingExceptionsRouter,
  vacation: vacationRouter,
  systemSettings: systemSettingsRouter,
  auditLogs: auditLogsRouter,
  notifications: notificationsRouter,
  shifts: shiftsRouter,
  macros: macrosRouter,
  employeeMessages: employeeMessagesRouter,
  accessZones: accessZonesRouter,
  accessProfiles: accessProfilesRouter,
  employeeAccessAssignments: employeeAccessAssignmentsRouter,
  exportInterfaces: exportInterfacesRouter,
  payrollExports: payrollExportsRouter,
  reports: reportsRouter,
  terminalBookings: terminalBookingsRouter,
  vehicles: vehiclesRouter,
  vehicleRoutes: vehicleRoutesRouter,
  tripRecords: tripRecordsRouter,
  travelAllowanceRuleSets: travelAllowanceRuleSetsRouter,
  localTravelRules: localTravelRulesRouter,
  extendedTravelRules: extendedTravelRulesRouter,
  travelAllowancePreview: travelAllowancePreviewRouter,
  monthlyEvalTemplates: monthlyEvalTemplatesRouter,
  correctionAssistant: correctionAssistantRouter,
  employeeDayPlans: employeeDayPlansRouter,
  dailyValues: dailyValuesRouter,
  dailyAccountValues: dailyAccountValuesRouter,
})

/** Type-only export for client-side inference. */
export type AppRouter = typeof appRouter

/**
 * Server-side caller factory.
 * Used for server-side tRPC calls without HTTP round-trips.
 */
export const createCaller = createCallerFactory(appRouter)
