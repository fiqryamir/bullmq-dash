export type Status =
  | 'latest'
  | 'active'
  | 'waiting'
  | 'waiting-children'
  | 'prioritized'
  | 'completed'
  | 'failed'
  | 'delayed'
  | 'paused';

export type QueueCounts = Record<Status, number>;

export interface AppQueue {
  name: string;
  displayName?: string;
  counts: QueueCounts;
  isPaused: boolean;
  readOnlyMode: boolean;
}

export interface QueuesResponse {
  queues: AppQueue[];
}

export async function fetchQueues(): Promise<QueuesResponse> {
  const response = await fetch('api/queues');
  if (!response.ok) {
    throw new Error(`Queues request failed with status ${response.status}`);
  }
  return (await response.json()) as QueuesResponse;
}
