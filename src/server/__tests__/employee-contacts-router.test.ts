import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeContactsRouter } from "../routers/employeeContacts"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const CONTACT_ID = "a0000000-0000-4000-a000-000000000600"

const createCaller = createCallerFactory(employeeContactsRouter)

// --- Helpers ---

function makeContact(
  overrides: Partial<{
    id: string
    employeeId: string
    contactType: string
    value: string
    label: string | null
    isPrimary: boolean
    contactKindId: string | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: CONTACT_ID,
    employeeId: EMP_ID,
    contactType: "email",
    value: "john@example.com",
    label: null,
    isPrimary: false,
    contactKindId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [EMPLOYEES_VIEW, EMPLOYEES_EDIT]
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- employeeContacts.list tests ---

describe("employeeContacts.list", () => {
  it("returns contacts for employee", async () => {
    const contacts = [makeContact()]
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeContact: {
        findMany: vi.fn().mockResolvedValue(contacts),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.contactType).toBe("email")
  })

  it("verifies employee belongs to tenant", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.list({ employeeId: EMP_ID })).rejects.toThrow(
      "Employee not found"
    )
  })
})

// --- employeeContacts.create tests ---

describe("employeeContacts.create", () => {
  it("creates contact successfully", async () => {
    const created = makeContact()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeContact: {
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      contactType: "email",
      value: "john@example.com",
    })
    expect(result.contactType).toBe("email")
    expect(result.value).toBe("john@example.com")
  })

  it("trims values", async () => {
    const created = makeContact()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeContact: {
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      employeeId: EMP_ID,
      contactType: "  email  ",
      value: "  john@example.com  ",
    })
    const createCall = mockPrisma.employeeContact.create.mock.calls[0]![0]
    expect(createCall.data.contactType).toBe("email")
    expect(createCall.data.value).toBe("john@example.com")
  })

  it("rejects empty contactType", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        contactType: "   ",
        value: "john@example.com",
      })
    ).rejects.toThrow("Contact type is required")
  })

  it("rejects empty value", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        contactType: "email",
        value: "   ",
      })
    ).rejects.toThrow("Contact value is required")
  })

  it("verifies employee belongs to tenant", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        contactType: "email",
        value: "john@example.com",
      })
    ).rejects.toThrow("Employee not found")
  })
})

// --- employeeContacts.delete tests ---

describe("employeeContacts.delete", () => {
  it("deletes contact successfully", async () => {
    const contact = {
      ...makeContact(),
      employee: { tenantId: TENANT_ID },
    }
    const mockPrisma = {
      employeeContact: {
        findUnique: vi.fn().mockResolvedValue(contact),
        delete: vi.fn().mockResolvedValue(contact),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: CONTACT_ID })
    expect(result.success).toBe(true)
  })

  it("throws NOT_FOUND for missing contact", async () => {
    const mockPrisma = {
      employeeContact: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CONTACT_ID })).rejects.toThrow(
      "Contact not found"
    )
  })

  it("verifies employee belongs to tenant", async () => {
    const contact = {
      ...makeContact(),
      employee: { tenantId: "other-tenant-id" },
    }
    const mockPrisma = {
      employeeContact: {
        findUnique: vi.fn().mockResolvedValue(contact),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: CONTACT_ID })).rejects.toThrow(
      "Contact not found"
    )
  })
})
