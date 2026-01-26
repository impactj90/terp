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
export {
  useDailyValues,
  useDailyValue,
  useRecalculateDailyValues,
  useApproveDailyValue,
} from './use-daily-values'

// Monthly Values
export {
  useMonthlyValues,
  useMonthlyValue,
  useCloseMonthlyValue,
  useReopenMonthlyValue,
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
} from './use-absences'

// Holidays
export { useHolidays, useHoliday } from './use-holidays'

// Departments
export { useDepartments, useDepartment } from './use-departments'

// Cost Centers
export { useCostCenters, useCostCenter } from './use-cost-centers'

// Employment Types
export { useEmploymentTypes, useEmploymentType } from './use-employment-types'
