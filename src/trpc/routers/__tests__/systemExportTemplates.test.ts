import { describe, it, expect, vi, beforeEach } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { systemExportTemplatesRouter } from "../systemExportTemplates"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import * as service from "@/lib/services/system-export-template-service"

vi.mock("@/lib/services/system-export-template-service", () => ({
  list: vi.fn(),
  getById: vi.fn(),
  copyToTenant: vi.fn(),
  SystemExportTemplateNotFoundError: class extends Error {
    constructor() {
      super("not found")
      this.name = "SystemExportTemplateNotFoundError"
    }
  },
}))

vi.mock("@/lib/services/audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))

const VIEW = permissionIdByKey("export_template.view")!
const CREATE = permissionIdByKey("export_template.create")!

const TENANT_ID = "a0000000-0000-4000-a000-000000000200"
const USER_ID = "a0000000-0000-4000-a000-000000000201"
const SYS_TPL_ID = "a0000000-0000-4000-a000-000000000202"

const createCaller = createCallerFactory(systemExportTemplatesRouter)

function makeSysTpl(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: SYS_TPL_ID,
    name: "DATEV LODAS — Bewegungsdaten",
    description: "Std Vorlage",
    targetSystem: "datev_lodas",
    templateBody: "{{ employees.size }}",
    outputFilename: "lodas.txt",
    encoding: "windows-1252",
    lineEnding: "crlf",
    fieldSeparator: ";",
    decimalSeparator: ",",
    dateFormat: "TT.MM.JJJJ",
    version: 1,
    sortOrder: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

function ctx(perms: string[] = [VIEW, CREATE]) {
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

beforeEach(() => vi.clearAllMocks())

describe("systemExportTemplates.list", () => {
  it("returns the list", async () => {
    vi.mocked(service.list).mockResolvedValue([makeSysTpl() as never])
    const caller = createCaller(ctx())
    const result = await caller.list()
    expect(result).toHaveLength(1)
  })

  it("denies without view permission", async () => {
    const caller = createCaller(ctx([]))
    await expect(caller.list()).rejects.toThrow()
  })
})

describe("systemExportTemplates.getById", () => {
  it("returns a single template", async () => {
    vi.mocked(service.getById).mockResolvedValue(makeSysTpl() as never)
    const caller = createCaller(ctx())
    const result = await caller.getById({ id: SYS_TPL_ID })
    expect(result!.id).toBe(SYS_TPL_ID)
  })

  it("passes through NotFoundError", async () => {
    vi.mocked(service.getById).mockRejectedValue(
      new service.SystemExportTemplateNotFoundError(),
    )
    const caller = createCaller(ctx())
    await expect(caller.getById({ id: SYS_TPL_ID })).rejects.toThrow()
  })
})

describe("systemExportTemplates.copyToTenant", () => {
  it("copies a system template into the tenant", async () => {
    vi.mocked(service.copyToTenant).mockResolvedValue({
      id: "new-id",
      name: "DATEV LODAS — Bewegungsdaten",
    } as never)
    const caller = createCaller(ctx())
    const result = await caller.copyToTenant({ systemTemplateId: SYS_TPL_ID })
    expect(result!.id).toBe("new-id")
    expect(service.copyToTenant).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      SYS_TPL_ID,
      expect.objectContaining({ userId: expect.any(String) }),
      expect.any(Object),
    )
  })

  it("requires the create permission", async () => {
    const caller = createCaller(ctx([VIEW]))
    await expect(
      caller.copyToTenant({ systemTemplateId: SYS_TPL_ID }),
    ).rejects.toThrow()
  })
})
