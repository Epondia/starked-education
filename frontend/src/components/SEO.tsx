'use client';

import React from 'react';
import { generateCourseJsonLd, generateCredentialJsonLd, type CourseJsonLdInput, type CredentialJsonLdInput } from '@/lib/seo';

/**
 * Renders a JSON-LD structured data script tag for a Course.
 *
 * Usage:
 * ```tsx
 * <CourseJsonLd
 *   name="Blockchain Development 101"
 *   description="Learn the fundamentals of blockchain development on Stellar."
 *   timeRequired="P30D"
 * />
 * ```
 */
export function CourseJsonLd({ data }: { data: CourseJsonLdInput }) {
  const jsonLd = generateCourseJsonLd(data);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * Renders a JSON-LD structured data script tag for an EducationalOccupationalCredential.
 *
 * Usage:
 * ```tsx
 * <CredentialJsonLd
 *   name="Stellar Blockchain Developer"
 *   description="Certified Stellar blockchain developer credential."
 *   dateCreated="2026-07-20"
 * />
 * ```
 */
export function CredentialJsonLd({ data }: { data: CredentialJsonLdInput }) {
  const jsonLd = generateCredentialJsonLd(data);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

/**
 * OrganizationJsonLd - Renders a JSON-LD structured data script for the Organization.
 * Use this once on the homepage or root layout.
 */
export function OrganizationJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'StarkEd Education',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    description: 'Decentralized learning platform powered by Stellar blockchain.',
    sameAs: [
      'https://github.com/Epondia/starked-education',
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
