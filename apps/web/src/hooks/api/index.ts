// Domain-specific API hooks

// Employees
export {
  useEmployees,
  useEmployee,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useBulkAssignTariff,
} from './use-employees'

// Bookings
export {
  useBookings,
  useBooking,
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
} from './use-bookings'

// Booking Types
export {
  useBookingTypes,
  useBookingType,
  useCreateBookingType,
  useUpdateBookingType,
  useDeleteBookingType,
} from './use-booking-types'

// Daily Values
export {
  useDailyValues,
  useAllDailyValues,
  useApproveDailyValue,
  type DailyValue,
} from './use-daily-values'

// Monthly Values
export {
  useMonthlyValues,
  useYearOverview,
  useCloseMonth,
  useReopenMonth,
  useRecalculateMonth,
  type MonthSummary,
} from './use-monthly-values'

// Vacation Balances
export {
  useVacationBalances,
  useVacationBalance,
  useEmployeeVacationBalance,
  useCreateVacationBalance,
  useUpdateVacationBalance,
  useInitializeVacationBalances,
} from './use-vacation-balance'

// Employee Day View
export { useEmployeeDayView, useCalculateDay } from './use-employee-day'

// Employee Contacts
export {
  useEmployeeContacts,
  useCreateEmployeeContact,
  useDeleteEmployeeContact,
} from './use-employee-contacts'

// Employee Cards
export {
  useEmployeeCards,
  useCreateEmployeeCard,
  useDeactivateEmployeeCard,
} from './use-employee-cards'

// Users
export { useUser, useUpdateUser } from './use-user'
export { useUsers, useCreateUser, useDeleteUser, useChangeUserPassword } from './use-users'
export {
  useUserGroups,
  useUserGroup,
  useCreateUserGroup,
  useUpdateUserGroup,
  useDeleteUserGroup,
} from './use-user-groups'
export { usePermissions } from './use-permissions'
export { useCurrentPermissions } from './use-current-permissions'

// Notifications
export {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from './use-notifications'

// Absences
export {
  useAbsenceTypes,
  useAbsenceType,
  useAbsences,
  useEmployeeAbsences,
  useAbsence,
  useCreateAbsenceRange,
  useUpdateAbsence,
  useDeleteAbsence,
  useApproveAbsence,
  useRejectAbsence,
  useCreateAbsenceType,
  useUpdateAbsenceType,
  useDeleteAbsenceType,
} from './use-absences'

// Holidays
export {
  useHolidays,
  useHoliday,
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
  useGenerateHolidays,
  useCopyHolidays,
} from './use-holidays'

// Departments
export {
  useDepartments,
  useDepartment,
  useDepartmentTree,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from './use-departments'

// Cost Centers
export {
  useCostCenters,
  useCostCenter,
  useCreateCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
} from './use-cost-centers'

// Locations
export {
  useLocations,
  useLocation,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from './use-locations'

// Employment Types
export {
  useEmploymentTypes,
  useEmploymentType,
  useCreateEmploymentType,
  useUpdateEmploymentType,
  useDeleteEmploymentType,
} from './use-employment-types'

// Teams
export {
  useTeams,
  useTeam,
  useTeamMembers,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useAddTeamMember,
  useUpdateTeamMember,
  useRemoveTeamMember,
} from './use-teams'

// Day Plans
export {
  useDayPlans,
  useDayPlan,
  useCreateDayPlan,
  useUpdateDayPlan,
  useDeleteDayPlan,
  useCopyDayPlan,
  useCreateDayPlanBreak,
  useDeleteDayPlanBreak,
  useCreateDayPlanBonus,
  useDeleteDayPlanBonus,
} from './use-day-plans'

// Accounts
export {
  useAccounts,
  useAccount,
  useAccountUsage,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
} from './use-accounts'

// Week Plans
export {
  useWeekPlans,
  useWeekPlan,
  useCreateWeekPlan,
  useUpdateWeekPlan,
  useDeleteWeekPlan,
} from './use-week-plans'

// Tariffs
export {
  useTariffs,
  useTariff,
  useCreateTariff,
  useUpdateTariff,
  useDeleteTariff,
  useCreateTariffBreak,
  useDeleteTariffBreak,
} from './use-tariffs'

// Employee Tariff Assignments
export {
  useEmployeeTariffAssignments,
  useEmployeeTariffAssignment,
  useCreateEmployeeTariffAssignment,
  useUpdateEmployeeTariffAssignment,
  useDeleteEmployeeTariffAssignment,
  useEffectiveTariff,
} from './use-employee-tariff-assignments'

// Team Overview
export { useTeamDayViews } from './use-team-day-views'
export { useTeamDailyValues } from './use-team-daily-values'

// Employee Day Plans
export {
  useEmployeeDayPlans,
  useEmployeeDayPlansForEmployee,
  useCreateEmployeeDayPlan,
  useUpdateEmployeeDayPlan,
  useBulkCreateEmployeeDayPlans,
  useDeleteEmployeeDayPlanRange,
  useDeleteEmployeeDayPlan,
} from './use-employee-day-plans'

// Admin Monthly Values (flat routes)
export {
  useAdminMonthlyValues,
  useMonthlyValueById,
  useCloseMonthById,
  useReopenMonthById,
  useCloseMonthBatch,
  useRecalculateMonthlyValues,
} from './use-admin-monthly-values'

// Correction Assistant
export {
  useCorrectionAssistantItems,
  useCorrectionMessages,
  useCorrectionMessage,
  useUpdateCorrectionMessage,
  type CorrectionAssistantItem,
  type CorrectionAssistantError,
  type CorrectionAssistantList,
  type CorrectionMessage,
  type CorrectionMessageList,
  type UpdateCorrectionMessageRequest,
} from './use-correction-assistant'

// Payroll Exports
export {
  usePayrollExports,
  usePayrollExport,
  usePayrollExportPreview,
  useExportInterfaces,
  useGeneratePayrollExport,
  useDeletePayrollExport,
  useDownloadPayrollExport,
  type PayrollExportLine,
  type PayrollExportPreview,
} from './use-payroll-exports'

// Export Interfaces (admin CRUD)
export {
  useExportInterfaces as useExportInterfacesList,
  useExportInterface,
  useExportInterfaceAccounts,
  useCreateExportInterface,
  useUpdateExportInterface,
  useDeleteExportInterface,
  useSetExportInterfaceAccounts,
} from './use-export-interfaces'

// Monthly Evaluation Templates (admin CRUD)
export {
  useMonthlyEvaluations,
  useMonthlyEvaluation,
  useDefaultMonthlyEvaluation,
  useCreateMonthlyEvaluation,
  useUpdateMonthlyEvaluation,
  useDeleteMonthlyEvaluation,
  useSetDefaultMonthlyEvaluation,
} from './use-monthly-evaluations'

// Reports
export {
  useReports,
  useReport,
  useGenerateReport,
  useDeleteReport,
  useDownloadReport,
} from './use-reports'

// Evaluations
export {
  useEvaluationDailyValues,
  useEvaluationBookings,
  useEvaluationTerminalBookings,
  useEvaluationLogs,
  useEvaluationWorkflowHistory,
} from './use-evaluations'

// Audit Logs
export {
  useAuditLogs,
  useAuditLog,
} from './use-audit-logs'

// System Settings
export {
  useSystemSettings,
  useUpdateSystemSettings,
  useCleanupDeleteBookings,
  useCleanupDeleteBookingData,
  useCleanupReReadBookings,
  useCleanupMarkDeleteOrders,
} from './use-system-settings'

// Tenants
export {
  useTenants,
  useTenant,
  useCreateTenant,
  useUpdateTenant,
  useDeactivateTenant,
} from './use-tenants'

// Contact Types
export {
  useContactTypes,
  useContactType,
  useCreateContactType,
  useUpdateContactType,
  useDeleteContactType,
} from './use-contact-types'

// Contact Kinds
export {
  useContactKinds,
  useCreateContactKind,
  useUpdateContactKind,
  useDeleteContactKind,
} from './use-contact-kinds'

// Account Groups
export {
  useAccountGroups,
  useAccountGroup,
  useCreateAccountGroup,
  useUpdateAccountGroup,
  useDeleteAccountGroup,
} from './use-account-groups'

// Booking Type Groups
export {
  useBookingTypeGroups,
  useBookingTypeGroup,
  useCreateBookingTypeGroup,
  useUpdateBookingTypeGroup,
  useDeleteBookingTypeGroup,
} from './use-booking-type-groups'

// Absence Type Groups
export {
  useAbsenceTypeGroups,
  useAbsenceTypeGroup,
  useCreateAbsenceTypeGroup,
  useUpdateAbsenceTypeGroup,
  useDeleteAbsenceTypeGroup,
} from './use-absence-type-groups'

// Calculation Rules
export {
  useCalculationRules,
  useCalculationRule,
  useCreateCalculationRule,
  useUpdateCalculationRule,
  useDeleteCalculationRule,
} from './use-calculation-rules'

// Vacation Config
export {
  useVacationSpecialCalculations,
  useVacationSpecialCalculation,
  useCreateVacationSpecialCalculation,
  useUpdateVacationSpecialCalculation,
  useDeleteVacationSpecialCalculation,
  useVacationCalculationGroups,
  useVacationCalculationGroup,
  useCreateVacationCalculationGroup,
  useUpdateVacationCalculationGroup,
  useDeleteVacationCalculationGroup,
  useVacationCappingRules,
  useVacationCappingRule,
  useCreateVacationCappingRule,
  useUpdateVacationCappingRule,
  useDeleteVacationCappingRule,
  useVacationCappingRuleGroups,
  useVacationCappingRuleGroup,
  useCreateVacationCappingRuleGroup,
  useUpdateVacationCappingRuleGroup,
  useDeleteVacationCappingRuleGroup,
  useEmployeeCappingExceptions,
  useEmployeeCappingException,
  useCreateEmployeeCappingException,
  useUpdateEmployeeCappingException,
  useDeleteEmployeeCappingException,
  useVacationEntitlementPreview,
  useVacationCarryoverPreview,
} from './use-vacation-config'
