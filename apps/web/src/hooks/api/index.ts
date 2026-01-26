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
