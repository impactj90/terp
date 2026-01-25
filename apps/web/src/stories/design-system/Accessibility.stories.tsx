import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const ContrastRatioDisplay = ({ bg, fg, label }: { bg: string; fg: string; label: string }) => (
  <div className={`p-4 rounded-lg ${bg}`}>
    <p className={`${fg} font-medium`}>{label}</p>
    <p className={`${fg} text-sm opacity-80`}>Sample text for contrast verification</p>
  </div>
)

const AccessibilityDemo = () => (
  <div className="space-y-8 p-4 max-w-2xl">
    <section>
      <h2 className="text-lg font-semibold mb-4">Color Contrast (WCAG 2.1 AA)</h2>
      <p className="text-muted-foreground mb-4">
        All text must have a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text.
      </p>
      <div className="space-y-4">
        <ContrastRatioDisplay
          bg="bg-background"
          fg="text-foreground"
          label="Background / Foreground"
        />
        <ContrastRatioDisplay
          bg="bg-card"
          fg="text-card-foreground"
          label="Card / Card Foreground"
        />
        <ContrastRatioDisplay
          bg="bg-primary"
          fg="text-primary-foreground"
          label="Primary / Primary Foreground"
        />
        <ContrastRatioDisplay
          bg="bg-muted"
          fg="text-muted-foreground"
          label="Muted / Muted Foreground"
        />
        <ContrastRatioDisplay
          bg="bg-destructive"
          fg="text-destructive-foreground"
          label="Destructive / Destructive Foreground"
        />
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Focus States</h2>
      <p className="text-muted-foreground mb-4">
        All interactive elements must have visible focus indicators.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button>Focus me (Tab)</Button>
        <Button variant="outline">Outline Button</Button>
        <Input placeholder="Focus this input" className="max-w-xs" />
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Semantic Colors</h2>
      <div className="space-y-4">
        <ContrastRatioDisplay
          bg="bg-success"
          fg="text-success-foreground"
          label="Success State"
        />
        <ContrastRatioDisplay
          bg="bg-warning"
          fg="text-warning-foreground"
          label="Warning State"
        />
        <ContrastRatioDisplay
          bg="bg-error"
          fg="text-error-foreground"
          label="Error State"
        />
        <ContrastRatioDisplay
          bg="bg-info"
          fg="text-info-foreground"
          label="Info State"
        />
      </div>
    </section>
  </div>
)

const meta: Meta = {
  title: 'Design System/Accessibility',
  component: AccessibilityDemo,
}

export default meta

type Story = StoryObj

export const Default: Story = {}
