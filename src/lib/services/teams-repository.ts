/**
 * Teams Repository
 *
 * Pure Prisma data-access functions for the Team and TeamMember models.
 */
import type { PrismaClient } from "@/generated/prisma/client"

// --- Shared includes ---

const teamRelationsInclude = {
  department: {
    select: { id: true, name: true, code: true },
  },
  leader: {
    select: { id: true, firstName: true, lastName: true },
  },
  _count: { select: { members: true } },
} as const

const teamMemberInclude = {
  employee: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const

// --- Team Functions ---

export async function findMany(
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
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20

  const where: Record<string, unknown> = { tenantId }

  if (params?.isActive !== undefined) {
    where.isActive = params.isActive
  }

  if (params?.departmentId !== undefined) {
    where.departmentId = params.departmentId
  }

  if (params?.search) {
    where.name = { contains: params.search, mode: "insensitive" }
  }

  const [teams, total] = await Promise.all([
    prisma.team.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { name: "asc" },
      include: teamRelationsInclude,
    }),
    prisma.team.count({ where }),
  ])

  return { teams, total }
}

export async function findById(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  includeMembers?: boolean
) {
  return prisma.team.findFirst({
    where: { id, tenantId },
    include: {
      ...teamRelationsInclude,
      ...(includeMembers
        ? {
            members: {
              include: teamMemberInclude,
              orderBy: { joinedAt: "asc" as const },
            },
          }
        : {}),
    },
  })
}

export async function findByName(
  prisma: PrismaClient,
  tenantId: string,
  name: string,
  excludeId?: string
) {
  const where: Record<string, unknown> = { tenantId, name }
  if (excludeId) {
    where.NOT = { id: excludeId }
  }
  return prisma.team.findFirst({ where })
}

export async function create(
  prisma: PrismaClient,
  data: {
    tenantId: string
    name: string
    description: string | null
    departmentId: string | null
    leaderEmployeeId: string | null
    isActive: boolean
  }
) {
  return prisma.team.create({ data })
}

export async function update(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  return prisma.team.update({
    where: { id },
    data,
    include: teamRelationsInclude,
  })
}

export async function deleteById(
  prisma: PrismaClient,
  tenantId: string,
  id: string
) {
  const { count } = await prisma.team.deleteMany({
    where: { id, tenantId },
  })
  return count > 0
}

// --- TeamMember Functions ---

export async function findMembers(
  prisma: PrismaClient,
  teamId: string
) {
  return prisma.teamMember.findMany({
    where: { teamId },
    include: teamMemberInclude,
    orderBy: { joinedAt: "asc" },
  })
}

export async function findMember(
  prisma: PrismaClient,
  teamId: string,
  employeeId: string
) {
  return prisma.teamMember.findUnique({
    where: {
      teamId_employeeId: { teamId, employeeId },
    },
  })
}

export async function createMember(
  prisma: PrismaClient,
  data: {
    teamId: string
    employeeId: string
    role: string
  }
) {
  return prisma.teamMember.create({
    data,
    include: teamMemberInclude,
  })
}

export async function updateMemberRole(
  prisma: PrismaClient,
  teamId: string,
  employeeId: string,
  role: string
) {
  return prisma.teamMember.update({
    where: {
      teamId_employeeId: { teamId, employeeId },
    },
    data: { role },
    include: teamMemberInclude,
  })
}

export async function deleteMember(
  prisma: PrismaClient,
  teamId: string,
  employeeId: string
) {
  return prisma.teamMember.delete({
    where: {
      teamId_employeeId: { teamId, employeeId },
    },
  })
}

export async function findTeamsByEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string
) {
  return prisma.teamMember.findMany({
    where: { employeeId, team: { tenantId } },
    include: {
      team: {
        include: teamRelationsInclude,
      },
    },
  })
}
