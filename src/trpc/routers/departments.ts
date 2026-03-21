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
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as departmentService from "@/lib/services/department-service"

// --- Permission Constants ---

const DEPARTMENTS_MANAGE = permissionIdByKey("departments.manage")!

// --- Output Schemas ---

const departmentOutputSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  parentId: z.string().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  managerEmployeeId: z.string().nullable(),
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
  code: z.string().min(1, "Code is required").max(50),
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  parentId: z.string().optional(),
  managerEmployeeId: z.string().optional(),
})

const updateDepartmentInputSchema = z.object({
  id: z.string(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  managerEmployeeId: z.string().nullable().optional(),
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
          parentId: z.string().optional(),
        })
        .optional()
    )
    .output(z.object({ data: z.array(departmentOutputSchema) }))
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const departments = await departmentService.list(
          ctx.prisma,
          tenantId,
          {
            isActive: input?.isActive,
            parentId: input?.parentId,
          }
        )
        return {
          data: departments.map(mapDepartmentToOutput),
        }
      } catch (err) {
        handleServiceError(err)
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
      try {
        const tenantId = ctx.tenantId!
        const departments = await departmentService.getTree(
          ctx.prisma,
          tenantId
        )
        const mapped = departments.map(mapDepartmentToOutput)
        return buildDepartmentTree(mapped)
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ id: z.string() }))
    .output(departmentOutputSchema)
    .query(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        const department = await departmentService.getById(
          ctx.prisma,
          tenantId,
          input.id
        )
        return mapDepartmentToOutput(department)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const department = await departmentService.create(
          ctx.prisma,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapDepartmentToOutput(department)
      } catch (err) {
        handleServiceError(err)
      }
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
      try {
        const tenantId = ctx.tenantId!
        const department = await departmentService.update(
          ctx.prisma,
          tenantId,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return mapDepartmentToOutput(department)
      } catch (err) {
        handleServiceError(err)
      }
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
    .input(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId!
        await departmentService.remove(
          ctx.prisma,
          tenantId,
          input.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
        return { success: true }
      } catch (err) {
        handleServiceError(err)
      }
    }),
})
