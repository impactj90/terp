/**
 * Integration tests for Phase 4 features against the real DB.
 *
 * Covers:
 *   4.1 — restoreVersion archives current body and bumps the counter
 *   4.2 — record + verify snapshot lifecycle
 *   4.3 — copyToTenant deep-copies template metadata
 *   4.4 — schedule create/update/runDue with mocked sendMail
 *   4.5 — generateExport returns a ZIP for a multi-file template
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as templateService from "../export-template-service"
import * as snapshotService from "../export-template-snapshot-service"
import * as scheduleService from "../export-template-schedule-service"
import { generateExport } from "../export-engine-service"

const TENANT_A = "f0000000-0000-4000-a000-000000000901"
const TENANT_B = "f0000000-0000-4000-a000-000000000902"
const USER_ID = "a0000000-0000-4000-a000-000000000901"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_A },
    update: {},
    create: {
      id: TENANT_A,
      name: "Phase4 Tenant A",
      slug: "phase4-tenant-a",
      isActive: true,
    },
  })
  await prisma.tenant.upsert({
    where: { id: TENANT_B },
    update: {},
    create: {
      id: TENANT_B,
      name: "Phase4 Tenant B",
      slug: "phase4-tenant-b",
      isActive: true,
    },
  })
  await prisma.exportTemplateSchedule.deleteMany({
    where: { tenantId: { in: [TENANT_A, TENANT_B] } },
  })
  await prisma.exportTemplateSnapshot.deleteMany({
    where: { tenantId: { in: [TENANT_A, TENANT_B] } },
  })
  await prisma.exportTemplate.deleteMany({
    where: { tenantId: { in: [TENANT_A, TENANT_B] } },
  })
})

afterAll(async () => {
  await prisma.exportTemplateSchedule.deleteMany({
    where: { tenantId: { in: [TENANT_A, TENANT_B] } },
  })
  await prisma.exportTemplateSnapshot.deleteMany({
    where: { tenantId: { in: [TENANT_A, TENANT_B] } },
  })
  await prisma.exportTemplate.deleteMany({
    where: { tenantId: { in: [TENANT_A, TENANT_B] } },
  })
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } })
})

// ───────────────────────────────────────────────────────────────
// 4.1 — version restore
// ───────────────────────────────────────────────────────────────
describe("Phase 4.1 — restoreVersion", () => {
  it("restores a previous version body and bumps the counter", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 restore template",
      targetSystem: "custom",
      templateBody: "v1 body",
    })
    // Bump to v2
    await templateService.update(prisma, TENANT_A, tpl.id, {
      templateBody: "v2 body",
    })
    // Bump to v3
    await templateService.update(prisma, TENANT_A, tpl.id, {
      templateBody: "v3 body",
    })

    const restored = await templateService.restoreVersion(
      prisma,
      TENANT_A,
      tpl.id,
      1,
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(restored.templateBody).toBe("v1 body")
    expect(restored.version).toBe(4) // current was 3, restore archives & bumps

    // Version archive should now contain v1, v2, v3
    const versions = await prisma.exportTemplateVersion.findMany({
      where: { templateId: tpl.id },
      orderBy: { version: "asc" },
    })
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3])
  })

  it("rejects restoring the currently active version", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 restore current",
      targetSystem: "custom",
      templateBody: "only body",
    })
    await expect(
      templateService.restoreVersion(
        prisma,
        TENANT_A,
        tpl.id,
        tpl.version,
        { userId: USER_ID, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/Cannot restore the currently active version/)
  })
})

// ───────────────────────────────────────────────────────────────
// 4.2 — snapshot record + verify
// ───────────────────────────────────────────────────────────────
describe("Phase 4.2 — snapshot record + verify", () => {
  it("records a snapshot and verifies it as a match", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 snapshot template",
      targetSystem: "custom",
      templateBody: "header={{ exportInterface.mandantNumber }}\n",
      encoding: "utf-8",
      lineEnding: "lf",
    })

    const snapshot = await snapshotService.record(
      prisma,
      TENANT_A,
      {
        templateId: tpl.id,
        name: "April 2026",
        year: 2026,
        month: 4,
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(snapshot.expectedHash).toMatch(/^[a-f0-9]{64}$/)
    expect(snapshot.expectedByteSize).toBeGreaterThan(0)
    expect(snapshot.lastVerifiedStatus).toBe("match")

    const verifyResult = await snapshotService.verify(
      prisma,
      TENANT_A,
      snapshot.id,
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(verifyResult.status).toBe("match")
    expect(verifyResult.actualHash).toBe(snapshot.expectedHash)
  })

  it("flags a mismatch when the template body changes", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 snapshot drift template",
      targetSystem: "custom",
      templateBody: "before",
      encoding: "utf-8",
      lineEnding: "lf",
    })
    const snapshot = await snapshotService.record(
      prisma,
      TENANT_A,
      { templateId: tpl.id, name: "v1", year: 2026, month: 4 },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )

    // Mutate template
    await templateService.update(prisma, TENANT_A, tpl.id, {
      templateBody: "after",
    })

    const verifyResult = await snapshotService.verify(
      prisma,
      TENANT_A,
      snapshot.id,
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(verifyResult.status).toBe("mismatch")
    expect(verifyResult.expectedHash).not.toBe(verifyResult.actualHash)
    expect(verifyResult.diff.length).toBeGreaterThan(0)
  })

  it("re-recording overwrites the existing snapshot", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 snapshot upsert template",
      targetSystem: "custom",
      templateBody: "old",
      encoding: "utf-8",
      lineEnding: "lf",
    })
    const first = await snapshotService.record(
      prisma,
      TENANT_A,
      { templateId: tpl.id, name: "same", year: 2026, month: 4 },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    await templateService.update(prisma, TENANT_A, tpl.id, {
      templateBody: "new",
    })
    const second = await snapshotService.record(
      prisma,
      TENANT_A,
      { templateId: tpl.id, name: "same", year: 2026, month: 4 },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(second.id).toBe(first.id) // upsert, not insert
    expect(second.expectedHash).not.toBe(first.expectedHash)
  })
})

// ───────────────────────────────────────────────────────────────
// 4.3 — copyToTenant
// ───────────────────────────────────────────────────────────────
describe("Phase 4.3 — copyToTenant", () => {
  it("deep-copies a template into another tenant", async () => {
    const source = await templateService.create(prisma, TENANT_A, {
      name: "P4 share source",
      description: "shared template",
      targetSystem: "datev_lodas",
      templateBody: "{{ exportInterface.beraterNr }}",
      encoding: "windows-1252",
      lineEnding: "crlf",
    })

    const copy = await templateService.copyToTenant(
      prisma,
      TENANT_A,
      source.id,
      TENANT_B,
      { name: "Imported from A" },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )

    expect(copy.tenantId).toBe(TENANT_B)
    expect(copy.id).not.toBe(source.id)
    expect(copy.name).toBe("Imported from A")
    expect(copy.templateBody).toBe(source.templateBody)
    expect(copy.targetSystem).toBe("datev_lodas")
    expect(copy.encoding).toBe("windows-1252")
    expect(copy.version).toBe(1) // fresh history

    // Source remains unchanged
    const stillThere = await prisma.exportTemplate.findUnique({
      where: { id: source.id },
    })
    expect(stillThere).not.toBeNull()
  })

  it("rejects when the source name already exists in the target tenant", async () => {
    const source = await templateService.create(prisma, TENANT_A, {
      name: "P4 share dup",
      targetSystem: "custom",
      templateBody: "x",
    })
    // Pre-create a clashing name in target
    await templateService.create(prisma, TENANT_B, {
      name: "Clash",
      targetSystem: "custom",
      templateBody: "y",
    })
    await expect(
      templateService.copyToTenant(
        prisma,
        TENANT_A,
        source.id,
        TENANT_B,
        { name: "Clash" },
        { userId: USER_ID, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/already exists/)
  })
})

// ───────────────────────────────────────────────────────────────
// 4.4 — schedules create + runDue
// ───────────────────────────────────────────────────────────────
describe("Phase 4.4 — export schedules", () => {
  it("creates a schedule disabled by default and computes nextRunAt", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 schedule template",
      targetSystem: "custom",
      templateBody: "x={{ period.year }}-{{ period.monthPadded }}",
      encoding: "utf-8",
      lineEnding: "lf",
    })

    const sched = await scheduleService.create(
      prisma,
      TENANT_A,
      {
        templateId: tpl.id,
        name: "Monatsexport",
        frequency: "monthly",
        dayOfMonth: 5,
        hourOfDay: 8,
        recipientEmails: "steuer@example.com",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )

    expect(sched.isActive).toBe(false) // OFF by default per requirement
    expect(sched.nextRunAt).not.toBeNull()
    expect(sched.frequency).toBe("monthly")
    expect(sched.dayOfMonth).toBe(5)
  })

  it("rejects invalid recipient emails", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 schedule bad email",
      targetSystem: "custom",
      templateBody: "x",
    })
    await expect(
      scheduleService.create(
        prisma,
        TENANT_A,
        {
          templateId: tpl.id,
          name: "Bad email",
          frequency: "daily",
          hourOfDay: 8,
          recipientEmails: "not-an-email",
        },
        { userId: USER_ID, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/Invalid email/)
  })

  it("rejects monthly schedules without dayOfMonth", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 schedule no dom",
      targetSystem: "custom",
      templateBody: "x",
    })
    await expect(
      scheduleService.create(
        prisma,
        TENANT_A,
        {
          templateId: tpl.id,
          name: "Missing day",
          frequency: "monthly",
          hourOfDay: 8,
          recipientEmails: "a@b.de",
        },
        { userId: USER_ID, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/dayOfMonth/)
  })

  it("runDueSchedules picks active due schedules and updates lastRun", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 schedule run template",
      targetSystem: "custom",
      templateBody: "ok",
      encoding: "utf-8",
      lineEnding: "lf",
    })
    const sched = await scheduleService.create(
      prisma,
      TENANT_A,
      {
        templateId: tpl.id,
        name: "Due now",
        isActive: true,
        frequency: "daily",
        hourOfDay: 8,
        recipientEmails: "ops@example.com",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    // Force the schedule to be due immediately.
    await prisma.exportTemplateSchedule.update({
      where: { id: sched.id },
      data: { nextRunAt: new Date(Date.now() - 60_000) },
    })

    const calls: Array<{ tenantId: string; recipients: string[]; size: number }> =
      []
    const result = await scheduleService.runDueSchedules(
      prisma,
      new Date(),
      async ({ tenantId, recipients, attachment }) => {
        calls.push({
          tenantId,
          recipients,
          size: attachment.content.length,
        })
      },
    )

    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.succeeded).toBeGreaterThanOrEqual(1)
    expect(calls.length).toBeGreaterThanOrEqual(1)
    const ourCall = calls.find((c) => c.tenantId === TENANT_A)
    expect(ourCall).toBeDefined()
    expect(ourCall!.recipients).toContain("ops@example.com")
    expect(ourCall!.size).toBeGreaterThan(0)

    // The schedule should have been updated
    const refreshed = await prisma.exportTemplateSchedule.findUnique({
      where: { id: sched.id },
    })
    expect(refreshed!.lastRunStatus).toBe("success")
    expect(refreshed!.nextRunAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it("runDueSchedules records errors and continues", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 schedule error template",
      targetSystem: "custom",
      templateBody: "ok",
      encoding: "utf-8",
      lineEnding: "lf",
    })
    const sched = await scheduleService.create(
      prisma,
      TENANT_A,
      {
        templateId: tpl.id,
        name: "Will fail",
        isActive: true,
        frequency: "daily",
        hourOfDay: 8,
        recipientEmails: "ops@example.com",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    await prisma.exportTemplateSchedule.update({
      where: { id: sched.id },
      data: { nextRunAt: new Date(Date.now() - 60_000) },
    })

    const result = await scheduleService.runDueSchedules(
      prisma,
      new Date(),
      async () => {
        throw new Error("simulated SMTP failure")
      },
    )
    expect(result.failed).toBeGreaterThanOrEqual(1)
    const refreshed = await prisma.exportTemplateSchedule.findUnique({
      where: { id: sched.id },
    })
    expect(refreshed!.lastRunStatus).toBe("error")
    expect(refreshed!.lastRunMessage).toContain("simulated SMTP failure")
    expect(refreshed!.nextRunAt!.getTime()).toBeGreaterThan(Date.now())
  })
})

// ───────────────────────────────────────────────────────────────
// 4.5 — multi-file export
// ───────────────────────────────────────────────────────────────
describe("Phase 4.5 — multi-file export", () => {
  it("returns a ZIP file when the template uses {% file %} blocks", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 multifile template",
      targetSystem: "custom",
      templateBody: [
        `{% file "stamm.txt" %}STAMM={{ exportInterface.mandantNumber }}\n{% endfile %}`,
        `{% file "bewegung.txt" %}BEWEGUNG={{ period.year }}{{ period.monthPadded }}\n{% endfile %}`,
      ].join("\n"),
      encoding: "utf-8",
      lineEnding: "lf",
    })

    const result = await generateExport(
      prisma,
      TENANT_A,
      { templateId: tpl.id, year: 2026, month: 4 },
      { userId: USER_ID, ipAddress: null, userAgent: null },
      { isTest: true },
    )
    expect(result.filename).toMatch(/\.zip$/)
    expect(result.byteSize).toBeGreaterThan(0)
    // First 4 bytes are the local file header signature 0x04034b50 (PK\x03\x04)
    expect(result.file.readUInt32LE(0)).toBe(0x04034b50)
  })

  it("falls back to single-file mode for templates without {% file %}", async () => {
    const tpl = await templateService.create(prisma, TENANT_A, {
      name: "P4 singlefile template",
      targetSystem: "custom",
      templateBody: "single line",
      encoding: "utf-8",
      lineEnding: "lf",
    })
    const result = await generateExport(
      prisma,
      TENANT_A,
      { templateId: tpl.id, year: 2026, month: 4 },
      { userId: USER_ID, ipAddress: null, userAgent: null },
      { isTest: true },
    )
    expect(result.filename).not.toMatch(/\.zip$/)
    // Plain UTF-8 file — no zip signature
    expect(result.file.readUInt32LE(0)).not.toBe(0x04034b50)
    expect(result.file.toString("utf8")).toContain("single line")
  })
})
