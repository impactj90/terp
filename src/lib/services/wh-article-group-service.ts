/**
 * Warehouse Article Group Service
 *
 * Business logic for article group (Artikelgruppe) operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./wh-article-repository"

// --- Error Classes ---

export class WhArticleGroupNotFoundError extends Error {
  constructor(message = "Article group not found") {
    super(message)
    this.name = "WhArticleGroupNotFoundError"
  }
}

export class WhArticleGroupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhArticleGroupValidationError"
  }
}

// --- Circular Reference Check ---

async function checkCircularReference(
  prisma: PrismaClient,
  tenantId: string,
  groupId: string,
  proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([groupId])
  let current: string | null = proposedParentId

  while (current !== null) {
    if (visited.has(current)) return true
    visited.add(current)

    const record = await repo.findGroupParentId(prisma, tenantId, current)
    if (!record) break
    current = record.parentId
  }

  return false
}

// --- Service Functions ---

export async function getTree(
  prisma: PrismaClient,
  tenantId: string
) {
  return repo.findAllGroups(prisma, tenantId)
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    parentId?: string
    sortOrder?: number
  }
) {
  const name = input.name.trim()
  if (name.length === 0) {
    throw new WhArticleGroupValidationError("Group name is required")
  }

  // If parentId provided, verify parent exists
  if (input.parentId) {
    const parent = await repo.findGroupById(prisma, tenantId, input.parentId)
    if (!parent) {
      throw new WhArticleGroupNotFoundError("Parent group not found")
    }
  }

  return repo.createGroup(prisma, {
    tenantId,
    name,
    parentId: input.parentId || null,
    sortOrder: input.sortOrder ?? 0,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    parentId?: string | null
    sortOrder?: number
  }
) {
  const existing = await repo.findGroupById(prisma, tenantId, input.id)
  if (!existing) {
    throw new WhArticleGroupNotFoundError()
  }

  // If parentId changed, check for circular reference
  if (input.parentId !== undefined && input.parentId !== existing.parentId) {
    if (input.parentId !== null) {
      const isCircular = await checkCircularReference(
        prisma, tenantId, input.id, input.parentId
      )
      if (isCircular) {
        throw new WhArticleGroupValidationError("Circular reference detected in group hierarchy")
      }
    }
  }

  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.parentId !== undefined) data.parentId = input.parentId
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder

  return repo.updateGroup(prisma, tenantId, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const existing = await repo.findGroupById(prisma, tenantId, id)
  if (!existing) {
    throw new WhArticleGroupNotFoundError()
  }

  // Check for articles in this group
  const articleCount = await repo.countGroupArticles(prisma, tenantId, id)
  if (articleCount > 0) {
    throw new WhArticleGroupValidationError(
      `Cannot delete group: ${articleCount} article(s) are assigned to this group`
    )
  }

  // Check for child groups
  const childCount = await repo.countGroupChildren(prisma, tenantId, id)
  if (childCount > 0) {
    throw new WhArticleGroupValidationError(
      `Cannot delete group: ${childCount} child group(s) exist`
    )
  }

  return repo.deleteGroup(prisma, tenantId, id)
}
