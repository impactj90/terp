/**
 * PubSub module barrel export.
 * Server-only -- do not import from client components.
 *
 */

// Hub
export { PubSubHub } from './hub'

// Types
export type {
  PubSubMessage,
  PubSubHubConfig,
  PubSubSubscription,
  SupabaseClientLike,
  RealtimeChannelLike,
} from './types'

// Topics
export {
  TOPIC_PREFIX_USER,
  TOPIC_PREFIX_DEPARTMENT,
  TOPIC_PREFIX_GROUP,
  TOPIC_PREFIX_GLOBAL,
  TOPIC_ANNOUNCEMENTS,
  TOPIC_FEED,
  userTopic,
  departmentTopic,
  groupTopic,
} from './topics'
