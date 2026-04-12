import type { PrismaClient } from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

const DEFAULT_INCLUDE = {
  approverGroup: { select: { id: true, name: true, code: true } },
  approverUser: { select: { id: true, displayName: true, email: true } },
}

export async function findByTenant(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.inboundInvoiceApprovalPolicy.findMany({
    where: { tenantId },
    include: DEFAULT_INCLUDE,
    orderBy: [{ amountMin: "asc" }, { stepOrder: "asc" }],
  })
}

export async function findForAmount(
  prisma: PrismaClient,
  tenantId: string,
  grossAmount: number
) {
  return prisma.inboundInvoiceApprovalPolicy.findMany({
    where: {
      tenantId,
      isActive: true,
      amountMin: { lte: grossAmount },
      OR: [
        { amountMax: null },
        { amountMax: { gte: grossAmount } },
      ],
    },
    include: DEFAULT_INCLUDE,
    orderBy: { stepOrder: "asc" },
  })
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    amountMin: number
    amountMax?: number | null
    stepOrder: number
    approverGroupId?: string | null
    approverUserId?: string | null
    isActive?: boolean
  }
) {
  return prisma.inboundInvoiceApprovalPolicy.create({
    data: {
      tenantId,
      amountMin: data.amountMin,
      amountMax: data.amountMax ?? null,
      stepOrder: data.stepOrder,
      approverGroupId: data.approverGroupId ?? null,
      approverUserId: data.approverUserId ?? null,
      isActive: data.isActive ?? true,
    },
    include: DEFAULT_INCLUDE,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(
    prisma.inboundInvoiceApprovalPolicy,
    { id, tenantId },
    data,
    { entity: "InboundInvoiceApprovalPolicy", include: DEFAULT_INCLUDE }
  )
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.inboundInvoiceApprovalPolicy.deleteMany({
    where: { id, tenantId },
  })
  if (count === 0) throw new Error("Approval policy not found")
}
