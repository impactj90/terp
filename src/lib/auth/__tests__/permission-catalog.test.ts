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
