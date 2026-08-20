import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { isRTL } from './rtl';

const isBrowser = typeof window !== 'undefined';

const NS = ['common', 'navigation', 'courses', 'profile', 'admin', 'errors', 'validation'];
const SUPPORTED_LNGS = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ar', 'he'];

/**
 * Load translation resources from the filesystem (server only).
 * Walks public/locales/{lng}/{ns}.json for all supported languages
 * and returns an i18next-compatible resources object.
 */
function loadServerResources(): Record<string, Record<string, unknown>> {
  try {
    // Dynamic require to avoid bundling fs/path into the client bundle
    const fs = require('fs');
    const path = require('path');
    const resources: Record<string, Record<string, unknown>> = {};

    // In Next.js, process.cwd() points to the project root during SSR
    const localesDir = path.join(process.cwd(), 'public', 'locales');

    for (const lng of SUPPORTED_LNGS) {
      const lngDir = path.join(localesDir, lng);
      if (!fs.existsSync(lngDir)) continue;

      resources[lng] = {};
      for (const ns of NS) {
        const filePath = path.join(lngDir, `${ns}.json`);
        if (fs.existsSync(filePath)) {
          try {
            resources[lng][ns] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          } catch {
            // Skip files that fail to parse
          }
        }
      }
    }

    return resources;
  } catch (err) {
    // Gracefully fall back to empty resources if filesystem access fails.
    // This can happen in edge runtimes where Node built-ins aren't available.
    console.warn(
      '[i18n] Could not load translation resources from filesystem:',
      (err as Error)?.message ?? err
    );
    return {};
  }
}

// ── Shared interpolation & formatting ──────────────────────────────
const interpolation = {
  escapeValue: false,
  format: function (value: any, format: string, lng: string | undefined) {
    if (format === 'uppercase') return String(value).toUpperCase();
    if (format === 'lowercase') return String(value).toLowerCase();
    if (format === 'currency') {
      return new Intl.NumberFormat(lng, {
        style: 'currency',
        currency: 'USD',
      }).format(value);
    }
    if (format === 'date') {
      return new Intl.DateTimeFormat(lng).format(new Date(value));
    }
    if (format === 'datetime') {
      return new Intl.DateTimeFormat(lng, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    }
    if (format === 'relativetime') {
      const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto' });
      const diff = Date.now() - new Date(value).getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      return rtf.format(-days, 'day');
    }
    return value;
  },
};

// ── React integration options ──────────────────────────────────────
const reactOptions = {
  useSuspense: false,
  bindI18n: 'languageChanged',
  bindI18nStore: 'added removed',
  transEmptyNodeValue: '',
  transSupportBasicHtmlNodes: true,
  transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em', 'span'],
};

// ── Init: browser path ─────────────────────────────────────────────
if (isBrowser) {
  const Backend = require('i18next-http-backend');
  const LanguageDetector = require('i18next-browser-languagedetector');

  i18n.use(Backend).use(LanguageDetector).use(initReactI18next).init({
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    interpolation,

    detection: {
      order: ['localStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    preload: SUPPORTED_LNGS,

    ns: NS,
    defaultNS: 'common',
    react: reactOptions,

    pluralSeparator: '_',
    contextSeparator: '_',

    returnEmptyString: false,
    returnNull: false,
    returnObjects: false,

    saveMissing: process.env.NODE_ENV === 'development',
    missingKeyHandler:
      process.env.NODE_ENV === 'development'
        ? (lng: string, ns: string, key: string) => {
            console.warn(
              `Missing translation key: ${key} for language: ${lng} in namespace: ${ns}`
            );
          }
        : undefined,

    load: 'languageOnly',
    simplifyPluralSuffix: true,
  });

  // RTL language detection and document direction setup
  i18n.on('languageChanged', (lng) => {
    const isRTLDirection = isRTL(lng);
    document.documentElement.dir = isRTLDirection ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
    document.body.classList.toggle('rtl', isRTLDirection);
    document.body.classList.toggle('ltr', !isRTLDirection);
    if (isRTLDirection) {
      document.body.style.fontFamily =
        '"Noto Sans Arabic", "Tahoma", "Arial", sans-serif';
    } else {
      document.body.style.fontFamily = '';
    }
  });
} else {
  // ── Init: server path (inline resources from filesystem) ─────────
  i18n.use(initReactI18next).init({
    lng: 'en', // SSR always renders in English; client detects on hydration
    fallbackLng: 'en',
    debug: false, // suppress debug logs during SSR
    interpolation,

    // Inline all translation resources so t() works during SSR
    resources: loadServerResources(),

    ns: NS,
    defaultNS: 'common',
    react: reactOptions,

    pluralSeparator: '_',
    contextSeparator: '_',

    returnEmptyString: false,
    returnNull: false,
    returnObjects: false,

    postProcess: ['defaultValuePostProcessor'],

    load: 'languageOnly',
    simplifyPluralSuffix: true,
  });
}

export default i18n;
