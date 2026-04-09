import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: "standalone",
  // Next.js 16 blocks HMR requests that cross origins by default. When a user
  // is redirected from Supabase's verify endpoint (127.0.0.1:54321) to our
  // dev server (127.0.0.1:3001), the HMR WebSocket picks up the wrong origin
  // and gets blocked with a noisy warning. Allowing 127.0.0.1 for dev silences
  // it without affecting production builds.
  allowedDevOrigins: ['127.0.0.1'],
  typescript: {
    // next-intl Translator type causes false-positive TS2322 in React 19 JSX children inference.
    // Real type checking is enforced via `pnpm typecheck`.
    ignoreBuildErrors: true,
  },
}

export default withNextIntl(nextConfig)
