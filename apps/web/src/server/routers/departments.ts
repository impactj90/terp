/**
 * Departments Router
 *
 * Provides department CRUD operations and tree hierarchy via tRPC procedures.
 * Replaces the Go backend department endpoints:
 * - GET /departments -> departments.list
 * - GET /departments/tree -> departments.getTree
 * - GET /departments/{id} -> departments.getById
 * - POST /departments -> departments.create
 * - PATCH /departments/{id} -> departments.update
 * - DELETE /departments/{id} -> departments.delete
 *
 * @see apps/api/internal/service/department.go
 * @see apps/api/internal/handler/department.go
 */
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, tenantProcedure } from "../trpc"
import type { TRPCContext } from "../trpc"
import { requirePermission } from "../middleware/authorization"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Permission Constants ---

const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!

// --- Output Schemas ---

const departmentOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  managerEmployeeId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

type DepartmentOutput = z.infer<typeof departmentOutputSchema>

// Recursive type for tree nodes
export type DepartmentTreeNode = {
  department: DepartmentOutput
  children: DepartmentTreeNode[]
}

// --- Input Schemas ---

const createDepartmentInputSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  managerEmployeeId: z.string().uuid().optional(),
})

const updateDepartmentInputSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  managerEmployeeId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
})

// --- Helpers ---

/**
 * Maps a Prisma Department record to the output schema shape.
 */
function mapDepartmentToOutput(dept: {
  id: string
  tenantId: string
  parentId: string | null
  code: string
  name: string
  description: string | null
  managerEmployeeId: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}): DepartmentOutput {
  return {
    id: dept.id,
    tenantId: dept.tenantId,
    parentId: dept.parentId,
    code: dept.code,
    name: dept.name,
    description: dept.description,
    managerEmployeeId: dept.managerEmployeeId,
    isActive: dept.isActive,
    createdAt: dept.createdAt,
    updatedAt: dept.updatedAt,
  }
}

/**
 * Builds a tree structure from a flat list of departments.
 * Ported from Go buildTree() in department.go.
 *
 * Algorithm:
 * 1. Build a map of id -> node (each with empty children array)
 * 2. Iterate departments: if parentId is null -> root, else attach to parent
 * 3. Return roots
 */
export function buildDepartmentTree(
  departments: DepartmentOutput[]
): DepartmentTreeNode[] {
  const nodeMap = new Map<string, DepartmentTreeNode>()
  for (const dept of departments) {
    nodeMap.set(dept.id, { department: dept, children: [] })
  }

  const roots: DepartmentTreeNode[] = []
  for (const dept of departments) {
    const node = nodeMap.get(dept.id)!
    if (dept.parentId === null) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(dept.parentId)
      if (parent) {
        parent.children.push(node)
      }
      // If parent not found in map, treat as orphan (skip)
    }
  }

  return roots
}

/**
 * Checks for circular references when updating a department's parent.
 * Walks up the parent chain from the proposed parent to detect cycles.
 * Ported from Go checkCircularReference() in department.go.
 */
async function checkCircularReference(
  db: TRPCContext["prisma"],
  deptId: string,
  proposedParentId: string
): Promise<boolean> {
  const visited = new Set<string>([deptId])
  let current: string | null = proposedParentId

  while (current !== null) {
    if (visited.has(current)) return true // circular!
    visited.add(current)

    const record: { parentId: string | null } | null =
      await db.department.findUnique({
        where: { id: current },
        select: { parentId: true },
      })
    if (!record) break // end of chain
    current = record.parentId
  }

  return false // no circular reference
}

// --- Router ---

export const departmentsRouter = createTRPCRouter({
  /**
   * departments.list -- Returns departments for the current tenant.
   *
   * Supports optional filters: isActive, parentId.
   * Orders by code ASC.
   *
   * Requires: departments.manage permission
   *
   * Replaces: GET /departments (Go DepartmentHandler.List)
   */
  list: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(
      z
        .object({
          isActive: z.boolean().optional(),
          parentId: z.string().uuid().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(departmentOutputSchema) }))
    .query(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!
      const where: Record<string, unknown> = {
        tenantId,
      }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive
      }

      if (input?.parentId !== undefined) {
        where.parentId = input.parentId
      }

      const departments = await ctx.prisma.department.findMany({
        where,
        orderBy: { code: "asc" },
      })

      return {
        data: departments.map(mapDepartmentToOutput),
      }
    }),

  /**
   * departments.getTree -- Returns hierarchical department tree.
   *
   * Fetches all departments for the tenant, then builds the tree
   * in application code (same approach as Go backend).
   *
   * Requires: departments.manage permission
   *
   * Replaces: GET /departments/tree (Go DepartmentHandler.GetTree)
   */
  getTree: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .query(async ({ ctx }): Promise<DepartmentTreeNode[]> => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!
      const departments = await ctx.prisma.department.findMany({
        where: { tenantId },
        orderBy: [{ name: "asc" }],
      })

      const mapped = departments.map(mapDepartmentToOutput)
      return buildDepartmentTree(mapped)
    }),

  /**
   * departments.getById -- Returns a single department by ID.
   *
   * Tenant-scoped: only returns departments belonging to the current tenant.
   *
   * Requires: departments.manage permission
   *
   * Replaces: GET /departments/{id} (Go DepartmentHandler.Get)
   */
  getById: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(departmentOutputSchema)
    .query(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!
      const department = await ctx.prisma.department.findFirst({
        where: { id: input.id, tenantId },
      })

      if (!department) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department not found",
        })
      }

      return mapDepartmentToOutput(department)
    }),

  /**
   * departments.create -- Creates a new department.
   *
   * Validates code and name are non-empty after trimming.
   * Checks code uniqueness within tenant.
   * If parentId provided, validates parent exists and belongs to same tenant.
   *
   * Requires: departments.manage permission
   *
   * Replaces: POST /departments (Go DepartmentHandler.Create + DepartmentService.Create)
   */
  create: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(createDepartmentInputSchema)
    .output(departmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Trim and validate code
      const code = input.code.trim()
      if (code.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Department code is required",
        })
      }

      // Trim and validate name
      const name = input.name.trim()
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Department name is required",
        })
      }

      // Check code uniqueness within tenant
      const existingByCode = await ctx.prisma.department.findFirst({
        where: { tenantId, code },
      })
      if (existingByCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Department code already exists",
        })
      }

      // If parentId provided, verify parent exists and belongs to same tenant
      if (input.parentId) {
        const parentDept = await ctx.prisma.department.findFirst({
          where: { id: input.parentId, tenantId },
        })
        if (!parentDept) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Parent department not found",
          })
        }
      }

      // Trim description if provided
      const description = input.description?.trim() || null

      // Create department
      const department = await ctx.prisma.department.create({
        data: {
          tenantId,
          code,
          name,
          description,
          parentId: input.parentId ?? null,
          managerEmployeeId: input.managerEmployeeId ?? null,
          isActive: true,
        },
      })

      return mapDepartmentToOutput(department)
    }),

  /**
   * departments.update -- Updates an existing department.
   *
   * Supports partial updates. Validates code/name uniqueness when changed.
   * Performs circular reference detection for parent changes.
   *
   * Requires: departments.manage permission
   *
   * Replaces: PATCH /departments/{id} (Go DepartmentHandler.Update + DepartmentService.Update)
   */
  update: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(updateDepartmentInputSchema)
    .output(departmentOutputSchema)
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Verify department exists (tenant-scoped)
      const existing = await ctx.prisma.department.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department not found",
        })
      }

      // Build partial update data
      const data: Record<string, unknown> = {}

      // Handle code update
      if (input.code !== undefined) {
        const code = input.code.trim()
        if (code.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Department code is required",
          })
        }
        // Check uniqueness if changed
        if (code !== existing.code) {
          const existingByCode = await ctx.prisma.department.findFirst({
            where: {
              tenantId,
              code,
              NOT: { id: input.id },
            },
          })
          if (existingByCode) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Department code already exists",
            })
          }
        }
        data.code = code
      }

      // Handle name update
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Department name is required",
          })
        }
        data.name = name
      }

      // Handle description update
      if (input.description !== undefined) {
        data.description =
          input.description === null ? null : input.description.trim()
      }

      // Handle parentId update
      if (input.parentId !== undefined) {
        if (input.parentId === null) {
          // Clear parent
          data.parentId = null
        } else {
          // Self-reference check
          if (input.parentId === input.id) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Circular reference detected",
            })
          }

          // Parent existence + same-tenant check
          const parentDept = await ctx.prisma.department.findFirst({
            where: { id: input.parentId, tenantId },
          })
          if (!parentDept) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Parent department not found",
            })
          }

          // Deep circular reference check
          const isCircular = await checkCircularReference(
            ctx.prisma,
            input.id,
            input.parentId
          )
          if (isCircular) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Circular reference detected",
            })
          }

          data.parentId = input.parentId
        }
      }

      // Handle managerEmployeeId update
      if (input.managerEmployeeId !== undefined) {
        data.managerEmployeeId = input.managerEmployeeId
      }

      // Handle isActive update
      if (input.isActive !== undefined) {
        data.isActive = input.isActive
      }

      const department = await ctx.prisma.department.update({
        where: { id: input.id },
        data,
      })

      return mapDepartmentToOutput(department)
    }),

  /**
   * departments.delete -- Deletes a department.
   *
   * Prevents deletion when department has children or assigned employees.
   *
   * Requires: departments.manage permission
   *
   * Replaces: DELETE /departments/{id} (Go DepartmentHandler.Delete + DepartmentService.Delete)
   */
  delete: tenantProcedure
    .use(requirePermission(DEPARTMENTS_MANAGE))
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // ctx.tenantId is guaranteed non-null by tenantProcedure
      const tenantId = ctx.tenantId!

      // Verify department exists (tenant-scoped)
      const existing = await ctx.prisma.department.findFirst({
        where: { id: input.id, tenantId },
      })
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department not found",
        })
      }

      // Check for children
      const childCount = await ctx.prisma.department.count({
        where: { parentId: input.id },
      })
      if (childCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete department with child departments",
        })
      }

      // Check for employees
      const employeeCount = await ctx.prisma.employee.count({
        where: { departmentId: input.id },
      })
      if (employeeCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete department with assigned employees",
        })
      }

      // Hard delete
      await ctx.prisma.department.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),
})
