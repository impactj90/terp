/**
 * Teams Service
 *
 * Business logic for team and team member operations.
 * Throws plain Error subclasses that are mapped by handleServiceError.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./teams-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"

// --- Audit ---

const TRACKED_FIELDS = [
  "name",
  "description",
  "departmentId",
  "leaderEmployeeId",
  "isActive",
]

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
  },
  audit?: AuditContext
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

  const created = await repo.create(prisma, {
    tenantId,
    name,
    description,
    departmentId: input.departmentId ?? null,
    leaderEmployeeId: input.leaderEmployeeId ?? null,
    isActive: true,
  })

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "create",
      entityType: "team",
      entityId: created.id,
      entityName: created.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return created
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
  },
  audit?: AuditContext
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

  const updated = (await repo.update(prisma, tenantId, input.id, data))!

  if (audit) {
    const changes = auditLog.computeChanges(
      existing as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED_FIELDS
    )
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "update",
      entityType: "team",
      entityId: input.id,
      entityName: updated.name ?? null,
      changes,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }

  return updated
}

export async function remove(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  audit?: AuditContext
) {
  // Verify team exists (tenant-scoped)
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) {
    throw new TeamNotFoundError()
  }

  // Hard delete (members cascade via DB FK)
  await repo.deleteById(prisma, tenantId, id)

  if (audit) {
    await auditLog.log(prisma, {
      tenantId,
      userId: audit.userId,
      action: "delete",
      entityType: "team",
      entityId: id,
      entityName: existing.name ?? null,
      changes: null,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch(err => console.error('[AuditLog] Failed:', err))
  }
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
  employeeId: string,
  isActive?: boolean
) {
  const memberships = await repo.findTeamsByEmployee(prisma, tenantId, employeeId, isActive)
  return memberships.map((m) => m.team)
}

export async function getMyTeams(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  isActive?: boolean
) {
  const [memberTeams, { teams: leaderTeams }] = await Promise.all([
    repo.findTeamsByEmployee(prisma, tenantId, employeeId, isActive),
    repo.findMany(prisma, tenantId, {
      leaderEmployeeId: employeeId,
      isActive,
      pageSize: 100,
    }),
  ])

  // Merge + deduplicate
  const seen = new Set<string>()
  const teams: typeof leaderTeams = []

  for (const m of memberTeams) {
    if (!seen.has(m.team.id)) {
      seen.add(m.team.id)
      teams.push(m.team)
    }
  }
  for (const t of leaderTeams) {
    if (!seen.has(t.id)) {
      seen.add(t.id)
      teams.push(t)
    }
  }

  teams.sort((a, b) => a.name.localeCompare(b.name))
  return { teams, total: teams.length }
}
