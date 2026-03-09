import { describe, it, expect } from "vitest"
import { z } from "zod"
import type { UserGroup } from "@/generated/prisma/client"
import {
  createTRPCRouter,
  protectedProcedure,
  tenantProcedure,
  createCallerFactory,
} from "@/trpc/init"
import {
  requirePermission,
  requireSelfOrPermission,
  requireEmployeePermission,
  applyDataScope,
} from "../middleware/authorization"
import type { DataScope } from "../middleware/authorization"
import {
  createMockUser,
  createMockUserGroup,
  createMockSession,
  createMockContext,
  createAdminUser,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

const PERM_VIEW = "aaaaaaaa-aaaa-5aaa-aaaa-aaaaaaaaaaaa"
const PERM_EDIT = "bbbbbbbb-bbbb-5bbb-bbbb-bbbbbbbbbbbb"
const PERM_OWN = "cccccccc-cccc-5ccc-cccc-cccccccccccc"
const PERM_ALL = "dddddddd-dddd-5ddd-dddd-dddddddddddd"

// --- requirePermission tests ---

describe("requirePermission middleware", () => {
  const testRouter = createTRPCRouter({
    singlePerm: protectedProcedure
      .use(requirePermission(PERM_VIEW))
      .query(() => "ok"),
    multiPerm: protectedProcedure
      .use(requirePermission(PERM_VIEW, PERM_EDIT))
      .query(() => "ok"),
  })

  const createCaller = createCallerFactory(testRouter)

  it("allows admin user", async () => {
    const caller = createCaller(
      createMockContext({
        user: createAdminUser(),
        session: createMockSession(),
      })
    )
    const result = await caller.singlePerm()
    expect(result).toBe("ok")
  })

  it("allows user with required permission", async () => {
    const caller = createCaller(
      createMockContext({
        user: createUserWithPermissions([PERM_VIEW]),
        session: createMockSession(),
      })
    )
    const result = await caller.singlePerm()
    expect(result).toBe("ok")
  })

  it("blocks user without required permission", async () => {
    const caller = createCaller(
      createMockContext({
        user: createUserWithPermissions([PERM_EDIT]),
        session: createMockSession(),
      })
    )
    await expect(caller.singlePerm()).rejects.toThrow("Insufficient permissions")
  })

  it("blocks user with inactive group", async () => {
    const user = createMockUser({
      userGroup: createMockUserGroup({
        isActive: false,
        permissions: [PERM_VIEW] as UserGroup["permissions"],
      }),
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    await expect(caller.singlePerm()).rejects.toThrow("Insufficient permissions")
  })

  it("accepts any of multiple permissions (OR logic)", async () => {
    const caller = createCaller(
      createMockContext({
        user: createUserWithPermissions([PERM_EDIT]),
        session: createMockSession(),
      })
    )
    // multiPerm requires PERM_VIEW OR PERM_EDIT — user has PERM_EDIT
    const result = await caller.multiPerm()
    expect(result).toBe("ok")
  })

  it("allows no-group user with admin role", async () => {
    const user = createMockUser({ role: "admin", userGroup: null })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const result = await caller.singlePerm()
    expect(result).toBe("ok")
  })
})

// --- requireSelfOrPermission tests ---

describe("requireSelfOrPermission middleware", () => {
  const testRouter = createTRPCRouter({
    selfOrPerm: protectedProcedure
      .input(z.object({ userId: z.string() }))
      .use(
        requireSelfOrPermission(
          (input) => (input as { userId: string }).userId,
          PERM_EDIT
        )
      )
      .query(() => "ok"),
  })

  const createCaller = createCallerFactory(testRouter)

  it("allows self-access without permission", async () => {
    const user = createUserWithPermissions([]) // no permissions
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    // userId matches user.id -> self-access
    const result = await caller.selfOrPerm({ userId: user.id })
    expect(result).toBe("ok")
  })

  it("allows non-self with permission", async () => {
    const user = createUserWithPermissions([PERM_EDIT])
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const result = await caller.selfOrPerm({
      userId: "00000000-0000-0000-0000-000000000099",
    })
    expect(result).toBe("ok")
  })

  it("blocks non-self without permission", async () => {
    const user = createUserWithPermissions([PERM_VIEW]) // has VIEW, not EDIT
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    await expect(
      caller.selfOrPerm({ userId: "00000000-0000-0000-0000-000000000099" })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- requireEmployeePermission tests ---

describe("requireEmployeePermission middleware", () => {
  const testRouter = createTRPCRouter({
    employeePerm: protectedProcedure
      .input(z.object({ employeeId: z.string() }))
      .use(
        requireEmployeePermission(
          (input) => (input as { employeeId: string }).employeeId,
          PERM_OWN,
          PERM_ALL
        )
      )
      .query(() => "ok"),
  })

  const createCaller = createCallerFactory(testRouter)

  const OWN_EMPLOYEE_ID = "00000000-0000-0000-0000-000000000050"
  const OTHER_EMPLOYEE_ID = "00000000-0000-0000-0000-000000000051"

  it("allows admin user regardless of employeeId", async () => {
    const user = createAdminUser()
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const result = await caller.employeePerm({
      employeeId: OTHER_EMPLOYEE_ID,
    })
    expect(result).toBe("ok")
  })

  it("allows own employee with ownPermission", async () => {
    const user = createUserWithPermissions([PERM_OWN], {
      employeeId: OWN_EMPLOYEE_ID,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const result = await caller.employeePerm({
      employeeId: OWN_EMPLOYEE_ID,
    })
    expect(result).toBe("ok")
  })

  it("allows own employee with allPermission", async () => {
    const user = createUserWithPermissions([PERM_ALL], {
      employeeId: OWN_EMPLOYEE_ID,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const result = await caller.employeePerm({
      employeeId: OWN_EMPLOYEE_ID,
    })
    expect(result).toBe("ok")
  })

  it("blocks own employee without either permission", async () => {
    const user = createUserWithPermissions([PERM_VIEW], {
      employeeId: OWN_EMPLOYEE_ID,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    await expect(
      caller.employeePerm({ employeeId: OWN_EMPLOYEE_ID })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("allows other employee with allPermission", async () => {
    const user = createUserWithPermissions([PERM_ALL], {
      employeeId: OWN_EMPLOYEE_ID,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const result = await caller.employeePerm({
      employeeId: OTHER_EMPLOYEE_ID,
    })
    expect(result).toBe("ok")
  })

  it("blocks other employee with only ownPermission", async () => {
    const user = createUserWithPermissions([PERM_OWN], {
      employeeId: OWN_EMPLOYEE_ID,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    await expect(
      caller.employeePerm({ employeeId: OTHER_EMPLOYEE_ID })
    ).rejects.toThrow("Insufficient permissions")
  })

  it("blocks user with no employeeId and only ownPermission", async () => {
    const user = createUserWithPermissions([PERM_OWN], {
      employeeId: null,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    await expect(
      caller.employeePerm({ employeeId: OTHER_EMPLOYEE_ID })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- applyDataScope tests ---

describe("applyDataScope middleware", () => {
  const testRouter = createTRPCRouter({
    scopedQuery: protectedProcedure
      .use(applyDataScope())
      .query(({ ctx }) => {
        return (ctx as unknown as { dataScope: DataScope }).dataScope
      }),
  })

  const createCaller = createCallerFactory(testRouter)

  it("adds scope 'all' for default user", async () => {
    const user = createMockUser()
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const scope = await caller.scopedQuery()
    expect(scope.type).toBe("all")
    expect(scope.tenantIds).toEqual([])
    expect(scope.departmentIds).toEqual([])
    expect(scope.employeeIds).toEqual([])
  })

  it("adds scope 'department' with correct IDs", async () => {
    const deptIds = [
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]
    const user = createMockUser({
      dataScopeType: "department",
      dataScopeDepartmentIds: deptIds,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const scope = await caller.scopedQuery()
    expect(scope.type).toBe("department")
    expect(scope.departmentIds).toEqual(deptIds)
  })

  it("adds scope 'employee' with correct IDs", async () => {
    const empIds = ["33333333-3333-3333-3333-333333333333"]
    const user = createMockUser({
      dataScopeType: "employee",
      dataScopeEmployeeIds: empIds,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const scope = await caller.scopedQuery()
    expect(scope.type).toBe("employee")
    expect(scope.employeeIds).toEqual(empIds)
  })

  it("adds scope 'tenant' with correct IDs", async () => {
    const tenantIds = ["44444444-4444-4444-4444-444444444444"]
    const user = createMockUser({
      dataScopeType: "tenant",
      dataScopeTenantIds: tenantIds,
    })
    const caller = createCaller(
      createMockContext({ user, session: createMockSession() })
    )
    const scope = await caller.scopedQuery()
    expect(scope.type).toBe("tenant")
    expect(scope.tenantIds).toEqual(tenantIds)
  })
})

// --- tenantProcedure tenant access validation tests ---

describe("tenantProcedure tenant access validation", () => {
  const TENANT_ID = "00000000-0000-0000-0000-000000000100"
  const OTHER_TENANT_ID = "00000000-0000-0000-0000-000000000200"

  const testRouter = createTRPCRouter({
    tenantAction: tenantProcedure.query(({ ctx }) => `tenant:${ctx.tenantId}`),
  })

  const createCaller = createCallerFactory(testRouter)

  it("allows user with matching userTenants entry", async () => {
    const user = createMockUser({
      userTenants: [createMockUserTenant(
        "00000000-0000-0000-0000-000000000001",
        TENANT_ID
      )],
    })
    const caller = createCaller(
      createMockContext({
        user,
        session: createMockSession(),
        tenantId: TENANT_ID,
      })
    )
    const result = await caller.tenantAction()
    expect(result).toBe(`tenant:${TENANT_ID}`)
  })

  it("blocks user without matching userTenants entry", async () => {
    const user = createMockUser({
      userTenants: [createMockUserTenant(
        "00000000-0000-0000-0000-000000000001",
        OTHER_TENANT_ID
      )],
    })
    const caller = createCaller(
      createMockContext({
        user,
        session: createMockSession(),
        tenantId: TENANT_ID,
      })
    )
    await expect(caller.tenantAction()).rejects.toThrow(
      "Access to tenant denied"
    )
  })

  it("blocks user with empty userTenants", async () => {
    const user = createMockUser({ userTenants: [] })
    const caller = createCaller(
      createMockContext({
        user,
        session: createMockSession(),
        tenantId: TENANT_ID,
      })
    )
    await expect(caller.tenantAction()).rejects.toThrow(
      "Access to tenant denied"
    )
  })
})
