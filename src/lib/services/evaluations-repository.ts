/**
 * Evaluations Repository
 *
 * Pure Prisma data-access functions for evaluation queries.
 * Covers daily values, bookings, terminal bookings, audit logs (logs + workflow).
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Prisma Include Objects ---

const evalDailyValueInclude = {
  employee: {
    select: {
      id: true,
      personnelNumber: true,
      firstName: true,
      lastName: true,
      isActive: true,
    },
  },
} as const

const evalBookingInclude = {
  employee: {
    select: {
      id: true,
      personnelNumber: true,
      firstName: true,
      lastName: true,
      isActive: true,
    },
  },
  bookingType: {
    select: { id: true, code: true, name: true, direction: true },
  },
} as const

const evalLogInclude = {
  user: {
    select: { id: true, displayName: true },
  },
} as const

// --- Daily Values ---

export interface DailyValuesParams {
  fromDate: string
  toDate: string
  employeeId?: string
  departmentId?: string
  hasErrors?: boolean
  page: number
  pageSize: number
  dataScopeWhere?: Record<string, unknown> | null
}

export async function findDailyValues(
  prisma: PrismaClient,
  tenantId: string,
  params: DailyValuesParams
) {
  const where: Record<string, unknown> = { tenantId }

  where.valueDate = {
    gte: new Date(params.fromDate),
    lte: new Date(params.toDate),
  }

  if (params.employeeId) {
    where.employeeId = params.employeeId
  }

  if (params.hasErrors !== undefined) {
    where.hasError = params.hasErrors
  }

  if (params.departmentId) {
    where.employee = {
      ...((where.employee as Record<string, unknown>) || {}),
      departmentId: params.departmentId,
    }
  }

  // Apply data scope filtering
  if (params.dataScopeWhere) {
    if (params.dataScopeWhere.employee && where.employee) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        ...((params.dataScopeWhere.employee as Record<string, unknown>) || {}),
      }
    } else {
      Object.assign(where, params.dataScopeWhere)
    }
  }

  const [items, total] = await Promise.all([
    prisma.dailyValue.findMany({
      where,
      include: evalDailyValueInclude,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { valueDate: "asc" },
    }),
    prisma.dailyValue.count({ where }),
  ])

  return { items, total }
}

// --- Bookings ---

export interface BookingsParams {
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

export async function findBookings(
  prisma: PrismaClient,
  tenantId: string,
  params: BookingsParams
) {
  const where: Record<string, unknown> = { tenantId }

  where.bookingDate = {
    gte: new Date(params.fromDate),
    lte: new Date(params.toDate),
  }

  if (params.employeeId) {
    where.employeeId = params.employeeId
  }

  if (params.bookingTypeId) {
    where.bookingTypeId = params.bookingTypeId
  }

  if (params.source) {
    where.source = params.source
  }

  // Direction filter via bookingType relation
  if (params.direction) {
    where.bookingType = {
      ...((where.bookingType as Record<string, unknown>) || {}),
      direction: params.direction,
    }
  }

  if (params.departmentId) {
    where.employee = {
      ...((where.employee as Record<string, unknown>) || {}),
      departmentId: params.departmentId,
    }
  }

  // Apply data scope filtering
  if (params.dataScopeWhere) {
    if (params.dataScopeWhere.employee && where.employee) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        ...((params.dataScopeWhere.employee as Record<string, unknown>) || {}),
      }
    } else {
      Object.assign(where, params.dataScopeWhere)
    }
  }

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: evalBookingInclude,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: [{ bookingDate: "desc" }, { editedTime: "desc" }],
    }),
    prisma.booking.count({ where }),
  ])

  return { items, total }
}

// --- Terminal Bookings ---

export interface TerminalBookingsParams {
  fromDate: string
  toDate: string
  employeeId?: string
  departmentId?: string
  page: number
  pageSize: number
  dataScopeWhere?: Record<string, unknown> | null
}

export async function findTerminalBookings(
  prisma: PrismaClient,
  tenantId: string,
  params: TerminalBookingsParams
) {
  const where: Record<string, unknown> = { tenantId }

  where.bookingDate = {
    gte: new Date(params.fromDate),
    lte: new Date(params.toDate),
  }

  // Hardcoded terminal source filter
  where.source = "terminal"

  if (params.employeeId) {
    where.employeeId = params.employeeId
  }

  if (params.departmentId) {
    where.employee = {
      ...((where.employee as Record<string, unknown>) || {}),
      departmentId: params.departmentId,
    }
  }

  // Apply data scope filtering
  if (params.dataScopeWhere) {
    if (params.dataScopeWhere.employee && where.employee) {
      where.employee = {
        ...((where.employee as Record<string, unknown>) || {}),
        ...((params.dataScopeWhere.employee as Record<string, unknown>) || {}),
      }
    } else {
      Object.assign(where, params.dataScopeWhere)
    }
  }

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: evalBookingInclude,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: [{ bookingDate: "desc" }, { editedTime: "desc" }],
    }),
    prisma.booking.count({ where }),
  ])

  return { items, total }
}

// --- Audit Logs (Evaluations) ---

export interface LogsParams {
  fromDate: string
  toDate: string
  entityType?: string
  action?: string
  userId?: string
  page: number
  pageSize: number
}

export async function findLogs(
  prisma: PrismaClient,
  tenantId: string,
  params: LogsParams
) {
  const where: Record<string, unknown> = { tenantId }

  // Date range filter with end-of-day adjustment
  const toEnd = new Date(params.toDate)
  toEnd.setHours(23, 59, 59, 999)
  where.performedAt = {
    gte: new Date(params.fromDate),
    lte: toEnd,
  }

  if (params.entityType) {
    where.entityType = params.entityType
  }

  if (params.action) {
    where.action = params.action
  }

  if (params.userId) {
    where.userId = params.userId
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: evalLogInclude,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { performedAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ])

  return { items, total }
}

// --- Workflow History ---

export interface WorkflowHistoryParams {
  fromDate: string
  toDate: string
  entityType?: string
  action?: string
  page: number
  pageSize: number
}

export async function findWorkflowHistory(
  prisma: PrismaClient,
  tenantId: string,
  params: WorkflowHistoryParams
) {
  const where: Record<string, unknown> = { tenantId }

  // Date range filter with end-of-day adjustment
  const toEnd = new Date(params.toDate)
  toEnd.setHours(23, 59, 59, 999)
  where.performedAt = {
    gte: new Date(params.fromDate),
    lte: toEnd,
  }

  // Default entity types for workflow (when not specified)
  const entityTypes = params.entityType
    ? [params.entityType]
    : ["absence", "monthly_value"]
  where.entityType = { in: entityTypes }

  // Default actions for workflow (when not specified)
  const actions = params.action
    ? [params.action]
    : ["create", "approve", "reject", "close", "reopen"]
  where.action = { in: actions }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: evalLogInclude,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { performedAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ])

  return { items, total }
}
