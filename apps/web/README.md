# Terp Web Frontend

Next.js frontend for Terp (placeholder).

## Setup

When ready to implement the frontend:

```bash
# Create Next.js app
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir

# Install additional dependencies
npm install @tanstack/react-query
npm install -D openapi-typescript
```

## Development

```bash
npm run dev
```

## Type Generation

Generate TypeScript types from the API:

```bash
npm run generate:types
```

## Tech Stack (Planned)

- Next.js 16+ with App Router
- TypeScript
- Tailwind CSS v4
- Shadcn/ui components
- React Query for data fetching
- openapi-typescript for API types
