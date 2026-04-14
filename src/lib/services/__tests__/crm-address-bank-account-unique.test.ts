/**
 * Integration test for CAMT-Preflight Phase 1: unique (tenant_id, iban)
 * constraint on crm_bank_accounts.
 *
 * Runs against the shared dev DB and cleans up after itself.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../crm-address-service"
import { CrmBankAccountDuplicateIbanError } from "../crm-address-service"

const TENANT_A_ID = "f0000000-0000-4000-a000-000000000601"
const TENANT_B_ID = "f0000000-0000-4000-a000-000000000602"
const ADDRESS_A1_ID = "f0000000-0000-4000-a000-000000000611"
const ADDRESS_A2_ID = "f0000000-0000-4000-a000-000000000612"
const ADDRESS_B1_ID = "f0000000-0000-4000-a000-000000000613"

const IBAN_A = "DE89370400440532013000"
const IBAN_B = "DE02500105170137075030"

async function cleanup() {
  await prisma.crmBankAccount
    .deleteMany({ where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } } })
    .catch(() => {})
  await prisma.crmAddress
    .deleteMany({ where: { tenantId: { in: [TENANT_A_ID, TENANT_B_ID] } } })
    .catch(() => {})
  await prisma.tenant
    .deleteMany({ where: { id: { in: [TENANT_A_ID, TENANT_B_ID] } } })
    .catch(() => {})
}

beforeAll(async () => {
  await cleanup()

  await prisma.tenant.create({
    data: { id: TENANT_A_ID, name: "IBAN Unique Test A", slug: "iban-unique-test-a", isActive: true },
  })
  await prisma.tenant.create({
    data: { id: TENANT_B_ID, name: "IBAN Unique Test B", slug: "iban-unique-test-b", isActive: true },
  })

  await prisma.crmAddress.create({
    data: {
      id: ADDRESS_A1_ID,
      tenantId: TENANT_A_ID,
      number: "K-IBAN-1",
      type: "CUSTOMER",
      company: "IBAN Test Kunde A1",
    },
  })
  await prisma.crmAddress.create({
    data: {
      id: ADDRESS_A2_ID,
      tenantId: TENANT_A_ID,
      number: "K-IBAN-2",
      type: "CUSTOMER",
      company: "IBAN Test Kunde A2",
    },
  })
  await prisma.crmAddress.create({
    data: {
      id: ADDRESS_B1_ID,
      tenantId: TENANT_B_ID,
      number: "K-IBAN-1",
      type: "CUSTOMER",
      company: "IBAN Test Kunde B1",
    },
  })
})

afterAll(async () => {
  await cleanup()
})

describe("CrmBankAccount unique (tenant_id, iban)", () => {
  it("rejects a duplicate IBAN on a different address within the same tenant", async () => {
    await service.createBankAccount(prisma, TENANT_A_ID, {
      addressId: ADDRESS_A1_ID,
      iban: IBAN_A,
    })

    await expect(
      service.createBankAccount(prisma, TENANT_A_ID, {
        addressId: ADDRESS_A2_ID,
        iban: IBAN_A,
      }),
    ).rejects.toBeInstanceOf(CrmBankAccountDuplicateIbanError)
  })

  it("rejects a duplicate IBAN on the same address", async () => {
    await expect(
      service.createBankAccount(prisma, TENANT_A_ID, {
        addressId: ADDRESS_A1_ID,
        iban: IBAN_A,
      }),
    ).rejects.toBeInstanceOf(CrmBankAccountDuplicateIbanError)
  })

  it("normalizes IBAN (whitespace + lowercase) before the uniqueness check", async () => {
    await expect(
      service.createBankAccount(prisma, TENANT_A_ID, {
        addressId: ADDRESS_A2_ID,
        iban: "de8937 0400 4405 3201 3000",
      }),
    ).rejects.toBeInstanceOf(CrmBankAccountDuplicateIbanError)
  })

  it("allows the same IBAN in a different tenant", async () => {
    const created = await service.createBankAccount(prisma, TENANT_B_ID, {
      addressId: ADDRESS_B1_ID,
      iban: IBAN_A,
    })
    expect(created.iban).toBe(IBAN_A)
  })

  it("update rejects conflicting IBAN", async () => {
    const second = await service.createBankAccount(prisma, TENANT_A_ID, {
      addressId: ADDRESS_A2_ID,
      iban: IBAN_B,
    })

    await expect(
      service.updateBankAccount(prisma, TENANT_A_ID, {
        id: second.id,
        iban: IBAN_A,
      }),
    ).rejects.toBeInstanceOf(CrmBankAccountDuplicateIbanError)
  })
})
