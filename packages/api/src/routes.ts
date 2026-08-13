import type { AppRouteDefs } from './typings/app';
import { entryPointHandler } from './handlers/entryPoint';
import { queueJobsHandler } from './handlers/queueJobs';
import { queuesHandler } from './handlers/queues';

export const appRoutes: AppRouteDefs = {
  entryPoint: { method: 'get', route: '/', handler: entryPointHandler },
  api: [
    { method: 'get', route: '/api/queues', handler: queuesHandler },
    { method: 'get', route: '/api/queues/:queueName/jobs', handler: queueJobsHandler },
  ],
};
