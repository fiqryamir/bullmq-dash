import { parse } from 'redis-info';
import type { BaseAdapter } from '../queueAdapters/base';
import type { BullBoardRequest, ControllerHandlerReturnType, RedisStats } from '../typings/app';

async function getStats(queue: BaseAdapter): Promise<RedisStats | null> {
  const redisInfoRaw = await queue.getRedisInfo();

  // No `INFO` means the queue is not on Redis, which the dashboard cannot
  // report on in v1.
  if (redisInfoRaw === null) {
    return null;
  }

  const redisInfo = parse(redisInfoRaw);

  return {
    backend: 'redis',
    version: redisInfo.redis_version,
    mode: redisInfo.redis_mode,
    port: +redisInfo.tcp_port,
    os: redisInfo.os,
    uptime: +redisInfo.uptime_in_seconds,
    memory: {
      total: +redisInfo.maxmemory || +redisInfo.total_system_memory,
      used: +redisInfo.used_memory,
      fragmentationRatio: +redisInfo.mem_fragmentation_ratio,
      peak: +redisInfo.used_memory_peak,
    },
    clients: {
      connected: +redisInfo.connected_clients,
      blocked: +redisInfo.blocked_clients,
    },
  };
}

export async function redisStatsHandler({
  queues: bullBoardQueues,
  uiConfig,
}: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  if (uiConfig.hideRedisDetails) {
    return {
      status: 403,
      body: { error: 'Redis details are hidden' },
    };
  }

  const [firstQueue] = [...bullBoardQueues.values()];

  if (!firstQueue) {
    return { body: {} };
  }

  const body = await getStats(firstQueue);

  if (body === null) {
    return { status: 404, body: { error: 'Redis stats unavailable' } };
  }

  return {
    body,
  };
}
