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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as teamService from "@/lib/services/teams-service"

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
      const tenantId = ctx.tenantId!
      try {
        const { teams, total } = await teamService.list(ctx.prisma, tenantId, {
          page: input?.page,
          pageSize: input?.pageSize,
          search: input?.search,
          isActive: input?.isActive,
          departmentId: input?.departmentId,
        })
        return {
          items: teams.map((t) => mapTeamToOutput(t)),
          total,
        }
      } catch (err) {
        handleServiceError(err)
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
      const tenantId = ctx.tenantId!
      try {
        const team = await teamService.getById(
          ctx.prisma,
          tenantId,
          input.id,
          input.includeMembers
        )
        const result = mapTeamToOutput(team)
        const members =
          "members" in team && Array.isArray(team.members)
            ? (
                team.members as Array<{
                  teamId: string
                  employeeId: string
                  role: string
                  joinedAt: Date
                  employee: {
                    id: string
                    firstName: string
                    lastName: string
                  } | null
                }>
              ).map(mapTeamMemberToOutput)
            : undefined

        return { ...result, members }
      } catch (err) {
        handleServiceError(err)
      }
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
      const tenantId = ctx.tenantId!
      try {
        const team = await teamService.create(ctx.prisma, tenantId, input)
        return mapTeamToOutput(team, 0)
      } catch (err) {
        handleServiceError(err)
      }
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
      const tenantId = ctx.tenantId!
      try {
        const team = await teamService.update(ctx.prisma, tenantId, input)
        return mapTeamToOutput(team)
      } catch (err) {
        handleServiceError(err)
      }
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
      const tenantId = ctx.tenantId!
      try {
        await teamService.remove(ctx.prisma, tenantId, input.id)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
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
      const tenantId = ctx.tenantId!
      try {
        const members = await teamService.getMembers(
          ctx.prisma,
          tenantId,
          input.teamId
        )
        return {
          items: members.map(mapTeamMemberToOutput),
        }
      } catch (err) {
        handleServiceError(err)
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
      const tenantId = ctx.tenantId!
      try {
        const member = await teamService.addMember(ctx.prisma, tenantId, input)
        return mapTeamMemberToOutput(member)
      } catch (err) {
        handleServiceError(err)
      }
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
      const tenantId = ctx.tenantId!
      try {
        const member = await teamService.updateMemberRole(
          ctx.prisma,
          tenantId,
          input
        )
        return mapTeamMemberToOutput(member)
      } catch (err) {
        handleServiceError(err)
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
      const tenantId = ctx.tenantId!
      try {
        await teamService.removeMember(ctx.prisma, tenantId, input)
        return { success: true }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const teams = await teamService.getByEmployee(
          ctx.prisma,
          input.employeeId
        )
        return {
          items: teams.map((t) => mapTeamToOutput(t)),
        }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
