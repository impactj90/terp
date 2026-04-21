/**
 * ServiceObject Service
 *
 * Business logic for ServiceObject CRUD, hierarchy, soft/hard delete,
 * QR-payload caching, and audit-log integration.
 *
 * Plan: 2026-04-21-serviceobjekte-stammdaten.md
 */
import type {
  PrismaClient,
  ServiceObjectKind,
  ServiceObjectStatus,
  BuildingUsage,
} from "@/generated/prisma/client"
import * as repo from "./service-object-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import * as orderRepo from "./order-repository"
import * as whWithdrawalService from "./wh-withdrawal-service"
import * as orderBookingAggregator from "./order-booking-aggregator"
import * as userDisplayNameService from "./user-display-name-service"

// --- Audit-Tracked Fields ---

const TRACKED_FIELDS = [
  "number",
  "name",
  "kind",
  "parentId",
  "customerAddressId",
  "manufacturer",
  "model",
  "serialNumber",
  "yearBuilt",
  "inServiceSince",
  "siteStreet",
  "siteZip",
  "siteCity",
  "siteCountry",
  "siteAreaSqm",
  "floorCount",
  "floorAreaSqm",
  "buildingUsage",
  "status",
  "isActive",
] as const

// --- Kind-specific field matrix ---

const SITE_FIELDS = [
  "siteStreet",
  "siteZip",
  "siteCity",
  "siteCountry",
  "siteAreaSqm",
] as const
const BUILDING_FIELDS = [
  "floorCount",
  "floorAreaSqm",
  "buildingUsage",
] as const
const TECH_FIELDS = ["manufacturer", "model", "serialNumber"] as const
const DATE_FIELDS = ["yearBuilt", "inServiceSince"] as const

const KIND_SPECIFIC_FIELDS = [
  ...SITE_FIELDS,
  ...BUILDING_FIELDS,
  ...TECH_FIELDS,
  ...DATE_FIELDS,
] as const

const ALLOWED_FIELDS_BY_KIND: Record<ServiceObjectKind, Set<string>> = {
  SITE: new Set<string>([...SITE_FIELDS]),
  BUILDING: new Set<string>([...BUILDING_FIELDS, ...DATE_FIELDS]),
  SYSTEM: new Set<string>([...TECH_FIELDS, ...DATE_FIELDS]),
  EQUIPMENT: new Set<string>([...TECH_FIELDS, ...DATE_FIELDS]),
  COMPONENT: new Set<string>([...TECH_FIELDS, ...DATE_FIELDS]),
}

/**
 * Rejects kind-incompatible fields. Called after merging input over
 * existing so the final row is what gets validated.
 */
function validateFieldsForKind(
  kind: ServiceObjectKind,
  merged: Record<string, unknown>
) {
  const allowed = ALLOWED_FIELDS_BY_KIND[kind]
  const offenders: string[] = []
  for (const field of KIND_SPECIFIC_FIELDS) {
    const v = merged[field]
    if (v != null && !allowed.has(field)) {
      offenders.push(field)
    }
  }
  if (offenders.length > 0) {
    throw new ServiceObjectValidationError(
      `Fields not allowed for kind ${kind}: ${offenders.join(", ")}`
    )
  }
}

const BUILDING_USAGES: BuildingUsage[] = [
  "OFFICE",
  "WAREHOUSE",
  "PRODUCTION",
  "RETAIL",
  "RESIDENTIAL",
  "MIXED",
  "OTHER",
]

// --- Error Classes ---

export class ServiceObjectNotFoundError extends Error {
  constructor(message = "Service object not found") {
    super(message)
    this.name = "ServiceObjectNotFoundError"
  }
}

export class ServiceObjectValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServiceObjectValidationError"
  }
}

export class ServiceObjectConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServiceObjectConflictError"
  }
}

export class ServiceObjectForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ServiceObjectForbiddenError"
  }
}

// --- QR Payload ---

// Keep this in sync with buildServiceObjectQrContent in
// service-object-qr-service.ts. Duplicated here so phase-A can set the
// payload at create/update time without a phase-C dependency.
function buildQrPayload(tenantId: string, number: string): string {
  return `TERP:SO:${tenantId.substring(0, 6)}:${number}`
}

// --- Cycle Detection ---

async function checkCircularReference(
  prisma: PrismaClient,
  tenantId: string,
  movingId: string,
  proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([movingId])
  let current: string | null = proposedParentId

  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)

    const record = await repo.findParentId(prisma, tenantId, current)
    if (!record) break
    current = record.parentId
  }

  return false
}

// --- Validation Helpers ---

async function validateCustomerAddress(
  prisma: PrismaClient,
  tenantId: string,
  customerAddressId: string
) {
  const addr = await prisma.crmAddress.findFirst({
    where: { id: customerAddressId, tenantId },
    select: { id: true, type: true },
  })
  if (!addr) {
    throw new ServiceObjectValidationError(
      "Customer address not found for this tenant"
    )
  }
  if (addr.type !== "CUSTOMER" && addr.type !== "BOTH") {
    throw new ServiceObjectValidationError(
      "Referenced address is not a customer"
    )
  }
  return addr
}

async function validateParent(
  prisma: PrismaClient,
  tenantId: string,
  parentId: string,
  expectedCustomerAddressId: string,
  selfId?: string
) {
  if (selfId && parentId === selfId) {
    throw new ServiceObjectValidationError("Service object cannot be its own parent")
  }
  const parent = await prisma.serviceObject.findFirst({
    where: { id: parentId, tenantId },
    select: { id: true, customerAddressId: true },
  })
  if (!parent) {
    throw new ServiceObjectValidationError("Parent service object not found")
  }
  if (parent.customerAddressId !== expectedCustomerAddressId) {
    throw new ServiceObjectValidationError(
      "Parent must belong to the same customer"
    )
  }
  return parent
}

function validateYearBuilt(yearBuilt: number | null | undefined) {
  if (yearBuilt === null || yearBuilt === undefined) return
  const current = new Date().getFullYear()
  if (!Number.isInteger(yearBuilt) || yearBuilt < 1900 || yearBuilt > current + 1) {
    throw new ServiceObjectValidationError(
      `yearBuilt must be an integer between 1900 and ${current + 1}`
    )
  }
}

function validateArea(field: string, value: number | null | undefined) {
  if (value == null) return
  if (!Number.isInteger(value) || value < 0 || value > 10_000_000) {
    throw new ServiceObjectValidationError(
      `${field} must be a non-negative integer (m²)`
    )
  }
}

function validateFloorCount(value: number | null | undefined) {
  if (value == null) return
  if (!Number.isInteger(value) || value < 0 || value > 500) {
    throw new ServiceObjectValidationError(
      "floorCount must be a non-negative integer up to 500"
    )
  }
}

// --- Service Functions ---

export async function listServiceObjects(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    customerAddressId?: string
    parentId?: string | null
    kind?: ServiceObjectKind
    status?: ServiceObjectStatus
    search?: string
    isActive?: boolean
    page?: number
    pageSize?: number
  }
) {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 50
  return repo.findMany(prisma, tenantId, {
    ...params,
    page,
    pageSize,
  })
}

export async function getServiceObjectById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const record = await repo.findById(prisma, tenantId, id)
  if (!record) {
    throw new ServiceObjectNotFoundError()
  }
  return record
}

export async function getServiceObjectTree(
  prisma: PrismaClient,
  tenantId: string,
  customerAddressId: string
) {
  return repo.findAllForTree(prisma, tenantId, customerAddressId)
}

export async function createServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    number: string
    name: string
    description?: string | null
    kind?: ServiceObjectKind
    parentId?: string | null
    customerAddressId: string
    internalNumber?: string | null
    manufacturer?: string | null
    model?: string | null
    serialNumber?: string | null
    yearBuilt?: number | null
    inServiceSince?: Date | string | null
    siteStreet?: string | null
    siteZip?: string | null
    siteCity?: string | null
    siteCountry?: string | null
    siteAreaSqm?: number | null
    floorCount?: number | null
    floorAreaSqm?: number | null
    buildingUsage?: BuildingUsage | null
    status?: ServiceObjectStatus
    customFields?: unknown
    createdById?: string | null
  },
  audit?: AuditContext
) {
  const number = input.number?.trim() ?? ""
  if (number.length === 0) {
    throw new ServiceObjectValidationError("Number is required")
  }
  if (number.length > 50) {
    throw new ServiceObjectValidationError("Number must be at most 50 characters")
  }

  const name = input.name?.trim() ?? ""
  if (name.length === 0) {
    throw new ServiceObjectValidationError("Name is required")
  }
  if (name.length > 255) {
    throw new ServiceObjectValidationError("Name must be at most 255 characters")
  }

  // Uniqueness of number per tenant
  const existingByNumber = await repo.findByNumber(prisma, tenantId, number)
  if (existingByNumber) {
    throw new ServiceObjectConflictError("Number already exists")
  }

  // Customer must exist, same tenant, type CUSTOMER/BOTH
  await validateCustomerAddress(prisma, tenantId, input.customerAddressId)

  // Parent validation
  if (input.parentId) {
    await validateParent(
      prisma,
      tenantId,
      input.parentId,
      input.customerAddressId
    )
  }

  validateYearBuilt(input.yearBuilt ?? null)
  validateArea("siteAreaSqm", input.siteAreaSqm)
  validateArea("floorAreaSqm", input.floorAreaSqm)
  validateFloorCount(input.floorCount)
  if (input.buildingUsage != null && !BUILDING_USAGES.includes(input.buildingUsage)) {
    throw new ServiceObjectValidationError(
      `invalid buildingUsage: ${input.buildingUsage}`
    )
  }

  const kind = input.kind ?? "EQUIPMENT"
  const status = input.status ?? "OPERATIONAL"

  const inServiceSince =
    input.inServiceSince == null
      ? null
      : input.inServiceSince instanceof Date
      ? input.inServiceSince
      : new Date(input.inServiceSince)
  if (inServiceSince && Number.isNaN(inServiceSince.getTime())) {
    throw new ServiceObjectValidationError("inServiceSince is not a valid date")
  }

  // Reject kind-incompatible fields (e.g. manufacturer on SITE).
  validateFieldsForKind(kind, {
    manufacturer: input.manufacturer,
    model: input.model,
    serialNumber: input.serialNumber,
    yearBuilt: input.yearBuilt,
    inServiceSince,
    siteStreet: input.siteStreet,
    siteZip: input.siteZip,
    siteCity: input.siteCity,
    siteCountry: input.siteCountry,
    siteAreaSqm: input.siteAreaSqm,
    floorCount: input.floorCount,
    floorAreaSqm: input.floorAreaSqm,
    buildingUsage: input.buildingUsage,
  })

  const qrCodePayload = buildQrPayload(tenantId, number)

  const created = await repo.create(prisma, {
    tenantId,
    number,
    name,
    description: input.description?.trim() || null,
    kind,
    parentId: input.parentId ?? null,
    customerAddressId: input.customerAddressId,
    internalNumber: input.internalNumber?.trim() || null,
    manufacturer: input.manufacturer?.trim() || null,
    model: input.model?.trim() || null,
    serialNumber: input.serialNumber?.trim() || null,
    yearBuilt: input.yearBuilt ?? null,
    inServiceSince,
    siteStreet: input.siteStreet?.trim() || null,
    siteZip: input.siteZip?.trim() || null,
    siteCity: input.siteCity?.trim() || null,
    siteCountry: input.siteCountry?.trim() || null,
    siteAreaSqm: input.siteAreaSqm ?? null,
    floorCount: input.floorCount ?? null,
    floorAreaSqm: input.floorAreaSqm ?? null,
    buildingUsage: input.buildingUsage ?? null,
    status,
    isActive: true,
    qrCodePayload,
    customFields: input.customFields ?? null,
    createdById: input.createdById ?? audit?.userId ?? null,
  })

  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "create",
        entityType: "service_object",
        entityId: created.id,
        entityName: created.name ?? null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return created
}

export async function updateServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  input: {
    number?: string
    name?: string
    description?: string | null
    kind?: ServiceObjectKind
    parentId?: string | null
    customerAddressId?: string
    internalNumber?: string | null
    manufacturer?: string | null
    model?: string | null
    serialNumber?: string | null
    yearBuilt?: number | null
    inServiceSince?: Date | string | null
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
    customFields?: unknown
  },
  audit?: AuditContext
) {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ServiceObjectNotFoundError()
  }

  const data: Record<string, unknown> = {}
  let numberChanged = false

  if (input.number !== undefined) {
    const number = input.number.trim()
    if (number.length === 0) {
      throw new ServiceObjectValidationError("Number is required")
    }
    if (number.length > 50) {
      throw new ServiceObjectValidationError("Number must be at most 50 characters")
    }
    if (number !== existing.number) {
      const clash = await repo.findByNumber(prisma, tenantId, number)
      if (clash && clash.id !== id) {
        throw new ServiceObjectConflictError("Number already exists")
      }
      data.number = number
      numberChanged = true
    }
  }

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new ServiceObjectValidationError("Name is required")
    }
    if (name.length > 255) {
      throw new ServiceObjectValidationError("Name must be at most 255 characters")
    }
    data.name = name
  }

  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim() || null
  }

  if (input.kind !== undefined) {
    data.kind = input.kind
  }

  if (input.customerAddressId !== undefined) {
    await validateCustomerAddress(prisma, tenantId, input.customerAddressId)
    data.customerAddressId = input.customerAddressId
  }

  if (input.parentId !== undefined) {
    if (input.parentId === null) {
      data.parentId = null
    } else {
      if (input.parentId === id) {
        throw new ServiceObjectValidationError(
          "Service object cannot be its own parent"
        )
      }
      const targetCustomerAddressId =
        (data.customerAddressId as string | undefined) ??
        existing.customerAddressId
      await validateParent(
        prisma,
        tenantId,
        input.parentId,
        targetCustomerAddressId,
        id
      )
      const circular = await checkCircularReference(
        prisma,
        tenantId,
        id,
        input.parentId
      )
      if (circular) {
        throw new ServiceObjectValidationError("Circular reference detected")
      }
      data.parentId = input.parentId
    }
  }

  if (input.internalNumber !== undefined) {
    data.internalNumber =
      input.internalNumber === null ? null : input.internalNumber.trim() || null
  }
  if (input.manufacturer !== undefined) {
    data.manufacturer =
      input.manufacturer === null ? null : input.manufacturer.trim() || null
  }
  if (input.model !== undefined) {
    data.model = input.model === null ? null : input.model.trim() || null
  }
  if (input.serialNumber !== undefined) {
    data.serialNumber =
      input.serialNumber === null ? null : input.serialNumber.trim() || null
  }
  if (input.yearBuilt !== undefined) {
    validateYearBuilt(input.yearBuilt)
    data.yearBuilt = input.yearBuilt
  }
  if (input.inServiceSince !== undefined) {
    if (input.inServiceSince === null) {
      data.inServiceSince = null
    } else {
      const d =
        input.inServiceSince instanceof Date
          ? input.inServiceSince
          : new Date(input.inServiceSince)
      if (Number.isNaN(d.getTime())) {
        throw new ServiceObjectValidationError(
          "inServiceSince is not a valid date"
        )
      }
      data.inServiceSince = d
    }
  }
  // --- Kind-specific fields ---

  if (input.siteStreet !== undefined) {
    data.siteStreet =
      input.siteStreet === null ? null : input.siteStreet.trim() || null
  }
  if (input.siteZip !== undefined) {
    data.siteZip = input.siteZip === null ? null : input.siteZip.trim() || null
  }
  if (input.siteCity !== undefined) {
    data.siteCity = input.siteCity === null ? null : input.siteCity.trim() || null
  }
  if (input.siteCountry !== undefined) {
    data.siteCountry =
      input.siteCountry === null ? null : input.siteCountry.trim() || null
  }
  if (input.siteAreaSqm !== undefined) {
    validateArea("siteAreaSqm", input.siteAreaSqm)
    data.siteAreaSqm = input.siteAreaSqm
  }
  if (input.floorCount !== undefined) {
    validateFloorCount(input.floorCount)
    data.floorCount = input.floorCount
  }
  if (input.floorAreaSqm !== undefined) {
    validateArea("floorAreaSqm", input.floorAreaSqm)
    data.floorAreaSqm = input.floorAreaSqm
  }
  if (input.buildingUsage !== undefined) {
    if (
      input.buildingUsage !== null &&
      !BUILDING_USAGES.includes(input.buildingUsage)
    ) {
      throw new ServiceObjectValidationError(
        `invalid buildingUsage: ${input.buildingUsage}`
      )
    }
    data.buildingUsage = input.buildingUsage
  }

  if (input.status !== undefined) {
    data.status = input.status
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }
  if (input.customFields !== undefined) {
    data.customFields = input.customFields
  }

  if (numberChanged) {
    data.qrCodePayload = buildQrPayload(
      tenantId,
      (data.number as string | undefined) ?? existing.number
    )
  }

  // --- Kind-change handling ---
  //
  // If kind is changing, silently null any kind-specific field that's not
  // explicitly being set in this update AND is not allowed for the new
  // kind. Then validate the merged final state. UI should clear those
  // fields too — this is defense-in-depth.
  const finalKind: ServiceObjectKind =
    (data.kind as ServiceObjectKind | undefined) ?? existing.kind
  if (data.kind !== undefined && data.kind !== existing.kind) {
    const allowed = ALLOWED_FIELDS_BY_KIND[finalKind]
    for (const field of KIND_SPECIFIC_FIELDS) {
      if (!allowed.has(field) && !(field in data)) {
        data[field] = null
      }
    }
  }

  // Validate merged (post-update) state against the final kind.
  const merged: Record<string, unknown> = {}
  for (const field of KIND_SPECIFIC_FIELDS) {
    merged[field] =
      field in data
        ? data[field]
        : (existing as unknown as Record<string, unknown>)[field]
  }
  validateFieldsForKind(finalKind, merged)

  const updated = await repo.update(prisma, tenantId, id, data)

  if (audit && updated) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS as unknown as string[]
    )
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "update",
        entityType: "service_object",
        entityId: id,
        entityName: updated.name ?? null,
        changes,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }

  return updated
}

export async function moveServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  newParentId: string | null,
  audit?: AuditContext
) {
  return updateServiceObject(
    prisma,
    tenantId,
    id,
    { parentId: newParentId },
    audit
  )
}

export async function deleteServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
): Promise<{ success: true; mode: "soft" | "hard" }> {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new ServiceObjectNotFoundError()
  }

  const [orderCount, movementCount, childCount] = await Promise.all([
    repo.countLinkedOrders(prisma, tenantId, id),
    repo.countLinkedStockMovements(prisma, tenantId, id),
    repo.countChildren(prisma, tenantId, id),
  ])

  const hasLinks = orderCount > 0 || movementCount > 0 || childCount > 0

  if (hasLinks) {
    await repo.softDelete(prisma, tenantId, id)
    if (audit) {
      await auditLog
        .log(prisma, {
          tenantId,
          userId: audit.userId,
          action: "delete",
          entityType: "service_object",
          entityId: id,
          entityName: existing.name ?? null,
          changes: null,
          ipAddress: audit.ipAddress,
          userAgent: audit.userAgent,
        })
        .catch((err) => console.error("[AuditLog] Failed:", err))
    }
    return { success: true, mode: "soft" }
  }

  await repo.hardDelete(prisma, tenantId, id)
  if (audit) {
    await auditLog
      .log(prisma, {
        tenantId,
        userId: audit.userId,
        action: "delete",
        entityType: "service_object",
        entityId: id,
        entityName: existing.name ?? null,
        changes: null,
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      })
      .catch((err) => console.error("[AuditLog] Failed:", err))
  }
  return { success: true, mode: "hard" }
}

// --- History Aggregation ---

export type OrderHistoryItem = {
  id: string
  code: string
  name: string
  status: string
  validFrom: Date | null
  validTo: Date | null
  createdAt: Date
  assignedEmployees: Array<{
    id: string
    firstName: string
    lastName: string
    personnelNumber: string
  }>
  summary: {
    totalMinutes: number
    bookingCount: number
    lastBookingDate: Date | null
  }
}

export type StockMovementHistoryItem = {
  id: string
  articleNumber: string
  articleName: string
  type: "WITHDRAWAL" | "RETURN" | "DELIVERY_NOTE"
  quantity: number
  date: Date
  createdBy: { userId: string; displayName: string } | null
  reason: string | null
  notes: string | null
}

export type ServiceObjectHistoryResult = {
  orders: OrderHistoryItem[]
  stockMovements: StockMovementHistoryItem[]
  totals: { orderCount: number; totalMinutes: number; movementCount: number }
}

export async function getHistoryByServiceObject(
  prisma: PrismaClient,
  tenantId: string,
  serviceObjectId: string,
  params?: { limit?: number }
): Promise<ServiceObjectHistoryResult> {
  const limit = params?.limit ?? 50

  // 1. Existence + tenant scope check
  await getServiceObjectById(prisma, tenantId, serviceObjectId)

  // 2. Parallel queries for orders + movements
  const [orders, movements] = await Promise.all([
    orderRepo.findManyByServiceObject(prisma, tenantId, serviceObjectId, limit),
    whWithdrawalService.listByServiceObject(prisma, tenantId, serviceObjectId, {
      limit,
    }),
  ])

  // 3. Aggregate booking summaries + user names in parallel
  const orderIds = orders.map((o) => o.id)
  const createdByIds = movements
    .map((m) => m.createdById)
    .filter((id): id is string => id !== null)

  const [summaryMap, userMap] = await Promise.all([
    orderBookingAggregator.getBookingSummariesByOrders(
      prisma,
      tenantId,
      orderIds
    ),
    userDisplayNameService.resolveMany(prisma, tenantId, createdByIds),
  ])

  // 4. Map to output shapes
  const orderItems: OrderHistoryItem[] = orders.map((o) => ({
    id: o.id,
    code: o.code,
    name: o.name,
    status: o.status,
    validFrom: o.validFrom,
    validTo: o.validTo,
    createdAt: o.createdAt,
    assignedEmployees: (o.assignments ?? []).map((a) => ({
      id: a.employee.id,
      firstName: a.employee.firstName,
      lastName: a.employee.lastName,
      personnelNumber: a.employee.personnelNumber,
    })),
    summary: summaryMap.get(o.id) ?? {
      totalMinutes: 0,
      bookingCount: 0,
      lastBookingDate: null,
    },
  }))

  const movementItems: StockMovementHistoryItem[] = movements.map((m) => ({
    id: m.id,
    articleNumber: m.article.number,
    articleName: m.article.name,
    type: m.type as "WITHDRAWAL" | "RETURN" | "DELIVERY_NOTE",
    quantity: m.quantity,
    date: m.date,
    createdBy: m.createdById
      ? {
          userId: m.createdById,
          displayName:
            userMap.get(m.createdById)?.displayName ?? "Unbekannt",
        }
      : null,
    reason: m.reason,
    notes: m.notes,
  }))

  const totalMinutes = orderItems.reduce(
    (sum, o) => sum + o.summary.totalMinutes,
    0
  )
  return {
    orders: orderItems,
    stockMovements: movementItems,
    totals: {
      orderCount: orderItems.length,
      totalMinutes,
      movementCount: movementItems.length,
    },
  }
}
