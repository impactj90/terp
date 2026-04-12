/**
 * HR Personnel File Service
 *
 * Business logic for personnel file categories, entries, reminders, and expiry checks.
 * Throws plain Error subclasses mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./hr-personnel-file-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const CATEGORY_TRACKED_FIELDS = ["name", "code", "isActive", "description", "color", "sortOrder", "visibleToRoles"]
const ENTRY_TRACKED_FIELDS = ["title", "categoryId", "description", "entryDate", "expiresAt", "reminderDate", "reminderNote", "isConfidential"]

// --- Error Classes ---

export class HrPersonnelFileNotFoundError extends Error {
  constructor(message = "Personnel file entry not found") {
    super(message)
    this.name = "HrPersonnelFileNotFoundError"
  }
}

export class HrPersonnelFileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HrPersonnelFileValidationError"
  }
}

export class HrPersonnelFileConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HrPersonnelFileConflictError"
  }
}

export class HrPersonnelFileForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HrPersonnelFileForbiddenError"
  }
}

// --- Helpers ---

interface UserGroup {
  code: string
  isAdmin?: boolean | null
  permissions?: unknown
}

/**
 * Extract role codes from user groups (e.g. ["admin", "hr", "supervisor"]).
 * Admin users get the "admin" role automatically.
 */
function getUserRoleCodes(userGroups: UserGroup[]): string[] {
  const roles: string[] = []
  for (const g of userGroups) {
    if (g.isAdmin) {
      roles.push("admin")
    }
    const code = g.code?.toLowerCase()
    if (code) {
      roles.push(code)
      // Map standard group codes to simplified role names
      if (code === "personal") roles.push("hr")
      if (code === "vorgesetzter") roles.push("supervisor")
      if (code === "mitarbeiter") roles.push("employee")
    }
  }
  return [...new Set(roles)]
}

/**
 * Check if user has a specific permission by key.
 */
function hasPermission(userGroups: UserGroup[], permissionId: string): boolean {
  for (const g of userGroups) {
    if (g.isAdmin) return true
    const perms = g.permissions
    if (Array.isArray(perms) && perms.includes(permissionId)) return true
  }
  return false
}

// Permission ID for view_confidential
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
const VIEW_CONFIDENTIAL_PERM_ID = permissionIdByKey("hr_personnel_file.view_confidential")!

// =============================================================================
// Category Service
// =============================================================================

export async function listCategories(
  prisma: PrismaClient,
  tenantId: string
) {
  return repo.findCategories(prisma, tenantId)
}

export async function createCategory(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    code: string
    description?: string
    color?: string
    sortOrder?: number
    visibleToRoles?: string[]
  },
  audit?: AuditContext
) {
  // Check for duplicate code
  const existing = await repo.findCategoryByCode(prisma, tenantId, input.code)
  if (existing) {
    throw new HrPersonnelFileConflictError(`Category code "${input.code}" already exists`)
  }

  const created = await repo.createCategory(prisma, {
    tenantId,
    name: input.name,
    code: input.code,
    description: input.description,
    color: input.color,
    sortOrder: input.sortOrder ?? 0,
    visibleToRoles: input.visibleToRoles ?? ["admin", "hr"],
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "hr_personnel_file_category",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function updateCategory(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    code?: string
    description?: string | null
    color?: string | null
    sortOrder?: number
    isActive?: boolean
    visibleToRoles?: string[]
  },
  audit?: AuditContext
) {
  const existing = await repo.findCategoryById(prisma, tenantId, input.id)
  if (!existing) {
    throw new HrPersonnelFileNotFoundError("Category not found")
  }

  // Check code uniqueness if changing code
  if (input.code && input.code !== existing.code) {
    const dup = await repo.findCategoryByCode(prisma, tenantId, input.code)
    if (dup) {
      throw new HrPersonnelFileConflictError(`Category code "${input.code}" already exists`)
    }
  }

  const { id, ...data } = input
  const updated = await repo.updateCategory(prisma, tenantId, id, data)

  if (audit && updated) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      CATEGORY_TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "hr_personnel_file_category",
      entityId: input.id,
      entityName: updated.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function deleteCategory(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const existing = await repo.findCategoryById(prisma, tenantId, id)
  if (!existing) {
    throw new HrPersonnelFileNotFoundError("Category not found")
  }

  // Only delete if no entries reference this category
  const count = await repo.countEntriesByCategory(prisma, tenantId, id)
  if (count > 0) {
    throw new HrPersonnelFileValidationError(
      `Cannot delete category: ${count} entries still reference it`
    )
  }

  await repo.deleteCategory(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "hr_personnel_file_category",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

// =============================================================================
// Entry Service
// =============================================================================

export async function listEntries(
  prisma: PrismaClient,
  tenantId: string,
  _userId: string,
  userGroups: UserGroup[],
  params: {
    employeeId: string
    categoryId?: string
    search?: string
    page: number
    pageSize: number
  }
) {
  // 1. Determine user roles
  const userRoles = getUserRoleCodes(userGroups)
  const isAdmin = userRoles.includes("admin")

  // 2. Filter categories by visibleToRoles (unless admin — sees all)
  let allowedCategoryIds: string[] | undefined
  if (!isAdmin) {
    const allCategories = await repo.findCategories(prisma, tenantId, { isActive: true })
    const visible = allCategories.filter((cat) =>
      cat.visibleToRoles.some((role) => userRoles.includes(role))
    )
    allowedCategoryIds = visible.map((c) => c.id)
    if (allowedCategoryIds.length === 0) {
      return { items: [], total: 0 }
    }
  }

  // 3. If user lacks view_confidential permission, exclude confidential entries
  const canViewConfidential = hasPermission(userGroups, VIEW_CONFIDENTIAL_PERM_ID)

  return repo.findEntries(prisma, tenantId, {
    ...params,
    allowedCategoryIds,
    isConfidential: canViewConfidential ? undefined : false,
  })
}

export async function getEntryById(
  prisma: PrismaClient,
  tenantId: string,
  _userId: string,
  userGroups: UserGroup[],
  id: string
) {
  const entry = await repo.findEntryById(prisma, tenantId, id)
  if (!entry) {
    throw new HrPersonnelFileNotFoundError()
  }

  // Verify category visibility for user
  const userRoles = getUserRoleCodes(userGroups)
  const isAdmin = userRoles.includes("admin")

  if (!isAdmin) {
    const categoryVisible = entry.category.visibleToRoles.some(
      (role: string) => userRoles.includes(role)
    )
    if (!categoryVisible) {
      throw new HrPersonnelFileNotFoundError()
    }
  }

  // Verify confidential access
  if (entry.isConfidential) {
    const canViewConfidential = hasPermission(userGroups, VIEW_CONFIDENTIAL_PERM_ID)
    if (!canViewConfidential) {
      throw new HrPersonnelFileNotFoundError()
    }
  }

  return entry
}

export async function createEntry(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    employeeId: string
    categoryId: string
    title: string
    description?: string
    entryDate: Date
    expiresAt?: Date
    reminderDate?: Date
    reminderNote?: string
    isConfidential?: boolean
  },
  createdById: string,
  audit?: AuditContext
) {
  // Validate employee belongs to tenant
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, tenantId },
    select: { id: true },
  })
  if (!employee) {
    throw new HrPersonnelFileValidationError("Employee not found or does not belong to this tenant")
  }

  // Validate category belongs to tenant
  const category = await repo.findCategoryById(prisma, tenantId, input.categoryId)
  if (!category) {
    throw new HrPersonnelFileValidationError("Category not found or does not belong to this tenant")
  }

  const created = await repo.createEntry(prisma, {
    tenantId,
    employeeId: input.employeeId,
    categoryId: input.categoryId,
    title: input.title,
    description: input.description,
    entryDate: input.entryDate,
    expiresAt: input.expiresAt,
    reminderDate: input.reminderDate,
    reminderNote: input.reminderNote,
    isConfidential: input.isConfidential ?? false,
    createdById,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "hr_personnel_file_entry",
      entityId: created.id,
      entityName: created.title ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
}

export async function updateEntry(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    categoryId?: string
    title?: string
    description?: string | null
    entryDate?: Date
    expiresAt?: Date | null
    reminderDate?: Date | null
    reminderNote?: string | null
    isConfidential?: boolean
  },
  audit?: AuditContext
) {
  const existing = await repo.findEntryById(prisma, tenantId, input.id)
  if (!existing) {
    throw new HrPersonnelFileNotFoundError()
  }

  // Validate new category if changing
  if (input.categoryId && input.categoryId !== existing.categoryId) {
    const category = await repo.findCategoryById(prisma, tenantId, input.categoryId)
    if (!category) {
      throw new HrPersonnelFileValidationError("Category not found or does not belong to this tenant")
    }
  }

  const { id, ...data } = input
  const updated = await repo.updateEntry(prisma, tenantId, id, data)

  if (audit && updated) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ENTRY_TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "hr_personnel_file_entry",
      entityId: input.id,
      entityName: updated.title ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function deleteEntry(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  const entry = await repo.findEntryById(prisma, tenantId, id)
  if (!entry) {
    throw new HrPersonnelFileNotFoundError()
  }

  // Delete attachments from storage if any
  if (entry.attachments && entry.attachments.length > 0) {
    // Import dynamically to avoid circular dependency
    const attachmentService = await import("./hr-personnel-file-attachment-service")
    await attachmentService.deleteAllByEntry(prisma, tenantId, id)
  }

  // Delete entry (CASCADE will clean up attachment DB records)
  await repo.deleteEntry(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "hr_personnel_file_entry",
      entityId: id,
      entityName: entry.title ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
}

// =============================================================================
// Reminder & Expiry Service
// =============================================================================

export async function getReminders(
  prisma: PrismaClient,
  tenantId: string,
  params: { from?: Date; to?: Date }
) {
  const from = params.from ?? new Date()
  const to =
    params.to ??
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // +14 days
  return repo.findReminders(prisma, tenantId, { from, to })
}

export async function getExpiringEntries(
  prisma: PrismaClient,
  tenantId: string,
  withinDays = 30
) {
  const deadline = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000)
  return repo.findExpiringEntries(prisma, tenantId, deadline)
}
