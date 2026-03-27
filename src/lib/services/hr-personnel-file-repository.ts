/**
 * HR Personnel File Repository
 *
 * Pure Prisma data access for personnel file categories, entries, and reminders.
 * Every query MUST include tenantId for tenant isolation.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// =============================================================================
// Category Repository
// =============================================================================

export async function findCategories(
  prisma: PrismaClient,
  tenantId: string,
  params: { isActive?: boolean } = {}
) {
  const where: Record<string, unknown> = { tenantId }
  if (params.isActive !== undefined) {
    where.isActive = params.isActive
  }
  return prisma.hrPersonnelFileCategory.findMany({
    where,
    orderBy: { sortOrder: "asc" },
  })
}

export async function findCategoryById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.hrPersonnelFileCategory.findFirst({
    where: { id, tenantId },
  })
}

export async function findCategoryByCode(
  prisma: PrismaClient,
  tenantId: string,
  code: string
) {
  return prisma.hrPersonnelFileCategory.findFirst({
    where: { tenantId, code },
  })
}

export async function createCategory(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    code: string
    description?: string | null
    color?: string | null
    sortOrder?: number
    visibleToRoles?: string[]
  }
) {
  return prisma.hrPersonnelFileCategory.create({ data })
}

export async function updateCategory(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    name?: string
    code?: string
    description?: string | null
    color?: string | null
    sortOrder?: number
    isActive?: boolean
    visibleToRoles?: string[]
  }
) {
  return prisma.hrPersonnelFileCategory.update({
    where: { id, tenantId },
    data,
  })
}

export async function deleteCategory(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.hrPersonnelFileCategory.delete({
    where: { id, tenantId },
  })
}

export async function countEntriesByCategory(
  prisma: PrismaClient,
  tenantId: string,
  categoryId: string
) {
  return prisma.hrPersonnelFileEntry.count({
    where: { tenantId, categoryId },
  })
}

// =============================================================================
// Entry Repository
// =============================================================================

export async function findEntries(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    employeeId: string
    categoryId?: string
    search?: string
    isConfidential?: boolean
    allowedCategoryIds?: string[]
    page: number
    pageSize: number
  }
) {
  const where: Record<string, unknown> = {
    tenantId,
    employeeId: params.employeeId,
  }

  if (params.categoryId) {
    where.categoryId = params.categoryId
  }

  if (params.allowedCategoryIds) {
    where.categoryId = params.categoryId
      ? params.categoryId
      : { in: params.allowedCategoryIds }
    // If a specific categoryId is also given, both filters apply:
    // we keep the specific one only if it's in the allowed list
    if (params.categoryId) {
      if (!params.allowedCategoryIds.includes(params.categoryId)) {
        // Requested category not visible to this user
        return { items: [], total: 0 }
      }
      where.categoryId = params.categoryId
    }
  }

  if (params.isConfidential === false) {
    where.isConfidential = false
  }

  if (params.search) {
    const term = params.search.trim()
    if (term.length > 0) {
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.hrPersonnelFileEntry.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, code: true, color: true } },
        attachments: { select: { id: true } },
      },
      orderBy: { entryDate: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.hrPersonnelFileEntry.count({ where }),
  ])

  return { items, total }
}

export async function findEntryById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.hrPersonnelFileEntry.findFirst({
    where: { id, tenantId },
    include: {
      category: true,
      attachments: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          personnelNumber: true,
        },
      },
    },
  })
}

export async function createEntry(
  prisma: PrismaClient,
  data: {
    tenantId: string
    employeeId: string
    categoryId: string
    title: string
    description?: string | null
    entryDate: Date
    expiresAt?: Date | null
    reminderDate?: Date | null
    reminderNote?: string | null
    isConfidential?: boolean
    createdById?: string | null
  }
) {
  return prisma.hrPersonnelFileEntry.create({ data })
}

export async function updateEntry(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: {
    categoryId?: string
    title?: string
    description?: string | null
    entryDate?: Date
    expiresAt?: Date | null
    reminderDate?: Date | null
    reminderNote?: string | null
    isConfidential?: boolean
  }
) {
  return prisma.hrPersonnelFileEntry.update({
    where: { id, tenantId },
    data,
  })
}

export async function deleteEntry(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  return prisma.hrPersonnelFileEntry.delete({
    where: { id, tenantId },
  })
}

// =============================================================================
// Reminder / Expiry Queries
// =============================================================================

export async function findReminders(
  prisma: PrismaClient,
  tenantId: string,
  params: { from: Date; to: Date }
) {
  return prisma.hrPersonnelFileEntry.findMany({
    where: {
      tenantId,
      reminderDate: { gte: params.from, lte: params.to },
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          personnelNumber: true,
        },
      },
      category: { select: { id: true, name: true, code: true, color: true } },
    },
    orderBy: { reminderDate: "asc" },
  })
}

export async function findExpiringEntries(
  prisma: PrismaClient,
  tenantId: string,
  deadline: Date
) {
  return prisma.hrPersonnelFileEntry.findMany({
    where: {
      tenantId,
      expiresAt: { lte: deadline, gte: new Date() },
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          personnelNumber: true,
        },
      },
      category: { select: { id: true, name: true, code: true, color: true } },
    },
    orderBy: { expiresAt: "asc" },
  })
}
