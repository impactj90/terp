import type {
  PrismaClient,
  BillingRecurringInterval,
  BillingRecurringServicePeriodMode,
} from "@/generated/prisma/client"

// --- Includes ---
const LIST_INCLUDE = {
  address: { select: { id: true, number: true, company: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
}

const DETAIL_INCLUDE = {
  address: true,
  contact: true,
}

// --- Repository Functions ---

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    isActive?: boolean
    addressId?: string
    search?: string
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.isActive !== undefined) where.isActive = params.isActive
  if (params.addressId) where.addressId = params.addressId
  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { notes: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.billingRecurringInvoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: LIST_INCLUDE,
    }),
    prisma.billingRecurringInvoice.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.billingRecurringInvoice.findFirst({
    where: { id, tenantId },
    include: DETAIL_INCLUDE,
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    addressId: string
    contactId?: string | null
    interval: BillingRecurringInterval
    servicePeriodMode?: BillingRecurringServicePeriodMode
    startDate: Date
    endDate?: Date | null
    nextDueDate: Date
    autoGenerate?: boolean
    deliveryType?: string | null
    deliveryTerms?: string | null
    paymentTermDays?: number | null
    discountPercent?: number | null
    discountDays?: number | null
    notes?: string | null
    internalNotes?: string | null
    positionTemplate: unknown // JSON array
    createdById?: string | null
  }
) {
  return prisma.billingRecurringInvoice.create({
    data: {
      name: data.name,
      interval: data.interval,
      ...(data.servicePeriodMode ? { servicePeriodMode: data.servicePeriodMode } : {}),
      startDate: data.startDate,
      endDate: data.endDate,
      nextDueDate: data.nextDueDate,
      autoGenerate: data.autoGenerate,
      deliveryType: data.deliveryType,
      deliveryTerms: data.deliveryTerms,
      paymentTermDays: data.paymentTermDays,
      discountPercent: data.discountPercent,
      discountDays: data.discountDays,
      notes: data.notes,
      internalNotes: data.internalNotes,
      positionTemplate: data.positionTemplate as object,
      createdById: data.createdById,
      tenant: { connect: { id: data.tenantId } },
      address: { connect: { id: data.addressId } },
      ...(data.contactId ? { contact: { connect: { id: data.contactId } } } : {}),
    },
    include: DETAIL_INCLUDE,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  await prisma.billingRecurringInvoice.updateMany({
    where: { id, tenantId },
    data,
  })
  return prisma.billingRecurringInvoice.findFirst({
    where: { id, tenantId },
    include: DETAIL_INCLUDE,
  })
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const result = await prisma.billingRecurringInvoice.deleteMany({
    where: { id, tenantId },
  })
  return result.count > 0
}

export async function findDue(
  prisma: PrismaClient,
  today: Date
) {
  // Find all active templates across all tenants where nextDueDate <= today and autoGenerate=true
  return prisma.billingRecurringInvoice.findMany({
    where: {
      isActive: true,
      autoGenerate: true,
      nextDueDate: { lte: today },
    },
    include: DETAIL_INCLUDE,
  })
}

export async function findDueForTenant(
  prisma: PrismaClient,
  tenantId: string,
  today: Date
) {
  return prisma.billingRecurringInvoice.findMany({
    where: {
      tenantId,
      isActive: true,
      nextDueDate: { lte: today },
    },
    include: DETAIL_INCLUDE,
  })
}
