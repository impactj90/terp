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
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  personnelNumber: z.string(),
  pin: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  entryDate: z.date(),
  exitDate: z.date().nullable(),
  departmentId: z.string().uuid().nullable(),
  costCenterId: z.string().uuid().nullable(),
  employmentTypeId: z.string().uuid().nullable(),
  tariffId: z.string().uuid().nullable(),
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
  employeeGroupId: z.string().uuid().nullable(),
  workflowGroupId: z.string().uuid().nullable(),
  activityGroupId: z.string().uuid().nullable(),
  // Order FKs
  defaultOrderId: z.string().uuid().nullable(),
  defaultActivityId: z.string().uuid().nullable(),
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
})

type EmployeeOutput = z.infer<typeof employeeOutputSchema>

const employeeDetailOutputSchema = employeeOutputSchema.extend({
  department: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      code: z.string(),
    })
    .nullable(),
  costCenter: z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
    })
    .nullable(),
  employmentType: z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
    })
    .nullable(),
  contacts: z.array(
    z.object({
      id: z.string().uuid(),
      employeeId: z.string().uuid(),
      contactType: z.string(),
      value: z.string(),
      label: z.string().nullable(),
      isPrimary: z.boolean(),
      contactKindId: z.string().uuid().nullable(),
      createdAt: z.date(),
      updatedAt: z.date(),
    })
  ),
  cards: z.array(
    z.object({
      id: z.string().uuid(),
      tenantId: z.string().uuid(),
      employeeId: z.string().uuid(),
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
  id: z.string().uuid(),
  personnelNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
})

// --- Input Schemas ---

const listEmployeesInputSchema = z
  .object({
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(20),
    search: z.string().optional(),
    departmentId: z.string().uuid().optional(),
    costCenterId: z.string().uuid().optional(),
    employmentTypeId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
    hasExitDate: z.boolean().optional(),
  })
  .optional()

const createEmployeeInputSchema = z.object({
  personnelNumber: z.string().min(1, "Personnel number is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  pin: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  entryDate: z.coerce.date(),
  exitDate: z.coerce.date().optional(),
  departmentId: z.string().uuid().optional(),
  costCenterId: z.string().uuid().optional(),
  employmentTypeId: z.string().uuid().optional(),
  tariffId: z.string().uuid().optional(),
  weeklyHours: z.number().optional(),
  vacationDaysPerYear: z.number().optional(),
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
  employeeGroupId: z.string().uuid().optional(),
  workflowGroupId: z.string().uuid().optional(),
  activityGroupId: z.string().uuid().optional(),
  // Order FKs
  defaultOrderId: z.string().uuid().optional(),
  defaultActivityId: z.string().uuid().optional(),
  // Tariff overrides
  partTimePercent: z.number().optional(),
  dailyTargetHours: z.number().optional(),
  weeklyTargetHours: z.number().optional(),
  monthlyTargetHours: z.number().optional(),
  annualTargetHours: z.number().optional(),
  workDaysPerWeek: z.number().optional(),
  // System
  calculationStartDate: z.coerce.date().optional(),
})

const updateEmployeeInputSchema = z.object({
  id: z.string().uuid(),
  personnelNumber: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  pin: z.string().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  entryDate: z.coerce.date().optional(),
  exitDate: z.coerce.date().nullable().optional(),
  departmentId: z.string().uuid().optional(),
  costCenterId: z.string().uuid().optional(),
  employmentTypeId: z.string().uuid().optional(),
  tariffId: z.string().uuid().optional(),
  weeklyHours: z.number().optional(),
  vacationDaysPerYear: z.number().optional(),
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
  employeeGroupId: z.string().uuid().optional(),
  workflowGroupId: z.string().uuid().optional(),
  activityGroupId: z.string().uuid().optional(),
  // Order FKs
  defaultOrderId: z.string().uuid().optional(),
  defaultActivityId: z.string().uuid().optional(),
  // Tariff overrides
  partTimePercent: z.number().nullable().optional(),
  dailyTargetHours: z.number().nullable().optional(),
  weeklyTargetHours: z.number().nullable().optional(),
  monthlyTargetHours: z.number().nullable().optional(),
  annualTargetHours: z.number().nullable().optional(),
  workDaysPerWeek: z.number().nullable().optional(),
  // System
  calculationStartDate: z.coerce.date().nullable().optional(),
  // Clear flags for nullable FKs
  clearDepartmentId: z.boolean().optional(),
  clearCostCenterId: z.boolean().optional(),
  clearEmploymentTypeId: z.boolean().optional(),
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
    pin: emp.pin,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    phone: emp.phone,
    entryDate: emp.entryDate,
    exitDate: emp.exitDate,
    departmentId: emp.departmentId,
    costCenterId: emp.costCenterId,
    employmentTypeId: emp.employmentTypeId,
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
  }
}

// --- Day View Schemas ---

const dayViewDailyErrorSchema = z.object({
  errorType: z.string(),
  message: z.string(),
  severity: z.enum(["error", "warning"]),
})

const dayViewDailyValueSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
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
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  planType: z.string(),
}).nullable()

const dayViewHolidaySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
}).nullable()

const dayViewBookingSchema = z.object({
  id: z.string().uuid(),
  employeeId: z.string().uuid(),
  bookingDate: z.date(),
  bookingTypeId: z.string().uuid(),
  originalTime: z.number().int(),
  editedTime: z.number().int(),
  calculatedTime: z.number().int().nullable(),
  pairId: z.string().uuid().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  bookingReasonId: z.string().uuid().nullable(),
  isAutoGenerated: z.boolean(),
  originalBookingId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  bookingType: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    direction: z.string(),
  }).nullable(),
  bookingReason: z.object({
    id: z.string().uuid(),
    code: z.string(),
    label: z.string(),
  }).nullable(),
})

const dayViewInputSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string().date(), // YYYY-MM-DD
})

const dayViewOutputSchema = z.object({
  employeeId: z.string().uuid(),
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
        items: z.array(employeeOutputSchema),
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
          items: employees.map(mapEmployeeToOutput),
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
    .input(z.object({ id: z.string().uuid() }))
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
    .input(createEmployeeInputSchema)
    .output(employeeOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const employee = await employeesService.create(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input
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
          input
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
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

        await employeesService.deactivate(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          dataScope,
          input.id
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
    .input(z.object({ query: z.string().min(1) }))
    .output(z.object({ items: z.array(employeeSearchOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!

        const employees = await employeesService.searchEmployees(
          ctx.prisma as unknown as PrismaClient,
          tenantId,
          input.query
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
        employeeIds: z.array(z.string().uuid()),
        tariffId: z.string().uuid().nullable(),
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
          input
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
