/**
 * Integration tests for payroll-bulk-import-service against the real DB.
 * Verifies:
 *  - parseFile reports valid and invalid rows
 *  - confirmImport writes updates transactionally
 *  - IBAN / taxId are encrypted before storage
 *  - Import fails fast when any row is invalid (no partial write)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../payroll-bulk-import-service"
import { isEncrypted, decryptField } from "../field-encryption"

const TENANT_ID = "f0000000-0000-4000-a000-000000000704"
const TENANT_SLUG = "bulk-import-integration"
const USER_ID = "a0000000-0000-4000-a000-000000000704"
const EMP_A = "f0000000-0000-4000-a000-000000000705"
const EMP_B = "f0000000-0000-4000-a000-000000000706"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Bulk Import Integration",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
  await prisma.employee.deleteMany({
    where: { id: { in: [EMP_A, EMP_B] } },
  })
  await prisma.employee.createMany({
    data: [
      {
        id: EMP_A,
        tenantId: TENANT_ID,
        personnelNumber: "BI-A",
        pin: "pin-bi-a",
        firstName: "Ada",
        lastName: "Alpha",
        entryDate: new Date("2024-01-01"),
      },
      {
        id: EMP_B,
        tenantId: TENANT_ID,
        personnelNumber: "BI-B",
        pin: "pin-bi-b",
        firstName: "Bert",
        lastName: "Beta",
        entryDate: new Date("2024-01-01"),
      },
    ],
  })
})

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { id: { in: [EMP_A, EMP_B] } } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.employee.updateMany({
    where: { id: { in: [EMP_A, EMP_B] } },
    data: {
      iban: null,
      taxId: null,
      grossSalary: null,
    },
  })
})

function toB64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64")
}

const GOOD_CSV = [
  "personnelNumber;iban;grossSalary",
  "BI-A;DE89370400440532013000;3500,00",
  "BI-B;DE89370400440532013000;4100,50",
  "",
].join("\n")

const BAD_CSV = [
  "personnelNumber;iban",
  "BI-A;INVALID-IBAN",
  "",
].join("\n")

const UNKNOWN_PNR_CSV = [
  "personnelNumber;grossSalary",
  "DOES-NOT-EXIST;2000,00",
  "",
].join("\n")

describe("payroll-bulk-import-service.parseFile", () => {
  it("returns a preview with valid + matched rows", async () => {
    const result = await service.parseFile(
      prisma,
      TENANT_ID,
      toB64(GOOD_CSV),
      "good.csv",
    )
    expect(result.rowCount).toBe(2)
    expect(result.validCount).toBe(2)
    expect(result.invalidCount).toBe(0)
    expect(result.matchedEmployees).toBe(2)
    expect(result.hasErrors).toBe(false)
  })

  it("flags rows with invalid IBAN", async () => {
    const result = await service.parseFile(
      prisma,
      TENANT_ID,
      toB64(BAD_CSV),
      "bad.csv",
    )
    expect(result.invalidCount).toBe(1)
    expect(result.hasErrors).toBe(true)
    expect(result.rows[0]!.errors.some((e) => e.includes("IBAN"))).toBe(true)
  })

  it("flags rows where the personnelNumber does not exist", async () => {
    const result = await service.parseFile(
      prisma,
      TENANT_ID,
      toB64(UNKNOWN_PNR_CSV),
      "unknown.csv",
    )
    expect(result.invalidCount).toBe(1)
    expect(result.rows[0]!.errors.some((e) => e.includes("existiert"))).toBe(
      true,
    )
    expect(result.unmatchedPersonnelNumbers).toContain("DOES-NOT-EXIST")
  })
})

describe("payroll-bulk-import-service.confirmImport", () => {
  it("updates matched employees and encrypts sensitive fields", async () => {
    const result = await service.confirmImport(
      prisma,
      TENANT_ID,
      toB64(GOOD_CSV),
      "good.csv",
      undefined,
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(result.updated).toBe(2)
    expect(result.skipped).toBe(0)

    const empA = await prisma.employee.findUnique({ where: { id: EMP_A } })
    expect(empA!.iban).toBeTruthy()
    expect(isEncrypted(empA!.iban!)).toBe(true)
    expect(decryptField(empA!.iban!)).toBe("DE89370400440532013000")
    expect(Number(empA!.grossSalary)).toBe(3500)
  })

  it("refuses to import when any row is invalid", async () => {
    const mixed = [
      "personnelNumber;iban;grossSalary",
      "BI-A;DE89370400440532013000;2000,00",
      "BI-B;BROKEN;3000,00",
      "",
    ].join("\n")

    await expect(
      service.confirmImport(
        prisma,
        TENANT_ID,
        toB64(mixed),
        "mixed.csv",
        undefined,
      ),
    ).rejects.toThrow(/Validierungsfehler/)

    // Verify no partial writes happened
    const empA = await prisma.employee.findUnique({ where: { id: EMP_A } })
    expect(empA!.grossSalary).toBeNull()
  })
})
