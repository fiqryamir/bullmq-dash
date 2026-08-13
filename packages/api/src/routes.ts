import type { AppRouteDefs } from './typings/app';
import { entryPointHandler } from './handlers/entryPoint';
import { jobHandler } from './handlers/job';
import { jobLogsHandler } from './handlers/jobLogs';
import { queueJobsHandler } from './handlers/queueJobs';
import {
  cleanAllHandler,
  emptyQueueHandler,
  pauseQueueHandler,
  promoteAllHandler,
  removeAllHandler,
  resumeQueueHandler,
  retryAllHandler,
} from './handlers/queueActions';
import { queuesHandler } from './handlers/queues';
import { promoteJobHandler, removeJobHandler, retryJobHandler } from './handlers/jobActions';

export const appRoutes: AppRouteDefs = {
  entryPoint: { method: 'get', route: '/', handler: entryPointHandler },
  api: [
    { method: 'get', route: '/api/queues', handler: queuesHandler },
    // Registered before the `:jobId` routes so the literal `jobs` segment
    // wins over being read as a job id.
    { method: 'get', route: '/api/queues/:queueName/jobs', handler: queueJobsHandler },
    { method: 'get', route: '/api/queues/:queueName/:jobId/logs', handler: jobLogsHandler },
    { method: 'get', route: '/api/queues/:queueName/:jobId', handler: jobHandler },
    {
      method: 'put',
      route: '/api/queues/:queueName/retry/:queueStatus',
      handler: retryAllHandler,
    },
    { method: 'put', route: '/api/queues/:queueName/promote', handler: promoteAllHandler },
    {
      method: 'put',
      route: '/api/queues/:queueName/clean/:queueStatus',
      handler: cleanAllHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/remove/:queueStatus',
      handler: removeAllHandler,
    },
    { method: 'put', route: '/api/queues/:queueName/pause', handler: pauseQueueHandler },
    { method: 'put', route: '/api/queues/:queueName/resume', handler: resumeQueueHandler },
    { method: 'put', route: '/api/queues/:queueName/empty', handler: emptyQueueHandler },
    { method: 'put', route: '/api/queues/:queueName/:jobId/retry', handler: retryJobHandler },
    { method: 'put', route: '/api/queues/:queueName/:jobId/promote', handler: promoteJobHandler },
    { method: 'put', route: '/api/queues/:queueName/:jobId/remove', handler: removeJobHandler },
  ],
};
