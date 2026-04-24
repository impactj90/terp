/**
 * WorkReport Repository
 *
 * Canonical Prisma queries for `work_reports`. All reads and writes are
 * tenant-scoped. Attachments live in a separate repository file (added
 * in Phase 4). Assignments live in a separate repository file (added
 * in Phase 3).
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 2)
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

type Tx = PrismaClient | Prisma.TransactionClient

// --- Standard Include ---
//
// Used by findById / findMany so the service layer gets related Order,
// ServiceObject, assignments (with Employee names) and attachments in a
// single round-trip.
export const workReportInclude = {
  order: {
    select: { id: true, code: true, name: true, customer: true },
  },
  serviceObject: {
    select: { id: true, number: true, name: true, kind: true },
  },
  assignments: {
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          personnelNumber: true,
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  attachments: {
    orderBy: { createdAt: "desc" as const },
  },
} as const

export type WorkReportWithIncludes = Prisma.WorkReportGetPayload<{
  include: typeof workReportInclude
}>

// --- Query Params ---

export interface ListParams {
  status?: "DRAFT" | "SIGNED" | "VOID"
  orderId?: string
  serviceObjectId?: string
  limit?: number
  offset?: number
}

// --- Reads ---

export async function findMany(
  prisma: Tx,
  tenantId: string,
  params?: ListParams,
): Promise<WorkReportWithIncludes[]> {
  const where: Record<string, unknown> = { tenantId }
  if (params?.status) where.status = params.status
  if (params?.orderId) where.orderId = params.orderId
  if (params?.serviceObjectId) where.serviceObjectId = params.serviceObjectId

  return prisma.workReport.findMany({
    where,
    include: workReportInclude,
    orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
    take: params?.limit ?? 50,
    skip: params?.offset ?? 0,
  })
}

export async function count(
  prisma: Tx,
  tenantId: string,
  params?: Pick<ListParams, "status" | "orderId" | "serviceObjectId">,
): Promise<number> {
  const where: Record<string, unknown> = { tenantId }
  if (params?.status) where.status = params.status
  if (params?.orderId) where.orderId = params.orderId
  if (params?.serviceObjectId) where.serviceObjectId = params.serviceObjectId

  return prisma.workReport.count({ where })
}

export async function findById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<WorkReportWithIncludes | null> {
  return prisma.workReport.findFirst({
    where: { id, tenantId },
    include: workReportInclude,
  })
}

/**
 * Lightweight fetch used by the atomic DRAFT-guard pattern: returns only
 * the columns needed to distinguish "not found" from "wrong status" after
 * a zero-row updateMany.
 */
export async function findByIdSimple(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<{
  id: string
  status: "DRAFT" | "SIGNED" | "VOID"
  tenantId: string
  code: string
} | null> {
  return prisma.workReport.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, tenantId: true, code: true },
  })
}

export async function findByCode(
  prisma: Tx,
  tenantId: string,
  code: string,
): Promise<WorkReportWithIncludes | null> {
  return prisma.workReport.findFirst({
    where: { tenantId, code },
    include: workReportInclude,
  })
}

export async function findManyByOrder(
  prisma: Tx,
  tenantId: string,
  orderId: string,
): Promise<WorkReportWithIncludes[]> {
  return prisma.workReport.findMany({
    where: { tenantId, orderId },
    include: workReportInclude,
    orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
  })
}

export async function findManyByServiceObject(
  prisma: Tx,
  tenantId: string,
  serviceObjectId: string,
  limit?: number,
): Promise<WorkReportWithIncludes[]> {
  return prisma.workReport.findMany({
    where: { tenantId, serviceObjectId },
    include: workReportInclude,
    orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
    take: limit ?? 20,
  })
}

// --- Writes ---

export interface WorkReportCreateData {
  tenantId: string
  orderId: string
  serviceObjectId?: string | null
  code: string
  visitDate: Date
  travelMinutes?: number | null
  workDescription?: string | null
  createdById?: string | null
}

export async function create(
  prisma: Tx,
  data: WorkReportCreateData,
): Promise<WorkReportWithIncludes> {
  return prisma.workReport.create({
    data: {
      tenantId: data.tenantId,
      orderId: data.orderId,
      serviceObjectId: data.serviceObjectId ?? null,
      code: data.code,
      visitDate: data.visitDate,
      travelMinutes: data.travelMinutes ?? null,
      workDescription: data.workDescription ?? null,
      createdById: data.createdById ?? null,
      status: "DRAFT",
    },
    include: workReportInclude,
  })
}

export async function update(
  prisma: Tx,
  tenantId: string,
  id: string,
  data: Prisma.WorkReportUpdateInput | Record<string, unknown>,
): Promise<WorkReportWithIncludes> {
  return (await tenantScopedUpdate(
    prisma.workReport,
    { id, tenantId },
    data as Record<string, unknown>,
    { include: workReportInclude, entity: "WorkReport" },
  )) as WorkReportWithIncludes
}

export async function deleteById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const { count } = await prisma.workReport.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

/**
 * Atomic DRAFT-guard helper: updateMany with an explicit `status: "DRAFT"`
 * check. Returns the number of rows updated. The caller is responsible for
 * re-fetching and producing the correct NotFound / Validation / Conflict
 * error when count === 0.
 *
 * Pattern source: billing-document-service.ts:427-442.
 */
export async function atomicUpdateDraft(
  prisma: Tx,
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
): Promise<number> {
  const { count } = await prisma.workReport.updateMany({
    where: { id, tenantId, status: "DRAFT" },
    data,
  })
  return count
}
