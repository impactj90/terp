/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 8: Schichtplanung & Automatisierung
 *
 * Tests UC-051 through UC-055 against the real database.
 * Requires local Supabase running with seed data.
 *
 * @see docs/use-cases/08-automatisierung.md
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

/** Seed employee IDs from supabase/seed.sql */
const SEED_EMPLOYEE_ID = "00000000-0000-0000-0000-000000000011"

describe("Phase 8: Schichtplanung & Automatisierung", () => {
  let caller: Caller

  // Track created record IDs for cleanup
  const created = {
    shiftIds: [] as string[],
    macroIds: [] as string[],
    macroAssignmentIds: [] as string[],
    macroExecutionIds: [] as string[],
    scheduleIds: [] as string[],
    scheduleExecutionIds: [] as string[],
  }

  // Shared state for cross-test references
  const state: Record<string, string> = {}

  beforeAll(async () => {
    caller = await createAdminCaller()

    // Clean up leftover test data from previous runs
    await prisma.shift
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          code: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    await prisma.macro
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          name: { startsWith: "E2E" },
        },
      })
      .catch(() => {})

    await prisma.schedule
      .deleteMany({
        where: {
          tenantId: SEED.TENANT_ID,
          name: { startsWith: "E2E" },
        },
      })
      .catch(() => {})
  })

  afterAll(async () => {
    // Clean up schedule executions first (FK dependency)
    if (created.scheduleIds.length > 0) {
      await prisma.scheduleTaskExecution
        .deleteMany({
          where: {
            execution: {
              scheduleId: { in: created.scheduleIds },
            },
          },
        })
        .catch(() => {})
      await prisma.scheduleExecution
        .deleteMany({
          where: { scheduleId: { in: created.scheduleIds } },
        })
        .catch(() => {})
      await prisma.scheduleTask
        .deleteMany({
          where: { scheduleId: { in: created.scheduleIds } },
        })
        .catch(() => {})
      await prisma.schedule
        .deleteMany({
          where: { id: { in: created.scheduleIds } },
        })
        .catch(() => {})
    }

    // Clean up macro executions, assignments, then macros
    if (created.macroIds.length > 0) {
      await prisma.macroExecution
        .deleteMany({
          where: { macroId: { in: created.macroIds } },
        })
        .catch(() => {})
      await prisma.macroAssignment
        .deleteMany({
          where: { macroId: { in: created.macroIds } },
        })
        .catch(() => {})
      await prisma.macro
        .deleteMany({
          where: { id: { in: created.macroIds } },
        })
        .catch(() => {})
    }

    // Clean up shifts
    if (created.shiftIds.length > 0) {
      await prisma.shift
        .deleteMany({
          where: { id: { in: created.shiftIds } },
        })
        .catch(() => {})
    }
  })

  // =========================================================
  // UC-051: Schichten anlegen und zuweisen
  // =========================================================
  describe("UC-051: Schichten anlegen und zuweisen", () => {
    it("should create a shift with required fields", async () => {
      const result = await caller.shifts.create({
        code: "E2E-FRUEH",
        name: "E2E Fruehschicht",
        description: "06:00-14:00 Fruehschicht",
        color: "#4CAF50",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-FRUEH")
      expect(result.name).toBe("E2E Fruehschicht")
      expect(result.description).toBe("06:00-14:00 Fruehschicht")
      expect(result.color).toBe("#4CAF50")
      expect(result.isActive).toBe(true)
      state.shiftId = result.id
      created.shiftIds.push(result.id)
    })

    it("should create a second shift", async () => {
      const result = await caller.shifts.create({
        code: "E2E-SPAET",
        name: "E2E Spaetschicht",
        description: "14:00-22:00 Spaetschicht",
        color: "#FF9800",
      })

      expect(result.id).toBeDefined()
      expect(result.code).toBe("E2E-SPAET")
      created.shiftIds.push(result.id)
    })

    it("should reject duplicate shift codes", async () => {
      await expect(
        caller.shifts.create({
          code: "E2E-FRUEH",
          name: "E2E Duplicate",
        })
      ).rejects.toThrow()
    })

    it("should list shifts including new ones", async () => {
      const { data } = await caller.shifts.list()
      const codes = data.map((s: any) => s.code)
      expect(codes).toContain("E2E-FRUEH")
      expect(codes).toContain("E2E-SPAET")
    })

    it("should retrieve a shift by ID", async () => {
      const result = await caller.shifts.getById({ id: state.shiftId! })
      expect(result.id).toBe(state.shiftId!)
      expect(result.code).toBe("E2E-FRUEH")
    })

    it("should update a shift", async () => {
      const result = await caller.shifts.update({
        id: state.shiftId!,
        name: "E2E Fruehschicht Updated",
        color: "#2196F3",
      })

      expect(result.name).toBe("E2E Fruehschicht Updated")
      expect(result.color).toBe("#2196F3")
      // Code should remain unchanged
      expect(result.code).toBe("E2E-FRUEH")
    })
  })

  // =========================================================
  // UC-052: Makro erstellen
  // =========================================================
  describe("UC-052: Makro erstellen", () => {
    it("should create a macro with log_message action", async () => {
      const result = await caller.macros.create({
        name: "E2E Log Macro",
        description: "Test macro that logs a message",
        macroType: "weekly",
        actionType: "log_message",
        actionParams: { message: "E2E test message" },
      })

      expect(result.id).toBeDefined()
      expect(result.name).toBe("E2E Log Macro")
      expect(result.macroType).toBe("weekly")
      expect(result.actionType).toBe("log_message")
      expect(result.isActive).toBe(true)
      expect(result.assignments).toEqual([])
      state.macroId = result.id
      created.macroIds.push(result.id)
    })

    it("should create a monthly macro", async () => {
      const result = await caller.macros.create({
        name: "E2E Monthly Macro",
        description: "Carry forward balance monthly",
        macroType: "monthly",
        actionType: "carry_forward_balance",
      })

      expect(result.id).toBeDefined()
      expect(result.macroType).toBe("monthly")
      expect(result.actionType).toBe("carry_forward_balance")
      created.macroIds.push(result.id)
    })

    it("should list macros including new ones", async () => {
      const { data } = await caller.macros.list()
      const names = data.map((m: any) => m.name)
      expect(names).toContain("E2E Log Macro")
      expect(names).toContain("E2E Monthly Macro")
    })

    it("should retrieve a macro by ID with assignments", async () => {
      const result = await caller.macros.getById({ id: state.macroId! })
      expect(result.id).toBe(state.macroId!)
      expect(result.name).toBe("E2E Log Macro")
      expect(result.assignments).toBeDefined()
    })

    it("should update a macro", async () => {
      const result = await caller.macros.update({
        id: state.macroId!,
        name: "E2E Log Macro Updated",
        description: "Updated description",
      })

      expect(result.name).toBe("E2E Log Macro Updated")
      expect(result.description).toBe("Updated description")
    })
  })

  // =========================================================
  // UC-053: Makro zuweisen und ausfuehren
  // =========================================================
  describe("UC-053: Makro zuweisen und ausfuehren", () => {
    it("should create a macro assignment for an employee", async () => {
      const result = await caller.macros.createAssignment({
        macroId: state.macroId!,
        employeeId: SEED_EMPLOYEE_ID,
        executionDay: 1, // Monday for weekly macro
      })

      expect(result.id).toBeDefined()
      expect(result.macroId).toBe(state.macroId!)
      expect(result.employeeId).toBe(SEED_EMPLOYEE_ID)
      expect(result.executionDay).toBe(1)
      expect(result.isActive).toBe(true)
      state.assignmentId = result.id
      created.macroAssignmentIds.push(result.id)
    })

    it("should list macro assignments", async () => {
      const { data } = await caller.macros.listAssignments({
        macroId: state.macroId!,
      })
      expect(data.length).toBeGreaterThanOrEqual(1)
      const found = data.find((a: any) => a.id === state.assignmentId!)
      expect(found).toBeDefined()
      expect(found!.employeeId).toBe(SEED_EMPLOYEE_ID)
    })

    it("should update a macro assignment", async () => {
      const result = await caller.macros.updateAssignment({
        macroId: state.macroId!,
        assignmentId: state.assignmentId!,
        executionDay: 5, // Friday
      })

      expect(result.executionDay).toBe(5)
    })

    it("should trigger macro execution", async () => {
      const result = await caller.macros.triggerExecution({
        macroId: state.macroId!,
      })

      expect(result.id).toBeDefined()
      expect(result.macroId).toBe(state.macroId!)
      expect(result.triggerType).toBe("manual")
      expect(result.triggeredBy).toBe(SEED.ADMIN_USER_ID)
      expect(["completed", "failed", "running", "pending"]).toContain(
        result.status
      )
      state.executionId = result.id
      created.macroExecutionIds.push(result.id)
    })

    it("should list macro executions", async () => {
      const { data } = await caller.macros.listExecutions({
        macroId: state.macroId!,
      })
      expect(data.length).toBeGreaterThanOrEqual(1)
      const found = data.find((e: any) => e.id === state.executionId!)
      expect(found).toBeDefined()
    })

    it("should retrieve a single execution by ID", async () => {
      const result = await caller.macros.getExecution({
        id: state.executionId!,
      })
      expect(result.id).toBe(state.executionId!)
      expect(result.macroId).toBe(state.macroId!)
    })

    it("should delete a macro assignment", async () => {
      const result = await caller.macros.deleteAssignment({
        macroId: state.macroId!,
        assignmentId: state.assignmentId!,
      })
      expect(result.success).toBe(true)
    })
  })

  // =========================================================
  // UC-054: Zeitplan (Schedule) erstellen
  // =========================================================
  describe("UC-054: Zeitplan (Schedule) erstellen", () => {
    it("should return available task types from the catalog", async () => {
      const { data } = await caller.schedules.taskCatalog()
      expect(data.length).toBeGreaterThan(0)

      // Verify known task types exist
      const taskTypes = data.map((t: any) => t.taskType)
      expect(taskTypes).toContain("calculate_days")
      expect(taskTypes).toContain("alive_check")
    })

    it("should create a schedule with inline tasks", async () => {
      const result = await caller.schedules.create({
        name: "E2E Daily Calc Schedule",
        description: "Runs daily value calculation",
        timingType: "daily",
        isEnabled: false, // Keep disabled for test
        tasks: [
          {
            taskType: "calculate_days",
            sortOrder: 0,
            isEnabled: true,
          },
          {
            taskType: "alive_check",
            sortOrder: 1,
            isEnabled: true,
          },
        ],
      })

      expect(result.id).toBeDefined()
      expect(result.name).toBe("E2E Daily Calc Schedule")
      expect(result.timingType).toBe("daily")
      expect(result.isEnabled).toBe(false)
      expect(result.tasks).toBeDefined()
      expect(result.tasks!.length).toBe(2)
      state.scheduleId = result.id
      created.scheduleIds.push(result.id)
    })

    it("should create a manual-only schedule", async () => {
      const result = await caller.schedules.create({
        name: "E2E Manual Schedule",
        description: "Only triggered manually",
        timingType: "manual",
      })

      expect(result.id).toBeDefined()
      expect(result.timingType).toBe("manual")
      state.manualScheduleId = result.id
      created.scheduleIds.push(result.id)
    })

    it("should list schedules including new ones", async () => {
      const { data } = await caller.schedules.list()
      const names = data.map((s: any) => s.name)
      expect(names).toContain("E2E Daily Calc Schedule")
      expect(names).toContain("E2E Manual Schedule")
    })

    it("should retrieve a schedule by ID with tasks", async () => {
      const result = await caller.schedules.getById({ id: state.scheduleId! })
      expect(result.id).toBe(state.scheduleId!)
      expect(result.tasks).toBeDefined()
      expect(result.tasks!.length).toBe(2)
    })

    it("should add a task to an existing schedule", async () => {
      const result = await caller.schedules.createTask({
        scheduleId: state.manualScheduleId!,
        taskType: "execute_macros",
        sortOrder: 0,
      })

      expect(result.id).toBeDefined()
      expect(result.scheduleId).toBe(state.manualScheduleId!)
      expect(result.taskType).toBe("execute_macros")
      state.taskId = result.id
    })

    it("should list tasks for a schedule", async () => {
      const { data } = await caller.schedules.tasks({
        scheduleId: state.manualScheduleId!,
      })
      expect(data.length).toBe(1)
      expect(data[0]!.taskType).toBe("execute_macros")
    })

    it("should update a task", async () => {
      const result = await caller.schedules.updateTask({
        scheduleId: state.manualScheduleId!,
        taskId: state.taskId!,
        sortOrder: 10,
        isEnabled: false,
      })

      expect(result.sortOrder).toBe(10)
      expect(result.isEnabled).toBe(false)
    })

    it("should update a schedule", async () => {
      const result = await caller.schedules.update({
        id: state.scheduleId!,
        description: "Updated daily calc",
      })

      expect(result.description).toBe("Updated daily calc")
    })
  })

  // =========================================================
  // UC-055: Zeitplan manuell ausfuehren
  // =========================================================
  describe("UC-055: Zeitplan manuell ausfuehren", () => {
    it("should manually execute a schedule", async () => {
      // Enable the schedule first (it was created with isEnabled: false)
      await caller.schedules.update({
        id: state.scheduleId!,
        isEnabled: true,
      })

      const result = await caller.schedules.execute({
        scheduleId: state.scheduleId!,
      })

      expect(result.id).toBeDefined()
      expect(result.scheduleId).toBe(state.scheduleId!)
      expect(result.triggerType).toBe("manual")
      expect(result.triggeredBy).toBe(SEED.ADMIN_USER_ID)
      expect(result.tasksTotal).toBeGreaterThanOrEqual(0)
      expect(["completed", "failed", "partial", "running", "pending"]).toContain(
        result.status
      )
      state.scheduleExecutionId = result.id
      created.scheduleExecutionIds.push(result.id)
    })

    it("should list executions for a schedule", async () => {
      const { data } = await caller.schedules.executions({
        scheduleId: state.scheduleId!,
      })
      expect(data.length).toBeGreaterThanOrEqual(1)

      const found = data.find(
        (e: any) => e.id === state.scheduleExecutionId!
      )
      expect(found).toBeDefined()
      expect(found!.triggerType).toBe("manual")
    })

    it("should retrieve a single execution by ID with task details", async () => {
      const result = await caller.schedules.execution({
        id: state.scheduleExecutionId!,
      })

      expect(result.id).toBe(state.scheduleExecutionId!)
      expect(result.scheduleId).toBe(state.scheduleId!)
      // Task executions should be present
      expect(result.taskExecutions).toBeDefined()
    })

    it("should execute the manual schedule", async () => {
      const result = await caller.schedules.execute({
        scheduleId: state.manualScheduleId!,
      })

      expect(result.id).toBeDefined()
      expect(result.triggerType).toBe("manual")
      created.scheduleExecutionIds.push(result.id)
    })

    it("should delete a task from a schedule", async () => {
      const result = await caller.schedules.deleteTask({
        scheduleId: state.manualScheduleId!,
        taskId: state.taskId!,
      })
      expect(result.success).toBe(true)
    })
  })
})
