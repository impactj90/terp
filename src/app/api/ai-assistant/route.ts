/**
 * AI Assistant Streaming API Route
 *
 * POST /api/ai-assistant
 * Streams Anthropic responses via Server-Sent Events (SSE).
 * Auth is validated the same way as tRPC context (Bearer token + tenant ID).
 */
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { prisma } from "@/lib/db"
import { serverEnv, clientEnv } from "@/lib/config"
import * as aiAssistantService from "@/lib/services/ai-assistant-service"

export const runtime = "nodejs"

// --- Input Validation (mirrors tRPC router schema) ---

const bodySchema = z.object({
  question: z.string().min(1).max(500),
  mode: z.enum(["kompakt", "ausfuehrlich"]).default("kompakt"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(5000), // cap per-message length
      })
    )
    .max(20)
    .default([]),
})

export async function POST(req: Request) {
  // --- Auth (mirrors tRPC init.ts logic) ---
  const authHeader = req.headers.get("authorization")
  const authToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  const tenantId = req.headers.get("x-tenant-id")

  if (!authToken || !tenantId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const supabase = createClient(
    serverEnv.supabaseUrl || clientEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const {
    data: { user: supabaseUser },
    error: authError,
  } = await supabase.auth.getUser(authToken)

  if (!supabaseUser || authError) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Verify user exists and has tenant access
  const dbUser = await prisma.user.findUnique({
    where: { id: supabaseUser.id },
    include: { userTenants: true },
  })

  if (!dbUser || dbUser.isActive === false || dbUser.isLocked) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const hasAccess = dbUser.userTenants.some((ut) => ut.tenantId === tenantId)
  if (!hasAccess) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  // --- Parse & validate body ---
  let body: z.infer<typeof bodySchema>
  try {
    const raw = await req.json()
    body = bodySchema.parse(raw)
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.issues.map((e: z.ZodIssue) => e.message).join(", ")
        : "Invalid request body"
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  // --- Stream response ---
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null
  const userAgent = req.headers.get("user-agent") ?? null

  try {
    const stream = await aiAssistantService.askQuestionStream(
      prisma,
      {
        tenantId,
        userId: dbUser.id,
        question: body.question,
        mode: body.mode,
        history: body.history,
      },
      { userId: dbUser.id, ipAddress, userAgent }
    )

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    if (err instanceof Error && err.name === "AiAssistantRateLimitError") {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (err instanceof Error && err.name === "AiAssistantValidationError") {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    console.error("[AI Assistant] Stream error:", err)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
