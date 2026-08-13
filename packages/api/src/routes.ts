import type { AppRouteDefs } from './typings/app';
import { entryPointHandler } from './handlers/entryPoint';
import { jobHandler } from './handlers/job';
import { jobLogsHandler } from './handlers/jobLogs';
import { queueJobsHandler } from './handlers/queueJobs';
import { queuesHandler } from './handlers/queues';

export const appRoutes: AppRouteDefs = {
  entryPoint: { method: 'get', route: '/', handler: entryPointHandler },
  api: [
    { method: 'get', route: '/api/queues', handler: queuesHandler },
    // Registered before the `:jobId` routes so the literal `jobs` segment
    // wins over being read as a job id.
    { method: 'get', route: '/api/queues/:queueName/jobs', handler: queueJobsHandler },
    { method: 'get', route: '/api/queues/:queueName/:jobId/logs', handler: jobLogsHandler },
    { method: 'get', route: '/api/queues/:queueName/:jobId', handler: jobHandler },
  ],
};
