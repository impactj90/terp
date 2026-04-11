/**
 * Root tRPC Router
 *
 * Merges all sub-routers into a single appRouter.
 * The AppRouter type is exported for client-side type inference.
 */
import { createTRPCRouter, createCallerFactory } from "../init"
import { healthRouter } from "./health"
import { aiAssistantRouter } from "./aiAssistant"
import { authRouter } from "./auth"
import { permissionsRouter } from "./permissions"
import { tenantsRouter } from "./tenants"
import { demoSelfServiceRouter } from "./demo-self-service"
import { userGroupsRouter } from "./userGroups"
import { usersRouter } from "./users"
import { departmentsRouter } from "./departments"
import { teamsRouter } from "./teams"
import { costCentersRouter } from "./costCenters"
import { employmentTypesRouter } from "./employmentTypes"
import { locationsRouter } from "./locations"
import { holidaysRouter } from "./holidays"
import { employeesRouter } from "./employees"
import { evaluationsRouter } from "./evaluations"
import { employeeContactsRouter } from "./employeeContacts"
import { employeeCardsRouter } from "./employeeCards"
import { employeeTariffAssignmentsRouter } from "./employeeTariffAssignments"
import { groupsRouter } from "./groups"
import { activitiesRouter } from "./activities"
import { ordersRouter } from "./orders"
import { orderAssignmentsRouter } from "./orderAssignments"
import { orderBookingsRouter } from "./orderBookings"
import { bookingTypesRouter } from "./bookingTypes"
import { bookingReasonsRouter } from "./bookingReasons"
import { bookingsRouter } from "./bookings"
import { bookingTypeGroupsRouter } from "./bookingTypeGroups"
import { absenceTypeGroupsRouter } from "./absenceTypeGroups"
import { calculationRulesRouter } from "./calculationRules"
import { absenceTypesRouter } from "./absenceTypes"
import { dayPlansRouter } from "./dayPlans"
import { weekPlansRouter } from "./weekPlans"
import { tariffsRouter } from "./tariffs"
import { vacationSpecialCalcsRouter } from "./vacationSpecialCalcs"
import { vacationCalcGroupsRouter } from "./vacationCalcGroups"
import { vacationCappingRulesRouter } from "./vacationCappingRules"
import { vacationCappingRuleGroupsRouter } from "./vacationCappingRuleGroups"
import { employeeCappingExceptionsRouter } from "./employeeCappingExceptions"
import { vacationRouter } from "./vacation"
import { systemSettingsRouter } from "./systemSettings"
import { auditLogsRouter } from "./auditLogs"
import { notificationsRouter } from "./notifications"
import { shiftsRouter } from "./shifts"
import { macrosRouter } from "./macros"
import { employeeMessagesRouter } from "./employeeMessages"
import { accessZonesRouter } from "./accessZones"
import { accessProfilesRouter } from "./accessProfiles"
import { employeeAccessAssignmentsRouter } from "./employeeAccessAssignments"
import { exportInterfacesRouter } from "./exportInterfaces"
import { payrollExportsRouter } from "./payrollExports"
import { reportsRouter } from "./reports"
import { schedulesRouter } from "./schedules"
import { terminalBookingsRouter } from "./terminalBookings"
import { vehiclesRouter } from "./vehicles"
import { vehicleRoutesRouter } from "./vehicleRoutes"
import { tripRecordsRouter } from "./tripRecords"
import { travelAllowanceRuleSetsRouter } from "./travelAllowanceRuleSets"
import { localTravelRulesRouter } from "./localTravelRules"
import { extendedTravelRulesRouter } from "./extendedTravelRules"
import { travelAllowancePreviewRouter } from "./travelAllowancePreview"
import { monthlyEvalTemplatesRouter } from "./monthlyEvalTemplates"
import { correctionsRouter } from "./corrections"
import { correctionAssistantRouter } from "./correctionAssistant"
import { employeeDayPlansRouter } from "./employeeDayPlans"
import { dsgvoRouter } from "./dsgvo"
import { dailyValuesRouter } from "./dailyValues"
import { dailyAccountValuesRouter } from "./dailyAccountValues"
import { monthlyValuesRouter } from "./monthlyValues"
import { absencesRouter } from "./absences"
import { vacationBalancesRouter } from "./vacationBalances"
import { accountsRouter } from "./accounts"
import { accountGroupsRouter } from "./accountGroups"
import { contactTypesRouter } from "./contactTypes"
import { contactKindsRouter } from "./contactKinds"
import { tenantModulesRouter } from "./tenantModules"
import { crmRouter } from "./crm"
import { billingRouter } from "./billing"
import { warehouseRouter } from "./warehouse"
import { hrRouter } from "./hr"
import { emailRouter } from "./email"
import { invoicesRouter } from "./invoices"
import { employeeChildrenRouter } from "./employeeChildren"
import { employeeCompanyCarsRouter } from "./employeeCompanyCars"
import { employeeJobBikesRouter } from "./employeeJobBikes"
import { employeeMealAllowancesRouter } from "./employeeMealAllowances"
import { employeeVouchersRouter } from "./employeeVouchers"
import { employeeJobTicketsRouter } from "./employeeJobTickets"
import { employeePensionsRouter } from "./employeePensions"
import { employeeSavingsRouter } from "./employeeSavings"
import { employeeGarnishmentsRouter } from "./employeeGarnishments"
import { employeeParentalLeavesRouter } from "./employeeParentalLeaves"
import { employeeMaternityLeavesRouter } from "./employeeMaternityLeaves"
import { employeeForeignAssignmentsRouter } from "./employeeForeignAssignments"
import { employeeOtherEmploymentsRouter } from "./employeeOtherEmployments"
import { healthInsuranceProvidersRouter } from "./healthInsuranceProviders"
import { activityCodesKldbRouter } from "./activityCodesKldb"
import { payrollWagesRouter } from "./payrollWages"
import { exportTemplatesRouter } from "./exportTemplates"
import { exportTemplateSnapshotsRouter } from "./exportTemplateSnapshots"
import { exportTemplateSchedulesRouter } from "./exportTemplateSchedules"
import { systemExportTemplatesRouter } from "./systemExportTemplates"
import { payrollBulkImportRouter } from "./payrollBulkImport"
import { employeeSalaryHistoryRouter } from "./employeeSalaryHistory"
import { datevOnboardingRouter } from "./datevOnboarding"

export const appRouter = createTRPCRouter({
  health: healthRouter,
  aiAssistant: aiAssistantRouter,
  auth: authRouter,
  permissions: permissionsRouter,
  tenants: tenantsRouter,
  demoSelfService: demoSelfServiceRouter,
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
  dsgvo: dsgvoRouter,
  dailyValues: dailyValuesRouter,
  dailyAccountValues: dailyAccountValuesRouter,
  monthlyValues: monthlyValuesRouter,
  absences: absencesRouter,
  vacationBalances: vacationBalancesRouter,
  accounts: accountsRouter,
  accountGroups: accountGroupsRouter,
  contactTypes: contactTypesRouter,
  contactKinds: contactKindsRouter,
  tenantModules: tenantModulesRouter,
  crm: crmRouter,
  billing: billingRouter,
  warehouse: warehouseRouter,
  hr: hrRouter,
  email: emailRouter,
  invoices: invoicesRouter,
  employeeChildren: employeeChildrenRouter,
  employeeCompanyCars: employeeCompanyCarsRouter,
  employeeJobBikes: employeeJobBikesRouter,
  employeeMealAllowances: employeeMealAllowancesRouter,
  employeeVouchers: employeeVouchersRouter,
  employeeJobTickets: employeeJobTicketsRouter,
  employeePensions: employeePensionsRouter,
  employeeSavings: employeeSavingsRouter,
  employeeGarnishments: employeeGarnishmentsRouter,
  employeeParentalLeaves: employeeParentalLeavesRouter,
  employeeMaternityLeaves: employeeMaternityLeavesRouter,
  employeeForeignAssignments: employeeForeignAssignmentsRouter,
  employeeOtherEmployments: employeeOtherEmploymentsRouter,
  healthInsuranceProviders: healthInsuranceProvidersRouter,
  activityCodesKldb: activityCodesKldbRouter,
  payrollWages: payrollWagesRouter,
  exportTemplates: exportTemplatesRouter,
  exportTemplateSnapshots: exportTemplateSnapshotsRouter,
  exportTemplateSchedules: exportTemplateSchedulesRouter,
  systemExportTemplates: systemExportTemplatesRouter,
  payrollBulkImport: payrollBulkImportRouter,
  employeeSalaryHistory: employeeSalaryHistoryRouter,
  datevOnboarding: datevOnboardingRouter,
})

/** Type-only export for client-side inference. */
export type AppRouter = typeof appRouter

/**
 * Server-side caller factory.
 * Used for server-side tRPC calls without HTTP round-trips.
 */
export const createCaller = createCallerFactory(appRouter)
