/**
 * WorkReport Assignment Repository
 *
 * Tenant-scoped Prisma access for employee assignments on WorkReports.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 3)
 */
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

type Tx = PrismaClient | Prisma.TransactionClient

export const workReportAssignmentInclude = {
  workReport: { select: { id: true, code: true, status: true } },
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      personnelNumber: true,
    },
  },
} as const

export type WorkReportAssignmentWithIncludes =
  Prisma.WorkReportAssignmentGetPayload<{
    include: typeof workReportAssignmentInclude
  }>

export async function findByIdSimple(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<{
  id: string
  tenantId: string
  workReportId: string
  employeeId: string
  role: string | null
} | null> {
  return prisma.workReportAssignment.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      tenantId: true,
      workReportId: true,
      employeeId: true,
      role: true,
    },
  })
}

export async function findByIdWithIncludes(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<WorkReportAssignmentWithIncludes | null> {
  return prisma.workReportAssignment.findFirst({
    where: { id, tenantId },
    include: workReportAssignmentInclude,
  })
}

export async function findMany(
  prisma: Tx,
  tenantId: string,
  workReportId: string,
): Promise<WorkReportAssignmentWithIncludes[]> {
  return prisma.workReportAssignment.findMany({
    where: { tenantId, workReportId },
    include: workReportAssignmentInclude,
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  })
}

export async function create(
  prisma: Tx,
  data: {
    tenantId: string
    workReportId: string
    employeeId: string
    role?: string | null
  },
): Promise<WorkReportAssignmentWithIncludes> {
  return prisma.workReportAssignment.create({
    data: {
      tenantId: data.tenantId,
      workReportId: data.workReportId,
      employeeId: data.employeeId,
      role: data.role ?? null,
    },
    include: workReportAssignmentInclude,
  })
}

export async function deleteById(
  prisma: Tx,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const { count } = await prisma.workReportAssignment.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
