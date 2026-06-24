# PR: Global Toast Notification System

<!--
Branch: fix/toast-notification-system
Issue:  #111
-->

## Description

Implements a global toast notification system that provides consistent user action feedback across the platform. Previously, users received no feedback (or inconsistent `alert()` calls) when performing key actions such as enrolling in a course, submitting assignments, processing payments, or uploading content.

The system is built with React context + reducer, rendered into a `document.body` portal, and animated with Framer Motion. It supports four variants, a toast queue with a max of 3 visible at once, auto-dismiss, manual close, action buttons, and full keyboard/screen reader accessibility.

## Related Issue

Closes #111

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [x] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that changes existing behavior)
- [ ] 📚 Documentation update
- [ ] ♻️ Refactor (no functional change)
- [x] 🧪 Tests
- [ ] 🔧 Chore / tooling

## Packages Affected

- [ ] `contracts/` (Soroban / Rust)
- [ ] `backend/` (Node / Express)
- [x] `frontend/` (Next.js)
- [ ] `docs/`

---

## What Was Built

### New Files

| File                                         | Purpose                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/components/ui/toast.tsx`                | Core system: `ToastProvider`, context, reducer, `ToastContainer` (portal), `ToastItem` |
| `src/hooks/useToast.ts`                      | Thin re-export — `import { useToast } from '@/hooks/useToast'`                         |
| `src/components/ui/__tests__/toast.test.tsx` | 18 unit tests covering all behaviours                                                  |

### Modified Files

| File                                      | Change                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/app/layout.tsx`                      | Wrap app tree in `<ToastProvider>`                                                               |
| `src/components/EnrollmentForm.tsx`       | Success and error toasts on enrollment                                                           |
| `src/components/AssignmentSubmission.tsx` | Replace `react-hot-toast` with `useToast`; "View submission" action button                       |
| `src/components/PaymentProcessor.tsx`     | "Payment failed: [reason]" error with "Try again" action; success with "View transaction" action |
| `src/components/ContentUploader.tsx`      | Upload success/failure toasts with "View on IPFS" action                                         |
| `src/app/settings/notifications/page.tsx` | Replace `alert()` calls with toasts; confirm preference saves                                    |

---

## Feature Highlights

### Toast variants

Four variants with distinct colour coding and icons:

| Variant   | Left border + icon | Use case                                                    |
| --------- | ------------------ | ----------------------------------------------------------- |
| `success` | Green              | Enrollment confirmed, assignment submitted, upload complete |
| `error`   | Red                | Payment failed, upload failed, enrollment error             |
| `warning` | Amber              | Late submission notice, validation warnings                 |
| `info`    | Blue               | General informational messages                              |

### Queue system

- Max **3 toasts** visible at once
- Additional toasts enter a FIFO queue and are promoted automatically when a visible slot opens
- Implemented via a single `useReducer` — no external state library needed

### Auto-dismiss & manual close

- Default **5 seconds** auto-dismiss (configurable per toast via `duration` option)
- `duration: 0` disables auto-dismiss for persistent toasts
- Manual close via the **× button**
- **Escape key** dismisses the focused toast

### Action buttons

Toasts can carry an optional action button rendered inline:

```tsx
toast.error('Payment failed: Insufficient balance', {
  action: { label: 'Try again', onClick: retryPayment },
});

toast.success('Assignment submitted successfully!', {
  action: { label: 'View submission', onClick: () => { ... } },
});
```

Clicking the action fires the callback **and** auto-dismisses the toast.

### Animations

Enter/exit transitions use `framer-motion` (`motion.div` + `AnimatePresence`), which is already a project dependency — no new packages added. Toasts slide up and fade in, then fade and scale out on dismiss.

### Accessibility

- `role="alert"` + `aria-atomic="true"` on every toast item
- `aria-live="polite"` on the container region — screen readers announce content on appearance
- `tabIndex={0}` on each toast so keyboard users can focus and Escape-dismiss
- Close button has `aria-label="Dismiss notification"`
- Icons carry `aria-hidden="true"` to avoid redundant announcements

### Dark mode

All colour classes include `dark:` variants so toasts render correctly in dark and high-contrast themes.

### API

```tsx
// Anywhere inside ToastProvider
const toast = useToast();

toast.success('Enrolled in Stellar Basics');
toast.error('Payment failed: card declined', {
  action: { label: 'Try again', onClick: retry },
});
toast.warning('Submission is late', { duration: 8000 });
toast.info('Changes saved automatically', { title: 'Auto-save' });

// Full options
toast.addToast('Custom message', {
  variant: 'success', // 'success' | 'error' | 'warning' | 'info'
  title: 'Optional title',
  duration: 5000, // ms; 0 = never auto-dismiss
  action: { label: 'Undo', onClick: undoFn },
});
```

---

## How Has This Been Tested?

### Unit tests — `src/components/ui/__tests__/toast.test.tsx`

Run with:

```bash
cd frontend
npx jest --testPathPattern="toast.test" --no-coverage
```

All **18 tests pass**:

| Suite             | Tests                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Toast variants    | Renders all 4 variants, title, `role="alert"`, `aria-live`                                  |
| Auto-dismiss      | Removed after 5 s, not removed at 4.999 s, `duration=0` persists, custom duration respected |
| Manual close      | Close button dismisses, Escape key dismisses                                                |
| Queue management  | Max 3 visible, 4th queued, promoted on dismissal                                            |
| Action button     | Callback fires + toast dismissed, label visible                                             |
| `useToastContext` | Throws outside provider                                                                     |

Framer Motion is mocked in tests so `AnimatePresence` does not hold exiting elements in the JSDOM tree.

### Manual smoke test (local dev)

1. `cd frontend && npm run dev`
2. Navigate to `/enroll` — complete enrollment → green "Successfully enrolled in [course]" toast appears and auto-dismisses after 5 s
3. Trigger a payment failure → red "Payment failed: [reason]" toast with "Try again" button appears
4. Submit an assignment → green toast with "View submission" action
5. Upload a file in ContentUploader → success/failure toast fires
6. Toggle a notification preference in Settings → "Notification preferences saved" toast fires
7. Fire 5 rapid actions → confirm only 3 toasts visible, others queue and promote
8. Press Escape on a focused toast → dismisses

---

## Checklist

- [x] My code follows the project's coding standards (see CONTRIBUTING.md)
- [x] I have run the relevant linters and type checks
- [x] I have added or updated tests that prove my change works
- [x] All new and existing tests pass locally
- [x] I have updated documentation where needed
- [x] My commits follow the Conventional Commits format
- [x] I have noted any breaking changes below (or there are none)

## Breaking Changes

None. `react-hot-toast` is still installed and referenced in `AssignmentSubmission.tsx` only via `useToast` now — no other files imported it directly. Existing behaviour is preserved; feedback is additive.

## Additional Notes

- No new `npm` dependencies were introduced. `framer-motion` and `lucide-react` are already in `package.json`.
- `react-hot-toast` remains in `package.json` but is no longer called directly in any component after this PR. It can be removed in a follow-up cleanup task.
- The `ToastProvider` is mounted at the root layout level so it is available in every route, including parallel routes and modal interceptors.
- The portal targets `document.body` to guarantee the toast container is always above all other stacking contexts (modals, drawers, etc.).
