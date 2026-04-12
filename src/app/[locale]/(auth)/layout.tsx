export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-muted/40 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
