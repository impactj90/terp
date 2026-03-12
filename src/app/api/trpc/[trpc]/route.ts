/**
 * tRPC App Router Handler
 *
 * Handles all tRPC requests at /api/trpc/*.
 * Uses the fetch adapter for Next.js App Router compatibility.
 *
 * @see https://trpc.io/docs/server/adapters/fetch
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "@/trpc/routers/_app"
import { createTRPCContext } from "@/trpc/init"

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error(`[tRPC] Internal server error on '${path}':`, error)
      }
    },
  })

export { handler as GET, handler as POST }
