/**
 * Tenant Service
 *
 * Business logic for tenant operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./tenant-repository"

// --- Error Classes ---

export class TenantNotFoundError extends Error {
  constructor(message = "Tenant not found") {
    super(message)
    this.name = "TenantNotFoundError"
  }
}

export class TenantValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TenantValidationError"
  }
}

export class TenantConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TenantConflictError"
  }
}

// --- Helpers ---

function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  userId: string,
  params?: { name?: string; active?: boolean }
) {
  let tenants = await repo.findTenantsForUser(prisma, userId)

  // Apply optional name filter (case-insensitive contains)
  if (params?.name) {
    const lowerName = params.name.toLowerCase()
    tenants = tenants.filter((t) =>
      t.name.toLowerCase().includes(lowerName)
    )
  }

  // Apply optional active filter
  if (params?.active !== undefined) {
    tenants = tenants.filter((t) => t.isActive === params.active)
  }

  return tenants
}

export async function getById(prisma: PrismaClient, id: string) {
  const tenant = await repo.findById(prisma, id)
  if (!tenant) {
    throw new TenantNotFoundError()
  }
  return tenant
}

export async function create(
  prisma: PrismaClient,
  userId: string,
  input: {
    name: string
    slug: string
    addressStreet: string
    addressZip: string
    addressCity: string
    addressCountry: string
    phone?: string | null
    email?: string | null
    payrollExportBasePath?: string | null
    notes?: string | null
    vacationBasis: string
  }
) {
  // Normalize slug and name
  const slug = input.slug.trim().toLowerCase()
  const name = input.name.trim()

  // Re-validate after trim
  if (slug.length < 3) {
    throw new TenantValidationError("Slug must be at least 3 characters")
  }
  if (name.length === 0) {
    throw new TenantValidationError("Name is required")
  }

  // Validate address fields after trim
  const addressStreet = input.addressStreet.trim()
  const addressZip = input.addressZip.trim()
  const addressCity = input.addressCity.trim()
  const addressCountry = input.addressCountry.trim()

  if (!addressStreet || !addressZip || !addressCity || !addressCountry) {
    throw new TenantValidationError("All address fields are required")
  }

  // Check slug uniqueness
  const existingBySlug = await repo.findBySlug(prisma, slug)
  if (existingBySlug) {
    throw new TenantConflictError("Tenant slug already exists")
  }

  // Normalize optional strings
  const phone = normalizeOptionalString(input.phone)
  const email = normalizeOptionalString(input.email)
  const payrollExportBasePath = normalizeOptionalString(
    input.payrollExportBasePath
  )
  const notes = normalizeOptionalString(input.notes)

  // Create tenant
  const tenant = await repo.create(prisma, {
    name,
    slug,
    addressStreet,
    addressZip,
    addressCity,
    addressCountry,
    phone,
    email,
    payrollExportBasePath,
    notes,
    vacationBasis: input.vacationBasis,
    isActive: true,
  })

  // Auto-add creator to tenant with role "owner"
  await repo.upsertUserTenant(prisma, userId, tenant.id, "owner")

  return tenant
}

export async function update(
  prisma: PrismaClient,
  input: {
    id: string
    name?: string
    addressStreet?: string
    addressZip?: string
    addressCity?: string
    addressCountry?: string
    phone?: string | null
    email?: string | null
    payrollExportBasePath?: string | null
    notes?: string | null
    vacationBasis?: string
    isActive?: boolean
  }
) {
  // Verify tenant exists
  const existing = await repo.findById(prisma, input.id)
  if (!existing) {
    throw new TenantNotFoundError()
  }

  // Build update data with only provided fields
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new TenantValidationError("Name cannot be empty")
    }
    data.name = name
  }

  if (input.addressStreet !== undefined) {
    const val = input.addressStreet.trim()
    if (val.length === 0) {
      throw new TenantValidationError("Street cannot be empty")
    }
    data.addressStreet = val
  }

  if (input.addressZip !== undefined) {
    const val = input.addressZip.trim()
    if (val.length === 0) {
      throw new TenantValidationError("ZIP cannot be empty")
    }
    data.addressZip = val
  }

  if (input.addressCity !== undefined) {
    const val = input.addressCity.trim()
    if (val.length === 0) {
      throw new TenantValidationError("City cannot be empty")
    }
    data.addressCity = val
  }

  if (input.addressCountry !== undefined) {
    const val = input.addressCountry.trim()
    if (val.length === 0) {
      throw new TenantValidationError("Country cannot be empty")
    }
    data.addressCountry = val
  }

  if (input.phone !== undefined) {
    data.phone = normalizeOptionalString(input.phone)
  }

  if (input.email !== undefined) {
    data.email = normalizeOptionalString(input.email)
  }

  if (input.payrollExportBasePath !== undefined) {
    data.payrollExportBasePath = normalizeOptionalString(
      input.payrollExportBasePath
    )
  }

  if (input.notes !== undefined) {
    data.notes = normalizeOptionalString(input.notes)
  }

  if (input.vacationBasis !== undefined) {
    data.vacationBasis = input.vacationBasis
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  return (await repo.update(prisma, input.id, input.id, data))!
}

export async function deactivate(prisma: PrismaClient, id: string) {
  // Verify tenant exists
  const existing = await repo.findById(prisma, id)
  if (!existing) {
    throw new TenantNotFoundError()
  }

  await repo.update(prisma, id, id, { isActive: false })
}
