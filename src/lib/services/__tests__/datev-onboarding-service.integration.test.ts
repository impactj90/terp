/**
 * Integration tests for datev-onboarding-service.
 * Verifies:
 *  - All status flags start as false for a fresh tenant
 *  - Flags flip to true once the underlying data is populated
 *  - Incomplete-employees list flags missing mandatory fields
 *  - generateSteuerberaterPdf returns a non-empty PDF buffer
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../datev-onboarding-service"

const TENANT_ID = "f0000000-0000-4000-a000-000000000707"
const TENANT_SLUG = "datev-onboarding-integration"
const EMP_COMPLETE = "f0000000-0000-4000-a000-000000000708"
const EMP_INCOMPLETE = "f0000000-0000-4000-a000-000000000709"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "DATEV Onboarding Integration",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
  await prisma.employee.deleteMany({
    where: { id: { in: [EMP_COMPLETE, EMP_INCOMPLETE] } },
  })
  await prisma.exportInterface.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.exportTemplate.deleteMany({ where: { tenantId: TENANT_ID } })
})

afterAll(async () => {
  await prisma.employee.deleteMany({
    where: { id: { in: [EMP_COMPLETE, EMP_INCOMPLETE] } },
  })
  await prisma.exportInterface.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.exportTemplate.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

describe("datev-onboarding-service.getStatus", () => {
  it("returns all-false flags for an empty tenant", async () => {
    const status = await service.getStatus(prisma, TENANT_ID)
    expect(status.beraterNrSet).toBe(false)
    expect(status.mandantNumberSet).toBe(false)
    expect(status.hasActiveTemplate).toBe(false)
    expect(status.hasDefaultTemplate).toBe(false)
  })

  it("flips beraterNrSet and mandantNumberSet when an interface is populated", async () => {
    await prisma.exportInterface.create({
      data: {
        tenantId: TENANT_ID,
        interfaceNumber: 1,
        name: "Test DATEV",
        beraterNr: "12345",
        mandantNumber: "67890",
        isActive: true,
      },
    })
    const status = await service.getStatus(prisma, TENANT_ID)
    expect(status.beraterNrSet).toBe(true)
    expect(status.mandantNumberSet).toBe(true)
  })

  it("flips hasActiveTemplate when a template is added", async () => {
    await prisma.exportTemplate.create({
      data: {
        tenantId: TENANT_ID,
        name: "Onboarding Test Template",
        targetSystem: "datev_lodas",
        templateBody: "{{ exportInterface.beraterNr }}",
        outputFilename: "test.txt",
      },
    })
    const status = await service.getStatus(prisma, TENANT_ID)
    expect(status.hasActiveTemplate).toBe(true)
  })

  it("detects incomplete employees and reports their missing fields", async () => {
    await prisma.employee.create({
      data: {
        id: EMP_INCOMPLETE,
        tenantId: TENANT_ID,
        personnelNumber: "ONB-INC",
        pin: "pin-onb-inc",
        firstName: "Missing",
        lastName: "Fields",
        entryDate: new Date("2024-01-01"),
        isActive: true,
      },
    })
    const status = await service.getStatus(prisma, TENANT_ID)
    expect(status.totalEmployees).toBeGreaterThanOrEqual(1)
    expect(status.incompleteEmployees.length).toBeGreaterThanOrEqual(1)
    const inc = status.incompleteEmployees.find(
      (e) => e.id === EMP_INCOMPLETE,
    )
    expect(inc).toBeDefined()
    expect(inc!.missingFields).toEqual(
      expect.arrayContaining(["Steuer-ID", "SV-Nr.", "IBAN"]),
    )
  })
})

describe("datev-onboarding-service.generateSteuerberaterPdf", () => {
  it("returns a PDF buffer with a sensible filename", async () => {
    const result = await service.generateSteuerberaterPdf(prisma, TENANT_ID)
    expect(result.filename).toMatch(/DATEV_Import_Anleitung_/)
    expect(result.filename.endsWith(".pdf")).toBe(true)
    expect(result.buffer.length).toBeGreaterThan(1000)
    // PDF magic bytes
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF")
  })
})
