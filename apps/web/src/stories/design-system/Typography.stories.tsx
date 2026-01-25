import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const Typography = () => (
  <div className="space-y-8 p-4">
    <section>
      <h2 className="text-lg font-semibold mb-4">Font Sizes</h2>
      <div className="space-y-4">
        <p className="text-xs">text-xs (12px) - Extra small text</p>
        <p className="text-sm">text-sm (14px) - Small text</p>
        <p className="text-base">text-base (16px) - Base text</p>
        <p className="text-lg">text-lg (18px) - Large text</p>
        <p className="text-xl">text-xl (20px) - Extra large text</p>
        <p className="text-2xl">text-2xl (24px) - 2X large text</p>
        <p className="text-3xl">text-3xl (30px) - 3X large text</p>
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Font Weights</h2>
      <div className="space-y-2 text-lg">
        <p className="font-normal">font-normal (400) - Regular weight</p>
        <p className="font-medium">font-medium (500) - Medium weight</p>
        <p className="font-semibold">font-semibold (600) - Semibold weight</p>
        <p className="font-bold">font-bold (700) - Bold weight</p>
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Text Colors</h2>
      <div className="space-y-2">
        <p className="text-foreground">text-foreground - Primary text</p>
        <p className="text-muted-foreground">text-muted-foreground - Secondary text</p>
        <p className="text-primary">text-primary - Primary color</p>
        <p className="text-destructive">text-destructive - Destructive/error</p>
      </div>
    </section>
  </div>
)

const meta: Meta = {
  title: 'Design System/Typography',
  component: Typography,
}

export default meta

type Story = StoryObj

export const Default: Story = {}
