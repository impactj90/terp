/**
 * ServiceObject Repository
 *
 * Canonical Prisma queries for service_objects + service_object_attachments.
 * All reads use findFirst({ where: { id, tenantId } }) for tenant safety.
 * Writes use tenantScopedUpdate to prevent cross-tenant mutation.
 *
 * Plan: 2026-04-21-serviceobjekte-stammdaten.md
 */
import type {
  PrismaClient,
  ServiceObjectKind,
  ServiceObjectStatus,
  BuildingUsage,
} from "@/generated/prisma/client"
import { tenantScopedUpdate } from "@/lib/services/prisma-helpers"

// --- ServiceObject ---

export interface ListParams {
  customerAddressId?: string
  parentId?: string | null
  kind?: ServiceObjectKind
  status?: ServiceObjectStatus
  search?: string
  isActive?: boolean
  page: number
  pageSize: number
}

export async function findMany(
  prisma: PrismaClient,
  tenantId: string,
  params: ListParams
) {
  const where: Record<string, unknown> = { tenantId }

  if (params.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params.customerAddressId) {
    where.customerAddressId = params.customerAddressId
  }

  if (params.parentId !== undefined) {
    where.parentId = params.parentId
  }

  if (params.kind) {
    where.kind = params.kind
  }

  if (params.status) {
    where.status = params.status
  }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { number: { contains: term, mode: "insensitive" } },
        { name: { contains: term, mode: "insensitive" } },
        { manufacturer: { contains: term, mode: "insensitive" } },
        { model: { contains: term, mode: "insensitive" } },
        { serialNumber: { contains: term, mode: "insensitive" } },
        { internalNumber: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.serviceObject.findMany({
      where,
      orderBy: [{ number: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        customerAddress: {
          select: { id: true, number: true, company: true, city: true },
        },
        parent: {
          select: { id: true, number: true, name: true },
        },
        _count: { select: { children: true, attachments: true } },
      },
    }),
    prisma.serviceObject.count({ where }),
  ])

  return { items, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.serviceObject.findFirst({
    where: { id, tenantId },
    include: {
      customerAddress: {
        select: {
          id: true,
          number: true,
          company: true,
          city: true,
          street: true,
          zip: true,
          country: true,
          type: true,
        },
      },
      parent: {
        select: { id: true, number: true, name: true, kind: true },
      },
      children: {
        where: { isActive: true },
        select: { id: true, number: true, name: true, kind: true, status: true },
        orderBy: { number: "asc" },
      },
      _count: {
        select: {
          children: true,
          attachments: true,
          orders: true,
          stockMovements: true,
        },
      },
    },
  })
}

export async function findAllForTree(
  prisma: PrismaClient,
  tenantId: string,
  customerAddressId: string
) {
  return prisma.serviceObject.findMany({
    where: { tenantId, customerAddressId },
    select: {
      id: true,
      number: true,
      name: true,
      kind: true,
      status: true,
      isActive: true,
      parentId: true,
    },
    orderBy: [{ number: "asc" }],
  })
}

export async function findByNumber(
  prisma: PrismaClient,
  tenantId: string,
  number: string
) {
  return prisma.serviceObject.findFirst({
    where: { tenantId, number },
  })
}

export async function findParentId(
  prisma: PrismaClient,
  tenantId: string,
  id: string
): Promise<{ parentId: string | null } | null> {
  return prisma.serviceObject.findFirst({
    where: { id, tenantId },
    select: { parentId: true },
  })
}

export async function countChildren(
  prisma: PrismaClient,
  tenantId: string,
  parentId: string
) {
  return prisma.serviceObject.count({
    where: { parentId, tenantId },
  })
}

export async function countLinkedOrders(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.order.count({
    where: { tenantId, serviceObjectId: id },
  })
}

export async function countLinkedStockMovements(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.whStockMovement.count({
    where: { tenantId, serviceObjectId: id },
  })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    number: string
    name: string
    description?: string | null
    kind: ServiceObjectKind
    parentId?: string | null
    customerAddressId: string
    internalNumber?: string | null
    manufacturer?: string | null
    model?: string | null
    serialNumber?: string | null
    yearBuilt?: number | null
    inServiceSince?: Date | null
    siteStreet?: string | null
    siteZip?: string | null
    siteCity?: string | null
    siteCountry?: string | null
    siteAreaSqm?: number | null
    floorCount?: number | null
    floorAreaSqm?: number | null
    buildingUsage?: BuildingUsage | null
    status?: ServiceObjectStatus
    isActive?: boolean
    qrCodePayload?: string | null
    customFields?: unknown
    createdById?: string | null
  }
) {
  return prisma.serviceObject.create({
    // Cast for JSON field; Prisma accepts `Prisma.InputJsonValue`.
    data: data as unknown as Parameters<typeof prisma.serviceObject.create>[0]["data"],
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return tenantScopedUpdate(prisma.serviceObject, { id, tenantId }, data, {
    entity: "ServiceObject",
  })
}

export async function softDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return tenantScopedUpdate(
    prisma.serviceObject,
    { id, tenantId },
    { isActive: false } as Record<string, unknown>,
    { entity: "ServiceObject" }
  )
}

export async function hardDelete(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.serviceObject.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- Attachments ---

export async function findAttachments(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string
) {
  return prisma.serviceObjectAttachment.findMany({
    where: { tenantId, serviceObjectId },
    orderBy: { uploadedAt: "desc" },
  })
}

export async function findAttachmentById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.serviceObjectAttachment.findFirst({
    where: { id, tenantId },
  })
}

export async function countAttachments(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string
) {
  return prisma.serviceObjectAttachment.count({
    where: { tenantId, serviceObjectId },
  })
}

export async function createAttachment(
  prisma: PrismaClient,
  data: {
    tenantId: string
    serviceObjectId: string
    filename: string
    storagePath: string
    mimeType: string
    sizeBytes: number
    uploadedById?: string | null
  }
) {
  return prisma.serviceObjectAttachment.create({ data })
}

export async function deleteAttachment(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.serviceObjectAttachment.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}
