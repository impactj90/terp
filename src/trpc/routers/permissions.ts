/**
 * Permissions Router
 *
 * Serves the static permission catalog. Replaces the Go backend
 * GET /permissions endpoint (PermissionHandler.List).
 *
 * Used by:
 * - User group management UI (permission picker)
 * - usePermissionChecker hook (catalog lookup)
 */
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import { listPermissions } from "@/lib/auth/permission-catalog"

const permissionSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string(),
})

const listOutputSchema = z.object({
  permissions: z.array(permissionSchema),
})

export const permissionsRouter = createTRPCRouter({
  /**
   * permissions.list -- Returns all available permissions in the system.
   *
   * Replaces: GET /permissions (Go PermissionHandler.List)
   */
  list: protectedProcedure
    .output(listOutputSchema)
    .query(() => {
      return {
        permissions: listPermissions(),
      }
    }),
})
