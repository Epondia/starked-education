import type { Metadata } from 'next';
import Link from 'next/link';
import { createMetadata } from '@/lib/seo';

/**
 * The App Router root route.
 *
 * This file has to exist: `src/pages/index.tsx` (a legacy prototype titled
 * "Temporal Learning Studio") is still present for the Pages Router, and with no
 * `app/page.tsx` Next.js fell back to serving that prototype at `/`. The live
 * deployment therefore advertised an application that had nothing to do with
 * this platform. The App Router owns `/` as soon as this file exists.
 */

export const metadata: Metadata = createMetadata({
  title: 'StarkEd Education - Decentralized Learning Platform',
  description:
    'Earn verifiable, on-chain course credentials secured by Stellar and Soroban smart contracts.',
  keywords: ['blockchain', 'stellar', 'soroban', 'education', 'credentials'],
  absolute: true,
});

const FEATURES = [
  {
    title: 'Verifiable credentials',
    body: 'Every course completion is issued as an on-chain credential you can prove without asking the platform for permission.',
    href: '/profile',
    cta: 'View credentials',
  },
  {
    title: 'Dynamic achievement badges',
    body: 'Achievement NFTs that evolve as you learn — metadata and rarity upgrade in place while your progress is preserved.',
    href: '/campus',
    cta: 'Open campus',
  },
  {
    title: 'Courses and classrooms',
    body: 'Browse the catalog, enrol in a course, and submit work through the same environment your instructor uses.',
    href: '/enroll',
    cta: 'Enrol now',
  },
  {
    title: 'Collaborative study rooms',
    body: 'Study together in real time, with shared editors and synchronised session state.',
    href: '/collaboration',
    cta: 'Join a room',
  },
];

const SHORTCUTS = [
  { href: '/demo', label: 'Interactive demo' },
  { href: '/lab', label: 'Learning lab' },
  { href: '/campus', label: 'Campus' },
  { href: '/performance', label: 'Performance' },
  { href: '/settings', label: 'Settings' },
];

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
      <section className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          Built on Stellar &amp; Soroban
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl dark:text-white">
          Decentralized learning with credentials you actually own
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-gray-600 dark:text-gray-300">
          StarkEd issues course credentials as Soroban smart contracts, so a
          qualification keeps working after you leave the platform. Learn, prove
          what you learned, and carry it with you.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/enroll"
            className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Start a course
          </Link>
          <Link
            href="/demo"
            className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-slate-600 dark:text-gray-100 dark:hover:bg-slate-800"
          >
            See how it works
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-6 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {feature.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {feature.body}
            </p>
            <Link
              href={feature.href}
              className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              {feature.cta} &rarr;
            </Link>
          </div>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Jump to
        </h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.href}>
              <Link
                href={shortcut.href}
                className="inline-block rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700 transition hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:text-gray-200 dark:hover:text-blue-400"
              >
                {shortcut.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
