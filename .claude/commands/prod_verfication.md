You are doing a thorough production-readiness audit of this codebase.

Go through the entire application systematically and find:

1. **Cache invalidation bugs** — anywhere data is cached (React Query, server-side)
   and might show stale data after mutations

2. **Race conditions** — async operations that could resolve in wrong order

3. **Missing error boundaries** — API calls without proper error handling that
   could crash the UI

4. **tRPC issues** — missing input validation, unprotected procedures,
   incorrect invalidation after mutations

5. **Multi-tenant leaks** — any query that could accidentally return data
   from the wrong tenant

6. **Auth edge cases** — routes or procedures accessible without proper
   role checks

7. **Prisma N+1 queries** — loops that trigger individual DB calls instead
   of batch queries

For each bug found:

- File and line number
- What the bug is
- Why it's a problem in production
- Exact fix

Start with the highest risk areas first: auth middleware, tenant scoping,
and tRPC procedures. Then move to UI cache invalidation.
