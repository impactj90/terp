import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { serviceObjectsRouter } from "../serviceObjects"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// requireModule("crm") uses db.prisma.tenantModule.findUnique.
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

// Mock storage so attachment endpoints don't hit real Supabase.
vi.mock("@/lib/supabase/storage", () => ({
  createSignedUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://up",
    path: "x",
    token: "t",
  }),
  createSignedReadUrl: vi.fn().mockResolvedValue("https://dl"),
  upload: vi.fn().mockResolvedValue({ path: "p" }),
  remove: vi.fn().mockResolvedValue(undefined),
  removeBatched: vi.fn().mockResolvedValue(undefined),
  fixSignedUrl: vi.fn((u: string) => u),
}))

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-mock")),
}))

const SO_VIEW = permissionIdByKey("service_objects.view")!
const SO_MANAGE = permissionIdByKey("service_objects.manage")!
const SO_DELETE = permissionIdByKey("service_objects.delete")!

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT_ID = "b0000000-0000-4000-b000-000000000200"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const SO_ID = "50000000-0000-4000-a000-000000000001"
const CUSTOMER_ID = "c0000000-0000-4000-a000-000000000001"
const PARENT_ID = "50000000-0000-4000-a000-000000000002"
const ATT_ID = "a1000000-0000-4000-a000-000000000001"

const createCaller = createCallerFactory(serviceObjectsRouter)

const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function ctx(
  prisma: Record<string, unknown>,
  permissions: string[] = [SO_VIEW, SO_MANAGE, SO_DELETE],
  tenantId: string | null = TENANT_ID
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<
      typeof createMockContext
    >["prisma"],
    authToken: "tok",
    user: createUserWithPermissions(permissions, {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId,
  })
}

const baseServiceObject = {
  id: SO_ID,
  tenantId: TENANT_ID,
  number: "SO-001",
  name: "Test Machine",
  description: null,
  kind: "EQUIPMENT" as const,
  parentId: null,
  customerAddressId: CUSTOMER_ID,
  internalNumber: null,
  manufacturer: null,
  model: null,
  serialNumber: null,
  yearBuilt: null,
  inServiceSince: null,
  status: "OPERATIONAL" as const,
  isActive: true,
  qrCodePayload: "TERP:SO:a00000:SO-001",
  customFields: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
}

describe("serviceObjects router — permission checks", () => {
  it("rejects list without service_objects.view permission", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceObject: {
            findMany: vi.fn(),
            count: vi.fn(),
          },
        },
        /* no permissions */ []
      )
    )
    await expect(caller.list({})).rejects.toThrow()
  })

  it("rejects create without service_objects.manage permission", async () => {
    const caller = createCaller(
      ctx(
        {
          crmAddress: { findFirst: vi.fn() },
          serviceObject: {
            findFirst: vi.fn(),
            create: vi.fn(),
          },
        },
        [SO_VIEW] // view only
      )
    )
    await expect(
      caller.create({
        number: "SO-002",
        name: "New",
        customerAddressId: CUSTOMER_ID,
      })
    ).rejects.toThrow()
  })

  it("rejects delete without service_objects.delete permission", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceObject: {
            findFirst: vi.fn(),
          },
        },
        [SO_VIEW, SO_MANAGE]
      )
    )
    await expect(caller.delete({ id: SO_ID })).rejects.toThrow()
  })
})

describe("serviceObjects router — tenant header validation", () => {
  it("rejects when tenantId is missing in context", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceObject: {
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
          },
        },
        [SO_VIEW],
        /* no tenant */ null
      )
    )
    await expect(caller.list({})).rejects.toThrow()
  })

  it("rejects when user has no membership in the given tenant", async () => {
    const caller = createCaller(
      ctx(
        {
          serviceObject: {
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
          },
        },
        [SO_VIEW],
        OTHER_TENANT_ID // user is member of TENANT_ID only
      )
    )
    await expect(caller.list({})).rejects.toThrow(/tenant/i)
  })
})

describe("serviceObjects router — list / getById / getTree", () => {
  it("list returns data scoped to tenant", async () => {
    const items = [baseServiceObject]
    const caller = createCaller(
      ctx({
        serviceObject: {
          findMany: vi.fn().mockResolvedValue(items),
          count: vi.fn().mockResolvedValue(1),
        },
      })
    )
    const res = await caller.list({})
    expect(res?.total).toBe(1)
    expect(res?.items).toHaveLength(1)
  })

  it("getById forwards to service and returns record", async () => {
    const caller = createCaller(
      ctx({
        serviceObject: {
          findFirst: vi.fn().mockResolvedValue(baseServiceObject),
        },
      })
    )
    const res = await caller.getById({ id: SO_ID })
    expect(res?.id).toBe(SO_ID)
  })

  it("getTree returns the flat tenant-scoped list", async () => {
    const flat = [
      {
        id: SO_ID,
        number: "SO-1",
        name: "A",
        kind: "EQUIPMENT",
        status: "OPERATIONAL",
        isActive: true,
        parentId: null,
      },
    ]
    const caller = createCaller(
      ctx({
        serviceObject: {
          findMany: vi.fn().mockResolvedValue(flat),
        },
      })
    )
    const res = await caller.getTree({ customerAddressId: CUSTOMER_ID })
    expect(res).toHaveLength(1)
  })
})

describe("serviceObjects router — create / update / move / delete", () => {
  it("create uses manage permission and calls service", async () => {
    const caller = createCaller(
      ctx({
        crmAddress: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: CUSTOMER_ID, type: "CUSTOMER" }),
        },
        serviceObject: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(baseServiceObject),
        },
      })
    )
    const res = await caller.create({
      number: "SO-001",
      name: "Test Machine",
      customerAddressId: CUSTOMER_ID,
    })
    expect(res?.id).toBe(SO_ID)
  })

  it("move is a dedicated procedure and delegates to service.moveServiceObject", async () => {
    const caller = createCaller(
      ctx({
        serviceObject: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(baseServiceObject) // findById for update
            .mockResolvedValueOnce({
              id: PARENT_ID,
              customerAddressId: CUSTOMER_ID,
            }) // validateParent
            .mockResolvedValueOnce({ parentId: null }) // cycle walk
            .mockResolvedValueOnce({
              ...baseServiceObject,
              parentId: PARENT_ID,
            }), // refetch after updateMany
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
    )
    const res = await caller.move({ id: SO_ID, parentId: PARENT_ID })
    expect(res?.parentId).toBe(PARENT_ID)
  })

  it("delete returns soft or hard mode", async () => {
    const caller = createCaller(
      ctx({
        serviceObject: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(baseServiceObject)
            .mockResolvedValueOnce({ ...baseServiceObject, isActive: false }),
          count: vi.fn().mockResolvedValue(0),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        order: { count: vi.fn().mockResolvedValue(2) }, // force soft
        whStockMovement: { count: vi.fn().mockResolvedValue(0) },
      })
    )
    const res = await caller.delete({ id: SO_ID })
    expect(res).toEqual({ success: true, mode: "soft" })
  })
})

describe("serviceObjects router — attachments + QR", () => {
  it("getAttachments returns list with signed download URLs", async () => {
    const caller = createCaller(
      ctx({
        serviceObjectAttachment: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: ATT_ID,
              filename: "x.pdf",
              storagePath: `${TENANT_ID}/${SO_ID}/x.pdf`,
              mimeType: "application/pdf",
              sizeBytes: 500,
            },
          ]),
        },
      })
    )
    const res = await caller.getAttachments({ serviceObjectId: SO_ID })
    expect(res).toHaveLength(1)
    expect(res?.[0]!.downloadUrl).toMatch(/^https:\/\//)
  })

  it("generateSingleQr returns payload for an existing object", async () => {
    const caller = createCaller(
      ctx({
        serviceObject: {
          findFirst: vi.fn().mockResolvedValue({
            id: SO_ID,
            number: "SO-001",
            name: "Test",
            kind: "EQUIPMENT",
            status: "OPERATIONAL",
            customerAddress: { id: CUSTOMER_ID, company: "Acme", number: "K-1" },
          }),
        },
      })
    )
    const res = await caller.generateSingleQr({ id: SO_ID })
    expect(res?.content).toMatch(/^TERP:SO:/)
  })
})
