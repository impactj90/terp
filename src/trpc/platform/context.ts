/**
 * Platform tRPC React context.
 *
 * Parallels `src/trpc/context.ts` but is typed against `PlatformAppRouter`
 * so platform hooks cannot accidentally call tenant procedures (and vice
 * versa). Consumed by `src/trpc/platform/client.tsx`.
 */
import { createTRPCContext } from "@trpc/tanstack-react-query"
import type { PlatformAppRouter } from "@/trpc/platform/_app"

export const {
  TRPCProvider: PlatformTRPCContextProvider,
  useTRPC: usePlatformTRPC,
  useTRPCClient: usePlatformTRPCClient,
} = createTRPCContext<PlatformAppRouter>()
