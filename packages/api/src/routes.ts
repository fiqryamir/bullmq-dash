import type { AppRouteDefs } from './typings/app';
import { entryPointHandler } from './handlers/entryPoint';
import { jobFlowHandler, queueFlowHandler } from './handlers/flow';
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
import { searchHandler } from './handlers/search';
import { promoteJobHandler, removeJobHandler, retryJobHandler } from './handlers/jobActions';

export const appRoutes: AppRouteDefs = {
  entryPoint: { method: 'get', route: '/', handler: entryPointHandler },
  api: [
    { method: 'get', route: '/api/queues', handler: queuesHandler },
    { method: 'get', route: '/api/search', handler: searchHandler },
    // Registered before the `:jobId` routes so the literal `jobs`, `search`
    // and `flow` segments win over being read as a job id.
    { method: 'get', route: '/api/queues/:queueName/jobs', handler: queueJobsHandler },
    { method: 'get', route: '/api/queues/:queueName/search', handler: searchHandler },
    { method: 'get', route: '/api/queues/:queueName/flow', handler: queueFlowHandler },
    { method: 'get', route: '/api/queues/:queueName/:jobId/logs', handler: jobLogsHandler },
    { method: 'get', route: '/api/queues/:queueName/:jobId/flow', handler: jobFlowHandler },
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
    // bull-board registers per-job remove under `/clean` (`job.remove()`); the
    // alias is kept so the route table mirrors bull-board's exactly.
    { method: 'put', route: '/api/queues/:queueName/:jobId/clean', handler: removeJobHandler },
    { method: 'put', route: '/api/queues/:queueName/:jobId/remove', handler: removeJobHandler },
  ],
};
