/**
 * Evaluations Service
 *
 * Business logic for evaluation query operations.
 * Maps raw Prisma records to evaluation output shapes.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./evaluations-repository"

// --- Helper Functions ---

/**
 * Converts minutes from midnight to HH:MM string.
 * Port of Go timeutil.MinutesToString().
 */
function minutesToTimeString(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
}

// --- Data Scope Helper ---

/**
 * Builds a Prisma WHERE clause for evaluation data scope filtering.
 */
export function buildDataScopeWhere(
  dataScope: { type: string; departmentIds?: string[]; employeeIds?: string[] }
): Record<string, unknown> | null {
  if (dataScope.type === "department") {
    return { employee: { departmentId: { in: dataScope.departmentIds } } }
  } else if (dataScope.type === "employee") {
    return { employeeId: { in: dataScope.employeeIds } }
  }
  return null
}

// --- Service Functions ---

export async function listDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    fromDate: string
    toDate: string
    employeeId?: string
    departmentId?: string
    hasErrors?: boolean
    page: number
    pageSize: number
    dataScopeWhere?: Record<string, unknown> | null
  }
) {
  const { items, total } = await repo.findDailyValues(prisma, tenantId, params)

  return {
    items: items.map((record) => {
      const r = record as unknown as Record<string, unknown>
      const overtime = (r.overtime as number) ?? 0
      const undertime = (r.undertime as number) ?? 0
      const employee = r.employee as Record<string, unknown> | null | undefined

      return {
        id: r.id as string,
        employeeId: r.employeeId as string,
        valueDate: r.valueDate as Date,
        status: (r.status as string) || "pending",
        targetMinutes: (r.targetTime as number) ?? 0,
        grossMinutes: (r.grossTime as number) ?? 0,
        netMinutes: (r.netTime as number) ?? 0,
        breakMinutes: (r.breakTime as number) ?? 0,
        overtimeMinutes: overtime,
        undertimeMinutes: undertime,
        balanceMinutes: overtime - undertime,
        bookingCount: (r.bookingCount as number) ?? 0,
        hasErrors: (r.hasError as boolean) ?? false,
        firstCome: (r.firstCome as number | null) ?? null,
        lastGo: (r.lastGo as number | null) ?? null,
        employee: employee
          ? {
              id: employee.id as string,
              personnelNumber: employee.personnelNumber as string,
              firstName: employee.firstName as string,
              lastName: employee.lastName as string,
              isActive: employee.isActive as boolean,
            }
          : null,
      }
    }),
    total,
  }
}

export async function listBookings(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    fromDate: string
    toDate: string
    employeeId?: string
    departmentId?: string
    bookingTypeId?: string
    source?: string
    direction?: string
    page: number
    pageSize: number
    dataScopeWhere?: Record<string, unknown> | null
  }
) {
  const { items, total } = await repo.findBookings(prisma, tenantId, params)

  return {
    items: items.map((record) => {
      const r = record as unknown as Record<string, unknown>
      const employee = r.employee as Record<string, unknown> | null | undefined
      const bookingType = r.bookingType as
        | Record<string, unknown>
        | null
        | undefined
      const editedTime = (r.editedTime as number) ?? 0

      return {
        id: r.id as string,
        employeeId: r.employeeId as string,
        bookingDate: r.bookingDate as Date,
        bookingTypeId: r.bookingTypeId as string,
        originalTime: (r.originalTime as number) ?? 0,
        editedTime,
        calculatedTime: (r.calculatedTime as number | null) ?? null,
        timeString: minutesToTimeString(editedTime),
        pairId: (r.pairId as string | null) ?? null,
        terminalId: (r.terminalId as string | null) ?? null,
        source: (r.source as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        createdAt: r.createdAt as Date,
        employee: employee
          ? {
              id: employee.id as string,
              personnelNumber: employee.personnelNumber as string,
              firstName: employee.firstName as string,
              lastName: employee.lastName as string,
              isActive: employee.isActive as boolean,
            }
          : null,
        bookingType: bookingType
          ? {
              id: bookingType.id as string,
              code: bookingType.code as string,
              name: bookingType.name as string,
              direction: bookingType.direction as string,
            }
          : null,
      }
    }),
    total,
  }
}

export async function listTerminalBookings(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    fromDate: string
    toDate: string
    employeeId?: string
    departmentId?: string
    page: number
    pageSize: number
    dataScopeWhere?: Record<string, unknown> | null
  }
) {
  const { items, total } = await repo.findTerminalBookings(
    prisma,
    tenantId,
    params
  )

  return {
    items: items.map((record) => {
      const r = record as unknown as Record<string, unknown>
      const employee = r.employee as Record<string, unknown> | null | undefined
      const bookingType = r.bookingType as
        | Record<string, unknown>
        | null
        | undefined
      const originalTime = (r.originalTime as number) ?? 0
      const editedTime = (r.editedTime as number) ?? 0

      return {
        id: r.id as string,
        employeeId: r.employeeId as string,
        bookingDate: r.bookingDate as Date,
        bookingTypeId: r.bookingTypeId as string,
        originalTime,
        editedTime,
        calculatedTime: (r.calculatedTime as number | null) ?? null,
        wasEdited: originalTime !== editedTime,
        originalTimeString: minutesToTimeString(originalTime),
        editedTimeString: minutesToTimeString(editedTime),
        source: (r.source as string | null) ?? null,
        terminalId: (r.terminalId as string | null) ?? null,
        createdAt: r.createdAt as Date,
        employee: employee
          ? {
              id: employee.id as string,
              personnelNumber: employee.personnelNumber as string,
              firstName: employee.firstName as string,
              lastName: employee.lastName as string,
              isActive: employee.isActive as boolean,
            }
          : null,
        bookingType: bookingType
          ? {
              id: bookingType.id as string,
              code: bookingType.code as string,
              name: bookingType.name as string,
              direction: bookingType.direction as string,
            }
          : null,
      }
    }),
    total,
  }
}

export async function listLogs(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    fromDate: string
    toDate: string
    entityType?: string
    action?: string
    userId?: string
    page: number
    pageSize: number
  }
) {
  const { items, total } = await repo.findLogs(prisma, tenantId, params)

  return {
    items: items.map((record) => {
      const r = record as unknown as Record<string, unknown>
      const user = r.user as Record<string, unknown> | null | undefined

      return {
        id: r.id as string,
        action: r.action as string,
        entityType: r.entityType as string,
        entityId: r.entityId as string,
        entityName: (r.entityName as string | null) ?? null,
        changes: r.changes ?? null,
        performedAt: r.performedAt as Date,
        userId: (r.userId as string | null) ?? null,
        user: user
          ? {
              id: user.id as string,
              displayName: user.displayName as string,
            }
          : null,
      }
    }),
    total,
  }
}

export async function listWorkflowHistory(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    fromDate: string
    toDate: string
    entityType?: string
    action?: string
    page: number
    pageSize: number
  }
) {
  const { items, total } = await repo.findWorkflowHistory(
    prisma,
    tenantId,
    params
  )

  return {
    items: items.map((record) => {
      const r = record as unknown as Record<string, unknown>
      const user = r.user as Record<string, unknown> | null | undefined

      return {
        id: r.id as string,
        action: r.action as string,
        entityType: r.entityType as string,
        entityId: r.entityId as string,
        entityName: (r.entityName as string | null) ?? null,
        metadata: r.metadata ?? null,
        performedAt: r.performedAt as Date,
        userId: (r.userId as string | null) ?? null,
        user: user
          ? {
              id: user.id as string,
              displayName: user.displayName as string,
            }
          : null,
      }
    }),
    total,
  }
}
