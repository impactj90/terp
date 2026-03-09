/**
 * Topic prefix constants and builder functions.
 * Server-only -- do not import from client components.
 *
 *
 * Topic naming convention:
 * - user:{uuid}        -- per-user notifications
 * - department:{uuid}  -- department-wide events
 * - group:{uuid}       -- group events
 * - global:announcements -- company-wide broadcasts
 */

// ---------------------------------------------------------------------------
// Topic Prefix Constants
// ---------------------------------------------------------------------------

export const TOPIC_PREFIX_USER = 'user:'
export const TOPIC_PREFIX_DEPARTMENT = 'department:'
export const TOPIC_PREFIX_GROUP = 'group:'
export const TOPIC_PREFIX_GLOBAL = 'global:'
export const TOPIC_ANNOUNCEMENTS = 'global:announcements'
export const TOPIC_FEED = 'global:feed'

// ---------------------------------------------------------------------------
// Topic Builder Functions
// ---------------------------------------------------------------------------

/**
 * Build a user-specific topic string.
 */
export function userTopic(userId: string): string {
  return `${TOPIC_PREFIX_USER}${userId}`
}

/**
 * Build a department-specific topic string.
 */
export function departmentTopic(deptId: string): string {
  return `${TOPIC_PREFIX_DEPARTMENT}${deptId}`
}

/**
 * Build a group-specific topic string.
 */
export function groupTopic(groupId: string): string {
  return `${TOPIC_PREFIX_GROUP}${groupId}`
}
