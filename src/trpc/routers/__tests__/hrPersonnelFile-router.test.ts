import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { hrRouter } from "../hr"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the service modules
vi.mock("@/lib/services/hr-personnel-file-service", () => ({
  listCategories: vi.fn().mockResolvedValue([
    { id: "cat-1", tenantId: "t1", name: "Verträge", code: "CONTRACTS", color: "#3B82F6", sortOrder: 1, isActive: true, visibleToRoles: ["admin", "hr"] },
  ]),
  createCategory: vi.fn().mockResolvedValue({
    id: "cat-new", tenantId: "t1", name: "Test", code: "TEST", color: "#000000", sortOrder: 0, isActive: true, visibleToRoles: ["admin"],
  }),
  updateCategory: vi.fn().mockResolvedValue({
    id: "cat-1", tenantId: "t1", name: "Updated", code: "CONTRACTS", color: "#3B82F6", sortOrder: 1, isActive: true, visibleToRoles: ["admin", "hr"],
  }),
  deleteCategory: vi.fn().mockResolvedValue(undefined),
  listEntries: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getEntryById: vi.fn().mockResolvedValue({
    id: "entry-1", tenantId: "t1", employeeId: "emp-1", categoryId: "cat-1",
    title: "Test Entry", entryDate: new Date(), isConfidential: false,
    category: { id: "cat-1", name: "Verträge", code: "CONTRACTS", color: "#3B82F6", visibleToRoles: ["admin"] },
    attachments: [], employee: { id: "emp-1", firstName: "Max", lastName: "Mustermann", personnelNumber: "001" },
  }),
  createEntry: vi.fn().mockResolvedValue({
    id: "entry-new", tenantId: "t1", employeeId: "emp-1", categoryId: "cat-1",
    title: "New Entry", entryDate: new Date(), isConfidential: false,
  }),
  updateEntry: vi.fn().mockResolvedValue({
    id: "entry-1", title: "Updated Entry",
  }),
  deleteEntry: vi.fn().mockResolvedValue(undefined),
  getReminders: vi.fn().mockResolvedValue([]),
  getExpiringEntries: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/services/hr-personnel-file-attachment-service", () => ({
  getUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://test.supabase.co/upload-signed",
    storagePath: "tenant/employee/entry/file.pdf",
    token: "test-token",
  }),
  confirmUpload: vi.fn().mockResolvedValue({
    id: "e1000000-0000-4000-a000-000000000001", entryId: "entry-1", filename: "test.pdf", mimeType: "application/pdf", sizeBytes: 1000,
  }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
  getDownloadUrl: vi.fn().mockResolvedValue({
    downloadUrl: "https://test.supabase.co/download-signed",
    filename: "test.pdf",
    mimeType: "application/pdf",
  }),
}))

// --- Constants ---
const PF_VIEW = permissionIdByKey("hr_personnel_file.view")!
const PF_CREATE = permissionIdByKey("hr_personnel_file.create")!
const PF_EDIT = permissionIdByKey("hr_personnel_file.edit")!
const PF_DELETE = permissionIdByKey("hr_personnel_file.delete")!
const PF_VIEW_CONFIDENTIAL = permissionIdByKey("hr_personnel_file.view_confidential")!
const PF_CAT_MANAGE = permissionIdByKey("hr_personnel_file_categories.manage")!

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "b1000000-0000-4000-a000-000000000001"
const CATEGORY_ID = "c1000000-0000-4000-a000-000000000001"
const ENTRY_ID = "d1000000-0000-4000-a000-000000000001"

const ALL_PERMS = [PF_VIEW, PF_CREATE, PF_EDIT, PF_DELETE, PF_VIEW_CONFIDENTIAL, PF_CAT_MANAGE]

const createCaller = createCallerFactory(hrRouter)

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = ALL_PERMS
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createNoPermContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [])
}

function createViewOnlyContext(prisma: Record<string, unknown>) {
  return createTestContext(prisma, [PF_VIEW])
}

// --- Tests ---

describe("hr.personnelFile", () => {
  describe("categories", () => {
    it("list - accessible to any authenticated tenant user (read-only)", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      const result = await caller.personnelFile.categories.list()
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })

    it("create - requires hr_personnel_file_categories.manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.categories.create({
          name: "Test",
          code: "TEST",
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("create - calls service with correct params", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.personnelFile.categories.create({
        name: "Test",
        code: "TEST",
        color: "#FF0000",
      })
      expect(result).toBeDefined()
      expect(result?.id).toBe("cat-new")
    })

    it("update - requires hr_personnel_file_categories.manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.categories.update({
          id: CATEGORY_ID,
          name: "Updated",
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("delete - requires hr_personnel_file_categories.manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.categories.delete({ id: CATEGORY_ID })
      ).rejects.toThrow("Insufficient permissions")
    })
  })

  describe("entries", () => {
    it("list - requires hr_personnel_file.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.personnelFile.entries.list({ employeeId: EMPLOYEE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("list - returns paginated entries", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.personnelFile.entries.list({
        employeeId: EMPLOYEE_ID,
      })
      expect(result).toBeDefined()
      expect(result).toMatchObject({ items: [], total: 0 })
    })

    it("getById - requires hr_personnel_file.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.personnelFile.entries.getById({ id: ENTRY_ID })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("create - requires hr_personnel_file.create permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.entries.create({
          employeeId: EMPLOYEE_ID,
          categoryId: CATEGORY_ID,
          title: "Test",
          entryDate: new Date(),
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("create - creates entry with all fields", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.personnelFile.entries.create({
        employeeId: EMPLOYEE_ID,
        categoryId: CATEGORY_ID,
        title: "New Entry",
        entryDate: new Date(),
        description: "Test description",
        isConfidential: false,
      })
      expect(result).toBeDefined()
      expect(result?.id).toBe("entry-new")
    })

    it("update - requires hr_personnel_file.edit permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.entries.update({
          id: ENTRY_ID,
          title: "Updated",
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("delete - requires hr_personnel_file.delete permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.entries.delete({ id: ENTRY_ID })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("getReminders - returns due reminders", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.personnelFile.entries.getReminders({})
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })

    it("getExpiring - returns soon-expiring entries", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.personnelFile.entries.getExpiring({
        withinDays: 30,
      })
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe("attachments", () => {
    it("getUploadUrl - requires hr_personnel_file.create permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.attachments.getUploadUrl({
          entryId: ENTRY_ID,
          filename: "test.pdf",
          mimeType: "application/pdf",
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("getUploadUrl - returns signed URL on success", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.personnelFile.attachments.getUploadUrl({
        entryId: ENTRY_ID,
        filename: "test.pdf",
        mimeType: "application/pdf",
      })
      expect(result).toMatchObject({
        signedUrl: expect.stringContaining("upload-signed"),
        storagePath: expect.any(String),
        token: "test-token",
      })
    })

    it("confirm - requires hr_personnel_file.create permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.attachments.confirm({
          entryId: ENTRY_ID,
          storagePath: "path/to/file.pdf",
          filename: "test.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1000,
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("delete - requires hr_personnel_file.delete permission", async () => {
      const prisma = {}
      const caller = createCaller(createViewOnlyContext(prisma))
      await expect(
        caller.personnelFile.attachments.delete({ id: "att-1" })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("getDownloadUrl - requires hr_personnel_file.view permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.personnelFile.attachments.getDownloadUrl({ id: "att-1" })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("getDownloadUrl - returns download URL on success", async () => {
      const prisma = {}
      const caller = createCaller(createTestContext(prisma))
      const result = await caller.personnelFile.attachments.getDownloadUrl({
        id: "e1000000-0000-4000-a000-000000000001",
      })
      expect(result).toMatchObject({
        downloadUrl: expect.stringContaining("download-signed"),
        filename: "test.pdf",
        mimeType: "application/pdf",
      })
    })
  })

  describe("permission gating", () => {
    it("entries.list - returns FORBIDDEN without permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.personnelFile.entries.list({ employeeId: EMPLOYEE_ID })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("entries.create - returns FORBIDDEN without permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.personnelFile.entries.create({
          employeeId: EMPLOYEE_ID,
          categoryId: CATEGORY_ID,
          title: "Test",
          entryDate: new Date(),
        })
      ).rejects.toThrow("Insufficient permissions")
    })

    it("categories.create - returns FORBIDDEN without manage permission", async () => {
      const prisma = {}
      const caller = createCaller(createNoPermContext(prisma))
      await expect(
        caller.personnelFile.categories.create({
          name: "Test",
          code: "TEST",
        })
      ).rejects.toThrow("Insufficient permissions")
    })
  })
})
