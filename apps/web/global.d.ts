import { routing } from './src/i18n/routing';
import messages from './messages/de.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
