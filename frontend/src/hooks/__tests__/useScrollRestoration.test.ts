import { renderHook, act } from '@testing-library/react';
import { useScrollRestoration } from '../useScrollRestoration';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(() => '/courses'),
}));

const STORAGE_KEY = 'scroll_positions';

function makeContainer(scrollTop = 0) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  return el;
}

function readPositions(): Record<string, number> {
  return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
}

describe('useScrollRestoration', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('saves the scroll position on scroll events', () => {
    const { result } = renderHook(() => useScrollRestoration({ key: '/courses' }));
    const el = makeContainer(120);

    act(() => {
      result.current.containerRef(el);
    });
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });

    expect(readPositions()).toEqual({ '/courses': 120 });
  });

  it('restores a saved position when the container is attached', async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ '/courses': 250 }));
    const { result } = renderHook(() => useScrollRestoration({ key: '/courses' }));
    const el = makeContainer(0);

    act(() => {
      result.current.containerRef(el);
    });

    // Restoration is deferred to the next animation frame so the list has
    // a chance to render first.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(el.scrollTop).toBe(250);
  });

  it('does not restore when nothing was saved', async () => {
    const { result } = renderHook(() => useScrollRestoration({ key: '/courses' }));
    const el = makeContainer(0);

    act(() => {
      result.current.containerRef(el);
    });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(el.scrollTop).toBe(0);
  });

  it('clearPosition removes the stored position', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ '/courses': 250 }));
    const { result } = renderHook(() => useScrollRestoration({ key: '/courses' }));

    act(() => {
      result.current.clearPosition();
    });

    expect(readPositions()).toEqual({});
  });

  it('does nothing when disabled', () => {
    const { result } = renderHook(() =>
      useScrollRestoration({ key: '/courses', disabled: true }),
    );
    const el = makeContainer(90);

    act(() => {
      result.current.containerRef(el);
    });
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      result.current.savePosition();
    });
    act(() => {
      result.current.clearPosition();
    });

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('saves the current position when manually invoked', () => {
    const { result } = renderHook(() => useScrollRestoration({ key: '/courses' }));
    const el = makeContainer(320);

    act(() => {
      result.current.containerRef(el);
    });
    act(() => {
      result.current.savePosition();
    });

    expect(readPositions()).toEqual({ '/courses': 320 });
  });
});
