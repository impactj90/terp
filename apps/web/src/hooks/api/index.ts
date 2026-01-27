// Domain-specific API hooks

// Employees
export {
  useEmployees,
  useEmployee,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
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
export { useBookingTypes, useBookingType } from './use-booking-types'

// Daily Values
export { useDailyValues, type DailyValue } from './use-daily-values'

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

// Absences
export {
  useAbsenceTypes,
  useAbsenceType,
  useAbsences,
  useEmployeeAbsences,
  useAbsence,
  useCreateAbsenceRange,
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
export { useCostCenters, useCostCenter } from './use-cost-centers'

// Employment Types
export { useEmploymentTypes, useEmploymentType } from './use-employment-types'

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
export { useAccounts, useAccount } from './use-accounts'

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
