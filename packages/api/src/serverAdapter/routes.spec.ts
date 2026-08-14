import { describe, expect, it } from 'vitest';
import { expandRouteDefs } from './routes';

describe('expandRouteDefs', () => {
  it('keeps single methods and routes as-is', () => {
    const handler = () => ({ body: {} });
    expect(expandRouteDefs([{ method: 'get', route: '/api/a', handler }])).toEqual([
      { method: 'get', route: '/api/a', handler },
    ]);
  });

  it('expands array methods and routes into every pair', () => {
    const handler = () => ({ body: {} });
    const expanded = expandRouteDefs([
      { method: ['get', 'put'], route: ['/api/a', '/api/b'], handler },
    ]);

    expect(expanded.map(({ method, route }) => ({ method, route }))).toEqual([
      { method: 'get', route: '/api/a' },
      { method: 'get', route: '/api/b' },
      { method: 'put', route: '/api/a' },
      { method: 'put', route: '/api/b' },
    ]);
    expect(expanded.every((entry) => entry.handler === handler)).toBe(true);
  });
});
