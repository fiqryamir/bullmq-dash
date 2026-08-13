import type { AppRouteDefs } from './typings/app';
import { queuesHandler } from './handlers/queues';

export const appRoutes: AppRouteDefs = {
  api: [{ method: 'get', route: '/api/queues', handler: queuesHandler }],
};
