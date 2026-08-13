import type { AppRouteDefs } from './typings/app';
import { entryPointHandler } from './handlers/entryPoint';
import { queuesHandler } from './handlers/queues';

export const appRoutes: AppRouteDefs = {
  entryPoint: { method: 'get', route: '/', handler: entryPointHandler },
  api: [{ method: 'get', route: '/api/queues', handler: queuesHandler }],
};
