import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the repository before importing the service
vi.mock("../daily-account-values-repository", () => ({
  summarizeByEmployee: vi.fn(),
  findMany: vi.fn(),
}))

import * as repo from "../daily-account-values-repository"
import { summaryByEmployee } from "../daily-account-values-service"

const mockedRepo = vi.mocked(repo)

const TENANT_ID = "t-00000000-0000-0000-0000-000000000001"
const ACCOUNT_ID = "acc-0000-0000-0000-0000-000000000001"
const EMP_A_ID = "e-00000000-0000-0000-0000-000000000001"
const EMP_B_ID = "e-00000000-0000-0000-0000-000000000002"

function makeFakePrisma() {
  return {
    employee: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as Parameters<typeof summaryByEmployee>[0]
}

let fakePrisma: ReturnType<typeof makeFakePrisma>

beforeEach(() => {
  vi.clearAllMocks()
  fakePrisma = makeFakePrisma()
})

describe("summaryByEmployee", () => {
  it("returns sorted employees with totals", async () => {
    mockedRepo.summarizeByEmployee.mockResolvedValue([
      { employeeId: EMP_A_ID, _sum: { valueMinutes: 480 } },
      { employeeId: EMP_B_ID, _sum: { valueMinutes: 360 } },
    ] as never)

    ;(fakePrisma as unknown as { employee: { findMany: ReturnType<typeof vi.fn> } }).employee.findMany.mockResolvedValue([
      { id: EMP_A_ID, personnelNumber: "1001", firstName: "Zara", lastName: "Müller", department: { id: "d1", name: "Entwicklung" }, location: { id: "l1", name: "München" } },
      { id: EMP_B_ID, personnelNumber: "1002", firstName: "Anna", lastName: "Beck", department: { id: "d2", name: "Vertrieb" }, location: null },
    ])

    const result = await summaryByEmployee(
      fakePrisma, TENANT_ID, { accountId: ACCOUNT_ID, year: 2026, month: 3 }
    )

    expect(result.items).toHaveLength(2)
    // Sorted by lastName: Beck before Müller
    expect(result.items[0]!.lastName).toBe("Beck")
    expect(result.items[0]!.totalMinutes).toBe(360)
    expect(result.items[0]!.departmentName).toBe("Vertrieb")
    expect(result.items[0]!.locationName).toBe("")
    expect(result.items[1]!.lastName).toBe("Müller")
    expect(result.items[1]!.totalMinutes).toBe(480)
    expect(result.items[1]!.departmentName).toBe("Entwicklung")
    expect(result.items[1]!.locationName).toBe("München")
    expect(result.totalMinutes).toBe(840)
  })

  it("returns empty result when no postings exist", async () => {
    mockedRepo.summarizeByEmployee.mockResolvedValue([] as never)

    const result = await summaryByEmployee(
      fakePrisma, TENANT_ID, { accountId: ACCOUNT_ID, year: 2026, month: 1 }
    )

    expect(result.items).toEqual([])
    expect(result.totalMinutes).toBe(0)
  })

  it("aggregates correctly (groupBy already sums per employee)", async () => {
    mockedRepo.summarizeByEmployee.mockResolvedValue([
      { employeeId: EMP_A_ID, _sum: { valueMinutes: 1200 } },
    ] as never)

    ;(fakePrisma as unknown as { employee: { findMany: ReturnType<typeof vi.fn> } }).employee.findMany.mockResolvedValue([
      { id: EMP_A_ID, personnelNumber: "1001", firstName: "Max", lastName: "Test", department: null, location: null },
    ])

    const result = await summaryByEmployee(
      fakePrisma, TENANT_ID, { accountId: ACCOUNT_ID, year: 2026, month: 2 }
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.totalMinutes).toBe(1200)
    expect(result.totalMinutes).toBe(1200)
  })

  it("passes scopeWhere to repository", async () => {
    mockedRepo.summarizeByEmployee.mockResolvedValue([] as never)

    const scopeWhere = { employeeId: { in: [EMP_A_ID] } }
    await summaryByEmployee(
      fakePrisma, TENANT_ID, { accountId: ACCOUNT_ID, year: 2026, month: 3 }, scopeWhere
    )

    expect(mockedRepo.summarizeByEmployee).toHaveBeenCalledWith(
      fakePrisma,
      TENANT_ID,
      { accountId: ACCOUNT_ID, year: 2026, month: 3 },
      scopeWhere
    )
  })
})
