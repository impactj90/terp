/**
 * Teams Router
 *
 * Provides team CRUD operations and member management via tRPC procedures.
 * Replaces the Go backend team endpoints:
 * - GET /teams -> teams.list
 * - GET /teams/{id} -> teams.getById
 * - POST /teams -> teams.create
 * - PUT /teams/{id} -> teams.update
 * - DELETE /teams/{id} -> teams.delete
 * - GET /teams/{id}/members -> teams.getMembers
 * - POST /teams/{id}/members -> teams.addMember
 * - PUT /teams/{id}/members/{eid} -> teams.updateMemberRole
 * - DELETE /teams/{id}/members/{eid} -> teams.removeMember
 * - GET /employees/{eid}/teams -> teams.getByEmployee
 *
 * @see apps/api/internal/service/team.go
 * @see apps/api/internal/handler/team.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const TEAMS_MANAGE = permissionIdByKey("teams.manage")!

// --- Enums ---

const teamMemberRoleEnum = z.enum(["member", "lead", "deputy"])

// --- Output Schemas ---

const teamOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  departmentId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  leaderEmployeeId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  memberCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  department: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      code: z.string(),
    })
    .nullable()
    .optional(),
  leader: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
    })
    .nullable()
    .optional(),
})

const teamMemberOutputSchema = z.object({
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: teamMemberRoleEnum,
  joinedAt: z.date(),
  employee: z
    .object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
    })
    .optional(),
})

// --- Input Schemas ---

const createTeamInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  leaderEmployeeId: z.string().uuid().optional(),
})

const updateTeamInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  leaderEmployeeId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})

const listTeamsInputSchema = z
  .object({
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().min(1).max(100).optional().default(20),
    search: z.string().optional(),
    isActive: z.boolean().optional(),
    departmentId: z.string().uuid().optional(),
  })
  .optional()

const addMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: teamMemberRoleEnum.optional().default("member"),
})

const updateMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
  role: teamMemberRoleEnum,
})

const removeMemberInputSchema = z.object({
  teamId: z.string().uuid(),
  employeeId: z.string().uuid(),
})

// --- Helpers ---

/**
 * Maps a Prisma Team record (with optional relations and _count) to output shape.
 */
function mapTeamToOutput(
  team: {
    id: string
    tenantId: string
    departmentId: string | null
    name: string
    description: string | null
    leaderEmployeeId: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    department?: { id: string; name: string; code: string } | null
    leader?: { id: string; firstName: string; lastName: string } | null
    _count?: { members: number }
  },
  memberCount?: number
) {
  return {
    id: team.id,
    tenantId: team.tenantId,
    departmentId: team.departmentId,
    name: team.name,
    description: team.description,
    leaderEmployeeId: team.leaderEmployeeId,
    isActive: team.isActive,
    memberCount: memberCount ?? team._count?.members ?? 0,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    department: team.department
      ? {
          id: team.department.id,
          name: team.department.name,
          code: team.department.code,
        }
      : null,
    leader: team.leader
      ? {
          id: team.leader.id,
          firstName: team.leader.firstName,
          lastName: team.leader.lastName,
        }
      : null,
  }
}

/**
 * Maps a Prisma TeamMember record to output shape.
 */
function mapTeamMemberToOutput(member: {
  teamId: string
  employeeId: string
  role: string
  joinedAt: Date
  employee?: { id: string; firstName: string; lastName: string } | null
}) {
  return {
    teamId: member.teamId,
    employeeId: member.employeeId,
    role: member.role as "member" | "lead" | "deputy",
    joinedAt: member.joinedAt,
    ...(member.employee
      ? {
          employee: {
            id: member.employee.id,
            firstName: member.employee.firstName,
            lastName: member.employee.lastName,
          },
        }
      : {}),
  }
}

// --- Router ---

export const teamsRouter = createTRPCRouter({
  /**
   * teams.list -- Returns paginated teams for the current tenant.
   *
   * Supports filters: isActive, departmentId, search (name).
   * Includes department/leader relations and member counts.
   *
   * Requires: teams.manage permission
   *
   * Replaces: GET /teams (Go TeamHandler.List)
   */
  list: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(listTeamsInputSchema)
    .output(
      z.object({
        items: z.array(teamOutputSchema),
        total: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!
      const page = input?.page ?? 1
      const pageSize = input?.pageSize ?? 20

      const where: Record<string, unknown> = {
        tenantId,
      }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      if (input?.departmentId !== undefined) {
        where.departmentId = input.departmentId
      }

      if (input?.search) {
        where.name = { contains: input.search, mode: "insensitive" }
      }

      const [teams, total] = await Promise.all([
        ctx.prisma.team.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { name: "asc" },
          include: {
            department: {
              select: { id: true, name: true, code: true },
            },
            leader: {
              select: { id: true, firstName: true, lastName: true },
            },
            _count: { select: { members: true } },
          },
        }),
        ctx.prisma.team.count({ where }),
      ])

      return {
        items: teams.map((t) => mapTeamToOutput(t)),
        total,
      }
    }),

  /**
   * teams.getById -- Returns a single team by ID with relations.
   *
   * Optionally includes team members with employee details.
   *
   * Requires: teams.manage permission
   *
   * Replaces: GET /teams/{id} (Go TeamHandler.Get)
   */
  getById: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(
      z.object({
        id: z.string().uuid(),
        includeMembers: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      const team = await ctx.prisma.team.findFirst({
        where: { id: input.id, tenantId },
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
          leader: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: { select: { members: true } },
          ...(input.includeMembers
            ? {
                members: {
                  include: {
                    employee: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                  orderBy: { joinedAt: "asc" as const },
                },
              }
            : {}),
        },
      })

      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      const result = mapTeamToOutput(team)
      const members = "members" in team && Array.isArray(team.members)
        ? (team.members as Array<{
            teamId: string
            employeeId: string
            role: string
            joinedAt: Date
            employee: { id: string; firstName: string; lastName: string } | null
          }>).map(mapTeamMemberToOutput)
        : undefined

      return { ...result, members }
    }),

  /**
   * teams.create -- Creates a new team.
   *
   * Validates name is non-empty after trimming.
   * Checks name uniqueness within tenant.
   *
   * Requires: teams.manage permission
   *
   * Replaces: POST /teams (Go TeamHandler.Create + TeamService.Create)
   */
  create: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(createTeamInputSchema)
    .output(teamOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Team name is required",
        })
      }

      // Check name uniqueness within tenant
      const existingByName = await ctx.prisma.team.findFirst({
        where: { tenantId, name },
      })
      if (existingByName) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Team name already exists",
        })
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create team
      const team = await ctx.prisma.team.create({
        data: {
          tenantId,
          name,
          description,
          departmentId: input.departmentId ?? null,
          leaderEmployeeId: input.leaderEmployeeId ?? null,
          isActive: true,
        },
      })

      return mapTeamToOutput(team, 0)
    }),

  /**
   * teams.update -- Updates an existing team.
   *
   * Supports partial updates. Validates name uniqueness when changed.
   *
   * Requires: teams.manage permission
   *
   * Replaces: PUT /teams/{id} (Go TeamHandler.Update + TeamService.Update)
   */
  update: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(updateTeamInputSchema)
    .output(teamOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Verify team exists (tenant-scoped)
      const existing = await ctx.prisma.team.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Team name is required",
          })
        }
        // Check uniqueness if changed
        if (name !== existing.name) {
          const existingByName = await ctx.prisma.team.findFirst({
            where: {
              tenantId,
              name,
              NOT: { id: input.id },
            },
          })
          if (existingByName) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Team name already exists",
            })
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

      const team = await ctx.prisma.team.update({
        where: { id: input.id },
        data,
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
          leader: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: { select: { members: true } },
        },
      })

      return mapTeamToOutput(team)
    }),

  /**
   * teams.delete -- Deletes a team.
   *
   * Hard deletes the team (members cascade via FK).
   *
   * Requires: teams.manage permission
   *
   * Replaces: DELETE /teams/{id} (Go TeamHandler.Delete)
   */
  delete: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Verify team exists (tenant-scoped)
      const existing = await ctx.prisma.team.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Hard delete (members cascade via DB FK)
      await ctx.prisma.team.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  /**
   * teams.getMembers -- Returns members of a team.
   *
   * Members are ordered by joinedAt ascending.
   *
   * Requires: teams.manage permission
   *
   * Replaces: GET /teams/{id}/members (Go TeamHandler.GetMembers)
   */
  getMembers: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(z.object({ teamId: z.string().uuid() }))
    .output(z.object({ items: z.array(teamMemberOutputSchema) }))
    .query(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Verify team exists (tenant-scoped)
      const team = await ctx.prisma.team.findFirst({
        where: { id: input.teamId, tenantId },
      })
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      const members = await ctx.prisma.teamMember.findMany({
        where: { teamId: input.teamId },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      })

      return {
        items: members.map(mapTeamMemberToOutput),
      }
    }),

  /**
   * teams.addMember -- Adds a member to a team.
   *
   * Default role is "member". Rejects duplicate members.
   *
   * Requires: teams.manage permission
   *
   * Replaces: POST /teams/{id}/members (Go TeamHandler.AddMember)
   */
  addMember: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(addMemberInputSchema)
    .output(teamMemberOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Verify team exists (tenant-scoped)
      const team = await ctx.prisma.team.findFirst({
        where: { id: input.teamId, tenantId },
      })
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      // Check if member already exists
      const existingMember = await ctx.prisma.teamMember.findUnique({
        where: {
          teamId_employeeId: {
            teamId: input.teamId,
            employeeId: input.employeeId,
          },
        },
      })
      if (existingMember) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Employee is already a team member",
        })
      }

      // Create team member
      const member = await ctx.prisma.teamMember.create({
        data: {
          teamId: input.teamId,
          employeeId: input.employeeId,
          role: input.role,
        },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      })

      return mapTeamMemberToOutput(member)
    }),

  /**
   * teams.updateMemberRole -- Updates a team member's role.
   *
   * Requires: teams.manage permission
   *
   * Replaces: PUT /teams/{id}/members/{eid} (Go TeamHandler.UpdateMemberRole)
   */
  updateMemberRole: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(updateMemberInputSchema)
    .output(teamMemberOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Verify team exists (tenant-scoped)
      const team = await ctx.prisma.team.findFirst({
        where: { id: input.teamId, tenantId },
      })
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      try {
        const member = await ctx.prisma.teamMember.update({
          where: {
            teamId_employeeId: {
              teamId: input.teamId,
              employeeId: input.employeeId,
            },
          },
          data: { role: input.role },
          include: {
            employee: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        })

        return mapTeamMemberToOutput(member)
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team member not found",
        })
      }
    }),

  /**
   * teams.removeMember -- Removes a member from a team.
   *
   * Requires: teams.manage permission
   *
   * Replaces: DELETE /teams/{id}/members/{eid} (Go TeamHandler.RemoveMember)
   */
  removeMember: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(removeMemberInputSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Verify team exists (tenant-scoped)
      const team = await ctx.prisma.team.findFirst({
        where: { id: input.teamId, tenantId },
      })
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team not found",
        })
      }

      try {
        await ctx.prisma.teamMember.delete({
          where: {
            teamId_employeeId: {
              teamId: input.teamId,
              employeeId: input.employeeId,
            },
          },
        })

        return { success: true }
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Team member not found",
        })
      }
    }),

  /**
   * teams.getByEmployee -- Returns all teams for an employee.
   *
   * Requires: teams.manage permission
   *
   * Replaces: GET /employees/{eid}/teams (Go TeamHandler.GetEmployeeTeams)
   */
  getByEmployee: tenantProcedure
    .use(requirePermission(TEAMS_MANAGE))
    .input(z.object({ employeeId: z.string().uuid() }))
    .output(z.object({ items: z.array(teamOutputSchema) }))
    .query(async ({ ctx, input }) => {
      const memberships = await ctx.prisma.teamMember.findMany({
        where: { employeeId: input.employeeId },
        include: {
          team: {
            include: {
              department: {
                select: { id: true, name: true, code: true },
              },
              leader: {
                select: { id: true, firstName: true, lastName: true },
              },
              _count: { select: { members: true } },
            },
          },
        },
      })

      return {
        items: memberships.map((m) => mapTeamToOutput(m.team)),
      }
    }),
})
