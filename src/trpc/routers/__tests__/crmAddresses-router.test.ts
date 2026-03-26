import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { crmAddressesRouter } from "../crm/addresses"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// Mock the db module used by requireModule middleware
vi.mock("@/lib/db", () => ({
  prisma: {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
    },
  },
}))

// --- Constants ---
const CRM_VIEW = permissionIdByKey("crm_addresses.view")!
const CRM_CREATE = permissionIdByKey("crm_addresses.create")!
const CRM_EDIT = permissionIdByKey("crm_addresses.edit")!
const CRM_DELETE = permissionIdByKey("crm_addresses.delete")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "c0000000-0000-4000-a000-000000000001"
const BANK_ACCOUNT_ID = "d0000000-0000-4000-b000-000000000001"

const createCaller = createCallerFactory(crmAddressesRouter)

// --- Helpers ---

// requireModule("crm") calls prisma.tenantModule.findUnique from context
const MODULE_MOCK = {
  tenantModule: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: "mock", module: "crm" }),
  },
}

function withModuleMock(prisma: Record<string, unknown>) {
  return { ...MODULE_MOCK, ...prisma }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [CRM_VIEW, CRM_CREATE, CRM_EDIT, CRM_DELETE]
) {
  return createMockContext({
    prisma: withModuleMock(prisma) as unknown as ReturnType<typeof createMockContext>["prisma"],
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

const mockAddress = {
  id: ADDRESS_ID,
  tenantId: TENANT_ID,
  number: "K-1",
  type: "CUSTOMER",
  company: "Test GmbH",
  street: "Teststr. 1",
  zip: "12345",
  city: "Berlin",
  country: "DE",
  phone: "+49123456",
  fax: null,
  email: "test@test.de",
  website: null,
  taxNumber: null,
  vatId: null,
  matchCode: "TEST GMBH",
  notes: null,
  paymentTermDays: 30,
  discountPercent: null,
  discountDays: null,
  discountGroup: null,
  ourCustomerNumber: null,
  salesPriceListId: null,
  purchasePriceListId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  contacts: [],
  bankAccounts: [],
}

// --- crm.addresses.list tests ---

describe("crm.addresses.list", () => {
  it("returns paginated addresses", async () => {
    const prisma = {
      crmAddress: {
        findMany: vi.fn().mockResolvedValue([mockAddress]),
        count: vi.fn().mockResolvedValue(1),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.list({ page: 1, pageSize: 10 })

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0]!.company).toBe("Test GmbH")
  })

  it("rejects without crm_addresses.view permission", async () => {
    const prisma = {
      crmAddress: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }

    const caller = createCaller(createNoPermContext(prisma))

    await expect(
      caller.list({ page: 1, pageSize: 10 })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.addresses.create tests ---

describe("crm.addresses.create", () => {
  it("creates address with auto-generated number", async () => {
    const prisma = {
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({
          prefix: "K-",
          nextValue: 2,
        }),
      },
      crmAddress: {
        create: vi.fn().mockResolvedValue({
          ...mockAddress,
          number: "K-1",
        }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      company: "Test GmbH",
      type: "CUSTOMER",
    })

    expect(result.number).toBe("K-1")
    expect(prisma.numberSequence.upsert).toHaveBeenCalled()
  })

  it("creates supplier address with ourCustomerNumber", async () => {
    const prisma = {
      numberSequence: {
        upsert: vi.fn().mockResolvedValue({
          prefix: "L-",
          nextValue: 2,
        }),
      },
      crmAddress: {
        create: vi.fn().mockResolvedValue({
          ...mockAddress,
          type: "SUPPLIER",
          number: "L-1",
          ourCustomerNumber: "KD-99887",
        }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.create({
      company: "Test GmbH",
      type: "SUPPLIER",
      ourCustomerNumber: "KD-99887",
    })

    expect(result.ourCustomerNumber).toBe("KD-99887")
    expect(prisma.crmAddress.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ourCustomerNumber: "KD-99887",
      }),
    })
  })

  it("rejects without crm_addresses.create permission", async () => {
    const prisma = { crmAddress: {}, numberSequence: {} }
    const caller = createCaller(createTestContext(prisma, [CRM_VIEW]))

    await expect(
      caller.create({ company: "Test" })
    ).rejects.toThrow("Insufficient permissions")
  })
})

// --- crm.addresses.update tests ---

describe("crm.addresses.update", () => {
  it("saves ourCustomerNumber", async () => {
    const updatedAddress = {
      ...mockAddress,
      type: "SUPPLIER",
      ourCustomerNumber: "KD-12345",
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ ...mockAddress, type: "SUPPLIER" })
          .mockResolvedValueOnce(updatedAddress),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({
      id: ADDRESS_ID,
      ourCustomerNumber: "KD-12345",
    })

    expect(result.ourCustomerNumber).toBe("KD-12345")
    expect(prisma.crmAddress.updateMany).toHaveBeenCalledWith({
      where: { id: ADDRESS_ID, tenantId: TENANT_ID },
      data: expect.objectContaining({
        ourCustomerNumber: "KD-12345",
      }),
    })
  })

  it("clears ourCustomerNumber when set to null", async () => {
    const supplierWithNumber = {
      ...mockAddress,
      type: "SUPPLIER",
      ourCustomerNumber: "KD-12345",
    }
    const clearedAddress = {
      ...mockAddress,
      type: "SUPPLIER",
      ourCustomerNumber: null,
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(supplierWithNumber)
          .mockResolvedValueOnce(clearedAddress),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.update({
      id: ADDRESS_ID,
      ourCustomerNumber: null,
    })

    expect(result.ourCustomerNumber).toBeNull()
  })
})

// --- crm.addresses.getById tests ---

describe("crm.addresses.getById", () => {
  it("returns address with contacts and bank accounts", async () => {
    const addressWithRelations = {
      ...mockAddress,
      contacts: [
        { id: CONTACT_ID, firstName: "Max", lastName: "Mustermann", isPrimary: true },
      ],
      bankAccounts: [
        { id: BANK_ACCOUNT_ID, iban: "DE89370400440532013000", isDefault: true },
      ],
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(addressWithRelations),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: ADDRESS_ID })

    expect(result.contacts).toHaveLength(1)
    expect(result.bankAccounts).toHaveLength(1)
  })

  it("returns ourCustomerNumber for supplier address", async () => {
    const supplierAddress = {
      ...mockAddress,
      type: "SUPPLIER",
      ourCustomerNumber: "KD-99887",
      contacts: [],
      bankAccounts: [],
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(supplierAddress),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.getById({ id: ADDRESS_ID })

    expect(result.ourCustomerNumber).toBe("KD-99887")
  })

  it("throws not found for wrong tenant", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }

    const caller = createCaller(createTestContext(prisma))

    await expect(
      caller.getById({ id: ADDRESS_ID })
    ).rejects.toThrow("CRM address not found")
  })
})

// --- crm.addresses.delete tests ---

describe("crm.addresses.delete", () => {
  it("soft-deletes address (sets isActive=false)", async () => {
    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(mockAddress)
          .mockResolvedValueOnce({ ...mockAddress, isActive: false }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.delete({ id: ADDRESS_ID })

    expect(result.success).toBe(true)
    expect(prisma.crmAddress.updateMany).toHaveBeenCalledWith({
      where: { id: ADDRESS_ID, tenantId: TENANT_ID },
      data: { isActive: false },
    })
  })
})

// --- crm.addresses.restore tests ---

describe("crm.addresses.restore", () => {
  it("restores soft-deleted address", async () => {
    const inactiveAddress = { ...mockAddress, isActive: false }
    const prisma = {
      crmAddress: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(inactiveAddress)
          .mockResolvedValueOnce({ ...mockAddress, isActive: true }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.restore({ id: ADDRESS_ID })

    expect(result.isActive).toBe(true)
  })
})

// --- crm.addresses.contactsCreate tests ---

describe("crm.addresses.contactsCreate", () => {
  it("creates contact for existing address", async () => {
    const newContact = {
      id: CONTACT_ID,
      tenantId: TENANT_ID,
      addressId: ADDRESS_ID,
      firstName: "Max",
      lastName: "Mustermann",
      position: null,
      department: null,
      phone: null,
      email: null,
      notes: null,
      isPrimary: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
      crmContact: {
        create: vi.fn().mockResolvedValue(newContact),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.contactsCreate({
      addressId: ADDRESS_ID,
      firstName: "Max",
      lastName: "Mustermann",
    })

    expect(result.firstName).toBe("Max")
    expect(result.lastName).toBe("Mustermann")
  })
})

// --- crm.addresses.contactsCreate — salutation fields tests ---

describe("crm.addresses.contactsCreate — salutation fields", () => {
  it("creates contact with salutation, title, and auto-generated letterSalutation", async () => {
    const newContact = {
      id: CONTACT_ID,
      tenantId: TENANT_ID,
      addressId: ADDRESS_ID,
      firstName: "Max",
      lastName: "Müller",
      salutation: "Herr",
      title: "Dr.",
      letterSalutation: "Sehr geehrter Herr Dr. Müller",
      position: null,
      department: null,
      phone: null,
      email: null,
      notes: null,
      isPrimary: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
      crmContact: {
        create: vi.fn().mockResolvedValue(newContact),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.contactsCreate({
      addressId: ADDRESS_ID,
      firstName: "Max",
      lastName: "Müller",
      salutation: "Herr",
      title: "Dr.",
    })

    // Verify the create call was made with auto-generated letterSalutation
    expect(prisma.crmContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salutation: "Herr",
        title: "Dr.",
        letterSalutation: "Sehr geehrter Herr Dr. Müller",
      }),
    })
    expect(result.letterSalutation).toBe("Sehr geehrter Herr Dr. Müller")
  })

  it("preserves manually provided letterSalutation", async () => {
    const newContact = {
      id: CONTACT_ID,
      tenantId: TENANT_ID,
      addressId: ADDRESS_ID,
      firstName: "Hans",
      lastName: "Schmidt",
      salutation: "Herr",
      title: null,
      letterSalutation: "Lieber Hans",
      position: null,
      department: null,
      phone: null,
      email: null,
      notes: null,
      isPrimary: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
      crmContact: {
        create: vi.fn().mockResolvedValue(newContact),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    await caller.contactsCreate({
      addressId: ADDRESS_ID,
      firstName: "Hans",
      lastName: "Schmidt",
      salutation: "Herr",
      letterSalutation: "Lieber Hans",
    })

    expect(prisma.crmContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        letterSalutation: "Lieber Hans",
      }),
    })
  })
})

// --- crm.addresses.bankAccountsCreate tests ---

describe("crm.addresses.bankAccountsCreate", () => {
  it("creates bank account for existing address", async () => {
    const newBankAccount = {
      id: BANK_ACCOUNT_ID,
      tenantId: TENANT_ID,
      addressId: ADDRESS_ID,
      iban: "DE89370400440532013000",
      bic: null,
      bankName: null,
      accountHolder: null,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const prisma = {
      crmAddress: {
        findFirst: vi.fn().mockResolvedValue(mockAddress),
      },
      crmBankAccount: {
        create: vi.fn().mockResolvedValue(newBankAccount),
      },
    }

    const caller = createCaller(createTestContext(prisma))
    const result = await caller.bankAccountsCreate({
      addressId: ADDRESS_ID,
      iban: "DE89370400440532013000",
    })

    expect(result.iban).toBe("DE89370400440532013000")
  })
})
