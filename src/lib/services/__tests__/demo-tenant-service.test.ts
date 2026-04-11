/**
 * Unit tests for demo-tenant-service error paths.
 *
 * The happy-path tests live in the integration-test file alongside real DB
 * assertions. This file covers only the branches that can be tested with a
 * mocked Prisma client — mostly validation and authorization errors.
 *
 * Phase 2 migration (2026-04-11): `createDemo` now takes
 * `(prisma, input, platformUserId, audit)` and the other four admin actions
 * drop their AuditContext parameter entirely. `requestConvertFromExpired`
 * still takes an AuditContext because it is a tenant-side self-service action.
 */
import { describe, expect, test, vi } from "vitest"

import type { PrismaClient } from "@/generated/prisma/client"
import * as demoService from "../demo-tenant-service"
import {
  DemoTenantForbiddenError,
  DemoTenantNotFoundError,
  DemoTenantValidationError,
} from "../demo-tenant-service"

const PLATFORM_USER_ID = "p-1"
const PLATFORM_AUDIT = { ipAddress: null, userAgent: null }

const SELF_SERVICE_AUDIT = {
  userId: "u-1",
  ipAddress: null,
  userAgent: null,
}

function makeFakePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return overrides as unknown as PrismaClient
}

describe("demo-tenant-service validation", () => {
  test("createDemo throws ValidationError for demoDurationDays=0", async () => {
    const prisma = makeFakePrisma()
    await expect(
      demoService.createDemo(
        prisma,
        {
          tenantName: "X",
          tenantSlug: "x-slug",
          addressStreet: "Street 1",
          addressZip: "12345",
          addressCity: "City",
          addressCountry: "DE",
          adminEmail: "admin@example.com",
          adminDisplayName: "Admin",
          demoDurationDays: 0,
        },
        PLATFORM_USER_ID,
        PLATFORM_AUDIT,
      ),
    ).rejects.toBeInstanceOf(DemoTenantValidationError)
  })

  test("createDemo throws ValidationError for demoDurationDays=91", async () => {
    const prisma = makeFakePrisma()
    await expect(
      demoService.createDemo(
        prisma,
        {
          tenantName: "X",
          tenantSlug: "x-slug",
          addressStreet: "Street 1",
          addressZip: "12345",
          addressCity: "City",
          addressCountry: "DE",
          adminEmail: "admin@example.com",
          adminDisplayName: "Admin",
          demoDurationDays: 91,
        },
        PLATFORM_USER_ID,
        PLATFORM_AUDIT,
      ),
    ).rejects.toBeInstanceOf(DemoTenantValidationError)
  })

  test("createDemo throws when template key is unknown", async () => {
    const prisma = makeFakePrisma()
    await expect(
      demoService.createDemo(
        prisma,
        {
          tenantName: "X",
          tenantSlug: "x-slug",
          addressStreet: "Street 1",
          addressZip: "12345",
          addressCity: "City",
          addressCountry: "DE",
          adminEmail: "admin@example.com",
          adminDisplayName: "Admin",
          demoTemplate: "does-not-exist",
        },
        PLATFORM_USER_ID,
        PLATFORM_AUDIT,
      ),
    ).rejects.toThrow(/Unknown demo template/)
  })
})

describe("demo-tenant-service not-found paths", () => {
  test("extendDemo throws NotFoundError when tenant does not exist", async () => {
    const prisma = makeFakePrisma({
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    })
    await expect(
      demoService.extendDemo(prisma, "t-missing", 7),
    ).rejects.toBeInstanceOf(DemoTenantNotFoundError)
  })

  test("extendDemo throws NotFoundError when tenant is not a demo", async () => {
    const prisma = makeFakePrisma({
      tenant: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "t-1", isDemo: false, isActive: true }),
      },
    })
    await expect(
      demoService.extendDemo(prisma, "t-1", 7),
    ).rejects.toBeInstanceOf(DemoTenantNotFoundError)
  })

  test("convertDemo throws NotFoundError for non-demo tenant", async () => {
    const prisma = makeFakePrisma({
      tenant: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "t-1", isDemo: false }),
      },
    })
    await expect(
      demoService.convertDemo(prisma, "t-1", { discardData: false }),
    ).rejects.toBeInstanceOf(DemoTenantNotFoundError)
  })

  test("expireDemoNow throws NotFoundError for missing tenant", async () => {
    const prisma = makeFakePrisma({
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    })
    await expect(
      demoService.expireDemoNow(prisma, "t-missing"),
    ).rejects.toBeInstanceOf(DemoTenantNotFoundError)
  })

  test("deleteDemo throws NotFoundError for missing tenant", async () => {
    const prisma = makeFakePrisma({
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
    })
    await expect(
      demoService.deleteDemo(prisma, "t-missing"),
    ).rejects.toBeInstanceOf(DemoTenantNotFoundError)
  })
})

describe("demo-tenant-service forbidden paths", () => {
  test("deleteDemo throws ForbiddenError when demo is still active", async () => {
    const prisma = makeFakePrisma({
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "t-1",
          name: "Active Demo",
          isDemo: true,
          isActive: true,
          demoTemplate: "industriedienstleister_150",
          createdAt: new Date(),
          demoExpiresAt: new Date(Date.now() + 1000),
        }),
      },
    })
    await expect(
      demoService.deleteDemo(prisma, "t-1"),
    ).rejects.toBeInstanceOf(DemoTenantForbiddenError)
  })

  test("requestConvertFromExpired throws ForbiddenError when user lacks membership", async () => {
    const prisma = makeFakePrisma({
      userTenant: { findUnique: vi.fn().mockResolvedValue(null) },
      tenant: { findUnique: vi.fn() },
    })
    await expect(
      demoService.requestConvertFromExpired(
        prisma,
        "u-1",
        "t-1",
        SELF_SERVICE_AUDIT,
      ),
    ).rejects.toBeInstanceOf(DemoTenantForbiddenError)
  })

  test("requestConvertFromExpired throws ForbiddenError when demo is still in window", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const prisma = makeFakePrisma({
      userTenant: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ userId: "u-1", tenantId: "t-1", role: "member" }),
      },
      tenant: {
        findUnique: vi.fn().mockResolvedValue({
          id: "t-1",
          name: "Active Demo",
          isDemo: true,
          demoExpiresAt: future,
          demoTemplate: "industriedienstleister_150",
        }),
      },
    })
    await expect(
      demoService.requestConvertFromExpired(
        prisma,
        "u-1",
        "t-1",
        SELF_SERVICE_AUDIT,
      ),
    ).rejects.toBeInstanceOf(DemoTenantForbiddenError)
  })
})
