import { useCallback, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { tenantIdStorage } from "@/lib/storage"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

/**
 * Hook for the AI assistant with SSE streaming support.
 * Uses a raw fetch to /api/ai-assistant instead of tRPC
 * so we can consume the streaming response incrementally.
 */
export function useAiAssistantStream() {
  const [isPending, setIsPending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(
    async (params: {
      question: string
      mode: "kompakt" | "ausfuehrlich"
      history: ChatMessage[]
      onToken: (text: string) => void
      onDone: () => void
      onError: (error: string) => void
    }) => {
      // Abort any in-flight request
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsPending(true)

      // Timeout: abort after 30 seconds if no response
      const timeout = setTimeout(() => {
        controller.abort()
        params.onError("Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.")
      }, 30_000)

      try {
        // Get auth headers (same as tRPC client)
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (session?.access_token) {
          headers["authorization"] = `Bearer ${session.access_token}`
        }
        const tenantId = tenantIdStorage.getTenantId()
        if (tenantId) {
          headers["x-tenant-id"] = tenantId
        }

        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers,
          body: JSON.stringify({
            question: params.question,
            mode: params.mode,
            history: params.history,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Unbekannter Fehler" }))
          params.onError(data.error ?? `Fehler ${res.status}`)
          return
        }

        // Read the SSE stream
        const reader = res.body?.getReader()
        if (!reader) {
          params.onError("Streaming nicht unterstützt")
          return
        }

        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete SSE lines
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? "" // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const payload = line.slice(6)

            if (payload === "[DONE]") {
              params.onDone()
              return
            }

            try {
              const data = JSON.parse(payload)
              if (data.error) {
                params.onError(data.error)
                return
              }
              if (data.text) {
                params.onToken(data.text)
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        params.onDone()
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        params.onError(
          err instanceof Error ? err.message : "Ein unerwarteter Fehler ist aufgetreten."
        )
      } finally {
        clearTimeout(timeout)
        setIsPending(false)
        abortRef.current = null
      }
    },
    []
  )

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsPending(false)
  }, [])

  return { send, abort, isPending }
}
