/**
 * HR Router
 *
 * Merges HR sub-routers: personnelFile.
 * No module guard — HR is core functionality.
 */
import { createTRPCRouter } from "@/trpc/init"
import { hrPersonnelFileRouter } from "./personnelFile"

export const hrRouter = createTRPCRouter({
  personnelFile: hrPersonnelFileRouter,
})
