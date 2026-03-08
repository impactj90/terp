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
import { Prisma } from "@/generated/prisma/client"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import {
  requirePermission,
  requireEmployeePermission,
  applyDataScope,
  type DataScope,
} from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { DailyCalcService } from "../services/daily-calc"

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

/**
 * Checks data scope access for a single employee.
 * Throws FORBIDDEN if the user's data scope does not cover this employee.
 */
function checkDataScope(
  dataScope: DataScope,
  employee: { id: string; departmentId: string | null }
): void {
  if (dataScope.type === "department") {
    if (
      !employee.departmentId ||
      !dataScope.departmentIds.includes(employee.departmentId)
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Employee not within data scope",
      })
    }
  } else if (dataScope.type === "employee") {
    if (!dataScope.employeeIds.includes(employee.id)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Employee not within data scope",
      })
    }
  }
}

/**
 * Builds data scope WHERE clause additions for list queries.
 */
function buildDataScopeWhere(
  dataScope: DataScope
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { departmentId: { in: dataScope.departmentIds } }
  } else if (dataScope.type === "employee") {
    return { id: { in: dataScope.employeeIds } }
  }
  return null
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

// --- Day View Helpers ---

/**
 * Maps calculation error codes to error type/severity for the day view response.
 * Port of Go error mapping from apps/api/internal/handler/booking.go lines 779-821.
 */
function mapErrorCodesToErrors(errorCodes: string[], warnings: string[]): { errorType: string; message: string; severity: "error" | "warning" }[] {
  const errors: { errorType: string; message: string; severity: "error" | "warning" }[] = []

  const errorCodeMap: Record<string, string> = {
    MISSING_COME: "missing_booking",
    MISSING_GO: "missing_booking",
    NO_BOOKINGS: "missing_booking",
    UNPAIRED_BOOKING: "unpaired_booking",
    DUPLICATE_IN_TIME: "overlapping_bookings",
    EARLY_COME: "core_time_violation",
    LATE_COME: "core_time_violation",
    MISSED_CORE_START: "core_time_violation",
    MISSED_CORE_END: "core_time_violation",
    BELOW_MIN_WORK_TIME: "below_min_hours",
    MAX_TIME_REACHED: "exceeds_max_hours",
  }

  for (const code of errorCodes) {
    errors.push({
      errorType: errorCodeMap[code] ?? "invalid_sequence",
      message: code,
      severity: "error",
    })
  }

  for (const code of warnings) {
    errors.push({
      errorType: code.toLowerCase(),
      message: code,
      severity: "warning",
    })
  }

  return errors
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
      const tenantId = ctx.tenantId!
      const page = input?.page ?? 1
      const pageSize = input?.pageSize ?? 20
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      const where: Record<string, unknown> = {
        tenantId,
        deletedAt: null,
      }

      // Optional filters
      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }
      if (input?.departmentId !== undefined) {
        where.departmentId = input.departmentId
      }
      if (input?.costCenterId !== undefined) {
        where.costCenterId = input.costCenterId
      }
      if (input?.employmentTypeId !== undefined) {
        where.employmentTypeId = input.employmentTypeId
      }
      if (input?.hasExitDate !== undefined) {
        where.exitDate = input.hasExitDate ? { not: null } : null
      }

      // Search
      if (input?.search) {
        where.OR = [
          { firstName: { contains: input.search, mode: "insensitive" } },
          { lastName: { contains: input.search, mode: "insensitive" } },
          {
            personnelNumber: {
              contains: input.search,
              mode: "insensitive",
            },
          },
          { email: { contains: input.search, mode: "insensitive" } },
        ]
      }

      // Data scope
      const scopeWhere = buildDataScopeWhere(dataScope)
      if (scopeWhere) {
        Object.assign(where, scopeWhere)
      }

      const [employees, total] = await Promise.all([
        ctx.prisma.employee.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        }),
        ctx.prisma.employee.count({ where }),
      ])

      return {
        items: employees.map(mapEmployeeToOutput),
        total,
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
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      const employee = await ctx.prisma.employee.findFirst({
        where: { id: input.id, tenantId, deletedAt: null },
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
          costCenter: {
            select: { id: true, code: true, name: true },
          },
          employmentType: {
            select: { id: true, code: true, name: true },
          },
          contacts: {
            orderBy: { createdAt: "asc" },
          },
          cards: {
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
          },
        },
      })

      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      // Check data scope
      checkDataScope(dataScope, employee)

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
      const tenantId = ctx.tenantId!

      // Trim and validate required fields
      const personnelNumber = input.personnelNumber.trim()
      if (personnelNumber.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Personnel number is required",
        })
      }

      const firstName = input.firstName.trim()
      if (firstName.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "First name is required",
        })
      }

      const lastName = input.lastName.trim()
      if (lastName.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Last name is required",
        })
      }

      // Validate entry date not more than 6 months in future
      const sixMonthsFromNow = new Date()
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
      if (input.entryDate > sixMonthsFromNow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Entry date cannot be more than 6 months in the future",
        })
      }

      // Validate exit date >= entry date
      if (input.exitDate && input.exitDate < input.entryDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Exit date cannot be before entry date",
        })
      }

      // Auto-assign PIN if not provided
      let pin = input.pin?.trim() || ""
      if (pin.length === 0) {
        const result = await ctx.prisma.$queryRaw<[{ max_pin: string }]>(
          Prisma.sql`SELECT COALESCE(MAX(pin::integer), 0) + 1 as max_pin FROM employees WHERE tenant_id = ${tenantId}::uuid AND pin ~ '^[0-9]+$'`
        )
        pin = String(result[0]?.max_pin ?? "1")
      }

      // Check personnel number uniqueness per tenant
      const existingByPN = await ctx.prisma.employee.findFirst({
        where: { tenantId, personnelNumber, deletedAt: null },
      })
      if (existingByPN) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Personnel number already exists",
        })
      }

      // Check PIN uniqueness per tenant
      const existingByPIN = await ctx.prisma.employee.findFirst({
        where: { tenantId, pin, deletedAt: null },
      })
      if (existingByPIN) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PIN already exists",
        })
      }

      // Build create data
      const employee = await ctx.prisma.employee.create({
        data: {
          tenantId,
          personnelNumber,
          pin,
          firstName,
          lastName,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          entryDate: input.entryDate,
          exitDate: input.exitDate ?? null,
          departmentId: input.departmentId ?? null,
          costCenterId: input.costCenterId ?? null,
          employmentTypeId: input.employmentTypeId ?? null,
          tariffId: input.tariffId ?? null,
          weeklyHours:
            input.weeklyHours !== undefined
              ? new Prisma.Decimal(input.weeklyHours)
              : new Prisma.Decimal(40.0),
          vacationDaysPerYear:
            input.vacationDaysPerYear !== undefined
              ? new Prisma.Decimal(input.vacationDaysPerYear)
              : new Prisma.Decimal(30.0),
          isActive: input.isActive ?? true,
          disabilityFlag: input.disabilityFlag ?? false,
          exitReason: input.exitReason?.trim() || null,
          notes: input.notes?.trim() || null,
          addressStreet: input.addressStreet?.trim() || null,
          addressZip: input.addressZip?.trim() || null,
          addressCity: input.addressCity?.trim() || null,
          addressCountry: input.addressCountry?.trim() || null,
          birthDate: input.birthDate ?? null,
          gender: input.gender?.trim() || null,
          nationality: input.nationality?.trim() || null,
          religion: input.religion?.trim() || null,
          maritalStatus: input.maritalStatus?.trim() || null,
          birthPlace: input.birthPlace?.trim() || null,
          birthCountry: input.birthCountry?.trim() || null,
          roomNumber: input.roomNumber?.trim() || null,
          photoUrl: input.photoUrl?.trim() || null,
          employeeGroupId: input.employeeGroupId ?? null,
          workflowGroupId: input.workflowGroupId ?? null,
          activityGroupId: input.activityGroupId ?? null,
          defaultOrderId: input.defaultOrderId ?? null,
          defaultActivityId: input.defaultActivityId ?? null,
          partTimePercent:
            input.partTimePercent !== undefined
              ? new Prisma.Decimal(input.partTimePercent)
              : null,
          dailyTargetHours:
            input.dailyTargetHours !== undefined
              ? new Prisma.Decimal(input.dailyTargetHours)
              : null,
          weeklyTargetHours:
            input.weeklyTargetHours !== undefined
              ? new Prisma.Decimal(input.weeklyTargetHours)
              : null,
          monthlyTargetHours:
            input.monthlyTargetHours !== undefined
              ? new Prisma.Decimal(input.monthlyTargetHours)
              : null,
          annualTargetHours:
            input.annualTargetHours !== undefined
              ? new Prisma.Decimal(input.annualTargetHours)
              : null,
          workDaysPerWeek:
            input.workDaysPerWeek !== undefined
              ? new Prisma.Decimal(input.workDaysPerWeek)
              : null,
          calculationStartDate: input.calculationStartDate ?? null,
        },
      })

      return mapEmployeeToOutput(employee)
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
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // Verify employee exists (tenant-scoped, not deleted)
      const existing = await ctx.prisma.employee.findFirst({
        where: { id: input.id, tenantId, deletedAt: null },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      // Check data scope
      checkDataScope(dataScope, existing)

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle personnelNumber update
      if (input.personnelNumber !== undefined) {
        const personnelNumber = input.personnelNumber.trim()
        if (personnelNumber.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Personnel number is required",
          })
        }
        if (personnelNumber !== existing.personnelNumber) {
          const existingByPN = await ctx.prisma.employee.findFirst({
            where: {
              tenantId,
              personnelNumber,
              deletedAt: null,
              NOT: { id: input.id },
            },
          })
          if (existingByPN) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Personnel number already exists",
            })
          }
        }
        data.personnelNumber = personnelNumber
      }

      // Handle PIN update
      if (input.pin !== undefined) {
        const pin = input.pin.trim()
        if (pin.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "PIN is required",
          })
        }
        if (pin !== existing.pin) {
          const existingByPIN = await ctx.prisma.employee.findFirst({
            where: {
              tenantId,
              pin,
              deletedAt: null,
              NOT: { id: input.id },
            },
          })
          if (existingByPIN) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "PIN already exists",
            })
          }
        }
        data.pin = pin
      }

      // Handle firstName update
      if (input.firstName !== undefined) {
        const firstName = input.firstName.trim()
        if (firstName.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "First name is required",
          })
        }
        data.firstName = firstName
      }

      // Handle lastName update
      if (input.lastName !== undefined) {
        const lastName = input.lastName.trim()
        if (lastName.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Last name is required",
          })
        }
        data.lastName = lastName
      }

      // Simple string/nullable fields
      if (input.email !== undefined) {
        data.email = input.email === null ? null : input.email.trim() || null
      }
      if (input.phone !== undefined) {
        data.phone = input.phone === null ? null : input.phone.trim() || null
      }

      // Date fields with validation
      if (input.entryDate !== undefined) {
        data.entryDate = input.entryDate
      }
      if (input.exitDate !== undefined) {
        data.exitDate = input.exitDate
      }

      // Validate entry/exit date constraints
      const effectiveEntryDate =
        (data.entryDate as Date | undefined) ?? existing.entryDate
      const effectiveExitDate =
        data.exitDate !== undefined
          ? (data.exitDate as Date | null)
          : existing.exitDate
      if (effectiveExitDate && effectiveExitDate < effectiveEntryDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Exit date cannot be before entry date",
        })
      }

      // Nullable FK fields with clear pattern
      if (input.clearDepartmentId) {
        data.departmentId = null
      } else if (input.departmentId !== undefined) {
        data.departmentId = input.departmentId
      }

      if (input.clearCostCenterId) {
        data.costCenterId = null
      } else if (input.costCenterId !== undefined) {
        data.costCenterId = input.costCenterId
      }

      if (input.clearEmploymentTypeId) {
        data.employmentTypeId = null
      } else if (input.employmentTypeId !== undefined) {
        data.employmentTypeId = input.employmentTypeId
      }

      if (input.clearTariffId) {
        data.tariffId = null
      } else if (input.tariffId !== undefined) {
        data.tariffId = input.tariffId
      }

      if (input.clearEmployeeGroupId) {
        data.employeeGroupId = null
      } else if (input.employeeGroupId !== undefined) {
        data.employeeGroupId = input.employeeGroupId
      }

      if (input.clearWorkflowGroupId) {
        data.workflowGroupId = null
      } else if (input.workflowGroupId !== undefined) {
        data.workflowGroupId = input.workflowGroupId
      }

      if (input.clearActivityGroupId) {
        data.activityGroupId = null
      } else if (input.activityGroupId !== undefined) {
        data.activityGroupId = input.activityGroupId
      }

      if (input.clearDefaultOrderId) {
        data.defaultOrderId = null
      } else if (input.defaultOrderId !== undefined) {
        data.defaultOrderId = input.defaultOrderId
      }

      if (input.clearDefaultActivityId) {
        data.defaultActivityId = null
      } else if (input.defaultActivityId !== undefined) {
        data.defaultActivityId = input.defaultActivityId
      }

      // Boolean fields
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }
      if (input.disabilityFlag !== undefined) {
        data.disabilityFlag = input.disabilityFlag
      }

      // Decimal fields
      if (input.weeklyHours !== undefined) {
        data.weeklyHours = new Prisma.Decimal(input.weeklyHours)
      }
      if (input.vacationDaysPerYear !== undefined) {
        data.vacationDaysPerYear = new Prisma.Decimal(
          input.vacationDaysPerYear
        )
      }
      if (input.partTimePercent !== undefined) {
        data.partTimePercent =
          input.partTimePercent === null
            ? null
            : new Prisma.Decimal(input.partTimePercent)
      }
      if (input.dailyTargetHours !== undefined) {
        data.dailyTargetHours =
          input.dailyTargetHours === null
            ? null
            : new Prisma.Decimal(input.dailyTargetHours)
      }
      if (input.weeklyTargetHours !== undefined) {
        data.weeklyTargetHours =
          input.weeklyTargetHours === null
            ? null
            : new Prisma.Decimal(input.weeklyTargetHours)
      }
      if (input.monthlyTargetHours !== undefined) {
        data.monthlyTargetHours =
          input.monthlyTargetHours === null
            ? null
            : new Prisma.Decimal(input.monthlyTargetHours)
      }
      if (input.annualTargetHours !== undefined) {
        data.annualTargetHours =
          input.annualTargetHours === null
            ? null
            : new Prisma.Decimal(input.annualTargetHours)
      }
      if (input.workDaysPerWeek !== undefined) {
        data.workDaysPerWeek =
          input.workDaysPerWeek === null
            ? null
            : new Prisma.Decimal(input.workDaysPerWeek)
      }

      // Extended string fields
      if (input.exitReason !== undefined) {
        data.exitReason =
          input.exitReason === null ? null : input.exitReason.trim() || null
      }
      if (input.notes !== undefined) {
        data.notes =
          input.notes === null ? null : input.notes.trim() || null
      }
      if (input.addressStreet !== undefined) {
        data.addressStreet =
          input.addressStreet === null
            ? null
            : input.addressStreet.trim() || null
      }
      if (input.addressZip !== undefined) {
        data.addressZip =
          input.addressZip === null ? null : input.addressZip.trim() || null
      }
      if (input.addressCity !== undefined) {
        data.addressCity =
          input.addressCity === null ? null : input.addressCity.trim() || null
      }
      if (input.addressCountry !== undefined) {
        data.addressCountry =
          input.addressCountry === null
            ? null
            : input.addressCountry.trim() || null
      }
      if (input.birthDate !== undefined) {
        data.birthDate = input.birthDate
      }
      if (input.gender !== undefined) {
        data.gender =
          input.gender === null ? null : input.gender.trim() || null
      }
      if (input.nationality !== undefined) {
        data.nationality =
          input.nationality === null
            ? null
            : input.nationality.trim() || null
      }
      if (input.religion !== undefined) {
        data.religion =
          input.religion === null ? null : input.religion.trim() || null
      }
      if (input.maritalStatus !== undefined) {
        data.maritalStatus =
          input.maritalStatus === null
            ? null
            : input.maritalStatus.trim() || null
      }
      if (input.birthPlace !== undefined) {
        data.birthPlace =
          input.birthPlace === null ? null : input.birthPlace.trim() || null
      }
      if (input.birthCountry !== undefined) {
        data.birthCountry =
          input.birthCountry === null
            ? null
            : input.birthCountry.trim() || null
      }
      if (input.roomNumber !== undefined) {
        data.roomNumber =
          input.roomNumber === null ? null : input.roomNumber.trim() || null
      }
      if (input.photoUrl !== undefined) {
        data.photoUrl =
          input.photoUrl === null ? null : input.photoUrl.trim() || null
      }
      if (input.calculationStartDate !== undefined) {
        data.calculationStartDate = input.calculationStartDate
      }

      const employee = await ctx.prisma.employee.update({
        where: { id: input.id },
        data,
      })

      return mapEmployeeToOutput(employee)
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
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // Verify employee exists (tenant-scoped, not deleted)
      const existing = await ctx.prisma.employee.findFirst({
        where: { id: input.id, tenantId, deletedAt: null },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }

      // Check data scope
      checkDataScope(dataScope, existing)

      // Deactivate (not hard-delete) -- mirrors Go service.Deactivate()
      await ctx.prisma.employee.update({
        where: { id: input.id },
        data: {
          isActive: false,
          exitDate: existing.exitDate ?? new Date(),
        },
      })

      return { success: true }
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
      const tenantId = ctx.tenantId!

      const employees = await ctx.prisma.employee.findMany({
        where: {
          tenantId,
          isActive: true,
          deletedAt: null,
          OR: [
            {
              firstName: { contains: input.query, mode: "insensitive" },
            },
            {
              lastName: { contains: input.query, mode: "insensitive" },
            },
            {
              personnelNumber: {
                contains: input.query,
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          id: true,
          personnelNumber: true,
          firstName: true,
          lastName: true,
        },
        take: 20,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      })

      return { items: employees }
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
      const tenantId = ctx.tenantId!
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      let updated = 0
      let skipped = 0

      for (const employeeId of input.employeeIds) {
        const employee = await ctx.prisma.employee.findFirst({
          where: { id: employeeId, tenantId, deletedAt: null },
        })

        if (!employee) {
          skipped++
          continue
        }

        // Check data scope per employee
        try {
          checkDataScope(dataScope, employee)
        } catch {
          skipped++
          continue
        }

        const tariffValue = input.clearTariff ? null : input.tariffId
        await ctx.prisma.employee.update({
          where: { id: employeeId },
          data: { tariffId: tariffValue },
        })
        updated++
      }

      return { updated, skipped }
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
      const tenantId = ctx.tenantId!
      const { employeeId, date: dateStr } = input
      const date = new Date(dateStr)

      // 1. Load bookings for the day (with bookingType + bookingReason relations)
      const bookings = await ctx.prisma.booking.findMany({
        where: { tenantId, employeeId, bookingDate: date },
        include: {
          bookingType: { select: { id: true, code: true, name: true, direction: true } },
          bookingReason: { select: { id: true, code: true, label: true } },
        },
        orderBy: { editedTime: "asc" },
      })

      // 2. Load daily value (may be null)
      const dailyValue = await ctx.prisma.dailyValue.findUnique({
        where: { employeeId_valueDate: { employeeId, valueDate: date } },
      })

      // 3. Load employee day plan with day plan details
      const empDayPlan = await ctx.prisma.employeeDayPlan.findUnique({
        where: { employeeId_planDate: { employeeId, planDate: date } },
        include: {
          dayPlan: { select: { id: true, code: true, name: true, planType: true } },
        },
      })

      // 4. Check for holiday
      const holiday = await ctx.prisma.holiday.findUnique({
        where: { tenantId_holidayDate: { tenantId, holidayDate: date } },
      })
      const isHoliday = holiday !== null

      // 5. Build error list from daily value
      const errors = dailyValue
        ? mapErrorCodesToErrors(dailyValue.errorCodes, dailyValue.warnings)
        : []

      // 6. Build response
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
        dailyValue: dailyValue ? {
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
        } : null,
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
      const tenantId = ctx.tenantId!
      const { employeeId, date: dateStr } = input
      const date = new Date(dateStr)
      const dataScope = (ctx as unknown as { dataScope: DataScope }).dataScope

      // Validate employee exists and is within data scope
      const employee = await ctx.prisma.employee.findFirst({
        where: { id: employeeId, tenantId, deletedAt: null },
      })
      if (!employee) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Employee not found",
        })
      }
      checkDataScope(dataScope, employee)

      // Trigger calculation
      const service = new DailyCalcService(ctx.prisma)
      const result = await service.calculateDay(tenantId, employeeId, date)

      // dailyValue may be null if calculation should be skipped
      if (!result) {
        return null
      }

      return {
        id: result.id,
        tenantId: result.tenantId,
        employeeId: result.employeeId,
        valueDate: result.valueDate,
        status: result.status,
        grossTime: result.grossTime,
        netTime: result.netTime,
        targetTime: result.targetTime,
        overtime: result.overtime,
        undertime: result.undertime,
        breakTime: result.breakTime,
        balanceMinutes: result.netTime - result.targetTime,
        hasError: result.hasError,
        errorCodes: result.errorCodes,
        warnings: result.warnings,
        firstCome: result.firstCome,
        lastGo: result.lastGo,
        bookingCount: result.bookingCount,
        calculatedAt: result.calculatedAt,
      }
    }),
})
