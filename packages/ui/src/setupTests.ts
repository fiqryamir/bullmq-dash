import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom performs no layout, so every element reports zero offset sizes. The
// virtualized job table measures its scroll container through offsetWidth and
// offsetHeight; give that element a viewport so virtual rows render in tests.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement) {
    return this.getAttribute('data-testid') === 'jobs-scroll' ? 400 : 0;
  },
});
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get(this: HTMLElement) {
    return this.getAttribute('data-testid') === 'jobs-scroll' ? 1000 : 0;
  },
});

afterEach(() => {
  cleanup();
});
