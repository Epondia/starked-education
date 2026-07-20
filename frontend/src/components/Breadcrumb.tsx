'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbOverrides {
  [segment: string]: BreadcrumbItem;
}

interface BreadcrumbDisplayItem {
  label: string;
  href: string;
  isEllipsis: boolean;
}

export interface BreadcrumbProps {
  /** Custom overrides for specific path segments */
  overrides?: BreadcrumbOverrides;
  /** Additional CSS classes for the wrapper */
  className?: string;
  /** Whether to truncate middle items on mobile (default: true) */
  truncateMobile?: boolean;
  /** Custom home label (default: 'Home') */
  homeLabel?: string;
}

/**
 * Converts a URL path segment into a human-readable label.
 * - Replaces hyphens with spaces
 * - Capitalizes each word
 * - Handles dynamic segments (e.g., [id] → 'Details')
 */
function segmentToLabel(segment: string): string {
  const clean = segment.replace(/^\[|\]$/g, '');
  return clean
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generates a schema.org BreadcrumbList JSON-LD object.
 */
function generateBreadcrumbSchema(
  items: { name: string; url: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Breadcrumb component with auto-generation from the current route.
 *
 * Features:
 * - Auto-generates breadcrumbs from the current pathname
 * - Supports custom overrides per path segment
 * - Includes schema.org BreadcrumbList structured data (JSON-LD) for SEO
 * - Responsive truncation: collapses middle items on small screens
 * - Home icon as first breadcrumb item
 * - Keyboard accessible and screen-reader friendly
 */
export function Breadcrumb({
  overrides = {},
  className,
  truncateMobile = true,
  homeLabel = 'Home',
}: BreadcrumbProps) {
  const pathname = usePathname();

  const { displayItems, schemaData } = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);

    const items: { label: string; href: string }[] = [
      { label: homeLabel, href: '/' },
    ];

    let accumulatedPath = '';

    for (const segment of segments) {
      accumulatedPath += `/${segment}`;

      if (overrides[segment]) {
        const override = overrides[segment];
        items.push({
          label: override.label,
          href: override.href !== undefined ? override.href : accumulatedPath,
        });
      } else {
        items.push({
          label: segmentToLabel(segment),
          href: accumulatedPath,
        });
      }
    }

    // Build display items with optional truncation
    const total = items.length;
    let display: BreadcrumbDisplayItem[];

    if (truncateMobile && total > 3) {
      display = [
        { ...items[0], isEllipsis: false },
        { label: '…', href: '', isEllipsis: true },
        ...items.slice(-1).map((item) => ({ ...item, isEllipsis: false })),
      ];
    } else {
      display = items.map((item) => ({ ...item, isEllipsis: false }));
    }

    const schema = generateBreadcrumbSchema(
      items.map((item) => ({
        name: item.label,
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}${item.href}`,
      }))
    );

    return { displayItems: display, schemaData: schema };
  }, [pathname, overrides, homeLabel, truncateMobile]);

  if (displayItems.length <= 1) {
    return null;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
      />

      <nav
        aria-label="Breadcrumb"
        className={cn('flex items-center overflow-hidden', className)}
      >
        <ol
          className={cn(
            'flex items-center flex-wrap gap-y-1 text-sm',
            'text-muted-foreground'
          )}
        >
          {displayItems.map((item, index) => {
            const isLast = index === displayItems.length - 1;
            const isFirst = index === 0;

            // Ellipsis item — visual only, not a link
            if (item.isEllipsis) {
              return (
                <li
                  key="ellipsis"
                  className="hidden sm:flex items-center"
                  aria-hidden="true"
                >
                  <span className="px-1 text-muted-foreground/60">…</span>
                  <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40 mx-1 sm:mx-2" />
                </li>
              );
            }

            return (
              <li
                key={item.href || item.label}
                className="flex items-center min-w-0"
              >
                {!isLast ? (
                  <>
                    <Link
                      href={item.href || '/'}
                      className={cn(
                        'truncate max-w-[160px] sm:max-w-[200px]',
                        'hover:text-foreground transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm',
                        isFirst && 'flex items-center gap-1'
                      )}
                    >
                      {isFirst && (
                        <Home className="h-3.5 w-3.5 flex-shrink-0" />
                      )}
                      <span className={cn(isFirst && 'hidden sm:inline')}>
                        {item.label}
                      </span>
                    </Link>
                    <ChevronRight
                      className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40 mx-1 sm:mx-2"
                      aria-hidden="true"
                    />
                  </>
                ) : (
                  <span
                    className="truncate max-w-[200px] font-medium text-foreground"
                    aria-current="page"
                  >
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

export default Breadcrumb;
