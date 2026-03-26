import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // next-intl Translator type causes false-positive TS2322 in React 19 JSX children inference.
    // Real type checking is enforced via `pnpm typecheck`.
    ignoreBuildErrors: true,
  },
}

export default withNextIntl(nextConfig)
