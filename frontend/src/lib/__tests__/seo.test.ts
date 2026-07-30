/**
 * Tests for SEO utility functions.
 *
 * Covers:
 *  - createMetadata generates correct Next.js Metadata
 *  - Title formatting (with and without site name)
 *  - Open Graph tag generation
 *  - Twitter Card tag generation
 *  - Canonical URL generation
 *  - Robots directives (index vs noindex)
 *  - JSON-LD generators for Course and Credential
 *  - Default metadata fallback
 */

import { createMetadata, createDefaultMetadata, generateCourseJsonLd, generateCredentialJsonLd } from '@/lib/seo';

// ─── createMetadata ─────────────────────────────────────────────────

describe('createMetadata', () => {
  it('generates metadata with title appended with site name', () => {
    const meta = createMetadata({ title: 'Courses' });

    expect(meta.title).toBe('Courses - StarkEd Education');
  });

  it('uses absolute title when absolute=true', () => {
    const meta = createMetadata({ title: 'StarkEd Education', absolute: true });

    expect(meta.title).toBe('StarkEd Education');
  });

  it('uses default description when not provided', () => {
    const meta = createMetadata({ title: 'Test' });

    expect(meta.description).toBeTruthy();
    expect(meta.description).toContain('blockchain');
  });

  it('uses provided description', () => {
    const meta = createMetadata({
      title: 'Test',
      description: 'Custom description',
    });

    expect(meta.description).toBe('Custom description');
  });

  it('includes keywords when provided', () => {
    const meta = createMetadata({
      title: 'Test',
      keywords: ['stellar', 'blockchain', 'education'],
    });

    expect(meta.keywords).toEqual(['stellar', 'blockchain', 'education']);
  });

  it('omits keywords when empty', () => {
    const meta = createMetadata({ title: 'Test' });

    expect(meta.keywords).toBeUndefined();
  });

  // ── Open Graph ───────────────────────────────────────────────────

  describe('Open Graph', () => {
    it('generates Open Graph metadata', () => {
      const meta = createMetadata({ title: 'Courses' });

      expect(meta.openGraph).toBeDefined();
      expect(meta.openGraph?.title).toBe('Courses - StarkEd Education');
      expect(meta.openGraph?.description).toBeTruthy();
      expect(meta.openGraph?.siteName).toBe('StarkEd Education');
      expect(meta.openGraph?.type).toBe('website');
    });

    it('includes Open Graph image', () => {
      const meta = createMetadata({ title: 'Test' });

      expect(meta.openGraph?.images).toBeDefined();
      expect(meta.openGraph?.images).toHaveLength(1);
      if (meta.openGraph?.images && Array.isArray(meta.openGraph.images)) {
        expect(meta.openGraph.images[0]).toHaveProperty('url');
        expect(meta.openGraph.images[0]).toHaveProperty('width', 1200);
        expect(meta.openGraph.images[0]).toHaveProperty('height', 630);
      }
    });

    it('uses custom Open Graph image when provided', () => {
      const meta = createMetadata({
        title: 'Test',
        ogImage: 'https://example.com/custom-image.png',
      });

      if (meta.openGraph?.images && Array.isArray(meta.openGraph.images)) {
        expect(meta.openGraph.images[0].url).toBe(
          'https://example.com/custom-image.png'
        );
      }
    });

    it('handles custom OG type', () => {
      const meta = createMetadata({ title: 'Test', ogType: 'article' });

      expect(meta.openGraph?.type).toBe('article');
    });
  });

  // ── Twitter Card ─────────────────────────────────────────────────

  describe('Twitter Card', () => {
    it('generates Twitter Card metadata', () => {
      const meta = createMetadata({ title: 'Test' });

      expect(meta.twitter).toBeDefined();
      expect(meta.twitter?.card).toBe('summary_large_image');
      expect(meta.twitter?.title).toBe('Test - StarkEd Education');
      expect(meta.twitter?.description).toBeTruthy();
    });

    it('supports custom Twitter card type', () => {
      const meta = createMetadata({
        title: 'Test',
        twitterCard: 'summary',
      });

      expect(meta.twitter?.card).toBe('summary');
    });
  });

  // ── Canonical URL ────────────────────────────────────────────────

  describe('canonical URL', () => {
    it('sets canonical URL in alternates', () => {
      const meta = createMetadata({ title: 'Test' });

      expect(meta.alternates?.canonical).toBeDefined();
    });

    it('uses custom canonical when provided', () => {
      const meta = createMetadata({
        title: 'Test',
        canonical: 'https://example.com/custom',
      });

      expect(meta.alternates?.canonical).toBe('https://example.com/custom');
    });
  });

  // ── Robots ───────────────────────────────────────────────────────

  describe('robots directives', () => {
    it('sets index/follow by default', () => {
      const meta = createMetadata({ title: 'Test' });

      expect(meta.robots).toEqual({ index: true, follow: true });
    });

    it('sets noindex when noIndex=true', () => {
      const meta = createMetadata({ title: 'Test', noIndex: true });

      expect(meta.robots).toEqual({ index: false, follow: false });
    });
  });
});

// ─── createDefaultMetadata ──────────────────────────────────────────

describe('createDefaultMetadata', () => {
  it('returns metadata with site name as title', () => {
    const meta = createDefaultMetadata();

    expect(meta.title).toBe('StarkEd Education');
  });

  it('accepts overrides', () => {
    const meta = createDefaultMetadata({
      title: 'Custom Title',
      description: 'Custom desc',
    });

    expect(meta.title).toBe('Custom Title');
    expect(meta.description).toBe('Custom desc');
  });
});

// ─── generateCourseJsonLd ───────────────────────────────────────────

describe('generateCourseJsonLd', () => {
  it('generates Course JSON-LD with required fields', () => {
    const result = generateCourseJsonLd({
      name: 'Blockchain 101',
      description: 'Intro to blockchain',
    });

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('Course');
    expect(result.name).toBe('Blockchain 101');
    expect(result.description).toBe('Intro to blockchain');
  });

  it('includes provider info', () => {
    const result = generateCourseJsonLd({
      name: 'Course',
      description: 'Desc',
    });

    expect(result.provider).toBeDefined();
    expect(result.provider['@type']).toBe('Organization');
  });

  it('uses custom provider when provided', () => {
    const result = generateCourseJsonLd({
      name: 'Course',
      description: 'Desc',
      providerName: 'Custom Provider',
      providerUrl: 'https://custom.example.com',
    });

    expect(result.provider.name).toBe('Custom Provider');
    expect(result.provider.sameAs).toBe('https://custom.example.com');
  });

  it('includes optional fields when provided', () => {
    const result = generateCourseJsonLd({
      name: 'Course',
      description: 'Desc',
      language: 'fr',
      educationalLevel: 'Beginner',
      timeRequired: 'P30D',
    });

    expect(result.inLanguage).toBe('fr');
    expect(result.educationalLevel).toBe('Beginner');
    expect(result.timeRequired).toBe('P30D');
  });

  it('does not include undefined optional fields', () => {
    const result = generateCourseJsonLd({
      name: 'Course',
      description: 'Desc',
    });

    expect('educationalLevel' in result).toBe(true);
    expect(result.educationalLevel).toBeUndefined();
  });
});

// ─── generateCredentialJsonLd ───────────────────────────────────────

describe('generateCredentialJsonLd', () => {
  it('generates EducationalOccupationalCredential JSON-LD', () => {
    const result = generateCredentialJsonLd({
      name: 'Stellar Developer Certificate',
      description: 'Certified Stellar blockchain developer.',
    });

    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('EducationalOccupationalCredential');
    expect(result.name).toBe('Stellar Developer Certificate');
    expect(result.credentialCategory).toBe('Certificate');
  });

  it('uses custom issuer when provided', () => {
    const result = generateCredentialJsonLd({
      name: 'Certificate',
      description: 'Desc',
      issuerName: 'Custom Issuer',
      issuerUrl: 'https://issuer.example.com',
    });

    expect(result.recognizedBy.name).toBe('Custom Issuer');
    expect(result.recognizedBy.sameAs).toBe('https://issuer.example.com');
  });

  it('includes dates when provided', () => {
    const result = generateCredentialJsonLd({
      name: 'Certificate',
      description: 'Desc',
      dateCreated: '2026-07-20',
      validThrough: '2026-12-31',
    });

    expect(result.dateCreated).toBe('2026-07-20');
    expect(result.validThrough).toBe('2026-12-31');
  });
});
