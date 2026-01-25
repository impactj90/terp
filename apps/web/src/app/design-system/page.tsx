'use client'

import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function DesignSystemPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold">Design System</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-16 px-6 py-12">
        {/* Colors Section */}
        <section>
          <h2 className="mb-8 text-3xl font-bold">Colors</h2>

          {/* Primary & Secondary */}
          <div className="mb-8">
            <h3 className="mb-4 text-xl font-semibold text-muted-foreground">Brand Colors</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <ColorSwatch name="Primary" variable="--color-primary" className="bg-primary text-primary-foreground" />
              <ColorSwatch name="Primary Hover" variable="--color-primary-hover" className="bg-[hsl(var(--color-primary-hover))]" style={{ backgroundColor: 'var(--color-primary-hover)' }} />
              <ColorSwatch name="Secondary" variable="--color-secondary" className="bg-secondary text-secondary-foreground" />
              <ColorSwatch name="Secondary Hover" variable="--color-secondary-hover" style={{ backgroundColor: 'var(--color-secondary-hover)' }} />
            </div>
          </div>

          {/* Semantic Colors */}
          <div className="mb-8">
            <h3 className="mb-4 text-xl font-semibold text-muted-foreground">Semantic Colors</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <ColorSwatch name="Success" variable="--color-success" className="bg-success text-success-foreground" style={{ backgroundColor: 'var(--color-success)', color: 'var(--color-success-foreground)' }} />
              <ColorSwatch name="Warning" variable="--color-warning" style={{ backgroundColor: 'var(--color-warning)', color: 'var(--color-warning-foreground)' }} />
              <ColorSwatch name="Error" variable="--color-error" style={{ backgroundColor: 'var(--color-error)', color: 'var(--color-error-foreground)' }} />
              <ColorSwatch name="Info" variable="--color-info" style={{ backgroundColor: 'var(--color-info)', color: 'var(--color-info-foreground)' }} />
            </div>
          </div>

          {/* Neutral Colors */}
          <div className="mb-8">
            <h3 className="mb-4 text-xl font-semibold text-muted-foreground">Neutral Colors</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              <ColorSwatch name="Background" variable="--color-background" className="bg-background text-foreground border" />
              <ColorSwatch name="Foreground" variable="--color-foreground" className="bg-foreground text-background" />
              <ColorSwatch name="Card" variable="--color-card" className="bg-card text-card-foreground border" />
              <ColorSwatch name="Muted" variable="--color-muted" className="bg-muted text-muted-foreground" />
              <ColorSwatch name="Accent" variable="--color-accent" className="bg-accent text-accent-foreground" />
              <ColorSwatch name="Destructive" variable="--color-destructive" className="bg-destructive text-destructive-foreground" />
            </div>
          </div>

          {/* Border & Ring */}
          <div>
            <h3 className="mb-4 text-xl font-semibold text-muted-foreground">Borders & Focus</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <ColorSwatch name="Border" variable="--color-border" className="border-4 border-border bg-background" />
              <ColorSwatch name="Input" variable="--color-input" className="border-4 bg-background" style={{ borderColor: 'var(--color-input)' }} />
              <ColorSwatch name="Ring (Focus)" variable="--color-ring" className="ring-4 ring-ring bg-background" />
            </div>
          </div>
        </section>

        {/* Typography Section */}
        <section>
          <h2 className="mb-8 text-3xl font-bold">Typography</h2>

          <div className="space-y-6">
            <div className="rounded-lg border border-border p-6">
              <h3 className="mb-6 text-xl font-semibold text-muted-foreground">Font Sizes</h3>
              <div className="space-y-4">
                <TypographySample size="3xl" label="3xl (30px)" />
                <TypographySample size="2xl" label="2xl (24px)" />
                <TypographySample size="xl" label="xl (20px)" />
                <TypographySample size="lg" label="lg (18px)" />
                <TypographySample size="base" label="base (16px)" />
                <TypographySample size="sm" label="sm (14px)" />
                <TypographySample size="xs" label="xs (12px)" />
              </div>
            </div>

            <div className="rounded-lg border border-border p-6">
              <h3 className="mb-6 text-xl font-semibold text-muted-foreground">Font Weights</h3>
              <div className="space-y-3 text-lg">
                <p className="font-normal">Regular (400) - The quick brown fox jumps over the lazy dog</p>
                <p className="font-medium">Medium (500) - The quick brown fox jumps over the lazy dog</p>
                <p className="font-semibold">Semibold (600) - The quick brown fox jumps over the lazy dog</p>
                <p className="font-bold">Bold (700) - The quick brown fox jumps over the lazy dog</p>
              </div>
            </div>
          </div>
        </section>

        {/* Spacing Section */}
        <section>
          <h2 className="mb-8 text-3xl font-bold">Spacing</h2>
          <p className="mb-6 text-muted-foreground">Based on 4px base unit (Tailwind default)</p>

          <div className="flex flex-wrap items-end gap-4">
            {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <div
                  className="bg-primary"
                  style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
                />
                <span className="text-xs text-muted-foreground">{size} ({size * 4}px)</span>
              </div>
            ))}
          </div>
        </section>

        {/* Border Radius Section */}
        <section>
          <h2 className="mb-8 text-3xl font-bold">Border Radius</h2>

          <div className="flex flex-wrap gap-6">
            <RadiusSample name="sm" className="rounded-sm" />
            <RadiusSample name="md" className="rounded-md" />
            <RadiusSample name="lg" className="rounded-lg" />
            <RadiusSample name="full" className="rounded-full" />
          </div>
        </section>

        {/* Shadows Section */}
        <section>
          <h2 className="mb-8 text-3xl font-bold">Shadows</h2>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <ShadowSample name="sm" className="shadow-sm" />
            <ShadowSample name="md" className="shadow-md" />
            <ShadowSample name="lg" className="shadow-lg" />
            <ShadowSample name="xl" className="shadow-xl" />
          </div>
        </section>

        {/* Components Section */}
        <section>
          <h2 className="mb-8 text-3xl font-bold">Components</h2>

          {/* Buttons */}
          <div className="mb-10">
            <h3 className="mb-4 text-xl font-semibold text-muted-foreground">Buttons</h3>
            <div className="flex flex-wrap gap-4">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon">
                <span className="text-lg">+</span>
              </Button>
            </div>
          </div>

          {/* Inputs */}
          <div className="mb-10">
            <h3 className="mb-4 text-xl font-semibold text-muted-foreground">Inputs</h3>
            <div className="grid max-w-md gap-4">
              <div className="space-y-2">
                <Label htmlFor="default">Default Input</Label>
                <Input id="default" placeholder="Enter text..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="disabled">Disabled Input</Label>
                <Input id="disabled" placeholder="Disabled" disabled />
              </div>
            </div>
          </div>

          {/* Cards */}
          <div>
            <h3 className="mb-4 text-xl font-semibold text-muted-foreground">Cards</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Card Title</CardTitle>
                  <CardDescription>Card description goes here</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>This is the card content area where you can put any content.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Another Card</CardTitle>
                  <CardDescription>With different content</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Action Button</Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Animation Section */}
        <section>
          <h2 className="mb-8 text-3xl font-bold">Animation Tokens</h2>

          <div className="rounded-lg border border-border p-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="mb-3 font-semibold">Durations</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><code className="rounded bg-muted px-2 py-1">--duration-fast</code> 150ms</li>
                  <li><code className="rounded bg-muted px-2 py-1">--duration-normal</code> 200ms</li>
                  <li><code className="rounded bg-muted px-2 py-1">--duration-slow</code> 300ms</li>
                </ul>
              </div>
              <div>
                <h4 className="mb-3 font-semibold">Easing</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><code className="rounded bg-muted px-2 py-1">--ease-default</code> ease-out</li>
                  <li><code className="rounded bg-muted px-2 py-1">--ease-in</code> ease-in</li>
                  <li><code className="rounded bg-muted px-2 py-1">--ease-out</code> ease-out</li>
                  <li><code className="rounded bg-muted px-2 py-1">--ease-in-out</code> ease-in-out</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Layout Tokens */}
        <section>
          <h2 className="mb-8 text-3xl font-bold">Layout Tokens</h2>

          <div className="rounded-lg border border-border p-6">
            <ul className="grid gap-3 text-sm sm:grid-cols-2">
              <li className="flex justify-between">
                <code className="rounded bg-muted px-2 py-1">--sidebar-width</code>
                <span className="text-muted-foreground">240px</span>
              </li>
              <li className="flex justify-between">
                <code className="rounded bg-muted px-2 py-1">--sidebar-collapsed-width</code>
                <span className="text-muted-foreground">64px</span>
              </li>
              <li className="flex justify-between">
                <code className="rounded bg-muted px-2 py-1">--header-height</code>
                <span className="text-muted-foreground">64px</span>
              </li>
              <li className="flex justify-between">
                <code className="rounded bg-muted px-2 py-1">--content-max-width</code>
                <span className="text-muted-foreground">1280px</span>
              </li>
              <li className="flex justify-between">
                <code className="rounded bg-muted px-2 py-1">--bottom-nav-height</code>
                <span className="text-muted-foreground">64px</span>
              </li>
            </ul>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>Design System for Terp - Toggle theme with the button in the header</p>
      </footer>
    </div>
  )
}

// Helper Components
function ColorSwatch({
  name,
  variable,
  className = '',
  style
}: {
  name: string
  variable: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className="space-y-2">
      <div
        className={`h-20 w-full rounded-lg ${className}`}
        style={style}
      />
      <div>
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{variable}</p>
      </div>
    </div>
  )
}

function TypographySample({ size, label }: { size: string; label: string }) {
  const sizeClasses: Record<string, string> = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
  }

  return (
    <div className="flex items-baseline gap-4">
      <span className="w-32 text-sm text-muted-foreground">{label}</span>
      <span className={sizeClasses[size]}>The quick brown fox jumps over the lazy dog</span>
    </div>
  )
}

function RadiusSample({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`h-20 w-20 border-2 border-primary bg-primary/20 ${className}`} />
      <span className="text-sm text-muted-foreground">radius-{name}</span>
    </div>
  )
}

function ShadowSample({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`h-24 w-24 rounded-lg bg-card ${className}`} />
      <span className="text-sm text-muted-foreground">shadow-{name}</span>
    </div>
  )
}
