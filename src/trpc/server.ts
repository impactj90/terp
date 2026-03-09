/**
 * Server-side tRPC caller
 *
 * For use in Server Components and server-side code.
 * Calls tRPC procedures directly without HTTP round-trips.
 *
 * Usage:
 *   import { getServerTrpc } from "@/trpc/server"
 *   const serverTrpc = await getServerTrpc()
 *   const health = await serverTrpc.health.check()
 *
 * NOTE: This is optional for ZMI-TICKET-201. The primary use case is
 * client-side tRPC via the TRPCReactProvider. Server-side usage can
 * be adopted incrementally in future tickets.
 */
import "server-only"
import { createCaller } from "@/server"

/**
 * Creates a server-side tRPC caller with a minimal context.
 * Since there is no HTTP request in server components, we construct
 * a synthetic context with the prisma client and null auth/tenant.
 */
export async function getServerTrpc() {
  const { prisma } = await import("@/lib/db")
  const caller = createCaller({
    prisma,
    authToken: null,
    user: null,
    session: null,
    tenantId: null,
  })
  return caller
}
