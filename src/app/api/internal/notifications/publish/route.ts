import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getHub } from '@/lib/pubsub/singleton'
import { userTopic } from '@/lib/pubsub/topics'

export async function POST(req: NextRequest) {
  // Validate internal API key
  const apiKey = req.headers.get('x-internal-api-key')
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { userId, event } = body

  if (!userId || !event) {
    return NextResponse.json({ error: 'Missing userId or event' }, { status: 400 })
  }

  const hub = await getHub()
  await hub.publish(userTopic(userId), event, true)

  return NextResponse.json({ ok: true })
}
