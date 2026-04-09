import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { exportTemplatesRouter } from "../exportTemplates"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as service from "@/lib/services/export-template-service"
import * as engine from "@/lib/services/export-engine-service"

vi.mock("@/lib/services/export-template-service", () => ({
  list: vi.fn(),
  getById: vi.fn(),
  listVersions: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  ExportTemplateNotFoundError: class extends Error {
    constructor() {
      super("Export template not found")
      this.name = "ExportTemplateNotFoundError"
    }
  },
  ExportTemplateValidationError: class extends Error {
    constructor(m: string) {
      super(m)
      this.name = "ExportTemplateValidationError"
    }
  },
  ExportTemplateConflictError: class extends Error {
    constructor(m: string) {
      super(m)
      this.name = "ExportTemplateConflictError"
    }
  },
}))

vi.mock("@/lib/services/export-engine-service", () => ({
  generateExport: vi.fn(),
}))

vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

const VIEW = permissionIdByKey("export_template.view")!
const CREATE = permissionIdByKey("export_template.create")!
const EDIT = permissionIdByKey("export_template.edit")!
const DELETE = permissionIdByKey("export_template.delete")!
const EXECUTE = permissionIdByKey("export_template.execute")!

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const TPL_ID = "a0000000-0000-4000-a000-000000000900"

const createCaller = createCallerFactory(exportTemplatesRouter)

function makeTpl(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: TPL_ID,
    tenantId: TENANT_ID,
    name: "Test LODAS",
    description: null,
    targetSystem: "datev_lodas",
    templateBody: "{{ employees.size }}",
    outputFilename: "export.txt",
    encoding: "windows-1252",
    lineEnding: "crlf",
    fieldSeparator: ";",
    decimalSeparator: ",",
    dateFormat: "TT.MM.JJJJ",
    version: 1,
    isActive: true,
    createdBy: USER_ID,
    updatedBy: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

function ctx(perms: string[] = [VIEW, CREATE, EDIT, DELETE, EXECUTE]) {
  return createMockContext({
    prisma: {} as never,
    authToken: "test-token",
    user: createUserWithPermissions(perms, {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("exportTemplates.list", () => {
  it("returns templates", async () => {
    vi.mocked(service.list).mockResolvedValue([makeTpl() as never])
    const caller = createCaller(ctx())
    const result = await caller.list()
    expect(result).toHaveLength(1)
    expect(result![0]!.name).toBe("Test LODAS")
  })

  it("denies without view permission", async () => {
    const caller = createCaller(ctx([]))
    await expect(caller.list()).rejects.toThrow()
  })
})

describe("exportTemplates.create", () => {
  it("creates a template", async () => {
    vi.mocked(service.create).mockResolvedValue(makeTpl() as never)
    const caller = createCaller(ctx())
    const result = await caller.create({
      name: "Test LODAS",
      targetSystem: "datev_lodas",
      templateBody: "{{ employees.size }}",
    })
    expect(result!.name).toBe("Test LODAS")
    expect(service.create).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ name: "Test LODAS" }),
      expect.objectContaining({ userId: expect.any(String) }),
    )
  })

  it("rejects invalid Liquid (validation passes through)", async () => {
    vi.mocked(service.create).mockRejectedValue(
      new service.ExportTemplateValidationError("Invalid Liquid syntax: bad"),
    )
    const caller = createCaller(ctx())
    await expect(
      caller.create({
        name: "Bad",
        targetSystem: "custom",
        templateBody: "{% if missing %}",
      }),
    ).rejects.toThrow("Invalid Liquid")
  })

  it("denies without create permission", async () => {
    const caller = createCaller(ctx([VIEW]))
    await expect(
      caller.create({
        name: "X",
        targetSystem: "custom",
        templateBody: "x",
      }),
    ).rejects.toThrow()
  })

  it("returns CONFLICT for duplicate name", async () => {
    vi.mocked(service.create).mockRejectedValue(
      new service.ExportTemplateConflictError("already exists"),
    )
    const caller = createCaller(ctx())
    await expect(
      caller.create({
        name: "X",
        targetSystem: "custom",
        templateBody: "x",
      }),
    ).rejects.toThrow("already exists")
  })
})

describe("exportTemplates.update", () => {
  it("updates a template", async () => {
    vi.mocked(service.update).mockResolvedValue(
      makeTpl({ name: "Renamed" }) as never,
    )
    const caller = createCaller(ctx())
    const result = await caller.update({
      id: TPL_ID,
      name: "Renamed",
    })
    expect(result!.name).toBe("Renamed")
  })

  it("returns NOT_FOUND when template missing", async () => {
    vi.mocked(service.update).mockRejectedValue(
      new service.ExportTemplateNotFoundError(),
    )
    const caller = createCaller(ctx())
    await expect(
      caller.update({ id: TPL_ID, name: "X" }),
    ).rejects.toThrow("Export template not found")
  })

  it("denies without edit permission", async () => {
    const caller = createCaller(ctx([VIEW]))
    await expect(
      caller.update({ id: TPL_ID, name: "X" }),
    ).rejects.toThrow()
  })
})

describe("exportTemplates.delete", () => {
  it("deletes a template", async () => {
    vi.mocked(service.remove).mockResolvedValue({ success: true })
    const caller = createCaller(ctx())
    const result = await caller.delete({ id: TPL_ID })
    expect(result!.success).toBe(true)
  })

  it("denies without delete permission", async () => {
    const caller = createCaller(ctx([VIEW]))
    await expect(caller.delete({ id: TPL_ID })).rejects.toThrow()
  })
})

describe("exportTemplates.preview", () => {
  it("returns rendered preview", async () => {
    vi.mocked(engine.generateExport).mockResolvedValue({
      file: Buffer.from("rendered content"),
      filename: "export.txt",
      fileHash: "deadbeef",
      employeeCount: 3,
      byteSize: 16,
      templateId: TPL_ID,
      templateVersion: 1,
    })
    const caller = createCaller(ctx())
    const result = await caller.preview({ id: TPL_ID, year: 2026, month: 4 })
    expect(result!.rendered).toBe("rendered content")
    expect(result!.employeeCount).toBe(3)
    expect(result!.truncated).toBe(false)
    expect(engine.generateExport).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.objectContaining({ templateId: TPL_ID, year: 2026, month: 4 }),
      expect.anything(),
      expect.objectContaining({ isTest: true }),
    )
  })

  it("truncates large outputs", async () => {
    const big = "x".repeat(60_000)
    vi.mocked(engine.generateExport).mockResolvedValue({
      file: Buffer.from(big),
      filename: "x.txt",
      fileHash: "h",
      employeeCount: 1,
      byteSize: big.length,
      templateId: TPL_ID,
      templateVersion: 1,
    })
    const caller = createCaller(ctx())
    const result = await caller.preview({ id: TPL_ID, year: 2026, month: 4 })
    expect(result!.truncated).toBe(true)
    expect(result!.rendered.length).toBe(50_000)
  })

  it("denies without execute permission", async () => {
    const caller = createCaller(ctx([VIEW]))
    await expect(
      caller.preview({ id: TPL_ID, year: 2026, month: 4 }),
    ).rejects.toThrow()
  })
})

describe("exportTemplates.runExport", () => {
  it("runs an export and returns base64 content", async () => {
    vi.mocked(engine.generateExport).mockResolvedValue({
      file: Buffer.from("contents"),
      filename: "out.txt",
      fileHash: "abc",
      employeeCount: 2,
      byteSize: 8,
      templateId: TPL_ID,
      templateVersion: 1,
    })
    const caller = createCaller(ctx())
    const result = await caller.runExport({
      id: TPL_ID,
      year: 2026,
      month: 4,
    })
    expect(result!.contentBase64).toBe(Buffer.from("contents").toString("base64"))
    expect(engine.generateExport).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ isTest: false }),
    )
  })
})
