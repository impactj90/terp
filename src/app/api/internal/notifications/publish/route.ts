import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getHub } from '@/lib/pubsub/singleton'
import { userTopic } from '@/lib/pubsub/topics'

export async function POST(req: NextRequest) {
  // Validate internal API key
  const internalApiKey = process.env.INTERNAL_API_KEY
  if (!internalApiKey) {
    console.error('[notifications/publish] INTERNAL_API_KEY is not configured')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const apiKey = req.headers.get('x-internal-api-key')
  if (apiKey !== internalApiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { userId, event } = body as Record<string, unknown>

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid userId' }, { status: 400 })
  }

  if (!event) {
    return NextResponse.json({ error: 'Missing event' }, { status: 400 })
  }

  const hub = await getHub()
  await hub.publish(userTopic(userId), event, true)

  return NextResponse.json({ ok: true })
}
