import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground ring-1 ring-inset ring-secondary-foreground/8 [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        // Tinted color variants — visible in light mode, proper dark mode support
        blue: "bg-blue-500 text-white ring-1 ring-inset ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/20",
        green: "bg-emerald-500 text-white ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20",
        red: "bg-red-500 text-white ring-1 ring-inset ring-red-600/20 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-400/20",
        amber: "bg-amber-500 text-white ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20",
        yellow: "bg-yellow-500 text-white ring-1 ring-inset ring-yellow-600/20 dark:bg-yellow-500/15 dark:text-yellow-300 dark:ring-yellow-400/20",
        purple: "bg-purple-500 text-white ring-1 ring-inset ring-purple-600/20 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-400/20",
        gray: "bg-gray-500 text-white ring-1 ring-inset ring-gray-600/20 dark:bg-gray-500/15 dark:text-gray-300 dark:ring-gray-400/20",
        indigo: "bg-indigo-500 text-white ring-1 ring-inset ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/20",
        teal: "bg-teal-500 text-white ring-1 ring-inset ring-teal-600/20 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/20",
        orange: "bg-orange-500 text-white ring-1 ring-inset ring-orange-600/20 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/20",
        pink: "bg-pink-500 text-white ring-1 ring-inset ring-pink-600/20 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-400/20",
        cyan: "bg-cyan-500 text-white ring-1 ring-inset ring-cyan-600/20 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-400/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
