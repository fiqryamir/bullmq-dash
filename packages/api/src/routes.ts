import type { AppRouteDefs } from './typings/app';
import { entryPointHandler } from './handlers/entryPoint';
import { jobFlowHandler, queueFlowHandler } from './handlers/flow';
import { jobHandler } from './handlers/job';
import { jobLogsHandler } from './handlers/jobLogs';
import {
  addJobSchedulerHandler,
  removeJobSchedulerHandler,
  updateJobSchedulerHandler,
} from './handlers/jobSchedulerActions';
import { jobSchedulersHandler } from './handlers/jobSchedulers';
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
import { redisStatsHandler } from './handlers/redisStats';
import { searchHandler } from './handlers/search';
import { metricsHandler } from './handlers/metrics';
import { queueWorkersHandler } from './handlers/workers';
import { promoteJobHandler, removeJobHandler, retryJobHandler } from './handlers/jobActions';

export const appRoutes: AppRouteDefs = {
  entryPoint: { method: 'get', route: '/', handler: entryPointHandler },
  api: [
    { method: 'get', route: '/api/queues', handler: queuesHandler },
    { method: 'get', route: '/api/search', handler: searchHandler },
    { method: 'get', route: '/api/job-schedulers', handler: jobSchedulersHandler },
    { method: 'get', route: '/api/redis/stats', handler: redisStatsHandler },
    // Registered before the `:jobId` routes so the literal `jobs`, `search`,
    // `flow`, `metrics`, `workers` and `job-schedulers` segments win over
    // being read as a job id.
    { method: 'get', route: '/api/queues/:queueName/jobs', handler: queueJobsHandler },
    { method: 'get', route: '/api/queues/:queueName/search', handler: searchHandler },
    { method: 'get', route: '/api/queues/:queueName/flow', handler: queueFlowHandler },
    { method: 'get', route: '/api/queues/:queueName/metrics', handler: metricsHandler },
    { method: 'get', route: '/api/queues/:queueName/workers', handler: queueWorkersHandler },
    {
      method: 'post',
      route: '/api/queues/:queueName/job-schedulers',
      handler: addJobSchedulerHandler,
    },
    {
      method: 'patch',
      route: '/api/queues/:queueName/job-schedulers/:schedulerId',
      handler: updateJobSchedulerHandler,
    },
    {
      method: 'put',
      route: '/api/queues/:queueName/job-schedulers/:schedulerId/remove',
      handler: removeJobSchedulerHandler,
    },
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
