# Terp Web Frontend

Next.js 16 frontend for Terp time tracking system.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 (CSS-first configuration)
- **Components**: Shadcn/ui
- **Font**: Inter via next/font

## Development

```bash
# Install dependencies
pnpm install

# Start development server (with Turbopack)
pnpm run dev

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run format
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL` | Backend API URL (server-side) | `http://localhost:8080/api/v1` |
| `NEXT_PUBLIC_API_URL` | Backend API URL (client-side) | `http://localhost:8080/api/v1` |
| `NEXT_PUBLIC_APP_NAME` | Application name | `Terp` |

## Project Structure

```
src/
  app/              # Next.js App Router pages
  components/
    ui/             # Shadcn/ui components
    layout/         # Layout components
    forms/          # Form components
  hooks/            # Custom React hooks
  lib/              # Utility functions
  types/            # TypeScript type definitions
  config/           # Configuration modules
```

## Adding Shadcn Components

```bash
pnpm dlx shadcn@latest add [component-name]
```

Example:
```bash
pnpm dlx shadcn@latest add card dialog input
```

## Building for Production

```bash
pnpm run build
pnpm run start
```
