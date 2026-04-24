import { describe, it, expect } from "vitest"
import { permissionIdByKey } from "../permission-catalog"

/**
 * Snapshot-style guard for permissions whose UUID is derived
 * deterministically (UUIDv5) from their string key. Renaming a key
 * silently invalidates every role grant in the database, so we lock
 * the keys here and fail loudly if anyone changes them.
 */
describe("permission-catalog: dunning permission UUIDs are stable", () => {
  it("dunning.view", () => {
    expect(permissionIdByKey("dunning.view")).toBe(
      "d58022ca-8611-5863-be1d-ae8cc2c4f291"
    )
  })

  it("dunning.create", () => {
    expect(permissionIdByKey("dunning.create")).toBe(
      "b7acce26-f3d9-5c2f-8776-91e4464a58f9"
    )
  })

  it("dunning.send", () => {
    expect(permissionIdByKey("dunning.send")).toBe(
      "f0563b5d-7c9f-5f72-a4cf-b8aa399510d9"
    )
  })

  it("dunning.cancel", () => {
    expect(permissionIdByKey("dunning.cancel")).toBe(
      "d25a0e8d-2a63-5e0e-9e37-42ba913ae75f"
    )
  })

  it("dunning.settings", () => {
    expect(permissionIdByKey("dunning.settings")).toBe(
      "dc07a6cd-f505-58f8-a63d-5f176b558dac"
    )
  })
})

/**
 * WorkReport permissions — Plan 2026-04-22-workreport-arbeitsschein-m1.md
 *
 * These UUIDs are hard-coded into the SQL migration that grants the
 * permissions to the default system user groups. If the key strings
 * here or in permission-catalog.ts change, the grants become orphans
 * and UI access breaks silently across tenants.
 */
describe("permission-catalog: work_reports permission UUIDs are stable", () => {
  it("work_reports.view", () => {
    expect(permissionIdByKey("work_reports.view")).toBe(
      "3900e091-b05b-588c-a33c-b0dbbcc9390e"
    )
  })

  it("work_reports.manage", () => {
    expect(permissionIdByKey("work_reports.manage")).toBe(
      "765828bb-fc82-54bc-bccd-090a9b1ceee7"
    )
  })

  it("work_reports.sign", () => {
    expect(permissionIdByKey("work_reports.sign")).toBe(
      "8adc32f0-34d6-511c-98ea-047b33b4fe0e"
    )
  })

  it("work_reports.void", () => {
    expect(permissionIdByKey("work_reports.void")).toBe(
      "5b0caa91-6571-5b04-a5bb-ecd382f042b3"
    )
  })

  it("all four work_reports keys yield distinct UUIDs", () => {
    const ids = [
      permissionIdByKey("work_reports.view"),
      permissionIdByKey("work_reports.manage"),
      permissionIdByKey("work_reports.sign"),
      permissionIdByKey("work_reports.void"),
    ]
    expect(new Set(ids).size).toBe(4)
    expect(ids.every(Boolean)).toBe(true)
  })

  it("all four work_reports keys yield UUIDv5-shaped strings (36 chars, version 5 in position 14)", () => {
    const ids = [
      permissionIdByKey("work_reports.view")!,
      permissionIdByKey("work_reports.manage")!,
      permissionIdByKey("work_reports.sign")!,
      permissionIdByKey("work_reports.void")!,
    ]
    for (const id of ids) {
      expect(id).toHaveLength(36)
      // Position 14 (0-indexed) is the version nibble in UUID canonical form.
      expect(id.charAt(14)).toBe("5")
    }
  })
})
