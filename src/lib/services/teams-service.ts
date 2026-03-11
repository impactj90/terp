/**
 * Teams Service
 *
 * Business logic for team and team member operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./teams-repository"

// --- Error Classes ---

export class TeamNotFoundError extends Error {
  constructor(message = "Team not found") {
    super(message)
    this.name = "TeamNotFoundError"
  }
}

export class TeamValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TeamValidationError"
  }
}

export class TeamConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TeamConflictError"
  }
}

export class TeamMemberNotFoundError extends Error {
  constructor(message = "Team member not found") {
    super(message)
    this.name = "TeamMemberNotFoundError"
  }
}

// --- Service Functions ---

export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params?: {
    page?: number
    pageSize?: number
    search?: string
    isActive?: boolean
    departmentId?: string
  }
) {
  return repo.findMany(prisma, tenantId, params)
}

export async function getById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  includeMembers?: boolean
) {
  const team = await repo.findById(prisma, tenantId, id, includeMembers)
  if (!team) {
    throw new TeamNotFoundError()
  }
  return team
}

export async function create(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    name: string
    description?: string
    departmentId?: string
    leaderEmployeeId?: string
  }
) {
  // Trim and validate name
  const name = input.name.trim()
  if (name.length === 0) {
    throw new TeamValidationError("Team name is required")
  }

  // Check name uniqueness within tenant
  const existingByName = await repo.findByName(prisma, tenantId, name)
  if (existingByName) {
    throw new TeamConflictError("Team name already exists")
  }

  // Trim description if provided
  const description = input.description?.trim() || null

  return repo.create(prisma, {
    tenantId,
    name,
    description,
    departmentId: input.departmentId ?? null,
    leaderEmployeeId: input.leaderEmployeeId ?? null,
    isActive: true,
  })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    name?: string
    description?: string | null
    departmentId?: string | null
    leaderEmployeeId?: string | null
    isActive?: boolean
  }
) {
  // Verify team exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, input.id)
  if (!existing) {
    throw new TeamNotFoundError()
  }

  // Build partial update data
  const data: Record<string, unknown> = {}

  // Handle name update
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length === 0) {
      throw new TeamValidationError("Team name is required")
    }
    // Check uniqueness if changed
    if (name !== existing.name) {
      const existingByName = await repo.findByName(
        prisma,
        tenantId,
        name,
        input.id
      )
      if (existingByName) {
        throw new TeamConflictError("Team name already exists")
      }
    }
    data.name = name
  }

  // Handle description update
  if (input.description !== undefined) {
    data.description =
      input.description === null ? null : input.description.trim()
  }

  // Handle departmentId update
  if (input.departmentId !== undefined) {
    data.departmentId = input.departmentId
  }

  // Handle leaderEmployeeId update
  if (input.leaderEmployeeId !== undefined) {
    data.leaderEmployeeId = input.leaderEmployeeId
  }

  // Handle isActive update
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  return repo.update(prisma, tenantId, input.id, data)
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  // Verify team exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new TeamNotFoundError()
  }

  // Hard delete (members cascade via DB FK)
  await repo.deleteById(prisma, tenantId, id)
}

// --- Member Functions ---

export async function getMembers(
  prisma: PrismaClient,
  tenantId: string,
  teamId: string
) {
  // Verify team exists (tenant-scoped)
  const team = await repo.findById(prisma, tenantId, teamId)
  if (!team) {
    throw new TeamNotFoundError()
  }

  return repo.findMembers(prisma, teamId)
}

export async function addMember(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    teamId: string
    employeeId: string
    role: string
  }
) {
  // Verify team exists (tenant-scoped)
  const team = await repo.findById(prisma, tenantId, input.teamId)
  if (!team) {
    throw new TeamNotFoundError()
  }

  // Check if member already exists
  const existingMember = await repo.findMember(
    prisma,
    input.teamId,
    input.employeeId
  )
  if (existingMember) {
    throw new TeamConflictError("Employee is already a team member")
  }

  return repo.createMember(prisma, {
    teamId: input.teamId,
    employeeId: input.employeeId,
    role: input.role,
  })
}

export async function updateMemberRole(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    teamId: string
    employeeId: string
    role: string
  }
) {
  // Verify team exists (tenant-scoped)
  const team = await repo.findById(prisma, tenantId, input.teamId)
  if (!team) {
    throw new TeamNotFoundError()
  }

  try {
    return await repo.updateMemberRole(
      prisma,
      input.teamId,
      input.employeeId,
      input.role
    )
  } catch {
    throw new TeamMemberNotFoundError()
  }
}

export async function removeMember(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    teamId: string
    employeeId: string
  }
) {
  // Verify team exists (tenant-scoped)
  const team = await repo.findById(prisma, tenantId, input.teamId)
  if (!team) {
    throw new TeamNotFoundError()
  }

  try {
    await repo.deleteMember(prisma, input.teamId, input.employeeId)
  } catch {
    throw new TeamMemberNotFoundError()
  }
}

export async function getByEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  const memberships = await repo.findTeamsByEmployee(prisma, tenantId, employeeId)
  return memberships.map((m) => m.team)
}
