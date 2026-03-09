// Re-export from new location for backward compatibility
export {
  type VacationBasis,
  type SpecialCalcType,
  type VacationSpecialCalc,
  type VacationCalcInput,
  type VacationCalcOutput,
  calculateVacation,
  calculateAge,
  calculateTenure,
  calculateMonthsEmployedInYear,
  roundToHalfDay,
} from "@/lib/services/vacation-calculation"
