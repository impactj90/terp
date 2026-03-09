/**
 * Root tRPC Router
 *
 * Merges all sub-routers into a single appRouter.
 * The AppRouter type is exported for client-side type inference.
 */
import { createTRPCRouter, createCallerFactory } from "../init"
import { healthRouter } from "@/server/routers/health"
import { authRouter } from "@/server/routers/auth"
import { permissionsRouter } from "@/server/routers/permissions"
import { tenantsRouter } from "@/server/routers/tenants"
import { userGroupsRouter } from "@/server/routers/userGroups"
import { usersRouter } from "@/server/routers/users"
import { departmentsRouter } from "@/server/routers/departments"
import { teamsRouter } from "@/server/routers/teams"
import { costCentersRouter } from "@/server/routers/costCenters"
import { employmentTypesRouter } from "@/server/routers/employmentTypes"
import { locationsRouter } from "@/server/routers/locations"
import { holidaysRouter } from "@/server/routers/holidays"
import { employeesRouter } from "@/server/routers/employees"
import { evaluationsRouter } from "@/server/routers/evaluations"
import { employeeContactsRouter } from "@/server/routers/employeeContacts"
import { employeeCardsRouter } from "@/server/routers/employeeCards"
import { employeeTariffAssignmentsRouter } from "@/server/routers/employeeTariffAssignments"
import { groupsRouter } from "@/server/routers/groups"
import { activitiesRouter } from "@/server/routers/activities"
import { ordersRouter } from "@/server/routers/orders"
import { orderAssignmentsRouter } from "@/server/routers/orderAssignments"
import { orderBookingsRouter } from "@/server/routers/orderBookings"
import { bookingTypesRouter } from "@/server/routers/bookingTypes"
import { bookingReasonsRouter } from "@/server/routers/bookingReasons"
import { bookingsRouter } from "@/server/routers/bookings"
import { bookingTypeGroupsRouter } from "@/server/routers/bookingTypeGroups"
import { absenceTypeGroupsRouter } from "@/server/routers/absenceTypeGroups"
import { calculationRulesRouter } from "@/server/routers/calculationRules"
import { absenceTypesRouter } from "@/server/routers/absenceTypes"
import { dayPlansRouter } from "@/server/routers/dayPlans"
import { weekPlansRouter } from "@/server/routers/weekPlans"
import { tariffsRouter } from "@/server/routers/tariffs"
import { vacationSpecialCalcsRouter } from "@/server/routers/vacationSpecialCalcs"
import { vacationCalcGroupsRouter } from "@/server/routers/vacationCalcGroups"
import { vacationCappingRulesRouter } from "@/server/routers/vacationCappingRules"
import { vacationCappingRuleGroupsRouter } from "@/server/routers/vacationCappingRuleGroups"
import { employeeCappingExceptionsRouter } from "@/server/routers/employeeCappingExceptions"
import { vacationRouter } from "@/server/routers/vacation"
import { systemSettingsRouter } from "@/server/routers/systemSettings"
import { auditLogsRouter } from "@/server/routers/auditLogs"
import { notificationsRouter } from "@/server/routers/notifications"
import { shiftsRouter } from "@/server/routers/shifts"
import { macrosRouter } from "@/server/routers/macros"
import { employeeMessagesRouter } from "@/server/routers/employeeMessages"
import { accessZonesRouter } from "@/server/routers/accessZones"
import { accessProfilesRouter } from "@/server/routers/accessProfiles"
import { employeeAccessAssignmentsRouter } from "@/server/routers/employeeAccessAssignments"
import { exportInterfacesRouter } from "@/server/routers/exportInterfaces"
import { payrollExportsRouter } from "@/server/routers/payrollExports"
import { reportsRouter } from "@/server/routers/reports"
import { schedulesRouter } from "@/server/routers/schedules"
import { terminalBookingsRouter } from "@/server/routers/terminalBookings"
import { vehiclesRouter } from "@/server/routers/vehicles"
import { vehicleRoutesRouter } from "@/server/routers/vehicleRoutes"
import { tripRecordsRouter } from "@/server/routers/tripRecords"
import { travelAllowanceRuleSetsRouter } from "@/server/routers/travelAllowanceRuleSets"
import { localTravelRulesRouter } from "@/server/routers/localTravelRules"
import { extendedTravelRulesRouter } from "@/server/routers/extendedTravelRules"
import { travelAllowancePreviewRouter } from "@/server/routers/travelAllowancePreview"
import { monthlyEvalTemplatesRouter } from "@/server/routers/monthlyEvalTemplates"
import { correctionsRouter } from "@/server/routers/corrections"
import { correctionAssistantRouter } from "@/server/routers/correctionAssistant"
import { employeeDayPlansRouter } from "@/server/routers/employeeDayPlans"
import { dailyValuesRouter } from "@/server/routers/dailyValues"
import { dailyAccountValuesRouter } from "@/server/routers/dailyAccountValues"
import { monthlyValuesRouter } from "@/server/routers/monthlyValues"
import { absencesRouter } from "@/server/routers/absences"
import { vacationBalancesRouter } from "@/server/routers/vacationBalances"

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
  evaluations: evaluationsRouter,
  employeeContacts: employeeContactsRouter,
  employeeCards: employeeCardsRouter,
  employeeTariffAssignments: employeeTariffAssignmentsRouter,
  groups: groupsRouter,
  activities: activitiesRouter,
  orders: ordersRouter,
  orderAssignments: orderAssignmentsRouter,
  orderBookings: orderBookingsRouter,
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
  schedules: schedulesRouter,
  terminalBookings: terminalBookingsRouter,
  vehicles: vehiclesRouter,
  vehicleRoutes: vehicleRoutesRouter,
  tripRecords: tripRecordsRouter,
  travelAllowanceRuleSets: travelAllowanceRuleSetsRouter,
  localTravelRules: localTravelRulesRouter,
  extendedTravelRules: extendedTravelRulesRouter,
  travelAllowancePreview: travelAllowancePreviewRouter,
  monthlyEvalTemplates: monthlyEvalTemplatesRouter,
  corrections: correctionsRouter,
  correctionAssistant: correctionAssistantRouter,
  employeeDayPlans: employeeDayPlansRouter,
  dailyValues: dailyValuesRouter,
  dailyAccountValues: dailyAccountValuesRouter,
  monthlyValues: monthlyValuesRouter,
  absences: absencesRouter,
  vacationBalances: vacationBalancesRouter,
})

/** Type-only export for client-side inference. */
export type AppRouter = typeof appRouter

/**
 * Server-side caller factory.
 * Used for server-side tRPC calls without HTTP round-trips.
 */
export const createCaller = createCallerFactory(appRouter)
