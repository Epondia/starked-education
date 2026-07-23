/** @type {import('next-i18next').UserConfig} */
module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ar'],
    localeDetection: true,
  },
  localePath: './public/locales',
  reloadOnPrerender: process.env.NODE_ENV === 'development',
  ns: ['common', 'navigation', 'courses', 'profile', 'admin', 'errors', 'validation'],
  defaultNS: 'common',
  fallbackLng: 'en',
  debug: process.env.NODE_ENV === 'development',
  saveMissing: process.env.NODE_ENV === 'development',
  serializeConfig: false,
  react: {
    useSuspense: false,
  },
  interpolation: {
    escapeValue: false,
  },
};
