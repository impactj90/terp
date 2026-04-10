import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "../globals.css"
import { PlatformTRPCProvider } from "@/trpc/platform/client"
import { ThemeProvider } from "@/providers/theme-provider"
import { Toaster } from "sonner"

/**
 * Root layout for the platform-admin tree.
 *
 * Intentionally mirrors `src/app/[locale]/layout.tsx` in typography and
 * theme wiring — same Inter font, same `ThemeProvider` defaults (light +
 * modern) — so operators see a visually consistent UI across the tenant
 * app and the platform console. Providers that belong to the tenant
 * domain (NextIntl, tenant TRPC client, AuthProvider) are deliberately
 * absent: the platform tree has its own auth, routing, and data layer.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: "Terp Platform",
  description: "Terp platform administration console",
  robots: { index: false, follow: false },
}

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans antialiased">
        <ThemeProvider defaultTheme="light" defaultColorTheme="modern">
          <PlatformTRPCProvider>
            {children}
            <Toaster richColors closeButton position="bottom-right" />
          </PlatformTRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
