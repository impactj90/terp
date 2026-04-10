/**
 * E2E: Team Overview Real-Time Updates
 *
 * Verifies that when a user clocks in/out, the team overview page
 * updates in real-time without a manual refresh.
 *
 * Uses two browser contexts:
 *   - Admin: watches the team overview page
 *   - User: clocks in/out on the time-clock page
 *
 * Update path:
 *   bookings.create → notifyTeamOfBookingChange → PubSub hub.publish
 *   → SSE onEvent → useGlobalNotifications → invalidateQueries(dayView)
 *   → TeamStatsCards + TeamAttendanceList re-render
 */
import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { ADMIN_STORAGE, USER_STORAGE } from "./helpers/auth"

/** Helper: get the numeric value from a StatsCard by its title text */
async function getStatsCardValue(
  page: Page,
  titleText: string | RegExp
): Promise<number> {
  // StatsCard structure: <div class="...border bg-card p-6">
  //   <span class="text-sm...">Title</span>
  //   <span class="text-2xl font-bold">Value</span>
  const card = page.locator(".bg-card").filter({ hasText: titleText }).first()
  const valueSpan = card.locator(".text-2xl.font-bold")
  const text = await valueSpan.textContent({ timeout: 10_000 })
  return parseInt(text ?? "0", 10)
}

test.describe("Team Overview Real-Time", () => {
  test("clock-in by user updates team overview in real-time", async ({
    browser,
  }) => {
    // --- Setup: two browser contexts ---
    const adminContext = await browser.newContext({
      storageState: ADMIN_STORAGE,
    })
    const userContext = await browser.newContext({
      storageState: USER_STORAGE,
    })

    const adminPage = await adminContext.newPage()
    const userPage = await userContext.newPage()

    try {
      // --- Step 1: Admin opens team overview ---
      await adminPage.goto("/team-overview")
      await adminPage
        .locator("main#main-content")
        .waitFor({ state: "visible", timeout: 15_000 })

      // Select "Frontend Team" if not already selected
      const selectTrigger = adminPage
        .locator("main#main-content")
        .getByRole("combobox")
        .first()
      const currentTeam = await selectTrigger.textContent().catch(() => "")
      if (!currentTeam?.includes("Frontend")) {
        await selectTrigger.click()
        await adminPage.getByRole("option", { name: /Frontend/i }).click()
      }

      // Wait for attendance data to load (the date heading appears)
      await expect(
        adminPage.locator("main#main-content").getByText(/Anwesenheit/i).first()
      ).toBeVisible({ timeout: 15_000 })

      // Wait for stats cards to be non-loading (value is a number, not '-')
      await expect(async () => {
        const val = await adminPage
          .locator(".bg-card")
          .filter({ hasText: /Heute anwesend/i })
          .first()
          .locator(".text-2xl.font-bold")
          .textContent()
        expect(val).toMatch(/^\d+$/)
      }).toPass({ timeout: 15_000, intervals: [500] })

      // --- Step 2: User goes to time-clock ---
      await userPage.goto("/time-clock")
      await userPage
        .locator("main#main-content")
        .waitFor({ state: "visible", timeout: 15_000 })

      const userMain = userPage.locator("main#main-content")
      const clockInBtn = userMain.getByRole("button", { name: /einstempeln/i })
      const clockOutBtn = userMain.getByRole("button", { name: /ausstempeln/i })

      // Wait for clock page to fully load
      await expect(clockInBtn.or(clockOutBtn)).toBeEnabled({ timeout: 10_000 })

      // Ensure user is clocked OUT first
      const isClockedIn = await clockOutBtn.isEnabled().catch(() => false)
      if (isClockedIn) {
        await clockOutBtn.click()
        await expect(clockInBtn).toBeEnabled({ timeout: 10_000 })
        // Wait for admin page to process the clock-out event
        await expect(async () => {
          const val = await getStatsCardValue(adminPage, /Heute anwesend/i)
          // Just wait for it to stabilize
          expect(typeof val).toBe("number")
        }).toPass({ timeout: 10_000, intervals: [1_000] })
      }

      // Read present count BEFORE clock-in
      const presentBefore = await getStatsCardValue(adminPage, /Heute anwesend/i)
      console.log(`Present before clock-in: ${presentBefore}`)

      // --- Step 3: User clocks in ---
      await clockInBtn.click()
      await expect(clockOutBtn).toBeEnabled({ timeout: 10_000 })
      console.log("User clocked in successfully")

      // --- Step 4: Verify admin team overview updates in real-time ---
      const expectedAfterClockIn = presentBefore + 1
      console.log(`Expecting present count to become: ${expectedAfterClockIn}`)

      await expect(async () => {
        const current = await getStatsCardValue(adminPage, /Heute anwesend/i)
        console.log(`  Current present count: ${current}`)
        expect(current).toBe(expectedAfterClockIn)
      }).toPass({ timeout: 15_000, intervals: [1_000] })

      console.log("✓ Real-time update after clock-in verified")

      // --- Step 5: User clocks out → count should decrease ---
      await clockOutBtn.click()
      await expect(clockInBtn).toBeEnabled({ timeout: 10_000 })
      console.log("User clocked out successfully")

      await expect(async () => {
        const current = await getStatsCardValue(adminPage, /Heute anwesend/i)
        console.log(`  Current present count: ${current}`)
        expect(current).toBe(presentBefore)
      }).toPass({ timeout: 15_000, intervals: [1_000] })

      console.log("✓ Real-time update after clock-out verified")

    } finally {
      await adminPage.close()
      await userPage.close()
      await adminContext.close()
      await userContext.close()
    }
  })
})
