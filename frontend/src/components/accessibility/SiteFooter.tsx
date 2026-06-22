/**
 * Global site footer rendered inside `app/layout.tsx` next to the canonical
 * `<main id="main-content">` landmark. It exists so that every App-Router page
 * exposes a `contentinfo` landmark — one of the definition-of-done items from
 * GitHub issue #70 ("Achieve WCAG 2.1 AA accessibility compliance").
 *
 * Notes for future contributors:
 *   - This footer is intentionally minimal. Pages that need richer contentinfo
 *     (admin legal copy, learner-facing help centre, etc.) should mount their
 *     own scoped `<footer role="contentinfo">` inside that page's section so it
 *     sits *inside* the page's main landmark rather than competing at the page
 *     root.
 *   - Keep the wrapping element a `<footer>` element. The implicit `role` is
 *     `contentinfo` and that is what assistive technology consumes.
 */
import Link from 'next/link';

const SiteFooter = () => {
  const year = new Date().getFullYear();
  return (
    <footer
      className="border-t border-slate-200 bg-white py-8 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
      data-testid="site-footer"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6">
        <p>
          <span aria-label="Copyright">©</span> {year} StarkEd Education. Multi-chain
          learning, accessible by design.
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link
                href="/accessibility"
                className="rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Accessibility statement
              </Link>
            </li>
            <li>
              <Link
                href="/privacy"
                className="rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                className="rounded underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                Contact
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
};

export default SiteFooter;
