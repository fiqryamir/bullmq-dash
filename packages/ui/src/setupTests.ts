import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom performs no layout, so every element reports zero offset sizes. The
// virtualized job table and the command palette measure their scroll
// containers through offsetWidth and offsetHeight; give those elements a
// viewport (testid ending in `-scroll`) so virtual rows render in tests.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement) {
    return (this.getAttribute('data-testid') ?? '').endsWith('-scroll') ? 400 : 0;
  },
});
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get(this: HTMLElement) {
    return (this.getAttribute('data-testid') ?? '').endsWith('-scroll') ? 1000 : 0;
  },
});

afterEach(() => {
  cleanup();
});
