/**
 * tRPC App Router Handler
 *
 * Handles all tRPC requests at /api/trpc/*.
 * Uses the fetch adapter for Next.js App Router compatibility.
 *
 * @see https://trpc.io/docs/server/adapters/fetch
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "@/server/root"
import { createTRPCContext } from "@/server/trpc"

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
  })

export { handler as GET, handler as POST }
