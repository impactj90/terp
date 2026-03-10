FROM node:22-alpine

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and prisma schema (needed for postinstall prisma generate)
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# Install dependencies (postinstall runs prisma generate)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . ./

# Expose port
EXPOSE 3001

# Start development server
CMD ["pnpm", "dev"]
