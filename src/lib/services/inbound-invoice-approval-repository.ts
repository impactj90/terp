import type { PrismaClient } from "@/generated/prisma/client"

export interface ApprovalStepInput {
  stepOrder: number
  approvalVersion: number
  approverGroupId?: string | null
  approverUserId?: string | null
  dueAt?: Date | null
}

export async function createMany(
  prisma: PrismaClient,
  invoiceId: string,
  tenantId: string,
  steps: ApprovalStepInput[]
) {
  if (steps.length === 0) return

  await prisma.inboundInvoiceApproval.createMany({
    data: steps.map((step) => ({
      invoiceId,
      tenantId,
      stepOrder: step.stepOrder,
      approvalVersion: step.approvalVersion,
      approverGroupId: step.approverGroupId ?? null,
      approverUserId: step.approverUserId ?? null,
      status: "PENDING",
      dueAt: step.dueAt ?? null,
    })),
  })
}

export async function findByInvoiceId(
  prisma: PrismaClient,
  invoiceId: string,
  approvalVersion?: number
) {
  return prisma.inboundInvoiceApproval.findMany({
    where: {
      invoiceId,
      ...(approvalVersion !== undefined ? { approvalVersion } : {}),
    },
    include: {
      approverGroup: { select: { id: true, name: true, code: true } },
      approverUser: { select: { id: true, displayName: true, email: true } },
      decider: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { stepOrder: "asc" },
  })
}

export async function findPendingForUser(
  prisma: PrismaClient,
  tenantId: string,
  userId: string
) {
  // Get user's group membership
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { userGroupId: true },
  })

  const conditions: Record<string, unknown>[] = [
    { approverUserId: userId },
  ]
  if (user?.userGroupId) {
    conditions.push({ approverGroupId: user.userGroupId })
  }

  return prisma.inboundInvoiceApproval.findMany({
    where: {
      tenantId,
      status: "PENDING",
      OR: conditions,
    },
    include: {
      invoice: {
        include: {
          supplier: { select: { id: true, number: true, company: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })
}

export async function findNextPending(
  prisma: PrismaClient,
  invoiceId: string,
  approvalVersion: number
) {
  return prisma.inboundInvoiceApproval.findFirst({
    where: {
      invoiceId,
      approvalVersion,
      status: "PENDING",
    },
    orderBy: { stepOrder: "asc" },
  })
}

export async function updateDecision(
  prisma: PrismaClient,
  id: string,
  decision: {
    status: string
    decidedBy: string
    rejectionReason?: string | null
  }
) {
  await prisma.inboundInvoiceApproval.update({
    where: { id },
    data: {
      status: decision.status,
      decidedBy: decision.decidedBy,
      decidedAt: new Date(),
      rejectionReason: decision.rejectionReason ?? null,
    },
  })
}

export async function invalidateByVersion(
  prisma: PrismaClient,
  invoiceId: string,
  belowVersion: number
) {
  const { count } = await prisma.inboundInvoiceApproval.updateMany({
    where: {
      invoiceId,
      approvalVersion: { lt: belowVersion },
      status: "PENDING",
    },
    data: { status: "INVALIDATED" },
  })
  return count
}

export async function findOverdueSteps(
  prisma: PrismaClient,
  limit = 100
) {
  return prisma.inboundInvoiceApproval.findMany({
    where: {
      status: "PENDING",
      dueAt: { lt: new Date() },
    },
    include: {
      invoice: { select: { id: true, number: true, tenantId: true } },
      approverUser: { select: { id: true, displayName: true } },
      approverGroup: { select: { id: true, name: true } },
    },
    take: limit,
  })
}

export async function updateLastReminderAt(
  prisma: PrismaClient,
  id: string
) {
  await prisma.inboundInvoiceApproval.update({
    where: { id },
    data: { lastReminderAt: new Date() },
  })
}
