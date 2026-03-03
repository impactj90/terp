/**
 * Legacy auth hooks — DEPRECATED.
 *
 * These hooks are superseded by Supabase Auth (ZMI-TICKET-202):
 * - useCurrentUser() -> tRPC auth.me via AuthProvider
 * - useLogin() -> supabase.auth.signInWithPassword() in login page
 * - useDevLogin() -> supabase.auth.signInWithPassword() with dev credentials
 * - useDevUsers() -> no longer needed (dev users are in Supabase)
 * - useLogout() -> supabase.auth.signOut() via AuthProvider
 *
 * The User type is re-exported from AuthProvider for backward compatibility.
 */

// Re-export AuthUser as User for backward compatibility with existing consumers
export type { AuthUser as User } from '@/providers/auth-provider'
