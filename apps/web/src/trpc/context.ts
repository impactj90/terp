/**
 * tRPC React Context
 *
 * Creates the typed TRPCProvider and useTRPC hook from the AppRouter type.
 * This file is imported by both client and provider components.
 */
import { createTRPCContext } from "@trpc/tanstack-react-query"
import type { AppRouter } from "@/server/root"

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>()
