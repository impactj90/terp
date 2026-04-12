/**
 * Integration tests for system-export-template-service.
 * Verifies:
 *  - The seeded standard templates are accessible.
 *  - copyToTenant materialises a system template into export_templates.
 *  - copyToTenant appends "(Kopie)" when a name collides.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../system-export-template-service"

const TENANT_ID = "f0000000-0000-4000-a000-000000000701"
const TENANT_SLUG = "system-tpl-integration"
const USER_ID = "a0000000-0000-4000-a000-000000000701"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "System Export Template Integration",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
  await prisma.exportTemplate.deleteMany({ where: { tenantId: TENANT_ID } })
})

afterAll(async () => {
  await prisma.exportTemplate.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

describe("system-export-template-service.list", () => {
  it("returns the seeded standard templates", async () => {
    const templates = await service.list(prisma)
    // Migration 20260418100000 seeds 6 templates.
    expect(templates.length).toBeGreaterThanOrEqual(6)
    const names = templates.map((t) => t.name)
    expect(names).toContain("DATEV LODAS — Bewegungsdaten")
    expect(names).toContain("Generische CSV — Standard")
  })

  it("returns them ordered by sortOrder", async () => {
    const templates = await service.list(prisma)
    const sortOrders = templates.map((t) => t.sortOrder)
    const sorted = [...sortOrders].sort((a, b) => a - b)
    expect(sortOrders).toEqual(sorted)
  })
})

describe("system-export-template-service.copyToTenant", () => {
  it("materialises a system template into the tenant's export_templates", async () => {
    const systems = await service.list(prisma)
    const source = systems.find(
      (s) => s.name === "DATEV LODAS — Bewegungsdaten",
    )
    expect(source).toBeDefined()

    const created = await service.copyToTenant(
      prisma,
      TENANT_ID,
      source!.id,
      {
        userId: USER_ID,
        ipAddress: null,
        userAgent: null,
      },
    )
    expect(created.id).toBeDefined()
    expect(created.tenantId).toBe(TENANT_ID)
    expect(created.targetSystem).toBe("datev_lodas")
    expect(created.templateBody).toBe(source!.templateBody)
    expect(created.version).toBe(1)
  })

  it("appends (Kopie) to the name when the same template is copied twice", async () => {
    const systems = await service.list(prisma)
    const source = systems.find(
      (s) => s.name === "Generische CSV — Standard",
    )
    expect(source).toBeDefined()

    const first = await service.copyToTenant(prisma, TENANT_ID, source!.id, {
      userId: USER_ID,
      ipAddress: null,
      userAgent: null,
    })
    expect(first.name).toBe("Generische CSV — Standard")

    const second = await service.copyToTenant(prisma, TENANT_ID, source!.id, {
      userId: USER_ID,
      ipAddress: null,
      userAgent: null,
    })
    expect(second.name).toMatch(/Kopie/)
    expect(second.name).not.toBe(first.name)
  })

  it("throws NotFoundError for unknown template id", async () => {
    await expect(
      service.copyToTenant(
        prisma,
        TENANT_ID,
        "00000000-0000-4000-a000-000000000000",
      ),
    ).rejects.toThrow()
  })
})
