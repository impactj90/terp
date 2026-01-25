import type { Meta, StoryObj } from '@storybook/nextjs-vite'

const ColorSwatch = ({ name, className }: { name: string; className: string }) => (
  <div className="flex items-center gap-4">
    <div className={`size-12 rounded-lg border ${className}`} />
    <div>
      <p className="font-medium">{name}</p>
      <p className="text-sm text-muted-foreground">{className}</p>
    </div>
  </div>
)

const ColorPalette = () => (
  <div className="space-y-8 p-4">
    <section>
      <h2 className="text-lg font-semibold mb-4">Primary Colors</h2>
      <div className="grid grid-cols-2 gap-4">
        <ColorSwatch name="Primary" className="bg-primary" />
        <ColorSwatch name="Primary Foreground" className="bg-primary-foreground" />
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Semantic Colors</h2>
      <div className="grid grid-cols-2 gap-4">
        <ColorSwatch name="Success" className="bg-success" />
        <ColorSwatch name="Warning" className="bg-warning" />
        <ColorSwatch name="Error" className="bg-error" />
        <ColorSwatch name="Info" className="bg-info" />
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Neutral Colors</h2>
      <div className="grid grid-cols-2 gap-4">
        <ColorSwatch name="Background" className="bg-background" />
        <ColorSwatch name="Foreground" className="bg-foreground" />
        <ColorSwatch name="Card" className="bg-card" />
        <ColorSwatch name="Muted" className="bg-muted" />
        <ColorSwatch name="Border" className="bg-border" />
        <ColorSwatch name="Input" className="bg-input" />
      </div>
    </section>
  </div>
)

const meta: Meta = {
  title: 'Design System/Colors',
  component: ColorPalette,
}

export default meta

type Story = StoryObj

export const Default: Story = {}
