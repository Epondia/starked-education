/**
 * Global site header rendered inside `app/layout.tsx` so that every App-Router
 * page exposes a `banner` landmark. This satisfies the definition-of-done
 * item from GitHub issue #70: "ARIA landmarks on all pages (main, nav, banner,
 * contentinfo)".
 *
 * Sister component of `SiteFooter.tsx`. Pages that need richer navigation may
 * render their own scoped `<header>` inside that page's section; doing so
 * inside the main landmark keeps axe-core happy because only the top-level
 * (i.e. direct child of <body>) `<header>` carries the implicit `banner` role.
 *
 * Implementation notes:
 *   - The outermost element is a real `<header>` so assistive technology assigns
 *     it the implicit `banner` role when it is a direct child of `<body>`.
 *   - We deliberately re-state `role="banner"` for older parsers that don't
 *     pick up the implicit role inside rich layout structures.
 *   - The brand link is the first focusable element after the parent's skip
 *     link, so all users have a consistent first Tab stop.
 */
import Link from 'next/link';

const SiteHeader = () => {
  return (
    <header
      role="banner"
      aria-label="Site header"
      className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      data-testid="site-header"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="rounded text-base font-semibold text-slate-900 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-white"
        >
          StarkEd Education
        </Link>
        <nav aria-label="Primary">
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <li>
              <Link
                href="/courses"
                className="rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Courses
              </Link>
            </li>
            <li>
              <Link
                href="/discovery"
                className="rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Discovery
              </Link>
            </li>
            <li>
              <Link
                href="/profile"
                className="rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Profile
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default SiteHeader;
