/**
 * Employees Router
 *
 * Provides employee CRUD, search, and bulk tariff assignment via tRPC procedures.
 * Replaces the Go backend employee endpoints:
 * - GET /employees -> employees.list
 * - GET /employees/{id} -> employees.getById
 * - POST /employees -> employees.create
 * - PUT /employees/{id} -> employees.update
 * - DELETE /employees/{id} -> employees.delete (deactivation)
 * - GET /employees/search -> employees.search
 * - PATCH /employees/bulk-tariff -> employees.bulkAssignTariff
 * - GET /employees/{id}/day/{date} -> employees.dayView
 * - POST /employees/{id}/day/{date}/calculate -> employees.calculateDay
 *
 * @see apps/api/internal/service/employee.go
 * @see apps/api/internal/handler/employee.go
 * @see apps/api/internal/handler/booking.go (DayView + Calculate)
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import type { Prisma } from "@/generated/prisma/client"
import type { PrismaClient } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as employeesService from "@/lib/services/employees-service"
import { decryptField, isEncrypted } from "@/lib/services/field-encryption"

// --- Permission Constants ---

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_CREATE = permissionIdByKey("employees.create")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!
const EMPLOYEES_DELETE = permissionIdByKey("employees.delete")!

// Day view permissions (time tracking scope)
const TIME_TRACKING_VIEW_OWN = permissionIdByKey("time_tracking.view_own")!
const TIME_TRACKING_VIEW_ALL = permissionIdByKey("time_tracking.view_all")!
const TIME_TRACKING_EDIT = permissionIdByKey("time_tracking.edit")!

// --- Output Schemas ---

const employeeOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  personnelNumber: z.string(),
  pin: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  entryDate: z.date(),
  exitDate: z.date().nullable(),
  departmentId: z.string().nullable(),
  costCenterId: z.string().nullable(),
  employmentTypeId: z.string().nullable(),
  locationId: z.string().nullable(),
  tariffId: z.string().nullable(),
  weeklyHours: z.number(),
  vacationDaysPerYear: z.number(),
  isActive: z.boolean(),
  disabilityFlag: z.boolean(),
  // Extended fields
  exitReason: z.string().nullable(),
  notes: z.string().nullable(),
  addressStreet: z.string().nullable(),
  addressZip: z.string().nullable(),
  addressCity: z.string().nullable(),
  addressCountry: z.string().nullable(),
  birthDate: z.date().nullable(),
  gender: z.string().nullable(),
  nationality: z.string().nullable(),
  religion: z.string().nullable(),
  maritalStatus: z.string().nullable(),
  birthPlace: z.string().nullable(),
  birthCountry: z.string().nullable(),
  roomNumber: z.string().nullable(),
  photoUrl: z.string().nullable(),
  // Group FKs
  employeeGroupId: z.string().nullable(),
  workflowGroupId: z.string().nullable(),
  activityGroupId: z.string().nullable(),
  // Order FKs
  defaultOrderId: z.string().nullable(),
  defaultActivityId: z.string().nullable(),
  // Tariff overrides
  partTimePercent: z.number().nullable(),
  dailyTargetHours: z.number().nullable(),
  weeklyTargetHours: z.number().nullable(),
  monthlyTargetHours: z.number().nullable(),
  annualTargetHours: z.number().nullable(),
  workDaysPerWeek: z.number().nullable(),
  // System
  calculationStartDate: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // --- Payroll master data ---
  taxId: z.string().nullable(),
  taxClass: z.number().nullable(),
  taxFactor: z.number().nullable(),
  childTaxAllowance: z.number().nullable(),
  denomination: z.string().nullable(),
  spouseDenomination: z.string().nullable(),
  payrollTaxAllowance: z.number().nullable(),
  payrollTaxAddition: z.number().nullable(),
  isPrimaryEmployer: z.boolean().nullable(),
  socialSecurityNumber: z.string().nullable(),
  healthInsuranceProviderId: z.string().nullable(),
  healthInsuranceStatus: z.string().nullable(),
  privateHealthInsuranceContribution: z.number().nullable(),
  personnelGroupCode: z.string().nullable(),
  contributionGroupCode: z.string().nullable(),
  activityCode: z.string().nullable(),
  midijobFlag: z.number().nullable(),
  umlageU1: z.boolean().nullable(),
  umlageU2: z.boolean().nullable(),
  iban: z.string().nullable(),
  bic: z.string().nullable(),
  accountHolder: z.string().nullable(),
  birthName: z.string().nullable(),
  houseNumber: z.string().nullable(),
  grossSalary: z.number().nullable(),
  hourlyRate: z.number().nullable(),
  paymentType: z.string().nullable(),
  salaryGroup: z.string().nullable(),
  contractType: z.string().nullable(),
  probationMonths: z.number().nullable(),
  noticePeriodEmployee: z.string().nullable(),
  noticePeriodEmployer: z.string().nullable(),
  disabilityDegree: z.number().nullable(),
  disabilityEqualStatus: z.boolean().nullable(),
  disabilityMarkers: z.string().nullable(),
  disabilityIdValidUntil: z.date().nullable(),
  bgInstitution: z.string().nullable(),
  bgMembershipNumber: z.string().nullable(),
  bgHazardTariff: z.string().nullable(),
  university: z.string().nullable(),
  studentId: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  apprenticeshipOccupation: z.string().nullable(),
  apprenticeshipExternalCompany: z.string().nullable(),
  vocationalSchool: z.string().nullable(),
  receivesOldAgePension: z.boolean().nullable(),
  receivesDisabilityPension: z.boolean().nullable(),
  receivesSurvivorPension: z.boolean().nullable(),
  pensionStartDate: z.date().nullable(),
  dateOfDeath: z.date().nullable(),
  heirName: z.string().nullable(),
  heirIban: z.string().nullable(),
  receivesParentalAllowance: z.boolean().nullable(),
  parentalAllowanceUntil: z.date().nullable(),
})

type EmployeeOutput = z.infer<typeof employeeOutputSchema>

const relationSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
}).nullable()

const employeeListItemOutputSchema = employeeOutputSchema.extend({
  department: relationSchema,
  location: relationSchema,
  tariff: relationSchema,
})

const employeeDetailOutputSchema = employeeOutputSchema.extend({
  department: relationSchema,
  costCenter: relationSchema,
  employmentType: relationSchema,
  location: relationSchema,
  tariff: relationSchema,
  contacts: z.array(
    z.object({
      id: z.string(),
      employeeId: z.string(),
      contactType: z.string(),
      value: z.string(),
      label: z.string().nullable(),
      isPrimary: z.boolean(),
      contactKindId: z.string().nullable(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })
  ),
  cards: z.array(
    z.object({
      id: z.string(),
      tenantId: z.string(),
      employeeId: z.string(),
      cardNumber: z.string(),
      cardType: z.string(),
      validFrom: z.date(),
      validTo: z.date().nullable(),
      isActive: z.boolean(),
      deactivatedAt: z.date().nullable(),
      deactivationReason: z.string().nullable(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })
  ),
})

const employeeSearchOutputSchema = z.object({
  id: z.string(),
  personnelNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
})

// --- Input Schemas ---

const listEmployeesInputSchema = z
  .object({
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(500).optional().default(20),
    search: z.string().max(255).optional(),
    departmentId: z.string().optional(),
    costCenterId: z.string().optional(),
    employmentTypeId: z.string().optional(),
    locationId: z.string().optional(),
    isActive: z.boolean().optional(),
    hasExitDate: z.boolean().optional(),
  })
  .optional()

const createEmployeeInputSchema = z.object({
  personnelNumber: z.string().max(50).optional(),
  firstName: z.string().min(1, "First name is required").max(255),
  lastName: z.string().min(1, "Last name is required").max(255),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  entryDate: z.coerce.date(),
  exitDate: z.coerce.date().optional(),
  departmentId: z.string().optional(),
  costCenterId: z.string().optional(),
  employmentTypeId: z.string().optional(),
  locationId: z.string().optional(),
  tariffId: z.string().optional(),
  weeklyHours: z.number().min(0).max(168).optional(),
  vacationDaysPerYear: z.number().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
  disabilityFlag: z.boolean().optional(),
  // Extended fields
  exitReason: z.string().optional(),
  notes: z.string().optional(),
  addressStreet: z.string().optional(),
  addressZip: z.string().optional(),
  addressCity: z.string().optional(),
  addressCountry: z.string().optional(),
  birthDate: z.coerce.date().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  religion: z.string().optional(),
  maritalStatus: z.string().optional(),
  birthPlace: z.string().optional(),
  birthCountry: z.string().optional(),
  roomNumber: z.string().optional(),
  photoUrl: z.string().optional(),
  // Group FKs
  employeeGroupId: z.string().optional(),
  workflowGroupId: z.string().optional(),
  activityGroupId: z.string().optional(),
  // Order FKs
  defaultOrderId: z.string().optional(),
  defaultActivityId: z.string().optional(),
  // Tariff overrides
  partTimePercent: z.number().min(0).max(100).optional(),
  dailyTargetHours: z.number().min(0).max(24).optional(),
  weeklyTargetHours: z.number().min(0).max(168).optional(),
  monthlyTargetHours: z.number().min(0).max(744).optional(),
  annualTargetHours: z.number().min(0).max(8784).optional(),
  workDaysPerWeek: z.number().min(0).max(7).optional(),
  // System
  calculationStartDate: z.coerce.date().optional(),
})

const updateEmployeeInputSchema = z.object({
  id: z.string(),
  personnelNumber: z.string().min(1).max(50).optional(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  pin: z.string().max(20).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  entryDate: z.coerce.date().optional(),
  exitDate: z.coerce.date().nullable().optional(),
  departmentId: z.string().optional(),
  costCenterId: z.string().optional(),
  employmentTypeId: z.string().optional(),
  locationId: z.string().optional(),
  tariffId: z.string().optional(),
  weeklyHours: z.number().min(0).max(168).optional(),
  vacationDaysPerYear: z.number().min(0).max(365).optional(),
  isActive: z.boolean().optional(),
  disabilityFlag: z.boolean().optional(),
  // Extended fields
  exitReason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  addressStreet: z.string().nullable().optional(),
  addressZip: z.string().nullable().optional(),
  addressCity: z.string().nullable().optional(),
  addressCountry: z.string().nullable().optional(),
  birthDate: z.coerce.date().nullable().optional(),
  gender: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  religion: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  birthPlace: z.string().nullable().optional(),
  birthCountry: z.string().nullable().optional(),
  roomNumber: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  // Group FKs
  employeeGroupId: z.string().optional(),
  workflowGroupId: z.string().optional(),
  activityGroupId: z.string().optional(),
  // Order FKs
  defaultOrderId: z.string().optional(),
  defaultActivityId: z.string().optional(),
  // Tariff overrides
  partTimePercent: z.number().min(0).max(100).nullable().optional(),
  dailyTargetHours: z.number().min(0).max(24).nullable().optional(),
  weeklyTargetHours: z.number().min(0).max(168).nullable().optional(),
  monthlyTargetHours: z.number().min(0).max(744).nullable().optional(),
  annualTargetHours: z.number().min(0).max(8784).nullable().optional(),
  workDaysPerWeek: z.number().min(0).max(7).nullable().optional(),
  // System
  calculationStartDate: z.coerce.date().nullable().optional(),
  // --- Payroll master data ---
  // Tax
  taxId: z.string().nullable().optional(),
  taxClass: z.number().int().min(1).max(6).nullable().optional(),
  taxFactor: z.number().nullable().optional(),
  childTaxAllowance: z.number().nullable().optional(),
  denomination: z.string().max(3).nullable().optional(),
  spouseDenomination: z.string().max(3).nullable().optional(),
  payrollTaxAllowance: z.number().nullable().optional(),
  payrollTaxAddition: z.number().nullable().optional(),
  isPrimaryEmployer: z.boolean().nullable().optional(),
  // Social security
  socialSecurityNumber: z.string().nullable().optional(),
  healthInsuranceProviderId: z.string().nullable().optional(),
  healthInsuranceStatus: z.string().nullable().optional(),
  privateHealthInsuranceContribution: z.number().nullable().optional(),
  personnelGroupCode: z.string().max(3).nullable().optional(),
  contributionGroupCode: z.string().max(4).nullable().optional(),
  activityCode: z.string().max(9).nullable().optional(),
  midijobFlag: z.number().int().min(0).max(2).nullable().optional(),
  umlageU1: z.boolean().nullable().optional(),
  umlageU2: z.boolean().nullable().optional(),
  // Bank
  iban: z.string().nullable().optional(),
  bic: z.string().max(11).nullable().optional(),
  accountHolder: z.string().max(200).nullable().optional(),
  // Personal extension
  birthName: z.string().max(100).nullable().optional(),
  houseNumber: z.string().max(20).nullable().optional(),
  // Compensation
  grossSalary: z.number().nullable().optional(),
  hourlyRate: z.number().nullable().optional(),
  paymentType: z.string().max(20).nullable().optional(),
  salaryGroup: z.string().max(50).nullable().optional(),
  // Contract extension
  contractType: z.string().max(30).nullable().optional(),
  probationMonths: z.number().int().nullable().optional(),
  noticePeriodEmployee: z.string().max(50).nullable().optional(),
  noticePeriodEmployer: z.string().max(50).nullable().optional(),
  // Disability
  disabilityDegree: z.number().int().min(20).max(100).nullable().optional(),
  disabilityEqualStatus: z.boolean().nullable().optional(),
  disabilityMarkers: z.string().max(20).nullable().optional(),
  disabilityIdValidUntil: z.coerce.date().nullable().optional(),
  // BG
  bgInstitution: z.string().max(200).nullable().optional(),
  bgMembershipNumber: z.string().max(30).nullable().optional(),
  bgHazardTariff: z.string().max(10).nullable().optional(),
  // Student / apprentice
  university: z.string().max(200).nullable().optional(),
  studentId: z.string().max(30).nullable().optional(),
  fieldOfStudy: z.string().max(100).nullable().optional(),
  apprenticeshipOccupation: z.string().max(200).nullable().optional(),
  apprenticeshipExternalCompany: z.string().max(200).nullable().optional(),
  vocationalSchool: z.string().max(200).nullable().optional(),
  // Pension status
  receivesOldAgePension: z.boolean().nullable().optional(),
  receivesDisabilityPension: z.boolean().nullable().optional(),
  receivesSurvivorPension: z.boolean().nullable().optional(),
  pensionStartDate: z.coerce.date().nullable().optional(),
  // Death
  dateOfDeath: z.coerce.date().nullable().optional(),
  heirName: z.string().max(200).nullable().optional(),
  heirIban: z.string().nullable().optional(),
  // Parental allowance
  receivesParentalAllowance: z.boolean().nullable().optional(),
  parentalAllowanceUntil: z.coerce.date().nullable().optional(),
  // Clear flags for nullable FKs
  clearHealthInsuranceProviderId: z.boolean().optional(),
  clearDepartmentId: z.boolean().optional(),
  clearCostCenterId: z.boolean().optional(),
  clearEmploymentTypeId: z.boolean().optional(),
  clearLocationId: z.boolean().optional(),
  clearTariffId: z.boolean().optional(),
  clearEmployeeGroupId: z.boolean().optional(),
  clearWorkflowGroupId: z.boolean().optional(),
  clearActivityGroupId: z.boolean().optional(),
  clearDefaultOrderId: z.boolean().optional(),
  clearDefaultActivityId: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Converts a Prisma Decimal or null to number or null.
 */
function decimalToNumber(val: Prisma.Decimal | number | null | undefined): number | null {
  if (val === null || val === undefined) return null
  return Number(val)
}

function safeDecrypt(val: string | null | undefined): string | null {
  if (!val) return null
  try {
    return isEncrypted(val) ? decryptField(val) : val
  } catch {
    return "[decryption error]"
  }
}

/**
 * Maps a Prisma Employee record to the output schema shape.
 * Converts Prisma Decimal fields to numbers.
 */
function mapEmployeeToOutput(emp: {
  id: string
  tenantId: string
  personnelNumber: string
  pin: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  entryDate: Date
  exitDate: Date | null
  departmentId: string | null
  costCenterId: string | null
  employmentTypeId: string | null
  locationId: string | null
  tariffId: string | null
  weeklyHours: Prisma.Decimal | number
  vacationDaysPerYear: Prisma.Decimal | number
  isActive: boolean
  disabilityFlag: boolean
  exitReason: string | null
  notes: string | null
  addressStreet: string | null
  addressZip: string | null
  addressCity: string | null
  addressCountry: string | null
  birthDate: Date | null
  gender: string | null
  nationality: string | null
  religion: string | null
  maritalStatus: string | null
  birthPlace: string | null
  birthCountry: string | null
  roomNumber: string | null
  photoUrl: string | null
  employeeGroupId: string | null
  workflowGroupId: string | null
  activityGroupId: string | null
  defaultOrderId: string | null
  defaultActivityId: string | null
  partTimePercent: Prisma.Decimal | number | null
  dailyTargetHours: Prisma.Decimal | number | null
  weeklyTargetHours: Prisma.Decimal | number | null
  monthlyTargetHours: Prisma.Decimal | number | null
  annualTargetHours: Prisma.Decimal | number | null
  workDaysPerWeek: Prisma.Decimal | number | null
  calculationStartDate: Date | null
  createdAt: Date
  updatedAt: Date
}): EmployeeOutput {
  return {
    id: emp.id,
    tenantId: emp.tenantId,
    personnelNumber: emp.personnelNumber,
    pin: emp.pin ?? null,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    phone: emp.phone,
    entryDate: emp.entryDate,
    exitDate: emp.exitDate,
    departmentId: emp.departmentId,
    costCenterId: emp.costCenterId,
    employmentTypeId: emp.employmentTypeId,
    locationId: emp.locationId,
    tariffId: emp.tariffId,
    weeklyHours: Number(emp.weeklyHours),
    vacationDaysPerYear: Number(emp.vacationDaysPerYear),
    isActive: emp.isActive,
    disabilityFlag: emp.disabilityFlag,
    exitReason: emp.exitReason,
    notes: emp.notes,
    addressStreet: emp.addressStreet,
    addressZip: emp.addressZip,
    addressCity: emp.addressCity,
    addressCountry: emp.addressCountry,
    birthDate: emp.birthDate,
    gender: emp.gender,
    nationality: emp.nationality,
    religion: emp.religion,
    maritalStatus: emp.maritalStatus,
    birthPlace: emp.birthPlace,
    birthCountry: emp.birthCountry,
    roomNumber: emp.roomNumber,
    photoUrl: emp.photoUrl,
    employeeGroupId: emp.employeeGroupId,
    workflowGroupId: emp.workflowGroupId,
    activityGroupId: emp.activityGroupId,
    defaultOrderId: emp.defaultOrderId,
    defaultActivityId: emp.defaultActivityId,
    partTimePercent: decimalToNumber(emp.partTimePercent),
    dailyTargetHours: decimalToNumber(emp.dailyTargetHours),
    weeklyTargetHours: decimalToNumber(emp.weeklyTargetHours),
    monthlyTargetHours: decimalToNumber(emp.monthlyTargetHours),
    annualTargetHours: decimalToNumber(emp.annualTargetHours),
    workDaysPerWeek: decimalToNumber(emp.workDaysPerWeek),
    calculationStartDate: emp.calculationStartDate,
    createdAt: emp.createdAt,
    updatedAt: emp.updatedAt,
    // --- Payroll master data ---
    taxId: safeDecrypt((emp as Record<string, unknown>).taxId as string | null),
    taxClass: (emp as Record<string, unknown>).taxClass as number | null ?? null,
    taxFactor: decimalToNumber((emp as Record<string, unknown>).taxFactor as Prisma.Decimal | null),
    childTaxAllowance: decimalToNumber((emp as Record<string, unknown>).childTaxAllowance as Prisma.Decimal | null),
    denomination: (emp as Record<string, unknown>).denomination as string | null ?? null,
    spouseDenomination: (emp as Record<string, unknown>).spouseDenomination as string | null ?? null,
    payrollTaxAllowance: decimalToNumber((emp as Record<string, unknown>).payrollTaxAllowance as Prisma.Decimal | null),
    payrollTaxAddition: decimalToNumber((emp as Record<string, unknown>).payrollTaxAddition as Prisma.Decimal | null),
    isPrimaryEmployer: (emp as Record<string, unknown>).isPrimaryEmployer as boolean | null ?? null,
    socialSecurityNumber: safeDecrypt((emp as Record<string, unknown>).socialSecurityNumber as string | null),
    healthInsuranceProviderId: (emp as Record<string, unknown>).healthInsuranceProviderId as string | null ?? null,
    healthInsuranceStatus: (emp as Record<string, unknown>).healthInsuranceStatus as string | null ?? null,
    privateHealthInsuranceContribution: decimalToNumber((emp as Record<string, unknown>).privateHealthInsuranceContribution as Prisma.Decimal | null),
    personnelGroupCode: (emp as Record<string, unknown>).personnelGroupCode as string | null ?? null,
    contributionGroupCode: (emp as Record<string, unknown>).contributionGroupCode as string | null ?? null,
    activityCode: (emp as Record<string, unknown>).activityCode as string | null ?? null,
    midijobFlag: (emp as Record<string, unknown>).midijobFlag as number | null ?? null,
    umlageU1: (emp as Record<string, unknown>).umlageU1 as boolean | null ?? null,
    umlageU2: (emp as Record<string, unknown>).umlageU2 as boolean | null ?? null,
    iban: safeDecrypt((emp as Record<string, unknown>).iban as string | null),
    bic: (emp as Record<string, unknown>).bic as string | null ?? null,
    accountHolder: (emp as Record<string, unknown>).accountHolder as string | null ?? null,
    birthName: (emp as Record<string, unknown>).birthName as string | null ?? null,
    houseNumber: (emp as Record<string, unknown>).houseNumber as string | null ?? null,
    grossSalary: decimalToNumber((emp as Record<string, unknown>).grossSalary as Prisma.Decimal | null),
    hourlyRate: decimalToNumber((emp as Record<string, unknown>).hourlyRate as Prisma.Decimal | null),
    paymentType: (emp as Record<string, unknown>).paymentType as string | null ?? null,
    salaryGroup: (emp as Record<string, unknown>).salaryGroup as string | null ?? null,
    contractType: (emp as Record<string, unknown>).contractType as string | null ?? null,
    probationMonths: (emp as Record<string, unknown>).probationMonths as number | null ?? null,
    noticePeriodEmployee: (emp as Record<string, unknown>).noticePeriodEmployee as string | null ?? null,
    noticePeriodEmployer: (emp as Record<string, unknown>).noticePeriodEmployer as string | null ?? null,
    disabilityDegree: (emp as Record<string, unknown>).disabilityDegree as number | null ?? null,
    disabilityEqualStatus: (emp as Record<string, unknown>).disabilityEqualStatus as boolean | null ?? null,
    disabilityMarkers: (emp as Record<string, unknown>).disabilityMarkers as string | null ?? null,
    disabilityIdValidUntil: (emp as Record<string, unknown>).disabilityIdValidUntil as Date | null ?? null,
    bgInstitution: (emp as Record<string, unknown>).bgInstitution as string | null ?? null,
    bgMembershipNumber: (emp as Record<string, unknown>).bgMembershipNumber as string | null ?? null,
    bgHazardTariff: (emp as Record<string, unknown>).bgHazardTariff as string | null ?? null,
    university: (emp as Record<string, unknown>).university as string | null ?? null,
    studentId: (emp as Record<string, unknown>).studentId as string | null ?? null,
    fieldOfStudy: (emp as Record<string, unknown>).fieldOfStudy as string | null ?? null,
    apprenticeshipOccupation: (emp as Record<string, unknown>).apprenticeshipOccupation as string | null ?? null,
    apprenticeshipExternalCompany: (emp as Record<string, unknown>).apprenticeshipExternalCompany as string | null ?? null,
    vocationalSchool: (emp as Record<string, unknown>).vocationalSchool as string | null ?? null,
    receivesOldAgePension: (emp as Record<string, unknown>).receivesOldAgePension as boolean | null ?? null,
    receivesDisabilityPension: (emp as Record<string, unknown>).receivesDisabilityPension as boolean | null ?? null,
    receivesSurvivorPension: (emp as Record<string, unknown>).receivesSurvivorPension as boolean | null ?? null,
    pensionStartDate: (emp as Record<string, unknown>).pensionStartDate as Date | null ?? null,
    dateOfDeath: (emp as Record<string, unknown>).dateOfDeath as Date | null ?? null,
    heirName: (emp as Record<string, unknown>).heirName as string | null ?? null,
    heirIban: safeDecrypt((emp as Record<string, unknown>).heirIban as string | null),
    receivesParentalAllowance: (emp as Record<string, unknown>).receivesParentalAllowance as boolean | null ?? null,
    parentalAllowanceUntil: (emp as Record<string, unknown>).parentalAllowanceUntil as Date | null ?? null,
  }
}

// --- Day View Schemas ---

const dayViewDailyErrorSchema = z.object({
  errorType: z.string(),
  message: z.string(),
  severity: z.enum(["error", "warning"]),
})

const dayViewDailyValueSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  valueDate: z.date(),
  status: z.string(),
  grossTime: z.number().int(),
  netTime: z.number().int(),
  targetTime: z.number().int(),
  overtime: z.number().int(),
  undertime: z.number().int(),
  breakTime: z.number().int(),
  balanceMinutes: z.number().int(),
  hasError: z.boolean(),
  errorCodes: z.array(z.string()),
  warnings: z.array(z.string()),
  firstCome: z.number().int().nullable(),
  lastGo: z.number().int().nullable(),
  bookingCount: z.number().int(),
  calculatedAt: z.date().nullable(),
})

const dayViewDayPlanSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  planType: z.string(),
}).nullable()

const dayViewHolidaySchema = z.object({
  id: z.string(),
  name: z.string(),
}).nullable()

const dayViewBookingSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  bookingDate: z.date(),
  bookingTypeId: z.string(),
  originalTime: z.number().int(),
  editedTime: z.number().int(),
  calculatedTime: z.number().int().nullable(),
  pairId: z.string().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  bookingReasonId: z.string().nullable(),
  isAutoGenerated: z.boolean(),
  originalBookingId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  bookingType: z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    direction: z.string(),
  }).nullable(),
  bookingReason: z.object({
    id: z.string(),
    code: z.string(),
    label: z.string(),
  }).nullable(),
})

const dayViewInputSchema = z.object({
  employeeId: z.string(),
  date: z.string().date(), // YYYY-MM-DD
})

const dayViewOutputSchema = z.object({
  employeeId: z.string(),
  date: z.string(), // YYYY-MM-DD
  bookings: z.array(dayViewBookingSchema),
  dailyValue: dayViewDailyValueSchema.nullable(),
  dayPlan: dayViewDayPlanSchema,
  holiday: dayViewHolidaySchema,
  isHoliday: z.boolean(),
  errors: z.array(dayViewDailyErrorSchema),
})

const calculateDayOutputSchema = dayViewDailyValueSchema.nullable()

// --- Day View Response Helpers ---

function mapDailyValueToOutput(dailyValue: {
  id: string
  tenantId: string
  employeeId: string
  valueDate: Date
  status: string
  grossTime: number
  netTime: number
  targetTime: number
  overtime: number
  undertime: number
  breakTime: number
  hasError: boolean
  errorCodes: string[]
  warnings: string[]
  firstCome: number | null
  lastGo: number | null
  bookingCount: number
  calculatedAt: Date | null
}) {
  return {
    id: dailyValue.id,
    tenantId: dailyValue.tenantId,
    employeeId: dailyValue.employeeId,
    valueDate: dailyValue.valueDate,
    status: dailyValue.status,
    grossTime: dailyValue.grossTime,
    netTime: dailyValue.netTime,
    targetTime: dailyValue.targetTime,
    overtime: dailyValue.overtime,
    undertime: dailyValue.undertime,
    breakTime: dailyValue.breakTime,
    balanceMinutes: dailyValue.netTime - dailyValue.targetTime,
    hasError: dailyValue.hasError,
    errorCodes: dailyValue.errorCodes,
    warnings: dailyValue.warnings,
    firstCome: dailyValue.firstCome,
    lastGo: dailyValue.lastGo,
    bookingCount: dailyValue.bookingCount,
    calculatedAt: dailyValue.calculatedAt,
  }
}

// --- Router ---

export const employeesRouter = createTRPCRouter({
  /**
   * employees.list -- Returns paginated employees for the current tenant.
   *
   * Supports filters: search, departmentId, costCenterId, employmentTypeId,
   * isActive, hasExitDate. Applies data scope filtering.
   *
   * Requires: employees.view permission
   */
  list: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .use(applyDataScope())
    .input(listEmployeesInputSchema)
    .output(
      z.object({
        items: z.array(employeeListItemOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const { employees, total } = await employeesService.list(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          dataScope,
          input
        )

        return {
          items: employees.map((emp) => {
            const base = mapEmployeeToOutput(emp)
            const rel = emp as unknown as {
              department?: { id: string; code: string; name: string } | null
              location?: { id: string; code: string; name: string } | null
              tariff?: { id: string; code: string; name: string } | null
            }
            return {
              ...base,
              department: rel.department ?? null,
              location: rel.location ?? null,
              tariff: rel.tariff ?? null,
            }
          }),
          total,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employees.getById -- Returns a single employee by ID with relations.
   *
   * Includes department, costCenter, employmentType, contacts,
   * and active cards.
   *
   * Requires: employees.view permission
   */
  getById: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(employeeDetailOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const employee = await employeesService.getById(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          dataScope,
          input.id
        )

        const base = mapEmployeeToOutput(employee)
        return {
          ...base,
          department: employee.department
            ? {
                id: employee.department.id,
                name: employee.department.name,
                code: employee.department.code,
              }
            : null,
          costCenter: employee.costCenter
            ? {
                id: employee.costCenter.id,
                code: employee.costCenter.code,
                name: employee.costCenter.name,
              }
            : null,
          employmentType: employee.employmentType
            ? {
                id: employee.employmentType.id,
                code: employee.employmentType.code,
                name: employee.employmentType.name,
              }
            : null,
          location: employee.location
            ? {
                id: employee.location.id,
                code: employee.location.code,
                name: employee.location.name,
              }
            : null,
          tariff: employee.tariff
            ? {
                id: employee.tariff.id,
                code: employee.tariff.code,
                name: employee.tariff.name,
              }
            : null,
          contacts: employee.contacts.map((c) => ({
            id: c.id,
            employeeId: c.employeeId,
            contactType: c.contactType,
            value: c.value,
            label: c.label,
            isPrimary: c.isPrimary,
            contactKindId: c.contactKindId,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
          })),
          cards: employee.cards.map((card) => ({
            id: card.id,
            tenantId: card.tenantId,
            employeeId: card.employeeId,
            cardNumber: card.cardNumber,
            cardType: card.cardType,
            validFrom: card.validFrom,
            validTo: card.validTo,
            isActive: card.isActive,
            deactivatedAt: card.deactivatedAt,
            deactivationReason: card.deactivationReason,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          })),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employees.create -- Creates a new employee.
   *
   * Auto-assigns PIN if not provided. Validates personnel number and PIN
   * uniqueness per tenant. Validates entry date not more than 6 months in future.
   *
   * Requires: employees.create permission
   */
  create: tenantProcedure
    .use(requirePermission(EMPLOYEES_CREATE))
    .use(applyDataScope())
    .input(createEmployeeInputSchema)
    .output(employeeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        // H-006: Validate departmentId against data scope
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope
        if (dataScope.type === "department" && input.departmentId) {
          if (!dataScope.departmentIds.includes(input.departmentId)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Department outside data scope" })
          }
        }

        const employee = await employeesService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )

        return mapEmployeeToOutput(employee)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employees.update -- Updates an existing employee.
   *
   * Supports partial updates. Uses clear flags for nullable FK clearing.
   * Validates personnel number and PIN uniqueness when changed.
   *
   * Requires: employees.edit permission
   */
  update: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .use(applyDataScope())
    .input(updateEmployeeInputSchema)
    .output(employeeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const employee = await employeesService.update(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          dataScope,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )

        return mapEmployeeToOutput(employee)
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employees.delete -- Deactivates an employee (sets isActive=false, exitDate).
   *
   * Does NOT hard-delete. Mirrors the Go backend Deactivate behavior.
   *
   * Requires: employees.delete permission
   */
  delete: tenantProcedure
    .use(requirePermission(EMPLOYEES_DELETE))
    .use(applyDataScope())
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        await employeesService.deactivate(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          dataScope,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )

        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employees.search -- Quick search for autocomplete.
   *
   * Returns lightweight employee records (id, personnelNumber, firstName, lastName).
   * Limited to 20 results.
   *
   * Requires: employees.view permission
   */
  search: tenantProcedure
    .use(requirePermission(EMPLOYEES_VIEW))
    .use(applyDataScope())
    .input(z.object({ query: z.string().min(1).max(255) }))
    .output(z.object({ items: z.array(employeeSearchOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const employees = await employeesService.searchEmployees(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.query,
          dataScope
        )

        return { items: employees }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employees.bulkAssignTariff -- Bulk assigns or clears tariff for multiple employees.
   *
   * Respects data scope per employee (skips scope-restricted employees).
   *
   * Requires: employees.edit permission
   */
  bulkAssignTariff: tenantProcedure
    .use(requirePermission(EMPLOYEES_EDIT))
    .use(applyDataScope())
    .input(
      z.object({
        employeeIds: z.array(z.string()).min(1),
        tariffId: z.string().nullable(),
        clearTariff: z.boolean().optional(),
      })
    )
    .output(z.object({ updated: z.number(), skipped: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        return await employeesService.bulkAssignTariff(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          dataScope,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employees.dayView -- Returns the full day view for an employee.
   *
   * Includes bookings, daily value, day plan, holiday info, and errors.
   * Replaces Go GET /employees/{id}/day/{date} endpoint.
   *
   * Requires: time_tracking.view_own (own employee) or time_tracking.view_all
   * @see ZMI-TICKET-235
   */
  dayView: tenantProcedure
    .use(requireEmployeePermission(
      (input) => (input as { employeeId: string }).employeeId,
      TIME_TRACKING_VIEW_OWN,
      TIME_TRACKING_VIEW_ALL
    ))
    .use(applyDataScope())
    .input(dayViewInputSchema)
    .output(dayViewOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const { employeeId, date: dateStr } = input
        const date = new Date(dateStr)

        const {
          bookings,
          dailyValue,
          empDayPlan,
          holiday,
          isHoliday,
          errors,
        } = await employeesService.getDayView(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          employeeId,
          date
        )

        return {
          employeeId,
          date: dateStr,
          bookings: bookings.map((b) => ({
            id: b.id,
            employeeId: b.employeeId,
            bookingDate: b.bookingDate,
            bookingTypeId: b.bookingTypeId,
            originalTime: b.originalTime,
            editedTime: b.editedTime,
            calculatedTime: b.calculatedTime,
            pairId: b.pairId,
            source: b.source,
            notes: b.notes,
            bookingReasonId: b.bookingReasonId,
            isAutoGenerated: b.isAutoGenerated,
            originalBookingId: b.originalBookingId,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
            bookingType: b.bookingType ? {
              id: b.bookingType.id,
              code: b.bookingType.code,
              name: b.bookingType.name,
              direction: b.bookingType.direction,
            } : null,
            bookingReason: b.bookingReason ? {
              id: b.bookingReason.id,
              code: b.bookingReason.code,
              label: b.bookingReason.label,
            } : null,
          })),
          dailyValue: dailyValue ? mapDailyValueToOutput(dailyValue) : null,
          dayPlan: empDayPlan?.dayPlan ? {
            id: empDayPlan.dayPlan.id,
            code: empDayPlan.dayPlan.code,
            name: empDayPlan.dayPlan.name,
            planType: empDayPlan.dayPlan.planType,
          } : null,
          holiday: holiday ? {
            id: holiday.id,
            name: holiday.name,
          } : null,
          isHoliday,
          errors,
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),

  /**
   * employees.calculateDay -- Triggers manual recalculation for an employee/date.
   *
   * Calls DailyCalcService.calculateDay() and returns the DailyValue result.
   * Replaces Go POST /employees/{id}/day/{date}/calculate endpoint.
   *
   * Requires: time_tracking.edit permission
   * @see ZMI-TICKET-235
   */
  calculateDay: tenantProcedure
    .use(requirePermission(TIME_TRACKING_EDIT))
    .use(applyDataScope())
    .input(dayViewInputSchema) // Same input as dayView: { employeeId, date }
    .output(calculateDayOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const { employeeId, date: dateStr } = input
        const date = new Date(dateStr)
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        const result = await employeesService.calculateDay(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          dataScope,
          employeeId,
          date
        )

        // dailyValue may be null if calculation should be skipped
        if (!result) {
          return null
        }

        return mapDailyValueToOutput(result)
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
