import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combines class names using clsx and merges Tailwind classes intelligently.
 * Used by Shadcn/ui components for conditional class application.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
