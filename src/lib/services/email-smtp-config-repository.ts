import type { PrismaClient } from "@/generated/prisma/client"

export async function findByTenantId(
  prisma: PrismaClient,
  tenantId: string
) {
  return prisma.tenantSmtpConfig.findUnique({
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
    fromEmail: string
    fromName?: string | null
    replyToEmail?: string | null
    isVerified?: boolean
    verifiedAt?: Date | null
  }
) {
  const { password, ...rest } = data
  const updateData = password !== undefined ? { ...rest, password } : rest
  return prisma.tenantSmtpConfig.upsert({
    where: { tenantId },
    create: {
      tenant: { connect: { id: tenantId } },
      ...rest,
      ...(password !== undefined ? { password } : { password: "" }),
    },
    update: updateData,
  })
}
