/**
 * Export Interface Service
 *
 * Business logic for export interface operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./export-interface-repository"

// --- Error Classes ---

export class ExportInterfaceNotFoundError extends Error {
  constructor(message = "Export interface not found") {
    super(message)
    this.name = "ExportInterfaceNotFoundError"
  }
}

export class ExportInterfaceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExportInterfaceValidationError"
  }
}

export class ExportInterfaceConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExportInterfaceConflictError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: { activeOnly?: boolean }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const ei = await repo.findById(prisma, tenantId, id)
  if (!ei) {
    throw new ExportInterfaceNotFoundError()
  }
  return ei
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    interfaceNumber: number
    name: string
    mandantNumber?: string
    exportScript?: string
    exportPath?: string
    outputFilename?: string
  }
) {
  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new ExportInterfaceValidationError(
      "Export interface name is required"
    )
  }

  // Validate interfaceNumber > 0
  if (input.interfaceNumber <= 0) {
    throw new ExportInterfaceValidationError(
      "Export interface number must be greater than 0"
    )
  }

  // Check uniqueness of interfaceNumber within tenant
  const existing = await repo.findByInterfaceNumber(
    prisma,
    tenantId,
    input.interfaceNumber
  )
  if (existing) {
    throw new ExportInterfaceConflictError(
      "Export interface number already exists"
    )
  }

  const ei = await repo.create(prisma, {
    tenantId,
    interfaceNumber: input.interfaceNumber,
    name,
    mandantNumber: input.mandantNumber || null,
    exportScript: input.exportScript || null,
    exportPath: input.exportPath || null,
    outputFilename: input.outputFilename || null,
    isActive: true,
  })

  return { ...ei, accounts: [] }
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    interfaceNumber?: number
    name?: string
    mandantNumber?: string | null
    exportScript?: string | null
    exportPath?: string | null
    outputFilename?: string | null
    isActive?: boolean
  }
) {
  // Verify exists with tenant scope
  const existing = await repo.findByIdSimple(prisma, tenantId, input.id)
  if (!existing) {
    throw new ExportInterfaceNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new ExportInterfaceValidationError(
        "Export interface name is required"
      )
    }
    data.name = name
  }

  if (input.interfaceNumber !== undefined) {
    if (input.interfaceNumber <= 0) {
      throw new ExportInterfaceValidationError(
        "Export interface number must be greater than 0"
      )
    }
    // Check uniqueness if changed
    if (input.interfaceNumber !== existing.interfaceNumber) {
      const conflict = await repo.findByInterfaceNumber(
        prisma,
        tenantId,
        input.interfaceNumber
      )
      if (conflict) {
        throw new ExportInterfaceConflictError(
          "Export interface number already exists"
        )
      }
      data.interfaceNumber = input.interfaceNumber
    }
  }

  if (input.mandantNumber !== undefined) {
    data.mandantNumber = input.mandantNumber
  }
  if (input.exportScript !== undefined) {
    data.exportScript = input.exportScript
  }
  if (input.exportPath !== undefined) {
    data.exportPath = input.exportPath
  }
  if (input.outputFilename !== undefined) {
    data.outputFilename = input.outputFilename
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  return repo.update(prisma, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify exists with tenant scope
  const existing = await repo.findByIdSimple(prisma, tenantId, id)
  if (!existing) {
    throw new ExportInterfaceNotFoundError()
  }

  // Check if interface has generated exports
  const usageCount = await repo.countPayrollExports(prisma, id)
  if (usageCount > 0) {
    throw new ExportInterfaceValidationError(
      "Cannot delete export interface that has generated exports"
    )
  }

  await repo.deleteById(prisma, id)
}

export async function listAccounts(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify interface exists with tenant scope
  const ei = await repo.findByIdSimple(prisma, tenantId, id)
  if (!ei) {
    throw new ExportInterfaceNotFoundError()
  }

  return repo.findAccounts(prisma, id)
}

export async function setAccounts(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  accountIds: string[]
) {
  // Verify interface exists with tenant scope
  const ei = await repo.findByIdSimple(prisma, tenantId, id)
  if (!ei) {
    throw new ExportInterfaceNotFoundError()
  }

  return repo.replaceAccounts(prisma, id, accountIds)
}
