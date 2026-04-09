/**
 * Platform tRPC App Router Handler
 *
 * Handles all platform-admin tRPC requests at `/api/trpc-platform/*`.
 * Kept on a separate route from the tenant tRPC endpoint so that a
 * misrouted call cannot leak into the tenant user space, and so that
 * host-based routing (`admin.terp.de` vs `app.terp.de`) lines up with
 * path-based routing without overlap.
 *
 * Every response carries `x-auth-domain: platform` — used by client code
 * (tRPC links, fetch interceptors) to distinguish platform errors from
 * tenant errors at a glance.
 *
 * `createPlatformTRPCContext` is passed a fresh `Headers` bag on every
 * call; procedures mutate that bag (e.g. by appending `Set-Cookie`), and
 * this handler copies every entry onto the outgoing response before
 * returning.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { platformAppRouter } from "@/trpc/platform/_app"
import { createPlatformTRPCContext } from "@/trpc/platform/init"

const handler = async (req: Request) => {
  const responseHeaders = new Headers()
  responseHeaders.set("x-auth-domain", "platform")

  const response = await fetchRequestHandler({
    endpoint: "/api/trpc-platform",
    req,
    router: platformAppRouter,
    createContext: (opts) => createPlatformTRPCContext(opts, responseHeaders),
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error(`[tRPC-platform] Internal error on '${path}':`, error)
      }
    },
  })

  // Copy non-cookie headers first, then append each Set-Cookie individually
  // so multiple cookie headers are preserved (Headers.forEach folds them).
  responseHeaders.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return
    response.headers.set(key, value)
  })
  const setCookies =
    typeof responseHeaders.getSetCookie === "function"
      ? responseHeaders.getSetCookie()
      : []
  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie)
  }
  return response
}

export { handler as GET, handler as POST }
