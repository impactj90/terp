/**
 * Nachkalkulation Router (NK-1)
 *
 * Top-level NK router that bundles:
 * - targets: OrderTarget CRUD (Decision 1)
 * - reports: Aggregator queries (Phase 6, Decision 11)
 * - thresholds: Schwellen-Konfig (Phase 7, Decision 9)
 *
 * All sub-routers require module "nachkalkulation" enabled (Decision 23).
 */
import { createTRPCRouter } from "@/trpc/init"
import { targetsRouter } from "./targets"
import { reportsRouter } from "./reports"
import { thresholdsRouter } from "./thresholds"

export const nachkalkulationRouter = createTRPCRouter({
  targets: targetsRouter,
  reports: reportsRouter,
  thresholds: thresholdsRouter,
})
