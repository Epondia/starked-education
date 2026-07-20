/**
 * SEO utility functions for generating Next.js Metadata objects,
 * Open Graph tags, Twitter Cards, and JSON-LD structured data.
 *
 * Usage in App Router pages/layouts:
 *   import { createMetadata } from '@/lib/seo';
 *   export const metadata = createMetadata({ title: 'Courses', description: '...' });
 *
 * Usage for JSON-LD in components:
 *   import { CourseJsonLd, CredentialJsonLd } from '@/components/SEO';
 */

import type { Metadata } from 'next';

const SITE_NAME = 'StarkEd Education';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const DEFAULT_DESCRIPTION = 'Learn blockchain development with courses powered by Stellar';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface SEOMetadataInput {
  /** Page title (appended with site name by default) */
  title: string;
  /** Meta description */
  description?: string;
  /** Canonical URL override */
  canonical?: string;
  /** Open Graph image URL override */
  ogImage?: string;
  /** Whether to use the title as-is without appending site name */
  absolute?: boolean;
  /** Keywords for the page */
  keywords?: string[];
  /** Open Graph type */
  ogType?: 'website' | 'article' | 'course' | 'profile';
  /** Whether to noindex the page */
  noIndex?: boolean;
  /** Twitter card type */
  twitterCard?: 'summary' | 'summary_large_image';
}

/**
 * Creates a Next.js Metadata object with proper SEO, Open Graph, and Twitter Card tags.
 *
 * @example
 * export const metadata = createMetadata({
 *   title: 'Courses',
 *   description: 'Browse our catalog of blockchain development courses.',
 *   keywords: ['blockchain', 'stellar', 'education'],
 * });
 */
export function createMetadata(input: SEOMetadataInput): Metadata {
  const {
    title,
    description = DEFAULT_DESCRIPTION,
    canonical,
    ogImage = DEFAULT_OG_IMAGE,
    absolute = false,
    keywords = [],
    ogType = 'website',
    noIndex = false,
    twitterCard = 'summary_large_image',
  } = input;

  const fullTitle = absolute ? title : `${title} - ${SITE_NAME}`;
  const url = canonical || SITE_URL;

  return {
    title: fullTitle,
    description,
    keywords: keywords.length > 0 ? keywords : undefined,

    // Open Graph
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
      type: ogType,
      locale: 'en_US',
    },

    // Twitter Card
    twitter: {
      card: twitterCard,
      title: fullTitle,
      description,
      images: [ogImage],
    },

    // Canonical URL
    alternates: {
      canonical: url,
    },

    // Robots
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },

    // Additional metadata
    metadataBase: new URL(SITE_URL),
  };
}

/**
 * Generates a default metadata object with site-wide defaults.
 * Use this as a fallback in layouts.
 */
export function createDefaultMetadata(overrides?: Partial<SEOMetadataInput>): Metadata {
  return createMetadata({
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    absolute: true,
    ...overrides,
  });
}

/**
 * Course structured data for JSON-LD.
 */
export interface CourseJsonLdInput {
  name: string;
  description: string;
  providerName?: string;
  providerUrl?: string;
  url?: string;
  image?: string;
  language?: string;
  educationalLevel?: string;
  timeRequired?: string;
}

export function generateCourseJsonLd(input: CourseJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: input.name,
    description: input.description,
    provider: {
      '@type': 'Organization',
      name: input.providerName || SITE_NAME,
      sameAs: input.providerUrl || SITE_URL,
    },
    url: input.url || SITE_URL,
    image: input.image || DEFAULT_OG_IMAGE,
    inLanguage: input.language || 'en',
    educationalLevel: input.educationalLevel,
    timeRequired: input.timeRequired,
  };
}

/**
 * Credential/EducationalOccupationalCredential structured data for JSON-LD.
 */
export interface CredentialJsonLdInput {
  name: string;
  description: string;
  issuerName?: string;
  issuerUrl?: string;
  url?: string;
  dateCreated?: string;
  validThrough?: string;
}

export function generateCredentialJsonLd(input: CredentialJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalCredential',
    name: input.name,
    description: input.description,
    credentialCategory: 'Certificate',
    recognizedBy: {
      '@type': 'Organization',
      name: input.issuerName || SITE_NAME,
      sameAs: input.issuerUrl || SITE_URL,
    },
    url: input.url || SITE_URL,
    dateCreated: input.dateCreated,
    validThrough: input.validThrough,
  };
}
