import "../globals.css"
import { PlatformTRPCProvider } from "@/trpc/platform/client"
import { Toaster } from "sonner"

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-muted/20 font-sans antialiased">
        <PlatformTRPCProvider>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </PlatformTRPCProvider>
      </body>
    </html>
  )
}
