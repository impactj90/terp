import type { PrismaClient } from "@/generated/prisma/client"

export async function findByTenantId(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.tenantImapConfig.findUnique({
    where: { tenantId },
  })
}

export async function upsert(
  prisma: PrismaClient,
  tenantId: string,
  data: {
    host: string
    port: number
    username: string
    password?: string
    encryption: string
    mailbox: string
    isVerified?: boolean
    verifiedAt?: Date | null
  }
) {
  const { password, ...rest } = data
  const updateData = password !== undefined ? { ...rest, password } : rest
  return prisma.tenantImapConfig.upsert({
    where: { tenantId },
    create: {
      tenant: { connect: { id: tenantId } },
      ...rest,
      ...(password !== undefined ? { password } : { password: "" }),
    },
    update: updateData,
  })
}

export async function findAllActive(prisma: PrismaClient) {
  return prisma.tenantImapConfig.findMany({
    where: { isActive: true },
  })
}

export async function updatePollState(
  prisma: PrismaClient,
  id: string,
  state: {
    uidValidity?: bigint | null
    uidNext?: number | null
    lastPollAt?: Date | null
    lastPollError?: string | null
    lastPollErrorAt?: Date | null
    consecutiveFailures?: number
  }
) {
  await prisma.tenantImapConfig.update({
    where: { id },
    data: state,
  })
}
