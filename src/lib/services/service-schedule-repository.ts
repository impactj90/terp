/**
 * ServiceSchedule Repository
 *
 * Canonical Prisma queries for `service_schedules`. All reads and writes
 * are tenant-scoped — see `service-object-repository.ts` for the pattern.
 *
 * Plan: 2026-04-22-serviceobjekte-wartungsintervalle.md (Phase B)
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

type Tx = PrismaClient | Prisma.TransactionClient

// --- Standard Include ---
//
// Used by findById/findMany so the service layer gets serviceObject
// (+ nested customer), defaultActivity and responsibleEmployee for
// DTO assembly without extra round-trips.

const standardInclude = {
  serviceObject: {
    select: {
      id: true,
      number: true,
      name: true,
      kind: true,
      customerAddress: {
        select: { id: true, number: true, company: true },
      },
    },
  },
  defaultActivity: {
    select: { id: true, code: true, name: true },
  },
  responsibleEmployee: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const

export type ServiceScheduleWithIncludes = Prisma.ServiceScheduleGetPayload<{
  include: typeof standardInclude
}>

// --- Query Params ---

export interface ListParams {
  serviceObjectId?: string
  isActive?: boolean
  customerAddressId?: string
  page?: number
  pageSize?: number
}

// --- Reads ---

export async function findMany(
  prisma: Tx,
  tenantId: string,
  params?: ListParams,
): Promise<{ items: ServiceScheduleWithIncludes[]; total: number }> {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 50

  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }
  if (params?.serviceObjectId) {
    where.serviceObjectId = params.serviceObjectId
  }
  if (params?.customerAddressId) {
    where.serviceObject = { customerAddressId: params.customerAddressId }
  }

  const [items, total] = await Promise.all([
    prisma.serviceSchedule.findMany({
      where,
      include: standardInclude,
      orderBy: [{ nextDueAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.serviceSchedule.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<ServiceScheduleWithIncludes | null> {
  return prisma.serviceSchedule.findFirst({
    where: { id, tenantId },
    include: standardInclude,
  })
}

export async function findManyByServiceObject(
  prisma: Tx,
  tenantId: string,
  serviceObjectId: string,
): Promise<ServiceScheduleWithIncludes[]> {
  return prisma.serviceSchedule.findMany({
    where: { tenantId, serviceObjectId },
    include: standardInclude,
    orderBy: [{ nextDueAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  })
}

/**
 * Count schedules by dashboard-widget buckets:
 *   - overdueCount: isActive && nextDueAt < now
 *   - dueSoonCount: isActive && nextDueAt in [now, now + LEAD_TIME_DAYS_DEFAULT]
 *   - okCount:      isActive && (nextDueAt IS NULL || nextDueAt > now + LEAD_TIME)
 *
 * Uses a fixed 14-day window rather than per-row leadTimeDays — the
 * widget is an at-a-glance summary, not an alert system.
 */
export async function countByStatus(
  prisma: Tx,
  tenantId: string,
  now: Date,
  leadTimeDaysDefault: number,
): Promise<{ overdueCount: number; dueSoonCount: number; okCount: number }> {
  const dueSoonBoundary = new Date(now)
  dueSoonBoundary.setDate(dueSoonBoundary.getDate() + leadTimeDaysDefault)

  const [overdueCount, dueSoonCount, okCount] = await Promise.all([
    prisma.serviceSchedule.count({
      where: {
        tenantId,
        isActive: true,
        nextDueAt: { lt: now },
      },
    }),
    prisma.serviceSchedule.count({
      where: {
        tenantId,
        isActive: true,
        nextDueAt: { gte: now, lte: dueSoonBoundary },
      },
    }),
    prisma.serviceSchedule.count({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { nextDueAt: null },
          { nextDueAt: { gt: dueSoonBoundary } },
        ],
      },
    }),
  ])

  return { overdueCount, dueSoonCount, okCount }
}

// --- Writes ---

export interface ServiceScheduleCreateData {
  tenantId: string
  serviceObjectId: string
  name: string
  description?: string | null
  intervalType: Prisma.ServiceScheduleCreateInput["intervalType"]
  intervalValue: number
  intervalUnit: Prisma.ServiceScheduleCreateInput["intervalUnit"]
  anchorDate?: Date | null
  defaultActivityId?: string | null
  responsibleEmployeeId?: string | null
  estimatedHours?: Prisma.Decimal | number | null
  lastCompletedAt?: Date | null
  nextDueAt?: Date | null
  leadTimeDays?: number
  isActive?: boolean
  createdById?: string | null
  updatedById?: string | null
}

export async function create(
  prisma: Tx,
  data: ServiceScheduleCreateData,
): Promise<ServiceScheduleWithIncludes> {
  const created = await prisma.serviceSchedule.create({
    data: {
      tenantId: data.tenantId,
      serviceObjectId: data.serviceObjectId,
      name: data.name,
      description: data.description ?? null,
      intervalType: data.intervalType,
      intervalValue: data.intervalValue,
      intervalUnit: data.intervalUnit,
      anchorDate: data.anchorDate ?? null,
      defaultActivityId: data.defaultActivityId ?? null,
      responsibleEmployeeId: data.responsibleEmployeeId ?? null,
      estimatedHours: data.estimatedHours ?? null,
      lastCompletedAt: data.lastCompletedAt ?? null,
      nextDueAt: data.nextDueAt ?? null,
      leadTimeDays: data.leadTimeDays ?? 14,
      isActive: data.isActive ?? true,
      createdById: data.createdById ?? null,
      updatedById: data.updatedById ?? null,
    },
    include: standardInclude,
  })
  return created
}

export async function update(
  prisma: Tx,
  tenantId: string,
  id: string,
  data: Prisma.ServiceScheduleUpdateInput | Record<string, unknown>,
): Promise<ServiceScheduleWithIncludes> {
  return (await tenantScopedUpdate(
    prisma.serviceSchedule,
    { id, tenantId },
    data as Record<string, unknown>,
    { include: standardInclude, entity: "ServiceSchedule" },
  )) as ServiceScheduleWithIncludes
}

export async function deleteById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const { count } = await prisma.serviceSchedule.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
